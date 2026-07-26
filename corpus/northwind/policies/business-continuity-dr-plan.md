---
Document ID: NWS-BCP-002
Version: "2.0"
Effective Date: 2026-02-01
Owner: Director of Infrastructure
Classification: CONFIDENTIAL
Review Cycle: Annual
---

# Business Continuity & Disaster Recovery Plan

## 1. Purpose, Scope, and Authority

### 1.1 Purpose

This Business Continuity & Disaster Recovery Plan (“Plan”) establishes the requirements by which Northwind Systems maintains or restores the workforce analytics platform and supporting business operations following a disruptive event. The Plan supports SOC 2 availability commitments, including CC7.2 and CC7.4, and defines recovery priorities, decision authority, communications, testing, and evidence-retention requirements.

### 1.2 Scope

This Plan applies to AWS production workloads, supporting corporate technology, customer support, security operations, and critical third parties. The primary production region is `us-east-1`; the designated disaster recovery (“DR”) region is `us-west-2`. Development systems are included only where their loss would impede production recovery.

### 1.3 Authority

The Chief Technology Officer (“CTO”) is the executive sponsor. The Director of Infrastructure is Plan Owner and Recovery Coordinator. The Chief Information Security Officer (“CISO”) retains authority over security containment and regulatory notification. Department heads shall maintain procedures consistent with this Plan and shall not adopt recovery objectives less stringent than those in Section 5 without written approval from the CTO.

## 2. Planning Assumptions and Governance

### 2.1 Planning Assumptions

Northwind Systems operates a multi-tenant B2B SaaS platform processing employee names, email addresses, and employment records. The platform does not intentionally process payment card or health data. Recovery planning assumes that a regional AWS outage, destructive configuration change, ransomware event, loss of a critical vendor, or extended facility or workforce disruption may occur without warning.

### 2.2 Plan Roles

The Recovery Coordinator directs restoration and maintains the timeline. The Incident Commander coordinates with the Incident Response Plan for security events. The Application Lead validates services and tenant isolation. The Data Lead validates database consistency and recovery points. The Security Lead approves emergency access and restored controls. The Communications Lead manages notices. The Legal Lead advises on obligations.

### 2.3 Plan Maintenance

The Plan Owner shall review this Plan annually and within 30 calendar days after a declared disaster, material architecture change, or failed recovery exercise. System owners shall confirm dependency records quarterly. Changes require approval by the CTO and CISO. Superseded versions and approvals shall be retained for seven years.

## 3. Business Impact and Recovery Priorities

### 3.1 Priority Categories

Recovery activities shall follow these priority categories:

1. **Priority 0 — Safety and command:** personnel safety, incident coordination, identity, emergency communications, and security containment.
2. **Priority 1 — Critical customer services:** authentication, tenant APIs, ingestion, analytics processing, reporting, primary databases, and customer-facing status communications.
3. **Priority 2 — Essential support services:** customer support, monitoring, deployment tooling, billing exports, and internal administrative functions required for Priority 1.
4. **Priority 3 — Deferrable services:** development sandboxes, historical test data, nonessential collaboration archives, and routine reporting.

Priority 2 or Priority 3 restoration shall not delay Priority 0 or Priority 1 work.

### 3.2 Business Impact Analysis

The Plan Owner shall conduct a business impact analysis annually. Each service owner shall document service dependencies, maximum tolerable downtime, data-loss tolerance, manual workarounds, minimum staffing, and customer or contractual consequences. Services rated Priority 1 shall have a named primary and alternate owner and shall participate in every DR exercise.

### 3.3 Minimum Service Level

During continuity operations, Northwind Systems may suspend nonessential exports, long-running analytics jobs, and administrative reporting. Minimum viable service consists of authentication, tenant-isolated data access, supported-record ingestion, core analytics, and existing reports. Recovery is incomplete until Section 7 checks pass.

## 4. Resilience Architecture and Backups

### 4.1 Regional Architecture

Production operates in `us-east-1` across multiple availability zones. DR capability in `us-west-2` uses infrastructure-as-code, replicated configuration, recoverable data stores, and pre-established network boundaries. Customer traffic shall not enter `us-west-2` before Section 6 authorization.

### 4.2 Configuration and Infrastructure

Infrastructure definitions, deployment manifests, and runbooks shall be version controlled. Priority 1 recovery changes require peer review and automated validation. Recovery credentials shall use approved secrets management and be tested quarterly. Emergency privileges shall follow AC-6 and the Access Control Policy, be time bounded, and be reviewed after use.

### 4.3 Backup Requirements

Production relational data shall receive continuous transaction logging and automated daily snapshots. Object data required for customer service shall use versioning or equivalent recovery protection. Configuration exports for critical supporting services shall be captured at least daily. Backups shall be encrypted with approved AWS KMS keys, logically separated from production write paths, and copied or replicated to `us-west-2`.

### 4.4 Retention and Verification

Daily backups shall be retained for 35 days, monthly recovery points for 13 months, and annual recovery points for seven years where contractual retention requires them. Automated backup jobs shall be monitored continuously; a missed Priority 1 backup shall generate an alert within 30 minutes. Infrastructure staff shall investigate such alerts within one hour. Restore samples shall be tested monthly, and results shall be retained for three years.

## 5. Recovery Objectives

### 5.1 Critical Systems

