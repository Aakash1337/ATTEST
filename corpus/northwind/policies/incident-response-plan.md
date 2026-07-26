> **Document ID:** NWS-IRP-004  
> **Version:** 4.0  
> **Effective Date:** 2026-02-01  
> **Owner:** Chief Information Security Officer  
> **Classification:** INTERNAL  
> **Review Cycle:** Annual, and following any Sev-1 incident

# Incident Response Plan

## 1. Purpose and Authority

### 1.1 Purpose

This Incident Response Plan (“Plan”) establishes requirements for identifying, analyzing, containing, eradicating, and recovering from information security incidents affecting the workforce analytics platform, corporate systems, customers, or service providers. It supports SOC 2 criteria CC7.2, CC7.3, CC7.4, and CC7.5.

### 1.2 Authority

The Chief Information Security Officer (“CISO”) owns this Plan and may declare incidents, isolate systems, suspend credentials, preserve records, and engage specialists. The Incident Commander has delegated authority to direct containment and recovery. Actions affecting customer availability for more than 30 minutes require notification to the Chief Technology Officer (“CTO”), but not prior approval where delay would increase harm.

### 1.3 Objectives

Northwind Systems shall protect human safety, limit unauthorized access or disclosure, preserve evidence, restore reliable service, meet legal duties, and capture corrective actions. Decisions shall favor trustworthy evidence and reduced customer impact over premature restoration.

## 2. Scope and Definitions

### 2.1 Scope

This Plan applies to personnel, AWS accounts, production services in `us-east-1`, disaster-recovery resources in `us-west-2`, endpoints, repositories, identity systems, logs, and third parties processing Northwind Systems information. It covers employee names, email addresses, employment records, authentication data, availability, and intellectual property.

### 2.2 Security Event

A security event is an occurrence potentially relevant to security, including an alert, failed control, unusual authentication, malware detection, data-loss signal, or external report. Events remain under routine monitoring until Clause 2.3 criteria are met.

### 2.3 Security Incident

A security incident is one or more events that have resulted in, or present a credible likelihood of, unauthorized access, use, disclosure, alteration, destruction, or material unavailability of information or systems. The Incident Commander shall classify uncertainty explicitly; lack of confirmed exfiltration does not prevent incident declaration.

### 2.4 Record of Authority

The incident-management case is the authoritative timeline. The recorder shall use Coordinated Universal Time, retain alert identifiers, distinguish facts from hypotheses, and export material chat or working notes within one business day.

## 3. Roles and Responsibilities

### 3.1 Incident Commander

The primary security on-call serves as initial Incident Commander until relieved by the CISO or a designated senior engineer. The Incident Commander confirms severity, approves containment, conducts briefings, and documents decisions. For Sev-1 events, the CISO shall assume or delegate command.

### 3.2 Security Team

The two-person Security Team validates alerts, coordinates forensics, maintains chain of custody, advises on containment, and manages the outsourced Security Operations Center (“SOC”). One member leads while the other records. Evidence for CC7.2 and CC7.4 shall be retained in the case.

### 3.3 Engineering and Operations

Engineering provides system knowledge, code changes, and recovery execution. Production on-call shall be continuously reachable. Only authorized responders may alter affected resources. Emergency changes must identify the case and receive retrospective change review within two business days.

### 3.4 Legal, Privacy, and Communications

Legal determines notification duties with the CISO and Privacy Lead. The Privacy Lead assesses affected persons and jurisdictions. The Chief Executive Officer or Communications Lead approves external statements. Responders shall not contact customers, regulators, media, or suspected threat actors unless authorized under Clause 7.

### 3.5 All Personnel

Personnel shall report suspected incidents through the security hotline, incident channel, or service desk. They shall preserve relevant files, follow responder instructions, and avoid independent investigation that could modify evidence.

## 4. Severity Classification and Response Targets

### 4.1 Classification Method

The Incident Commander shall assign the highest tier justified by actual or reasonably anticipated impact. Classification considers data sensitivity, number of tenants or records affected, privilege obtained, geographic reach, operational disruption, persistence, public exposure, and confidence in containment. Severity shall be reassessed after material discoveries and at each formal briefing.

### 4.2 Severity Tiers and Recovery Objectives

| Tier | Definition and illustrative criteria | Initial acknowledgment | Executive escalation | RTO |
|---|---|---:|---:|---:|
| Sev-1 Critical | Confirmed cross-tenant access; material compromise of production administrative control; widespread customer outage; confirmed large-scale disclosure of employment records; or active destructive behavior | 15 minutes | 30 minutes | **8 hours** |
| Sev-2 High | Confirmed compromise limited to one tenant; material degradation without widespread outage; privileged corporate account compromise with no demonstrated production access; or credible exfiltration requiring urgent investigation | 30 minutes | 1 hour | 12 hours |
| Sev-3 Moderate | Contained endpoint compromise; low-volume unauthorized access; control failure with limited exposure; or suspicious activity requiring coordinated investigation | 4 hours | 1 business day | 2 business days |
| Sev-4 Low | Policy violation, unsuccessful attack, or isolated event with negligible impact and no evidence of persistence | 1 business day | As requested | 5 business days |

### 4.3 Classification Review

The Incident Commander shall record the selected tier, supporting facts, time assigned, and any later change. A downgrade requires CISO approval for Sev-1 or Sev-2 cases. A suspected cross-tenant condition remains Sev-1 until testing demonstrates tenant isolation.

## 5. Detection, On-Call, and SOC Handoff

### 5.1 Monitoring Sources

