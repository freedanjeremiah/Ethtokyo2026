# Runbook evidence (fork run)

Trimmed command-by-command output from the fork runbook in [`README.md`](../README.md) §7,
executed end to end during Task 9. Addresses shown are the actors/contracts generated for that
run (fresh keys, never committed); no private keys appear anywhere below.

## Setup

```
$ SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co scripts/fork.sh   (background)
Listening on 127.0.0.1:8545
```

```
$ npx tsx scripts/00-keys.ts
.env.local: .../.env.local
  VENDOR   0x1607846398FeF2cB4573445160B57aBA3fB68dDB  (kept)
  OPERATOR 0x7A9092d9C7fFEc85f2ba5ED037B4FCC9e845b05B  (kept)
  SHOPA    0x1c193c104fa0D40611376D02E165994e023B9FD5  (kept)
  SHOPB    0xf32E0573453494FE3260b34EC4E32D81A5e47a28  (kept)
  SCAM     0x38083F9e150ab8851e04c242DAf3b31D00E848bf  (kept)
  MIA      0x00107c5e51b62bd50418e388FDfc45A93d46d11D  (kept)
  KAI      0x7b91E8F55a8484f846ae1e825bD2eA1480F757cF  (kept)
  RIN      0x85Ca78Db7F50159d843765572055b5e254b4Fcfc  (kept)
anvil fork detected — funding each actor with 100 ETH
  (all 8 actors -> 100 ETH)
```

```
$ npx tsx scripts/setup-all.ts
=== setup-names.ts
vendor.eth/shopa.eth/shopb.eth/shopa.eth/shopb.eth/scam.eth all registered; ownership verified OK.

=== 01-deploy-fleet.ts
fleet registry   0x02400CF3D99d8F2571c8C199731258606A6dF008 (deployed)
shared resolver  0x59908770b70DF7DE6a1Cd68d8ab627daDB8Bfe76 (deployed)

=== 02-mount.ts
vendor.eth registry 0xc05bAC88772156B693153D5bB60C6847f2561e95; support.vendor.eth -> fleet: registered
shopa.eth registry 0x7B709a06Ea69b3c2BFBb71086fC43041a07FBE2e; support.shopa.eth -> fleet: registered
shopb.eth registry 0xc7923D24a12E0dc5DCCE60CB4aE3c91bFdE4FB1F; support.shopb.eth -> fleet: registered
scam.eth registry 0x5E4Cd3695Aa911341fE69FeCC4b2c9D2035eddFd (counterfeit); support.scam.eth -> fleet: registered
canonical parents: vendor registry.setParent(ETHRegistry, "vendor"); fleet registry.setParent(vendorRegistry, "support")

=== 03-register.ts
mia -> 0x00107c5e...: registered
kai -> 0x7b91E8F5...: registered
rin -> 0x85Ca78Db...: registered

=== 04-records.ts
addr(60) -> 0x532D761cC9b12B0d6f7B9ed2f6C0cFEd7cD1420d
enf.canonical -> support.vendor.eth
enf.parents -> support.vendor.eth,support.shopa.eth,support.shopb.eth
agent-context -> https://enf.example/fleet
agent-endpoint[web] -> https://enf.example/fleet/chat

setup-all: done [exit 0]
```

## Acceptance checks

```
$ npx tsx scripts/check-resolution.ts
RPC http://127.0.0.1:8545; UR = viem sepolia default 0xeeeeeeee14d718c2b47d9923deab1335e144eeee
OK mia/kai/rin . support.{shopa,shopb,vendor,scam}.eth -> 0x532D761c...420d   (12/12)
OK nobody.support.shopa.eth -> null
OK support.shopa.eth -> null
OK enf.canonical / enf.parents text records match
all resolution checks passed
```

```
$ cd contracts && SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co forge test --fork-url "$SEPOLIA_RPC_URL" -vv
Ran 10 tests for test/Mount.t.sol:MountTest
[PASS] test_counterfeitMountResolves() (gas: 2271794)
[PASS] test_defaultBundleZeroMemberWrites() (gas: 8894827)
[PASS] test_memberCannotWriteSharedResolver() (gas: 1069406)
[PASS] test_merchantUnmountKillsOnlyItsDoorway() (gas: 4778715)
[PASS] test_nonMemberAndParentHaveNoResolver() (gas: 1827999)
[PASS] test_oneTokenThreeMounts() (gas: 2085944)
[PASS] test_parentLapseKillsOnlyThatDoorway() (gas: 3708096)
[PASS] test_scopedMemberRoleWouldRewriteEveryone() (gas: 2000282)
[PASS] test_soulboundEvenViaApprovedOperator() (gas: 1101490)
[PASS] test_vendorUnregisterKillsAllDoorways() (gas: 4946978)
Suite result: ok. 10 passed; 0 failed; 0 skipped
```

