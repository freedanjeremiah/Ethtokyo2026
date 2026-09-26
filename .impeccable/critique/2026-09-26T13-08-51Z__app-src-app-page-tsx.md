---
target: ENF dashboard seamless for everyone
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/freedan/Desktop/ISYS1055_A2/Ethtokyo2026/app/src/app/page.tsx"
target_fingerprint: "sha256:2aaf5be408511491a3655b525330eb789556bd14e115c1132516b956a6ab2ed8"
target_path: /Users/freedan/Desktop/ISYS1055_A2/Ethtokyo2026/app/src/app/page.tsx
timestamp: 2026-09-26T13-08-51Z
slug: app-src-app-page-tsx
---
# Critique: ENF dashboard (app/src/app/page.tsx), 2026-09-26
Degraded single-context run. Score 23/40 (Acceptable).
Heuristics: 1=2 2=2 3=3 4=2 5=2 6=3 7=2 8=3 9=3 10=1
## Priority issues
- [P0] Inspector and Coverage/Map disagree about the same name (Verified 0xe284 vs Flagged 0x098B): the ~12s fleet scan and the fast verify land at different blocks, and nothing says which block each panel shows. Fix: pin verify to the scan's block, or derive the selected cell's verdict from scan.cells and label every panel with its block. -> harden
- [P1] Cold load takes ~12.5s and meanwhile Kill switches claim "Nothing is mounted / No active agents / Currently none, unknown". Fix: skeleton Controls while scan is null; speed up or stream the scan. -> harden
- [P1] Accessibility: block-pill aria-live announces every block; search shows role=alert errors while the user is still typing (debounce commits); Coverage focus highlight is mouse-only; on mobile the searched name's verdict is ~3000px below the search box. -> audit, adapt
- [P1] Kill switches are enabled and tagged "Sepolia" -> one click sends a real tx with no confirmation; PRODUCT.md says they never run on live chains. -> harden
- [P2] Cold-visitor jargon: C1-C5, enf.parents, canonical registry, doorway; H1 is a bare "support.vendor.eth"; no one-line guide for how to read the page. -> clarify, onboard
## Minor
- Port 3000 server serves a stale build (CSS/JS chunks 404) -> unstyled page if that's the demo URL.
- Vocabulary drift: legend "Not live" vs tags "Unmounted/Never mounted/Fired"; verdict "Verified" vs map "Endorsed".
- "0 of 12 verified" counts the counterfeit column; reads worse than the real state.
- Inspector dims to 60% on every block refresh.
- No ?name= URL state, so a verdict can't be shared or bookmarked.
- Next.js dev "N" badge visible; demo from a production build.
