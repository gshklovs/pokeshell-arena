//! Real booster packs for the standalone arena: a port of pokeshell's booster model and roll (pokeshell's
//! scripts/lib/booster.ps1 Get-PokeshellBoosterModel / Get-PokeshellBoosterSets, scripts/lib/Booster.cs Booster.Roll /
//! Booster.Open / BoosterIndex.SetChances / PickSet; pokeshell docs/BOOSTERS.md), so a standalone pack has the same
//! odds as `pokeshell pack open`: the same slots, outcome weights (rate x served / printed, the unserved share to the
//! base outcome), the same set choice for a random pack (price ^ -priceExponent), the same shiny roll, effects, hit
//! sizes and reveal order. tests/odds_parity.rs checks the tables against `pokeshell pack odds --json`.
//!
//! The inputs are pokeshell's own files: packs/pokemon/pack.json and boosters.json, and the cards it serves (the ones
//! whose art is built: data/built.json in the standalone bundle, tools/release/bundle.mjs).

use serde_json::{Map, Value, json};
use std::collections::{HashMap, HashSet};

// ------------------------------------------------------------------ the dice
/// uniform draws, as Booster.cs's BoosterRng: next_f64 in [0, 1) with 53 bits, next_below(n) = floor(u * n)
pub trait Dice {
    fn next_f64(&mut self) -> f64;
    fn next_below(&mut self, n: usize) -> usize {
        if n <= 1 {
            return 0;
        }
        ((self.next_f64() * n as f64) as usize).min(n - 1)
    }
    fn secure(&self) -> bool;
}

/// every draw from the OS CSPRNG (pokeshell's default: a pack can't be predicted or replayed)
pub struct SecureDice;
impl Dice for SecureDice {
    fn next_f64(&mut self) -> f64 {
        let mut b = [0u8; 8];
        getrandom::fill(&mut b).expect("the OS random number generator failed");
        (u64::from_le_bytes(b) >> 11) as f64 * (1.0 / 9007199254740992.0)
    }
    fn secure(&self) -> bool {
        true
    }
}

/// reproducible draws for tests and Monte Carlo (splitmix64; not System.Random, so not pokeshell's --seed packs)
#[cfg(test)]
pub struct SeededDice(pub u64);
#[cfg(test)]
impl Dice for SeededDice {
    fn next_f64(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        ((z ^ (z >> 31)) >> 11) as f64 * (1.0 / 9007199254740992.0)
    }
    fn secure(&self) -> bool {
        false
    }
}

/// a ULID like pokeshell's pull ids (Pokeshell.Core.NewPullId): 48 bits of ms since 1970, 80 random bits, Crockford
pub fn new_ulid() -> String {
    const C: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    let mut out = [0u8; 26];
    for i in (0..10).rev() {
        out[i] = C[(ms & 31) as usize];
        ms >>= 5;
    }
    let mut r = [0u8; 10];
    getrandom::fill(&mut r).expect("the OS random number generator failed");
    let mut bit = 0;
    for o in out.iter_mut().skip(10) {
        let mut v = 0usize;
        for _ in 0..5 {
            v = (v << 1) | ((r[bit >> 3] >> (7 - (bit & 7))) & 1) as usize;
            bit += 1;
        }
        *o = C[v];
    }
    String::from_utf8(out.to_vec()).unwrap()
}

// ------------------------------------------------------------------ the model
#[derive(Clone, Debug)]
pub struct Card {
    pub id: String,
    pub character: String,
    pub name: String,
    pub number: String,
    pub tier: usize,
    pub tier_id: String,
    pub tier_label: String,
    pub rarity: String,
    pub set_name: String,
    /// the card's set: its id without the number ("swsh12pt5gg-GG01" -> "swsh12pt5gg")
    pub cset: String,
    /// dist/<pack>/<character>-<id>-shiny.ans exists in pokeshell: it can roll shiny
    pub shiny_art: bool,
}

#[derive(Clone, Debug)]
pub struct Outcome {
    pub label: String,
    /// effective weight: the published rate x served / printed (the base gets the unserved share)
    pub weight: f64,
    /// indices into Model::cards
    pub pool: Vec<usize>,
    /// "" = the slot's finish
    pub finish: String,
    pub fx: String,
    pub rate: f64,
    pub printed: i64,
    pub base: bool,
}

