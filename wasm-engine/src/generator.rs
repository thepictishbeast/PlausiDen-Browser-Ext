//! Session generation — turn a profile + intensity + seed into a
//! batch of plausible browsing sessions.
//!
//! Each session is a small cluster of entries that look like a user
//! reading a topic: landing page, a few deeper links, maybe a search
//! result, and an exit. All URLs and titles come from fixed vocabulary
//! pools per flavour. No real user data is used.

use crate::profile::{BrowsingProfile, Flavour, Intensity};
use crate::rng::Pcg;
use serde::{Deserialize, Serialize};

/// One browsing entry: a single URL the user visited.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowsingEntry {
    pub url: String,
    pub title: String,
    /// Seconds since an arbitrary epoch chosen by the generator.
    /// The extension rebases these onto a real wall clock when it
    /// writes them to history.
    pub dwell_seconds: u32,
    pub scroll_depth_percent: u8,
}

/// A coherent cluster of entries — one "session" around a single
/// topic. The extension is free to distribute these across the day
/// in whatever pattern it prefers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowsingSession {
    pub topic: String,
    pub entries: Vec<BrowsingEntry>,
    /// Total session duration in seconds.
    pub duration_seconds: u32,
}

struct FlavourVocab {
    topics: &'static [&'static str],
    hosts: &'static [&'static str],
    path_segments: &'static [&'static str],
}

impl FlavourVocab {
    fn for_flavour(f: Flavour) -> &'static FlavourVocab {
        match f {
            Flavour::Tech => &TECH,
            Flavour::News => &NEWS,
            Flavour::Shopping => &SHOPPING,
            Flavour::Academic => &ACADEMIC,
            Flavour::Gaming => &GAMING,
            Flavour::Cooking => &COOKING,
            Flavour::Travel => &TRAVEL,
            Flavour::Finance => &FINANCE,
        }
    }
}

// Vocabulary pools. Hosts are real public domains that the generator's
// target threat model (browser-history forensic inspection) expects to
// see in an organic user's history. Synthetic `.example` / `.invalid`
// / `.test` TLDs would be instant fingerprints — a user's real history
// never contains those, so their presence signals pollution. The
// `audit leak` check in `scripts/audit/run.sh` enforces this invariant;
// `test_urls_never_contain_synthetic_tlds` below is the in-code
// regression guard.
//
// SECURITY: changing a host here must leave the set consisting only of
// real, resolvable, publicly-known sites. Do NOT add `.example`,
// `.test`, `.invalid`, or `.localhost` — those never appear in organic
// history. Fake-real-looking names (`dev-notes.com`) are also bad:
// either they resolve to someone else's site (ethical issue, slight
// legal exposure) or they don't (user's DNS cache reveals a fake
// lookup attempt).

static TECH: FlavourVocab = FlavourVocab {
    topics: &[
        "Rust memory safety",
        "WebAssembly module layout",
        "Linux kernel scheduling",
        "TLS 1.3 handshake",
        "Container runtime security",
        "eBPF tracepoints",
        "Zero-knowledge proofs",
    ],
    hosts: &[
        "arstechnica.com",
        "theverge.com",
        "github.com",
        "developer.mozilla.org",
        "stackoverflow.com",
        "news.ycombinator.com",
    ],
    path_segments: &[
        "articles", "docs", "posts", "2026", "guide", "reference", "tutorial",
    ],
};

static NEWS: FlavourVocab = FlavourVocab {
    topics: &[
        "weather forecast",
        "local election coverage",
        "monetary policy analysis",
        "climate policy update",
        "sports league standings",
    ],
    hosts: &[
        "reuters.com",
        "apnews.com",
        "bbc.com",
        "npr.org",
        "theguardian.com",
    ],
    path_segments: &["news", "world", "local", "opinion", "politics", "latest"],
};

static SHOPPING: FlavourVocab = FlavourVocab {
    topics: &[
        "noise cancelling headphones",
        "ergonomic desk chair",
        "kitchen knife set",
        "running shoes",
        "portable speaker",
        "wool sweater",
    ],
    hosts: &[
        "amazon.com",
        "ebay.com",
        "target.com",
        "walmart.com",
        "bestbuy.com",
    ],
    path_segments: &["product", "category", "review", "deals", "bundle"],
};

