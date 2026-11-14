// Muster NEP-366 relayer: pays gas for organiser check-ins, give-ups, settle and credit.
//
//   npm run relayer                     (reads deployments/testnet.json; key from ~/.near-credentials)
//   env: PORT (8787), RELAYER_ACCOUNT, RELAYER_PRIVATE_KEY (for hosting), ALLOW_ORIGIN (*)
//
// POST /relay  {"signedDelegate": "<base64 borsh SignedDelegate>"}  ->  {ok, hash, link, error}
// GET  /health                                                       ->  relayer id and allowlist
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deserialize } from "borsh";
import { SCHEMA, actions } from "near-api-js";
import type { KeyPairString } from "near-api-js";
import { account, summarize, tgas } from "../../scripts/lib/near.js";
import { ROOT } from "../../scripts/lib/config.js";
import { METHODS, RateLimit, refuse, type Allowlist } from "./policy.js";

const dep = JSON.parse(readFileSync(join(ROOT, "deployments", "testnet.json"), "utf8"));
const RELAYER = process.env.RELAYER_ACCOUNT ?? "muster-relay.testnet";
const relayer = account(RELAYER, process.env.RELAYER_PRIVATE_KEY as KeyPairString | undefined);
const allow: Allowlist = { dao: dep.dao, impactTier: dep.impactTier, maxGas: tgas(300), maxActions: 4 };
const limit = new RateLimit(Number(process.env.RATE_PER_HOUR ?? 120), 3_600_000);
const ORIGIN = process.env.ALLOW_ORIGIN ?? "*";

function reply(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": ORIGIN,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<any> {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 64_000) throw new Error("body too large");
  }
  return JSON.parse(s || "{}");
}

async function relay(b64: string) {
  const sd: any = deserialize(SCHEMA.SignedDelegate as any, Buffer.from(b64, "base64"));
  const d = sd.delegateAction;
  const why = refuse(d, allow);
  if (why) return { status: 403, body: { ok: false, error: why } };
  if (!limit.take(d.senderId)) return { status: 429, body: { ok: false, error: "rate limited" } };
  const res = await relayer.signAndSendTransaction({
    receiverId: d.senderId,
    actions: [actions.signedDelegate({ delegateAction: d, signature: sd.signature })],
    throwOnFailure: false,
    waitUntil: "FINAL",
  } as any);
  const r = summarize(res);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${d.senderId} -> ${d.receiverId}.${d.actions.map((a: any) => a.functionCall.methodName).join("+")} ${r.link}`);
  return { status: 200, body: r };
}

createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return reply(res, 204, {});
    if (req.method === "GET" && req.url === "/health") return reply(res, 200, { relayer: RELAYER, allow: METHODS(allow), deposits: "never relayed" });
    if (req.method === "POST" && req.url === "/relay") {
      const { signedDelegate } = await body(req);
      if (typeof signedDelegate !== "string") return reply(res, 400, { ok: false, error: "signedDelegate (base64) required" });
      const out = await relay(signedDelegate);
      return reply(res, out.status, out.body);
    }
    reply(res, 404, { error: "not found" });
  } catch (e: any) {
    reply(res, 400, { ok: false, error: String(e?.message ?? e) });
  }
}).listen(Number(process.env.PORT ?? 8787), () => console.log(`muster relayer ${RELAYER} on :${process.env.PORT ?? 8787}`, METHODS(allow)));
