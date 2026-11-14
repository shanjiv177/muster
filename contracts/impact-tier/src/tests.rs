//! Callback-level unit tests: feed DAO view results in as promise results.

use super::*;
use near_sdk::serde_json::json;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, RuntimeFeesConfig};

const SEC: u64 = 1_000_000_000;
const DESC: &str = "Juhu cleanup\nMUSTER {\"start\":1000,\"end\":4600,\"min_minutes\":30,\"grace_min\":10}";

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn policy() -> Value {
    json!({"roles": [
        {"name": "council", "kind": {"Group": ["c.testnet"]}},
        {"name": "organiser", "kind": {"Group": ["org.testnet"]}},
        {"name": "tier", "kind": {"Group": ["tier.testnet"]}},
        {"name": "volunteers", "kind": "Everyone"}
    ]})
}

fn proposal(proposer: &str, receiver: &str, status: &str) -> Value {
    json!({"id": 3, "proposer": proposer, "description": "rsvp", "status": status,
           "kind": {"BountyDone": {"bounty_id": 7, "receiver_id": receiver}},
           "vote_counts": {}, "votes": {}, "submission_time": "0"})
}

fn bounty() -> Value {
    json!({"id": 7, "description": DESC, "token": "", "amount": "100", "times": 10, "max_deadline": "1"})
}

fn ok(v: &Value) -> PromiseResult {
    PromiseResult::Successful(serde_json::to_vec(v).unwrap())
}

