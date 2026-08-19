# Hallucinated-package check — design and measurements

W3.1. Design note first, per the approved Phase 2 sequence: design → `tooling/ci/` with
self-tests → hops PR. Written 2026-08-19. Implementation:
`tooling/ci/slopsquat/check_new_deps.py`, self-tests alongside it.

## The threat, stated precisely

An LLM asked for a library suggests a package name that does not exist. Measured at **19.7% of
LLM-recommended packages** (USENIX Security 2025). The names are not random — they are plausible
and *repeatable*, so an attacker can enumerate what models hallucinate, register those names, and
wait. The victim does not typo anything; the agent confidently installs its own suggestion.

This is distinct from classic typosquatting (a human mistypes) and from dependency confusion (an
internal name is shadowed publicly). It is specific to AI-assisted development, which is why it
belongs to this capability rather than to general supply-chain hygiene.

## What we already have, and why it does not cover this

`hop-ui` now sets pnpm `minimumReleaseAge: 1440` (W1.1, merged as PR #515). That delays installing
any **version** published in the last 24 hours. Against slopsquatting it buys almost nothing: the
attacker registers the name and waits. After 24 hours the package installs normally, and the
cooldown has no opinion about a package *name* appearing in our manifest for the first time.

The two controls are on different axes — cooldown covers *new versions of packages we already
trust*, this check covers *names we have never depended on before*. Neither substitutes for the
other, and saying "we have the cooldown" is the mistake this section exists to prevent.

## Design decisions

**Only newly added dependencies are checked.** Packages already on the base branch are not this
PR's problem, and re-checking them would produce a standing wall of noise that trains people to
ignore the job. A version bump of an existing dependency is out of scope — that is the cooldown's
job.

**Only registry-resolved specifiers are checked.** This is the first false positive the check
would have produced, and it is not hypothetical: `hop-ui` depends on
`eslint-plugin-no-date-fns-format` and `eslint-plugin-no-string-date`, both `link:` to
`hop-ui/eslint-rules/`. Neither exists on npm. A check that reads names and not specifiers reports
2 hallucinated packages in a healthy manifest on its very first run — 2 of 111, and both would be
wrong. Skipped prefixes: `link:`, `file:`, `workspace:`, `portal:`, `catalog:`, `npm:` aliases,
git/http URLs, and `owner/repo` GitHub shorthand.

**Non-existence blocks; everything else asks for a decision.** A name that 404s cannot be
installed anyway, so blocking costs nothing and catches the pure hallucination case. Age and
adoption signals are probabilistic, so they request review rather than asserting malice, and an
allowlist entry with a reason clears them permanently.

## The rules, and what each costs

| Rule | Severity | Threshold | Why this threshold |
|---|---|---|---|
| `does-not-exist` | block | registry 404 | Cannot be installed; nothing legitimate breaks |
| `recently-registered` | review | first publish < 90 days | hops' *youngest* direct dependency is 298 days old; the 10th percentile is 1238 days. 90 days sits far below the real distribution |
| `single-version` | review | 1 version and < 365 days | The shape of a name registered to be found rather than maintained. Old single-version utilities are common and pass |
| `near-neighbour` | review | edit distance ≤ 2 from an existing dependency, both names ≥ 8 chars | See below |
| `no-repository` | info | no `repository` field | Advisory only — 1 of hops' 109 resolvable deps has none, so blocking on it would be wrong |

**The 8-character floor on `near-neighbour` is measured, not guessed.** Without it, hops' existing
manifest self-reports two false positives: `clsx` ↔ `tsx` and `vite` ↔ `vitest`, both at distance
2, because on a 3–4 character name a distance of 2 is most of the name. With the floor, false
positives on the existing set drop to **zero** while realistic squats are still caught
(`react-router-dom` → `react-router-dm`, `@tanstack/react-query` → `@tanstack/react-quefy`,
`tailwind-merge` → `tailwind-merged`, all distance 1).

**Stated limitation:** the floor means short names are unprotected by this rule — `clsx` →
`clsxx` is missed. That is a deliberate trade against a false-positive rate that would get the
job disabled. Short-name squats remain covered by `does-not-exist` and `recently-registered` if
the squat is new, and by nothing at all if it is old. Worth revisiting with a popularity signal
rather than by lowering the floor.

## False-positive rate against real history

Replayed over the last 40 commits touching `hop-ui/package.json`. 20 of them added at least one
dependency, **28 packages in total**.

> **0 of 28 flagged.** Not one of those commits would have failed CI.

Measured twice, because the first measurement was flattering: evaluating package age against
*today* makes every historical addition look mature. The replay was redone evaluating each package
against **the commit's own date**, so a package that was 30 days old when added is judged as 30
days old. The result held at 0 either way.

## Positive control

Against the live registry, on top of hops' real manifest:

| Planted addition | Result |
|---|---|
| `react-datetime-formatter-utils` — plausible, hallucinated | **BLOCK** — does-not-exist |
| `react-router-dm` — typo of a real dependency | **BLOCK** — does-not-exist |

Exit code 1 in both cases. 17 offline unit tests cover the rules the live control cannot reach,
including the `link:` skip and the short-name floor.

## Side measurement: is the squat surface already occupied?

273 single-edit variants (deletion, duplication, transposition) of hops' 8 most-used unscoped
dependencies were probed against the registry. **One** is registered: `ercharts`, distance 1 from
`recharts` — created 2017, 14 versions, evidently a legitimate old package rather than a squat.

So the immediate typosquat surface around hops' top dependencies is essentially empty today. The
value of the `near-neighbour` rule is therefore **prospective** — it catches the day someone
registers one — not a backlog of existing exposure. Worth saying plainly rather than implying the
rule found something.

## What this does not do

- **npm only.** `hop-backend` (gradle) and barley (poetry) are not covered. The rule set
  transfers; the registry client does not. Deliberate: one ecosystem proven end to end beats three
  half-wired.
- **No download-count signal.** The npm downloads API rate-limited during measurement (HTTP 1015
  after roughly 60 concurrent requests) while `registry.npmjs.org` is CDN-backed and did not. A
  signal that fails under CI concurrency is worse than no signal, so it was dropped rather than
  made flaky.
- **No package-content analysis.** Install scripts, obfuscation and exfiltration patterns in the
  tarball are a different check. Out of scope here.
- **Nothing about transitive dependencies.** Only direct manifest additions. A hallucinated
  transitive dependency is a real gap and is not addressed.
