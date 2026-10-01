//! Talking to pokeshell (docs/SPEC.md section 2): find its CLI the way pokeshell does, run its JSON commands.
//! One-way: the arena reads pokeshell, pokeshell knows nothing about the arena.

use serde_json::Value;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct Pokeshell {
    /// pokeshell.ps1 (None: not installed)
    pub script: Option<PathBuf>,
    /// pokeshell's state dir (POKESHELL_HOME)
    pub home: PathBuf,
    pub timeout: Duration,
}

#[derive(Debug)]
pub enum CallError {
    /// no pokeshell on this machine
    Missing,
    /// the command isn't there (non-zero exit or not JSON): an older pokeshell
    Unsupported(String),
    /// the command ran and reported an error as JSON ({error, message})
    Failed(Value),
    /// ran too long
    Timeout,
    /// couldn't start powershell
    Spawn(String),
}

/// pokeshell's state dir: $POKESHELL_HOME, else %LOCALAPPDATA%\pokeshell
pub fn default_home() -> PathBuf {
    if let Ok(h) = std::env::var("POKESHELL_HOME") {
        if !h.is_empty() {
            return PathBuf::from(h);
        }
    }
    let base = std::env::var("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
    base.join("pokeshell")
}

/// find pokeshell.ps1: the explicit path, $POKEARENA_POKESHELL, <home>/current/module-base.txt, <home>/current/scripts,
/// then pokeshell.cmd on PATH (whose folder has pokeshell.ps1 next to it)
pub fn discover(explicit: Option<PathBuf>, home: &Path) -> Option<PathBuf> {
    let file = |p: PathBuf| if p.is_file() { Some(p) } else { None };
    if let Some(p) = explicit {
        return file(p);
    }
    if let Ok(p) = std::env::var("POKEARENA_POKESHELL") {
        if !p.is_empty() {
            return file(PathBuf::from(p));
        }
    }
    let cur = home.join("current");
    if let Ok(base) = std::fs::read_to_string(cur.join("module-base.txt")) {
        let base = base.trim().trim_start_matches('\u{feff}');
        if let Some(p) = file(Path::new(base).join("scripts").join("pokeshell.ps1")) {
            return Some(p);
        }
    }
    if let Some(p) = file(cur.join("scripts").join("pokeshell.ps1")) {
        return Some(p);
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            if dir.join("pokeshell.cmd").is_file() {
                if let Some(p) = file(dir.join("pokeshell.ps1")) {
                    return Some(p);
                }
            }
        }
    }
    None
}

impl Pokeshell {
    pub fn found(&self) -> bool {
        self.script.is_some()
    }

    /// run `pokeshell <args>` and parse its stdout as one JSON document
    pub fn call(&self, args: &[&str]) -> Result<Value, CallError> {
        let Some(script) = &self.script else { return Err(CallError::Missing) };
        let mut cmd = Command::new("powershell.exe");
        cmd.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(script)
            .args(args)
            .env("POKESHELL_HOME", &self.home)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashes
        }
        let mut child = cmd.spawn().map_err(|e| CallError::Spawn(e.to_string()))?;
        let mut out = child.stdout.take().unwrap();
        let mut err = child.stderr.take().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut o = Vec::new();
            let mut e = Vec::new();
            let _ = out.read_to_end(&mut o);
            let _ = err.read_to_end(&mut e);
            let _ = tx.send((o, e));
        });
        let (o, e) = match rx.recv_timeout(self.timeout) {
            Ok(v) => v,
            Err(_) => {
                let _ = child.kill(); // our own child, hung past the timeout
                return Err(CallError::Timeout);
            }
        };
        let status = child.wait().map_err(|e| CallError::Spawn(e.to_string()))?;
        let text = String::from_utf8_lossy(&o);
        let text = text.trim().trim_start_matches('\u{feff}');
        let parsed: Option<Value> = serde_json::from_str(text).ok().filter(|v: &Value| v.is_object());
        match (status.success(), parsed) {
            (true, Some(v)) if v.get("error").is_none() => Ok(v),
            // the command exists and answered with a JSON error (an unknown set, ...)
            (_, Some(v)) => Err(CallError::Failed(v)),
            _ => {
                let msg = String::from_utf8_lossy(&e);
                let first = msg.lines().chain(text.lines()).find(|l| !l.trim().is_empty()).unwrap_or("").trim();
                Err(CallError::Unsupported(first.chars().take(300).collect()))
            }
        }
    }
}
