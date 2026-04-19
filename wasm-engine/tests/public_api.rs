//! Integration tests for the wasm-engine public API.
//!
//! These live in `tests/` (not inside `src/lib.rs`'s `#[cfg(test)]` module)
//! so they exercise the crate the way a real consumer would: only `pub`
//! items, only the wasm-bindgen-exposed functions, no access to internal
//! state. If something is reachable from here, it's part of the contract.
//!
//! If an internal refactor breaks one of these tests, the contract has
//! shifted and the SemVer story needs attention — that's the point.

use plausiden_wasm_engine::{engine_version, generate_batch, list_flavours, MAX_PROFILE_JSON_LEN};

#[test]
fn version_is_nonempty_and_semver_ish() {
    let v = engine_version();
    assert!(!v.is_empty(), "engine version must not be empty");
    assert!(
        v.chars().any(|c| c.is_ascii_digit()),
        "engine version should contain a digit: {v}"
    );
    assert!(v.contains('.'), "engine version should be dotted: {v}");
}

#[test]
fn flavours_listed_are_all_usable_for_generation() {
    // list_flavours returns a JSON array of flavour name strings.
    // Each name must round-trip through a profile that generate_batch
    // accepts. This pins the contract between the two endpoints.
    let listed = list_flavours();
    let flavours: Vec<String> = serde_json::from_str(&listed).unwrap();
    assert!(!flavours.is_empty(), "must advertise at least one flavour");

    for flavour in &flavours {
        let profile = format!(r#"{{"seed":42,"flavour":"{flavour}"}}"#);
        let out = generate_batch(&profile, "low", 2);
        assert!(
            out.starts_with('['),
            "flavour '{flavour}' from list_flavours did not round-trip through generate_batch; got: {}…",
            &out.chars().take(120).collect::<String>(),
        );
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        let arr = parsed.as_array().unwrap();
        assert_eq!(arr.len(), 2, "expected 2 sessions for flavour {flavour}");
    }
}

#[test]
fn bounds_constant_is_exposed_for_downstream_reuse() {
    // Downstream consumers (the TypeScript side) may want to validate
    // their own JSON before crossing the WASM boundary. Expose the
    // ceiling so they don't have to hard-code a duplicate magic.
    assert!(MAX_PROFILE_JSON_LEN >= 1024, "cap must allow real profiles");
    assert!(
        MAX_PROFILE_JSON_LEN <= 65536,
        "cap should be a modest bound; >64k invites allocation attacks"
    );
}

#[test]
fn every_session_in_batch_has_entries() {
    let out = generate_batch(
        r#"{"seed":7,"flavour":"Tech"}"#,
        "medium",
        5,
    );
    let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
    let sessions = parsed.as_array().unwrap();
    assert_eq!(sessions.len(), 5);
    for (i, s) in sessions.iter().enumerate() {
        let entries = s.get("entries").and_then(|e| e.as_array()).unwrap_or_else(|| {
            panic!("session {i} missing entries array: {s}")
        });
        assert!(!entries.is_empty(), "session {i} has no entries");
    }
}

#[test]
fn oversized_input_error_is_well_formed_json() {
    // Caller-facing invariant: error responses are JSON objects the
    // TS side can parse, not raw strings that break popup.ts's
    // isExtErrorResponse check.
    let oversized = format!(r#"{{"seed":1,"flavour":"Tech","timezone":"{}"}}"#, "X".repeat(MAX_PROFILE_JSON_LEN + 1));
    let out = generate_batch(&oversized, "low", 1);
    let parsed: serde_json::Value = serde_json::from_str(&out).expect("error must be JSON");
    assert!(parsed.get("error").is_some(), "error field missing: {out}");
}
