# Generation-time security review — what exists, what runs, what to recommend

Roadmap item 11. Evidence: `artifacts/generation-time-review-hops.md`. Method:
`methodology/log.md` (2026-08-27).

## The finding in one line

The control the roadmap asked for is already declared in `hops` and has never run: enabling a
marketplace plugin in a project's `settings.json` installs nothing, and the plugin's two LLM
layers need an API key that an OAuth login does not export. "Enabled" and "running" are
different states, and nothing in the repo told a developer which one they were in.

## What the `security-guidance` plugin is

| Layer | Trigger | Mechanism | Runs for a hops developer today? |
|---|---|---|---|
| 1 Pattern warnings | `PostToolUse` on `Edit\|Write` | 25 regexes, JS/TS/Python/Go idioms | Only after `claude plugin install`; then yes, no key needed |
| 2 LLM diff review | `Stop` | Direct HTTP to the Messages API | Only with `ANTHROPIC_API_KEY`/`AUTH_TOKEN` or a Bedrock/Vertex flag in the shell |
| 3 Agentic commit review | `PostToolUse` on `git commit`/`git push` | Agent SDK, reads related files | Same gate as layer 2 |

Layer 1 measured 4/9 on planted classes and 0/5 on Kotlin. Layers 2 and 3 could not be
measured without a key — which is itself the result.

## Why the old `/security-review` command should stay reverted

It was a full-repository grep checklist, not a diff review, and Claude Code ships a built-in
`/security-review` that reviews the branch's pending changes. Re-adding a repo copy would be a
third, weaker implementation of a layer the plugin already provides.

## What landed in `hops` (branch `HOP-0000/security-finding-loop`, not pushed)

