# artifacts/

Evidence for publication — the proof behind every claim in the article.

Holds: scanner output, before/after comparisons, audit score deltas across runs, screenshots of
checks firing, CI run links.

## Redact before committing

Scan output from a real internal product can embed **live credentials** — a GitLeaks finding
includes the matched secret, a dependency audit includes internal package names and hosts.

- Redact secrets, tokens, internal hostnames, and customer-identifying data before anything lands
  here.
- Un-redacted raw output goes in `scratch/` at the repo root, which is gitignored and never
  committed.
- When in doubt, truncate the matched value and keep the rule name and file path — that is what
  actually evidences the finding.

## Make it reproducible

Each artifact should carry, in the file or alongside it: the command that produced it, the date, and
the HOPS commit it was run against. An artifact nobody can regenerate is an assertion, not evidence.
