# CLAUDE.md

Guidance for Claude Code working in this repository.

Only facts that hold in every session live here. Anything that can go stale belongs to the file that
owns it — `README.md` is the project charter, `research/` holds findings, `methodology/` holds the
method log.

## What this repo is

A **research workspace** for the DevOps Capabilities Research initiative. The first capability is
**AI SDLC security** — code and repository security in AI-assisted development — to be published on
the Provectus website as a short scientific article with evidence and artifacts.

The split that governs everything here:

> **Research output lives in this repo. Code changes land in HOPS.**

This repo is never deployed and never runs in CI. It accumulates the inventory, the gap analysis,
the tooling that gets ported into HOPS, the evidence, and the article.

`README.md` is the charter — team, phases, timeline, communication channel. Read it for *who and
when*; read this file for *where and how*. Do not restate the charter here.

## Where things are

### This repo

| Path | Holds |
|---|---|
| `research/baseline/` | Inventory of what HOPS already has, per security layer |
| `research/sources/` | Extracts and notes from external sources — AWOS audit, Anthropic articles, vendor docs |
| `research/findings/` | Gap analysis and conclusions, per phase |
| `methodology/` | The running research-method log — a first-class deliverable, see below |
| `tooling/hooks/` | Client-side hooks: pre-commit, post-commit, Claude Code hooks |
| `tooling/ci/` | CI/CD security job templates and pipeline security agents |
| `tooling/configs/` | Scanner configuration — GitLeaks, Checkov, and successors |
| `artifacts/` | Publication evidence: scan output, before/after comparisons, screenshots |
| `article/` | Phase 3 — the article draft |
| `tasks/` | `todo.md` (the working checklist) and `lessons.md` (corrections received) |

### The test project — HOPS

**`~/Documents/internal-projects/BarHopping/hops`** — remote `provectus-barhopping/hops`.

`BarHopping/` is a **container directory**, not a repo. It holds four independent repos: `hops`
(the test project), `hops-mcp`, `barley`, `sowinsights`. Only `hops` is in scope.

HOPS is a monorepo: `hop-backend` (Kotlin / Spring Boot / Gradle / jOOQ, detekt), `hop-ui` (React +
TypeScript + Tailwind v4), `hop-agent`, `hop-sync`, `e2e`, plus `infra/` and `helm/`. It has its own
`CLAUDE.md` and a **mandatory AWOS workflow** (`/awos:product` → `spec` → `tech` → `tasks` →
`implement`). Read `hops/CLAUDE.md` before changing anything there.

## Scope

`README.md` is the source of truth; the short version:

- **In scope** — secrets exposure in Git from LLM-generated code; vulnerabilities introduced by
  AI-generated code; supply-chain attacks via unverified packages.
- **Out of scope** — infrastructure security, runtime security, network security.

When a promising finding falls outside scope, record it in `research/findings/` as out-of-scope
rather than chasing it. Scope creep is the main risk to the deadline.

## Hard constraints

- **HOPS changes are development-environment only.** No production impact, ever. This is the
  condition the project was approved under.
- **Never push to a HOPS remote without explicit confirmation.** Pushes fire GitHub Actions.
- **HOPS has its own process.** Read `hops/CLAUDE.md` and follow AWOS before modifying it. Do not
  import the conventions of this repo into that one.
- **No secrets in this repo.** Scan output from a real internal product can embed live credentials.
  Redact before anything lands in `artifacts/`. Un-redacted output goes in `scratch/`, which is
  gitignored.
- **Internal only.** No open-sourcing is planned — do not publish, push to a public remote, or paste
  HOPS code into external services.

## HOPS security baseline — what already exists

HOPS is **not a greenfield target**. Do not propose something already shipped; start from the gap.

Snapshot taken 2026-08-14 — verify against the repo before relying on any row.

