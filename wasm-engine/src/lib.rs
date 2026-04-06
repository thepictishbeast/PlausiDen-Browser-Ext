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

/// Generate a batch of plausible browsing entries.
///
/// # Arguments
///
/// * `profile_json` — JSON-serialized [`profile::BrowsingProfile`].
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
#[wasm_bindgen]
pub fn generate_batch(profile_json: &str, intensity: &str, count: u32) -> String {
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
}
