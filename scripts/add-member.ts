// Adds an account to a DAO role by council vote (AddMemberToRole, approved by every council member).
//   npm run add-member -- <account> <role>
import { loadConfig } from "./lib/config.js";
import { act, addProposal } from "./lib/dao.js";
import { account, log, view } from "./lib/near.js";

const [member, role] = process.argv.slice(2);
if (!member || !role) throw new Error("usage: npm run add-member -- <account> <role>");
const cfg = loadConfig();
const policy = await view<any>(cfg.dao, "get_policy");
const council: string[] = policy.roles.find((r: any) => r.name === "council").kind.Group;
if ((policy.roles.find((r: any) => r.name === role)?.kind?.Group ?? []).includes(member)) {
  console.log(`${member} is already in ${role}`);
} else {
  const p = await addProposal(account(cfg.council[0]), cfg.dao, `Add ${member} to ${role}`, { AddMemberToRole: { member_id: member, role } });
  log(`propose adding ${member} to ${role}`, p);
  for (const c of cfg.council.filter((c) => council.includes(c))) {
    const after = await view<any>(cfg.dao, "get_proposals", { from_index: p.id!, limit: 1 });
    if (after[0]?.status !== "InProgress") break;
    log(`  ${c} approves`, await act(account(c), cfg.dao, p.id!, "VoteApprove"));
  }
}
console.log(role, (await view<any>(cfg.dao, "get_policy")).roles.find((r: any) => r.name === role).kind.Group);
