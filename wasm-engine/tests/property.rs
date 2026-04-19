//! Property-based regression tests.
//!
//! The inline `test_urls_never_contain_synthetic_tlds` in
//! `src/generator.rs` iterates a fixed grid of (flavour × intensity ×
//! seed). These tests cover the full parameter space with proptest's
//! shrinking so a failure points at the minimal reproducing case.
//!
//! Why belt-and-braces: the forensic fingerprint risk is severe — a
//! single `.example` leak in any generated URL defeats Tier 0's whole
//! value proposition. Two independent regression guards at different
//! layers is cheap insurance.

use plausiden_wasm_engine::generate_batch;
use proptest::prelude::*;

const BAD_TLDS: &[&str] = &[".example", ".invalid", ".test", ".localhost"];
const FLAVOURS: &[&str] = &[
    "Tech", "News", "Shopping", "Academic",
    "Gaming", "Cooking", "Travel", "Finance",
];
const INTENSITIES: &[&str] = &["low", "medium", "high", "max"];

proptest! {
    /// For any (seed, flavour, intensity, count), the JSON output must
    /// contain no synthetic-TLD literal. `generate_batch` returns a
    /// JSON array; the raw string search is stricter than URL parsing
    /// (catches any leak even if the URL field was restructured).
    #[test]
    fn no_synthetic_tld_in_any_batch(
        seed in 0u64..u64::MAX,
        flavour_idx in 0usize..FLAVOURS.len(),
        intensity_idx in 0usize..INTENSITIES.len(),
        count in 1u32..20,
    ) {
        let profile = format!(
            r#"{{"seed":{seed},"flavour":"{}"}}"#,
            FLAVOURS[flavour_idx],
        );
        let out = generate_batch(&profile, INTENSITIES[intensity_idx], count);
        for bad in BAD_TLDS {
            prop_assert!(
                !out.contains(bad),
                "output contains synthetic TLD {bad} (flavour={}, intensity={}, seed={seed}, count={count}): {}…",
                FLAVOURS[flavour_idx],
                INTENSITIES[intensity_idx],
                &out.chars().take(200).collect::<String>(),
            );
        }
    }

    /// Every valid batch starts with '[' — the JSON array marker.
    /// Error responses start with '{' (JSON object). A batch that
    /// starts with neither is a broken return-type contract.
    #[test]
    fn batch_output_is_well_formed_json(
        seed in 0u64..u64::MAX,
        flavour_idx in 0usize..FLAVOURS.len(),
        intensity_idx in 0usize..INTENSITIES.len(),
        count in 0u32..50,
    ) {
        let profile = format!(
            r#"{{"seed":{seed},"flavour":"{}"}}"#,
            FLAVOURS[flavour_idx],
        );
        let out = generate_batch(&profile, INTENSITIES[intensity_idx], count);
        let first = out.chars().next().unwrap_or('?');
        prop_assert!(
            first == '[' || first == '{',
            "output does not start with JSON array or object marker: {}…",
            &out.chars().take(80).collect::<String>(),
        );
        // Whatever it claims to be, it must parse as JSON at all.
        let parsed: Result<serde_json::Value, _> = serde_json::from_str(&out);
        prop_assert!(parsed.is_ok(), "output is not valid JSON: {}", &out.chars().take(80).collect::<String>());
    }
}
