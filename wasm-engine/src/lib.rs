//! PlausiDen WASM Engine -- Scaffold
//!
//! This crate will provide the WASM-compiled plausiden-engine for use
//! in the browser extension. Currently a placeholder until the engine
//! crate is ready for wasm32-unknown-unknown compilation.
//!
//! The TypeScript stub generator in `src/background/generator.ts` is
//! used in the meantime.

use wasm_bindgen::prelude::*;

/// Generate a batch of plausible browsing entries.
///
/// # Arguments
/// * `profile_json` - JSON-serialized browsing profile
/// * `intensity` - Intensity level string ("low", "medium", "high", "max")
/// * `count` - Number of sessions to generate
///
/// # Returns
/// JSON-serialized array of browsing sessions.
#[wasm_bindgen]
pub fn generate_batch(_profile_json: &str, _intensity: &str, _count: u32) -> String {
    todo!("Replace with plausiden-engine WASM build when ready")
}

/// Get the engine version string.
#[wasm_bindgen]
pub fn engine_version() -> String {
    todo!("Replace with plausiden-engine WASM build when ready")
}
