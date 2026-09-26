// packages/verifier/src/screen/node.ts — Node-only .env.local-aware screening resolver
// ("@enf/verifier/screen/node").
//
// Both scripts/verify.ts (CLI) and the app's /api/verify route need to agree on exactly which
// screening config is active, so this is the one place that reconciles process.env with the
// repo-root .env.local file: process.env wins for scalar keys, and SCREEN_FLAGGED is the UNION
// of both sources (an entry written to .env.local by scripts/demo-dirty-settlement.ts is never
// masked by, nor masks, a shell-exported value). Previously the CLI relied on dotenv's
// load-once-at-import semantics (shell wins, no union) while the app did this union by hand —
// the two could disagree on SCREEN_FLAGGED. This module is the single resolver for both.

import { existsSync, readFileSync } from "node:fs";
import { type ScreenEnv, type ScreenSelection, screenFromEnv } from "./index";

export const SCREEN_ENV_KEYS = [
  "INTERCEPTA_API_KEY",
  "INTERCEPTA_BASE_URL",
  "INTERCEPTA_SCAN",
  "INTERCEPTA_FLAG_AT",
  "INTERCEPTA_TIMEOUT_MS",
  "INTERCEPTA_CACHE_TTL_MS",
  "SCREEN_FLAGGED",
  "SCREEN_SANCTIONS",
  "SANCTIONS_RPC_URL",
] as const;

/** Minimal KEY=value reader — only the screening keys above are taken from the file. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && (SCREEN_ENV_KEYS as readonly string[]).includes(m[1]!)) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * Resolves the screening selection from `env` (normally process.env) plus the .env.local-style
 * file at `envFilePath`. process.env wins for scalar keys; SCREEN_FLAGGED is unioned across both.
 */
export function screenFromEnvFile(env: ScreenEnv, envFilePath: string): ScreenSelection {
  const fileEnv = readEnvFile(envFilePath);
  const merged: ScreenEnv = {};
  for (const k of SCREEN_ENV_KEYS) merged[k] = env[k] || fileEnv[k];
  merged.SCREEN_FLAGGED = [env.SCREEN_FLAGGED, fileEnv.SCREEN_FLAGGED].filter(Boolean).join(",") || undefined;
  return screenFromEnv(merged);
}
