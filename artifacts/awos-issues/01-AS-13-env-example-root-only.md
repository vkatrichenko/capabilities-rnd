audit: AS-13 `detectEnvExample` probes the repo root only — per-module `.env.example` in a monorepo yields a false FAIL

**Effort:** ~0.5 day
**Profit:** low on its own (5 weight points, false FAIL not false PASS) — filed as the smallest concrete instance of #159's "root-only scan audit" item, with a reproducer and a test.

## Problem

`detectors/security.ts:172-182` (`detectEnvExample`, category 2602 / AS-13) does:

```ts
for (const name of ENV_EXAMPLE_GLOBS) {
  const full = join(repoPath, name);
  if (existsSync(full)) found.push(name);
}
```

Six literal names, repo root only. In a monorepo the template lives next to the module that consumes it. Observed on a Kotlin/Spring + React + Node monorepo audited with engine 2.4.3 (2026-08-03; code unchanged on `main` at v2.4.5):

- Tracked: `e2e/.env.example`, `agent/.env.example`, `backend/.env.example`, `ui/.env.example` — all four predate the run (oldest 2026-05-15).
- Result: `AS-13 FAIL — "no .env.example or .env.template file found — developers have no reference for required environment variables"`.
- Same FAIL on the previous run (2026-07-17) when two of the four already existed.

`applies_when = "topology.uses_env_vars"` fired correctly (the modules do read env), so the check applied and then looked in the one place the file is not. The evidence string asserts a repo-wide absence the detector never tested (cf. #156).

## Fix

1. Walk module roots, not just the repo root: any directory containing a package manifest (`package.json`, `pyproject.toml`, `build.gradle(.kts)`, `pom.xml`, `go.mod`, `Cargo.toml`) or, simpler, a bounded `iterFiles(repoPath, ENV_EXAMPLE_GLOBS, SOURCE_IGNORE)` with the existing prune list — the glob helper already exists and `detectEnvGitignored` next door already uses it for `.gitignore`.
2. Evidence lists the relative paths found (`4 template(s): backend/.env.example, …`).
3. Test in `tests/det-security.test.ts`: fixture with `.env.example` only under `services/api/` → PASS; no template anywhere → FAIL unchanged.

## Definition of done

- [ ] Per-module templates PASS with paths in evidence; root-only behaviour preserved as a subset.
- [ ] Test fixture above added and green under `npm run test:audit-engine`.
- [ ] Recorded against #159's root-only audit list as "widened".
- [ ] `dist/` rebuilt; plugin version bumped.