#[derive(Clone, Debug)]
pub struct Slot {
    pub id: String,
    pub count: usize,
    pub finish: String,
    pub outcomes: Vec<Outcome>,
}

impl Slot {
    fn live(o: &Outcome) -> bool {
        o.weight > 0.0 && !o.pool.is_empty()
    }
    /// the outcome's probability once empty outcomes are dropped (BoosterSlot.Probability)
    pub fn probability(&self, o: usize) -> f64 {
        let total: f64 = self.outcomes.iter().filter(|x| Slot::live(x)).map(|x| x.weight).sum();
        let x = &self.outcomes[o];
        if total > 0.0 && Slot::live(x) { x.weight / total } else { 0.0 }
    }
}

#[derive(Clone, Debug)]
pub struct BoosterSet {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
    /// USD, one sealed pack; 0 = never picked at random
    pub price: f64,
    /// the served cards of the set (indices into Model::cards, in pack.json order)
    pub cards: Vec<usize>,
    /// the pack.json cards of the set, served or not
    pub in_pack: usize,
    pub slots: Vec<Slot>,
    /// the boosters.json entry, for the listing
    pub raw: Value,
}

impl BoosterSet {
    pub fn openable(&self) -> bool {
        !self.cards.is_empty()
    }
}

pub struct Model {
    pub pack: String,
    pub shiny_chance: f64,
    pub price_exponent: f64,
    /// the served cards, in pack.json order
    pub cards: Vec<Card>,
    pub by_id: HashMap<String, usize>,
    /// every pack.json card id -> character (a set's hero image needn't be served)
    pub characters: HashMap<String, String>,
    pub tier_labels: Vec<String>,
    pub printed_shiny_tiers: HashSet<usize>,
    pub sets: Vec<BoosterSet>,
}

fn s_of(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        x => x.to_string(),
    }
}

/// PowerShell truthiness of a JSON value (`if ($x)`)
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|x| x != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(_)) => true,
    }
}

/// `@($x)` of strings: an array's strings, a single string as one, null/missing as none
fn strs(v: Option<&Value>) -> Vec<String> {
    match v {
        None | Some(Value::Null) => vec![],
        Some(Value::Array(a)) => a.iter().filter(|x| !x.is_null()).map(s_of).collect(),
        Some(x) => vec![s_of(x)],
    }
}