```
$ npm test -w packages/verifier
 ✓ test/fork.test.ts (24 tests)
 ✓ test/screen.test.ts (32 tests)
 ✓ test/pure.test.ts (18 tests)
 ✓ test/errors.test.ts (6 tests)
Test Files  4 passed (4)
Tests  80 passed (80)
```

## Verifier CLI examples (truth table)

```
$ npx tsx scripts/verify.ts mia.support.shopa.eth
VERDICT  GREEN   mounted by support.shopa.eth (canonical support.vendor.eth)
C1 PASS / C2 PASS (doorway registry is the registry of support.vendor.eth) / C3 PASS / C4 PASS / C5 PASS (clean)

$ npx tsx scripts/verify.ts mia.support.scam.eth
VERDICT  RED     counterfeit mount: C3 failed
C1 PASS / C2 PASS (registry IS the canonical fleet registry — confirms C2 passes "by construction") /
C3 FAIL (support.scam.eth not in enf.parents) / C4 PASS / C5 PASS (clean, same address as legit mounts)

$ npx tsx scripts/verify.ts bob.support.shopa.eth
VERDICT  BLACK   not a member: no resolver for bob.support.shopa.eth (ResolverNotFound)
```

## App + demo beats (dev server on http://localhost:3000, fork running)

```
$ npm run dev -w app   (background)
$ curl .../api/block -> {"blockNumber":"11785007"}
```

Beat 1 — merchant B unmounts (one tx):
```
before: curl /api/verify?name=mia.support.shopb.eth -> green
$ npx tsx scripts/demo-unmount.ts shopb
    tx SHOPB setSubregistry(support.shopb.eth, 0x0): 0xf4fa6775... (gas 43238)
after:  mia.support.shopb.eth -> black (ResolverNotFound)
        mia.support.shopa.eth -> still green
```

Beat 2 — vendor unregisters mia (one tx):
```
before: mia.support.vendor.eth -> green
$ npx tsx scripts/demo-unregister.ts mia
    tx VENDOR unregister(mia): 0x27983802... (gas 55564)
after:  mia.support.vendor.eth -> black
        mia.support.scam.eth   -> black (mia is gone everywhere, incl. the counterfeit mount)
        kai.support.vendor.eth -> still green (unaffected)
```

Beat 4 — counterfeit mount, live (using kai since mia was just unregistered):
```
$ curl /api/verify?name=kai.support.scam.eth
red   counterfeit mount: C3 failed
reasons: ["C3 two-sided consent: support.scam.eth is not in enf.parents [...]: the fleet never endorsed this doorway"]
```

Beat 5 — Intercepta orange:
```
$ npx tsx scripts/demo-dirty-settlement.ts
    tx resolver.multicall(1 default-record writes): 0xdd8947f5... (gas 52047)
    addr(60) -> 0x68ba4292B31c2B64aD9CF2D32d4e1Db6Ed95a693 (flagged: listed in SCREEN_FLAGGED)
$ curl /api/verify?name=kai.support.shopa.eth -> orange "endorsed doorway, flagged counterparty"
$ curl /api/verify?name=kai.support.scam.eth  -> red (unchanged — ENS precedence over screening)
```

Cleanup:
```
$ npx tsx scripts/demo-clean-settlement.ts
    addr(60) -> 0x532D761cC9b12B0d6f7B9ed2f6C0cFEd7cD1420d
    kai.support.shopa.eth -> green again
$ npx tsx scripts/demo-reset.ts
    support.shopb.eth: mounted (1 tx)
    mia: registered (1 tx, fresh tokenId)
    kai/rin: ok (no change)
    default record: ok (no change)
$ npx tsx scripts/check-resolution.ts -> all resolution checks passed
```

Fork and dev server stopped (`pkill -f "next dev"`, `pkill -f anvil`); no processes remained.

### Live Sepolia

Not executed — requires funded keys, a human step outside autonomous execution scope (see
`README.md` §7.6).

Full narrative (including task context, concerns, and a fix round) is in the (gitignored)
`.superpowers/sdd/IMPLEMENTATION_PLAN/task-9-report.md`, not part of this clone.
