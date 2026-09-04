# AWS Cloud Infrastructure Security: Comprehensive Sources List

This document provides a consolidated, categorized directory of all **41 reference sources** curated in the **AWS Cloud Infrastructure Security Best Practice** notebook. These sources span official AWS architectural guidance, security baselines, and major cloud security vendor intelligence (Sysdig, Palo Alto Networks, Wiz, Snyk, Datadog, Spacelift, and Stream Security).

---

## Document Summary
* **Notebook Title:** AWS cloud infra security best practice
* **Total Curated Sources:** 41
* **Source Formats:** 40 External Web URLs, 1 In-Notebook Markdown Synthesis
* **Core Topics Covered:** Identity and Access Management (IAM), Network Hardening, AI Workload Protection, S3 Data Security, Container & Kubernetes Protection, and Security Reference Architectures (SRA).

---

## Table of Contents
1. [Official AWS Guidance & Architectural Frameworks](#1-official-aws-guidance--architectural-frameworks)
2. [Palo Alto Networks / Prisma Cloud Intelligence](#2-palo-alto-networks--prisma-cloud-intelligence)
3. [Wiz Cloud Security Research](#3-wiz-cloud-security-research)
4. [Sysdig Container & Infrastructure Security Guidance](#4-sysdig-container--infrastructure-security-guidance)
5. [Snyk Developer Security & IaC Best Practices](#5-snyk-developer-security--iac-best-practices)
6. [Other Specialized Vendor Recommendations (Datadog, Spacelift, Stream Security)](#6-other-specialized-vendor-recommendations-datadog-spacelift-stream-security)
7. [In-Notebook Synthesis Documents](#7-in-notebook-synthesis-documents)

---

## 1. Official AWS Guidance & Architectural Frameworks
Official AWS documentation, frameworks, blog updates, and prescriptive architectural design patterns.

1. **AWS Identity and Access Management (IAM)**
   * *Type:* Web URL
   * *Description:* Standard AWS reference documentation for managing identities, permissions, and roles securely.
2. **AWS Identity and Access Management (IAM) Best Practices - Amazon Web Services**
   * *Type:* Web URL
   * *Description:* Essential AWS checklist for securing IAM, including root account protection, MFA enforcement, and least-privilege credentials.
3. **AWS SRA best practices checklist - AWS Prescriptive Guidance - AWS Documentation**
   * *Type:* Web URL
   * *Description:* Implementation-ready security checklist mapped against the AWS Security Reference Architecture.
4. **AWS Security Blog**
   * *Type:* Web URL
   * *Description:* Official channel for timely announcements, threat analysis, and deep-dive technical security advice from AWS experts.
5. **AWS Security Reference Architecture (AWS SRA) – core architecture - AWS Prescriptive Guidance - AWS Documentation**
   * *Type:* Web URL
   * *Description:* Core architectural diagrams, multi-account layouts, and standard deployment practices for the AWS SRA.
6. **AWS Security Reference Architecture | AWS Prescriptive Guidance**
   * *Type:* Web URL
   * *Description:* AWS strategic blueprint for deploying and orchestrating the full suite of native AWS security services.
7. **AWS Security Reference Architecture: A guide to designing with AWS security services**
   * *Type:* Web URL
   * *Description:* Design patterns and practical architecture methodologies using security services to build a resilient cloud footprint.
8. **AWS Startup Security Baseline - AWS Prescriptive Guidance**
   * *Type:* Web URL
   * *Description:* Minimum viable security controls recommended for early-stage organizations to establish safe default structures.
9. **Building secure foundations: A guide to network and infrastructure security at AWS re:Inforce 2025**
   * *Type:* Web URL
   * *Description:* Key insights, announcements, and architectural takeaways from the AWS re:Inforce 2025 event.
10. **Guidance for Baseline Security Assessment on AWS - AWS Documentation**
    * *Type:* Web URL
    * *Description:* Methodological framework for performing baseline posture audits on existing AWS accounts.
11. **How to enforce a security baseline for an AWS WAF ACL across your organization using AWS Firewall Manager**
    * *Type:* Web URL
    * *Description:* Enterprise guide to utilizing AWS Firewall Manager to programmatically push and maintain WAF rules globally.
12. **ICYMI: July 2026 @AWS Security**
    * *Type:* Web URL
    * *Description:* Consolidated monthly digest highlighting newly released AWS security features and advisories.
13. **ICYMI: June 2026 @AWS Security**
    * *Type:* Web URL
    * *Description:* June 2026 monthly digest outlining core AWS security tools and platform enhancements.
14. **Security Baseline - AWS Marketplace - Amazon.com**
    * *Type:* Web URL
    * *Description:* Guidance on leveraging integrated partner-provided and native security baselines via the AWS Marketplace ecosystem.
15. **Security foundations - Security Pillar - AWS Documentation**
    * *Type:* Web URL
    * *Description:* Underlying design concepts of the AWS Well-Architected Security Pillar, defining the root security philosophy.
16. **Security posture improvement in the AI era - AWS**
    * *Type:* Web URL
    * *Description:* AWS recommendations for modernizing security telemetry and defensive automated tools to address AI-driven threat vectors.
17. **The AWS AI Security Framework: Securing AI with the right controls, at the right layers, at the right phases**
    * *Type:* Web URL
    * *Description:* Structured security guidance designed for securing generative AI models, training pipelines, and deployment layers on AWS.
18. **The AWS Security Reference Architecture - AWS Prescriptive Guidance**
    * *Type:* Web URL
    * *Description:* The high-level master overview of the Security Reference Architecture framework.

---

## 2. Palo Alto Networks / Prisma Cloud Intelligence
Comprehensive industry threat intelligence, cloud risk surveys, and security checklists published by Palo Alto Networks.

19. **12 Best Practices to Enhance the Security of Your AWS Configurations - Palo Alto Networks**
    * *Type:* Web URL
    * *Description:* Configuration hardening recommendations targeting common cloud misconfigurations and security control drift.
20. **Best Practices for Securing Cloud Identities - Palo Alto Networks**
    * *Type:* Web URL
    * *Description:* Deep dive into Cloud Infrastructure Entitlement Management (CIEM) and controlling identity-based lateral movement vectors.
21. **Cloud Security Spotlight— Protecting AWS Environments with Prisma Cloud**
    * *Type:* Web URL
    * *Description:* High-level overview of utilizing Prisma Cloud for agentless vulnerability scanning, compliance mapping, and runtime protection on AWS.
22. **Discover, Protect and Respond with AWS and Prisma Cloud - Palo Alto Networks**
    * *Type:* Web URL
    * *Description:* A collaborative playbook detailing unified triaging and detection capabilities utilizing Prisma Cloud alongside native AWS APIs.
23. **E-Book: Top 10 AWS Cloud Security Risks - Palo Alto Networks**
    * *Type:* Web URL
    * *Description:* A synthesized risk guide addressing critical vulnerabilities, IAM over-privileging, and exposed keys in the AWS ecosystem.

---

## 3. Wiz Cloud Security Research
Strategic security playbooks, configuration guides, and risk intelligence vectors from Wiz.

24. **9 AWS Cloud Security Best Practices to Protect Your Data - Wiz**
    * *Type:* Web URL
    * *Description:* Dedicated checklist for securing sensitive data, structured around encryption, continuous posture audits, and S3 hardening.
25. **AWS AI Security: Securing AI workloads on AWS - Wiz**
    * *Type:* Web URL
    * *Description:* Industry recommendations for protecting Sagemaker instances, foundational models, and vector databases from unauthorized data access.
26. **AWS S3 Security Best Practices for Cloud Workloads - Wiz**
    * *Type:* Web URL
    * *Description:* Specific implementation guides targeting Amazon S3 buckets, access control lists (ACLs), bucket policies, and bucket exposure vectors.
27. **Cloud Security: The Ultimate 2026 Guide to the Modern Cloud - Wiz**
    * *Type:* Web URL
    * *Description:* Wiz’s master 2026 cloud guide exploring agentless protection, graph-based risk models, and CNAPP platform trends.
28. **Mastering AWS Security Groups: Essential Best Practices - Wiz**
    * *Type:* Web URL
    * *Description:* Deep dive into host-level stateful firewall configuration, emphasizing anti-pattern remediation (e.g., open `0.0.0.0/0` ingress rules).

---

## 4. Sysdig Container & Infrastructure Security Guidance
Deep technical guides on containerized environments, Kubernetes clusters (EKS), runtime security (Falco), and host defense from Sysdig.

29. **13 cloud security best practices for 2026 - Sysdig**
    * *Type:* Web URL
    * *Description:* A comprehensive list detailing modern defense-in-depth, real-time threat detection, and active posture management for 2026.
30. **17 comprehensive container security best practices for 2026 - Sysdig**
    * *Type:* Web URL
    * *Description:* Highly detailed container hardening strategies focusing on minimal base images, non-root runtimes, and vulnerability scanning.
31. **26 AWS security best practices to adopt in production - Sysdig**
    * *Type:* Web URL
    * *Description:* Production checklist for AWS covering AWS organizations, networking, centralized logging, and Kubernetes runtime security.
32. **AWS Cloud Security Best Practices - Sysdig**
    * *Type:* Web URL
    * *Description:* General guidance emphasizing unified visibility, logging audit trails, and quick security monitoring loops in AWS.

---

## 5. Snyk Developer Security & IaC Best Practices
Developer-centric security, secure Infrastructure as Code templates, and software supply chain protection from Snyk.

33. **AWS Marketplace: Snyk**
    * *Type:* Web URL
    * *Description:* Solution overview detailing how to leverage Snyk’s platform directly inside the AWS billing and integration environments.
34. **AWS security: Complete guide to Amazon cloud security - Snyk**
    * *Type:* Web URL
    * *Description:* Comprehensive handbook targeting developers, discussing secure coding in AWS, pipeline scanning, and shifting-left.
35. **Snyk Infrastructure as Code - IaC Security Tools**
    * *Type:* Web URL
    * *Description:* Tools and strategies for scanning Terraform, CloudFormation, and Helm templates to catch misconfigurations prior to deployment.
36. **Working With AWS Security Tools - Snyk**
    * *Type:* Web URL
    * *Description:* A practical manual on integrating Snyk developer security scanning with native AWS services (e.g., AWS CodePipeline, AWS ECR).

---

## 6. Other Specialized Vendor Recommendations (Datadog, Spacelift, Stream Security)
Configuration telemetry, automated provisioning security, and real-time posture analysis from various ecosystem vendors.

37. **14 AWS IAM Security Best Practices - Spacelift**
    * *Type:* Web URL
    * *Description:* Actionable programmatic IAM hardening, focusing on managing roles via IaC pipelines and lifecycle key policies.
38. **AWS well architected framework - Stream Security**
    * *Type:* Web URL
    * *Description:* Guide discussing real-time topology mapping and continuous compliance drift detection aligned with the AWS Well-Architected Framework.
39. **Best practices for tagging your infrastructure and applications - Datadog**
    * *Type:* Web URL
    * *Description:* Best practices for establishing comprehensive metadata/tagging taxonomies to aid in cloud tracking, cost allocation, and security incident response.
40. **Datadog configuration best practices - Critical Cloud**
    * *Type:* Web URL
    * *Description:* Guidelines on establishing robust monitoring, logging levels, and real-time alert filters to ensure cloud workload visibility.

---

## 7. In-Notebook Synthesis Documents
Synthesized master architectural guidance maintained directly in the notebook workspace.

41. **Architectural Strategy for AWS Infrastructure Security: A Synthesis of Official Guidance and Industry Intelligence**
    * *Type:* Markdown Document
    * *Description:* Comprehensive strategic roadmap integrating official AWS baseline best practices with modern vendor insights on defense-in-depth, microsegmentation, and zero-trust alignment.

---
*End of Document. All metadata compiled on September 3, 2026.*