fn num(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

pub fn card_set(id: &str) -> &str {
    match id.rfind('-') {
        Some(i) if i > 0 => &id[..i],
        _ => "",
    }
}

impl Model {
    /// pokeshell's model from its files: `built` are the served cards, `shiny_art` the ones with shiny art
    pub fn load(pack: &Value, boosters: &Value, built: &HashSet<String>, shiny_art: &HashSet<String>) -> Result<Model, String> {
        let tiers = pack.get("tiers").and_then(|t| t.as_array()).ok_or("pack.json has no tiers")?;
        let tier_ix: HashMap<String, usize> = tiers.iter().enumerate().map(|(i, t)| (s_of(&t["id"]), i)).collect();
        let tier_labels: Vec<String> = tiers.iter().map(|t| s_of(&t["label"])).collect();
        let printed_shiny_tiers = tiers.iter().enumerate().filter(|(_, t)| t.get("shiny").and_then(|s| s.as_str()) == Some("printed")).map(|(i, _)| i).collect();
        let raw_cards = pack.get("cards").and_then(|c| c.as_object()).ok_or("pack.json has no cards")?;
        let mut cards = Vec::new();
        let mut by_id = HashMap::new();
        let mut characters = HashMap::new();
        for (id, c) in raw_cards {
            let tier_id = s_of(&c["tier"]);
            let tier = *tier_ix.get(&tier_id).ok_or_else(|| format!("card {id}: no tier '{tier_id}' in pack.json"))?;
            characters.insert(id.clone(), s_of(&c["character"]));
            if !built.contains(id) {
                continue;
            }
            by_id.insert(id.clone(), cards.len());
            cards.push(Card {
                id: id.clone(),
                character: s_of(&c["character"]),
                name: s_of(&c["name"]),
                number: s_of(&c["number"]),
                tier,
                tier_label: tier_labels[tier].clone(),
                tier_id,
                rarity: s_of(&c["rarity"]),
                set_name: s_of(&c["set"]),
                cset: card_set(id).to_string(),
                shiny_art: shiny_art.contains(id),
            });
        }
        let mut sets = Vec::new();
        for s in boosters.get("sets").and_then(|x| x.as_array()).ok_or("boosters.json has no sets")? {
            sets.push(Model::set_model(s, &cards, raw_cards));
        }
        Ok(Model {
            pack: pack.get("id").and_then(|x| x.as_str()).unwrap_or("pokemon").to_string(),
            shiny_chance: num(pack.get("shiny_chance")).unwrap_or(0.0),
            price_exponent: num(boosters.get("priceExponent")).unwrap_or(1.0),
            cards,
            by_id,
            characters,
            tier_labels,
            printed_shiny_tiers,
            sets,
        })
    }

    /// Get-PokeshellBoosterModel for one boosters.json set
    fn set_model(s: &Value, cards: &[Card], raw_cards: &Map<String, Value>) -> BoosterSet {
        let card_sets = strs(s.get("cardSets"));
        let want: HashSet<&str> = card_sets.iter().map(|x| x.as_str()).collect();
        let mine: Vec<usize> = (0..cards.len()).filter(|&i| want.contains(cards[i].cset.as_str())).collect();
        let in_pack = raw_cards.keys().filter(|id| want.contains(card_set(id))).count();
        let mut slots = Vec::new();
        for sl in s.get("slots").and_then(|x| x.as_array()).map(|a| a.as_slice()).unwrap_or(&[]) {
            let count = num(sl.get("count")).filter(|&c| c != 0.0).unwrap_or(1.0) as usize;
            let finish = if truthy(sl.get("finish")) { s_of(&sl["finish"]) } else { "normal".to_string() };
            let mut outcomes: Vec<Outcome> = Vec::new();
            let mut missing = 0.0;
            let mut base_at: Option<usize> = None;
            let picks = match sl.get("pick") {
                Some(Value::Array(a)) => a.clone(),
                Some(Value::Null) | None => vec![],
                Some(x) => vec![x.clone()],
            };
            for pk in &picks {
                let ids: Option<HashSet<String>> = if truthy(pk.get("ids")) { Some(strs(pk.get("ids")).into_iter().collect()) } else { None };
                let in_sets: HashSet<String> = if truthy(pk.get("sets")) { strs(pk.get("sets")).into_iter().collect() } else { card_sets.iter().cloned().collect() };
                let rar: Option<HashSet<String>> = if truthy(pk.get("rarity")) { Some(strs(pk.get("rarity")).into_iter().collect()) } else { None };
                let exc: Option<HashSet<String>> = if truthy(pk.get("exclude")) { Some(strs(pk.get("exclude")).into_iter().collect()) } else { None };
                // every card we serve is a Pokemon card: an outcome of another supertype has no pool
                let no_pok = truthy(pk.get("supertype")) && s_of(&pk["supertype"]) != "Pok";
                let pool: Vec<usize> = if no_pok {
                    vec![]
                } else {
                    mine.iter()
                        .copied()
                        .filter(|&i| {
                            let c = &cards[i];
                            if let Some(ids) = &ids {
                                return ids.contains(&c.id);
                            }
                            in_sets.contains(&c.cset) && !exc.as_ref().is_some_and(|e| e.contains(&c.id)) && rar.as_ref().is_none_or(|r| r.contains(&c.rarity))
                        })
                        .collect()
                };
                let rate = match pk.get("rate") {
                    None | Some(Value::Null) => 1.0,
                    x => num(x).unwrap_or(0.0),
                };
                let printed = if truthy(pk.get("printed")) { num(pk.get("printed")).unwrap_or(0.0) as i64 } else { 0 };
                let share = if printed > 0 { (pool.len() as f64 / printed as f64).min(1.0) } else if pool.is_empty() { 0.0 } else { 1.0 };
                let base = truthy(pk.get("base"));
                let mut w = rate;
                if base && base_at.is_none() {
                    base_at = Some(outcomes.len());
                } else {
                    // the printed cards we don't serve: their share goes to the base
                    w = rate * share;
                    missing += rate - w;
                }
                outcomes.push(Outcome {
                    label: s_of(pk.get("label").unwrap_or(&Value::Null)),
                    weight: w,
                    pool,
                    finish: s_of(pk.get("finish").unwrap_or(&Value::Null)),
                    fx: s_of(pk.get("fx").unwrap_or(&Value::Null)),
                    rate,
                    printed,
                    base,
                });
            }
            if let Some(b) = base_at {
                if !outcomes[b].pool.is_empty() {
                    outcomes[b].weight += missing;
                }
            }
            slots.push(Slot { id: s_of(sl.get("id").unwrap_or(&Value::Null)), count, finish, outcomes });
        }
        BoosterSet {
            id: s_of(&s["id"]),
            name: s_of(&s["name"]),
            aliases: strs(s.get("aliases")).into_iter().filter(|a| !a.is_empty()).map(|a| a.to_lowercase()).collect(),
            price: if truthy(s.get("price")) { num(s.get("price")).unwrap_or(0.0) } else { 0.0 },
            cards: mine,
            in_pack,
            slots,
            raw: s.clone(),
        }
    }

    /// each set's chance to be the one a random pack opens: price ^ -k over the openable priced sets (SetChances)
    pub fn set_chances(&self) -> Vec<f64> {
        let mut w: Vec<f64> = self.sets.iter().map(|s| if s.openable() && s.price > 0.0 { s.price.powf(-self.price_exponent) } else { 0.0 }).collect();
        let total: f64 = w.iter().sum();
        for x in w.iter_mut() {
            *x = if total > 0.0 { *x / total } else { 0.0 };
        }
        w
    }

    /// the set a random pack opens: one draw by set_chances; None when no set can be (PickSet)
    pub fn pick_set(&self, dice: &mut dyn Dice) -> Option<usize> {
        let ch = self.set_chances();
        let mut r = dice.next_f64();
        let mut last = None;
        for (i, &c) in ch.iter().enumerate() {
            if c <= 0.0 {
                continue;
            }
            last = Some(i);
            r -= c;
            if r < 0.0 {
                return Some(i);
            }
        }
        last
    }

    /// a set by id or alias, else its exact name, else a word of its name (BoosterIndex.FindSet)
    pub fn find_set(&self, want: &str) -> Result<usize, String> {
        let w = want.trim().to_lowercase();
        let pass = |f: &dyn Fn(&BoosterSet) -> bool| -> Vec<usize> { (0..self.sets.len()).filter(|&i| f(&self.sets[i])).collect() };
        let mut hit = pass(&|s| s.id.to_lowercase() == w || s.aliases.contains(&w));
        if hit.is_empty() {
            hit = pass(&|s| s.name.to_lowercase() == w);
        }
        if hit.is_empty() {
            hit = pass(&|s| s.name.to_lowercase().contains(&w));
        }
        match hit.len() {
            1 => Ok(hit[0]),
            0 => Err(format!("no booster '{want}' (sets: {})", self.sets.iter().map(|s| s.id.as_str()).collect::<Vec<_>>().join(", "))),
            _ => Err(format!("'{want}' matches several sets: {}", hit.iter().map(|&i| format!("{} ({})", self.sets[i].id, self.sets[i].name)).collect::<Vec<_>>().join(", "))),
        }
    }
}

// ------------------------------------------------------------------ the roll
#[derive(Clone, Debug)]
pub struct Pick {
    pub slot: usize,
    pub outcome: usize,
    pub card: usize,
    pub finish: String,
}

/// one pack: every slot in order, `count` different cards each (Booster.Roll)
pub fn roll(slots: &[Slot], dice: &mut dyn Dice) -> Vec<Pick> {
    let mut picks = Vec::new();
    for (s, slot) in slots.iter().enumerate() {
        let mut used: Vec<usize> = Vec::new();
        for _ in 0..slot.count {
            let Some(o) = pick_outcome(slot, dice) else { break }; // nothing we serve fills it: one card fewer
            let oc = &slot.outcomes[o];
            let card = pick_card(&oc.pool, &used, dice);
            used.push(card);
            picks.push(Pick { slot: s, outcome: o, card, finish: if oc.finish.is_empty() { slot.finish.clone() } else { oc.finish.clone() } });
        }
    }
    picks
}

fn pick_outcome(slot: &Slot, dice: &mut dyn Dice) -> Option<usize> {
    let total: f64 = slot.outcomes.iter().filter(|o| Slot::live(o)).map(|o| o.weight).sum();
    if total <= 0.0 {
        return None;
    }
    let mut r = dice.next_f64() * total;
    let mut last = None;
    for (i, o) in slot.outcomes.iter().enumerate() {
        if !Slot::live(o) {
            continue;
        }
        last = Some(i);
        r -= o.weight;
        if r < 0.0 {
            return Some(i);
        }
    }
    last // floating-point edge: the last live outcome
}

/// uniform over the pool; within a slot, over the cards not drawn yet (if any are left)
fn pick_card(pool: &[usize], used: &[usize], dice: &mut dyn Dice) -> usize {
    if used.is_empty() {
        return pool[dice.next_below(pool.len())];
    }
    let left: Vec<usize> = pool.iter().copied().filter(|c| !used.contains(c)).collect();
    if left.is_empty() {
        return pool[dice.next_below(pool.len())];
    }
    left[dice.next_below(left.len())]
}

/// the effect family a tier shows (Booster.Fx); a tier not listed is "holo"
pub fn tier_fx(tier: &str) -> &'static str {
    match tier {
        "common" | "uncommon" | "rare" => "plain",
        "rare-holo" | "promo" | "trainer-gallery-rare-holo" | "pikachu-rare" | "rare-holo-v" | "rare-holo-vmax" | "rare-holo-vstar" | "rare-holo-gx" | "rare-holo-ex"
        | "double-rare" | "rare-holo-lv-x" | "rare-prime" | "rare-break" | "legend" | "rare-holo-star" | "rare-prism-star" | "ace-spec-rare" | "futuristic-rare" => "holo",
        "rare-ultra" | "ultra-rare" | "illustration-rare" => "full-art",
        "special-illustration-rare" => "alt-art",
        "rare-rainbow" | "shiny-ultra-rare" => "rainbow",
        "rare-secret" | "hyper-rare" => "gold",
        "radiant-rare" | "amazing-rare" | "rare-shining" => "radiant",
        "rare-shiny" | "rare-shiny-gx" | "shiny-rare" => "shiny",
        _ => "holo",
    }
}

