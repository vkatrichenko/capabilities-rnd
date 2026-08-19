# W1.1 — pnpm toolchain pin + dependency cooldown

Evidence for the first Phase 2 change. Target `hops`, branch
`HOP-0000/pnpm-toolchain-pin-and-cooldown` off `origin/main` @ `f640dee9f`, commit `ccfc77828`.
**Not pushed** — awaiting confirmation.

## What the roadmap assumed vs what was there

W1.1 was written as "add `minimumReleaseAge: 1440` to `hop-ui`". Investigation showed that change
would have been a **no-op in CI and inert in the Docker build**:

| Site | Before | Consequence |
|---|---|---|
| `.github/workflows/hops-{mr-check,dev,main}.yml` | `npm install -g pnpm` — unpinned | Resolves to pnpm 11 today, which **already defaults `minimumReleaseAge` to 1440** |
| `hop-ui/Dockerfile:4` | `npm install -g pnpm@9` | pnpm 9 predates the setting entirely |

So CI had the cooldown by accident and the image build did not have it at all. The real defect was
the floating toolchain across a major version that changed security defaults.

Two further controls were found silently dead, both caused by pnpm 11 moving configuration:

| Control | Where | Status |
|---|---|---|
| `save-prefix=''` — exact pinning, credited by audit R5 / SCS-03 | `hop-ui/.npmrc` | **Ignored.** Since pnpm 11, `.npmrc` is auth/registry only. All 103 manifest entries are still exact, so nothing has drifted — but the guard was off |
| `pnpm.onlyBuiltDependencies` | `hop-ui/package.json` | **Removed in pnpm 11.** pnpm says so on every install: `[WARN] The "pnpm" field in package.json is no longer read by pnpm` |

`pnpm-workspace.yaml` already carried `allowBuilds`, pnpm 11's replacement — the repo was
half-migrated, with two generations of the same setting side by side.

## The change

- pnpm pinned to **11.22.0** at every install site (3 workflows, Dockerfile, README), plus
  `packageManager: "pnpm@11.22.0"` so the version is declared once; `engines.pnpm` → `>=11.0.0`
- `minimumReleaseAge: 1440` set **explicitly** rather than inherited, with `minimumReleaseAgeExclude`
  as the documented escape hatch
- `saveExact: true` migrated into `pnpm-workspace.yaml`; dead `.npmrc` deleted
- stale `pnpm.onlyBuiltDependencies` removed
- **`pnpm-workspace.yaml` added to the Dockerfile `dependencies` COPY** — see below

## The near-miss

The Dockerfile `dependencies` stage copied only `package.json`, `pnpm-lock.yaml` and
`openapi-ts.config.ts` — **never `pnpm-workspace.yaml`**. That is why both build-allowlists
existed: the image build was relying on `package.json`'s `onlyBuiltDependencies`.

Removing that field without also copying the workspace file breaks the image build outright.
Reproduced deliberately, with the fix as the control:

```
A: package.json + pnpm-lock.yaml only          (what the Dockerfile copied)
   [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @swc/core@1.15.47, core-js@3.49.0

B: + pnpm-workspace.yaml                        (the fix)
   .../node_modules/@swc/core postinstall: Done
   Done in 4.5s using pnpm v11.22.0
```

Worth recording as a finding in its own right: **a config file that is not copied into the build
context is a control that does not exist there**, and nothing in either audit checks for it.

## Verification

All in clean containers on `node:24.13.0-alpine`, the image the Dockerfile uses.

| # | Check | Result |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` under 11.22.0 against the existing `lockfileVersion: 9.0` | Pass, no lockfile churn |
| 2 | Same with build scripts enabled (pnpm 11 `strictDepBuilds: true`) | Pass — `@swc/core`, `core-js` postinstalls ran; `✓ Lockfile passes supply-chain policies (913 entries)` |
| 3 | Stale-field warning gone after removing `pnpm.onlyBuiltDependencies` | Clean |
| 4 | Settings resolved from `pnpm-workspace.yaml` | `minimumReleaseAge = 1440`, `saveExact = true` |
| 5 | **Cooldown fires**: `pnpm add @aws-sdk/client-s3@3.1112.0` (published 20h earlier) | `ERR_PNPM_NO_MATURE_MATCHING_VERSION … within the minimumReleaseAge cutoff` |
| 6 | **Control**: same package with `minimumReleaseAge: 0` | Installs — so #5 is the setting, not a broken package |
| 7 | Range resolution under cooldown (`^3.1100.0`) | Falls back to mature `3.1111.0` — why `minimumReleaseAgeStrict` stays default |
| 8 | Docker `dependencies` stage (`pnpm install`, `api:generate`) | Builds |
| 9 | Docker `builder` stage (`pnpm build` = `tsc && vite build`, `pnpm prune --prod`) | Builds |
| 10 | `pnpm lint` | 0 errors, 21 pre-existing warnings unrelated to this change |
| 11 | pnpm 9.15.4 against the new `engines` | Rejected: `ERR_PNPM_UNSUPPORTED_ENGINE` |
| 12 | pnpm 10.20.0 against `packageManager` | Auto-switches to 11.22.0 — verified: `pnpm --version` reports 11.22.0 inside the project, 10.20.0 outside |
| 13 | `hops` `scripts/pre-commit` secret scan | `✓ No secrets detected` |

