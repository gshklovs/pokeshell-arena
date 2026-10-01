//! Standalone mode (docs/RELEASE.md): the arena without pokeshell. The host keeps its own pack-token wallet, its own
//! pulls and opens real boosters itself (booster.rs, pokeshell's model ported), from the bundled game data
//! (assets.rs). The files in the arena's state dir mirror pokeshell's, so the JSON the page gets is the same shape:
//!
//!   tokens.log   append-only TSV, pokeshell's format:  time  delta  reason  id=<ulid>  [set=<set>  pack=<pack id>  [random=1]]
//!                the balance is the sum; the starter grant is the line with kind=starter (once per state)
//!   pulls.log    one line per card pulled, pokeshell's booster line:
//!                time  pack  character  tier  card id  (skin)  shiny 0/1  booster:<set>  id=<pull>  card=<id>  booster=<pack id>  slot=  finish=
//!
//! A new player gets STARTER_PACKS tokens the first time a state starts, so they can open packs and get cards to
//! battle with (you only battle with cards you own).

use crate::assets::Assets;
use crate::booster::{self, Dice, Model};
use crate::state::now_local;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const STARTER_PACKS: i64 = 3;
pub const STARTER_REASON: &str = "starter packs: welcome to pokeshell arena";

pub struct Standalone {
    pub dir: PathBuf,
    pub model: Model,
    pub assets: Assets,
    /// pack.json's card entries (name, set, number, rarity) and carddata.json's gameplay data, by card id
    raw_cards: serde_json::Map<String, Value>,
    carddata: HashMap<String, Value>,
    /// serializes every wallet change and pack open (one host per state: main.rs holds host.lock)
    lock: Mutex<()>,
}

#[derive(Debug)]
pub enum OpenError {
    NoTokens(i64),
    NoSets,
    BadSet(String),
    Io(String),
}

fn read_lossy(p: &Path) -> String {
    fs::read(p).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
}

fn append_lines(p: &Path, lines: &[String]) -> std::io::Result<()> {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d)?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(p)?;
    let mut s = String::new();
    for l in lines {
        s.push_str(l);
        s.push_str("\r\n");
    }
    f.write_all(s.as_bytes())?;
    f.sync_data()
}

/// a tokens.log line's fields: (time, delta, reason, key=value pairs)
fn parse_token_line(l: &str) -> Option<(String, i64, String, HashMap<String, String>)> {
    let x: Vec<&str> = l.trim_end_matches(['\r', '\n']).split('\t').collect();
    if x.len() < 3 {
        return None;
    }
    let d: i64 = x[1].trim_start_matches('+').parse().ok()?;
    let kv = x[3..].iter().filter_map(|y| y.split_once('=')).filter(|(k, _)| !k.is_empty()).map(|(k, v)| (k.to_string(), v.to_string())).collect();
    Some((x[0].to_string(), d, x[2].to_string(), kv))
}

fn clean(s: &str) -> String {
    let s: String = s.chars().map(|c| if c == '\t' || c == '\r' || c == '\n' { ' ' } else { c }).collect();
    let s = s.trim().to_string();
    if s.is_empty() { "-".into() } else { s }
}

impl Standalone {
    pub fn new(dir: PathBuf, assets: Assets) -> Result<Standalone, String> {
        let pack = assets.json("data/pack.json")?;
        let boosters = assets.json("data/boosters.json")?;
        let built = assets.json("data/built.json")?;
        let ids = |k: &str| -> HashSet<String> { built.get(k).and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default() };
        let model = Model::load(&pack, &boosters, &ids("built"), &ids("shinyArt"))?;
        let raw_cards = pack.get("cards").and_then(|c| c.as_object()).cloned().unwrap_or_default();
        let carddata = assets
            .json("data/carddata.json")
            .ok()
            .and_then(|d| d.get("cards").and_then(|c| c.as_object()).cloned())
            .map(|m| m.into_iter().collect())
            .unwrap_or_default();
        Ok(Standalone { dir, model, assets, raw_cards, carddata, lock: Mutex::new(()) })
    }

