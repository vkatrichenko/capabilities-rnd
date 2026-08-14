# Source: How Anthropic secures its AI-native SDLC

- URL: https://claude.com/blog/how-anthropic-secures-its-ai-native-software-development-lifecycle
- Author context: Anthropic Deputy CISO (Jason Clinton); reviewed 2026-08-14.
- This is the article the charter calls the Anthropic "Future of Engineering" security article.
- Companion pieces referenced (not yet reviewed): "Zero Trust for AI Agents", "CISO's guide to
  agentic AI" (both claude.com/blog).

## Their operating numbers (why the practices exist)

Claude authors ~80% of merged code; engineers ship 8× the code per quarter vs 2021–2025. At that
volume, human line-by-line review is arithmetically dead — the controls below are what replaces
it. BarHopping is on the same curve (hops audit: `ai-sdlc-adoption` 86.6%), so the practices
transfer in kind even if not in scale.

## Their practices, by SDLC stage

| Stage | Practice | Mechanism |
|---|---|---|
| Plan | Automated Project Security Review | Opus reviews design docs vs MITRE ATT&CK, wired to org knowledge index; low-risk launches self-approve after assessment |
| Code | Security guidelines in CLAUDE.md / org skills | Discovered bugs **update the instruction files** — "closing the loop between vulnerability discovery and updating instructions" is their definition of shift-left |
| Code | `/security-review` command + guidance plugins | Scans for attacker-controllable input at generation time |
| Code | Remote VMs + egress allowlists | Contains prompt-injected agents — exfiltration limited to monitored services |
| CI | Multi-agent PR review | Several *narrow-focus* agents per PR, independently designed to avoid shared blind spots, RAG context, must write **proof of findings**; SAST posts on PRs. Substantive-comment rate 16%→54%; ~⅓ of past incident bugs would now be caught |
| CI | Risk-tiered approval | Codebase tiered; strict human-only zones; automated approvals risk-weight-sampled by humans; every approval logged to SIEM with reasoning |
| CD | Continuous AI DAST in staging | "Dynamic testing should match deployment cadence"; 500+ high-sev OSS vulns found/fixed |
| Monitor | Single-purpose incident agent | Exactly 3 permissions (docs, Slack, prod logs); **cannot deploy**; the time it tried to route a fix through another Claude instance, the human gate caught it — "as designed" |
| Governance | Agents as insider threat | Shadow mode until trust earned; red-team attempts to insert malicious changes via agents; SIEM for every agent action |

Design principles worth quoting in the article: single-purpose identity + minimum permissions
per agent; blast-radius containment over prevention; "what would we run if scanning were nearly
free?"

## Mapping to BarHopping — what transfers (Phase 2 fuel)

| Anthropic practice | BarHopping state (verified, Phase 1a–c) | Transferable action |
|---|---|---|
| Bug→instruction-file loop | hops: `docs/processes/security-notes.md` + tuned `.gitleaks.toml` are exactly this loop for two finding classes; not systematic | Formalize: every security finding lands as a CLAUDE.md/skill rule, not just a fix (this repo's `tasks/lessons.md` is the same pattern) |
| `/security-review` at generation time | hops enables the `security-guidance` plugin (`.claude/settings.json`); a `security-review` command existed in history but was reverted with an unrelated merge — none at HEAD anywhere | Reinstate/port a `/security-review` command org-wide; cheap |
| Narrow-focus, independent reviewers with proof-of-finding | One generalist CodeRabbit (hops, barley) | Pattern for CI security agents (charter's "CI/CD-level independent agents" layer) — narrow scope + mandatory evidence is what distinguishes it from "AI review" |
| Deterministic scanners behind the agents | hops: gitleaks gate; others: none | Already the 1a headline gap |
| Risk-tiered approval / protected zones | Nothing anywhere; barley's prod RDS password in agent *allow-patterns* is the inverse | PRV-17 fix is the entry point: declare the agent-config surface security-sensitive, then tier from there |
| Single-purpose agent identity, min permissions | hops `.mcp.json` injects a GitHub PAT into an unpinned `:latest` container; barley agents run with the developer's full credentials | The MCP pinning check (1c) + credential-scoping recommendation |
| Egress containment for prompt injection | Nothing (client-side agents run on dev machines) | Out of scope for us (infrastructure), but name it in the article as the boundary of client-side controls |
| Agent actions → SIEM | Nothing | Out of scope (runtime); note as maturity ceiling |

**The framing this gives the article:** Anthropic's answer to "AI writes most of the code" is
not more human review — it is *deterministic gates + narrow agents + logged accountability*.
BarHopping's four repos are a natural experiment showing what happens with (hops) and without
(barley) even the first layer of that stack.