/// how big the reveal is for an effect family (Booster.Hit)
pub fn fx_hit(fx: &str) -> i64 {
    match fx {
        "reverse" => 1,
        "holo" => 2,
        "full-art" | "radiant" | "shiny" => 3,
        "alt-art" | "rainbow" => 4,
        "gold" => 5,
        _ => 0,
    }
}

#[derive(Clone, Debug)]
pub struct CardOut {
    pub card: usize,
    pub slot_id: String,
    pub outcome: String,
    pub finish: String,
    pub fx: String,
    pub hit: i64,
    pub shiny: bool,
    pub is_new: bool,
    pub one_in: f64,
    pub image: String,
    order: usize,
}

pub fn round_to(x: f64, digits: i32) -> f64 {
    let k = 10f64.powi(digits);
    (x * k).round() / k
}

/// one pack of set `s`: the roll, each card's shiny roll, effect and reveal size, NEW against `caught` (updated), in
/// reveal order, rarest last (Booster.Open: the roll, then one draw per card for its shiny chance)
pub fn open(m: &Model, s: usize, dice: &mut dyn Dice, caught: &mut HashSet<String>) -> Vec<CardOut> {
    let set = &m.sets[s];
    let picks = roll(&set.slots, dice);
    let mut outs = Vec::new();
    for (n, p) in picks.iter().enumerate() {
        let c = &m.cards[p.card];
        let oc = &set.slots[p.slot].outcomes[p.outcome];
        let r = dice.next_f64(); // always drawn
        let shiny = r < m.shiny_chance && !m.printed_shiny_tiers.contains(&c.tier) && c.shiny_art;
        let mut fx = if !oc.fx.is_empty() { oc.fx.clone() } else { tier_fx(&c.tier_id).to_string() };
        if p.finish != "normal" && fx == "plain" {
            fx = "reverse".into(); // a foil print of a non-foil card
        }
        let mut hit = fx_hit(&fx);
        if fx == "plain" && c.tier_id == "rare" {
            hit = 1; // the rare slot's floor still comes last
        }
        if shiny {
            hit = (hit + 1).min(5);
        }
        let prob = set.slots[p.slot].probability(p.outcome);
        let is_new = caught.insert(c.id.clone()); // a second copy in the same pack isn't new
        outs.push(CardOut {
            card: p.card,
            slot_id: set.slots[p.slot].id.clone(),
            outcome: oc.label.clone(),
            finish: p.finish.clone(),
            hit,
            shiny,
            is_new,
            one_in: if prob > 0.0 { round_to(1.0 / prob, 1) } else { 0.0 },
            image: format!("img/{}/{}/{}{}.png", m.pack, c.character, c.id, if shiny { "-shiny" } else { "" }),
            fx,
            order: n,
        });
    }
    outs.sort_by(|a, b| {
        let ka = a.hit as f64 + if a.shiny { 0.5 } else { 0.0 };
        let kb = b.hit as f64 + if b.shiny { 0.5 } else { 0.0 };
        ka.total_cmp(&kb).then(a.one_in.total_cmp(&b.one_in)).then(a.order.cmp(&b.order))
    });
    outs
}