Instruction text only, three files — root `CLAUDE.md` section **Security Findings Update the
Instructions**, the `self-improvement` skill (security finding as a trigger), the
`commit-validated` skill (plugin's commit review noted). The section also writes down the two
prerequisites so the "enabled but not running" state is at least visible.

## Recommendations for the other three repos (not our change — read-only)

Written 2026-08-27 against each repo's actual `CLAUDE.md` and `.claude/` at that date. The
rule to port is the hops one: **`/security-review` on the staged diff before every commit, on
the session login; every security finding lands as an instruction update, not only a fix.** The
plugin is secondary everywhere — same install and API-key caveats as hops.

### hops-mcp — closest to done, two small edits

What exists: a `commit-validated` skill with a secrets scan and `make check` gates; a
path-scoped `security-reviewer` agent (`.claude/agents/security-reviewer.md`) that enforces the
`query_data` defence-in-depth invariants and is mandated by `CLAUDE.md` → General Rules for
diffs touching `src/auth/`, `server-wrapper.ts`, `query-data.ts`, `db-client.ts`. That agent is
the narrow-focus, evidence-bearing reviewer Anthropic describes — better than anything hops has.
What is missing is the generic case: a diff outside those paths gets no security pass at all.

1. `.claude/skills/commit-validated/SKILL.md` — add a **Security review** gate between the
   secrets scan and "show diff": `/security-review` on the staged diff, High/Critical blocks;
   if the diff touches the invariant paths, run the `security-reviewer` agent instead (it is
   stricter and already required).
2. `CLAUDE.md` → General Rules — one bullet: a security finding (from either reviewer,
   CodeRabbit, gitleaks or the agent-config scan) is closed by the fix **and** an update to
   `security-reviewer.md`'s invariants, `CLAUDE.md`, or a scanner config that cites it.
   The invariants list is this repo's natural "instruction file" — that is where findings
   should accumulate.

No `enabledPlugins` block exists; adding the plugin is optional and buys only the JS/TS regex
layer (`eval`, `new Function`, `child_process.exec`, `innerHTML`), which the built-in review
covers anyway.

### barley — the rule fits, the wording must respect a stated constraint

What exists: a `self-review` skill that fans out four review agents (architecture, common
sense, correctness, completeness) — none of them security — and a `CLAUDE.md` rule *"Self-Review
After Edits … Do not rely on meta-reviewer sub-agents — they have hallucinated findings without
reading code."* That constraint is the repo's own lesson and the recommendation must not fight
it: `/security-review` runs in the main session, reads the diff itself, and reports
file:line — it is not a meta-reviewer sub-agent.

1. `CLAUDE.md` → **Self-Review After Edits** — append one sentence: *"For any change touching
   auth, request handling, SQL, file paths, subprocesses, cassettes or eval datasets, also run
   `/security-review` on the diff; High/Critical findings block."* Keeping it inside the
   existing section avoids adding a competing process.
2. `.claude/skills/self-review/SKILL.md` — a fifth dimension, **security**, with the same
   proof-of-finding bar the section demands (file, line, quoted code) — or, if the team would
   rather not widen that skill, leave it and rely on point 1.
3. Finding → instruction rule, in `CLAUDE.md` → Key Guidelines: a security finding lands as a
   `CLAUDE.md` rule, a skill update, a `.gitleaks.toml` entry citing it, or a note in the
   docs. barley has no accepted-risk register yet; `docs/` is the place, modelled on hops's
   `docs/processes/security-notes.md`. The scrubber redesign (PR #1652) is the first entry —
   it was exactly this loop, done once by hand.

Plugin: `enabledPlugins` exists (awos, slack, atlassian); adding `security-guidance` is one
line and layer 1 *does* speak Python (`yaml.load`, `pickle`, `subprocess(shell=True)`,
`verify=False`, `os.system`). Still per-developer install, still no LLM layers on a
subscription — say so in the same line.

### sowinsights — nothing to attach the rule to

No `CLAUDE.md`, no `.claude/`, no lockfile, committed `.pyc` files. A security-review rule has
no file to live in and no commit skill to hook into. The recommendation is prior to this one:
a minimal `CLAUDE.md` (stack, commands, the two rules above) and `.claude/settings.json`
with the secret-guard hook copied from hops. Until then the CI action below is the only layer
that can reach it, which is one more argument for the org-level ask.

### Common to all three

- **Reword, don't copy.** Each `CLAUDE.md` has its own voice and process (barley's TDD +
  self-review, hops-mcp's invariants); the rule should read as theirs. A pasted hops
  section is the drift pattern this research is documenting.
- **The independent reviewer is the CI action**, not any of the above — Anthropic's
  `claude-code-security-review` with one org secret covers every repo, every login, and is the
  only piece that reaches sowinsights. In-session review is shift-left; it shares context with
  the code it reviews.
- **Prove before crediting.** Each repo should run the nine-snippet probe once in an interactive
  session (`artifacts/generation-time-review-hops.md` has the snippets) and keep the table —
  the same rule this research applies to itself.

## The subscription problem, and the options (decided 2026-08-27)

Most developers log in to Claude Code with a subscription. The plugin's hooks are separate
processes that read only `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / a Bedrock-Vertex flag
from the shell; the session's OAuth token never reaches them. So for the typical developer the
plugin is a regex linter with no Kotlin rules. Options, in the order they were weighed:

| Option | Runs on subscription? | Cost | Verdict |
|---|---|---|---|
| Built-in `/security-review` inside the session, wired into `commit-validated`; `pr-review-toolkit` / `code-review` subagents for independent context | **Yes** | none | **Chosen** — shipped in the hops branch |
| Anthropic's `claude-code-security-review` GitHub Action, one CI secret | n/a — CI-time, covers every developer | one org key | Proposed, **declined 2026-08-28** — the team reviews through Claude Code skills and does not want a second PR reviewer; CodeRabbit stays on its current plan |
| Per-developer `ANTHROPIC_API_KEY` exported in the shell | no, replaces it | API billing per seat, Stop review on most turns | Not recommended |
| `CLAUDE_CODE_USE_BEDROCK` / `VERTEX` flag | no key needed | requires the org to route Claude through AWS/GCP | Only if adopted for other reasons |

Trade-off of the chosen option: the review shares the session's context with the code it
reviews — it is a shift-left check, not an independent reviewer. The independent one is the CI
action. Worth filing upstream: the plugin's agentic path already knows how to fall back to the
CLI's own credentials, but the `HAS_API_CREDENTIALS` gate blocks before it gets there.

## Roadmap wording

Item 11 should read: *"Verify the generation-time review actually runs (install step + API
path), codify the finding → instruction rule, roll the plugin out to barley and hops-mcp."*
The reviewer-matrix row "generation-time `/security-review` step" should point at the plugin.

## Not verified

- Other developers' machines — plugin install state and exported keys unknown.
- Layers 2/3 catch rate; SonarQube's server-side rule coverage for the Kotlin classes.
- That `barley`'s Python code would trip layer 1 in practice — inferred from the rule list.
