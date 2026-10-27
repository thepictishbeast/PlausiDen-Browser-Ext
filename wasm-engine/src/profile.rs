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
    /// Deterministic seed, 64 bits.
    ///
    /// ⚠ **64 bits is not enough to keep the decoy set secret.** The engine's
    /// design keeps the seed and discards the decoy list, so an adversary who
    /// recovers the seed can enumerate every decoy and separate injected
    /// history from real history exactly. 2^64 is brute-forceable by a
    /// resourceful adversary, and trivially so if the seed came from a clock
    /// or a counter.
    ///
    /// Retained for compatibility and for reproducible tests. Production
    /// callers should set [`Self::seed_hex`] instead, which takes precedence.
    pub seed: u64,
    /// Deterministic seed, 256 bits, as 64 lowercase hex characters.
    ///
    /// This is the field to use. Fill it from `crypto.getRandomValues` on a
    /// 32-byte buffer. When present and well-formed it overrides
    /// [`Self::seed`]; a malformed value is an error rather than a silent
    /// fallback, because falling back would quietly restore the 64-bit
    /// weakness the caller was trying to avoid.
    #[serde(default)]
    pub seed_hex: Option<String>,
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

impl BrowsingProfile {
    /// The seed actually used, preferring the 256-bit field.
    ///
    /// `Err` on a malformed `seed_hex` — deliberately not a fallback to
    /// `seed`, since a typo in the strong field would otherwise downgrade the
    /// caller to 64 bits without telling them.
    pub fn resolve_seed(&self) -> Result<SeedMaterial, String> {
        match self.seed_hex.as_deref() {
            None => Ok(SeedMaterial::Narrow64(self.seed)),
            Some(h) => {
                if h.len() != 64 {
                    return Err(format!(
                        "seed_hex must be exactly 64 hex characters (32 bytes); got {}",
                        h.len()
                    ));
                }
                let mut out = [0u8; 32];
                for (i, chunk) in h.as_bytes().chunks(2).enumerate() {
                    let hi = hex_nibble(chunk[0])
                        .ok_or_else(|| "seed_hex contains a non-hex character".to_string())?;
                    let lo = hex_nibble(chunk[1])
                        .ok_or_else(|| "seed_hex contains a non-hex character".to_string())?;
                    out[i] = (hi << 4) | lo;
                }
                Ok(SeedMaterial::Full256(out))
            }
        }
    }
}

/// Which seed the caller supplied, so the weak path stays visible in the
/// types rather than being an undocumented property of a `u64`.
#[derive(Debug, Clone, Copy)]
pub enum SeedMaterial {
    /// 32 bytes of caller entropy. The intended path.
    Full256([u8; 32]),
    /// 64 bits, widened. Brute-forceable; see [`BrowsingProfile::seed`].
    Narrow64(u64),
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_hex_takes_precedence_over_narrow_seed() {
        let json = r#"{"seed":7,"flavour":"Tech","seed_hex":"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"}"#;
        let p: BrowsingProfile = serde_json::from_str(json).expect("parses");
        match p.resolve_seed().expect("resolves") {
            SeedMaterial::Full256(s) => {
                assert_eq!(s[0], 0x00);
                assert_eq!(s[1], 0x11);
                assert_eq!(s[31], 0xff);
            }
            SeedMaterial::Narrow64(_) => panic!("seed_hex must win over seed"),
        }
    }

    #[test]
    fn absent_seed_hex_falls_back_to_narrow() {
        let json = r#"{"seed":7,"flavour":"Tech"}"#;
        let p: BrowsingProfile = serde_json::from_str(json).expect("parses");
        assert!(matches!(p.resolve_seed(), Ok(SeedMaterial::Narrow64(7))));
    }

    /// A malformed strong seed must be an ERROR, not a silent downgrade to the
    /// 64-bit path. A typo must not cost the caller the property.
    #[test]
    fn malformed_seed_hex_is_an_error_not_a_downgrade() {
        for bad in ["abc", "zz112233445566778899aabbccddeeff00112233445566778899aabbccddeeff", ""] {
            let p = BrowsingProfile {
                seed: 7,
                seed_hex: Some(bad.to_string()),
                flavour: Flavour::Tech,
                user_agent: None,
                timezone: None,
            };
            assert!(p.resolve_seed().is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn seed_hex_accepts_uppercase() {
        let p = BrowsingProfile {
            seed: 0,
            seed_hex: Some("AB".repeat(32)),
            flavour: Flavour::Tech,
            user_agent: None,
            timezone: None,
        };
        match p.resolve_seed().expect("resolves") {
            SeedMaterial::Full256(s) => assert!(s.iter().all(|b| *b == 0xAB)),
            SeedMaterial::Narrow64(_) => panic!("expected the wide path"),
        }
    }

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