impl CardOut {
    /// a card as `pokeshell pack open --json` reports it (pullId filled in when it is recorded)
    pub fn to_json(&self, m: &Model, pull_id: &str) -> Value {
        let c = &m.cards[self.card];
        json!({
            "id": c.id, "name": c.name, "number": c.number, "rarity": c.rarity, "tier": c.tier_id, "tierLabel": c.tier_label,
            "slot": self.slot_id, "outcome": self.outcome, "finish": self.finish, "fx": self.fx, "hit": self.hit, "shiny": self.shiny,
            "isNew": self.is_new, "oneIn": self.one_in, "character": c.character, "setName": c.set_name, "image": self.image,
            "pullId": pull_id, "card": c.id, "pull": pull_id, "png": null,
        })
    }
}

// ------------------------------------------------------------------ listings (pokeshell's JSON shapes)
fn opt_num(x: f64) -> Value {
    if x > 0.0 { json!(x) } else { Value::Null }
}

/// `pokeshell pack odds random --json`
pub fn odds_random(m: &Model) -> Value {
    let ch = m.set_chances();
    let sets: Vec<Value> = m.sets.iter().enumerate().map(|(i, s)| json!({
        "set": s.id, "name": s.name, "price": opt_num(s.price), "priceSource": s.raw.get("priceSource").cloned().unwrap_or(Value::Null),
        "openable": s.openable(), "chance": round_to(ch[i], 6), "oneIn": if ch[i] > 0.0 { json!(round_to(1.0 / ch[i], 1)) } else { Value::Null },
    })).collect();
    json!({"set": "random", "priceExponent": m.price_exponent, "sets": sets})
}

