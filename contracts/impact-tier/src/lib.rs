//! impact-tier: holds the `tier` role in one Muster community's Sputnik DAO.
//!
//! * Organisers record check-in/out with `attest` (works from a FunctionCall access key).
//! * Anyone calls `settle(proposal_id, bounty_id)`: the contract reads the proposal, bounty and
//!   policy from the DAO in one joint promise, then votes `VoteApprove` (attended, trusted, within
//!   cap), `VoteRemove` (no-show or duplicate: the bond stays with the DAO), or does nothing.
//! * `credit` adds a council-approved, attested shift to the volunteer's verified record.
//!
//! The contract has no owner and no admin methods. After deployment all access keys are deleted,
//! so nobody can change its code or configuration. To change the rules, deploy a new contract
//! and let the DAO vote to move the `tier` role to it.

pub mod decide;
pub mod terms;

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{LookupMap, LookupSet, Vector};
use near_sdk::{
    env, ext_contract, log, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    PromiseResult,
};

use decide::{decide, has_claim, organisers, parse_bounty, parse_proposal, Attendance, Context, Decision};

const GAS_VIEW: Gas = Gas::from_tgas(10);
const GAS_ON_ATTEST: Gas = Gas::from_tgas(15);
const GAS_ON_SETTLE: Gas = Gas::from_tgas(150);
const GAS_ACT: Gas = Gas::from_tgas(80);
const GAS_ON_VOTED: Gas = Gas::from_tgas(20);
const GAS_ON_CREDIT: Gas = Gas::from_tgas(20);

