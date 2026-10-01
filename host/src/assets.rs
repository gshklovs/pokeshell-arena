//! The standalone game data (docs/RELEASE.md): a folder (`release/bundle`, `--data <dir>`) or the same tree in one
//! pak file (`release/arena-data.pak`), embedded into the binary by `--features bundle` or read with `--data <file>`.
//!
//!   game/**                      the built frontend (dist/)
//!   cards/img/<pack>/...         the card faces (served at /pokeshell/img/)
//!   data/pack.json, boosters.json, carddata.json, built.json
//!   manifest.json
//!
//! The pak (tools/release/bundle.mjs): "PKARENA1", the index's length (u64 LE), the index (JSON
//! {"version":1,"files":{"<path>":[offset,length]}}, offsets from the end of the index), the files.

use serde_json::Value;
use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const MAGIC: &[u8; 8] = b"PKARENA1";

pub enum Assets {
    Dir(PathBuf),
    Pak { bytes: &'static [u8], files: HashMap<String, (usize, usize)> },
}

/// `a/b.png` from a URL or bundle path: no leading slash, no empty, `.` or `..` parts, no backslashes or drive colons
pub fn clean_rel(p: &str) -> Option<String> {
    if p.contains('\\') || p.contains('\0') || p.contains(':') {
        return None;
    }
    let mut out = Vec::new();
    for part in p.split('/') {
        match part {
            "" | "." => {}
            ".." => return None,
            x => out.push(x),
        }
    }
    if out.is_empty() { None } else { Some(out.join("/")) }
}

impl Assets {
    /// a pak's bytes (embedded, or a file read once and kept for the process)
    pub fn from_pak(bytes: &'static [u8]) -> Result<Assets, String> {
        if bytes.len() < 16 || &bytes[..8] != MAGIC {
            return Err("not an arena data pak (no PKARENA1 header)".into());
        }
        let n = u64::from_le_bytes(bytes[8..16].try_into().unwrap()) as usize;
        let head = bytes.get(16..16 + n).ok_or("the pak's index is cut short")?;
        let index: Value = serde_json::from_slice(head).map_err(|e| format!("the pak's index: {e}"))?;
        let base = 16 + n;
        let mut files = HashMap::new();
        for (k, v) in index.get("files").and_then(|f| f.as_object()).ok_or("the pak's index has no files")? {
            let (Some(off), Some(len)) = (v.get(0).and_then(|x| x.as_u64()), v.get(1).and_then(|x| x.as_u64())) else {
                return Err(format!("the pak's index: bad entry {k}"));
            };
            let (start, len) = (base + off as usize, len as usize);
            if start + len > bytes.len() {
                return Err(format!("the pak is cut short ({k})"));
            }
            files.insert(k.clone(), (start, len));
        }
        Ok(Assets::Pak { bytes, files })
    }

    /// `--data <dir or .pak>`
    pub fn open(p: &Path) -> Result<Assets, String> {
        if p.is_dir() {
            if !p.join("data").join("pack.json").is_file() {
                return Err(format!("{} has no data/pack.json (npm run release:data stages release/bundle)", p.display()));
            }
            return Ok(Assets::Dir(p.to_path_buf()));
        }
        let bytes = std::fs::read(p).map_err(|e| format!("{}: {e}", p.display()))?;
        Assets::from_pak(Box::leak(bytes.into_boxed_slice()))
    }

    pub fn describe(&self) -> String {
        match self {
            Assets::Dir(d) => d.display().to_string(),
            Assets::Pak { files, bytes } => format!("embedded data ({} files, {:.1} MB)", files.len(), bytes.len() as f64 / 1048576.0),
        }
    }

    pub fn get(&self, rel: &str) -> Option<Cow<'static, [u8]>> {
        let rel = clean_rel(rel)?;
        match self {
            Assets::Dir(d) => {
                let mut p = d.clone();
                for part in rel.split('/') {
                    p.push(part);
                }
                if p.is_file() { std::fs::read(p).ok().map(Cow::Owned) } else { None }
            }
            Assets::Pak { bytes, files } => files.get(&rel).map(|&(s, n)| Cow::Borrowed(&bytes[s..s + n])),
        }
    }

    pub fn exists(&self, rel: &str) -> bool {
        let Some(rel) = clean_rel(rel) else { return false };
        match self {
            Assets::Dir(d) => rel.split('/').fold(d.clone(), |p, x| p.join(x)).is_file(),
            Assets::Pak { files, .. } => files.contains_key(&rel),
        }
    }

    pub fn json(&self, rel: &str) -> Result<Value, String> {
        let b = self.get(rel).ok_or_else(|| format!("the game data has no {rel}"))?;
        let b: &[u8] = &b;
        let b = b.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(b);
        serde_json::from_slice(b).map_err(|e| format!("{rel}: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rel_paths() {
        assert_eq!(clean_rel("/game/index.html").as_deref(), Some("game/index.html"));
        assert_eq!(clean_rel("a//./b.png").as_deref(), Some("a/b.png"));
        assert_eq!(clean_rel("../x"), None);
        assert_eq!(clean_rel("a/../../x"), None);
        assert_eq!(clean_rel("C:/x"), None);
        assert_eq!(clean_rel("a\\b"), None);
        assert_eq!(clean_rel("/"), None);
    }

    #[test]
    fn pak_roundtrip() {
        let index = br#"{"version":1,"files":{"data/a.json":[0,7],"game/index.html":[7,2]}}"#;
        let mut b = MAGIC.to_vec();
        b.extend_from_slice(&(index.len() as u64).to_le_bytes());
        b.extend_from_slice(index);
        b.extend_from_slice(b"{\"x\":1}hi");
        let a = Assets::from_pak(Box::leak(b.into_boxed_slice())).unwrap();
        assert_eq!(a.json("data/a.json").unwrap()["x"], 1);
        assert_eq!(&*a.get("/game/index.html").unwrap(), b"hi");
        assert!(a.exists("game/index.html") && !a.exists("game/nope") && !a.exists("../game/index.html"));
        assert!(Assets::from_pak(b"nope").is_err());
    }
}
