# MCP server pinning across four repos — read-only sweep

Produced 2026-08-28 with `tooling/ci/mcp-pin-check/check-mcp-pins.mjs`, read-only, against each
repo's working tree: hops 34fa5c978, hops-mcp 7c4728b, barley c0387ee48, sowinsights 072d536. Self-test: 18/18 pass.

Command, per repo:

```sh
node tooling/ci/mcp-pin-check/check-mcp-pins.mjs --repo <repo>
```

## Result

| Repo | Server | Launch | Tier | Rule |
|---|---|---|---|---|
| hops | `github` | `docker run ghcr.io/github/github-mcp-server:latest` | warn | `mutable-latest` |
| hops-mcp | `serena` | `uvx --from git+https://github.com/oraios/serena` | **fail** | `refless-git` |
| barley | `bedrock-agentcore-mcp-server` | `uvx awslabs.…@latest` | warn | `mutable-latest` |
| barley | `prompt-kit` | `npx -y shadcn@canary mcp` | **fail** | `auto-yes` (also `@canary`) |
| sowinsights | — | no `.mcp.json` | no surface | — |

Skipped as designed: three `http` servers (`awos-recruitment` ×3, `barley`) and barley's `loop`
(`poetry run python -m …`, the repo's own code). Exit codes: hops 0, barley 1, hops-mcp 1,
sowinsights 0.

**Four stdio third-party launches in the org, zero pinned.** Two are in the fail tier — the version
that executes was chosen by nobody — and both sit in repos with no CI check that would ever see
the file. AIS-04 passes all four (research/findings/hops-audit-analysis.md).

## Why the tiers, not "unpinned = fail"

A digest pin has no automation behind it — no Dependabot ecosystem reads `.mcp.json` — so it is a
manual chore nobody owns and it rots until someone replaces it with `:latest` again. The fail
tier is reserved for launches that are untrusted *and* mutable; `:latest` from a publisher's
stable channel is reported and left to a written acceptance or a minor-tag pin. Same split hops
already made for GitHub Actions (W1.4: third-party pinned, GitHub-owned left alone).

## Raw output

```
mcp-pin-check: hops
  skip  .mcp.json:awos-recruitment  http — remote, nothing to pin
  pass  .mcp.json:github  ghcr.io/github/github-mcp-server:1.11
  all clear.
exit=0

mcp-pin-check: barley
  skip  .mcp.json:barley  http — remote, nothing to pin
  warn  .mcp.json:bedrock-agentcore-mcp-server  awslabs.amazon-bedrock-agentcore-mcp-server@latest
  skip  .mcp.json:loop  poetry run python -m — local launcher
  skip  .mcp.json:awos-recruitment  http — remote, nothing to pin
  fail  .mcp.json:prompt-kit  npx -y shadcn@canary — installs whatever resolves without a prompt

  - mutable-latest  .mcp.json:mcpServers.bedrock-agentcore-mcp-server
      mutable, but the publisher's stable channel — pin a tag or record the acceptance — awslabs.amazon-bedrock-agentcore-mcp-server@latest
  x auto-yes  .mcp.json:mcpServers.prompt-kit
      auto-accepts installing whatever the registry resolves at launch — npx -y shadcn@canary — installs whatever resolves without a prompt

  1 failing server(s). Pin a tag or commit; if the launch is legitimate as-is, allowlist it with a reason and who confirmed it.
exit=0

mcp-pin-check: hops-mcp
  skip  .mcp.json:awos-recruitment  http — remote, nothing to pin
  fail  .mcp.json:serena  https://github.com/oraios/serena

  x refless-git  .mcp.json:mcpServers.serena
      runs a third party's default branch — nobody chose the version that executes — https://github.com/oraios/serena

  1 failing server(s). Pin a tag or commit; if the launch is legitimate as-is, allowlist it with a reason and who confirmed it.
exit=0

mcp-pin-check: sowinsights
  no MCP config file — no MCP surface in this repo.
  all clear.
exit=0

```

## What changed in hops (branch `HOP-0000/mcp-pin-check`, not pushed)

After: `ghcr.io/github/github-mcp-server:1.11` — `pass`, exit 0. Tags `1`, `1.11` and `v1.11.0`
all exist on ghcr (`docker manifest inspect`, 2026-08-28; newest release v1.11.0, 2026-08-25).
The minor tag was chosen over the digest for the maintenance reason above.

## What changed in hops-mcp and barley (2026-08-28, approved by Vladyslav; branches, not pushed)

| Repo | Branch | Before | After | Verified |
|---|---|---|---|---|
| hops-mcp | `chore/mcp-pin-check` `fb046d2` off `origin/main` | `git+https://github.com/oraios/serena` (no ref) | `…serena@v1.7.0` | `uvx --from …@v1.7.0 serena --version` → `Serena 1.7.0` |
| barley | `chore/mcp-pin-check` `6d91cd1d5` off `origin/develop` | `npx -y shadcn@canary mcp` | `npx shadcn@4.19.0 mcp` | `npx shadcn@4.19.0 mcp --help` prints the subcommand |
| barley | same | `uvx awslabs.…@latest` | `…@0.2.0` | starts, registers 35 tools |

Both branches also carry the check: hops-mcp gets the Node checker as a job beside
`agent-config-scan`; barley gets `scripts/check_mcp_pins.py` — the **Python twin** — as a
reusable workflow wired into `ci.yml` and the CI gate, ruff-clean under barley's config. The
twins are held byte-identical by `tooling/ci/mcp-pin-check/agreement-check.sh`: 5 inputs × 4
modes, all agree. Real scans on both branches: every server `pass` or `skip`, exit 0.

**Side finding worth the article:** npm's `canary` dist-tag for `shadcn` resolves to
`4.2.0-canary.0` — *older* than the `4.19.0` stable release. barley's "bleeding edge" config was
running stale code. A pre-release channel is not just riskier; it is not even newer.

sowinsights: no `.mcp.json`, nothing to port — a check with `--require-surface` would fail an
empty repo.
