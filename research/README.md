# research/

Phase 1 output — what exists, what is missing, and what the sources say.

| Subdirectory | Holds |
|---|---|
| `baseline/` | Inventory of security measures **already present**, per layer (client-side hooks, CI/CD, static analysis, package verification) — for **all four BarHopping repos**, not just `hops`. `cross-repo-matrix.md` holds the comparison; one file per repo holds the detail. Each entry names the file it was verified against. This is the "before" half of every before/after claim in the article. |
| `sources/` | Notes and extracts from external material: the AWOS audit runs in `hops/context/audits/`, the Anthropic "Future of Engineering" security article, vendor and tool documentation. One file per source, with the link or path it came from at the top. |
| `findings/` | Gap analysis and conclusions drawn from the above — what HOPS lacks, what is worth implementing in Phase 2, and what was deliberately ruled out of scope. A finding without a cited source in `sources/` or `baseline/` is not a finding. |

Keep out-of-scope observations here, marked as such, rather than acting on them — infrastructure,
runtime, and network security are outside this capability (this rules out `barley`'s Terraform and
`sowinsights`'s `terraform-infra/`).

All four repos are **read-only**: research reads everything, changes land only in `hops`. A gap
found in `barley`, `hops-mcp` or `sowinsights` is written up as a recommendation in `findings/`, not
implemented.
