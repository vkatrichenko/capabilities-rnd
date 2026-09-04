# Out of scope — recorded, not chased (capability 2)

Observations that surfaced during the cloud-infrastructure research and belong to another
capability or to the owners. Each is written up so it is not lost and not re-discovered.

| Observation | Where | Why it is out of scope here |
|---|---|---|
| In-cluster plain-HTTP between services (`http://hop-be`, PostgREST, OTel collector, `tls.insecure = true` collector→Jaeger) | hops `docs/processes/security-notes.md` AS-01; hops IaC `modules/opentelemetry/main.tf` | Documented accepted risk; the fix is a service mesh or per-service certs — a runtime/network decision the owners track separately |
| Runtime intrusion detection inside containers (Falco / eBPF syscall auditing), recommended by two of the collected sources | `research/sources/cloud/Strategic Roadmap…md` §2, §5 | Runtime security is out of scope by charter; noted as the natural capability 3 |
| Post-quantum cryptography migration and confidential computing | same source, §4 | No control in any repo touches key-exchange choice; TLS policy currency (TLS 1.3 on ALB/CloudFront) is the in-scope proxy |
| Application-level auth on Jaeger / SonarQube (SSO instead of basic auth / default admin) | hops IaC `modules/jaeger`, `modules/sonarqube` | The exposure (public zone, internal-only ALB) is in scope; choosing an SSO integration is an application decision |
| barley's open `.claude/settings.local.json` secrets (prod RDS password, LangSmith key, OAuth secret) | barley audit 2026-06-03 `security.md:31-37` | Capability 1 item (rotation runbook exists in `barley-rotation-runbook.md`); referenced here only because the password belongs to the unencrypted RDS |
| Cost anomalies: single NAT gateway per env, `db.serverless` min capacity, spot previews | hops IaC, sow-insights-infra `modules/network` | Reliability/cost, not security — the "Infrastructure & Cloud" capability Rodion mentioned as the second topic |
| Dead code: `modules/acm_certificate` and `modules/route53` never instantiated in sow-insights-infra; `charts/otelcol` unused in hops IaC; `.gitlab-ci.yml` legacy pipeline still committed in hops and sowinsights | respective repos | Hygiene; only the live dind-without-TLS config in the legacy GitLab pipeline is carried as a finding, because a mirror runner would execute it |
| Barley's `-lock=false` plan and plan-output-in-PR-comment | barley `reusable-terraform-plan.yml:56-64` | Documented rationale; information-exposure risk noted in the barley baseline, not pursued |
| Whether AWS Organizations / SCPs / Identity Center exist above the three accounts | not in any repo | Org-level; Prowler on `proj-hops` will show whether the account is an org member — anything further is a question for the platform owners |
