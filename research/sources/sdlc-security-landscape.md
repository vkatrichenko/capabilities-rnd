# SDLC security practices — source landscape

Collected 2026-08-14 via targeted web search. **Depth caveat:** unlike the Anthropic article
(deep-read, see `anthropic-ai-native-sdlc-security.md`), these are search-level extractions —
each section names the source, the control option it yields, and its fit to BarHopping.
Sources marked ★ merit a deep read before the article cites them.

Organized by the three in-scope risks, then cross-cutting frameworks.

## Risk 1 — Secrets exposure in Git from LLM-generated code

### Tool landscape: layered scanning is the consensus pattern
- Consensus across 2026 comparisons ([appsecsanta](https://appsecsanta.com/secret-scanning-tools/gitleaks-vs-trufflehog),
  [rafter.so](https://rafter.so/blog/secrets/gitleaks-vs-trufflehog)): **gitleaks pre-commit
  (speed, regex, sub-second on diffs) + TruffleHog in CI (depth, 700+ verifier modules that
  check whether a credential is still LIVE) + server-side push protection as backstop.**
- **TruffleHog's liveness verification is the missing piece in our stack**: our 1a scan found
  real-format tokens but deliberately could not test validity. TruffleHog's verifiers do this
  with safe read-only API calls — it answers the barley rotation question ("which of these must
  rotate NOW") without anyone manually touching a credential. ★
- GitHub push protection: blocks known-pattern secrets server-side at push; since Oct 2025 also
  detects base64-encoded secrets by default. Availability on the org's plan needs checking —
  it's the only layer that catches what local hooks miss when a dev bypasses them.

**Options this yields:** (a) add TruffleHog verification pass for the rotation triage;
(b) evaluate GitHub push protection for the org; (c) hops' three-layer pattern (advisory local →
agent hook → CI gate) matches the industry consensus — the article can claim that with citations.

## Risk 2 — Vulnerabilities in AI-generated code

### Veracode GenAI Code Security Report (2025, updated Spring 2026) ★
- [45% of AI-generated code contains vulnerabilities](https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/)
  across 80 tasks × 100+ LLMs; the rate is **flat across model generations** (GPT-4→5, Claude,
  Gemini) — syntax correctness >95%, security pass ~55%, unchanged in two years.
- Weakest classes: XSS and log injection (getting worse); strongest: SQL injection, crypto.
- Implication: "wait for better models" is not a control. Deterministic scanning + generation-time
  guardrails are.

### Security degradation in iterative generation ([arXiv 2506.11022](https://arxiv.org/pdf/2506.11022))
- Iterative "improve this code" loops **degrade** security over rounds — relevant to agentic
  workflows where agents rewrite code repeatedly (AWOS implement loops).

**Options this yields:** (a) SAST gate as non-negotiable for AI-authored PRs (hops has Sonar;
XSS/log-injection rules deserve explicit verification given the Veracode class data);
(b) generation-time guidance (security skills/CLAUDE.md rules — the Anthropic loop pattern);
(c) narrow-focus security review agents with proof-of-finding (Anthropic pattern, maps to the
charter's "CI/CD-level independent agents").

## Risk 3 — Supply-chain attacks via unverified packages

### Slopsquatting / package hallucination ★ — the AI-native attack
- USENIX Security 2025 study ([summary](https://www.securityweek.com/ai-hallucinations-create-a-new-software-supply-chain-threat/)):
  2.23M samples, 16 models — **19.7% of LLM-recommended packages don't exist** (205k+ unique
  fictional names). Attackers pre-register the hallucinated names ([Socket](https://socket.dev/blog/slopsquatting-how-ai-hallucinations-are-fueling-a-new-class-of-supply-chain-attacks),
  [Endor Labs](https://www.endorlabs.com/learn/slopsquatting-when-ai-agents-hallucinate-malicious-packages)).
- Documented propagation: a hallucinated package spread through 237 repos via AI-generated agent
  skills — installed by **agents executing their own output**, not by humans.
- Typosquatting defenses don't cover this (names aren't near-misses of real packages).

### Dependency cooldowns — the control that went mainstream this year
- [pnpm `minimumReleaseAge`](https://pnpm.io/supply-chain-security) shipped 2025-09, **on by
  default (24h) since pnpm 11**; npm `min-release-age` since 11.10.0 (2026-02). Blocks the
  install window most registry-compromise attacks live in.
- Direct tie-in: the hops audit's **SCS-04 check (7-day quarantine age) was SKIPped** as
  needing live registry calls — but `hop-ui` is on pnpm, so the control is now a one-line
  config, no custom tooling. Cheapest Phase 2 win found so far.

### Frameworks
- [OpenSSF Scorecard](https://github.com/bureado/awesome-software-supply-chain-security) —
  automated repo-posture scoring (branch protection, pinned deps, SAST, token permissions);
  runs as a CI action; gives the article a third-party number per repo. ★
- SLSA — build-integrity levels; relevant vocabulary for the article, heavier than Phase 2.

**Options this yields:** (a) pnpm/npm cooldown config — trivial; (b) a hallucinated-package
check (does every newly-added dependency exist + predate the PR + have real usage?) — CI-able,
novel, directly AI-SDLC; (c) OpenSSF Scorecard as the cross-repo posture metric.

## The AI-toolchain itself as attack surface (extends our 1c MCP finding)

- [CSA Agentic MCP Security Best Practices](https://labs.cloudsecurityalliance.org/agentic/agentic-mcp-security-best-practices-v1/),
  [Checkmarx MCP incidents](https://checkmarx.com/learn/mcp-security-risks-real-world-incidents-and-security-controls/):
  tool poisoning (malicious tool descriptions — Invariant Labs' WhatsApp exfiltration demo) is
  classified under **ASI01 Agent Goal Hijack in the OWASP Top 10 for Agentic Applications
  (2026)** ★ — a newer OWASP list than the LLM Top 10 the AWOS audit cites.
- Consensus controls map 1:1 onto our 1c findings: **pin versions in MCP config + verify
  signatures + alert on tool-description changes between versions** ("rug pull" window — exactly
  the unpinned serena/`:latest`/`@canary` pattern we found), credential scoping per tool
  (vs the GitHub PAT in hops' `:latest` container), sandbox local servers.
- Validates the Phase 2 MCP-pinning check and gives it a citation trail.

## Cross-cutting frameworks

- **[NIST SP 800-218A](https://csrc.nist.gov/pubs/sp/800/218/a/final)** — the SSDF community
  profile for generative AI (2024-07). Written for *developing AI systems*, but its framing
  (SSDF practices extended with AI-specific tasks) is the citable government-grade anchor for
  "AI-assisted development needs added practices, not different ones."
- **OWASP CI/CD Security Top 10** — pipeline-level risks (poisoned pipeline execution,
  insufficient PBAC, artifact integrity); the checklist to audit the GHA workflows against if
  Phase 2 touches CI (label-gated osv job, PAT handling).
- **OWASP Top 10 for LLM Applications** — already the AWOS audit's source for AIS checks;
  the Agentic Applications list (2026) is its successor for agent-specific threats.

## Shortlist — new options for Phase 2, by cost

| Option | Cost | Risk covered | Novelty |
|---|---|---|---|
| pnpm `minimumReleaseAge` in hop-ui | one line | supply chain | closes audit SCS-04 |
| MCP-config pinning check | small script | AI toolchain | citable (CSA/OWASP ASI01), nothing gates it today |
| Hallucinated-package CI check | small script | slopsquatting | novel, directly AI-SDLC, article-worthy |
| TruffleHog verification pass | tool run | secrets (rotation triage) | answers "which are live" safely |
| OpenSSF Scorecard per repo | CI action | posture metric | third-party number for the article |
| GitHub push protection | org setting | secrets backstop | plan-dependent — verify availability |
| Security-review skill/command org-wide | port existing | AI-gen vulns | Anthropic loop pattern |
