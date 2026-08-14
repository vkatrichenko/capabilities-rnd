# DevOps Capabilities Research

## TL;DR
- DevOps Capabilities Research launched 2026-08-13: first capability is AI SDLC security (code/repository security in AI-assisted development, not infrastructure security) for Provectus website publication.
- Team: Vladyslav Katrychenko (100% hands-on researcher), Ruslan Sadretdinov + Rodion Ugarov (scientific advisors/reviewers), Barley (documentation/tracking). Approved by Dasha Goranina.
- Test project: HOPS (HOPS internal project) — changes restricted to development environment only, no production impact.
- Three phases: (1) Research — collect existing capabilities, (2) Expand — implement additional security checks, (3) Generalize — extract learnings for website publication.
- Extreme urgency: progress questions expected Monday 2026-08-18, publication questions by end of next week (~Aug 22).
- Communication: private Slack channel "DevOps Capabilities Research" (Vladyslav, Ruslan, Rodion, Barley).
- Final deliverable: "a small scientific article" with evidence and artifacts — no open-sourcing planned.

## Purpose

Standalone route for the DevOps Capabilities Research initiative — a distinct project with its own team, phased roadmap, communication channel, and independent lifecycle. Separated from devops-practice-goals because capabilities research is an execution-phase project, not a goal-setting exercise.

Agents working on AI SDLC security, HOPS security improvements, or website capability publications should start here.

## Core Concepts

### What "Capabilities" Means
"Capabilities" is a marketing term for company competencies published on the Provectus website with evidence and artifacts. Each capability demonstrates Provectus expertise in a specific domain through hands-on research, implementation, and documented results.

### Scope: AI SDLC Security
The first capability focus is AI SDLC security — code and repository security in AI-assisted development.
- In scope: secrets exposure in Git from LLM-generated code, vulnerabilities introduced by AI-generated code, supply-chain attacks via unverified packages.
- Out of scope: infrastructure security, runtime security, network security.

## Team

| Person | Role |
|---|---|
| Vladyslav Katrychenko | 100% hands-on researcher — sole executor |
| Ruslan Sadretdinov | Scientific advisor/reviewer |
| Rodion Ugarov | Scientific advisor/reviewer, read access to HOPS repos |
| Barley | Documentation and tracking |
| Dasha Goranina | Project approver, HOPS access approver |

## Phases

### Phase 1: Research
Collect existing security capabilities from HOPS. Review AWOS audit security section and Anthropic "Future of Engineering" article. Document methodology.
- Immediate tasks: access HOPS repos, get AWOS audit results from Dasha Goranina, review Anthropic security article.
- Fresh view strategy: Vladyslav to do independent research before syncing with Max Ivanchenko/Vasiliy Ilichev on their roadmap.
- Quick wins first: start with low-hanging fruit (AWOS audit checks, existing security measures), then expand.

### Phase 2: Expand
Implement additional security checks and measures on HOPS beyond what already exists.

### Phase 3: Generalize
Extract learnings applicable beyond HOPS for Provectus website publication. Final output resembles a small scientific article with evidence and artifacts.

## Security Layers and Tools

- Client-side hooks/skills: pre-commit and post-commit hooks, code reviewer skill in AWOS.
- CI/CD-level: independent agents running security checks in the pipeline.
- Static analyzers: GitLeaks (secrets detection), Checkov (infrastructure-as-code security).
- Package verification: version pinning, lock files to prevent supply-chain attacks.

## Test Project: HOPS

HOPS (HOPS internal project) was chosen as the test project because it is a classic, actively-developed software project with practical benefit from security improvements.
- Access approved by Dasha Goranina and the HOPS tech lead.
- Rodion has read access for review purposes.
- Changes restricted to development environment only — no production impact.

## Timeline

- Launched: 2026-08-13.
- Progress questions expected: Monday 2026-08-18.
- Publication questions expected: end of next week (~2026-08-22).
- Extreme urgency — Ruslan Sadretdinov set the pace.

## Communication

Private Slack channel: "DevOps Capabilities Research" — members: Vladyslav Katrychenko, Ruslan Sadretdinov, Rodion Ugarov, Barley.

## Methodology

Rodion requested Vladyslav keep a brief log of his research methodology to enable scaling the process to other capabilities in the future. The methodology documentation is a first-class requirement, not optional.

## Constraints

- Changes to HOPS restricted to development environment only — no production impact.
- No open-sourcing of code planned.
- Fresh view first: Vladyslav must complete independent research before syncing with Max Ivanchenko or Vasiliy Ilichev on their roadmap.
- Future sync with Max/Vasiliy planned after initial research is complete.

## Source

2026-08-13 Capabilities kickoff (Rodion Ugarov, Ruslan Sadretdinov, Vladyslav Katrychenko) — Barley: https://barley.provectus.pro/source/654acf5e-6df5-4509-8920-9da670582f89
