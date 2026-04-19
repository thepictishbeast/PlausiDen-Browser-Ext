//! PlausiDen WASM Engine — plausible browsing-history generation.
//!
//! Self-contained generator of plausible browsing sessions for the
//! browser extension. Runs in-browser via WASM with no network
//! access, no randomness source beyond the caller's seed, and no
//! external state. Replaces the earlier TypeScript stub generator
//! in `src/background/generator.ts`.
//!
//! # Determinism
//!
//! Generation is fully deterministic given a seed. The same profile,
//! intensity, count, and seed produce the same sessions across runs.
//! This lets the extension drop a session into history, then later
//! re-derive it from the same seed to audit what was written.
//!
//! # Privacy
//!
//! No network. No `thread_rng` or OS entropy calls (both are
//! problematic in WASM). All randomness is a splittable LCG keyed
//! by the profile seed.

mod generator;
mod profile;
mod rng;

use wasm_bindgen::prelude::*;

/// Maximum accepted length of the `profile_json` input in bytes.
///
/// A valid [`profile::BrowsingProfile`] serializes to well under 1 KB; the
/// 4 KB cap is a generous upper bound that still forecloses on any attempt
/// to force `serde_json` to allocate unbounded memory (a malicious caller
/// could otherwise hand us a multi-megabyte string and turn the tab into
/// an OOM target).
///
/// SECURITY: bounded deserialization surface — see AVP-2 Tier 1 (deserialization
/// hardening) and audit `leak` checklist item "max-size bounds before parsing."
pub const MAX_PROFILE_JSON_LEN: usize = 4096;

