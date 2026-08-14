# research/

Phase 1 output — what exists, what is missing, and what the sources say.

| Subdirectory | Holds |
|---|---|
| `baseline/` | Inventory of security measures **already present** in HOPS, per layer (client-side hooks, CI/CD, static analysis, package verification). Each entry names the file it was verified against. This is the "before" half of every before/after claim in the article. |
| `sources/` | Notes and extracts from external material: the AWOS audit runs in `hops/context/audits/`, the Anthropic "Future of Engineering" security article, vendor and tool documentation. One file per source, with the link or path it came from at the top. |
| `findings/` | Gap analysis and conclusions drawn from the above — what HOPS lacks, what is worth implementing in Phase 2, and what was deliberately ruled out of scope. A finding without a cited source in `sources/` or `baseline/` is not a finding. |

Keep out-of-scope observations here, marked as such, rather than acting on them — infrastructure,
runtime, and network security are outside this capability.