| Layer | What exists | Where |
|---|---|---|
| Local secret scan | Advisory pre-commit hook: suspicious filenames + staged content, `SKIP_SECRETS=1` escape hatch | `scripts/pre-commit` |
| Agent-time guard | `PreToolUse` hook blocking secret reads/writes; `PostToolUse` reinstalls the pre-commit hook | `scripts/claude-hooks/block-secrets.sh`, `.claude/settings.json` |
| CI secret scan | `secret-scan` job — "Secret scan – gitleaks", gitleaks 8.24.3 (the enforcement layer behind the advisory hook) | `.github/workflows/hops-mr-check.yml` |
| GitLeaks tuning | Verified false positives only; `.env.example` deliberately **not** path-allowlisted | `.gitleaks.toml` |
| Dependency audit | `osv-audit-hop-ui` — **only runs when the PR carries the `frontend` label**, and only for `hop-ui` | `.github/workflows/hops-mr-check.yml` |
| Static analysis | SonarQube MR scan | `sonarqube-check-mr` job, `sonar-project.properties` |
| Dependency updates | Dependabot: npm (`hop-ui`, `hop-agent`, `e2e`), gradle (`hop-backend`), github-actions | `.github/dependabot.yml` |
| AI code review | CodeRabbit, tuned for the Tailwind v4 setup | `.coderabbit.yaml` |
| Accepted risks | Decisions recorded so audits do not re-litigate them (transport security AS-01, auth rate limiting AS-09) | `docs/processes/security-notes.md` |
| Agent config | Skills, agents, rules, hookify rules, enabled plugins incl. `security-guidance` | `hops/.claude/` |

Read `docs/processes/security-notes.md` **before** flagging anything as a finding — an accepted risk
re-raised as new is noise, and the file exists precisely to stop that.

## The AWOS audit

The audit results are **already in the HOPS repo** — `hops/context/audits/`. Newest run:
`2026-08-03_19-15-15`. Do not chase them elsewhere; ask Dasha Goranina only for material that sits
outside the repo.

Each run directory holds one JSON per dimension — the machine-readable source, with `score`,
`coverage`, and a `checks[]` array — plus `report.md`, `report.html`, `recommendations.md`, and
`collected/` (raw `ci`, `git`, `code_host`, `docs`, `tracker` data).

Dimensions that map onto this capability, with scores from the 2026-08-03 run:

| Dimension | Score | Why it matters here |
|---|---|---|
| `prevention-coverage` | 32.6 | Whether good state is protected against regression — the weakest area |
| `supply-chain-security` | 37.5 | Lockfile integrity, version pinning, package provenance |
| `ai-security` | 45 | Malicious/suspicious content in agent definitions, skills, hooks, MCP configs |
| `application-security` | 64.8 | OWASP ASVS 5.0.0 |
| `ai-sdlc-adoption` | 50.2 | Context for how AI-assisted the development actually is |

Older runs (`2026-03-31`, `2026-04-21`, `2026-04-22`, `2026-07-17_14-00-48`) let you show movement
over time — useful evidence for the article. Note the schema changed: the older runs are markdown
per dimension, the two newest are JSON.

The three low-scoring dimensions are the natural Phase 2 backlog.

## Methodology is a deliverable, not a byproduct

Rodion Ugarov requires a log of the research methodology so the process can be scaled to other
capabilities. It is a first-class requirement.

Write to `methodology/log.md` **as you work**, not at the end. Each entry: what was attempted, what
tool or source was used, what came back, what was decided. A method reconstructed after the fact is
the thing this requirement exists to prevent.

## How to work here

- **Plan before non-trivial work**, and keep `tasks/todo.md` current — check items off as they land.
- **Evidence before claims.** Never assert a check works, a scanner fires, or a gap is real without
  the command and its output. This repo's entire output is evidence; an unverified claim in it is
  worse than a missing one.
- **Record corrections** in `tasks/lessons.md` — write the rule that would have prevented the
  mistake.
- **Independent research first.** The charter mandates a fresh view before syncing with Max
  Ivanchenko or Vasiliy Ilichev on their roadmap. Do not pre-read their work.
- **Report what could not be verified.** A path not checked, a score taken on trust, a scanner never
  actually run — say so explicitly.