static ACADEMIC: FlavourVocab = FlavourVocab {
    topics: &[
        "distributed consensus proofs",
        "protein folding simulations",
        "monetary theory history",
        "linguistic morphology",
        "graph theory survey",
    ],
    hosts: &[
        "arxiv.org",
        "scholar.google.com",
        "jstor.org",
        "pubmed.ncbi.nlm.nih.gov",
        "semanticscholar.org",
    ],
    path_segments: &["paper", "vol", "issue", "abstract", "bibliography"],
};

static GAMING: FlavourVocab = FlavourVocab {
    topics: &[
        "indie roguelike review",
        "strategy game patch notes",
        "speedrun leaderboard",
        "retro console emulation",
    ],
    hosts: &[
        "ign.com",
        "pcgamer.com",
        "gamespot.com",
        "polygon.com",
        "rockpapershotgun.com",
    ],
    path_segments: &["review", "guide", "patch", "forum", "leaderboard"],
};

static COOKING: FlavourVocab = FlavourVocab {
    topics: &[
        "sourdough hydration",
        "knife sharpening guide",
        "braising technique",
        "pasta dough ratio",
    ],
    hosts: &[
        "allrecipes.com",
        "food.com",
        "seriouseats.com",
        "bonappetit.com",
        "kingarthurbaking.com",
    ],
    path_segments: &["recipe", "technique", "ingredients", "tips"],
};

static TRAVEL: FlavourVocab = FlavourVocab {
    topics: &[
        "train routes in the Alps",
        "coastal walking trails",
        "off-season city guide",
        "visa-on-arrival list",
    ],
    hosts: &[
        "tripadvisor.com",
        "booking.com",
        "lonelyplanet.com",
        "seat61.com",
    ],
    path_segments: &["guide", "itinerary", "tips", "stories"],
};

static FINANCE: FlavourVocab = FlavourVocab {
    topics: &[
        "index fund basics",
        "credit score factors",
        "mortgage amortization",
        "tax-loss harvesting",
    ],
    hosts: &[
        "investopedia.com",
        "bogleheads.org",
        "marketwatch.com",
        "finance.yahoo.com",
    ],
    path_segments: &["article", "calc", "guide", "review"],
};

/// Generate `count` sessions for the given profile and intensity.
///
/// Deterministic: same (seed, flavour, intensity, count) always
/// produces the same output.
pub fn generate(
    profile: &BrowsingProfile,
    intensity: Intensity,
    count: u32,
) -> Vec<BrowsingSession> {
    let mut rng = Pcg::new(profile.seed);
    let vocab = FlavourVocab::for_flavour(profile.flavour);
    let target_entries = intensity.entries_per_session();
    let mut sessions = Vec::with_capacity(count as usize);

    for _ in 0..count {
        let mut session_rng = rng.split();
        sessions.push(generate_session(&mut session_rng, vocab, target_entries));
    }

    sessions
}

/// Convert a topic string (e.g. "Rust memory safety") to a URL-safe slug
/// ("rust-memory-safety") in a single pass with a pre-sized allocation.
///
/// Replaces the previous 4-allocation pipeline (to_lowercase().replace().
/// chars().filter().collect()). For ASCII topics — which is all of our
/// current vocab — this produces identical output.
fn slugify(topic: &str) -> String {
    let mut out = String::with_capacity(topic.len());
    for c in topic.chars() {
        if c == ' ' {
            out.push('-');
        } else if c.is_alphanumeric() || c == '-' {
            // Lowercase in the same pass. ASCII fast path; non-ASCII falls
            // through the iterator for correctness.
            for lc in c.to_lowercase() {
                out.push(lc);
            }
        }
        // drop everything else (punctuation, etc.)
    }
    out
}

