audit: AS-05 `detectNoHardcodedSecrets` prunes `test`/`tests`/`fixtures`/`testdata` — committed credentials in recorded test fixtures produce a false PASS

**Effort:** ~1 day
**Profit:** **high** — false negative on the highest-consequence check in the dimension. Test directories are a *known* leak location (VCR/nock cassettes, recorded API responses, seeded configs). A credential is committed regardless of which directory holds it, and attackers scanning leaked repos do not skip `tests/`.

## Problem

`detectors/application_security.ts:464-472`:

```ts
const APPSEC_SECRET_IGNORE = [...SOURCE_IGNORE, 'vendor', 'fixtures', 'testdata', '__tests__', 'test', 'tests'];
```

and `detectNoHardcodedSecrets` (`:478`) walks with that prune list. Two compounding effects:

1. **Whole subtrees never read.** Real case (older markdown-schema run, 2026-06-03, same exclusion by design — "grep excl. tests/docs returned 0"): SEC-04 / "no secrets in committed files" PASSed on a Python repo while a live CI registration token sat in `tests/integration/fixtures/vcr_cassettes/*.yaml`, recorded against real credentials (commit message literally said so) and present in HEAD for ~6 months. The repo's scrubber filtered request headers but not the response body field carrying the token — exactly the failure the audit should catch and exactly the directory it refuses to enter. Confirmed the same prune list survives in the current TS detector.
2. **`APPSEC_PLACEHOLDER_RX` (`:461-462`) contains bare `/test/`**, so any scanned line whose content contains "test" — `TEST_DB_PASSWORD = "…"`, a URL with `/test/`, a comment — is skipped even in scanned directories.

Net: the detector answers "no hardcoded secrets in *production source outside test dirs, on lines not containing the word test*", while the evidence string says "no hardcoded secret patterns found in source files".

## Fix

1. Remove `test`, `tests`, `__tests__`, `fixtures`, `testdata` from `APPSEC_SECRET_IGNORE`. Keep `vendor` and `SOURCE_IGNORE`.
2. Suppress by *value*, not by *location*: tighten the placeholder regex to match the value side of the assignment (`(?:=|:)\s*["'](?:test|fake|dummy|example|changeme|xxx|placeholder)`), drop bare `test`, and add well-known documentation constants (`AKIAIOSFODNN7EXAMPLE`, `wJalrXUtnFEMI/K7MDENG…`, `-----BEGIN … PRIVATE KEY-----\ntest`).
3. Add high-precision structured-token patterns that never appear in legitimate fixtures: `glpat-`, `GR13`, `xox[abp]-`, `ghp_`/`github_pat_`, `sk-[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}` (minus the doc constant). These carry near-zero FP risk and are the shapes that actually leak through cassettes.
4. Report test-dir hits separately in evidence (`3 hit(s), 2 under tests/`) so a maintainer can see the recorded-fixture pattern.
5. Tests: cassette-style YAML under `tests/fixtures/` with a `glpat-…` value → FAIL; the AWS doc example key → PASS; `TEST_PASSWORD = "hunter2"` → still flagged (a real value with a test-ish name is the common leak shape).

## Definition of done

- [ ] Test directories walked; fixture above FAILs.
- [ ] Documentation constants and value-side placeholders still suppressed; no new FAIL on the engine's own fixture set.
- [ ] Evidence string reflects what was scanned.
- [ ] `dist/` rebuilt; plugin version bumped.
