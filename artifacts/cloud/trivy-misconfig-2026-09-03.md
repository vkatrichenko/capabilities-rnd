# Trivy misconfiguration scan — all repos, trivy Version: 0.69.3 · 2026-09-03T20:35Z, GitHub snapshots added 2026-09-04

Instrument held constant: `trivy fs --scanners misconfig` 0.69.3 (default ruleset, no ignore file, all severities),
over `git archive` snapshots of each repository's default branch on GitHub (`scratch/cloud/src/<repo>/.MEASURED_REF`).
Command: `scratch/cloud/run-trivy.sh`. Raw JSON in `scratch/cloud/trivy/` (gitignored). Trivy misconfig output carries no
secret values; file paths and resource names are kept as evidence.

Two numbers per snapshot. **FAIL rows** count every failing resource — one unsafe module called 27 times gives 27 rows
(barley's ECR). **Pass-rate** is Trivy's own `MisconfSummary`: successes ÷ (successes + failures) over every check it
evaluated — the mechanical "how secure" figure, weighted by how many resources exist. "Distinct checks" is the
comparable severity of the problem set across repos.

Superseded snapshots (the retired GitLab heads `hops-iac`, `hops-iac-head`, `sow-insights-infra`) are kept in
`scratch/` but not listed; the GitHub `hops-infra` head is 42 commits past them and every prior claim was re-verified there.

## Summary

| Snapshot | Measured ref | FAIL rows | CRITICAL | HIGH | MEDIUM | LOW | distinct checks | pass-rate |
|---|---|---|---|---|---|---|---|---|
| `core-infra` | core-infra(github) main 36a127633 2026-08-28 | **73** | 12 | 20 | 11 | 30 | 32 | 94.1 % |
| `hops-infra-gh` | hops-infra(github) main 9ce74cd45 2026-07-16 | **67** | 2 | 33 | 9 | 23 | 34 | 87.2 % |
| `hops` | hops origin/main 63d0cc050 2026-09-03 | **97** | 0 | 23 | 30 | 44 | 22 | 94.9 % |
| `hops-rendered` | hops origin/main 63d0cc050 2026-09-03 (helm template, prod-shaped --set values) | **90** | 0 | 21 | 27 | 42 | 20 | 86.5 % |
| `hops-k8s-manifests` | hops-k8s-manifests(github) main 733f3dd00 2025-02-06 | **42** | 0 | 9 | 12 | 21 | 14 | 95.4 % |
| `barley` | barley origin/develop 548f0271f 2026-09-03 | **530** | 16 | 279 | 110 | 125 | 44 | 68.4 % |
| `sowinsights-infra-gh` | sowinsights-infra(github) main 3cc8a7a48 2026-07-27 | **17** | 3 | 7 | 2 | 5 | 10 | 93.8 % |
| `sowinsights` | sowinsights origin/main b12880d31 2026-08-27 | **18** | 0 | 5 | 5 | 8 | 17 | 94.2 % |
| `hops-mcp` | hops-mcp origin/main 352b091b7 2026-08-31 | **0** | 0 | 0 | 0 | 0 | 0 | 100.0 % |
| `hops-mcp-rendered` | hops-mcp origin/main 352b091b7 2026-08-31 (helm template --set environment=prod --set ingress.host=…) | **31** | 0 | 6 | 7 | 18 | 17 | 76.2 % |

Notes:
- `hops` = the application repo: five Helm charts scanned as charts (no `values.yaml` exists, so Trivy renders with empty
  values) and three Dockerfiles. `hops-rendered` = the same charts rendered with production-shaped `--set` values — same
  findings, so the Kubernetes hardening gap is in the templates, not the values.
- **`hops-mcp` scoring 0 FAIL / 100 % is a silent skip, not a clean chart.** Its chart fails `helm template` with default
  values (`ingress.host` nil, then a required `environment` value); Trivy drops an unrenderable chart from the results
  without an error line — the JSON lists only `package-lock.json` and `Dockerfile`. Rendered with the two required values
  (`hops-mcp-rendered`) the same chart fails 31 checks, 6 HIGH — no `securityContext` at all. The Dockerfile *is* clean.
  Same failure shape as the audit's AIS-03: a scanner that reports nothing when it cannot read its input.
- `hops-k8s-manifests` is a dead single-app (`planner`) repo — last commit 2025-02, committed tfstate and a vendored
  provider binary; scanned for completeness, not scored.


## core-infra

`core-infra(github) main 36a127633 2026-08-28` · pass-rate 94.1 % (1157 / 1230)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| AWS-0104 — A security group rule should not allow unrestricted egress to any IP address. | CRITICAL | 10 | `terraform-aws-modules/eks/aws/node_groups.tf`, `terraform/us-east-2/modules/codebuild/main.tf`, `terraform/us-east-2/modules/planner-rds/main.tf` |
| AWS-0040 — EKS Clusters should have the public access disabled | CRITICAL | 1 | `terraform-aws-modules/eks/aws/main.tf` |
| AWS-0041 — EKS cluster should not have open CIDR range for public access | CRITICAL | 1 | `terraform-aws-modules/eks/aws/main.tf` |
| AWS-0132 — S3 encryption should use Customer Managed Keys | HIGH | 3 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf`, `terraform/us-east-2/modules/monitoring/loki_v2/main.tf` |
| AWS-0030 — ECR repository has image scans disabled. | HIGH | 2 | `git::https:/github.com/azatsafin/terraform-aws-wireguard/terraform-aws-modules/lambda/aws/modules/docker-build/modules/docker-build/main.tf`, `terraform/us-east-2/modules/planner-ecr/main.tf` |
| AWS-0031 — ECR images tags shouldn't be mutable. | HIGH | 2 | `git::https:/github.com/azatsafin/terraform-aws-wireguard/terraform-aws-modules/lambda/aws/modules/docker-build/modules/docker-build/main.tf`, `terraform/us-east-2/modules/planner-ecr/main.tf` |
| AWS-0086 — S3 Access block should block public ACL | HIGH | 2 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf` |
| AWS-0087 — S3 Access block should block public policy | HIGH | 2 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf` |
| AWS-0091 — S3 Access Block should Ignore Public ACL | HIGH | 2 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf` |
| AWS-0093 — S3 Access block should restrict public bucket to limit access | HIGH | 2 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf` |
| AWS-0095 — Unencrypted SNS topic. | HIGH | 1 | `git::https:/github.com/azatsafin/terraform-aws-wireguard/event-bridge.tf` |
| AWS-0028 — aws_instance should activate session tokens for Instance Metadata Service. | HIGH | 1 | `git::https:/github.com/azatsafin/terraform-aws-wireguard/terraform-aws-modules/ec2-instance/aws/main.tf` |
| AWS-0131 — Instance with unencrypted block device. | HIGH | 1 | `git::https:/github.com/azatsafin/terraform-aws-wireguard/terraform-aws-modules/ec2-instance/aws/main.tf` |
| AWS-0039 — EKS should have the encryption of secrets enabled | HIGH | 1 | `terraform-aws-modules/eks/aws/main.tf` |
| AWS-0164 — Instances in a subnet should not receive a public IP address by default. | HIGH | 1 | `terraform-aws-modules/vpc/aws/main.tf` |
| AWS-0090 — S3 Data should be versioned | MEDIUM | 3 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf`, `terraform/us-east-2/modules/monitoring/loki_v2/main.tf` |
| AWS-0038 — EKS Clusters should have cluster control plane logging turned on | MEDIUM | 2 | `terraform-aws-modules/eks/aws/main.tf` |
| AWS-0342 — IAM Pass Role Filtering | MEDIUM | 2 | `terraform/us-east-2/modules/gitlab/helm-compute-runner/main.tf`, `terraform/us-east-2/modules/gitlab/helm-runner/main.tf` |
| AWS-0178 — VPC Flow Logs is a feature that enables you to capture information about the IP traffic going to and from network interfaces in your VPC. After you've created a flow log, you can view and retrieve its data in Amazon CloudWatch Logs. It is recommended that VPC Flow Logs be enabled for packet "Rejects" for VPCs. | MEDIUM | 1 | `terraform-aws-modules/vpc/aws/main.tf` |
| AWS-0024 — Point in time recovery should be enabled to protect DynamoDB table | MEDIUM | 1 | `terraform/us-east-2/aws_dynamo_state_lock.tf` |
| AWS-0176 — RDS IAM Database Authentication Disabled | MEDIUM | 1 | `terraform/us-east-2/modules/planner-rds/main.tf` |
| AWS-0177 — RDS Deletion Protection Disabled | MEDIUM | 1 | `terraform/us-east-2/modules/planner-rds/main.tf` |
| AWS-0124 — Missing description for security group rule. | LOW | 9 | `terraform/us-east-2/modules/codebuild/main.tf`, `terraform/us-east-2/modules/planner-rds/main.tf` |
| AWS-0017 — CloudWatch log groups should be encrypted using CMK | LOW | 8 | `terraform/us-east-2/modules/cloudwatch_log_group/main.tf`, `terraform/us-east-2/modules/codebuild/main.tf` |
| AWS-0089 — S3 Bucket Logging | LOW | 3 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf`, `terraform/us-east-2/modules/monitoring/loki_v2/main.tf` |
| AWS-0066 — Lambda functions should have X-Ray tracing enabled | LOW | 2 | `git::https:/github.com/azatsafin/terraform-aws-wireguard/terraform-aws-modules/lambda/aws/main.tf` |
| AWS-0033 — ECR Repository should use customer managed keys to allow more control | LOW | 2 | `git::https:/github.com/azatsafin/terraform-aws-wireguard/terraform-aws-modules/lambda/aws/modules/docker-build/modules/docker-build/main.tf`, `terraform/us-east-2/modules/planner-ecr/main.tf` |
| AWS-0094 — S3 buckets should each define an aws_s3_bucket_public_access_block | LOW | 2 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf`, `terraform/us-east-2/modules/monitoring/loki/main.tf` |
| AWS-0025 — DynamoDB tables should use at rest encryption with a Customer Managed Key | LOW | 1 | `terraform/us-east-2/aws_dynamo_state_lock.tf` |
| AWS-0098 — Secrets Manager should use customer managed keys | LOW | 1 | `terraform/us-east-2/aws_secretsmanager.tf` |
| AWS-0143 — IAM policies should not be granted directly to users. | LOW | 1 | `terraform/us-east-2/modules/cicd/argo-artifacts/main.tf` |
| AWS-0133 — Enable Performance Insights to detect potential problems | LOW | 1 | `terraform/us-east-2/modules/planner-rds/main.tf` |

## hops-infra-gh

`hops-infra(github) main 9ce74cd45 2026-07-16` · pass-rate 87.2 % (456 / 523)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| AWS-0012 — CloudFront distribution allows unencrypted (HTTP) communications. | CRITICAL | 1 | `terraform/us-east-2/main.tf` |
| AWS-0104 — A security group rule should not allow unrestricted egress to any IP address. | CRITICAL | 1 | `terraform/us-east-2/modules/hops-rds/main.tf` |
| AWS-0132 — S3 encryption should use Customer Managed Keys | HIGH | 6 | `terraform/us-east-2/modules/gitlab-runners-cache/main.tf`, `terraform/us-east-2/modules/hop-sowa-documents/main.tf`, `terraform/us-east-2/modules/hops-prod/main.tf`, `terraform/us-east-2/modules/loki_v2/main.tf` |
| AWS-0030 — ECR repository has image scans disabled. | HIGH | 5 | `terraform/us-east-2/modules/ecr/main.tf` |
| AWS-0031 — ECR images tags shouldn't be mutable. | HIGH | 5 | `terraform/us-east-2/modules/ecr/main.tf` |
| KSV-0118 — Default security context configured | HIGH | 2 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| AWS-0095 — Unencrypted SNS topic. | HIGH | 2 | `terraform/us-east-2/modules/chatbot-slack/main.tf` |
| AWS-0086 — S3 Access block should block public ACL | HIGH | 2 | `terraform/us-east-2/modules/hops-prod/main.tf` |
| AWS-0087 — S3 Access block should block public policy | HIGH | 2 | `terraform/us-east-2/modules/hops-prod/main.tf` |
| AWS-0091 — S3 Access Block should Ignore Public ACL | HIGH | 2 | `terraform/us-east-2/modules/hops-prod/main.tf` |
| AWS-0093 — S3 Access block should restrict public bucket to limit access | HIGH | 2 | `terraform/us-east-2/modules/hops-prod/main.tf` |
| AWS-0345 — Disallow unrestricted S3 IAM Policies | HIGH | 2 | `terraform/us-east-2/modules/iam/hops-backend/main.tf` |
| KSV-0014 — Root file system is not read-only | HIGH | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| AWS-0011 — CloudFront distribution does not have a WAF in front. | HIGH | 1 | `terraform/us-east-2/main.tf` |
| AWS-0079 — There is no encryption specified or encryption is disabled on the RDS Cluster. | HIGH | 1 | `terraform/us-east-2/modules/hops-rds/main.tf` |
| AWS-0090 — S3 Data should be versioned | MEDIUM | 3 | `terraform/us-east-2/modules/gitlab-runners-cache/main.tf`, `terraform/us-east-2/modules/hops-prod/main.tf`, `terraform/us-east-2/modules/loki_v2/main.tf` |
| KSV-0001 — Can elevate its own privileges | MEDIUM | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0012 — Runs as root user | MEDIUM | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0104 — Seccomp policies disabled | MEDIUM | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0125 — Restrict container images to trusted registries | MEDIUM | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| AWS-0010 — Cloudfront distribution should have Access Logging configured | MEDIUM | 1 | `terraform/us-east-2/main.tf` |
| AWS-0343 — RDS Cluster Deletion Protection Disabled | MEDIUM | 1 | `terraform/us-east-2/modules/hops-rds/main.tf` |
| AWS-0089 — S3 Bucket Logging | LOW | 6 | `terraform/us-east-2/modules/gitlab-runners-cache/main.tf`, `terraform/us-east-2/modules/hop-sowa-documents/main.tf`, `terraform/us-east-2/modules/hops-prod/main.tf`, `terraform/us-east-2/modules/loki_v2/main.tf` |
| AWS-0033 — ECR Repository should use customer managed keys to allow more control | LOW | 5 | `terraform/us-east-2/modules/ecr/main.tf` |
| AWS-0094 — S3 buckets should each define an aws_s3_bucket_public_access_block | LOW | 2 | `terraform/us-east-2/modules/hops-prod/main.tf` |
| AWS-0124 — Missing description for security group rule. | LOW | 2 | `terraform/us-east-2/modules/hops-rds/main.tf` |
| KSV-0003 — Default capabilities: some containers do not drop all | LOW | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0004 — Default capabilities: some containers do not drop any | LOW | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0020 — Runs with UID <= 10000 | LOW | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0021 — Runs with GID <= 10000 | LOW | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0030 — Runtime/Default Seccomp profile not set | LOW | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0106 — Container capabilities must only include NET_BIND_SERVICE | LOW | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| KSV-0110 — Workloads in the default namespace | LOW | 1 | `terraform/us-east-2/charts/otelcol/templates/deployment.yaml` |
| AWS-0133 — Enable Performance Insights to detect potential problems | LOW | 1 | `terraform/us-east-2/modules/hops-rds/main.tf` |

## hops

`hops origin/main 63d0cc050 2026-09-03` · pass-rate 94.9 % (1811 / 1908)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| KSV-0118 — Default security context configured | HIGH | 12 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0014 — Root file system is not read-only | HIGH | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0056 — Manage Kubernetes networking | HIGH | 2 | `helm/hop-preview/templates/rolebinding.yaml` |
| DS-0002 — Image user should not be 'root' | HIGH | 2 | `hop-backend/Dockerfile`, `hop-ui/Dockerfile` |
| KSV-0053 — Exec into Pods | HIGH | 1 | `helm/hop-preview/templates/rolebinding.yaml` |
| KSV-0001 — Can elevate its own privileges | MEDIUM | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0012 — Runs as root user | MEDIUM | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0104 — Seccomp policies disabled | MEDIUM | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0013 — Image tag ":latest" used | MEDIUM | 5 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview/templates/deployment.yaml` |
| KSV-0117 — Prevent binding to privileged ports | MEDIUM | 2 | `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview/templates/deployment.yaml` |
| KSV-0048 — Manage Kubernetes workloads and pods | MEDIUM | 2 | `helm/hop-preview/templates/rolebinding.yaml` |
| KSV-0125 — Restrict container images to trusted registries | MEDIUM | 1 | `helm/hop-preview-db/templates/statefulset.yaml` |
| KSV-0049 — Manage configmaps | MEDIUM | 1 | `helm/hop-preview/templates/rolebinding.yaml` |
| KSV-0113 — Manage namespace secrets | MEDIUM | 1 | `helm/hop-preview/templates/rolebinding.yaml` |
| KSV-0003 — Default capabilities: some containers do not drop all | LOW | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0004 — Default capabilities: some containers do not drop any | LOW | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0020 — Runs with UID <= 10000 | LOW | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0021 — Runs with GID <= 10000 | LOW | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0030 — Runtime/Default Seccomp profile not set | LOW | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0106 — Container capabilities must only include NET_BIND_SERVICE | LOW | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| KSV-0110 — Workloads in the default namespace | LOW | 6 | `helm/hop-agent/templates/deployment.yaml`, `helm/hop-be/templates/deployment.yaml`, `helm/hop-fe/templates/deployment.yaml`, `helm/hop-preview-db/templates/statefulset.yaml` … +1 |
| DS-0026 — No HEALTHCHECK defined | LOW | 2 | `hop-backend/Dockerfile`, `hop-ui/Dockerfile` |

## hops-rendered

`hops origin/main 63d0cc050 2026-09-03 (helm template, prod-shaped --set values)` · pass-rate 86.5 % (575 / 665)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| KSV-0118 — Default security context configured | HIGH | 12 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0014 — Root file system is not read-only | HIGH | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0056 — Manage Kubernetes networking | HIGH | 2 | `hop-preview.yaml` |
| KSV-0053 — Exec into Pods | HIGH | 1 | `hop-preview.yaml` |
| KSV-0001 — Can elevate its own privileges | MEDIUM | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0012 — Runs as root user | MEDIUM | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0104 — Seccomp policies disabled | MEDIUM | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0117 — Prevent binding to privileged ports | MEDIUM | 2 | `hop-fe.yaml`, `hop-preview.yaml` |
| KSV-0013 — Image tag ":latest" used | MEDIUM | 2 | `hop-preview.yaml` |
| KSV-0048 — Manage Kubernetes workloads and pods | MEDIUM | 2 | `hop-preview.yaml` |
| KSV-0125 — Restrict container images to trusted registries | MEDIUM | 1 | `hop-preview-db.yaml` |
| KSV-0049 — Manage configmaps | MEDIUM | 1 | `hop-preview.yaml` |
| KSV-0113 — Manage namespace secrets | MEDIUM | 1 | `hop-preview.yaml` |
| KSV-0003 — Default capabilities: some containers do not drop all | LOW | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0004 — Default capabilities: some containers do not drop any | LOW | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0020 — Runs with UID <= 10000 | LOW | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0021 — Runs with GID <= 10000 | LOW | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0030 — Runtime/Default Seccomp profile not set | LOW | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0106 — Container capabilities must only include NET_BIND_SERVICE | LOW | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |
| KSV-0110 — Workloads in the default namespace | LOW | 6 | `hop-agent.yaml`, `hop-be.yaml`, `hop-fe.yaml`, `hop-preview-db.yaml` … +1 |

## hops-k8s-manifests

`hops-k8s-manifests(github) main 733f3dd00 2025-02-06` · pass-rate 95.4 % (873 / 915)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| KSV-0118 — Default security context configured | HIGH | 6 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0014 — Root file system is not read-only | HIGH | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0001 — Can elevate its own privileges | MEDIUM | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0012 — Runs as root user | MEDIUM | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0104 — Seccomp policies disabled | MEDIUM | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0013 — Image tag ":latest" used | MEDIUM | 2 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0117 — Prevent binding to privileged ports | MEDIUM | 1 | `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0003 — Default capabilities: some containers do not drop all | LOW | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0004 — Default capabilities: some containers do not drop any | LOW | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0020 — Runs with UID <= 10000 | LOW | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0021 — Runs with GID <= 10000 | LOW | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0030 — Runtime/Default Seccomp profile not set | LOW | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0106 — Container capabilities must only include NET_BIND_SERVICE | LOW | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |
| KSV-0110 — Workloads in the default namespace | LOW | 3 | `planner/charts/planner-be/chart/templates/deployment.yaml`, `planner/charts/planner-be/chart/templates/redis.yaml`, `planner/charts/planner-fe/chart/templates/deployment.yaml` |

## barley

`barley origin/develop 548f0271f 2026-09-03` · pass-rate 68.4 % (1148 / 1678)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| AWS-0104 — A security group rule should not allow unrestricted egress to any IP address. | CRITICAL | 16 | `cattle-ops/gitlab-runner/aws/docker_machine_security_group.tf`, `cattle-ops/gitlab-runner/aws/modules/terminate-agent-hook/main.tf`, `cattle-ops/gitlab-runner/aws/runner_security_group.tf`, `terraform/modules/custom_security_groups/v2/main.tf` … +2 |
| AWS-0030 — ECR repository has image scans disabled. | HIGH | 108 | `terraform/modules/ecr/main.tf` |
| AWS-0031 — ECR images tags shouldn't be mutable. | HIGH | 108 | `terraform/modules/ecr/main.tf` |
| AWS-0131 — Instance with unencrypted block device. | HIGH | 7 | `terraform/modules/claude_code_gateway/main.tf`, `terraform/modules/ec2_openvpn/main.tf`, `terraform/modules/neo4j/main.tf`, `terraform/modules/vpn/main.tf` |
| AWS-0132 — S3 encryption should use Customer Managed Keys | HIGH | 6 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/modules/static_site_bucket/main.tf` … +1 |
| AWS-0095 — Unencrypted SNS topic. | HIGH | 5 | `terraform/modules/aws_chatbot/main.tf`, `terraform/modules/ecs_sns/main.tf`, `terraform/modules/kms_audit_alerting/main.tf` |
| DS-0002 — Image user should not be 'root' | HIGH | 4 | `lambda_function/converter/Dockerfile`, `mcp_servers/barley/Dockerfile`, `services/claude_code_gateway/Dockerfile`, `web/Dockerfile` |
| AWS-0086 — S3 Access block should block public ACL | HIGH | 4 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/us-west-2/backend/main.tf` |
| AWS-0087 — S3 Access block should block public policy | HIGH | 4 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/us-west-2/backend/main.tf` |
| AWS-0091 — S3 Access Block should Ignore Public ACL | HIGH | 4 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/us-west-2/backend/main.tf` |
| AWS-0093 — S3 Access block should restrict public bucket to limit access | HIGH | 4 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/us-west-2/backend/main.tf` |
| AWS-0164 — Instances in a subnet should not receive a public IP address by default. | HIGH | 4 | `terraform/modules/network/main.tf` |
| AWS-0028 — aws_instance should activate session tokens for Instance Metadata Service. | HIGH | 3 | `terraform/modules/ec2_openvpn/main.tf`, `terraform/modules/vpn/main.tf` |
| AWS-0130 — aws_instance should activate session tokens for Instance Metadata Service. | HIGH | 3 | `terraform/modules/ec2_openvpn/main.tf`, `terraform/modules/vpn/main.tf` |
| DS-0017 — 'RUN <package-manager> update' instruction alone | HIGH | 2 | `Dockerfile` |
| AWS-0052 — Load balancers should drop invalid headers | HIGH | 2 | `terraform/modules/alb/main.tf` |
| AWS-0053 — Load balancer is exposed to the internet. | HIGH | 2 | `terraform/modules/alb/main.tf` |
| AWS-0026 — EBS volumes must be encrypted | HIGH | 2 | `terraform/modules/claude_code_gateway/main.tf` |
| AWS-0011 — CloudFront distribution does not have a WAF in front. | HIGH | 2 | `terraform/modules/cloudfront_spa/main.tf` |
| AWS-0107 — Security groups should not allow unrestricted ingress to SSH or RDP from any IP address. | HIGH | 2 | `terraform/modules/vpn/sg.tf` |
| DS-0015 — 'yum clean all' missing | HIGH | 1 | `lambda_function/converter/Dockerfile` |
| AWS-0015 — CloudTrail should use Customer managed keys to encrypt the logs | HIGH | 1 | `terraform/modules/cloudtrail/main.tf` |
| AWS-0080 — RDS encryption has not been enabled at a DB Instance level. | HIGH | 1 | `terraform/modules/rds/main.tf` |
| DS-0013 — 'RUN cd ...' to change directory | MEDIUM | 99 | `Dockerfile` |
| AWS-0090 — S3 Data should be versioned | MEDIUM | 5 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/modules/static_site_bucket/main.tf` |
| AWS-0010 — Cloudfront distribution should have Access Logging configured | MEDIUM | 2 | `terraform/modules/cloudfront_spa/main.tf` |
| AWS-0178 — VPC Flow Logs is a feature that enables you to capture information about the IP traffic going to and from network interfaces in your VPC. After you've created a flow log, you can view and retrieve its data in Amazon CloudWatch Logs. It is recommended that VPC Flow Logs be enabled for packet "Rejects" for VPCs. | MEDIUM | 2 | `terraform/modules/network/main.tf` |
| AWS-0176 — RDS IAM Database Authentication Disabled | MEDIUM | 1 | `terraform/modules/rds/main.tf` |
| AWS-0177 — RDS Deletion Protection Disabled | MEDIUM | 1 | `terraform/modules/rds/main.tf` |
| AWS-0098 — Secrets Manager should use customer managed keys | LOW | 67 | `terraform/modules/agentcore_gateway/cognito.tf`, `terraform/us-west-2/base-prod/spot_runners.tf`, `terraform/us-west-2/development/main.tf`, `terraform/us-west-2/development/mcp_oauth_proxy.tf` … +2 |
| AWS-0004 — No unauthorized access to API Gateway methods | LOW | 12 | `terraform/modules/api/google_calendar_webhook.tf`, `terraform/modules/api/jira-sprint.tf`, `terraform/modules/api/nango.tf`, `terraform/modules/api/project_metrics.tf` … +2 |
| AWS-0124 — Missing description for security group rule. | LOW | 8 | `terraform/modules/vpc_endpoint/main.tf`, `terraform/modules/vpn/sg.tf` |
| DS-0026 — No HEALTHCHECK defined | LOW | 6 | `Dockerfile`, `lambda_function/converter/Dockerfile`, `mcp_servers/barley/Dockerfile`, `mcp_servers/hubspot/Dockerfile` … +2 |
| AWS-0017 — CloudWatch log groups should be encrypted using CMK | LOW | 6 | `terraform/modules/api/cloudwatch.tf`, `terraform/modules/claude_code_gateway/logging.tf`, `terraform/modules/cloudtrail/main.tf`, `terraform/modules/ecs/gha_runner/main.tf` |
| AWS-0089 — S3 Bucket Logging | LOW | 6 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/modules/static_site_bucket/main.tf` … +1 |
| AWS-0190 — Ensure that response caching is enabled for your Amazon API Gateway REST APIs. | LOW | 4 | `terraform/modules/api/main.tf`, `terraform/modules/api/project_metrics.tf` |
| AWS-0094 — S3 buckets should each define an aws_s3_bucket_public_access_block | LOW | 4 | `terraform/modules/cloudtrail/main.tf`, `terraform/modules/s3/main.tf`, `terraform/modules/s3/v2/main.tf`, `terraform/us-west-2/backend/main.tf` |
| AWS-0066 — Lambda functions should have X-Ray tracing enabled | LOW | 3 | `cattle-ops/gitlab-runner/aws/modules/terminate-agent-hook/main.tf`, `terraform-aws-modules/lambda/aws/main.tf` |
| AWS-0003 — API Gateway must have X-Ray tracing enabled | LOW | 2 | `terraform/modules/api/main.tf` |
| AWS-0027 — EBS volume encryption should use Customer Managed Keys | LOW | 2 | `terraform/modules/claude_code_gateway/main.tf` |
| AWS-0034 — ECS clusters should have container insights enabled | LOW | 2 | `terraform/modules/ecs/main.tf` |
| AWS-0163 — You should enable bucket access logging on the CloudTrail S3 bucket. | LOW | 1 | `terraform/modules/cloudtrail/main.tf` |
| AWS-0033 — ECR Repository should use customer managed keys to allow more control | LOW | 1 | `terraform/modules/ecr/main.tf` |
| AWS-0133 — Enable Performance Insights to detect potential problems | LOW | 1 | `terraform/modules/rds/main.tf` |

## sowinsights-infra-gh

`sowinsights-infra(github) main 3cc8a7a48 2026-07-27` · pass-rate 93.8 % (257 / 274)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| AWS-0104 — A security group rule should not allow unrestricted egress to any IP address. | CRITICAL | 2 | `terraform-aws-modules/security-group/aws/main.tf` |
| AWS-0036 — Task definition defines sensitive environment variable(s). | CRITICAL | 1 | `terraform/us-east-1/941000539201-us-east-1/modules/ecs/main.tf` |
| AWS-0030 — ECR repository has image scans disabled. | HIGH | 2 | `terraform/us-east-1/941000539201-us-east-1/modules/ecr/main.tf`, `terraform/us-east-1/develop/modules/core/ecr.tf` |
| AWS-0031 — ECR images tags shouldn't be mutable. | HIGH | 2 | `terraform/us-east-1/941000539201-us-east-1/modules/ecr/main.tf`, `terraform/us-east-1/develop/modules/core/ecr.tf` |
| AWS-0132 — S3 encryption should use Customer Managed Keys | HIGH | 2 | `terraform/us-east-1/develop/modules/core/s3.tf`, `terraform/us-east-1/develop/modules/tf_remote/state.tf` |
| AWS-0095 — Unencrypted SNS topic. | HIGH | 1 | `terraform/us-east-1/941000539201-us-east-1/modules/chatbot/sns.tf` |
| AWS-0178 — VPC Flow Logs is a feature that enables you to capture information about the IP traffic going to and from network interfaces in your VPC. After you've created a flow log, you can view and retrieve its data in Amazon CloudWatch Logs. It is recommended that VPC Flow Logs be enabled for packet "Rejects" for VPCs. | MEDIUM | 2 | `terraform-aws-modules/vpc/aws/main.tf` |
| AWS-0033 — ECR Repository should use customer managed keys to allow more control | LOW | 2 | `terraform/us-east-1/941000539201-us-east-1/modules/ecr/main.tf`, `terraform/us-east-1/develop/modules/core/ecr.tf` |
| AWS-0089 — S3 Bucket Logging | LOW | 2 | `terraform/us-east-1/develop/modules/core/s3.tf`, `terraform/us-east-1/develop/modules/tf_remote/state.tf` |
| AWS-0017 — CloudWatch log groups should be encrypted using CMK | LOW | 1 | `terraform/us-east-1/941000539201-us-east-1/modules/cloudwatch/log_groups.tf` |

## sowinsights

`sowinsights origin/main b12880d31 2026-08-27` · pass-rate 94.2 % (292 / 310)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| KSV-0118 — Default security context configured | HIGH | 2 | `helm/sow-insights-poc/templates/deployment.yaml` |
| DS-0002 — Image user should not be 'root' | HIGH | 1 | `Dockerfile` |
| DS-0029 — 'apt-get' missing '--no-install-recommends' | HIGH | 1 | `Dockerfile` |
| KSV-0014 — Root file system is not read-only | HIGH | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0001 — Can elevate its own privileges | MEDIUM | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0012 — Runs as root user | MEDIUM | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0013 — Image tag ":latest" used | MEDIUM | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0104 — Seccomp policies disabled | MEDIUM | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0117 — Prevent binding to privileged ports | MEDIUM | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| DS-0026 — No HEALTHCHECK defined | LOW | 1 | `Dockerfile` |
| KSV-0003 — Default capabilities: some containers do not drop all | LOW | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0004 — Default capabilities: some containers do not drop any | LOW | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0020 — Runs with UID <= 10000 | LOW | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0021 — Runs with GID <= 10000 | LOW | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0030 — Runtime/Default Seccomp profile not set | LOW | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0106 — Container capabilities must only include NET_BIND_SERVICE | LOW | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |
| KSV-0110 — Workloads in the default namespace | LOW | 1 | `helm/sow-insights-poc/templates/deployment.yaml` |

## hops-mcp

`hops-mcp origin/main 352b091b7 2026-08-31` · pass-rate 100.0 % (27 / 27)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| — | — | 0 | the chart was never rendered — this zero is a skip, not a pass (see note) |

## hops-mcp-rendered

`hops-mcp origin/main 352b091b7 2026-08-31 (helm template --set environment=prod --set ingress.host=…)` · pass-rate 76.2 % (99 / 130)

| Check | Severity | Failing resources | Files |
|---|---|---|---|
| KSV-0118 — Default security context configured | HIGH | 4 | `hops-mcp.yaml` |
| KSV-0014 — Root file system is not read-only | HIGH | 2 | `hops-mcp.yaml` |
| KSV-0001 — Can elevate its own privileges | MEDIUM | 2 | `hops-mcp.yaml` |
| KSV-0012 — Runs as root user | MEDIUM | 2 | `hops-mcp.yaml` |
| KSV-0104 — Seccomp policies disabled | MEDIUM | 2 | `hops-mcp.yaml` |
| KSV-0013 — Image tag ":latest" used | MEDIUM | 1 | `hops-mcp.yaml` |
| KSV-0003 — Default capabilities: some containers do not drop all | LOW | 2 | `hops-mcp.yaml` |
| KSV-0004 — Default capabilities: some containers do not drop any | LOW | 2 | `hops-mcp.yaml` |
| KSV-0020 — Runs with UID <= 10000 | LOW | 2 | `hops-mcp.yaml` |
| KSV-0021 — Runs with GID <= 10000 | LOW | 2 | `hops-mcp.yaml` |
| KSV-0030 — Runtime/Default Seccomp profile not set | LOW | 2 | `hops-mcp.yaml` |
| KSV-0106 — Container capabilities must only include NET_BIND_SERVICE | LOW | 2 | `hops-mcp.yaml` |
| KSV-0110 — Workloads in the default namespace | LOW | 2 | `hops-mcp.yaml` |
| KSV-0011 — CPU not limited | LOW | 1 | `hops-mcp.yaml` |
| KSV-0015 — CPU requests not specified | LOW | 1 | `hops-mcp.yaml` |
| KSV-0016 — Memory requests not specified | LOW | 1 | `hops-mcp.yaml` |
| KSV-0018 — Memory not limited | LOW | 1 | `hops-mcp.yaml` |
