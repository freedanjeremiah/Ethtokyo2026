# Intercepta screening (check C5)

ENF asks two orthogonal questions about `<agent>.support.<parent>.eth`:

1. **Is this doorway endorsed?** ENS checks C1 to C4 (green / red / black).
2. **Is the party behind it clean?** C5: the fleet's settlement address, `addr(60)` from the shared default record, is screened. If it is flagged, the verdict is **orange** ("endorsed doorway, flagged counterparty").

A counterfeit mount (`mia.support.scam.eth`) resolves to the *same clean address*, so screening alone passes it; ENS makes it red. A legit fleet whose settlement address is dirty passes ENS alone; screening makes it orange. Only both checks together catch both cases.

## Intercepta API (as documented, fetched 2026-09-26)

Source: https://docs.web3antivirus.io/llms.txt (Intercepta's "W3A API"; https://intercepta.io links its API reference to https://docs.web3antivirus.io/reference/api-overview).

| | |
|---|---|
| Quick Scan Address | `GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan` (https://docs.web3antivirus.io/reference/quick-scan-address.md) |
| Deep Scan Address | `GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/toxic-score` (https://docs.web3antivirus.io/reference/scan-address.md) |
| Auth | header `X-API-KEY: <key>` (OpenAPI `securitySchemes`) |
| 200 body | `{ toxicScore: number, traits: [{ risk: number, name: string, txsCount: number, description: string }] }` |
| Trait names | `known_scammer`, `initiator_scam_transactions`, `sanction_address_communication`, `suspicious_dex_pair_deployer`, `suspicious_deployer`, `attack_money_target`, `zero_address_risk`, `sanction_address`, `fake_phishing_transfer`, `non_kyc_transfers`, `mixer_transfers`, `fake_phishing_contract_communication`, `rug_pull`, `rug_pull_trader`, `blacklist` |
| Key | request via the form on https://docs.web3antivirus.io/reference/getting-started-1 (free "Start" plan with limited credits) |
| Bad key | observed: HTTP 403 `{"status":403,"response":"This authentication key is incorrect or doesn’t exist",...}` |

The docs do **not** define a score scale, a clean/flagged threshold, rate limits, or the behaviour for testnets (the supported-chain list is mainnets only: Ethereum, Base, OP, Arbitrum, ...; there is no chain parameter on these endpoints).

## Implementation

`packages/verifier/src/screen/` (import from `@enf/verifier/screen`; the verifier core only sees the injected `Screen`):

- `intercepta.ts`: `interceptaScreen({ apiKey, baseUrl?, scan?, flagAt?, timeoutMs?, cacheTtlMs? })`. **Flagged** when `toxicScore >= flagAt` or any trait `risk >= flagAt` (default 50: ENF's choice, not Intercepta's). Any timeout, network error, non-200 (incl. 403/404/429) or unexpected body means **unknown**, never clean and never a throw. Clean and flagged answers are cached per address for `cacheTtlMs` (60 s); unknown is not cached.
- `static-list.ts`: flags exactly the addresses in `SCREEN_FLAGGED`, everything else is clean.
- `index.ts`: `screenFromEnv(env)` returns `{ screen, source, description }`:
  - `INTERCEPTA_API_KEY` set: Intercepta. If `SCREEN_FLAGGED` is also set, it is a local deny-list checked first (listed means flagged without an API call; everything else goes to Intercepta). This lets the scripted demo work even with a real key.
  - else `SCREEN_FLAGGED` set: static list.
  - else: none, and C5 is omitted.

Used server side only by `app/src/app/api/verify/route.ts` (via `getScreening()` in `app/src/lib/deployment.server.ts`, which reads these keys from `process.env` first, then the repo-root `.env.local`, re-checked on every request) and by `scripts/verify.ts`. The key never reaches the browser.

UI: flagged gives an ORANGE card plus the line "Endorsed doorway, flagged counterparty ...", and every doorway chip gets a "flagged counterparty" tag. Unknown keeps the ENS verdict word but the card shows a dashed **SCREENING UNAVAILABLE** badge, C5 shows `N/A`, and every chip gets a "screening unavailable" tag. It is never silently green.

## Demo (fork)

```
npx tsx scripts/demo-dirty-settlement.ts   # operator: ONE multicall sets default addr(60) = DIRTY_SETTLEMENT_ADDRESS
                                           # (derived: keccak256(OPERATOR_PK || "enf.dirty-settlement.v1")),
                                           # and appends it to SCREEN_FLAGGED in .env.local
# every endorsed doorway of every member is ORANGE; mia.support.scam.eth stays RED
npx tsx scripts/demo-clean-settlement.ts   # operator: restores SETTLEMENT_ADDRESS (demo-reset.ts does this too)
```

Both are idempotent. The app picks up `SCREEN_FLAGGED` from `.env.local` without a restart.

## To fill at the event

1. Get a key (form above, or Intercepta's booth) and set `INTERCEPTA_API_KEY` in `.env.local` (server env on Vercel). Never set it as `NEXT_PUBLIC_*`.
2. Sanity-check with a known-bad mainnet address from the docs' example:
   `curl -H "X-API-KEY: $INTERCEPTA_API_KEY" https://api.web3antivirus.io/api/public/v2/extension/account/0x0d775e010f0b6c32c9468d43ba599ef47d596e47/quick-scan`
   Confirm the body shape above and the score scale, then adjust `INTERCEPTA_FLAG_AT` if needed. Also ask Intercepta what threshold they recommend.
3. Decide on the demo's dirty address. Our Sepolia test addresses have no history, so Intercepta will call them clean (or 404, which means unknown). The default path keeps `SCREEN_FLAGGED` as the deny-list overlay. To make the orange come from the live API instead, change `DIRTY_SETTLEMENT_DERIVATION_TAG`'s caller `ensureDirtySettlementAddress()` in `scripts/lib/fleet.ts` to return an address Intercepta itself flags (for example a sanctioned mainnet address), clear `SCREEN_FLAGGED`, and rerun `demo-dirty-settlement.ts`. `scripts/verify.ts` then shows the Intercepta reason.
4. Ask whether Intercepta screens testnet (Sepolia) addresses at all. The docs list mainnets only.
