//! The settle decision as a pure function, so every invariant is unit-testable without promises.

use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::{near, AccountId};

use crate::terms::{self, Terms};

/// Attendance recorded by `attest`, keyed by (bounty, volunteer).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Attendance {
    pub in_ns: Option<u64>,
    pub out_ns: Option<u64>,
    pub in_by: Option<AccountId>,
    pub out_by: Option<AccountId>,
}

impl Attendance {
    /// Minutes between check-in and check-out when both exist and out > in.
    pub fn minutes(&self) -> Option<u64> {
        match (self.in_ns, self.out_ns) {
            (Some(i), Some(o)) if o > i => Some((o - i) / 60_000_000_000),
            _ => None,
        }
    }

    /// Both attestations were made by accounts that hold the DAO's `organiser` role.
    pub fn attested_by(&self, organisers: &[AccountId]) -> bool {
        match (&self.in_by, &self.out_by) {
            (Some(a), Some(b)) => organisers.contains(a) && organisers.contains(b),
            _ => false,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.in_ns.is_none() && self.out_ns.is_none()
    }
}

/// The parts of a Sputnik proposal the decision needs.
#[derive(Clone, Debug, PartialEq)]
pub struct ProposalInfo {
    pub proposer: AccountId,
    pub status: String,
    /// `Some((bounty_id, receiver_id))` for `BountyDone`, else `None`.
    pub bounty_done: Option<(u64, AccountId)>,
    /// The exact `kind` JSON, passed back to `act_proposal` as Sputnik requires.
    pub kind: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BountyInfo {
    pub description: String,
    pub amount: u128,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Context {
    pub now_ns: u64,
    pub trusted_after: u32,
    pub auto_cap: u128,
    /// Shifts already on the volunteer's verified record.
    pub record_shifts: u32,
    /// The first proposal settled for this (bounty, volunteer), if any.
    pub canonical: Option<u64>,
    /// The volunteer still holds a claim on this bounty in the DAO (`get_bounty_claims`).
    /// False after a give-up or a settlement: voting would only revert.
    pub has_claim: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub enum Decision {
    /// Vote Approve: the stipend is paid and the bond returned.
    Approve { minutes: u64 },
    /// Vote Remove: the proposal is deleted and the bond stays with the DAO.
    Remove { reason: String },
    /// Leave it for now (event not over, or needs a council vote).
    Wait { reason: String },
    /// Not Muster's to act on.
    Ignore { reason: String },
}

fn s(x: &str) -> String {
    x.to_string()
}

pub fn decide(
    proposal_id: u64,
    bounty_id: u64,
    p: &ProposalInfo,
    b: &BountyInfo,
    organisers: &[AccountId],
    att: &Attendance,
    ctx: &Context,
) -> Decision {
    let Some((pb, receiver)) = &p.bounty_done else {
        return Decision::Ignore { reason: s("not a BountyDone proposal") };
    };
    if *pb != bounty_id {
        return Decision::Ignore { reason: s("bounty id mismatch") };
    }
    if p.status != "InProgress" {
        return Decision::Ignore { reason: s("proposal not in progress") };
    }
    if &p.proposer != receiver {
        // Spoofed BountyDone: never vote on it (see docs/sputnik-findings.md §3).
        return Decision::Ignore { reason: s("proposer is not the receiver") };
    }
    if !ctx.has_claim {
        return Decision::Ignore { reason: s("no live claim (given up or already settled)") };
    }
    if let Some(c) = ctx.canonical {
        if c != proposal_id {
            return Decision::Remove { reason: s("duplicate claim for this shift") };
        }
    }
    let Some(t): Option<Terms> = terms::parse(&b.description) else {
        return Decision::Ignore { reason: s("bounty has no MUSTER terms") };
    };

    if let Some(minutes) = att.minutes() {
        if att.attested_by(organisers) && minutes >= t.min_minutes {
            let trusted = ctx.record_shifts >= ctx.trusted_after;
            if trusted && b.amount <= ctx.auto_cap {
                return Decision::Approve { minutes };
            }
            return Decision::Wait {
                reason: s(if trusted { "stipend above auto cap: council vote" } else { "new volunteer: council vote" }),
            };
        }
    }

    if ctx.now_ns > t.no_show_after_ns() {
        if att.is_empty() {
            return Decision::Remove { reason: s("no-show") };
        }
        // Partial or short attendance is a judgement call for the council, never an auto-forfeit.
        return Decision::Wait { reason: s("partial attendance: council vote") };
    }
    Decision::Wait { reason: s("shift not over") }
}

/// Parses Sputnik `get_proposal` JSON.
pub fn parse_proposal(v: &Value) -> Option<ProposalInfo> {
    let proposer: AccountId = v.get("proposer")?.as_str()?.parse().ok()?;
    let status = v.get("status")?.as_str()?.to_string();
    let kind = v.get("kind")?.clone();
    let bounty_done = kind.get("BountyDone").and_then(|bd| {
        Some((
            bd.get("bounty_id")?.as_u64()?,
            bd.get("receiver_id")?.as_str()?.parse().ok()?,
        ))
    });
    Some(ProposalInfo { proposer, status, bounty_done, kind })
}

/// Parses Sputnik `get_bounty` JSON (`amount` is a U128 string).
pub fn parse_bounty(v: &Value) -> Option<BountyInfo> {
    let description = v.get("description")?.as_str()?.to_string();
    let amount: U128 = near_sdk::serde_json::from_value(v.get("amount")?.clone()).ok()?;
    Some(BountyInfo { description, amount: amount.0 })
}

/// Whether Sputnik `get_bounty_claims` JSON contains a claim on `bounty_id`.
pub fn has_claim(claims: &Value, bounty_id: u64) -> bool {
    claims
        .as_array()
        .map(|cs| cs.iter().any(|c| c.get("bounty_id").and_then(Value::as_u64) == Some(bounty_id)))
        .unwrap_or(false)
}

/// Members of the `organiser` Group role in Sputnik `get_policy` JSON.
pub fn organisers(policy: &Value) -> Vec<AccountId> {
    policy
        .get("roles")
        .and_then(Value::as_array)
        .and_then(|roles| roles.iter().find(|r| r.get("name").and_then(Value::as_str) == Some("organiser")))
        .and_then(|r| r.get("kind")?.get("Group")?.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|a| a.as_str()?.parse().ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json::json;

    const MIN: u64 = 60_000_000_000;
    const SEC: u64 = 1_000_000_000;
    // Shift 1000s..4600s (1 h), min 30 min, grace 10 min.
    const DESC: &str = "Juhu cleanup\nMUSTER {\"start\":1000,\"end\":4600,\"min_minutes\":30,\"grace_min\":10}";

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    fn prop(proposer: &str, receiver: &str, status: &str) -> ProposalInfo {
        let kind = json!({"BountyDone": {"bounty_id": 7, "receiver_id": receiver}});
        parse_proposal(&json!({"proposer": proposer, "status": status, "kind": kind})).unwrap()
    }

    fn bounty(amount: u128) -> BountyInfo {
        BountyInfo { description: DESC.into(), amount }
    }

    fn orgs() -> Vec<AccountId> {
        vec![acc("org.testnet")]
    }

    fn attended(mins: u64, by: &str) -> Attendance {
        Attendance {
            in_ns: Some(1000 * SEC),
            out_ns: Some(1000 * SEC + mins * MIN),
            in_by: Some(acc(by)),
            out_by: Some(acc(by)),
        }
    }

    fn ctx(now_s: u64, shifts: u32) -> Context {
        Context { now_ns: now_s * SEC, trusted_after: 2, auto_cap: 1_000, record_shifts: shifts, canonical: None, has_claim: true }
    }

    fn run(p: &ProposalInfo, b: &BountyInfo, a: &Attendance, c: &Context) -> Decision {
        decide(3, 7, p, b, &orgs(), a, c)
    }

    #[test]
    fn trusted_attended_is_approved() {
        let d = run(&prop("v.testnet", "v.testnet", "InProgress"), &bounty(500), &attended(45, "org.testnet"), &ctx(5000, 2));
        assert_eq!(d, Decision::Approve { minutes: 45 });
    }

    #[test]
    fn new_volunteer_waits_for_council() {
        let d = run(&prop("v.testnet", "v.testnet", "InProgress"), &bounty(500), &attended(45, "org.testnet"), &ctx(5000, 1));
        assert!(matches!(d, Decision::Wait { .. }));
    }

    #[test]
    fn stipend_above_cap_waits() {
        let d = run(&prop("v.testnet", "v.testnet", "InProgress"), &bounty(5_000), &attended(45, "org.testnet"), &ctx(5000, 9));
        assert!(matches!(d, Decision::Wait { .. }));
    }

    #[test]
    fn no_show_removed_only_after_grace() {
        let p = prop("v.testnet", "v.testnet", "InProgress");
        let none = Attendance::default();
        // end 4600 + grace 600 = 5200
        assert!(matches!(run(&p, &bounty(1), &none, &ctx(5200, 0)), Decision::Wait { .. }));
        assert!(matches!(run(&p, &bounty(1), &none, &ctx(5201, 0)), Decision::Remove { .. }));
    }

    #[test]
    fn never_removes_full_attendance() {
        // Attended, new volunteer, long after grace: waits for council, never removed.
        let p = prop("v.testnet", "v.testnet", "InProgress");
        for shifts in 0..5 {
            for now in [5000, 6000, 1_000_000] {
                let d = run(&p, &bounty(500), &attended(45, "org.testnet"), &ctx(now, shifts));
                assert!(!matches!(d, Decision::Remove { .. }), "{d:?}");
            }
        }
    }

    #[test]
    fn partial_or_short_attendance_goes_to_council() {
        let p = prop("v.testnet", "v.testnet", "InProgress");
        let mut only_in = attended(45, "org.testnet");
        only_in.out_ns = None;
        only_in.out_by = None;
        assert!(matches!(run(&p, &bounty(1), &only_in, &ctx(9999, 5)), Decision::Wait { .. }));
        assert!(matches!(run(&p, &bounty(1), &attended(10, "org.testnet"), &ctx(9999, 5)), Decision::Wait { .. }));
    }

    #[test]
    fn never_approves_without_organiser_attestation() {
        let p = prop("v.testnet", "v.testnet", "InProgress");
        let d = run(&p, &bounty(1), &attended(45, "mallory.testnet"), &ctx(5000, 9));
        assert!(!matches!(d, Decision::Approve { .. }));
        let mut mixed = attended(45, "org.testnet");
        mixed.out_by = Some(acc("mallory.testnet"));
        assert!(!matches!(run(&p, &bounty(1), &mixed, &ctx(5000, 9)), Decision::Approve { .. }));
    }

    #[test]
    fn never_votes_on_spoofed_proposals() {
        let p = prop("attacker.testnet", "v.testnet", "InProgress");
        for a in [Attendance::default(), attended(45, "org.testnet")] {
            let d = run(&p, &bounty(1), &a, &ctx(1_000_000, 9));
            assert!(matches!(d, Decision::Ignore { .. }), "{d:?}");
        }
    }

    #[test]
    fn only_bounty_done_in_progress() {
        let transfer = parse_proposal(&json!({"proposer": "v.testnet", "status": "InProgress", "kind": {"Transfer": {"token_id": "", "receiver_id": "v.testnet", "amount": "1"}}})).unwrap();
        assert!(matches!(run(&transfer, &bounty(1), &attended(45, "org.testnet"), &ctx(5000, 9)), Decision::Ignore { .. }));
        for st in ["Approved", "Rejected", "Removed", "Expired", "Failed"] {
            let d = run(&prop("v.testnet", "v.testnet", st), &bounty(1), &attended(45, "org.testnet"), &ctx(5000, 9));
            assert!(matches!(d, Decision::Ignore { .. }));
        }
        // Wrong bounty id passed by the caller.
        let d = decide(3, 8, &prop("v.testnet", "v.testnet", "InProgress"), &bounty(1), &orgs(), &attended(45, "org.testnet"), &ctx(5000, 9));
        assert!(matches!(d, Decision::Ignore { .. }));
    }

    #[test]
    fn duplicate_claim_is_removed() {
        let mut c = ctx(5000, 9);
        c.canonical = Some(2);
        let d = run(&prop("v.testnet", "v.testnet", "InProgress"), &bounty(1), &attended(45, "org.testnet"), &c);
        assert!(matches!(d, Decision::Remove { .. }));
        c.canonical = Some(3);
        let d = run(&prop("v.testnet", "v.testnet", "InProgress"), &bounty(1), &attended(45, "org.testnet"), &c);
        assert_eq!(d, Decision::Approve { minutes: 45 });
    }

    #[test]
    fn given_up_claim_is_left_alone() {
        let mut c = ctx(1_000_000, 9);
        c.has_claim = false;
        let d = run(&prop("v.testnet", "v.testnet", "InProgress"), &bounty(1), &Attendance::default(), &c);
        assert!(matches!(d, Decision::Ignore { .. }), "{d:?}");
    }

    #[test]
    fn no_terms_means_hands_off() {
        let b = BountyInfo { description: "plain bounty".into(), amount: 1 };
        let d = run(&prop("v.testnet", "v.testnet", "InProgress"), &b, &Attendance::default(), &ctx(1_000_000, 9));
        assert!(matches!(d, Decision::Ignore { .. }));
    }

    #[test]
    fn parses_policy_organisers() {
        let policy = json!({"roles": [
            {"name": "council", "kind": {"Group": ["c.testnet"]}},
            {"name": "organiser", "kind": {"Group": ["org.testnet", "org2.testnet"]}},
            {"name": "volunteers", "kind": "Everyone"}
        ]});
        assert_eq!(organisers(&policy), vec![acc("org.testnet"), acc("org2.testnet")]);
        assert!(organisers(&json!({"roles": []})).is_empty());
    }

    #[test]
    fn parses_bounty_json() {
        let b = parse_bounty(&json!({"id": 7, "description": DESC, "token": "", "amount": "100000000000000000000000", "times": 10, "max_deadline": "1"})).unwrap();
        assert_eq!(b.amount, 100_000_000_000_000_000_000_000);
    }
}