fn generate_session(
    rng: &mut Pcg,
    vocab: &'static FlavourVocab,
    target_entries: u32,
) -> BrowsingSession {
    let topic = rng.pick(vocab.topics).to_string();
    // Vary the entry count a little around the target.
    let jitter = rng.gen_range(5) as i32 - 2; // -2..=2
    let entry_count = ((target_entries as i32) + jitter).max(1) as u32;

    let mut entries = Vec::with_capacity(entry_count as usize);
    let mut total_dwell = 0u32;

    // Why: the slug is derived from the session's topic, which is constant
    // across entries within a single session. Previously this was
    // recomputed per entry with four allocations (to_lowercase, replace,
    // chars().filter().collect()). Hoist + single-pass build drops it to
    // one allocation per session. Net: N→1 for an N-entry session.
    let slug = slugify(&topic);

    for i in 0..entry_count {
        let host = rng.pick(vocab.hosts);
        let segment = rng.pick(vocab.path_segments);
        let url = format!("https://{}/{}/{}-{}", host, segment, slug, i);
        let title = format!("{} — part {} — {}", topic, i + 1, host);
        let dwell = 15 + rng.gen_range(240); // 15..255 seconds
        let scroll = (20 + rng.gen_range(80)) as u8;
        total_dwell = total_dwell.saturating_add(dwell);
        entries.push(BrowsingEntry {
            url,
            title,
            dwell_seconds: dwell,
            scroll_depth_percent: scroll.min(100),
        });
    }

    BrowsingSession {
        topic,
        entries,
        duration_seconds: total_dwell,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profile::{BrowsingProfile, Flavour, Intensity};

    fn tech_profile(seed: u64) -> BrowsingProfile {
        BrowsingProfile {
            seed,
            flavour: Flavour::Tech,
            user_agent: None,
            timezone: None,
        }
    }

    #[test]
    fn test_generate_empty_count() {
        let sessions = generate(&tech_profile(1), Intensity::Low, 0);
        assert!(sessions.is_empty());
    }

    #[test]
    fn test_generate_has_expected_count() {
        let sessions = generate(&tech_profile(1), Intensity::Low, 5);
        assert_eq!(sessions.len(), 5);
    }

    #[test]
    fn test_sessions_have_non_empty_entries() {
        let sessions = generate(&tech_profile(1), Intensity::Medium, 10);
        for s in &sessions {
            assert!(!s.entries.is_empty());
            assert!(!s.topic.is_empty());
        }
    }

    #[test]
    fn test_urls_never_contain_synthetic_tlds() {
        // Regression guard for the class of leak that originally prompted
        // this test's inversion (task #11 fix, 2026-04-17): any .example /
        // .invalid / .test / .localhost in generated URLs is a fingerprint
        // that destroys plausible deniability. Run across every flavour +
        // intensity + a range of seeds so a single bad vocab entry is
        // caught regardless of RNG path.
        for flavour in Flavour::ALL {
            for intensity in [Intensity::Low, Intensity::Medium, Intensity::High, Intensity::Max] {
                for seed in 0..4u64 {
                    let profile = BrowsingProfile {
                        seed,
                        flavour: *flavour,
                        user_agent: None,
                        timezone: None,
                    };
                    let sessions = generate(&profile, intensity, 5);
                    for s in &sessions {
                        for e in &s.entries {
                            for bad in [".example", ".invalid", ".test", ".localhost"] {
                                assert!(
                                    !e.url.contains(bad),
                                    "URL contains synthetic TLD {bad}: {} (flavour={flavour:?}, intensity={intensity:?}, seed={seed})",
                                    e.url,
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn test_scroll_depth_is_bounded() {
        let sessions = generate(&tech_profile(42), Intensity::Max, 20);
        for s in &sessions {
            for e in &s.entries {
                assert!(e.scroll_depth_percent <= 100);
            }
        }
    }

    #[test]
    fn test_duration_is_sum_of_dwell() {
        let sessions = generate(&tech_profile(99), Intensity::Medium, 5);
        for s in &sessions {
            let sum: u32 = s.entries.iter().map(|e| e.dwell_seconds).sum();
            assert_eq!(s.duration_seconds, sum);
        }
    }

    #[test]
    fn test_determinism_across_runs() {
        let a = generate(&tech_profile(777), Intensity::Medium, 10);
        let b = generate(&tech_profile(777), Intensity::Medium, 10);
        let a_json = serde_json::to_string(&a).unwrap();
        let b_json = serde_json::to_string(&b).unwrap();
        assert_eq!(a_json, b_json);
    }

    #[test]
    fn test_different_seeds_differ() {
        let a = generate(&tech_profile(1), Intensity::Medium, 10);
        let b = generate(&tech_profile(2), Intensity::Medium, 10);
        let a_json = serde_json::to_string(&a).unwrap();
        let b_json = serde_json::to_string(&b).unwrap();
        assert_ne!(a_json, b_json);
    }

    #[test]
    fn test_different_flavours_pick_different_topics() {
        let tech = generate(
            &BrowsingProfile {
                seed: 1,
                flavour: Flavour::Tech,
                user_agent: None,
                timezone: None,
            },
            Intensity::Low,
            5,
        );
        let cooking = generate(
            &BrowsingProfile {
                seed: 1,
                flavour: Flavour::Cooking,
                user_agent: None,
                timezone: None,
            },
            Intensity::Low,
            5,
        );
        assert_ne!(
            tech[0].topic, cooking[0].topic,
            "tech and cooking topics collided"
        );
    }

    #[test]
    fn test_all_flavours_produce_something() {
        for f in Flavour::ALL {
            let sessions = generate(
                &BrowsingProfile {
                    seed: 1,
                    flavour: *f,
                    user_agent: None,
                    timezone: None,
                },
                Intensity::Low,
                3,
            );
            assert_eq!(sessions.len(), 3);
            assert!(!sessions[0].topic.is_empty());
        }
    }

    #[test]
    fn test_session_count_not_too_few_entries() {
        let sessions = generate(&tech_profile(1), Intensity::High, 5);
        for s in &sessions {
            // High intensity targets 15 with ±2 jitter → 13..17.
            assert!(s.entries.len() >= 13);
            assert!(s.entries.len() <= 17);
        }
    }

    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Hello World"), "hello-world");
        assert_eq!(slugify("Rust memory safety"), "rust-memory-safety");
        assert_eq!(slugify("WebAssembly module layout"), "webassembly-module-layout");
    }

    #[test]
    fn slugify_drops_punctuation() {
        assert_eq!(slugify("What's new?"), "whats-new");
        assert_eq!(slugify("Step 1: begin"), "step-1-begin");
        assert_eq!(slugify("Rust (the language)"), "rust-the-language");
    }

    #[test]
    fn slugify_preserves_existing_hyphens() {
        assert_eq!(slugify("sourdough-hydration"), "sourdough-hydration");
        assert_eq!(slugify("TLS 1.3 handshake"), "tls-13-handshake");
    }

    #[test]
    fn slugify_is_idempotent() {
        let s = slugify("Complex Topic Title");
        assert_eq!(s, slugify(&s));
    }

    #[test]
    fn slugify_output_matches_prior_pipeline() {
        // Regression lock: the old 4-allocation pipeline was
        //   topic.to_lowercase().replace(' ', "-").chars()
        //        .filter(|c| c.is_alphanumeric() || *c == '-').collect::<String>()
        // The new slugify() must produce byte-identical output for every
        // vocab topic. Tolerates zero drift — a change here requires
        // regenerating the determinism fixtures.
        for flavour in Flavour::ALL {
            let vocab = FlavourVocab::for_flavour(*flavour);
            for topic in vocab.topics {
                let old: String = topic
                    .to_lowercase()
                    .replace(' ', "-")
                    .chars()
                    .filter(|c| c.is_alphanumeric() || *c == '-')
                    .collect();
                let new = slugify(topic);
                assert_eq!(new, old, "slugify drift on topic {topic:?}");
            }
        }
    }

    #[test]
    fn slugify_empty_is_empty() {
        assert_eq!(slugify(""), "");
    }

    #[test]
    fn test_generated_urls_always_use_https() {
        // Why: MV3 service workers cannot fetch mixed-content, and Chrome
        // strips `http://` URLs from `chrome.history.addUrl` calls in many
        // contexts. A generator that emits `http://` URLs produces a
        // forensically *less* plausible history (modern browsing is
        // overwhelmingly HTTPS) AND silently drops entries. Pin the
        // invariant.
        let mut combos = Vec::new();
        for flavour in Flavour::ALL {
            for intensity in [
                Intensity::Low,
                Intensity::Medium,
                Intensity::High,
                Intensity::Max,
            ] {
                for seed in 0..8u64 {
                    combos.push((*flavour, intensity, seed));
                }
            }
        }
        for (flavour, intensity, seed) in combos {
            let profile = BrowsingProfile {
                seed,
                flavour,
                user_agent: None,
                timezone: None,
            };
            let sessions = generate(&profile, intensity, 3);
            for s in &sessions {
                for e in &s.entries {
                    assert!(
                        e.url.starts_with("https://"),
                        "expected https:// URL; got {:?} (flavour={:?}, intensity={:?}, seed={seed})",
                        e.url, flavour, intensity,
                    );
                }
            }
        }
    }

    #[test]
    fn test_urls_have_no_whitespace_or_control_chars() {
        // Why: URLs with embedded whitespace/control chars silently fail
        // in `chrome.history.addUrl` and can cause inconsistent round-trips
        // through `URL` parsers. Whatever the source vocab, generated URLs
        // must be clean.
        let sessions = generate(&tech_profile(42), Intensity::Max, 20);
        for s in &sessions {
            for e in &s.entries {
                for c in e.url.chars() {
                    assert!(
                        !c.is_whitespace() && !c.is_control(),
                        "URL contains whitespace/control char: {:?}",
                        e.url,
                    );
                }
            }
        }
    }
}
