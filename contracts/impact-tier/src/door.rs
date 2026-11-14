//! Rotating-QR self check-in.
//!
//! An organiser registers a per-shift "door key" (ed25519). A screen at the venue signs
//! `muster-door:<contract>:<bounty>:<slot>:<In|Out>` every 30 s, where `slot = unix_seconds / 30`,
//! and shows it as a QR code. A volunteer scans it and calls `self_attest`; the contract checks the
//! signature and that the slot is within ±2 minutes of the block time, then records the attendance
//! as made by the organiser who registered the key.

use near_sdk::{near, AccountId, CurveType, PublicKey};

use crate::Kind;

pub const SLOT_SECS: u64 = 30;
/// Slots either side of now that are accepted (4 × 30 s = 2 min), for clock skew and block time.
pub const SLOT_WINDOW: u64 = 4;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Door {
    pub public_key: PublicKey,
    pub set_by: AccountId,
}

pub fn message(contract: &AccountId, bounty_id: u64, slot: u64, kind: Kind) -> String {
    let k = match kind {
        Kind::In => "In",
        Kind::Out => "Out",
    };
    format!("muster-door:{contract}:{bounty_id}:{slot}:{k}")
}

pub fn slot_ok(now_ns: u64, slot: u64) -> bool {
    let now = now_ns / 1_000_000_000 / SLOT_SECS;
    now.abs_diff(slot) <= SLOT_WINDOW
}

/// The raw 32-byte ed25519 key, or None for other curves.
pub fn ed25519_bytes(pk: &PublicKey) -> Option<[u8; 32]> {
    if pk.curve_type() != CurveType::ED25519 {
        return None;
    }
    let b = pk.as_bytes();
    b[b.len() - 32..].try_into().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_binds_contract_bounty_slot_and_kind() {
        let c: AccountId = "v2.muster-tier.testnet".parse().unwrap();
        assert_eq!(message(&c, 7, 59_822_000, Kind::In), "muster-door:v2.muster-tier.testnet:7:59822000:In");
        assert_ne!(message(&c, 7, 1, Kind::In), message(&c, 7, 1, Kind::Out));
    }

    #[test]
    fn slot_window_is_two_minutes() {
        let now_ns = 30_000 * SLOT_SECS * 1_000_000_000; // slot 30_000
        assert!(slot_ok(now_ns, 30_000));
        assert!(slot_ok(now_ns, 30_004));
        assert!(slot_ok(now_ns, 29_996));
        assert!(!slot_ok(now_ns, 30_005));
        assert!(!slot_ok(now_ns, 29_995));
    }
}
