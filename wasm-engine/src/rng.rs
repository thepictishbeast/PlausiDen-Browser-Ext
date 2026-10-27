//! Deterministic cryptographic PRNG for WASM targets.
//!
//! # Why this is a CSPRNG and the previous implementation was not
//!
//! This module used to be a PCG (64-bit state, 32-bit truncated output)
//! carrying the comment "the output of this PRNG is not used as key material;
//! no security property depends on unpredictability."
//!
//! **That comment was wrong, and it was the bug.** The engine's whole design,
//! stated in `lib.rs`, is that the extension drops a generated session into
//! history and *re-derives it later from the same seed* in order to audit what
//! was written. The seed is therefore kept and the decoy list is not —
//! deliberately, because a stored list of injected URLs would itself be the
//! incriminating artifact the tool exists to avoid creating.
//!
//! That makes unpredictability load-bearing. If an adversary who observes a
//! handful of decoy entries can recover the generator state, they can
//! enumerate **every** decoy, which separates injected history from real
//! history exactly and inverts the property the extension provides. PCG is not
//! designed to resist that: its output is a lightly-obscured function of a
//! 64-bit state, and state recovery from output is published work.
//!
//! The generator is now ChaCha20 (RFC 8439) in counter mode. Determinism is
//! unchanged — same seed, same stream — but the output is not distinguishable
//! from random without the key, so observed decoys reveal nothing about the
//! unobserved ones.
//!
//! # Residual limitation: seed width, stated plainly
//!
//! A CSPRNG cannot manufacture entropy it was not given. [`CsRng::from_u64`]
//! exists for compatibility with the `seed: u64` profile field, and **64 bits
//! is brute-forceable** by a resourceful adversary — catastrophically so if the
//! seed is derived from a timestamp or a counter. Callers that care about the
//! property above must use [`CsRng::from_seed_32`] with 32 bytes from
//! `crypto.getRandomValues`. See `profile::BrowsingProfile::seed_hex`.
//!
//! # No OS entropy, by design
//!
//! Nothing here calls `getrandom`, `thread_rng` or any OS source: unavailable
//! on `wasm32-unknown-unknown`, and determinism is a feature. The caller
//! supplies all entropy. ChaCha20 is implemented in this file rather than
//! pulled from a crate so that no transitive dependency can reintroduce an
//! entropy call into the WASM bundle, and so the bundle stays small.

/// ChaCha20 constants: the ASCII of "expand 32-byte k", little-endian.
const CONSTANTS: [u32; 4] = [0x6170_7865, 0x3320_646e, 0x7962_2d32, 0x6b20_6574];

/// Domain separator mixed into a widened `u64` seed, so a 64-bit seed used
/// here cannot collide with the same integer used as a seed elsewhere.
const WIDEN_DOMAIN: &[u8; 16] = b"plausiden/rng/v2";

#[inline]
fn quarter_round(s: &mut [u32; 16], a: usize, b: usize, c: usize, d: usize) {
    s[a] = s[a].wrapping_add(s[b]);
    s[d] ^= s[a];
    s[d] = s[d].rotate_left(16);
    s[c] = s[c].wrapping_add(s[d]);
    s[b] ^= s[c];
    s[b] = s[b].rotate_left(12);
    s[a] = s[a].wrapping_add(s[b]);
    s[d] ^= s[a];
    s[d] = s[d].rotate_left(8);
    s[c] = s[c].wrapping_add(s[d]);
    s[b] ^= s[c];
    s[b] = s[b].rotate_left(7);
}