### `pnpm run test:coverage` — resolved: no regression

Three runs, same container image and same pnpm 11.22.0 (what CI resolves today):

| Run | Failed | Passed | Duration |
|---|---:|---:|---:|
| `origin/main`, unmodified — baseline | 4 | 4415 | 480s |
| branch `ccfc77828`, first run, machine contended | 60 | 4359 | 1093s |
| **branch `ccfc77828`, idle machine** | **4** | **4415** | **395s** |

The 60-failure run was load, not the change. Every failure in it was `Test timed out in 5000ms`
with no module-resolution, import or pnpm error, and the run took 2.8× the clean one — a fixed 5s
per-test timeout against a contended container. Re-run idle, the branch reproduces the baseline
exactly: **4 failed / 4415 passed, identical to unmodified `origin/main`.**

Recorded rather than smoothed over: the first run *looked* like a regression, and the only thing
that separated "environmental" from "broken" was running the unmodified tree under the same
conditions. A single red run is not a finding.

**Pre-existing, and not ours:** `origin/main` does not pass its own suite. 4 tests in
`src/features/create-hubspot-deal/ui/__tests__/create-deal-stage.test.tsx` fail on timeout in a
container-speed environment on both trees. Worth reporting to the HOPS team — and note it is
exactly what a suite that no merge gate depends on looks like (see
`artifacts/scorecard-baseline-hops.md` finding 1: `main` requires zero passing status checks).

## Audit position

**This does not close SCS-04, and no re-run will show it.** SCS-04 is `SKIP` / `applies: false`:
quarantine age needs live registry calls, so the static detector skips it by design. The evidence
above — a real install refused — is the substitute, and it is stronger than a score.

The AWOS-calibrated window is 7 days (`10080`); this sets pnpm's own default of 1440. Deliberate:
1440 blocks the same-day compromise window that the recent npm attacks used, without delaying
every Dependabot PR by a week. Revisit if the article wants to argue the stricter number.

## What the PR run exposed (2026-08-19, PR #515)

The change itself passed. What the pipeline did *around* it is the finding.

### The label gate is wider than Phase 1 recorded

Phase 1 documented `osv-audit-hop-ui` as label-gated. It is not alone — **three of the four
quality and security gates skipped on this PR** because it carries `dependencies` but not
`frontend`:

| Job | Condition | `.github/workflows/hops-mr-check.yml` |
|---|---|---|
| `unit-tests-hops-fe` | `contains(labels, 'frontend')` | :53 |
| `sonarqube-check-mr` | `contains(labels, 'frontend') \|\| contains(labels, 'backend')` | :331 |
| `osv-audit-hop-ui` | `contains(labels, 'frontend')` | :371 |
| `secret-scan` (gitleaks) | **unconditional** | — |

So a PR that rewrites `hop-ui`'s package manager, its build image and three workflows ran **no
frontend tests, no SAST and no dependency audit**. Only the secret scan is unskippable, and the
person who chooses the labels chooses the coverage.

Stack this on the Gate 0 finding — `main` requires **zero** passing status checks
(`artifacts/scorecard-baseline-hops.md` finding 1) — and the two compose into the real shape of
the gap: the gates are **skippable by omission** *and* **non-binding at the merge boundary**. A
PR can skip its tests and merge without them, and neither fact shows up in any audit score,
because `prevention-coverage` only asks whether a gate exists in CI.

**W1.2 grows accordingly:** un-gating the osv job alone fixes a third of this. The item is really
"make the quality gates unconditional", covering unit tests and SonarQube as well.

### The AI review control was inactive

`.coderabbit.yaml` is credited as an implemented control (AI code review). On this PR CodeRabbit
returned a walkthrough and merge-risk estimate but **no line-by-line review**, stating: *"Your
organization has reached its limit of developer seats… CodeRabbit will generate a high-level
summary and a walkthrough."* It also reported `.coderabbit.yaml` carries an unrecognized `version`
key, silently ignored.

A seat limit is not a code change, so nothing in the repo reflects that the control is degraded.
Third variant of the pattern this capability keeps finding: **exists / enforced / still wired up /
still licensed.** A control can lapse for commercial reasons and leave no trace in the codebase.

### Verified fix

`Spec link – PR template` failed because the template's `**Spec:**` field was empty. Filled with
an explicit `n/a — <reason>` per the template's own rule; check re-ran green. All checks now pass.