/// Sets the context: called by `predecessor` at `now_s`, with the given promise results.
fn env_at(predecessor: &str, now_s: u64, results: Vec<PromiseResult>) {
    let ctx = VMContextBuilder::new()
        .current_account_id(acc("tier.testnet"))
        .predecessor_account_id(acc(predecessor))
        .block_timestamp(now_s * SEC)
        .build();
    testing_env!(ctx, near_sdk::test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
}

fn contract(trusted_after: u32) -> ImpactTier {
    env_at("deployer.testnet", 0, vec![]);
    ImpactTier::new(acc("dao.testnet"), U128(1_000), trusted_after)
}

fn attend(c: &mut ImpactTier, vol: &str, in_s: u64, out_s: u64) {
    env_at("tier.testnet", in_s, vec![ok(&policy())]);
    c.on_attest(7, acc(vol), Kind::In, acc("org.testnet"), in_s * SEC);
    env_at("tier.testnet", out_s, vec![ok(&policy())]);
    c.on_attest(7, acc(vol), Kind::Out, acc("org.testnet"), out_s * SEC);
}

fn settle_value(c: &mut ImpactTier, prop: Value, now_s: u64) -> Option<Decision> {
    env_at("tier.testnet", now_s, vec![ok(&prop), ok(&bounty()), ok(&policy())]);
    match c.on_settle(3, 7) {
        PromiseOrValue::Value(d) => Some(d),
        PromiseOrValue::Promise(_) => None, // a vote was sent
    }
}

#[test]
fn attest_records_in_and_out() {
    let mut c = contract(0);
    attend(&mut c, "v.testnet", 1000, 2800);
    let a = c.attendance_of(7, acc("v.testnet"));
    assert_eq!(a.minutes(), Some(30));
    assert_eq!(a.in_by, Some(acc("org.testnet")));
}

#[test]
fn second_check_in_does_not_move_the_start() {
    let mut c = contract(0);
    attend(&mut c, "v.testnet", 1000, 2800);
    env_at("tier.testnet", 2000, vec![ok(&policy())]);
    c.on_attest(7, acc("v.testnet"), Kind::In, acc("org.testnet"), 2000 * SEC);
    assert_eq!(c.attendance_of(7, acc("v.testnet")).in_ns, Some(1000 * SEC));
}

#[test]
#[should_panic(expected = "ERR_NOT_ORGANISER")]
fn non_organiser_cannot_attest() {
    let mut c = contract(0);
    env_at("tier.testnet", 1000, vec![ok(&policy())]);
    c.on_attest(7, acc("v.testnet"), Kind::In, acc("mallory.testnet"), 1000 * SEC);
}

#[test]
#[should_panic(expected = "ERR_NO_CHECK_IN")]
fn check_out_needs_check_in() {
    let mut c = contract(0);
    env_at("tier.testnet", 1000, vec![ok(&policy())]);
    c.on_attest(7, acc("v.testnet"), Kind::Out, acc("org.testnet"), 1000 * SEC);
}

#[test]
#[should_panic(expected = "ERR_POLICY_UNAVAILABLE")]
fn attest_fails_closed_without_policy() {
    let mut c = contract(0);
    env_at("tier.testnet", 1000, vec![PromiseResult::Failed]);
    c.on_attest(7, acc("v.testnet"), Kind::In, acc("org.testnet"), 1000 * SEC);
}

#[test]
fn settle_sends_vote_for_trusted_attendee_and_waits_otherwise() {
    let mut c = contract(0);
    attend(&mut c, "v.testnet", 1000, 3000);
    // trusted_after = 0: approve vote is sent (a promise, not a value).
    assert_eq!(settle_value(&mut c, proposal("v.testnet", "v.testnet", "InProgress"), 5000), None);
    assert_eq!(c.canonical_of(7, acc("v.testnet")), Some(3));

    let mut c = contract(2);
    attend(&mut c, "w.testnet", 1000, 3000);
    let d = settle_value(&mut c, proposal("w.testnet", "w.testnet", "InProgress"), 5000).unwrap();
    assert!(matches!(d, Decision::Wait { .. }));
}

#[test]
fn settle_ignores_spoof_and_unavailable_dao() {
    let mut c = contract(0);
    let d = settle_value(&mut c, proposal("attacker.testnet", "v.testnet", "InProgress"), 99_999).unwrap();
    assert!(matches!(d, Decision::Ignore { .. }));
    assert_eq!(c.canonical_of(7, acc("v.testnet")), None);

    env_at("tier.testnet", 5000, vec![PromiseResult::Failed, ok(&bounty()), ok(&policy())]);
    assert!(matches!(c.on_settle(3, 7), PromiseOrValue::Value(Decision::Ignore { .. })));
}

#[test]
fn no_show_vote_sent_after_grace() {
    let mut c = contract(0);
    assert!(matches!(settle_value(&mut c, proposal("v.testnet", "v.testnet", "InProgress"), 5000), Some(Decision::Wait { .. })));
    assert_eq!(settle_value(&mut c, proposal("v.testnet", "v.testnet", "InProgress"), 5201), None);
}

#[test]
fn approved_vote_credits_once() {
    let mut c = contract(0);
    env_at("tier.testnet", 5000, vec![PromiseResult::Successful(vec![])]);
    assert!(c.on_voted(3, 7, acc("v.testnet"), true, 45, "attended".into()));
    assert!(c.on_voted(3, 7, acc("v.testnet"), true, 45, "attended".into()));
    let r = c.record_of(acc("v.testnet"));
    assert_eq!((r.shifts, r.minutes), (1, 45));
    assert_eq!(c.outcomes_count(), 2);
    assert!(c.is_credited(3));
}

#[test]
fn failed_vote_records_nothing() {
    let mut c = contract(0);
    env_at("tier.testnet", 5000, vec![PromiseResult::Failed]);
    assert!(!c.on_voted(3, 7, acc("v.testnet"), true, 45, "attended".into()));
    assert_eq!(c.record_of(acc("v.testnet")).shifts, 0);
    assert_eq!(c.outcomes_count(), 0);
}

#[test]
fn removal_is_logged_without_credit() {
    let mut c = contract(0);
    env_at("tier.testnet", 6000, vec![PromiseResult::Successful(vec![])]);
    c.on_voted(3, 7, acc("v.testnet"), false, 0, "no-show".into());
    assert_eq!(c.record_of(acc("v.testnet")).shifts, 0);
    assert_eq!(c.outcomes(None, None)[0].outcome, "removed");
}

#[test]
fn council_approved_attested_shift_is_credited() {
    let mut c = contract(2);
    attend(&mut c, "v.testnet", 1000, 3700);
    env_at("tier.testnet", 9000, vec![ok(&proposal("v.testnet", "v.testnet", "Approved")), ok(&bounty()), ok(&policy())]);
    assert_eq!(c.on_credit(3, 7), 45);
    assert_eq!(c.record_of(acc("v.testnet")).entries[0].approved_by, "council");
}

#[test]
#[should_panic(expected = "ERR_ALREADY_CREDITED")]
fn credit_twice_panics() {
    let mut c = contract(2);
    attend(&mut c, "v.testnet", 1000, 3700);
    for _ in 0..2 {
        env_at("tier.testnet", 9000, vec![ok(&proposal("v.testnet", "v.testnet", "Approved")), ok(&bounty()), ok(&policy())]);
        c.on_credit(3, 7);
    }
}

#[test]
#[should_panic(expected = "ERR_NOT_ATTESTED")]
fn council_approval_without_attendance_is_not_credited() {
    let mut c = contract(2);
    env_at("tier.testnet", 9000, vec![ok(&proposal("v.testnet", "v.testnet", "Approved")), ok(&bounty()), ok(&policy())]);
    c.on_credit(3, 7);
}

#[test]
#[should_panic(expected = "ERR_NOT_APPROVED")]
fn credit_requires_approved_status() {
    let mut c = contract(2);
    attend(&mut c, "v.testnet", 1000, 3700);
    env_at("tier.testnet", 9000, vec![ok(&proposal("v.testnet", "v.testnet", "InProgress")), ok(&bounty()), ok(&policy())]);
    c.on_credit(3, 7);
}

#[test]
#[should_panic(expected = "ERR_PROPOSER_NOT_RECEIVER")]
fn credit_rejects_spoofed_proposal() {
    let mut c = contract(2);
    attend(&mut c, "v.testnet", 1000, 3700);
    env_at("tier.testnet", 9000, vec![ok(&proposal("attacker.testnet", "v.testnet", "Approved")), ok(&bounty()), ok(&policy())]);
    c.on_credit(3, 7);
}