/// `pokeshell pack odds <set> --json`
pub fn odds_set(m: &Model, s: usize) -> Value {
    let set = &m.sets[s];
    let mut rows = Vec::new();
    for sl in &set.slots {
        for (o, oc) in sl.outcomes.iter().enumerate() {
            let pr = sl.probability(o);
            rows.push(json!({
                "slot": sl.id, "count": sl.count, "outcome": oc.label, "rate": oc.rate, "printed": oc.printed, "served": oc.pool.len(),
                "base": oc.base, "probability": round_to(pr, 6), "oneIn": if pr > 0.0 { json!(round_to(1.0 / pr, 1)) } else { Value::Null },
            }));
        }
    }
    json!({"set": set.id, "name": set.name, "cards": set.cards.len(), "outcomes": rows})
}

/// `pokeshell pack sets --json` (Get-PokeshellBoosterSets): each set's served cards, pack size, price, chance, the
/// expected cards of each tier in one pack, its art and hero image
pub fn sets_listing(m: &Model, tokens: i64) -> Value {
    let ch = m.set_chances();
    let mut out = Vec::new();
    for (i, s) in m.sets.iter().enumerate() {
        let mut odds: Vec<(String, f64)> = Vec::new();
        let mut size = 0;
        if s.openable() {
            for sl in &s.slots {
                let mut live = false;
                for (o, oc) in sl.outcomes.iter().enumerate() {
                    let pr = sl.probability(o);
                    if pr <= 0.0 {
                        continue;
                    }
                    live = true;
                    for &ci in &oc.pool {
                        let t = &m.cards[ci].tier_id;
                        let add = sl.count as f64 * pr / oc.pool.len() as f64;
                        match odds.iter_mut().find(|(k, _)| k == t) {
                            Some(e) => e.1 += add,
                            None => odds.push((t.clone(), add)),
                        }
                    }
                }
                if live {
                    size += sl.count;
                }
            }
        }
        let raw = &s.raw;
        let hero = raw.get("art").and_then(|a| a.get("hero")).and_then(|h| h.as_str()).and_then(|h| m.characters.get(h).map(|c| format!("img/{}/{c}/{h}.png", m.pack)));
        let slots: Vec<Value> = s.slots.iter().map(|sl| json!({"id": sl.id, "count": sl.count, "finish": sl.finish})).collect();
        out.push(json!({
            "id": s.id, "name": s.name, "series": raw.get("series").cloned().unwrap_or(Value::Null), "released": raw.get("released").cloned().unwrap_or(Value::Null),
            "cardSets": strs(raw.get("cardSets")), "cards": s.cards.len(), "inPack": s.in_pack, "printed": num(raw.get("printed")).unwrap_or(0.0) as i64,
            "packSize": size, "realPackSize": num(raw.get("realPackSize")).unwrap_or(0.0) as i64, "openable": s.openable(),
            "price": opt_num(s.price), "priceSource": raw.get("priceSource").cloned().unwrap_or(Value::Null),
            "chance": round_to(ch[i], 6), "oneIn": if ch[i] > 0.0 { json!(round_to(1.0 / ch[i], 1)) } else { Value::Null },
            "odds": odds.iter().map(|(t, w)| json!({"tier": t, "weight": round_to(*w, 5)})).collect::<Vec<_>>(),
            "art": raw.get("art").cloned().unwrap_or(Value::Null), "hero": hero, "slots": slots,
        }));
    }
    json!({"pack": m.pack, "tokens": tokens, "priceExponent": m.price_exponent, "sets": out})
}