    fn tokens_file(&self) -> PathBuf {
        self.dir.join("tokens.log")
    }
    fn pulls_file(&self) -> PathBuf {
        self.dir.join("pulls.log")
    }

    fn token_lines(&self) -> Vec<(String, i64, String, HashMap<String, String>)> {
        read_lossy(&self.tokens_file()).lines().filter_map(parse_token_line).collect()
    }

    pub fn balance(&self) -> i64 {
        self.token_lines().iter().map(|l| l.1).sum()
    }

    fn add_tokens(&self, delta: i64, reason: &str, extra: &[(&str, &str)]) -> std::io::Result<String> {
        let id = booster::new_ulid();
        let mut line = format!("{}\t{}\t{}\tid={id}", now_local(), if delta > 0 { format!("+{delta}") } else { delta.to_string() }, clean(reason));
        for (k, v) in extra {
            line.push_str(&format!("\t{k}={}", clean(v)));
        }
        append_lines(&self.tokens_file(), &[line])?;
        Ok(id)
    }

    /// the starter packs: STARTER_PACKS tokens, once per state (the tokens.log line with kind=starter is the record,
    /// so it survives restarts and is never granted twice). Some(balance) when this call granted them.
    pub fn ensure_starter(&self) -> std::io::Result<Option<i64>> {
        let _g = self.lock.lock().unwrap();
        if self.starter_line().is_some() {
            return Ok(None);
        }
        self.add_tokens(STARTER_PACKS, STARTER_REASON, &[("kind", "starter")])?;
        Ok(Some(self.balance()))
    }

    /// when the starter packs were granted
    pub fn starter_line(&self) -> Option<String> {
        self.token_lines().into_iter().find(|l| l.3.get("kind").map(|k| k.as_str()) == Some("starter")).map(|l| l.0)
    }

    /// `pokeshell pack tokens --json`: {balance, recent}
    pub fn tokens_json(&self) -> Value {
        let lines = self.token_lines();
        let bal: i64 = lines.iter().map(|l| l.1).sum();
        let recent: Vec<Value> = lines[lines.len().saturating_sub(20)..]
            .iter()
            .map(|(t, d, r, kv)| json!({"time": t, "delta": d, "reason": r, "id": kv.get("id"), "set": kv.get("set"), "pack": kv.get("pack")}))
            .collect();
        json!({"balance": bal, "recent": recent})
    }

    /// `pokeshell pack grant <n> --reason <text> --json`
    pub fn grant(&self, n: i64, reason: &str) -> std::io::Result<Value> {
        let _g = self.lock.lock().unwrap();
        let id = self.add_tokens(n, reason, &[])?;
        Ok(json!({"granted": n, "reason": reason, "id": id, "balance": self.balance()}))
    }

    /// the card ids pulled in this state (for NEW)
    fn caught(&self) -> HashSet<String> {
        read_lossy(&self.pulls_file()).lines().filter_map(|l| l.split('\t').nth(4).filter(|x| !x.is_empty()).map(String::from)).collect()
    }