The recovery time objective (RTO) for critical systems is **4 hours** from declaration of a disaster. The recovery point objective (RPO) for critical systems is **15 minutes**, measured from the last verified recoverable transaction or replication checkpoint. Critical systems include customer authentication, tenant APIs, ingestion services, primary customer databases, analytics orchestration, and customer-facing reporting.

### 5.2 Supporting Systems

Essential supporting systems have an RTO of 12 hours and an RPO of 24 hours unless a stricter service-specific requirement is approved. Deferrable systems have an RTO of five business days and an RPO of 72 hours. A service owner may document a shorter target but shall not extend these objectives without business impact analysis and written CTO approval.

### 5.3 Measurement

RTO begins upon disaster declaration and ends when the restored service passes technical validation and is available to users. RPO is calculated from the latest validated recovery point to the data-loss event. Exercise reports shall record both values.

## 6. Activation and Recovery Procedures

### 6.1 Activation Criteria

The CTO, CISO, or Recovery Coordinator may activate this Plan when `us-east-1` is expected to remain unavailable beyond two hours, data integrity cannot be established, a destructive event affects multiple availability zones, or a critical dependency fails without an acceptable workaround. The decision shall consider provider status, security risk, recovery estimates, replication health, and customer impact.

### 6.2 Declaration and Mobilization

Upon declaration, the Recovery Coordinator shall open a controlled coordination channel, assign the roles in Section 2.2, record the declaration time, freeze nonessential production changes, and establish 30-minute operational briefings. The on-call infrastructure engineer shall acknowledge mobilization within 15 minutes. Failure to acknowledge shall escalate to the alternate engineer and Director of Infrastructure after five additional minutes.

### 6.3 Regional Failover

The recovery team shall verify the integrity and age of the selected recovery point, deploy or validate infrastructure in `us-west-2`, restore required data services, rotate or reissue credentials where compromise is suspected, and execute dependency health checks. DNS or traffic routing changes require approval by the Recovery Coordinator and Security Lead. Customer traffic shall be enabled in controlled stages, beginning with internal synthetic transactions and designated validation tenants.

### 6.4 Manual Workarounds

Customer Support may accept urgent requests through the approved support channel during an outage and shall record them for later reconciliation. Engineering may pause ingestion queues rather than discard events. Manual database edits are prohibited except under a documented emergency change approved by the Application Lead and Data Lead.

## 7. Validation and Return to Normal Operations

### 7.1 Technical Validation

Before declaring service restored, teams shall validate authentication, tenant isolation, representative API requests, ingestion, analytics calculations, report retrieval, audit logging, monitoring, encryption, and backup execution. The Security Lead shall confirm that security groups, roles, secrets, and logging align with the approved baseline, including CC6.1, CC7.2, AC-2, AC-6, and IA-2 controls.

### 7.2 Data Reconciliation

The Data Lead shall compare replication checkpoints, transaction counts, queued events, and selected tenant records. Any suspected cross-tenant exposure or material data inconsistency shall halt customer traffic and invoke the Incident Response Plan. Replayed transactions shall be idempotent or manually reconciled with a retained audit trail.

### 7.3 Failback

Failback to `us-east-1` is a separately approved change. The Recovery Coordinator shall require stable operation in `us-west-2`, verified replication, a documented rollback path, and a customer-impact assessment. The CTO shall authorize failback timing. Records of temporary infrastructure and emergency access shall be reviewed and closed within five business days.

## 8. Communications and Dependencies

### 8.1 Internal Communications

The Communications Lead shall issue an internal notice within 30 minutes of declaration and updates at least hourly while customer services are materially affected. Notices shall state impact, approved workarounds, next update time, and prohibited actions. Only designated spokespersons may communicate externally.

### 8.2 Customer and Regulatory Communications

Customer notices shall be factual, approved by Legal and the Incident Commander, and distributed through the status page and contractual channels. Initial service-impact notice shall be targeted within 60 minutes after material impact is confirmed. Security or privacy notifications shall follow applicable law, contract, and the Incident Response Plan; unverified causes shall not be presented as facts.

### 8.3 Critical Dependencies

The Plan Owner shall maintain a register covering AWS, domain and DNS services, identity services, source control, monitoring, customer support, communications, and the outsourced security operations center. Owners shall verify escalation contacts quarterly. Critical vendors shall be assessed annually and shall have documented substitutes or manual workarounds where commercially feasible.

## 9. Exercises, Evidence, and Exceptions

### 9.1 Exercise Cadence

Northwind Systems shall conduct a tabletop exercise semi-annually and a technical regional recovery exercise annually. The annual exercise shall restore representative production-like data in `us-west-2`, execute validation tests, and measure achieved RTO and RPO. At least once every two years, the exercise shall include customer communications and loss of a critical dependency.

### 9.2 Corrective Actions

The Plan Owner shall issue an exercise report within 10 business days. Findings shall identify owner, severity, corrective action, and due date. Critical gaps are due within 30 days; high gaps within 60 days; moderate gaps within 90 days. Overdue critical or high actions shall be reported monthly to the CTO and CISO.

### 9.3 Records

Declaration logs, decision records, exercise evidence, restore results, communications, and corrective-action records shall be retained for seven years. Access is limited to personnel with a business need and shall be reviewed quarterly.

### 9.4 Exceptions

Exceptions require a documented business justification, risk assessment, compensating controls, expiration date not exceeding 12 months, and written approval from the CTO and CISO. Exceptions affecting a Priority 1 service shall be reported to the executive team at the next quarterly risk review.
