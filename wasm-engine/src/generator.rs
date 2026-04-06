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

// Vocabulary pools. All data is synthetic — no real names.
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
        "tech-review.example",
        "dev-notes.example",
        "open-source.example",
        "systems-blog.example",
        "compiler-weekly.example",
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
        "daily-herald.example",
        "evening-post.example",
        "city-tribune.example",
        "global-dispatch.example",
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
        "marketplace.example",
        "depot-online.example",
        "storefront.example",
        "catalog.example",
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
        "arxiv-mirror.example",
        "journal-archive.example",
        "university-press.example",
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
        "game-guide.example",
        "playcritic.example",
        "speedrun.example",
        "mod-forum.example",
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
        "kitchen-notes.example",
        "recipe-archive.example",
        "home-cook.example",
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
        "travelogue.example",
        "guidebook.example",
        "backpacker.example",
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
        "personal-finance.example",
        "money-weekly.example",
        "investing-101.example",
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

    for i in 0..entry_count {
        let host = rng.pick(vocab.hosts);
        let segment = rng.pick(vocab.path_segments);
        let slug = topic
            .to_lowercase()
            .replace(' ', "-")
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-')
            .collect::<String>();
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
    fn test_urls_are_under_example_hosts() {
        let sessions = generate(&tech_profile(1), Intensity::Low, 10);
        for s in &sessions {
            for e in &s.entries {
                assert!(
                    e.url.contains(".example"),
                    "URL not under example.: {}",
                    e.url
                );
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
}
