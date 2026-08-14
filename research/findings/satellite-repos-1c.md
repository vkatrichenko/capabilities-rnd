# Satellite repos pass — barley, hops-mcp, sowinsights (Phase 1c)

Analyzed 2026-08-14, read-only. Complements `secret-scan-2026-08-14.md` (1a) and the hops files
(1b). Redaction rules as before: no secret values, ever.

## barley

### Its own audit already told this story (2026-06-03, `context/audits/2026-06-03/security.md`)

Score 62% / C. The audit's findings align with ours and add one we could not have seen:

- **SEC-02 FAIL (critical): no agent hooks** — `.claude/settings.json` has no `PreToolUse`
  blockers; nothing stops an agent from reading secrets. Matches our matrix.
- **Side finding: live credentials in plaintext in `.claude/settings.local.json`** (gitignored,
  on disk): a **production RDS password** repeated across `psql` allow-patterns, a LangSmith API
  key, an AgentCore OAuth client secret. The audit recommended rotation on **2026-06-03**;
  whether that happened is not verifiable from the repo — it joins the 1a rotation list.
  This is an AI-SDLC-native leak vector: *permission allow-patterns as a secrets store*.
- **SEC-04 PASS ("no secrets in committed files") is wrong** — its grep deliberately excluded
  `tests/`, and that is exactly where the committed tokens sit (VCR cassettes, 1a findings).
  Same lesson as the hops audit blind spots: detector scoping assumptions produce false PASSes.

### Root cause of the committed cassette tokens (the 1a in-HEAD gitlab-rrt)

The control **existed** — `tests/integration/conftest.py` has a deliberate scrubbing layer:
- `filter_headers` is solid: `Authorization`, `PRIVATE-TOKEN`, `x-api-key`, cookies — request
  credentials never reach cassettes.
- Body scrubbing (`_scrub_text`) is a **key denylist**: `access_token`, three Zoom fields,
  emails. The GitLab `GET /project` **response body** returns the runner token under
  `"runners_token"` — not on the list, so it was recorded and committed verbatim (cassette
  context: `"runners_token":"GR1348941…"`).

**Generalizable finding:** header filtering + key-denylist body scrubbing fails open — every new
API field is a potential leak. The fix pattern is fail-closed (allowlist fields kept, or
entropy/format-based scrubbing — the same rules gitleaks uses — applied at record time). Also
the second control layer that would have caught it (a secret-scan gate) is absent in barley:
defense-in-depth is what turns "scrubber has a hole" into a non-event, and hops has it while
barley does not.

### Other barley notes
- `.pre-commit-config.yaml`: ruff/biome + the local `pii-scan-evals-datasets` regex scanner
  (emails/phones/Slack IDs/SSNs in eval JSONLs) — a repo-grown, dataset-specific control; good
  pattern, narrow coverage; still no secret scanning anywhere.
- Terraform / `.tflint.hcl` — out of scope (infrastructure security).

## hops-mcp

Small, modern TS; no security tooling (no secret scan, no dependency audit, one quality hook).
No committed secrets (1a: only doc placeholders). `.env.example` values are placeholders
(`changeme`-style). Clean `src/`: no `child_process`/`eval` patterns.

**The finding is its MCP config** — `.mcp.json` executes third-party code with no version pin:
- `serena`: `uvx --from git+https://github.com/oraios/serena serena start-mcp-server` — a
  third-party MCP server pulled **from a git URL with no tag/commit pin**; whatever is on the
  default branch runs on the developer's machine at session start.

## The cross-repo MCP supply-chain pattern (in scope: unverified packages)

Every repo that configures stdio MCP servers executes at least one mutable-version third party:

| Repo | Server | Launch | Pin state |
|---|---|---|---|
| hops | `github` | `docker run ghcr.io/github/github-mcp-server:latest` (+ PAT env) | ⚠️ `:latest`, trusted publisher, mutable |
| hops-mcp | `serena` | `uvx --from git+https://github.com/oraios/serena` | ❌ no ref at all — default branch |
| barley | `bedrock-agentcore` | `uvx awslabs.…@latest` | ⚠️ `@latest`, trusted publisher, mutable |
| barley | `prompt-kit` | `npx -y shadcn@canary mcp` | ❌ `@canary` pre-release, auto-yes |

The hops audit's AIS-04 PASSes this surface ("trusted, verifiable endpoints") — trusted source,
yes; *verifiable version*, no. An MCP server runs with the developer's (and agent's) local
privileges; an unpinned one is the AI-SDLC equivalent of `curl | bash` on every session start.
**Phase 2 candidate: an MCP-config pinning check** — nothing on the market gates this today, and
it generalizes to any repo with `.mcp.json`.

## sowinsights

The low-water mark, confirmed: no `.claude/`, no AWOS, no audits, no CI security. `requirements.txt`
13 deps 0 pinned, no lockfile, 2 committed `.pyc` files. `.env_example` is clean (holds a
Secrets-Manager *name*, not a value — the right pattern, incidentally). `Dockerfile` builds from
mutable `python:3.11-bullseye` (no digest pin — noted, borderline scope). History effectively
clean in 1a (1 finding = the secret *name* in Terraform).

Its security posture is defensible only because it is a PoC — the research point is that nothing
*marks* it as such: the org has no tiering that says "this repo may hold real credentials, that
one may not."

## What 1c adds to the Phase 2 backlog

1. **MCP pinning check** (all repos with `.mcp.json`) — new, in-scope, generalizable.
2. **Fail-closed cassette scrubbing** pattern + secret-scan gate as the backstop (barley
   recommendation; the *pattern* is the capability deliverable).
3. Audit-detector scoping bugs now seen in **both** audited repos (hops AS-13/AIS-03; barley
   SEC-04 tests-exclusion) — systemic, report upstream once.
4. Rotation list grew: barley `.claude/settings.local.json` credentials (prod RDS password,
   LangSmith key, OAuth secret) — flagged by their own audit 2026-06-03, status unknown.
