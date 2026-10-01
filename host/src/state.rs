//! The arena's own state dir (docs/SPEC.md section 10): matches.jsonl, teams.json, host.json. The pack-token wallet is
//! pokeshell's (`pokeshell pack tokens|grant|open --json`), or in standalone mode the arena's own (standalone.rs). The
//! progress toward the next pack (the tokens wins earn, 10 to a pack) is matches.jsonl's: every result's `points` minus
//! POINTS_PER_PACK per pack it granted.

use serde_json::{Value, json};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

pub const ENERGY_TYPES: &[&str] = &[
    "Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Fairy", "Dragon", "Colorless",
];

/// local time as `YYYY-MM-DDTHH:MM:SS`, like pokeshell's pulls.log
pub fn now_local() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

pub struct Store {
    pub dir: PathBuf,
}

fn read_lossy(p: &Path) -> String {
    fs::read(p).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
}

fn append(p: &Path, line: &str) -> std::io::Result<()> {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d)?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(p)?;
    f.write_all(line.as_bytes())?;
    f.write_all(b"\n")
}

/// write to a temp file next to it, then swap it in
pub fn write_atomic(p: &Path, data: &str) -> std::io::Result<()> {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d)?;
    }
    let tmp = p.with_extension(format!("tmp{}", std::process::id()));
    fs::write(&tmp, data)?;
    fs::rename(&tmp, p)
}

impl Store {
    /// a result with this matchId is already recorded (matches.jsonl is what makes grants idempotent)
    pub fn match_seen(&self, id: &str) -> bool {
        let text = read_lossy(&self.dir.join("matches.jsonl"));
        text.lines().any(|l| serde_json::from_str::<Value>(l).ok().and_then(|v| v.get("matchId").and_then(|m| m.as_str()).map(|m| m == id)).unwrap_or(false))
    }

    /// the progress toward the next pack: every recorded result's points minus POINTS_PER_PACK for each pack token it
    /// granted (results from before the progress have no `points` and count nothing). Normally under POINTS_PER_PACK;
    /// more when a grant failed (the next win grants it)
    pub fn progress_points(&self) -> i64 {
        let text = read_lossy(&self.dir.join("matches.jsonl"));
        let mut p = 0;
        for v in text.lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()) {
            if let Some(pts) = v.get("points").and_then(|x| x.as_i64()) {
                p += pts - POINTS_PER_PACK * v.get("granted").and_then(|x| x.as_i64()).unwrap_or(0);
            }
        }
        p.max(0)
    }

    pub fn record_match(&self, rec: &Value) -> std::io::Result<()> {
        append(&self.dir.join("matches.jsonl"), &rec.to_string())
    }

    pub fn teams(&self) -> Value {
        let t = read_lossy(&self.dir.join("teams.json"));
        serde_json::from_str(&t).unwrap_or_else(|_| json!({"version": 1, "selected": null, "teams": []}))
    }

    pub fn save_teams(&self, v: &Value) -> std::io::Result<()> {
        write_atomic(&self.dir.join("teams.json"), &serde_json::to_string_pretty(v).unwrap_or_default())
    }
}

fn is_id(s: &str, max: usize) -> bool {
    !s.is_empty() && s.len() <= max && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}

pub fn valid_match_id(s: &str) -> bool {
    is_id(s, 64)
}

pub fn valid_set_id(s: &str) -> bool {
    is_id(s, 32)
}

/// every problem in a teams.json document
pub fn validate_teams(v: &Value) -> Vec<String> {
    let mut e = Vec::new();
    if v.get("version").and_then(|x| x.as_i64()) != Some(1) {
        e.push("version: must be 1".into());
    }
    let Some(teams) = v.get("teams").and_then(|t| t.as_array()) else {
        e.push("teams: must be a list".into());
        return e;
    };
    if teams.len() > 50 {
        e.push("teams: at most 50".into());
    }
    for (i, t) in teams.iter().enumerate() {
        let at = format!("teams[{i}]");
        if !t.get("id").and_then(|x| x.as_str()).is_some_and(|s| is_id(s, 40)) {
            e.push(format!("{at}.id: letters, digits, - _ ."));
        }
        match t.get("mode").and_then(|x| x.as_str()) {
            Some("1v1") | Some("team") => {}
            _ => e.push(format!("{at}.mode: \"1v1\" or \"team\"")),
        }
        match t.get("members").and_then(|x| x.as_array()) {
            Some(m) if !m.is_empty() && m.len() <= 6 => {
                for (k, mem) in m.iter().enumerate() {
                    if !mem.get("card").and_then(|x| x.as_str()).is_some_and(|s| is_id(s, 40)) {
                        e.push(format!("{at}.members[{k}].card: a card id"));
                    }
                }
            }
            _ => e.push(format!("{at}.members: 1 to 6 cards")),
        }
        // energy is optional since the single untyped meter; older files carry three types, still validated as such
        match t.get("energy") {
            None | Some(Value::Null) => {}
            Some(Value::Array(en)) if en.len() == 3 && en.iter().all(|x| x.as_str().is_some_and(|s| ENERGY_TYPES.contains(&s))) => {}
            _ => e.push(format!("{at}.energy: three energy types, or absent")),
        }
    }
    if let Some(sel) = v.get("selected") {
        if !sel.is_null() && !sel.as_str().is_some_and(|s| teams.iter().any(|t| t.get("id").and_then(|x| x.as_str()) == Some(s))) {
            e.push("selected: must name one of the teams (or be null)".into());
        }
    }
    e
}