#[cfg(test)]
mod tests {
    use super::*;

    /// a tiny pack: 4 commons (one unserved), 2 rares, 1 holo of set "t1", and a set with no price
    fn model() -> Model {
        let pack = json!({"id": "pokemon", "shiny_chance": 0.25,
            "tiers": [{"id": "common", "label": "common"}, {"id": "rare", "label": "rare"}, {"id": "rare-holo", "label": "holo"}, {"id": "rare-shiny", "label": "shiny", "shiny": "printed"}],
            "cards": {
                "t1-1": {"character": "a", "tier": "common", "name": "A", "number": "1/9", "rarity": "Common", "set": "T"},
                "t1-2": {"character": "b", "tier": "common", "name": "B", "number": "2/9", "rarity": "Common", "set": "T"},
                "t1-3": {"character": "c", "tier": "common", "name": "C", "number": "3/9", "rarity": "Common", "set": "T"},
                "t1-4": {"character": "d", "tier": "common", "name": "D", "number": "4/9", "rarity": "Common", "set": "T"},
                "t1-5": {"character": "e", "tier": "rare", "name": "E", "number": "5/9", "rarity": "Rare", "set": "T"},
                "t1-6": {"character": "f", "tier": "rare", "name": "F", "number": "6/9", "rarity": "Rare", "set": "T"},
                "t1-7": {"character": "g", "tier": "rare-holo", "name": "G", "number": "7/9", "rarity": "Rare Holo", "set": "T"},
                "t2-1": {"character": "a", "tier": "common", "name": "A", "number": "1/1", "rarity": "Common", "set": "U"}
            }});
        let boosters = json!({"priceExponent": 0.5, "sets": [
            {"id": "t1", "name": "Test One", "aliases": ["one"], "price": 4, "cardSets": ["t1"], "art": {"hero": "t1-4"}, "slots": [
                {"id": "common", "count": 2, "pick": [{"label": "common", "rarity": ["Common"], "base": true, "printed": 4}]},
                {"id": "rare", "pick": [
                    {"label": "rare", "rarity": ["Rare"], "base": true, "rate": 0.5, "printed": 2},
                    {"label": "holo", "rarity": ["Rare Holo"], "rate": 0.3, "printed": 2},
                    {"label": "trainer", "rarity": ["Rare"], "supertype": "Tra", "rate": 0.2, "printed": 3}]}]},
            {"id": "t2", "name": "Test Two", "price": 16, "cardSets": ["t2"], "slots": [{"id": "common", "pick": [{"label": "common", "rarity": ["Common"], "base": true}]}]},
            {"id": "t3", "name": "Test Three", "cardSets": ["t3"], "slots": []}]});
        let built: HashSet<String> = ["t1-1", "t1-2", "t1-3", "t1-5", "t1-6", "t1-7", "t2-1"].iter().map(|s| s.to_string()).collect();
        let shiny: HashSet<String> = ["t1-1", "t1-7"].iter().map(|s| s.to_string()).collect();
        Model::load(&pack, &boosters, &built, &shiny).unwrap()
    }

