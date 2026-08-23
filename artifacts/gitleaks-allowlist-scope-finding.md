# A secret-scanning gate that hides secrets: `regexTarget = "line"`

Found 2026-08-19 while porting the HOPS gitleaks gate to `barley` (Phase 2).
Tool: gitleaks **8.24.3** (`gitleaks_8.24.3_darwin_arm64.tar.gz`,
sha256 `b90f13bb8c90ab72083d9b0c842e39dafb82c0e5c3f872f407366b7a58909013`,
verified against the release checksums file — which also independently confirms
the `linux_x64` sha256 `9991e0b2…` that the HOPS CI job pins).

## Why it matters

Every repo in scope treats the gitleaks gate as the one control that works.
`hops` is the only BarHopping repo that has one at all. This finding is that the
gate's own **tuning mechanism** can disable it, silently, with no signal anywhere
that detection has been lost — a fourth variant of the pattern this capability
keeps hitting: a control can exist, be enforced, be wired up, be licensed, and
still be **scoped away by its own configuration**.

## Two distinct problems, both measured

### 1. By design: allowlisting a line allowlists everything on it

`hops/.gitleaks.toml` sets `regexTarget = "line"` so a HubSpot correlation-id
regex can use the surrounding header name as context. The consequence is that
*any* finding sharing a line with an allowlisted value is suppressed.

Control: a synthetic HubSpot-shaped credential appended to an
`X-HubSpot-Correlation-Id` line in a **copy** of `hop-sync/Hubspot_data_sync.ipynb`
(the repo itself was never modified):

| `hops/.gitleaks.toml` | Planted credential |
|---|---|
| `regexTarget = "line"` (as shipped) | **0 findings — hidden** |
| `regexTarget = "match"` | 1 finding — caught |

### 2. Apparently a defect: it drops findings when the regex matches nothing

A global allowlist whose only regex is `ZZZNOMATCHZZZ` — matching nothing
anywhere — still removes findings once `regexTarget = "line"` is set.

| Target | `hops` worktree | `barley` cassettes (pre-scrub tree) |
|---|---|---|
| no allowlist | 8 | 22 |
| `regexTarget = "match"` + no-op regex | 8 | 22 |
| `regexTarget = "line"` + **no-op** regex | 4 | **17** |

What disappears on `barley` is **3 genuine `gitlab-rrt` runner tokens** plus 2
others. On `hops`, the 4 `hubspot-api-key` notebook hits.

Root cause **not confirmed**. It did not reproduce on synthetic fixtures —
neither a 1.4 KB single-line JSON blob, a wrapped YAML scalar, nor lines seeded
with common allowlist stopwords. It reproduces deterministically on both real
repos. The lost findings share large `StartColumn` values or wide match spans,
but that correlation did not hold when constructed deliberately, so it is a
correlation and not a mechanism. Reported here as behaviour, not as a diagnosis.

## Fix applied

Both configs now use `regexTarget = "match"`. The matched span already carries
the field-name context the regexes needed, so suppression is unchanged in output
and correct in mechanism.

- `hops` — `.gitleaks.toml`, worktree scan 0 findings before and after; planted
  control goes 0 → 1.
- `barley` — new `.gitleaks.toml` written with `match` from the start, plus an
  in-file note stating why `line` is not used.

## The procedure that catches this class of bug

Any allowlist edit is now checked by diffing against a no-allowlist baseline,
and every suppressed finding must be individually attributable to a config entry:

```bash
gitleaks detect --no-git --redact --report-format json --report-path base.json
gitleaks detect --no-git --redact --config .gitleaks.toml \
  --report-format json --report-path tuned.json
# every finding in base.json but not tuned.json must be accounted for by name
```

Applied to `barley`, this turned 89 findings into 3 with all 86 suppressions
attributed to a named entry — and it caught two entries that matched nothing on
the target branch, which were removed rather than shipped as unverifiable cruft.

A second control belongs with it: **plant synthetic credentials inside the
allowlisted contexts** and confirm they are still detected. On `barley`, three
plants (a runner token in a cassette, an AWS key on a `linkedinbio` line, a Slack
token beside a `YOUR_API_KEY` placeholder) were all detected through the
allowlist. An earlier plant that went undetected turned out to be low-entropy,
not suppressed — worth knowing, because it is the failure mode that makes this
control look like it passed when it did not run.

## Upstream

Candidate issue for `gitleaks/gitleaks`, blocked on a shareable reproducer:
both current reproductions are on private internal repos and cannot be attached.
Joins the W3.4 upstream-reporting item alongside the AWOS detector bugs.
