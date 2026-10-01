//! arena-host: serves the built game (dist/) and its JSON API on 127.0.0.1 (docs/SPEC.md section 9).
//!
//!   arena-host [--port 47615] [--dist <dir>] [--state <dir>] [--pokeshell <pokeshell.ps1>] [--pokeshell-home <dir>]
//!              [--standalone] [--data <dir or .pak>] [--app] [--no-idle-exit] [--idle-secs 60] [--open]
//!
//! It exits by itself `--idle-secs` after the last page heartbeat (once one was seen), or on POST /api/shutdown.
//!
//! Two modes (docs/RELEASE.md):
//! - **pokeshell** (the default for a dev or terminal setup): pokeshell holds the wallet and the collection; the host
//!   runs its JSON commands.
//! - **standalone** (`--standalone` / `--data`, and always in the downloadable build, `--features bundle`): no
//!   pokeshell and no PowerShell. The host keeps its own wallet and pulls and opens real boosters itself
//!   (standalone.rs, booster.rs), from the bundled game data (assets.rs, embedded in the binary). A new state starts
//!   with 3 pack tokens.
//!
//! `--app` (the downloadable build's default): the double-click launcher. A running arena for this state is reused
//! (the browser opens on it); else the host starts in the background (`--serve`) and the browser opens on it.
#![cfg_attr(all(windows, feature = "bundle"), windows_subsystem = "windows")]

mod assets;
mod booster;
#[cfg(test)]
mod parity;
mod pokeshell;
mod standalone;
mod state;

use assets::Assets;
use pokeshell::{CallError, Pokeshell};
use serde_json::{Value, json};
use standalone::{OpenError, Standalone};
use state::Store;
use std::borrow::Cow;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Method, Request, Response, Server};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_PORT: u16 = 47615;
/// the downloadable arena's port: its own, so it and a dev host can run side by side
const APP_PORT: u16 = 47616;
/// the downloadable build: the standalone game data embedded in the binary (tools/release/bundle.mjs, build.rs)
const BUNDLED: bool = cfg!(feature = "bundle");

#[cfg(feature = "bundle")]
fn embedded_assets() -> Option<Assets> {
    static PAK: &[u8] = include_bytes!(env!("ARENA_DATA_PAK"));
    Some(Assets::from_pak(PAK).expect("the embedded game data is damaged"))
}
#[cfg(not(feature = "bundle"))]
fn embedded_assets() -> Option<Assets> {
    None
}

struct Args {
    port: Option<u16>,
    dist: Option<PathBuf>,
    state: Option<PathBuf>,
    pokeshell: Option<PathBuf>,
    pokeshell_home: Option<PathBuf>,
    idle_secs: Option<u64>,
    idle_exit: bool,
    open: bool,
    standalone: bool,
    data: Option<PathBuf>,
    app: bool,
    serve: bool,
}

fn parse_args() -> Args {
    let mut a = Args {
        port: None, dist: None, state: None, pokeshell: None, pokeshell_home: None, idle_secs: None, idle_exit: true, open: false,
        standalone: BUNDLED, data: None, app: BUNDLED, serve: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(x) = it.next() {
        match x.as_str() {
            "--port" => a.port = it.next().and_then(|v| v.parse().ok()),
            "--dist" => a.dist = it.next().map(PathBuf::from),
            "--state" => a.state = it.next().map(PathBuf::from),
            "--pokeshell" => a.pokeshell = it.next().map(PathBuf::from),
            "--pokeshell-home" => a.pokeshell_home = it.next().map(PathBuf::from),
            "--idle-secs" => a.idle_secs = it.next().and_then(|v| v.parse().ok()),
            "--no-idle-exit" => a.idle_exit = false,
            "--open" => a.open = true,
            "--standalone" => a.standalone = true,
            "--data" => {
                a.data = it.next().map(PathBuf::from);
                a.standalone = true;
            }
            "--app" => a.app = true,
            "--serve" => a.serve = true,
            "--version" => {
                println!("arena-host {VERSION}");
                std::process::exit(0);
            }
            "-h" | "--help" => {
                println!("arena-host [--port N] [--dist DIR] [--state DIR] [--pokeshell PS1] [--pokeshell-home DIR] [--standalone] [--data DIR|PAK] [--app] [--no-idle-exit] [--idle-secs N] [--open]");
                std::process::exit(0);
            }
            other => {
                eprintln!("arena-host: unknown argument {other}");
                std::process::exit(2);
            }
        }
    }
    a
}

/// the standalone arena's state: $POKEARENA_STANDALONE_HOME, else the per-user app data folder (Windows
/// %LOCALAPPDATA%\pokeshell-arena-standalone, macOS ~/Library/Application Support/pokeshell-arena, else
/// $XDG_DATA_HOME/pokeshell-arena or ~/.local/share/pokeshell-arena). Never next to the exe.
fn standalone_state() -> PathBuf {
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty()).map(PathBuf::from);
    if let Some(h) = env("POKEARENA_STANDALONE_HOME") {
        return h;
    }
    if cfg!(windows) {
        return env("LOCALAPPDATA").unwrap_or_else(|| PathBuf::from(".")).join("pokeshell-arena-standalone");
    }
    let home = env("HOME").unwrap_or_else(|| PathBuf::from("."));
    if cfg!(target_os = "macos") {
        return home.join("Library").join("Application Support").join("pokeshell-arena");
    }
    env("XDG_DATA_HOME").unwrap_or_else(|| home.join(".local").join("share")).join("pokeshell-arena")
}

