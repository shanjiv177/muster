// Creates the community DAO and the impact-tier contract on testnet. Safe to re-run: each step
// is skipped when already done. Lock impact-tier afterwards with `npm run lock-tier`.
//
//   npm run bootstrap
//   env: DAO_NAME (default muster-juhu), TIER_ID (default v1.muster-tier.testnet)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KeyPair, actions } from "near-api-js";
import { account, accountExists, fc, log, near, send, view, type TxResult } from "./lib/near.js";
import { act, addProposal, createDao, daoId, FACTORY, musterPolicy } from "./lib/dao.js";
import { loadNamedKey, ROOT, saveConfig, saveKey, type MusterConfig } from "./lib/config.js";

const t = (s: string) => `${s}.testnet`;
const DAO_NAME = process.env.DAO_NAME ?? "muster-juhu";
const TIER = process.env.TIER_ID ?? "v1.muster-tier.testnet";
const TIER_PARENT = TIER.split(".").slice(1).join(".");
const COUNCIL = [t("muster-council-1"), t("muster-council-2")];
const ORG = t("muster-org");
const AUTO_CAP = "0.2";
const TRUSTED_AFTER = 1;
const WASM = join(ROOT, "contracts/impact-tier/target/near/impact_tier.wasm");

function must<T extends TxResult>(label: string, r: T): T {
  log(label, r);
  if (!r.ok) throw new Error(`${label} failed: ${r.error}`);
  return r;
}

async function main() {
  const dao = daoId(DAO_NAME);

  // 1. impact-tier account, deployed and initialised in one transaction.
  if (!(await accountExists(TIER))) {
    const kp = KeyPair.fromRandom("ed25519");
    saveKey(TIER, kp);
    const parent = account(TIER_PARENT);
    const code = readFileSync(WASM);
    must(`create + deploy + init ${TIER}`, await send(parent, TIER, [
      actions.createAccount(),
      actions.transfer(near(4)),
      actions.addFullAccessKey(kp.getPublicKey()),
      actions.deployContract(code),
      fc("new", { dao, auto_cap: near(AUTO_CAP).toString(), trusted_after: TRUSTED_AFTER }, 30),
    ]));
  } else console.log(`skip: ${TIER} exists`);

  // 2. Community DAO from the stock factory.
  const daos = await view<string[]>(FACTORY, "get_dao_list");
  if (!daos.includes(dao)) {
    const policy = musterPolicy({
      council: COUNCIL, organisers: [ORG], tier: TIER,
      bountyBond: near(0.5), proposalBond: near(0.01),
      proposalPeriodSec: 14 * 86_400, forgivenessSec: 86_400,
    });
    must(`create DAO ${dao}`, await createDao(account(ORG), DAO_NAME, "Juhu Beach volunteers: verified hours, real RSVPs", policy));
  } else console.log(`skip: ${dao} exists`);

  // 2b. Point the DAO's tier role at this impact-tier (a council vote). This is how the rules
  // contract is upgraded: deploy v<n+1> on a new account, then the DAO moves the role.
  const tierRole = (await view<any>(dao, "get_policy")).roles.find((r: any) => r.name === "tier");
  if (JSON.stringify(tierRole?.kind?.Group ?? []) !== JSON.stringify([TIER])) {
    const role = { ...tierRole, kind: { Group: [TIER] } };
    const p = must(`propose moving the tier role to ${TIER}`, await addProposal(account(COUNCIL[0]), dao, `Move the tier role to ${TIER} (impact-tier upgrade)`, {
      ChangePolicyAddOrUpdateRole: { role },
    }));
    for (const c of COUNCIL) must(`${c} approves`, await act(account(c), dao, p.id!, "VoteApprove"));
  } else console.log(`skip: tier role already ${TIER}`);

  // 3. Turn off factory auto-update: only the DAO's own vote can change its code.
  const fi = await view<any>(dao, "get_factory_info");
  if (fi.auto_update) {
    const p = must("propose FactoryInfoUpdate{auto_update:false}", await addProposal(account(COUNCIL[0]), dao, "Turn off factory auto-update so only this DAO can change its code", {
      FactoryInfoUpdate: { factory_info: { factory_id: FACTORY, auto_update: false } },
    }));
    for (const c of COUNCIL) must(`${c} approves`, await act(account(c), dao, p.id!, "VoteApprove"));
  } else console.log("skip: auto-update already off");

  // 4. Organiser's scoped check-in key: FunctionCall-only, impact-tier `attest` only.
  const keyName = `${ORG}.attest.${TIER}`;
  let attestPub: string;
  const existing = loadNamedKey(keyName);
  if (!existing) {
    const kp = KeyPair.fromRandom("ed25519");
    attestPub = kp.getPublicKey().toString();
    const r = await account(ORG).addFunctionCallAccessKey({ publicKey: attestPub, contractId: TIER, methodNames: ["attest", "set_door_key"], allowance: near(1) } as any);
    console.log(`ok   organiser scoped key ${attestPub} (tx ${(r as any).transaction.hash})`);
    saveKey(ORG, kp, keyName);
  } else {
    attestPub = KeyPair.fromString(existing).getPublicKey().toString();
    console.log("skip: organiser scoped key exists");
  }

  const cfg: MusterConfig = {
    network: "testnet",
    factory: FACTORY,
    dao,
    impactTier: TIER,
    council: COUNCIL,
    organisers: [ORG],
    volunteers: Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((x) => [x, t(`muster-vol-${x}`)])),
    sponsor: COUNCIL[1],
    relayer: t("muster-relay"),
    organiserAttestKey: attestPub,
    autoCapNear: AUTO_CAP,
    trustedAfter: TRUSTED_AFTER,
  };
  saveConfig(cfg);
  console.log("wrote config/testnet.json");
  console.log("tier config", await view(TIER, "get_config"));
}

main().catch((e) => { console.error(e); process.exit(1); });