Northwind Systems receives alerts from AWS security services, centralized application and audit logs, identity-provider telemetry, endpoint detection, vulnerability tooling, customer reports, and supplier notifications. Production security logs shall be retained for 400 days, with at least 90 days immediately searchable. Alert rules for privileged access, cross-tenant authorization failures, and bulk export anomalies shall be reviewed quarterly.

### 5.2 On-Call Coverage

The outsourced SOC provides continuous monitoring and first-level triage. Northwind Systems maintains a weekly rotating primary and secondary security on-call schedule. The primary must acknowledge pages within the applicable table target; the secondary is paged automatically after 10 minutes without acknowledgment. If neither responds within 10 additional minutes, the SOC shall call the CISO and production engineering on-call.

### 5.3 Outsourced SOC Handoff

The SOC shall open a case, preserve raw alert payloads, record detection time, identify affected accounts and resources, and contact the Northwind Systems primary on-call using the approved paging service. The handoff must include the alert source, observed indicators, affected asset identifiers, preliminary timeline, actions already taken, and recommended severity. The SOC may block a known-malicious source address or isolate a corporate endpoint under standing procedures but may not delete cloud resources, rotate production keys, contact customers, or close a Northwind Systems incident.

### 5.4 Acceptance and Escalation

The Northwind Systems responder shall explicitly accept ownership in the case record. Until acceptance, the SOC shall continue monitoring and preserve evidence. For Sev-1 and Sev-2 events, the Incident Commander shall establish an incident channel and bridge, notify the CISO, CTO, Legal, and Privacy Lead, and provide situation reports every 60 minutes and two hours, respectively. Escalation failure shall be reported as a control exception.

## 6. Response Process

### 6.1 Identification and Analysis

Responders shall validate scope, affected tenants, data types, identities, indicators, and initial access. Queries and scripts used for analysis shall be retained when practicable. The recorder shall maintain a decision log and an evidence inventory containing collector, time, source, cryptographic hash where applicable, and storage location.

### 6.2 Containment

Containment may include disabling accounts, revoking sessions, isolating workloads, restricting security groups, blocking indicators, suspending exports, or placing a tenant feature in maintenance mode. Responders shall assess whether a proposed action would destroy volatile evidence or alert an adversary. Administrative access changes must comply with AC-2, AC-6, and IA-2 requirements.

### 6.3 Eradication

Eradication shall remove malicious artifacts and persistence, correct exploited configurations or code, rotate exposed secrets, and scan related assets. The responsible engineering owner shall document the technical cause and demonstrate that corrective changes passed review and testing.

### 6.4 Recovery

Recovery shall use known-good artifacts and validated configurations. System owners shall confirm logging, authentication, tenant boundaries, integrity, and alert coverage before normal operations resume. Enhanced monitoring shall continue for at least seven days for Sev-1 and Sev-2 events and two days for Sev-3 events.

### 6.5 Closure

The CISO closes Sev-1 and Sev-2 cases; the Incident Commander may close lower tiers. Closure requires documented scope, evidence disposition, containment and recovery verification, notification decision, customer-impact assessment, and assigned corrective actions.

## 7. Notification and Communications

### 7.1 Breach Assessment

Legal counsel and the Privacy Lead shall begin a documented breach assessment promptly after credible evidence that personal data may have been accessed or disclosed without authorization. The assessment shall identify data categories, affected individuals and tenants, jurisdictions, safeguards, likelihood of harm, contractual terms, and law-enforcement considerations.

### 7.2 Regulatory and Individual Notification

Where a reportable personal-data breach is determined, Northwind Systems shall notify the applicable supervisory authority within 72 hours after becoming aware, unless Legal documents that notification is not required. If complete facts are unavailable, an initial notice may be supplemented. Customer or individual notices shall be accurate, approved by Legal, and retained with evidence of delivery.

### 7.3 Customer and Public Communications

Contractual notice periods shall be tracked independently of regulatory deadlines. Status-page messages shall state verified service facts and avoid speculative cause or attribution. Only the Communications Lead or a named delegate may publish external incident statements.

## 8. Post-Incident Activities

### 8.1 Post-Mortem Requirement

A blameless post-mortem is mandatory for Sev-1 and Sev-2 incidents and for any lower-tier incident designated by the CISO. The Incident Commander shall schedule it within five business days after closure and issue the written report within 10 business days. The report shall include timeline, impact, detection path, root and contributing causes, control performance, response effectiveness, and corrective actions.

### 8.2 Corrective Actions

Each corrective action shall have an accountable owner, priority, due date, and verification method. Critical actions are due within 30 calendar days unless the CISO approves a written risk exception; high actions are due within 60 days. Security shall review open actions monthly and report overdue items to the executive team.

### 8.3 Exercises and Plan Maintenance

Northwind Systems shall conduct one tabletop exercise every six months, including at least one annual scenario involving cross-tenant data exposure. Contact lists and paging paths shall be tested quarterly. The CISO shall review this Plan annually and after every Sev-1 incident, material architecture change, or exercise identifying a substantive procedural gap.

## 9. Evidence Retention and Exceptions

### 9.1 Retention

Incident case records, post-mortems, notification decisions, and evidence inventories shall be retained for seven years. Forensic images and bulk log exports shall be retained for two years unless Legal Hold requires longer retention. Access is restricted to Security, Legal, and specifically assigned responders and shall be reviewed quarterly.

### 9.2 Exceptions

Exceptions require written CISO and Legal approval, a defined scope, compensating controls, and an expiration date not exceeding 180 days. Emergency deviations during active response shall be recorded immediately and submitted for retrospective approval within two business days.
