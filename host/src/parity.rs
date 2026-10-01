//! Pack-odds parity: the Rust booster port (booster.rs) against pokeshell's own tables. The fixture
//! (tests/fixtures/pokeshell/, tools/release/odds-fixture.ps1) holds pokeshell's pack.json, boosters.json, the served
//! cards, and what `pokeshell pack odds random --json`, `pack odds <set> --json` and `pack sets --json` printed for that
//! data; the model built here from the same files must print the same numbers (to pokeshell's rounding), and its rolls
//! must land on those probabilities.

use crate::booster::{self, Model, SeededDice};
use serde_json::Value;
use std::collections::HashSet;
use std::path::PathBuf;

fn fixture(name: &str) -> Value {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("pokeshell").join(name);
    let b = std::fs::read(&p).unwrap_or_else(|e| panic!("{}: {e} (tools/release/odds-fixture.ps1 writes it)", p.display()));
    let b = b.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&b);
    serde_json::from_slice(b).unwrap_or_else(|e| panic!("{}: {e}", p.display()))
}

fn model() -> Model {
    let built = fixture("built.json");
    let ids = |k: &str| -> HashSet<String> { built[k].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect() };
    Model::load(&fixture("pack.json"), &fixture("boosters.json"), &ids("built"), &ids("shinyArt")).unwrap()
}

/// pokeshell rounds with .NET's Math.Round (to even): a value may differ by one unit in the last place
fn close(a: &Value, b: &Value, unit: f64) -> bool {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => (x - y).abs() <= unit * 1.000001,
        _ => a == b,
    }
}

#[test]
fn random_pack_set_odds_match_pokeshell() {
    let m = model();
    let want = &fixture("odds.json")["random"];
    let got = booster::odds_random(&m);
    assert!(close(&got["priceExponent"], &want["priceExponent"], 0.0));
    let (g, w) = (got["sets"].as_array().unwrap(), want["sets"].as_array().unwrap());
    assert_eq!(g.len(), w.len());
    for (g, w) in g.iter().zip(w) {
        assert_eq!(g["set"], w["set"]);
        assert_eq!(g["openable"], w["openable"], "{}", w["set"]);
        assert!(close(&g["price"], &w["price"], 0.0), "{} price {} vs {}", w["set"], g["price"], w["price"]);
        assert!(close(&g["chance"], &w["chance"], 1e-6), "{} chance {} vs pokeshell {}", w["set"], g["chance"], w["chance"]);
        assert!(close(&g["oneIn"], &w["oneIn"], 0.1), "{} oneIn {} vs pokeshell {}", w["set"], g["oneIn"], w["oneIn"]);
    }
}

#[test]
fn every_sets_slot_odds_match_pokeshell() {
    let m = model();
    let odds = &fixture("odds.json")["odds"];
    let mut checked = 0;
    for (i, s) in m.sets.iter().enumerate() {
        let want = &odds[&s.id];
        assert!(want.is_object(), "the fixture has no odds for {}", s.id);
        let got = booster::odds_set(&m, i);
        assert_eq!(got["cards"], want["cards"], "{}: served cards", s.id);
        let (g, w) = (got["outcomes"].as_array().unwrap(), want["outcomes"].as_array().unwrap());
        assert_eq!(g.len(), w.len(), "{}: outcomes", s.id);
        for (g, w) in g.iter().zip(w) {
            let at = format!("{} {} / {}", s.id, w["slot"], w["outcome"]);
            for k in ["slot", "count", "outcome", "printed", "served", "base"] {
                assert_eq!(g[k], w[k], "{at}: {k}");
            }
            assert!(close(&g["rate"], &w["rate"], 1e-12), "{at}: rate");
            assert!(close(&g["probability"], &w["probability"], 1e-6), "{at}: probability {} vs pokeshell {}", g["probability"], w["probability"]);
            assert!(close(&g["oneIn"], &w["oneIn"], 0.1), "{at}: oneIn {} vs pokeshell {}", g["oneIn"], w["oneIn"]);
            checked += 1;
        }
    }
    assert!(checked > 50, "only {checked} outcomes checked");
}

