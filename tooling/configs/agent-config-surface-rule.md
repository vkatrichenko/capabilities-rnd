# Portable rule: the agent configuration surface is security-sensitive

Repo-agnostic version of the declaration landed in `hops` for AWOS check **PRV-17**. Hand this to
the owners of any repo with a `.claude/` directory; it is a recommendation, not a change we make on
their behalf.

**Why it is a control and not a doc.** The agent configuration surface executes with the developer's
full local privileges. Hooks run shell on tool events. MCP servers and marketplace plugins run
third-party code at session start. Instruction files steer every agent action. None of that is
covered by a secret scanner, a dependency audit or a SAST job — the surface is invisible to all
three. A written rule plus CODEOWNERS routing is the whole of the available control today.

**The evidence it is not hypothetical.** In this org, one repo's own AWOS audit (2026-06-03) found a
production RDS password, a LangSmith API key and an OAuth client secret sitting in `psql` permission
allow-patterns in `.claude/settings.local.json`. Permission config used as a secret store, in a file
no scanner reads. Detail: `research/findings/satellite-repos-1c.md`.

---

## 1. Paste into the repo's root agent instruction file

Adjust the paths in **The surface** to the repo's actual layout — the point is to enumerate what
exists, not to copy someone else's tree. Keep all five bullets: an AWOS PRV-17 pass needs the
surface named, review required, *and* guards protected, and the last two are what the audit's
evidence field calls out as missing when they are absent.

```markdown
## Agent Configuration Is Security-Sensitive

The agent configuration surface executes with your full local privileges: hooks run shell, MCP
servers and marketplace plugins run third-party code at session start, and instruction files steer
every agent action. Treat changes to it as security changes, not as config tidying.

**The surface**: `CLAUDE.md` and every module `CLAUDE.md` · `.claude/` (`settings.json`,
`settings.local.json`, `agents/`, `skills/`, `commands/`, `rules/`) · the `hooks` block in
`.claude/settings.json`, inline `command` strings included · any hook script directory ·
`.mcp.json` · `enabledPlugins` and `extraKnownMarketplaces`.

- **Changes to this surface need review.** They don't ride along in a feature PR — split them out,
  same rule as `.github/workflows/**`. `.github/CODEOWNERS` routes the request.
- **Hook guards must not be weakened, disabled or bypassed.** Removing, narrowing or
  short-circuiting a guard hook is a security change and needs its own PR and its own
  justification — never a drive-by cleanup.
- **Never put credentials in permission allow-patterns.** An allow-pattern that embeds a connection
  string or password is a plaintext secret store that no secret scanner reads, and
  `settings.local.json` being gitignored does not make it safe. Use env vars or a credential helper.
- **Pin third-party agent sources.** MCP server images and plugin marketplaces alike: a mutable tag
  or a ref-less git source means whatever sits on someone else's default branch runs on your machine
  at session start.
- **No secrets in instruction files or hook scripts**, not even as examples — use a placeholder.
```

Also extend whatever "no drive-by edits" rule the repo already has to name the agent surface
alongside `.github/workflows/**`. If it has none, the bullet above carries it.

## 2. Repeat a one-line pointer in each module instruction file

The AWOS detector reads module-level instruction files, and so do agents working inside a module.
One line each, pointing at the root section:

```markdown
Agent config (`.claude/`, the `hooks` block, hook scripts, `.mcp.json`, `CLAUDE.md`) is
security-sensitive: changes need review in their own PR, and hook guards must not be weakened or
bypassed — see [root `CLAUDE.md`](../CLAUDE.md) → Agent Configuration Is Security-Sensitive.
```

## 3. Add a path-scoped rules file so it loads on the edit

If the repo uses `.claude/rules/` with `paths:` frontmatter, a scoped copy fires exactly when the
surface is being touched, which is worth more than a section an agent may not re-read. The `hops`
version is `.claude/rules/agent-config-surface.md`; the pattern list that matters:

```yaml
---
paths:
  - CLAUDE.md
  - "**/CLAUDE.md"
  - .claude/**
  - .mcp.json
  - <hook script directory>/**
---
```

Note `"**/CLAUDE.md"` must be quoted — bare `**` is not valid YAML.

## 4. Route review with CODEOWNERS

**Check first whether the repo already has one.** Verified 2026-08-26: `barley` does —
`.github/CODEOWNERS`, covering `/terraform/` and `/.github/workflows/`, owned by three named
individuals rather than a team. `hops-mcp`, `sowinsights` and `wort` have none. So for `barley` this
is *four added lines in an existing file*, matching its convention of individual handles; only the
others need a new file.

That existing file is also the sharper version of the finding: `barley` already decided that
infrastructure and CI config deserve routed review. The agent-config surface — which executes with
the developer's full local privileges — is not in it. The gap is not "no CODEOWNERS", it is "the
surface that runs the agent was not on the list".

```
/CLAUDE.md                @<org>/<team-or-handles>
**/CLAUDE.md              @<org>/<team-or-handles>
/.claude/                 @<org>/<team-or-handles>
/.mcp.json                @<org>/<team-or-handles>
/<hook script directory>/ @<org>/<team-or-handles>
/.github/CODEOWNERS       @<org>/<team-or-handles>
```

Three things that make this silently do nothing, all seen for real:

1. **An owner without repo access is ignored.** GitHub does not error — the pattern just has no
   owner. For a team, verify with `gh api orgs/<org>/teams/<team>/repos --jq '.[].name'` before
   committing; for individual handles, they need write access on the repo. After pushing, check with
   `gh api repos/<org>/<repo>/codeowners/errors`.
2. **`.gitignore` may swallow the file.** `hops` ignores `.github/*` with a three-entry allowlist, so
   `.github/CODEOWNERS` was untracked until `!.github/CODEOWNERS` was added. Check with
   `git check-ignore -v .github/CODEOWNERS`.
3. **CODEOWNERS routes a review request; it does not compel one.** It only blocks a merge when
   branch protection has "Require review from Code Owners" enabled. Across this org, 25 of 26
   default branches require zero passing checks and the enterprise ruleset has no
   `required_status_checks` rule at all (`artifacts/scorecard-org-sweep.md`), so assume it is
   advisory unless an admin has turned that on.

## 5. Check `settings.local.json` is ignored by the *repo*

`hops` was relying on a developer's machine-global gitignore; the repo's own `.gitignore` had no rule
for `.claude/settings.local.json`, so on any machine without that global rule the file — the one that
holds permission allow-patterns — was committable. Verify per repo:

```sh
git check-ignore -v .claude/settings.local.json   # must name the repo's own .gitignore
```

---

## Applicability across the four repos

| Repo | Has the surface | Recommendation |
|---|---|---|
| `hops` | 17 enabled plugins, 4 hooks, 2 MCP servers, 110 `CLAUDE.md` files | ✅ landed |
| `barley` | 20 agents, 32 skills, 5 MCP servers, 3 enabled plugins, **0 hooks** | Highest value of the three — its own audit found the credential-in-allow-pattern incident, and SEC-02 (no guard hooks) is still open |
| `hops-mcp` | 2 agents, 9 skills, 2 MCP servers, 2 inline hooks | Cheap; single `CLAUDE.md`, so §2 does not apply |
| `sowinsights` | no `.claude/` at all | Not applicable until it acquires one |

Snapshot 2026-08-25, verified on disk. `barley` and `hops-mcp` both register the `provectus/awos`
plugin marketplace with **no ref pin** — §1's "pin third-party agent sources" bullet is not
theoretical in either.
