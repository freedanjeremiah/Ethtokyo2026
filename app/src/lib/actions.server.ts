// app/src/lib/actions.server.ts — dashboard kill switches (FORK ONLY).
//
// Each action runs one of the existing, fork-tested demo scripts (scripts/demo-*.ts) as a child process, so the
// buttons send exactly the same transactions the runbook does. Targets are checked against the fleet file, never
// passed through as free text. Always refused on Vercel; on a live chain only with ENF_KILL_SWITCHES=live.

import { execFile } from "node:child_process";
import { resolve } from "node:path";
import type { ActionName, ActionResult, ActionsInfo } from "./fleet-types";
import { FleetFileMissingError, REPO_ROOT, getRpcUrl, readFleetFile } from "./deployment.server";
import { rpcClient } from "./rpc.server";

const SCRIPTS: Record<ActionName, { file: string; target?: "parent" | "agent" }> = {
  unmount: { file: "demo-unmount.ts", target: "parent" },
  fire: { file: "demo-unregister.ts", target: "agent" },
  dirty: { file: "demo-dirty-settlement.ts" },
  clean: { file: "demo-clean-settlement.ts" },
  counterfeit: { file: "demo-counterfeit.ts" },
  reset: { file: "demo-reset.ts" },
};

export function isActionName(x: unknown): x is ActionName {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(SCRIPTS, x);
}

async function chainKind(): Promise<"anvil" | "live" | "unreachable"> {
  const client = rpcClient();
  try {
    await client.getBlockNumber();
  } catch {
    return "unreachable";
  }
  try {
    const v = (await client.request({ method: "web3_clientVersion" } as never)) as string;
    return typeof v === "string" && v.toLowerCase().includes("anvil") ? "anvil" : "live";
  } catch {
    return "live";
  }
}

export async function actionsInfo(): Promise<ActionsInfo> {
  const off = (reason: string): ActionsInfo => ({ enabled: false, reason, parents: [], agents: [], chain: null });
  if (process.env.VERCEL) return off("Kill switches are off on Vercel. Run them from the terminal.");
  if (process.env.ENF_KILL_SWITCHES === "off") return off("Turned off by ENF_KILL_SWITCHES=off.");
  const kind = await chainKind();
  if (kind === "unreachable") return off("The chain RPC is unreachable, so kill switches are paused.");
  // On a live chain the buttons send real transactions from the demo keys, so they need an explicit opt-in.
  if (kind === "live" && process.env.ENF_KILL_SWITCHES !== "live")
    return off("Live chain. Kill switches are off unless the server is started with ENF_KILL_SWITCHES=live.");
  let fleet;
  try {
    fleet = readFleetFile();
  } catch (err) {
    if (err instanceof FleetFileMissingError) return off("No fleet file yet. Run scripts/setup-all.ts.");
    throw err;
  }
  return { enabled: true, parents: Object.keys(fleet.parentRegistries ?? {}), agents: Object.keys(fleet.members ?? {}), chain: kind };
}

let busy = false;

export async function runAction(action: ActionName, target: string | undefined): Promise<ActionResult> {
  const info = await actionsInfo();
  if (!info.enabled) return { ok: false, error: info.reason ?? "disabled" };
  const spec = SCRIPTS[action];
  const args: string[] = [];
  if (spec.target) {
    const allowed = spec.target === "parent" ? info.parents : info.agents;
    if (!target || !allowed.includes(target)) return { ok: false, error: `unknown ${spec.target} "${target ?? ""}" (expected ${allowed.join(", ")})` };
    args.push(target);
  }
  if (busy) return { ok: false, error: "another action is still running" };
  busy = true;
  try {
    const tsx = resolve(REPO_ROOT, "node_modules", ".bin", "tsx");
    return await new Promise<ActionResult>((done) => {
      execFile(
        tsx,
        [resolve(REPO_ROOT, "scripts", spec.file), ...args],
        // ACTIONS_RPC_URL lets transactions use a different endpoint than the dashboard's per-block reads, so the
        // two never compete for one free RPC's rate limit. Both must be the same chain.
        { cwd: REPO_ROOT, env: { ...process.env, RPC_URL: process.env.ACTIONS_RPC_URL || getRpcUrl() }, timeout: 180_000, maxBuffer: 1 << 20 },
        (err, stdout, stderr) => {
          const output = `${stdout}${stderr}`.trim();
          if (err) done({ ok: false, error: err.message.split("\n")[0] ?? "script failed", output });
          else done({ ok: true, output });
        },
      );
    });
  } finally {
    busy = false;
  }
}