#[ext_contract(ext_dao)]
#[allow(dead_code)]
trait SputnikDao {
    fn get_proposal(&self, id: u64) -> Value;
    fn get_bounty(&self, id: u64) -> Value;
    fn get_policy(&self) -> Value;
    fn get_bounty_claims(&self, account_id: AccountId) -> Value;
    fn act_proposal(&mut self, id: u64, action: String, proposal: Value, memo: Option<String>);
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    In,
    Out,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub proposal_id: u64,
    pub bounty_id: u64,
    pub minutes: u64,
    /// "tier" (auto-approved by this contract) or "council".
    pub approved_by: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Record {
    pub shifts: u32,
    pub minutes: u64,
    pub entries: Vec<Entry>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Outcome {
    pub proposal_id: u64,
    pub bounty_id: u64,
    pub account: AccountId,
    /// "approved", "removed" or "credited".
    pub outcome: String,
    pub minutes: u64,
    pub reason: String,
    pub at_ns: u64,
}

#[near(serializers = [json])]
pub struct Config {
    pub dao: AccountId,
    pub auto_cap: U128,
    pub trusted_after: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ImpactTier {
    dao: AccountId,
    auto_cap: u128,
    trusted_after: u32,
    attendance: LookupMap<(u64, AccountId), Attendance>,
    /// The first proposal settled for a (bounty, volunteer); any other is a duplicate.
    canonical: LookupMap<(u64, AccountId), u64>,
    records: LookupMap<AccountId, Record>,
    credited: LookupSet<u64>,
    outcomes: Vector<Outcome>,
}

fn event(name: &str, data: Value) {
    log!("EVENT_JSON:{}", json!({"standard": "muster", "version": "1.0.0", "event": name, "data": [data]}));
}

#[allow(deprecated)]
fn last_result_ok() -> bool {
    matches!(env::promise_result(0), PromiseResult::Successful(_))
}

#[allow(deprecated)]
fn result_json(i: u64) -> Option<Value> {
    match env::promise_result(i) {
        PromiseResult::Successful(bytes) => serde_json::from_slice(&bytes).ok(),
        _ => None,
    }
}

#[near]
impl ImpactTier {
    #[init]
    pub fn new(dao: AccountId, auto_cap: U128, trusted_after: u32) -> Self {
        Self {
            dao,
            auto_cap: auto_cap.0,
            trusted_after,
            attendance: LookupMap::new(b"a"),
            canonical: LookupMap::new(b"c"),
            records: LookupMap::new(b"r"),
            credited: LookupSet::new(b"k"),
            outcomes: Vector::new(b"o"),
        }
    }

    // ---------- attendance ----------

    /// Records a check-in or check-out for `volunteer` on `bounty_id` at the current block time.
    /// The caller must hold the DAO's `organiser` role (checked against the live policy).
    pub fn attest(&mut self, bounty_id: u64, volunteer: AccountId, kind: Kind) -> Promise {
        ext_dao::ext(self.dao.clone())
            .with_static_gas(GAS_VIEW)
            .get_policy()
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_ATTEST).on_attest(
                bounty_id,
                volunteer,
                kind,
                env::predecessor_account_id(),
                env::block_timestamp(),
            ))
    }

    #[private]
    pub fn on_attest(&mut self, bounty_id: u64, volunteer: AccountId, kind: Kind, by: AccountId, at_ns: u64) -> Attendance {
        let policy = result_json(0).unwrap_or_else(|| env::panic_str("ERR_POLICY_UNAVAILABLE"));
        if !organisers(&policy).contains(&by) {
            env::panic_str("ERR_NOT_ORGANISER");
        }
        let key = (bounty_id, volunteer.clone());
        let mut a = self.attendance.get(&key).cloned().unwrap_or_default();
        match kind {
            Kind::In => {
                if a.in_ns.is_none() {
                    a.in_ns = Some(at_ns);
                    a.in_by = Some(by.clone());
                }
            }
            Kind::Out => {
                let Some(i) = a.in_ns else { env::panic_str("ERR_NO_CHECK_IN") };
                if at_ns <= i {
                    env::panic_str("ERR_OUT_BEFORE_IN");
                }
                a.out_ns = Some(at_ns);
                a.out_by = Some(by.clone());
            }
        }
        self.attendance.insert(key, a.clone());
        event("attest", json!({"bounty_id": bounty_id, "volunteer": volunteer, "kind": kind, "by": by, "at_ns": at_ns.to_string()}));
        a
    }

    // ---------- settlement ----------

    /// Anyone may call. Reads the proposal, bounty, policy and the volunteer's live claims in one
    /// joint promise, then votes or waits. `account` is the proposal's receiver.
    pub fn settle(&mut self, proposal_id: u64, bounty_id: u64, account: AccountId) -> Promise {
        let dao = || ext_dao::ext(self.dao.clone()).with_static_gas(GAS_VIEW);
        dao().get_proposal(proposal_id)
            .and(dao().get_bounty(bounty_id))
            .and(dao().get_policy())
            .and(dao().get_bounty_claims(account.clone()))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_SETTLE).on_settle(proposal_id, bounty_id, account))
    }

    #[private]
    pub fn on_settle(&mut self, proposal_id: u64, bounty_id: u64, account: AccountId) -> PromiseOrValue<Decision> {
        let (Some(pv), Some(bv), Some(pol), Some(claims)) = (result_json(0), result_json(1), result_json(2), result_json(3)) else {
            return PromiseOrValue::Value(Decision::Ignore { reason: "proposal, bounty, policy or claims unavailable".into() });
        };
        let (Some(p), Some(b)) = (parse_proposal(&pv), parse_bounty(&bv)) else {
            return PromiseOrValue::Value(Decision::Ignore { reason: "unreadable proposal or bounty".into() });
        };
        let receiver = match &p.bounty_done {
            Some((_, r)) => r.clone(),
            None => p.proposer.clone(),
        };
        if receiver != account {
            return PromiseOrValue::Value(Decision::Ignore { reason: "account is not the proposal's receiver".into() });
        }
        let key = (bounty_id, receiver.clone());
        let att = self.attendance.get(&key).cloned().unwrap_or_default();
        let ctx = Context {
            now_ns: env::block_timestamp(),
            trusted_after: self.trusted_after,
            auto_cap: self.auto_cap,
            record_shifts: self.records.get(&receiver).map(|r| r.shifts).unwrap_or(0),
            canonical: self.canonical.get(&key).copied(),
            has_claim: has_claim(&claims, bounty_id),
        };
        let d = decide(proposal_id, bounty_id, &p, &b, &organisers(&pol), &att, &ctx);
        if !matches!(d, Decision::Ignore { .. }) && ctx.canonical.is_none() {
            self.canonical.insert(key, proposal_id);
        }
        event("settle", json!({"proposal_id": proposal_id, "bounty_id": bounty_id, "account": receiver, "result": d}));
        let (action, minutes, reason) = match &d {
            Decision::Approve { minutes } => ("VoteApprove", *minutes, "attended".to_string()),
            Decision::Remove { reason } => ("VoteRemove", 0, reason.clone()),
            _ => return PromiseOrValue::Value(d),
        };
        ext_dao::ext(self.dao.clone())
            .with_static_gas(GAS_ACT)
            .act_proposal(proposal_id, action.to_string(), p.kind.clone(), Some(format!("muster: {reason}")))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_VOTED).on_voted(
                proposal_id,
                bounty_id,
                receiver,
                action == "VoteApprove",
                minutes,
                reason,
            ))
            .into()
    }

    #[private]
    pub fn on_voted(&mut self, proposal_id: u64, bounty_id: u64, account: AccountId, approved: bool, minutes: u64, reason: String) -> bool {
        if !last_result_ok() {
            log!("vote on proposal {} failed", proposal_id);
            return false;
        }
        if approved {
            self.internal_credit(proposal_id, bounty_id, &account, minutes, "tier");
        }
        self.push_outcome(proposal_id, bounty_id, &account, if approved { "approved" } else { "removed" }, minutes, reason);
        true
    }

    /// Credits a council-approved shift to the volunteer's record once, if organisers attested it.
    pub fn credit(&mut self, proposal_id: u64, bounty_id: u64) -> Promise {
        let dao = || ext_dao::ext(self.dao.clone()).with_static_gas(GAS_VIEW);
        dao().get_proposal(proposal_id)
            .and(dao().get_bounty(bounty_id))
            .and(dao().get_policy())
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_CREDIT).on_credit(proposal_id, bounty_id))
    }

    #[private]
    pub fn on_credit(&mut self, proposal_id: u64, bounty_id: u64) -> u64 {
        let (Some(pv), Some(bv), Some(pol)) = (result_json(0), result_json(1), result_json(2)) else {
            env::panic_str("ERR_DAO_UNAVAILABLE")
        };
        let p = parse_proposal(&pv).unwrap_or_else(|| env::panic_str("ERR_BAD_PROPOSAL"));
        let b = parse_bounty(&bv).unwrap_or_else(|| env::panic_str("ERR_BAD_BOUNTY"));
        let Some((pb, receiver)) = p.bounty_done.clone() else { env::panic_str("ERR_NOT_BOUNTY_DONE") };
        assert_eq!(pb, bounty_id, "ERR_BOUNTY_MISMATCH");
        assert_eq!(p.status, "Approved", "ERR_NOT_APPROVED");
        assert_eq!(p.proposer, receiver, "ERR_PROPOSER_NOT_RECEIVER");
        assert!(!self.credited.contains(&proposal_id), "ERR_ALREADY_CREDITED");
        let t = terms::parse(&b.description).unwrap_or_else(|| env::panic_str("ERR_NO_TERMS"));
        let att = self.attendance.get(&(bounty_id, receiver.clone())).cloned().unwrap_or_default();
        assert!(att.attested_by(&organisers(&pol)), "ERR_NOT_ATTESTED");
        let minutes = att.minutes().unwrap_or(0);
        assert!(minutes >= t.min_minutes, "ERR_TOO_SHORT");
        self.internal_credit(proposal_id, bounty_id, &receiver, minutes, "council");
        self.push_outcome(proposal_id, bounty_id, &receiver, "credited", minutes, "council approved".into());
        minutes
    }

    fn internal_credit(&mut self, proposal_id: u64, bounty_id: u64, account: &AccountId, minutes: u64, by: &str) {
        if !self.credited.insert(proposal_id) {
            return;
        }
        let mut r = self.records.get(account).cloned().unwrap_or_default();
        r.shifts += 1;
        r.minutes += minutes;
        r.entries.push(Entry { proposal_id, bounty_id, minutes, approved_by: by.to_string() });
        self.records.insert(account.clone(), r);
        event("credit", json!({"proposal_id": proposal_id, "bounty_id": bounty_id, "account": account, "minutes": minutes, "by": by}));
    }

    fn push_outcome(&mut self, proposal_id: u64, bounty_id: u64, account: &AccountId, outcome: &str, minutes: u64, reason: String) {
        self.outcomes.push(Outcome {
            proposal_id,
            bounty_id,
            account: account.clone(),
            outcome: outcome.to_string(),
            minutes,
            reason,
            at_ns: env::block_timestamp(),
        });
    }

    // ---------- views ----------

    pub fn get_config(&self) -> Config {
        Config { dao: self.dao.clone(), auto_cap: U128(self.auto_cap), trusted_after: self.trusted_after }
    }

    pub fn record_of(&self, account: AccountId) -> Record {
        self.records.get(&account).cloned().unwrap_or_default()
    }

    pub fn attendance_of(&self, bounty_id: u64, account: AccountId) -> Attendance {
        self.attendance.get(&(bounty_id, account)).cloned().unwrap_or_default()
    }

    pub fn canonical_of(&self, bounty_id: u64, account: AccountId) -> Option<u64> {
        self.canonical.get(&(bounty_id, account)).copied()
    }

    pub fn is_credited(&self, proposal_id: u64) -> bool {
        self.credited.contains(&proposal_id)
    }

    pub fn outcomes_count(&self) -> u32 {
        self.outcomes.len()
    }

    pub fn outcomes(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Outcome> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(100).min(200);
        (from..self.outcomes.len().min(from.saturating_add(limit)))
            .filter_map(|i| self.outcomes.get(i).cloned())
            .collect()
    }

    /// Storage the contract can still pay for (attestations are paid from its balance).
    pub fn storage_headroom(&self) -> NearToken {
        let used = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
        env::account_balance().saturating_sub(used)
    }
}

#[cfg(test)]
mod tests;
