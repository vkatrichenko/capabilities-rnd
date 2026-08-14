# tooling/

Phase 2 output — the security checks built here and ported into HOPS.

| Subdirectory | Holds |
|---|---|
| `hooks/` | Client-side hooks: git pre-commit and post-commit, and Claude Code hooks (`PreToolUse` / `PostToolUse`). HOPS already has `scripts/pre-commit` and `scripts/claude-hooks/block-secrets.sh` — extend or replace those deliberately, do not duplicate them. |
| `ci/` | CI/CD security jobs — GitHub Actions workflow fragments and pipeline security agents. Target file in HOPS is `.github/workflows/hops-mr-check.yml`, which already runs `secret-scan` (gitleaks), `sonarqube-check-mr`, and `osv-audit-hop-ui`. |
| `configs/` | Scanner configuration — GitLeaks, Checkov, and successors. HOPS already carries a tuned `.gitleaks.toml`; changes to it belong here first, with the reasoning, then get applied there. |

Everything here should be **portable**: written so it can be dropped into a repo other than HOPS.
That portability is what Phase 3 generalizes from — a check that only works against HOPS paths is
not a capability.

Nothing in this directory runs in CI from this repo. It is source material for changes made in HOPS,
where the dev-environment-only constraint applies.