    /// `pokeshell pack open <set>|random --json`: spends a token (unless free), rolls, records the pulls
    pub fn open(&self, set: Option<&str>, free: bool, dice: &mut dyn Dice) -> Result<Value, OpenError> {
        let m = &self.model;
        let chosen = match set {
            Some(w) => {
                let i = m.find_set(w).map_err(OpenError::BadSet)?;
                if !m.sets[i].openable() {
                    return Err(OpenError::BadSet(format!("no cards of {} are served, so it can't be opened", m.sets[i].name)));
                }
                Some(i)
            }
            None => None,
        };
        let _g = self.lock.lock().unwrap();
        let bal = self.balance();
        if !free && bal < 1 {
            return Err(OpenError::NoTokens(bal));
        }
        let random = chosen.is_none();
        let si = match chosen {
            Some(i) => i,
            None => m.pick_set(dice).ok_or(OpenError::NoSets)?, // the set is the first draw, then the pack
        };
        let mut caught = self.caught();
        let picks = booster::open(m, si, dice, &mut caught);
        let pack_id = booster::new_ulid();
        let stamp = now_local();
        let bs = &m.sets[si];
        let mut cards = Vec::new();
        let mut lines = Vec::new();
        for p in &picks {
            let c = &m.cards[p.card];
            let pull = booster::new_ulid();
            lines.push(format!(
                "{stamp}\t{}\t{}\t{}\t{}\t\t{}\tbooster:{}\tid={pull}\tcard={}\tbooster={pack_id}\tslot={}\tfinish={}",
                m.pack, c.character, c.tier_id, c.id, if p.shiny { 1 } else { 0 }, bs.id, c.id, p.slot_id, p.finish
            ));
            cards.push(p.to_json(m, &pull));
        }
        append_lines(&self.pulls_file(), &lines).map_err(|e| OpenError::Io(e.to_string()))?;
        if !free {
            let mut extra = vec![("set", bs.id.as_str()), ("pack", pack_id.as_str())];
            if random {
                extra.push(("random", "1"));
            }
            self.add_tokens(-1, &format!("opened {}", bs.id), &extra).map_err(|e| OpenError::Io(e.to_string()))?;
        }
        let chance = m.set_chances()[si];
        Ok(json!({
            "set": bs.id, "setName": bs.name, "setChance": booster::round_to(chance, 6),
            "setOneIn": if chance > 0.0 { json!(booster::round_to(1.0 / chance, 1)) } else { Value::Null },
            "setPrice": if bs.price > 0.0 { json!(bs.price) } else { Value::Null }, "random": random,
            "packId": pack_id, "secure": dice.secure(), "cards": cards, "spent": if free { 0 } else { 1 }, "tokens": self.balance(),
        }))
    }

    /// `pokeshell collection --json`: every caught card with its pull times (firstCaught / lastCaught), counts, art
    /// paths (relative to the card faces, served at /pokeshell/img/) and its gameplay data
    pub fn collection_json(&self) -> Value {
        struct Slot {
            pack: String,
            id: String,
            character: String,
            tier: String,
            caught: i64,
            shiny: i64,
            first: String,
            last: String,
        }
        let m = &self.model;
        let mut slots: Vec<Slot> = Vec::new();
        let mut at: HashMap<String, usize> = HashMap::new();
        for l in read_lossy(&self.pulls_file()).lines() {
            let f: Vec<&str> = l.split('\t').collect();
            if f.len() < 7 || f[1] != m.pack {
                continue;
            }
            let Some(&ci) = m.by_id.get(f[4]) else { continue }; // a card this data doesn't serve: hidden
            let c = &m.cards[ci];
            if c.character != f[2] {
                continue;
            }
            let k = format!("{}/{}", f[1], f[4]);
            let i = *at.entry(k).or_insert_with(|| {
                slots.push(Slot { pack: f[1].into(), id: c.id.clone(), character: c.character.clone(), tier: c.tier_id.clone(), caught: 0, shiny: 0, first: String::new(), last: String::new() });
                slots.len() - 1
            });
            let s = &mut slots[i];
            let t = f[0].to_string();
            s.caught += 1;
            if f[6].trim() == "1" {
                s.shiny += 1;
            }
            if s.first.is_empty() || t < s.first {
                s.first = t.clone();
            }
            if s.last.is_empty() || t > s.last {
                s.last = t;
            }
        }
        let (mut pulls, mut shinies) = (0, 0);
        let cards: Vec<Value> = slots
            .iter()
            .map(|s| {
                pulls += s.caught;
                shinies += s.shiny;
                let raw = self.raw_cards.get(&s.id).cloned().unwrap_or(Value::Null);
                let ci = m.by_id[&s.id];
                let rel = format!("{}/{}/{}", s.pack, s.character, s.id);
                let img = self.assets.exists(&format!("cards/img/{rel}.png")).then(|| format!("{rel}.png"));
                let img_shiny = self.assets.exists(&format!("cards/img/{rel}-shiny.png")).then(|| format!("{rel}-shiny.png"));
                json!({
                    "card": s.id, "pack": s.pack, "character": s.character, "name": raw.get("name"), "set": booster::card_set(&s.id),
                    "setName": raw.get("set"), "number": raw.get("number"), "rarity": raw.get("rarity"), "tier": s.tier,
                    "tierLabel": m.tier_labels[m.cards[ci].tier], "tierRank": m.cards[ci].tier, "caught": true, "count": s.caught,
                    "shinyCount": s.shiny, "shiny": s.shiny > 0, "new": false, "firstCaught": s.first, "lastCaught": s.last,
                    "art": {"ans": null, "ansShiny": null, "png": null, "pngShiny": null, "img": img, "imgShiny": img_shiny},
                    "data": self.carddata.get(&s.id),
                })
            })
            .collect();
        json!({
            "api": 1, "version": env!("CARGO_PKG_VERSION"), "state": self.dir.display().to_string(), "pack": null, "standalone": true,
            "counts": {"caught": cards.len(), "seen": 0, "pulls": pulls, "shiny": shinies}, "cards": cards, "seen": [],
        })
    }

