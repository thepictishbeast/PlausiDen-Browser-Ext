//! Browsing profile schema.
//!
//! A profile is a small shape-only hint the extension passes to the
//! generator so the output feels plausible for a particular flavour
//! of user. No PII, no tracking, no network calls.

use serde::{Deserialize, Serialize};

/// Flavour of browsing history the generator should emit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Flavour {
    Tech,
    News,
    Shopping,
    Academic,
    Gaming,
    Cooking,
    Travel,
    Finance,
}

impl Flavour {
    pub const ALL: &'static [Flavour] = &[
        Flavour::Tech,
        Flavour::News,
        Flavour::Shopping,
        Flavour::Academic,
        Flavour::Gaming,
        Flavour::Cooking,
        Flavour::Travel,
        Flavour::Finance,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            Flavour::Tech => "Tech",
            Flavour::News => "News",
            Flavour::Shopping => "Shopping",
            Flavour::Academic => "Academic",
            Flavour::Gaming => "Gaming",
            Flavour::Cooking => "Cooking",
            Flavour::Travel => "Travel",
            Flavour::Finance => "Finance",
        }
    }
}

/// How much content to generate per session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Intensity {
    Low,
    Medium,
    High,
    Max,
}

impl Intensity {
    /// Target number of entries per session for this intensity.
    pub fn entries_per_session(&self) -> u32 {
        match self {
            Intensity::Low => 3,
            Intensity::Medium => 7,
            Intensity::High => 15,
            Intensity::Max => 35,
        }
    }
}

/// Caller-supplied browsing profile. The seed drives deterministic
/// generation; the flavour picks vocabulary pools; user_agent hints
/// the string the extension will stamp on the sessions (generator
/// itself doesn't emit headers, it just attaches the string so the
/// extension can apply it consistently).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowsingProfile {
    /// Deterministic seed. Pick any u64.
    pub seed: u64,
    /// Content flavour pool.
    pub flavour: Flavour,
    /// Optional user-agent string the extension should apply to the
    /// synthetic sessions. Purely informational for the generator.
    #[serde(default)]
    pub user_agent: Option<String>,
    /// Optional timezone hint in IANA form (e.g. "America/Los_Angeles").
    /// The generator uses it only to bias time-of-day distributions.
    #[serde(default)]
    pub timezone: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flavour_all_has_unique_strings() {
        let strs: std::collections::HashSet<_> =
            Flavour::ALL.iter().map(|f| f.as_str()).collect();
        assert_eq!(strs.len(), Flavour::ALL.len());
    }

    #[test]
    fn test_flavour_serde_roundtrip() {
        for f in Flavour::ALL {
            let json = serde_json::to_string(f).unwrap();
            let back: Flavour = serde_json::from_str(&json).unwrap();
            assert_eq!(&back, f);
        }
    }

    #[test]
    fn test_intensity_entries_increasing() {
        assert!(
            Intensity::Low.entries_per_session()
                < Intensity::Medium.entries_per_session()
        );
        assert!(
            Intensity::Medium.entries_per_session()
                < Intensity::High.entries_per_session()
        );
        assert!(
            Intensity::High.entries_per_session() < Intensity::Max.entries_per_session()
        );
    }

    #[test]
    fn test_profile_minimal_json() {
        let json = r#"{"seed":7,"flavour":"Tech"}"#;
        let p: BrowsingProfile = serde_json::from_str(json).unwrap();
        assert_eq!(p.seed, 7);
        assert_eq!(p.flavour, Flavour::Tech);
        assert!(p.user_agent.is_none());
    }

    #[test]
    fn test_profile_full_json() {
        let json = r#"{
            "seed": 123,
            "flavour": "News",
            "user_agent": "Mozilla/5.0",
            "timezone": "Europe/Berlin"
        }"#;
        let p: BrowsingProfile = serde_json::from_str(json).unwrap();
        assert_eq!(p.flavour, Flavour::News);
        assert_eq!(p.user_agent.as_deref(), Some("Mozilla/5.0"));
    }
}