/// the arena state dir: --state, $POKEARENA_HOME, %LOCALAPPDATA%\pokeshell-arena
fn default_state() -> PathBuf {
    if let Ok(h) = std::env::var("POKEARENA_HOME") {
        if !h.is_empty() {
            return PathBuf::from(h);
        }
    }
    std::env::var("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(".")).join("pokeshell-arena")
}

/// the built game: --dist, else dist/ next to the exe, above it (bin\ in a release), or the repo's (host/target/release)
fn default_dist() -> PathBuf {
    let mut c = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        let mut d = exe.parent().map(Path::to_path_buf);
        for _ in 0..5 {
            if let Some(p) = &d {
                c.push(p.join("dist"));
                d = p.parent().map(Path::to_path_buf);
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        c.push(cwd.join("dist"));
    }
    c.into_iter().find(|p| p.join("index.html").is_file()).unwrap_or_else(|| PathBuf::from("dist"))
}

/// where the game's files come from: a dist/ folder, or the standalone data's game/
enum Game {
    Dist(PathBuf),
    Data,
}

struct App {
    port: u16,
    game: Game,
    store: Store,
    shell: Pokeshell,
    /// standalone mode: the arena's own wallet, pulls and boosters (None: pokeshell's)
    solo: Option<Standalone>,
    /// serializes match results so a repeated matchId can't be granted twice (pokeshell locks its own ledger)
    wallet_lock: Mutex<()>,
    last_beat: AtomicU64,
    seen_beat: AtomicBool,
    shell_version: OnceLock<Option<Value>>,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

// ------------------------------------------------------------------ responses
type Resp = Response<std::io::Cursor<Vec<u8>>>;

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap()
}

fn json_resp(status: u16, v: &Value) -> Resp {
    Response::from_data(v.to_string().into_bytes())
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json; charset=utf-8"))
        .with_header(header("Cache-Control", "no-store"))
}

fn err(status: u16, code: &str, message: &str) -> Resp {
    json_resp(status, &json!({"error": code, "message": message}))
}

fn call_error(e: CallError, need: &str, shell: &Pokeshell) -> Resp {
    match e {
        CallError::Missing => json_resp(503, &json!({"error": "pokeshell_missing", "message": "pokeshell is not installed on this machine (Install-Module pokeshell; pokeshell install)", "need": need})),
        CallError::Unsupported(m) => json_resp(501, &json!({"error": "pokeshell_unsupported", "message": format!("this pokeshell doesn't have `{need}` yet: update pokeshell ({m})"), "need": need, "have": shell.script.as_ref().map(|p| p.display().to_string())})),
        CallError::Failed(v) => json_resp(502, &json!({"error": v.get("error").cloned().unwrap_or(json!("pokeshell_error")), "message": v.get("message").cloned().unwrap_or(json!("pokeshell reported an error")), "pokeshell": v})),
        CallError::Timeout => err(504, "pokeshell_timeout", &format!("`{need}` took too long")),
        CallError::Spawn(m) => err(500, "spawn_failed", &format!("couldn't run powershell: {m}")),
    }
}

fn content_type(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let h = std::str::from_utf8(b.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(h, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// a query parameter of a request URL, percent-decoded
fn query_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1.split('#').next()?;
    q.split('&').filter_map(|kv| kv.split_once('=')).find(|(k, _)| *k == key).and_then(|(_, v)| percent_decode(&v.replace('+', " ")))
}

/// a URL path under a root, refusing anything that could leave it (.., absolute parts, drive letters, backslashes)
pub fn safe_join(root: &Path, url_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode(url_path)?;
    if decoded.contains('\\') || decoded.contains('\0') || decoded.contains(':') {
        return None;
    }
    let rel = Path::new(decoded.trim_start_matches('/'));
    let mut out = root.to_path_buf();
    for c in rel.components() {
        match c {
            Component::Normal(p) => out.push(p),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

fn bytes_resp(name: &Path, data: Cow<'static, [u8]>) -> Resp {
    let cache = if name.extension().is_some_and(|e| e == "html") { "no-cache" } else { "public, max-age=300" };
    Response::from_data(data.into_owned()).with_header(header("Content-Type", content_type(name))).with_header(header("Cache-Control", cache))
}

fn file_resp(p: &Path) -> Option<Resp> {
    if !p.is_file() {
        return None;
    }
    let data = std::fs::read(p).ok()?;
    Some(bytes_resp(p, Cow::Owned(data)))
}

/// a file of the standalone data (game/..., cards/img/...)
fn asset_resp(solo: &Standalone, rel: &str) -> Option<Resp> {
    let data = solo.assets.get(rel)?;
    Some(bytes_resp(Path::new(rel), data))
}

// ------------------------------------------------------------------ request checks
fn header_val<'a>(req: &'a Request, name: &'static str) -> Option<&'a str> {
    req.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str())
}

/// only our own origin: blocks DNS rebinding (Host) and cross-site POSTs (Origin, Content-Type)
fn check_request(app: &App, req: &Request) -> Result<(), Resp> {
    let host = header_val(req, "Host").unwrap_or("");
    let ok_hosts = [format!("127.0.0.1:{}", app.port), format!("localhost:{}", app.port)];
    if !ok_hosts.iter().any(|h| h == host) {
        return Err(err(403, "bad_host", "requests must come from the arena page on 127.0.0.1"));
    }
    let writes = matches!(req.method(), Method::Post | Method::Put | Method::Delete);
    if writes {
        if let Some(origin) = header_val(req, "Origin") {
            let ok = [format!("http://127.0.0.1:{}", app.port), format!("http://localhost:{}", app.port)];
            if !ok.iter().any(|o| o == origin) {
                return Err(err(403, "bad_origin", "cross-origin requests are refused"));
            }
        }
        let ct = header_val(req, "Content-Type").unwrap_or("");
        if !ct.to_ascii_lowercase().starts_with("application/json") {
            return Err(err(415, "json_only", "send Content-Type: application/json"));
        }
    }
    Ok(())
}

fn read_json(req: &mut Request) -> Result<Value, Resp> {
    let mut body = String::new();
    req.as_reader().take(1 << 20).read_to_string(&mut body).map_err(|_| err(400, "bad_body", "unreadable body"))?;
    if body.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&body).map_err(|e| err(400, "bad_json", &e.to_string()))
}

// ------------------------------------------------------------------ routes
fn health(app: &App) -> Resp {
    let v = app.shell_version.get().cloned().flatten();
    let mut h = json!({
        "ok": true, "version": VERSION, "api": 1, "state": app.store.dir.display().to_string(),
        "mode": if app.solo.is_some() { "standalone" } else { "pokeshell" }, "bundled": BUNDLED,
        "pokeshell": {
            "found": app.shell.found(),
            "script": app.shell.script.as_ref().map(|p| p.display().to_string()),
            "home": app.shell.home.display().to_string(),
            "version": v.as_ref().and_then(|x| x.get("version")).cloned(),
            "api": v.as_ref().and_then(|x| x.get("api")).cloned(),
        }
    });
    if let Some(solo) = &app.solo {
        h["starter"] = solo.starter_json();
    }
    json_resp(200, &h)
}

/// the wallet is pokeshell's: `pokeshell pack tokens --json` -> {tokens: balance, recent}
fn wallet(app: &App) -> Resp {
    let progress = json!({"points": app.store.progress_points(), "perPack": state::POINTS_PER_PACK});
    if let Some(solo) = &app.solo {
        let t = solo.tokens_json();
        return json_resp(200, &json!({"tokens": t["balance"], "recent": t["recent"], "progress": progress, "starter": solo.starter_json()}));
    }
    match app.shell.call(&["pack", "tokens", "--json"]) {
        Ok(v) => json_resp(200, &json!({"tokens": v.get("balance").cloned().unwrap_or(json!(0)), "recent": v.get("recent").cloned().unwrap_or(json!([])), "progress": progress})),
        Err(e) => call_error(e, "pokeshell pack tokens --json", &app.shell),
    }
}

/// a failed pokeshell call as (code, message), for a match result that is still recorded
fn call_error_brief(e: &CallError) -> (&'static str, String) {
    match e {
        CallError::Missing => ("pokeshell_missing", "pokeshell is not installed: wins earn no pack tokens".into()),
        CallError::Unsupported(m) => ("pokeshell_unsupported", format!("update pokeshell for pack tokens (needs pokeshell pack grant <n> --json): {m}")),
        CallError::Failed(v) => ("pokeshell_error", v.get("message").or_else(|| v.get("error")).and_then(|x| x.as_str()).unwrap_or("pokeshell reported an error").to_string()),
        CallError::Timeout => ("pokeshell_timeout", "pokeshell pack grant took too long".into()),
        CallError::Spawn(m) => ("spawn_failed", format!("couldn't run powershell: {m}")),
    }
}

/// a match's outcome from its report: (won, forfeit). A forfeit (the player quit the match) is always a loss, whatever
/// `won` says, so it never earns pack tokens. None: `won` is missing.
fn match_outcome(body: &Value) -> Option<(bool, bool)> {
    let won = body.get("won").and_then(|v| v.as_bool())?;
    let forfeit = body.get("forfeit").and_then(|v| v.as_bool()) == Some(true);
    Some((won && !forfeit, forfeit))
}

fn match_result(app: &App, body: &Value) -> Resp {
    let s = |k: &str| body.get(k).and_then(|v| v.as_str()).unwrap_or("");
    let id = s("matchId");
    if !state::valid_match_id(id) {
        return err(400, "bad_match", "matchId: 1-64 letters, digits, - _ .");
    }
    let mode = s("mode");
    if mode != "1v1" && mode != "team" {
        return err(400, "bad_match", "mode: \"1v1\" or \"team\"");
    }
    let diff = s("difficulty");
    if !["easy", "normal", "hard", "expert"].contains(&diff) {
        return err(400, "bad_match", "difficulty: easy, normal, hard or expert");
    }
    let Some((won, forfeit)) = match_outcome(body) else { return err(400, "bad_match", "won: true or false") };
    let _g = app.wallet_lock.lock().unwrap();
    let balance = || match &app.solo {
        Some(solo) => json!(solo.balance()),
        None => app.shell.call(&["pack", "tokens", "--json"]).ok().and_then(|v| v.get("balance").cloned()).unwrap_or(Value::Null),
    };
    let progress = |points: i64| json!({"points": points, "perPack": state::POINTS_PER_PACK});
    if app.store.match_seen(id) {
        return json_resp(200, &json!({"granted": 0, "tokens": balance(), "duplicate": true, "points": 0, "progress": progress(app.store.progress_points())}));
    }
    // A win earns tokens toward the next pack (state::points_for; the game calls them tokens), POINTS_PER_PACK to a
    // pack: each time the progress reaches it, one pack token is granted in the wallet (pokeshell's, or the standalone
    // arena's own) and the rest carries over. The progress is matches.jsonl's (every result's points minus its packs),
    // so a matchId counts once.
    let points = state::points_for(mode, diff, won);
    let before = app.store.progress_points();
    let want = (before + points) / state::POINTS_PER_PACK;
    let mut granted = 0;
    let mut tokens = Value::Null;
    let mut error: Option<(&'static str, String)> = None;
    if want > 0 {
        let n = want.to_string();
        let reason = format!("arena win {id}");
        let res = match &app.solo {
            Some(solo) => solo.grant(want, &reason).map_err(|e| CallError::Failed(json!({"error": "write_failed", "message": e.to_string()}))),
            None => app.shell.call(&["pack", "grant", &n, "--reason", &reason, "--json"]),
        };
        match res {
            Ok(v) => {
                granted = v.get("granted").and_then(|x| x.as_i64()).unwrap_or(want);
                tokens = v.get("balance").cloned().unwrap_or(Value::Null);
            }
            Err(e) => error = Some(call_error_brief(&e)),
        }
    } else {
        tokens = balance();
    }
    let mut rec = json!({
        "matchId": id, "time": state::now_local(), "mode": mode, "difficulty": diff, "won": won,
        "prizes": body.get("prizes").cloned().unwrap_or(json!(0)), "ticks": body.get("ticks").cloned().unwrap_or(json!(0)),
        "seed": body.get("seed").cloned().unwrap_or(json!(0)), "arena": body.get("arena").cloned().unwrap_or(json!(null)),
        "team": body.get("team").cloned().unwrap_or(json!([])), "opponent": body.get("opponent").cloned().unwrap_or(json!([])),
        "points": points, "granted": granted,
    });
    if forfeit {
        rec["forfeit"] = json!(true);
    }
    if let Some((code, msg)) = &error {
        rec["grantError"] = json!(code);
        rec["grantMessage"] = json!(msg);
    }
    if let Err(e) = app.store.record_match(&rec) {
        return err(500, "write_failed", &e.to_string());
    }
    // an ungranted pack stays in the progress (points over POINTS_PER_PACK): the next win grants it
    let after = before + points - granted * state::POINTS_PER_PACK;
    match error {
        Some((code, msg)) => json_resp(200, &json!({"granted": 0, "tokens": null, "points": points, "progress": progress(after), "error": code, "message": msg})),
        None => json_resp(200, &json!({"granted": granted, "tokens": tokens, "points": points, "progress": progress(after)})),
    }
}

/// what `/api/pack/open` asks pokeshell for: `{"random": true}` or `{"set": "random"}` opens a pack of a random set
/// (`pack open random`: pokeshell rolls the set by pack price, then the pack; what spending a token does in the game),
/// `{"set": "<id>"}` a pack of that set (kept for tests and tools). None: a bad set id.
fn pack_open_args(body: &Value) -> Option<(Vec<String>, &'static str)> {
    let random = body.get("random").and_then(|v| v.as_bool()) == Some(true);
    let set = body.get("set").and_then(|v| v.as_str()).unwrap_or("");
    if random || set == "random" {
        return Some((vec!["pack".into(), "open".into(), "random".into(), "--json".into(), "--export".into()], "pokeshell pack open random --json"));
    }
    if !state::valid_set_id(set) {
        return None;
    }
    Some((vec!["pack".into(), "open".into(), set.into(), "--json".into(), "--export".into()], "pokeshell pack open <set> --json"))
}

/// a pack opened by the arena itself (standalone): the same answers as pokeshell's
fn solo_pack_open(solo: &Standalone, args: &[String]) -> Resp {
    let set = if args[2] == "random" { None } else { Some(args[2].as_str()) };
    match solo.open(set, false, &mut booster::SecureDice) {
        Ok(mut v) => {
            v["imageBase"] = json!("/pokeshell/");
            json_resp(200, &v)
        }
        Err(OpenError::NoTokens(n)) => json_resp(402, &json!({"error": "no_tokens", "message": format!("no pack tokens (balance {n}): win a battle to earn a pack"), "tokens": n})),
        Err(OpenError::NoSets) => json_resp(409, &json!({"error": "no_sets", "message": "no set can be opened at random", "tokens": solo.balance()})),
        Err(OpenError::BadSet(m)) => err(400, "bad_set", &m),
        Err(OpenError::Io(m)) => err(500, "write_failed", &m),
    }
}

fn pack_open(app: &App, body: &Value) -> Resp {
    let Some((args, need)) = pack_open_args(body) else {
        return err(400, "bad_set", "set: a set id like \"swsh7\", or \"random\" (or random: true)");
    };
    if let Some(solo) = &app.solo {
        return solo_pack_open(solo, &args);
    }
    let args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    // pokeshell spends the token (under its own ledger lock) and records the pulls
    match app.shell.call(&args) {
        Ok(mut v) => {
            if let Some(o) = v.as_object_mut() {
                // `image` is relative to pokeshell's web export (imageRoot = <state>\web), served at /pokeshell/img/**
                o.insert("imageBase".into(), json!("/pokeshell/"));
            }
            json_resp(200, &v)
        }
        Err(CallError::Failed(v)) if v.get("code").and_then(|c| c.as_str()) == Some("no-tokens") => json_resp(402, &json!({
            "error": "no_tokens",
            "message": v.get("message").cloned().unwrap_or(json!("no pack tokens: win a battle to earn a pack")),
            "tokens": v.get("tokens").cloned().unwrap_or(json!(0)),
        })),
        // a random open with no set to roll (none openable and priced): nothing was spent
        Err(CallError::Failed(v)) if v.get("code").and_then(|c| c.as_str()) == Some("no-sets") => json_resp(409, &json!({
            "error": "no_sets",
            "message": v.get("message").cloned().unwrap_or(json!("pokeshell has no set to open a random pack from")),
            "tokens": v.get("tokens").cloned().unwrap_or(Value::Null),
        })),
        Err(e) => call_error(e, need, &app.shell),
    }
}

fn passthrough(app: &App, args: &[&str], need: &str) -> Resp {
    match app.shell.call(args) {
        Ok(v) => json_resp(200, &v),
        Err(e) => call_error(e, need, &app.shell),
    }
}

/// a pokeshell listing, or the standalone arena's own
fn listing(app: &App, args: &[&str], need: &str, solo: impl Fn(&Standalone) -> Value) -> Resp {
    match &app.solo {
        Some(s) => json_resp(200, &solo(s)),
        None => passthrough(app, args, need),
    }
}

fn exit_soon(code: i32, state_dir: PathBuf) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        let _ = std::fs::remove_file(state_dir.join("host.json"));
        std::process::exit(code);
    });
}

fn handle(app: &App, mut req: Request) {
    let url = req.url().to_string();
    let path = url.split(['?', '#']).next().unwrap_or("/").to_string();
    if let Err(r) = check_request(app, &req) {
        let _ = req.respond(r);
        return;
    }
    let method = req.method().clone();
    let resp = match (&method, path.as_str()) {
        (Method::Get, "/api/health") => health(app),
        (Method::Get, "/api/wallet") => wallet(app),
        (Method::Get, "/api/collection") => listing(app, &["collection", "--json"], "pokeshell collection --json", |s| s.collection_json()),
        (Method::Get, "/api/sets") => listing(app, &["pack", "sets", "--json"], "pokeshell pack sets --json", |s| booster::sets_listing(&s.model, s.balance())),
        // ?set=<id>: that set's slots (pack odds <set>), else the random pack's set table
        (Method::Get, "/api/pack/odds") => match query_param(&url, "set").filter(|s| s != "random") {
            None => listing(app, &["pack", "odds", "random", "--json"], "pokeshell pack odds random --json", |s| booster::odds_random(&s.model)),
            Some(set) if !state::valid_set_id(&set) => err(400, "bad_set", "set: a set id like \"swsh7\""),
            Some(set) => match &app.solo {
                Some(solo) => match solo.model.find_set(&set) {
                    Ok(i) => json_resp(200, &booster::odds_set(&solo.model, i)),
                    Err(m) => err(404, "no_set", &m),
                },
                None => passthrough(app, &["pack", "odds", &set, "--json"], "pokeshell pack odds <set> --json"),
            },
        },
        (Method::Get, "/api/teams") => json_resp(200, &app.store.teams()),
        (Method::Put, "/api/teams") => match read_json(&mut req) {
            Ok(v) => {
                let e = state::validate_teams(&v);
                if !e.is_empty() {
                    json_resp(400, &json!({"error": "bad_teams", "message": e.join("; "), "problems": e}))
                } else if let Err(x) = app.store.save_teams(&v) {
                    err(500, "write_failed", &x.to_string())
                } else {
                    json_resp(200, &v)
                }
            }
            Err(r) => r,
        },
        (Method::Post, "/api/match/result") => match read_json(&mut req) {
            Ok(v) => match_result(app, &v),
            Err(r) => r,
        },
        (Method::Post, "/api/pack/open") => match read_json(&mut req) {
            Ok(v) => pack_open(app, &v),
            Err(r) => r,
        },
        (Method::Post, "/api/heartbeat") => {
            app.last_beat.store(now_secs(), Ordering::SeqCst);
            app.seen_beat.store(true, Ordering::SeqCst);
            json_resp(200, &json!({"ok": true}))
        }
        (Method::Post, "/api/shutdown") => {
            exit_soon(0, app.store.dir.clone());
            json_resp(200, &json!({"ok": true, "bye": true}))
        }
        (_, p) if p.starts_with("/api/") => err(404, "no_route", &format!("{method} {p}")),
        (Method::Get | Method::Head, p) if p.starts_with("/pokeshell/img/") => {
            let rel = &p["/pokeshell/img/".len()..];
            let found = match &app.solo {
                Some(solo) => percent_decode(rel).and_then(|r| asset_resp(solo, &format!("cards/img/{r}"))),
                None => safe_join(&app.shell.home.join("web").join("img"), rel).and_then(|f| file_resp(&f)),
            };
            found.unwrap_or_else(|| err(404, "not_found", p))
        }
        (Method::Get | Method::Head, p) => {
            let p = if p == "/" || p.is_empty() { "/index.html" } else { p };
            match &app.game {
                Game::Dist(dist) => match safe_join(dist, p) {
                    Some(f) => file_resp(&f).unwrap_or_else(|| {
                        if p == "/index.html" { err(404, "no_game", &format!("the game isn't built: no {} (npm run build)", dist.join("index.html").display())) } else { err(404, "not_found", p) }
                    }),
                    None => err(400, "bad_path", p),
                },
                Game::Data => match (percent_decode(p), &app.solo) {
                    (Some(rel), Some(solo)) if assets::clean_rel(&rel).is_some() => asset_resp(solo, &format!("game/{rel}")).unwrap_or_else(|| err(404, "not_found", p)),
                    _ => err(400, "bad_path", p),
                },
            }
        }
        _ => err(405, "method", &format!("{method} {path}")),
    };
    let _ = req.respond(resp);
}

// ------------------------------------------------------------------ the launcher (--app)
/// open a URL in the default browser (POKEARENA_NO_OPEN=1: don't, for tests)
fn open_browser(url: &str) {
    if std::env::var("POKEARENA_NO_OPEN").is_ok_and(|v| v == "1") {
        return;
    }
    let mut c = if cfg!(windows) {
        let mut c = std::process::Command::new("rundll32.exe");
        c.args(["url.dll,FileProtocolHandler", url]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    } else {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };
    let _ = c.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn();
}

/// GET a path of a host on 127.0.0.1 (the launcher's health check: no HTTP client crate for one request)
fn http_get(port: u16, path: &str) -> Option<String> {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut s = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(800)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    s.set_write_timeout(Some(Duration::from_secs(3))).ok()?;
    write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n").ok()?;
    let mut out = String::new();
    s.read_to_string(&mut out).ok()?;
    let (head, body) = out.split_once("\r\n\r\n")?;
    head.starts_with("HTTP/1.1 200").then(|| body.to_string())
}

/// the arena already serving this state: its URL (host.json's port answers /api/health for the same state)
fn running_url(state_dir: &Path) -> Option<String> {
    let hj: Value = serde_json::from_str(&std::fs::read_to_string(state_dir.join("host.json")).ok()?).ok()?;
    let port = hj.get("port")?.as_u64()? as u16;
    let h: Value = serde_json::from_str(&http_get(port, "/api/health")?).ok()?;
    let same = h.get("state").and_then(|s| s.as_str()).is_some_and(|s| Path::new(s) == state_dir);
    (h.get("ok") == Some(&json!(true)) && same).then(|| format!("http://127.0.0.1:{port}/"))
}

/// the double-click launcher: reuse the running arena, else start the host in the background, then open the browser
fn launch(state_dir: &Path) -> ! {
    let log = |m: &str| {
        eprintln!("pokeshell-arena: {m}");
        let _ = std::fs::OpenOptions::new().create(true).append(true).open(state_dir.join("launcher.log")).and_then(|mut f| writeln!(f, "{} {m}", state::now_local()));
    };
    if let Some(url) = running_url(state_dir) {
        println!("pokeshell-arena: already running at {url}");
        open_browser(&url);
        std::process::exit(0);
    }
    let exe = std::env::current_exe().unwrap_or_else(|e| {
        log(&format!("can't find my own exe: {e}"));
        std::process::exit(1)
    });
    let mut args: Vec<String> = std::env::args().skip(1).filter(|x| x != "--app").collect();
    args.push("--serve".into());
    if !args.iter().any(|x| x == "--state") {
        args.push("--state".into());
        args.push(state_dir.display().to_string());
    }
    let out = std::fs::OpenOptions::new().create(true).append(true).open(state_dir.join("host.log"));
    let mut cmd = std::process::Command::new(&exe);
    cmd.args(&args).stdin(std::process::Stdio::null());
    match out.and_then(|f| Ok((f.try_clone()?, f))) {
        Ok((o, e)) => {
            cmd.stdout(o).stderr(e);
        }
        Err(_) => {
            cmd.stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0000_0008 | 0x0000_0200); // DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP: outlives the launcher
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0); // its own group: closing the launcher (or the .app finishing) leaves it running
    }
    if let Err(e) = cmd.spawn() {
        log(&format!("couldn't start the arena host: {e}"));
        std::process::exit(1);
    }
    for _ in 0..150 {
        std::thread::sleep(Duration::from_millis(100));
        if let Some(url) = running_url(state_dir) {
            println!("pokeshell-arena: {url}");
            open_browser(&url);
            std::process::exit(0);
        }
    }
    log(&format!("the arena host didn't start in 15 s (see {})", state_dir.join("host.log").display()));
    std::process::exit(1);
}

/// one standalone host per state: an exclusive lock on <state>/host.lock, held for the process's life
fn lock_state(state_dir: &Path) -> Option<std::fs::File> {
    let f = std::fs::OpenOptions::new().create(true).truncate(false).read(true).write(true).open(state_dir.join("host.lock")).ok()?;
    f.try_lock().ok()?;
    Some(f)
}

fn main() {
    let a = parse_args();
    let solo_mode = a.standalone;
    let state_dir = a.state.clone().unwrap_or_else(|| if solo_mode { standalone_state() } else { default_state() });
    if let Err(e) = std::fs::create_dir_all(&state_dir) {
        eprintln!("arena-host: can't create {}: {e}", state_dir.display());
        std::process::exit(1);
    }
    if a.app && !a.serve {
        launch(&state_dir);
    }

    // standalone: the game data (--data, else the embedded pak) and the arena's own wallet; never pokeshell
    let mut lock = None;
    let solo = if solo_mode {
        lock = lock_state(&state_dir);
        if lock.is_none() {
            eprintln!("arena-host: another arena is already serving {}", state_dir.display());
            std::process::exit(3);
        }
        let assets = match a.data.as_deref().map(Assets::open).or_else(|| embedded_assets().map(Ok)) {
            Some(Ok(x)) => x,
            Some(Err(e)) => {
                eprintln!("arena-host: the game data: {e}");
                std::process::exit(1);
            }
            None => {
                eprintln!("arena-host: --standalone needs the game data: --data <release/bundle or arena-data.pak> (npm run release:data)");
                std::process::exit(2);
            }
        };
        let s = Standalone::new(state_dir.clone(), assets).unwrap_or_else(|e| {
            eprintln!("arena-host: the game data: {e}");
            std::process::exit(1);
        });
        match s.ensure_starter() {
            Ok(Some(n)) => println!("arena-host: welcome: {n} starter packs granted"),
            Ok(None) => {}
            Err(e) => eprintln!("arena-host: couldn't grant the starter packs: {e}"),
        }
        Some(s)
    } else {
        None
    };
    let shell = if solo.is_some() {
        Pokeshell { script: None, home: PathBuf::new(), timeout: Duration::from_secs(60) }
    } else {
        let home = a.pokeshell_home.clone().unwrap_or_else(pokeshell::default_home);
        let script = pokeshell::discover(a.pokeshell.clone(), &home);
        Pokeshell { script, home, timeout: Duration::from_secs(60) }
    };
    // the game: --dist, else the standalone data's own, else dist/ near the exe
    let game = match (&a.dist, &solo) {
        (Some(d), _) => Game::Dist(d.clone()),
        (None, Some(s)) if s.assets.exists("game/index.html") => Game::Data,
        _ => Game::Dist(default_dist()),
    };

    let want = a.port.unwrap_or(if a.app { APP_PORT } else { DEFAULT_PORT });
    // the app tries a few fixed ports before any free one: the page's origin (and its localStorage: volume, the
    // loadout's choices) stays the same from one launch to the next. Windows reserves blocks of ports, so one can fail
    let fallbacks: &[u16] = if a.app && a.port.is_none() { &[51616, 53616, 55616, 57616, 59616] } else { &[] };
    let server = Server::http(("127.0.0.1", want))
        .or_else(|e| fallbacks.iter().find_map(|&p| Server::http(("127.0.0.1", p)).ok()).ok_or(e))
        .or_else(|e| if a.port.is_none() { Server::http(("127.0.0.1", 0)) } else { Err(e) })
        .unwrap_or_else(|e| {
            eprintln!("arena-host: can't listen on 127.0.0.1:{want}: {e}");
            std::process::exit(1);
        });
    let port = server.server_addr().to_ip().map(|x| x.port()).unwrap_or(want);
    let app = Arc::new(App {
        port,
        game,
        store: Store { dir: state_dir.clone() },
        shell,
        solo,
        wallet_lock: Mutex::new(()),
        last_beat: AtomicU64::new(now_secs()),
        seen_beat: AtomicBool::new(false),
        shell_version: OnceLock::new(),
    });
    let _ = state::write_atomic(&state_dir.join("host.json"), &json!({"port": port, "pid": std::process::id(), "started": state::now_local(), "version": VERSION, "mode": if app.solo.is_some() { "standalone" } else { "pokeshell" }}).to_string());

    // probe `pokeshell version --json` once, in the background (optional: older pokeshells don't have it)
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let v = if app.shell.found() { app.shell.call(&["version", "--json"]).ok() } else { None };
            let _ = app.shell_version.set(v);
        });
    }
    // idle exit: no heartbeat for idle_secs, once the page has sent one. The app waits longer (120 s): a browser
    // throttles a background tab's timers to about one a minute, and a relaunch starts it again anyway.
    if a.idle_exit {
        let app = app.clone();
        let idle = a.idle_secs.unwrap_or(if a.app { 120 } else { 60 }).max(5);
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(1));
            if app.seen_beat.load(Ordering::SeqCst) && now_secs().saturating_sub(app.last_beat.load(Ordering::SeqCst)) > idle {
                println!("arena-host: no page for {idle} s, exiting");
                let _ = std::fs::remove_file(app.store.dir.join("host.json"));
                std::process::exit(0);
            }
        });
    }
    let url = format!("http://127.0.0.1:{port}/");
    println!("arena-host listening {url}");
    match (&app.game, &app.solo) {
        (Game::Dist(d), _) => println!("  game   {}", d.display()),
        (Game::Data, Some(s)) => println!("  game   {}", s.assets.describe()),
        _ => {}
    }
    println!("  state  {}", app.store.dir.display());
    match (&app.solo, &app.shell.script) {
        (Some(s), _) => println!("  standalone: {} served cards, {} pack tokens ({})", s.model.cards.len(), s.balance(), s.assets.describe()),
        (None, Some(p)) => println!("  pokeshell {} (home {})", p.display(), app.shell.home.display()),
        (None, None) => println!("  pokeshell not found (practice mode)"),
    }
    if a.open {
        open_browser(&url);
    }
    let _lock = lock; // held until the process exits
    for req in server.incoming_requests() {
        let app = app.clone();
        std::thread::spawn(move || handle(&app, req));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_paths() {
        let root = Path::new("C:/game/dist");
        assert_eq!(safe_join(root, "/index.html"), Some(root.join("index.html")));
        assert_eq!(safe_join(root, "/arenas/lapras-lagoon/bg.png"), Some(root.join("arenas").join("lapras-lagoon").join("bg.png")));
        assert_eq!(safe_join(root, "/../secret"), None);
        assert_eq!(safe_join(root, "/%2e%2e/secret"), None);
        assert_eq!(safe_join(root, "/a/..%5c..%5cx"), None);
        assert_eq!(safe_join(root, "/C:/Windows/win.ini"), None);
        assert_eq!(safe_join(root, "/%zz"), None);
    }

    #[test]
    fn forfeit_is_a_loss() {
        assert_eq!(match_outcome(&json!({"won": true})), Some((true, false)));
        assert_eq!(match_outcome(&json!({"won": false, "forfeit": true})), Some((false, true)));
        // a forfeit can't be reported as a win: it is a loss and earns nothing
        let (won, forfeit) = match_outcome(&json!({"won": true, "forfeit": true})).unwrap();
        assert!(!won && forfeit);
        assert_eq!(state::points_for("team", "expert", won), 0);
        assert_eq!(match_outcome(&json!({"forfeit": true})), None);
    }

    #[test]
    fn pack_open_forms() {
        let (a, need) = pack_open_args(&json!({"random": true})).unwrap();
        assert_eq!(a, ["pack", "open", "random", "--json", "--export"]);
        assert_eq!(need, "pokeshell pack open random --json");
        assert_eq!(pack_open_args(&json!({"set": "random"})).unwrap().0[2], "random");
        let (a, need) = pack_open_args(&json!({"set": "swsh7"})).unwrap();
        assert_eq!(a, ["pack", "open", "swsh7", "--json", "--export"]);
        assert_eq!(need, "pokeshell pack open <set> --json");
        assert!(pack_open_args(&json!({"set": "..\\x"})).is_none());
        assert!(pack_open_args(&json!({})).is_none());
        assert!(pack_open_args(&json!({"random": false, "set": ""})).is_none());
    }

    #[test]
    fn queries() {
        assert_eq!(query_param("/api/pack/odds?set=swsh7", "set").as_deref(), Some("swsh7"));
        assert_eq!(query_param("/api/pack/odds?x=1&set=base%31", "set").as_deref(), Some("base1"));
        assert_eq!(query_param("/api/pack/odds", "set"), None);
        assert_eq!(query_param("/api/pack/odds?sets=1", "set"), None);
    }

    /// a standalone host's App on a temp state (the tiny pack of standalone::tests)
    fn solo_app(name: &str) -> (PathBuf, App) {
        let (root, solo) = standalone::tests::fixture(name);
        let app = App {
            port: 0, game: Game::Data, store: Store { dir: solo.dir.clone() },
            shell: Pokeshell { script: None, home: PathBuf::new(), timeout: Duration::from_secs(1) }, solo: Some(solo),
            wallet_lock: Mutex::new(()), last_beat: AtomicU64::new(0), seen_beat: AtomicBool::new(false), shell_version: OnceLock::new(),
        };
        (root, app)
    }

    fn report(app: &App, id: &str, mode: &str, diff: &str, won: bool) -> Value {
        let r = match_result(app, &json!({"matchId": id, "mode": mode, "difficulty": diff, "won": won}));
        assert_eq!(r.status_code().0, 200);
        let mut body = String::new();
        r.into_reader().read_to_string(&mut body).unwrap();
        serde_json::from_str(&body).unwrap()
    }

    #[test]
    fn ten_tokens_make_a_pack_and_the_rest_carries_over() {
        let (root, app) = solo_app("progress");
        let solo = app.solo.as_ref().unwrap();
        assert_eq!(solo.balance(), 0, "the fixture's state has no starter grant (main() grants it)");
        // team expert wins: 4 tokens each
        let a = report(&app, "m-1", "team", "expert", true);
        assert_eq!((a["points"].as_i64(), a["granted"].as_i64(), a["progress"]["points"].as_i64()), (Some(4), Some(0), Some(4)));
        let b = report(&app, "m-2", "team", "expert", true);
        assert_eq!((b["granted"].as_i64(), b["progress"]["points"].as_i64()), (Some(0), Some(8)));
        // crossing 10: exactly one pack, 2 carried over
        let c = report(&app, "m-3", "team", "expert", true);
        assert_eq!((c["granted"].as_i64(), c["tokens"].as_i64(), c["progress"]["points"].as_i64()), (Some(1), Some(1), Some(2)));
        assert_eq!(c["progress"]["perPack"], 10);
        assert_eq!(solo.balance(), 1);
        // replaying a matchId adds nothing, however often
        for _ in 0..3 {
            let d = report(&app, "m-3", "team", "expert", true);
            assert_eq!((d["duplicate"].as_bool(), d["granted"].as_i64(), d["progress"]["points"].as_i64()), (Some(true), Some(0), Some(2)));
        }
        assert_eq!(solo.balance(), 1);
        // a loss and a forfeit earn nothing
        assert_eq!(report(&app, "m-4", "1v1", "expert", false)["points"], 0);
        let f = match_result(&app, &json!({"matchId": "m-5", "mode": "team", "difficulty": "expert", "won": true, "forfeit": true}));
        assert_eq!(f.status_code().0, 200);
        assert_eq!(app.store.progress_points(), 2);
        // 1v1 normal: 1 token; eight of them reach 10 again: one more pack, nothing left over
        for i in 0..8 {
            let r = report(&app, &format!("q-{i}"), "1v1", "normal", true);
            assert_eq!(r["granted"].as_i64(), Some(if i == 7 { 1 } else { 0 }), "win {i}");
        }
        assert_eq!(app.store.progress_points(), 0);
        assert_eq!(solo.balance(), 2);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn types() {
        assert_eq!(content_type(Path::new("a.PNG")), "image/png");
        assert_eq!(content_type(Path::new("x.js")), "text/javascript; charset=utf-8");
    }
}
