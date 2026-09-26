// Shared (client + server) shape of GET /api/verify. Types only — safe to import from client components.
import type { VerifyResult } from "@fns/verifier";

export type ScreeningInfo = {
  /** "intercepta" | "intercepta+static-list" | "static-list" | "none" */
  source: string;
  /** Human description of the active screen. Never contains the API key. */
  description: string;
};

/** The verifier result plus which C5 screen was active. */
export type VerifyApiResponse = VerifyResult & { screening: ScreeningInfo };