/// One ChaCha20 block: 20 rounds over the 16-word state, then the
/// feed-forward add of the initial state. RFC 8439 §2.3.
fn chacha20_block(key: &[u8; 32], counter: u32, nonce: &[u8; 12]) -> [u32; 16] {
    let mut init = [0u32; 16];
    init[0..4].copy_from_slice(&CONSTANTS);
    for i in 0..8 {
        let o = i * 4;
        init[4 + i] = u32::from_le_bytes([key[o], key[o + 1], key[o + 2], key[o + 3]]);
    }
    init[12] = counter;
    for i in 0..3 {
        let o = i * 4;
        init[13 + i] = u32::from_le_bytes([nonce[o], nonce[o + 1], nonce[o + 2], nonce[o + 3]]);
    }

    let mut s = init;
    for _ in 0..10 {
        // Column rounds.
        quarter_round(&mut s, 0, 4, 8, 12);
        quarter_round(&mut s, 1, 5, 9, 13);
        quarter_round(&mut s, 2, 6, 10, 14);
        quarter_round(&mut s, 3, 7, 11, 15);
        // Diagonal rounds.
        quarter_round(&mut s, 0, 5, 10, 15);
        quarter_round(&mut s, 1, 6, 11, 12);
        quarter_round(&mut s, 2, 7, 8, 13);
        quarter_round(&mut s, 3, 4, 9, 14);
    }
    for i in 0..16 {
        s[i] = s[i].wrapping_add(init[i]);
    }
    s
}

/// Deterministic cryptographic PRNG. Same public surface as the PCG it
/// replaced, so call sites are unchanged.
#[derive(Debug, Clone)]
pub struct CsRng {
    key: [u8; 32],
    nonce: [u8; 12],
    counter: u32,
    /// Current keystream block, as 16 words.
    block: [u32; 16],
    /// Words of `block` already consumed. 16 means "refill before next read".
    used: usize,
}

impl CsRng {
    /// Construct from a full 32-byte seed. This is the path that actually
    /// delivers the unpredictability property.
    #[must_use]
    pub fn from_seed_32(seed: [u8; 32]) -> Self {
        let mut rng = CsRng {
            key: seed,
            nonce: [0u8; 12],
            counter: 0,
            block: [0u32; 16],
            used: 16,
        };
        rng.refill();
        rng
    }

    /// Construct from a 64-bit seed, widened by one ChaCha20 block under a
    /// domain separator.
    ///
    /// **This provides 64 bits of entropy, not 256.** It exists so the
    /// `seed: u64` profile field keeps working. The widening removes any
    /// structure in the integer but cannot add entropy: an adversary who can
    /// enumerate 2^64 candidate seeds can still enumerate the decoy set, and
    /// far fewer if the seed came from a clock. Prefer
    /// [`Self::from_seed_32`].
    #[must_use]
    pub fn from_u64(seed: u64) -> Self {
        let mut key = [0u8; 32];
        key[0..16].copy_from_slice(WIDEN_DOMAIN);
        key[16..24].copy_from_slice(&seed.to_le_bytes());
        // Remaining 8 bytes stay zero; the block function diffuses them.
        let widened = chacha20_block(&key, 0, &[0u8; 12]);
        let mut out = [0u8; 32];
        for i in 0..8 {
            out[i * 4..i * 4 + 4].copy_from_slice(&widened[i].to_le_bytes());
        }
        Self::from_seed_32(out)
    }

    fn refill(&mut self) {
        self.block = chacha20_block(&self.key, self.counter, &self.nonce);
        // 2^32 blocks * 64 bytes is 256 GiB of keystream; a generation run
        // reads kilobytes. Saturating rather than wrapping means a
        // pathological caller repeats the last block instead of silently
        // reusing the whole stream from the start.
        self.counter = self.counter.saturating_add(1);
        self.used = 0;
    }

    pub fn next_u32(&mut self) -> u32 {
        if self.used >= 16 {
            self.refill();
        }
        let w = self.block[self.used];
        self.used += 1;
        w
    }

    /// Uniform in `[0, n)`, without modulo bias.
    ///
    /// The previous implementation was `next_u32() % n`, which over-represents
    /// the low `2^32 mod n` values. The bias is small for the small `n` used
    /// here, but it is a bias in output an adversary is trying to
    /// distinguish from real browsing, so it is removed rather than bounded:
    /// draws landing in the final incomplete block of the `u32` range are
    /// rejected and redrawn.
    pub fn gen_range(&mut self, n: u32) -> u32 {
        if n == 0 {
            return 0;
        }
        // Largest multiple of n that fits in u32; draws at or above it bias.
        let limit = u32::MAX - (u32::MAX % n) - (n - 1);
        loop {
            let v = self.next_u32();
            if v <= limit {
                return v % n;
            }
        }
    }

