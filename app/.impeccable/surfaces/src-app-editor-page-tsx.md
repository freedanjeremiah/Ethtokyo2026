---
version: 1
slug: "src-app-editor-page-tsx"
primary_target: "src/app/editor/page.tsx"
related_targets: ["src/components"]
---

# Playbook editor (/editor)

Scope: the fleet workbench that replaces the old single-route dashboard. Mode: Operate (presenter-driven live demo for ENS-track judges, projector, 3 m).

Audience and job: the presenter composes the demo as a playbook (Unmount, Fire, Use sanctioned address, Restore, Check name, Reset), edits each step's target, and runs it; each chain step is signed in the browser wallet. Judges watch the live map react. Playbooks save in this browser and share as a URL. Everything else from the old dashboard stays: live map, coverage grid, activity, verifier with C1-C5 evidence.

Constraints: category standard played straight (ENS Manager bar, DESIGN.md unchanged). Only actions that already exist on-chain; server holds no keys. Honest states: wallet missing, wrong account, RPC down, step reverted.

## Direction contract

THESIS: The demo is a playbook you can edit, and the live fleet map beside it shows exactly what each step touches. Refuses the node-spaghetti automation canvas that hides the fleet in a drawer.

OWN-WORLD: ENS Manager family per DESIGN.md: neutral canvas, white 16px cards, hairlines, ENS blue for action and selection only, verdict colours for state only, Satoshi, Phosphor bold/fill. Step cards are white pills-and-cards on a vertical spine; the Run button is the one solid blue fill.

STORY: pick or build a playbook, hover a step to see its target outlined on the map, press Run, sign each step, watch doorways dash out and cells flip next block, then check a name for the evidence.

FIRST VIEWPORT: top bar (ENF wordmark linking home, name search, wallet pill, block pill). Left column 420px: playbook title with preset menu, a trigger card, step cards joined by a spine with + inserts between, Run pinned at the column foot. Right: the fleet map as the largest surface; coverage and the run log/verifier beneath it.

FORM: vertical playbook builder beside the live map, position 4 of 7 on the ranked list, seed key b1223964.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