/// the tokens to one pack (docs/SPEC.md section 9): a win's tokens fill the progress, each 10 grant a pack token
pub const POINTS_PER_PACK: i64 = 10;

/// the tokens a match result earns toward the next pack (docs/SPEC.md section 9): a win in 1v1 1, in team 2, +1 on
/// hard, +2 on expert; a loss 0. POINTS_PER_PACK of them make one pack
pub fn points_for(mode: &str, difficulty: &str, won: bool) -> i64 {
    if !won {
        return 0;
    }
    let base = if mode == "team" { 2 } else { 1 };
    base + match difficulty {
        "hard" => 1,
        "expert" => 2,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_are_idempotency_records() {
        let dir = std::env::temp_dir().join(format!("arena-state-test-{}", std::process::id()));
        let st = Store { dir: dir.clone() };
        assert!(!st.match_seen("m-1"));
        st.record_match(&json!({"matchId": "m-1", "granted": 1})).unwrap();
        assert!(st.match_seen("m-1"));
        assert!(!st.match_seen("m-2"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn progress_is_points_minus_packs() {
        let dir = std::env::temp_dir().join(format!("arena-progress-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let st = Store { dir: dir.clone() };
        assert_eq!(st.progress_points(), 0);
        // a result from before the progress (whole pack tokens) counts nothing
        st.record_match(&json!({"matchId": "old", "granted": 4})).unwrap();
        assert_eq!(st.progress_points(), 0);
        st.record_match(&json!({"matchId": "a", "points": 4, "granted": 0})).unwrap();
        st.record_match(&json!({"matchId": "b", "points": 4, "granted": 0})).unwrap();
        assert_eq!(st.progress_points(), 8);
        st.record_match(&json!({"matchId": "c", "points": 4, "granted": 1})).unwrap();
        assert_eq!(st.progress_points(), 2);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn grants() {
        assert_eq!(points_for("1v1", "normal", true), 1);
        assert_eq!(points_for("team", "hard", true), 3);
        assert_eq!(points_for("1v1", "hard", false), 0);
        assert_eq!(points_for("1v1", "expert", true), 3);
        assert_eq!(points_for("team", "expert", true), 4);
    }

    #[test]
    fn ids() {
        assert!(valid_set_id("swsh12pt5gg"));
        assert!(!valid_set_id("../x"));
        assert!(!valid_set_id("a b"));
        assert!(valid_match_id("5-19a2b3"));
        assert!(!valid_match_id(""));
    }

    #[test]
    fn teams_validation() {
        let ok = json!({"version": 1, "selected": "t1", "teams": [{"id": "t1", "name": "A", "mode": "1v1", "members": [{"card": "base1-58"}], "energy": ["Lightning", "Lightning", "Water"]}]});
        assert!(validate_teams(&ok).is_empty(), "{:?}", validate_teams(&ok));
        let no_energy = json!({"version": 1, "selected": null, "teams": [{"id": "t2", "name": "B", "mode": "team", "members": [{"card": "base1-58"}, {"card": "base1-63"}, {"card": "base1-46"}]}]});
        assert!(validate_teams(&no_energy).is_empty(), "{:?}", validate_teams(&no_energy));
        let two = json!({"version": 1, "teams": [{"id": "t3", "mode": "1v1", "members": [{"card": "base1-58"}], "energy": ["Fire", "Water"]}]});
        assert_eq!(validate_teams(&two).len(), 1, "{:?}", validate_teams(&two));
        let bad = json!({"version": 2, "selected": "zz", "teams": [{"id": "", "mode": "x", "members": [], "energy": ["Nope"]}]});
        assert_eq!(validate_teams(&bad).len(), 6, "{:?}", validate_teams(&bad));
    }
}