    #[test]
    fn weights_give_the_unserved_share_to_the_base() {
        let m = model();
        let rare = &m.sets[0].slots[1];
        // holo: 1 of 2 printed served -> 0.15; the trainer outcome serves none -> 0; the base takes 0.5 + 0.15 + 0.2
        assert!((rare.outcomes[1].weight - 0.15).abs() < 1e-12);
        assert_eq!(rare.outcomes[2].weight, 0.0);
        assert!((rare.outcomes[0].weight - 0.85).abs() < 1e-12);
        assert!((rare.probability(0) - 0.85).abs() < 1e-12 && (rare.probability(1) - 0.15).abs() < 1e-12 && rare.probability(2) == 0.0);
        // the common base: 3 of 4 served, weight stays its rate (1)
        assert_eq!(m.sets[0].slots[0].outcomes[0].pool.len(), 3);
        assert_eq!(m.sets[0].cards.len(), 6);
        assert_eq!(m.sets[0].in_pack, 7);
    }

    #[test]
    fn set_chances_by_price() {
        let m = model();
        let ch = m.set_chances();
        // 4^-0.5 = 0.5, 16^-0.5 = 0.25 -> 2/3, 1/3; t3 has no price and no cards
        assert!((ch[0] - 2.0 / 3.0).abs() < 1e-12 && (ch[1] - 1.0 / 3.0).abs() < 1e-12 && ch[2] == 0.0);
        let mut d = SeededDice(7);
        let n = 30000;
        let a = (0..n).filter(|_| m.pick_set(&mut d) == Some(0)).count() as f64 / n as f64;
        assert!((a - 2.0 / 3.0).abs() < 0.015, "{a}");
        assert_eq!(m.find_set("ONE"), Ok(0));
        assert_eq!(m.find_set("two"), Ok(1));
        assert!(m.find_set("test").is_err());
        let r = odds_random(&m);
        assert_eq!(r["sets"][2]["oneIn"], Value::Null);
        assert_eq!(r["sets"][1]["oneIn"], 3.0);
    }

    #[test]
    fn packs_are_distinct_within_a_slot_and_sorted_rarest_last() {
        let m = model();
        let mut d = SeededDice(1);
        let (mut holo, mut shiny, n) = (0, 0, 20000);
        for _ in 0..n {
            let mut caught = HashSet::new();
            let p = open(&m, 0, &mut d, &mut caught);
            assert_eq!(p.len(), 3);
            let commons: Vec<_> = p.iter().filter(|c| c.slot_id == "common").map(|c| c.card).collect();
            assert_eq!(commons.len(), 2);
            assert_ne!(commons[0], commons[1]);
            assert!(p.windows(2).all(|w| w[0].hit as f64 + if w[0].shiny { 0.5 } else { 0.0 } <= w[1].hit as f64 + if w[1].shiny { 0.5 } else { 0.0 }));
            assert!(p.iter().all(|c| c.is_new));
            let last = p.last().unwrap();
            if m.cards[last.card].id == "t1-7" {
                holo += 1;
                assert!(last.fx == "holo" && (last.hit == 2 || (last.shiny && last.hit == 3)));
            }
            shiny += p.iter().filter(|c| c.shiny).count();
            assert!(p.iter().all(|c| !c.shiny || m.cards[c.card].shiny_art));
        }
        let h = holo as f64 / n as f64;
        assert!((h - 0.15).abs() < 0.01, "holo share {h}");
        assert!(shiny > 0);
    }

    #[test]
    fn listing_shape() {
        let m = model();
        let l = sets_listing(&m, 3);
        let s = &l["sets"][0];
        assert_eq!(s["packSize"], 3);
        assert_eq!(s["hero"], "img/pokemon/d/t1-4.png");
        assert_eq!(l["sets"][2]["openable"], false);
        let total: f64 = s["odds"].as_array().unwrap().iter().map(|o| o["weight"].as_f64().unwrap()).sum();
        assert!((total - 3.0).abs() < 1e-4);
        assert_eq!(new_ulid().len(), 26);
    }
}