    /// what the page needs to know about the welcome packs
    pub fn starter_json(&self) -> Value {
        let at = self.starter_line();
        json!({"packs": STARTER_PACKS, "granted": at.is_some(), "at": at})
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::booster::SeededDice;

    /// a bundle folder with a tiny pack (one set) in a temp dir, and a Standalone on a fresh state next to it
    pub fn fixture(name: &str) -> (PathBuf, Standalone) {
        let root = std::env::temp_dir().join(format!("arena-standalone-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let data = root.join("bundle").join("data");
        fs::create_dir_all(&data).unwrap();
        let img = root.join("bundle").join("cards").join("img").join("pokemon").join("a");
        fs::create_dir_all(&img).unwrap();
        fs::write(img.join("t1-1.png"), b"png").unwrap();
        fs::write(img.join("t1-1-shiny.png"), b"png").unwrap();
        fs::write(data.join("pack.json"), json!({"id": "pokemon", "shiny_chance": 0.5,
            "tiers": [{"id": "common", "label": "common"}, {"id": "rare", "label": "rare"}],
            "cards": {
                "t1-1": {"character": "a", "tier": "common", "name": "A", "number": "1/3", "rarity": "Common", "set": "T"},
                "t1-2": {"character": "b", "tier": "common", "name": "B", "number": "2/3", "rarity": "Common", "set": "T"},
                "t1-3": {"character": "c", "tier": "rare", "name": "C", "number": "3/3", "rarity": "Rare", "set": "T"}}}).to_string()).unwrap();
        fs::write(data.join("boosters.json"), json!({"priceExponent": 0.7, "sets": [
            {"id": "t1", "name": "Test", "price": 5, "cardSets": ["t1"], "slots": [
                {"id": "common", "count": 2, "pick": [{"label": "common", "rarity": ["Common"], "base": true}]},
                {"id": "rare", "pick": [{"label": "rare", "rarity": ["Rare"], "base": true}]}]}]}).to_string()).unwrap();
        fs::write(data.join("built.json"), json!({"built": ["t1-1", "t1-2", "t1-3"], "shinyArt": ["t1-1"]}).to_string()).unwrap();
        fs::write(data.join("carddata.json"), json!({"cards": {"t1-1": {"hp": 40, "attacks": [{"name": "Tackle"}]}}}).to_string()).unwrap();
        let st = root.join("state");
        let s = Standalone::new(st.clone(), Assets::open(&root.join("bundle")).unwrap()).unwrap();
        (root, s)
    }

    #[test]
    fn starter_grant_is_once_per_state() {
        let (root, s) = fixture("starter");
        assert_eq!(s.balance(), 0);
        assert!(!s.starter_json()["granted"].as_bool().unwrap());
        assert_eq!(s.ensure_starter().unwrap(), Some(STARTER_PACKS));
        assert_eq!(s.ensure_starter().unwrap(), None);
        assert_eq!(s.balance(), STARTER_PACKS);
        // a restart (a new host on the same state) doesn't grant again, even after the packs are spent
        let mut d = SeededDice(3);
        for _ in 0..STARTER_PACKS {
            s.open(None, false, &mut d).unwrap();
        }
        assert_eq!(s.balance(), 0);
        let again = Standalone::new(s.dir.clone(), Assets::open(&root.join("bundle")).unwrap()).unwrap();
        assert_eq!(again.ensure_starter().unwrap(), None);
        assert_eq!(again.balance(), 0);
        assert!(again.starter_json()["granted"].as_bool().unwrap());
        // concurrent first starts on one host: still one grant
        let (root2, s2) = fixture("starter-race");
        let s2 = std::sync::Arc::new(s2);
        let hs: Vec<_> = (0..8).map(|_| { let s = s2.clone(); std::thread::spawn(move || s.ensure_starter().unwrap().is_some()) }).collect();
        assert_eq!(hs.into_iter().map(|h| h.join().unwrap()).filter(|&g| g).count(), 1);
        assert_eq!(s2.balance(), STARTER_PACKS);
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(root2);
    }

    #[test]
    fn wallet_spends_one_token_per_pack_and_refuses_at_zero() {
        let (root, s) = fixture("wallet");
        let mut d = SeededDice(9);
        assert!(matches!(s.open(None, false, &mut d), Err(OpenError::NoTokens(0))));
        assert!(s.caught().is_empty(), "a refused open records nothing");
        assert_eq!(s.grant(2, "arena win m-1").unwrap()["balance"], 2);
        let p = s.open(Some("t1"), false, &mut d).unwrap();
        assert_eq!(p["spent"], 1);
        assert_eq!(p["tokens"], 1);
        assert_eq!(p["random"], false);
        assert_eq!(p["cards"].as_array().unwrap().len(), 3);
        let r = s.open(None, false, &mut d).unwrap();
        assert_eq!(r["random"], true);
        assert_eq!(r["set"], "t1");
        assert_eq!(r["setOneIn"], 1.0);
        assert_eq!(s.balance(), 0);
        assert!(matches!(s.open(None, false, &mut d), Err(OpenError::NoTokens(0))));
        assert!(matches!(s.open(Some("nope"), false, &mut d), Err(OpenError::BadSet(_))));
        let t = s.tokens_json();
        assert_eq!(t["balance"], 0);
        let deltas: Vec<i64> = t["recent"].as_array().unwrap().iter().map(|x| x["delta"].as_i64().unwrap()).collect();
        assert_eq!(deltas, [2, -1, -1]);
        assert_eq!(t["recent"][2]["set"], "t1");
        // the collection: counts, pull times, art paths, data
        let c = s.collection_json();
        let cards = c["cards"].as_array().unwrap();
        assert_eq!(c["counts"]["pulls"], 6);
        let a = cards.iter().find(|x| x["card"] == "t1-1").expect("two commons of two: t1-1 is in every pack");
        assert_eq!(a["count"], 2);
        assert!(a["firstCaught"].as_str().unwrap() <= a["lastCaught"].as_str().unwrap());
        assert_eq!(a["art"]["img"], "pokemon/a/t1-1.png");
        assert_eq!(a["art"]["imgShiny"], "pokemon/a/t1-1-shiny.png");
        assert_eq!(a["data"]["hp"], 40);
        let b = cards.iter().find(|x| x["card"] == "t1-2").unwrap();
        assert_eq!(b["art"]["img"], Value::Null);
        assert_eq!(b["tierRank"], 0);
        assert_eq!(b["name"], "B");
        // the second pack's cards weren't new
        assert!(r["cards"].as_array().unwrap().iter().all(|x| x["isNew"] == false));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn token_lines() {
        let (t, d, r, kv) = parse_token_line("2026-09-30T10:00:00\t+3\tstarter\tid=X\tkind=starter").unwrap();
        assert_eq!((t.as_str(), d, r.as_str(), kv["kind"].as_str()), ("2026-09-30T10:00:00", 3, "starter", "starter"));
        assert_eq!(parse_token_line("x\t-1\topened\tid=Y\r\n").unwrap().1, -1);
        assert!(parse_token_line("garbage").is_none());
        assert!(parse_token_line("t\tnan\tr").is_none());
        assert_eq!(clean("a\tb\n"), "a b");
    }
}
