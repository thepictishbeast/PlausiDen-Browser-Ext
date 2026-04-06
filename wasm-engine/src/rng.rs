//! Deterministic splittable PRNG for WASM targets.
//!
//! Uses a PCG-style linear congruential generator. Not cryptographic,
//! but good enough for generating realistic-looking synthetic browsing
//! data from a caller-supplied seed. Deliberately avoids any OS
//! entropy source because:
//!
//! - `thread_rng` is not available on `wasm32-unknown-unknown`.
//! - Determinism is a feature: the extension can re-derive the same
//!   history later and audit what was written.
//! - The output of this PRNG is not used as key material; no security
//!   property depends on unpredictability.

/// Minimal PCG-style state. 64-bit state, 32-bit output.
#[derive(Debug, Clone)]
pub struct Pcg {
    state: u64,
    inc: u64,
}

impl Pcg {
    pub const fn new(seed: u64) -> Self {
        // PCG constants from the reference implementation.
        let mut pcg = Pcg {
            state: 0,
            inc: (seed.wrapping_shl(1)) | 1,
        };
        pcg.state = pcg.state.wrapping_add(pcg.inc);
        pcg.next_u32_const();
        pcg.state = pcg.state.wrapping_add(seed);
        pcg.next_u32_const();
        pcg
    }

    const fn next_u32_const(&mut self) -> u32 {
        let old = self.state;
        self.state = old.wrapping_mul(6364136223846793005).wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }

    pub fn next_u32(&mut self) -> u32 {
        self.next_u32_const()
    }

    pub fn next_u64(&mut self) -> u64 {
        let hi = self.next_u32() as u64;
        let lo = self.next_u32() as u64;
        (hi << 32) | lo
    }

    /// Uniform in [0, n).
    pub fn gen_range(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        self.next_u32() % n
    }

    /// Pick a random element from a non-empty slice.
    pub fn pick<'a, T>(&mut self, slice: &'a [T]) -> &'a T {
        let i = self.gen_range(slice.len() as u32) as usize;
        &slice[i]
    }

    /// Split off a fresh generator seeded from this one. The parent
    /// state advances; the child generator is independent.
    pub fn split(&mut self) -> Self {
        Pcg::new(self.next_u64())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_output() {
        let mut a = Pcg::new(42);
        let mut b = Pcg::new(42);
        for _ in 0..100 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn test_different_seeds_different_output() {
        let mut a = Pcg::new(1);
        let mut b = Pcg::new(2);
        let a_first: Vec<u32> = (0..16).map(|_| a.next_u32()).collect();
        let b_first: Vec<u32> = (0..16).map(|_| b.next_u32()).collect();
        assert_ne!(a_first, b_first);
    }

    #[test]
    fn test_gen_range_is_bounded() {
        let mut rng = Pcg::new(7);
        for _ in 0..1000 {
            assert!(rng.gen_range(10) < 10);
        }
    }

    #[test]
    fn test_gen_range_zero_returns_zero() {
        let mut rng = Pcg::new(1);
        assert_eq!(rng.gen_range(0), 0);
    }

    #[test]
    fn test_pick_returns_valid_element() {
        let mut rng = Pcg::new(123);
        let items = ["a", "b", "c", "d"];
        let picked = rng.pick(&items);
        assert!(items.contains(picked));
    }

    #[test]
    fn test_split_independence() {
        let mut a = Pcg::new(42);
        let mut child = a.split();
        // Parent and child produce different sequences.
        let parent_next = a.next_u32();
        let child_next = child.next_u32();
        assert_ne!(parent_next, child_next);
    }

    #[test]
    fn test_split_determinism() {
        // Two runs of the same seed split at the same point produce
        // two children with identical sequences.
        let mut a = Pcg::new(42);
        let child_a = a.split();
        let mut b = Pcg::new(42);
        let child_b = b.split();
        let a_seq: Vec<u32> = (0..16).map(|_| child_a.clone().next_u32()).collect();
        let b_seq: Vec<u32> = (0..16).map(|_| child_b.clone().next_u32()).collect();
        assert_eq!(a_seq, b_seq);
    }

    #[test]
    fn test_next_u64_uses_both_halves() {
        let mut rng = Pcg::new(99);
        let v = rng.next_u64();
        assert!(v > 0);
    }
}