#[test]
fn set_listing_matches_pokeshell() {
    let m = model();
    let want = &fixture("odds.json")["sets"];
    let got = booster::sets_listing(&m, 0);
    let (g, w) = (got["sets"].as_array().unwrap(), want["sets"].as_array().unwrap());
    assert_eq!(g.len(), w.len());
    for (g, w) in g.iter().zip(w) {
        let id = w["id"].as_str().unwrap();
        for k in ["id", "name", "series", "released", "cards", "inPack", "printed", "packSize", "realPackSize", "openable", "hero", "slots", "art"] {
            assert_eq!(g[k], w[k], "{id}: {k}");
        }
        assert!(close(&g["chance"], &w["chance"], 1e-6), "{id}: chance");
        let (go, wo) = (g["odds"].as_array().unwrap(), w["odds"].as_array().unwrap());
        assert_eq!(go.len(), wo.len(), "{id}: tiers in odds");
        for (a, b) in go.iter().zip(wo) {
            assert_eq!(a["tier"], b["tier"], "{id}: odds tier order");
            assert!(close(&a["weight"], &b["weight"], 1e-5), "{id} {}: {} vs pokeshell {}", b["tier"], a["weight"], b["weight"]);
        }
    }
}

/// the dice land on pokeshell's probabilities: 20,000 packs of every set, each outcome's share within 4.5 sigma of
/// what pokeshell's table says (its tests/test-boosters.ps1 bound), and the set roll of 200,000 random packs
#[test]
fn rolls_follow_pokeshells_probabilities() {
    let m = model();
    let odds = &fixture("odds.json")["odds"];
    let mut d = SeededDice(0x5eed);
    let n = 20_000usize;
    for (si, s) in m.sets.iter().enumerate() {
        if !s.openable() {
            continue;
        }
        let mut counts = vec![vec![0usize; 0]; s.slots.len()];
        for (k, sl) in s.slots.iter().enumerate() {
            counts[k] = vec![0; sl.outcomes.len()];
        }
        for _ in 0..n {
            for p in booster::roll(&s.slots, &mut d) {
                counts[p.slot][p.outcome] += 1;
            }
        }
        let rows = odds[&s.id]["outcomes"].as_array().unwrap();
        let mut r = 0;
        for (k, sl) in s.slots.iter().enumerate() {
            for o in 0..sl.outcomes.len() {
                let p = rows[r]["probability"].as_f64().unwrap();
                r += 1;
                let trials = (n * sl.count) as f64;
                let seen = counts[k][o] as f64;
                if p <= 0.0 {
                    assert_eq!(seen, 0.0, "{} {}: rolled an outcome pokeshell never rolls", s.id, sl.outcomes[o].label);
                    continue;
                }
                let sigma = (trials * p * (1.0 - p)).sqrt().max(1e-9);
                let z = (seen - trials * p) / sigma;
                assert!(z.abs() < 4.5, "{} {} / {}: {seen} of {trials}, expected {:.1} (z = {z:.2})", s.id, sl.id, sl.outcomes[o].label, trials * p);
            }
        }
        let _ = si;
    }
    let ch = m.set_chances();
    let mut c = vec![0usize; m.sets.len()];
    let n = 200_000;
    for _ in 0..n {
        c[m.pick_set(&mut d).unwrap()] += 1;
    }
    for (i, s) in m.sets.iter().enumerate() {
        let (p, seen) = (ch[i], c[i] as f64);
        let z = (seen - n as f64 * p) / (n as f64 * p * (1.0 - p)).sqrt().max(1e-9);
        assert!(z.abs() < 4.5, "set roll {}: {seen} of {n}, expected {:.0} (z = {z:.2})", s.id, n as f64 * p);
    }
}