/// Generate a batch of plausible browsing entries.
///
/// # Arguments
///
/// * `profile_json` — JSON-serialized [`profile::BrowsingProfile`]. Rejected
///   if longer than [`MAX_PROFILE_JSON_LEN`] bytes (defense against unbounded
///   allocation from a malicious caller).
///   See the `profile` module for the schema.
/// * `intensity` — One of `"low"`, `"medium"`, `"high"`, `"max"`.
///   Controls how many entries land inside each generated session.
/// * `count` — Number of sessions to generate. Clamped to 1024.
///
/// # Returns
///
/// JSON-serialized array of [`generator::BrowsingSession`] objects.
/// On input error, returns a JSON `{"error": "..."}` object rather
/// than panicking — this is deliberate so the extension can surface
/// the error to the user without a tab crash.
///
/// BUG ASSUMPTION: `profile_json` arrives unvalidated from JavaScript; the
/// caller may be hostile even though the extension's own popup never sends
/// large inputs. Treat every call as untrusted.
#[wasm_bindgen]
pub fn generate_batch(profile_json: &str, intensity: &str, count: u32) -> String {
    if profile_json.len() > MAX_PROFILE_JSON_LEN {
        return format!(
            r#"{{"error":"profile JSON too large: {} bytes (max {})"}}"#,
            profile_json.len(),
            MAX_PROFILE_JSON_LEN,
        );
    }

    let profile: profile::BrowsingProfile = match serde_json::from_str(profile_json) {
        Ok(p) => p,
        Err(e) => return format!(r#"{{"error":"invalid profile JSON: {}"}}"#, e),
    };

    let intensity = match intensity {
        "low" => profile::Intensity::Low,
        "medium" => profile::Intensity::Medium,
        "high" => profile::Intensity::High,
        "max" => profile::Intensity::Max,
        other => {
            return format!(r#"{{"error":"unknown intensity: {}"}}"#, other);
        }
    };

    let clamped_count = count.min(1024);
    let sessions = generator::generate(&profile, intensity, clamped_count);
    serde_json::to_string(&sessions).unwrap_or_else(|e| {
        format!(r#"{{"error":"failed to serialize sessions: {}"}}"#, e)
    })
}

/// Get the engine version string.
#[wasm_bindgen]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// List the currently available profile flavours.
#[wasm_bindgen]
pub fn list_flavours() -> String {
    let flavours: Vec<&'static str> = profile::Flavour::ALL
        .iter()
        .map(|f| f.as_str())
        .collect();
    serde_json::to_string(&flavours).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_engine_version_matches_cargo() {
        assert_eq!(engine_version(), env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn test_generate_batch_returns_error_for_bad_json() {
        let out = generate_batch("not-json", "low", 1);
        assert!(out.contains("error"));
    }

    #[test]
    fn test_generate_batch_returns_error_for_bad_intensity() {
        let out = generate_batch(r#"{"seed":42,"flavour":"Tech"}"#, "nope", 1);
        assert!(out.contains("unknown intensity"));
    }

    #[test]
    fn test_generate_batch_produces_valid_json_array() {
        let out = generate_batch(r#"{"seed":42,"flavour":"Tech"}"#, "low", 3);
        assert!(out.starts_with('['));
        assert!(out.ends_with(']'));
    }

    #[test]
    fn test_generate_batch_count_clamped_to_1024() {
        let out = generate_batch(r#"{"seed":1,"flavour":"News"}"#, "low", 100_000);
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        let arr = parsed.as_array().unwrap();
        assert!(arr.len() <= 1024);
    }

    #[test]
    fn test_generate_batch_is_deterministic_for_same_seed() {
        let a = generate_batch(r#"{"seed":9999,"flavour":"Tech"}"#, "medium", 5);
        let b = generate_batch(r#"{"seed":9999,"flavour":"Tech"}"#, "medium", 5);
        assert_eq!(a, b);
    }

    #[test]
    fn test_generate_batch_differs_for_different_seeds() {
        let a = generate_batch(r#"{"seed":1,"flavour":"Tech"}"#, "medium", 5);
        let b = generate_batch(r#"{"seed":2,"flavour":"Tech"}"#, "medium", 5);
        assert_ne!(a, b);
    }

    #[test]
    fn test_list_flavours_is_json_array() {
        let out = list_flavours();
        assert!(out.starts_with('['));
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert!(parsed.as_array().unwrap().len() >= 4);
    }

    #[test]
    fn test_generate_batch_rejects_oversized_profile_json() {
        // Construct a valid-but-huge JSON — valid serde syntax, but way over
        // MAX_PROFILE_JSON_LEN. Caller should get an error JSON, not a panic.
        let huge_timezone: String = "A".repeat(MAX_PROFILE_JSON_LEN + 1);
        let oversized = format!(
            r#"{{"seed":1,"flavour":"Tech","timezone":"{huge_timezone}"}}"#
        );
        assert!(oversized.len() > MAX_PROFILE_JSON_LEN);

        let out = generate_batch(&oversized, "low", 1);
        assert!(
            out.contains("too large"),
            "expected size-limit error, got: {out}"
        );
        // Must not start with '[' — that would indicate parsing proceeded.
        assert!(
            !out.starts_with('['),
            "oversized input should not reach the generator"
        );
    }

    /// Perf regression guard. NOT a micro-benchmark (we don't need
    /// criterion's statistical machinery for a ceiling check) — this
    /// just asserts the worst realistic batch stays under a generous
    /// latency budget. If a future change here makes generate_batch
    /// allocate-heavy or quadratic, this test starts failing and the
    /// author has to explain why.
    ///
    /// Budget rationale: the popup expects 100 sessions to feel instant;
    /// 200ms is ~2x the 100ms "feels instant" threshold to give CI hosts
    /// headroom. On a modern dev box the actual time is typically <20ms.
    /// Native cargo test; WASM runtime is slower but orders-of-magnitude
    /// headroom remains.
    #[test]
    fn test_generate_batch_latency_ceiling() {
        use std::time::Instant;
        let profile = r#"{"seed":1,"flavour":"Tech"}"#;
        let start = Instant::now();
        let out = generate_batch(profile, "medium", 100);
        let elapsed = start.elapsed();
        assert!(out.starts_with('['), "output should be a JSON array");
        assert!(
            elapsed.as_millis() < 200,
            "generate_batch(100 sessions) took {}ms, over 200ms ceiling",
            elapsed.as_millis(),
        );
    }

    #[test]
    fn test_generate_batch_accepts_profile_json_at_limit() {
        // A profile just under the cap must still succeed — the bound is a
        // ceiling, not a floor. Construct a valid profile with a comfortable
        // margin below the limit.
        let mut padding = String::from("X");
        // Build a timezone string sized so total JSON is ~MAX_PROFILE_JSON_LEN - 100.
        while padding.len() < MAX_PROFILE_JSON_LEN - 200 {
            padding.push('X');
        }
        let near_limit = format!(
            r#"{{"seed":1,"flavour":"Tech","timezone":"{padding}"}}"#
        );
        assert!(near_limit.len() < MAX_PROFILE_JSON_LEN);

        let out = generate_batch(&near_limit, "low", 1);
        assert!(
            out.starts_with('['),
            "at-limit profile should succeed, got: {}…",
            &out.chars().take(80).collect::<String>()
        );
    }
}