    /// Pick an element from a non-empty slice.
    ///
    /// # Panics
    /// If `slice` is empty, as the PCG version did.
    pub fn pick<'a, T>(&mut self, slice: &'a [T]) -> &'a T {
        let i = self.gen_range(
            u32::try_from(slice.len()).unwrap_or(u32::MAX),
        ) as usize;
        &slice[i]
    }

    /// Split off an independent generator.
    ///
    /// The child's key is a full 32 bytes drawn from the parent's keystream,
    /// not a 64-bit integer re-seeded as the PCG version did
    /// (`Pcg::new(self.next_u64())`), which narrowed every child to 64 bits
    /// regardless of the parent's seed width.
    pub fn split(&mut self) -> Self {
        let mut child = [0u8; 32];
        for chunk in child.chunks_mut(4) {
            chunk.copy_from_slice(&self.next_u32().to_le_bytes());
        }
        Self::from_seed_32(child)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 8439 §2.3.2 test vector. This is the only thing standing between a
    /// hand-written cipher and a confident mistake, so it is first.
    #[test]
    fn chacha20_matches_rfc8439_block_vector() {
        let key: [u8; 32] = core::array::from_fn(|i| i as u8);
        let nonce: [u8; 12] = [
            0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x4a, 0x00, 0x00, 0x00, 0x00,
        ];
        let got = chacha20_block(&key, 1, &nonce);
        let want: [u32; 16] = [
            0xe4e7_f110, 0x1559_3bd1, 0x1fdd_0f50, 0xc471_20a3, 0xc7f4_d1c7, 0x0368_c033,
            0x9aaa_2204, 0x4e6c_d4c3, 0x4664_82d2, 0x09aa_9f07, 0x05d7_c214, 0xa202_8bd9,
            0xd19c_12b5, 0xb94e_16de, 0xe883_d0cb, 0x4e3c_50a2,
        ];
        assert_eq!(got, want, "ChaCha20 block does not match RFC 8439 §2.3.2");
    }

    #[test]
    fn quarter_round_matches_rfc8439_vector() {
        // RFC 8439 §2.1.1
        let mut s = [0u32; 16];
        s[0] = 0x1111_1111;
        s[1] = 0x0102_0304;
        s[2] = 0x9b8d_6f43;
        s[3] = 0x0123_4567;
        quarter_round(&mut s, 0, 1, 2, 3);
        assert_eq!(
            [s[0], s[1], s[2], s[3]],
            [0xea2a_92f4, 0xcb1c_f8ce, 0x4581_472e, 0x5881_c4bb]
        );
    }

    #[test]
    fn deterministic_from_same_seed() {
        let mut a = CsRng::from_u64(42);
        let mut b = CsRng::from_u64(42);
        for _ in 0..1000 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }

    #[test]
    fn deterministic_from_same_32_byte_seed() {
        let seed: [u8; 32] = core::array::from_fn(|i| (i * 7) as u8);
        let mut a = CsRng::from_seed_32(seed);
        let mut b = CsRng::from_seed_32(seed);
        let xs: Vec<u32> = (0..256).map(|_| a.next_u32()).collect();
        let ys: Vec<u32> = (0..256).map(|_| b.next_u32()).collect();
        assert_eq!(xs, ys);
    }

    #[test]
    fn different_seeds_diverge() {
        let mut a = CsRng::from_u64(1);
        let mut b = CsRng::from_u64(2);
        let xs: Vec<u32> = (0..32).map(|_| a.next_u32()).collect();
        let ys: Vec<u32> = (0..32).map(|_| b.next_u32()).collect();
        assert_ne!(xs, ys);
    }

    /// Adjacent seeds must not produce related streams. A seed derived from a
    /// clock differs from its neighbour by one, and under the old PCG a
    /// one-bit seed change left visible structure in the first outputs.
    #[test]
    fn adjacent_seeds_share_no_prefix() {
        for s in [0u64, 1, 1000, u64::MAX - 1] {
            let mut a = CsRng::from_u64(s);
            let mut b = CsRng::from_u64(s.wrapping_add(1));
            let xs: Vec<u32> = (0..8).map(|_| a.next_u32()).collect();
            let ys: Vec<u32> = (0..8).map(|_| b.next_u32()).collect();
            assert_ne!(xs, ys, "adjacent seeds {s} produced the same prefix");
            assert_ne!(xs[0], ys[0]);
        }
    }

    #[test]
    fn gen_range_is_bounded() {
        let mut rng = CsRng::from_u64(7);
        for n in [1u32, 2, 3, 5, 10, 255, 256, 1000] {
            for _ in 0..500 {
                assert!(rng.gen_range(n) < n);
            }
        }
    }

    #[test]
    fn gen_range_zero_returns_zero() {
        let mut rng = CsRng::from_u64(1);
        assert_eq!(rng.gen_range(0), 0);
    }

    /// The old `% n` over-represented low values. With n chosen so that
    /// 2^32 % n is large, a biased generator skews measurably; rejection
    /// sampling does not. Loose bound so this cannot flake.
    #[test]
    fn gen_range_has_no_modulo_skew() {
        let n: u32 = 3;
        let draws = 60_000;
        let mut counts = [0u32; 3];
        let mut rng = CsRng::from_u64(0xDEAD_BEEF);
        for _ in 0..draws {
            counts[rng.gen_range(n) as usize] += 1;
        }
        let expected = draws / n;
        for (i, c) in counts.iter().enumerate() {
            let delta = (i64::from(*c) - i64::from(expected)).abs();
            assert!(
                delta < i64::from(expected) / 10,
                "bucket {i} off by {delta} of {expected}"
            );
        }
    }

    #[test]
    fn pick_returns_valid_element() {
        let mut rng = CsRng::from_u64(123);
        let items = ["a", "b", "c", "d"];
        assert!(items.contains(rng.pick(&items)));
    }

    #[test]
    fn split_is_independent_and_deterministic() {
        let mut a = CsRng::from_u64(42);
        let mut child = a.split();
        assert_ne!(a.next_u32(), child.next_u32());

        let mut p = CsRng::from_u64(42);
        let mut q = CsRng::from_u64(42);
        let xs: Vec<u32> = (0..16).map(|_| p.split().next_u32()).collect();
        let ys: Vec<u32> = (0..16).map(|_| q.split().next_u32()).collect();
        assert_eq!(xs, ys, "split must be reproducible from the same seed");
    }

    /// A child must carry the parent's full key width. Two parents differing
    /// only beyond the first 64 bits of seed must still produce different
    /// children — which the old `Pcg::new(self.next_u64())` could not
    /// guarantee, because it funnelled every child through a 64-bit integer.
    #[test]
    fn split_does_not_narrow_to_64_bits() {
        let mut s1 = [0u8; 32];
        let mut s2 = [0u8; 32];
        s1[31] = 1;
        s2[31] = 2;
        let mut a = CsRng::from_seed_32(s1);
        let mut b = CsRng::from_seed_32(s2);
        let ca: Vec<u32> = (0..8).map(|_| a.split().next_u32()).collect();
        let cb: Vec<u32> = (0..8).map(|_| b.split().next_u32()).collect();
        assert_ne!(ca, cb);
    }

    /// Crossing a keystream block boundary must not repeat or stall. 16 words
    /// per block, so read well past several boundaries and require the stream
    /// not to cycle.
    #[test]
    fn crosses_block_boundaries_without_repeating() {
        let mut rng = CsRng::from_u64(99);
        let xs: Vec<u32> = (0..64).map(|_| rng.next_u32()).collect();
        for b in 0..3 {
            let first = &xs[b * 16..(b + 1) * 16];
            let second = &xs[(b + 1) * 16..(b + 2) * 16];
            assert_ne!(first, second, "block {b} repeated");
        }
    }

}
