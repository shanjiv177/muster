//! Campaign terms embedded in the DAO-approved bounty description.
//!
//! The last line of `AddBounty.description` that starts with `MUSTER ` carries JSON:
//! `MUSTER {"start":1763100000,"end":1763107200,"min_minutes":60,"grace_min":30}`
//! (`start`/`end` are unix seconds). The council approves these terms when it approves the
//! bounty, so the contract keeps no campaign registry of its own.

use near_sdk::near;
use near_sdk::serde_json;

pub const PREFIX: &str = "MUSTER ";

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Terms {
    /// Shift start, unix seconds.
    pub start: u64,
    /// Shift end, unix seconds.
    pub end: u64,
    /// Minutes between check-in and check-out needed to count as attended.
    pub min_minutes: u64,
    /// Minutes after `end` before a volunteer with no check-in is treated as a no-show.
    pub grace_min: u64,
}

impl Terms {
    /// Nanosecond timestamp after which a volunteer with no attendance is a no-show.
    pub fn no_show_after_ns(&self) -> u64 {
        self.end
            .saturating_add(self.grace_min.saturating_mul(60))
            .saturating_mul(1_000_000_000)
    }
}

/// Parses the last `MUSTER {...}` line. Returns `None` when absent or malformed, or when the
/// terms are inconsistent (`end <= start`).
pub fn parse(description: &str) -> Option<Terms> {
    let line = description
        .lines()
        .rev()
        .map(str::trim)
        .find(|l| l.starts_with(PREFIX))?;
    let terms: Terms = serde_json::from_str(line[PREFIX.len()..].trim()).ok()?;
    if terms.end <= terms.start {
        return None;
    }
    Some(terms)
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: &str = r#"MUSTER {"start":100,"end":200,"min_minutes":60,"grace_min":30}"#;

    #[test]
    fn parses_last_line() {
        let d = format!("Beach cleanup at Juhu\nBring gloves\n{T}");
        let t = parse(&d).unwrap();
        assert_eq!(t, Terms { start: 100, end: 200, min_minutes: 60, grace_min: 30 });
        assert_eq!(t.no_show_after_ns(), (200 + 30 * 60) * 1_000_000_000);
    }

    #[test]
    fn last_muster_line_wins() {
        let d = format!("MUSTER {{\"start\":1,\"end\":2,\"min_minutes\":1,\"grace_min\":1}}\n{T}");
        assert_eq!(parse(&d).unwrap().start, 100);
    }

    #[test]
    fn rejects_missing_or_bad() {
        assert!(parse("no terms here").is_none());
        assert!(parse("MUSTER {not json}").is_none());
        assert!(parse(r#"MUSTER {"start":100,"end":200}"#).is_none());
        assert!(parse(r#"MUSTER {"start":200,"end":100,"min_minutes":1,"grace_min":1}"#).is_none());
    }
}
