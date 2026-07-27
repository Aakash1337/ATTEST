---
Document ID: NWS-RSK-MEM-2026-Q1
Version: 1.0
Effective Date: 2026-04-08
Owner: Chief Information Security Officer
Classification: RESTRICTED
Review Cycle: Quarterly
---

# Internal Risk Memo

## 1. Purpose and Distribution

### 1.1 Memorandum Purpose

This memorandum provides the Executive Team with the Chief Information Security Officer's assessment of Northwind Systems' material information-security risks as of March 31, 2026. It records current exposure, management decisions, accountable owners, target dates, and accepted-risk positions. The memorandum is intended to support resource allocation and governance decisions; it is not a representation that all listed controls are fully implemented or uniformly effective.

### 1.2 Audience and Handling

Distribution is limited to the Chief Executive Officer, Chief Financial Officer, Chief Technology Officer, Chief Operating Officer, General Counsel, Vice President of Engineering, and members of the two-person Security Team with a documented need to know. Recipients shall handle this memorandum as RESTRICTED under the Data Classification & Handling Policy. It shall not be forwarded to customers, suppliers, auditors, or prospective investors without written approval from the CISO and General Counsel.

### 1.3 Assessment Basis

The assessment incorporates Q1 access-review results, outsourced security operations center notifications, penetration-testing observations, engineering risk-register entries, business-continuity exercises, and interviews with control owners. Ratings are management judgments rather than quantitative loss forecasts. Control references, including CC6.1, CC7.2, AC-2, AC-6, and IA-2, identify relevant assurance domains but do not imply certification against every cited framework.

## 2. Executive Risk Position

### 2.1 Overall Rating

Northwind Systems' aggregate information-security risk remains **HIGH**. Core production services in AWS are comparatively mature, but identity fragmentation, unresolved technical findings, limited internal monitoring, and deferred governance investment create material residual exposure. The company has maintained SOC 2 Type II coverage for 18 months; that achievement should not be read as evidence that acquired environments have been fully integrated or that every security capability is operating at the same maturity.

### 2.2 Risk Rating Method

Individual risks are rated CRITICAL, HIGH, MODERATE, or LOW based on likelihood and business impact. A CRITICAL risk could plausibly result in broad tenant exposure, extended production disruption, or a reportable breach. A HIGH risk could cause significant unauthorized access, material control failure, or contractual harm. MODERATE risks require scheduled treatment but do not presently warrant emergency action. Risk acceptance does not eliminate accountability; accepted items remain subject to quarterly review.

### 2.3 Immediate Executive Attention

The most consequential management issue is that the two acquisitions completed during the last three years were never fully integrated. Both acquired business units still operate separate identity providers from the Northwind Systems corporate identity provider. This condition impairs centralized access governance and introduces inconsistent authentication, termination, and privileged-access evidence. The condition also increases the burden on a 12-person Engineering organization and a two-person Security Team, neither of which has spare capacity to sustain three identity-control planes indefinitely.

## 3. Material Risk Register

### 3.1 R-01 — Fragmented Identity Providers

**Rating:** HIGH. **Executive owner:** Chief Technology Officer. **Control owner:** Director of IT. **Target date:** September 30, 2026.

The acquired units' separate identity providers do not share a common lifecycle workflow, role catalogue, or authoritative access inventory. Joiner, mover, and leaver events are therefore processed through separate procedures, and evidence for AC-2 and CC6.1 must be assembled manually. Privileged assignments under AC-6 are not visible in one consolidated report. Authentication settings mapped to IA-2 are reviewed independently, increasing the chance of configuration drift.

The CTO shall deliver an integration plan by May 31, 2026, including application dependencies, migration waves, rollback criteria, and a budget estimate. The Director of IT shall reconcile privileged accounts across all three providers monthly until consolidation is complete. Any termination not disabled within the Access Control Policy service level shall be escalated to the CISO within one business day.

Management accepts the residual risk through September 30, 2026, subject to monthly reconciliation and immediate suspension of orphaned accounts. Acceptance was approved by the CEO and CTO on April 4, 2026. Extension requires a new written decision by the Executive Team.

### 3.2 R-02 — Unremediated Penetration-Test Findings

**Rating:** CRITICAL. **Executive owner:** Vice President of Engineering. **Control owners:** Application Engineering Manager and Cloud Platform Lead. **Target date:** June 15, 2026.

The Q1 2026 penetration test identified unresolved weaknesses capable of affecting tenant authorization boundaries and stored cloud data. Detailed reproduction material is maintained separately under RESTRICTED handling. The findings create direct confidentiality risk for employee names, email addresses, and employment records processed by the workforce analytics platform. They also weaken the evidentiary basis for CC7.2 monitoring and CC6.1 logical-access assertions.

Engineering shall prioritize corrective releases ahead of discretionary feature work. The Application Engineering Manager shall provide weekly status updates, and the Cloud Platform Lead shall complete policy review of legacy storage resources by May 15, 2026. Security shall independently validate closure. No CRITICAL item may be marked remediated solely on the basis of a code merge or configuration ticket; retesting evidence is required.

No continuing acceptance is granted for CRITICAL findings. Temporary compensating controls may be approved by the CISO for no more than 30 days and must identify scope, monitoring, and expiration.

### 3.3 R-03 — Absence of Formal Insider-Threat Monitoring

**Rating:** HIGH. **Executive owner:** Chief Operating Officer. **Control owner:** CISO. **Target date:** December 31, 2026.

Northwind Systems does not have a formal insider-threat monitoring programme. Existing audit logs, access reviews, endpoint controls, and outsourced SOC alerts are designed primarily for account compromise and external attack patterns. They are not governed as a coordinated programme for detecting malicious or negligent activity by trusted personnel. There is no documented insider-threat charter, defined case-management workflow, cross-functional review group, or approved behavioral monitoring standard.

This gap is material because administrators and engineers can access sensitive systems while the company processes employment records for multiple tenants. It may also delay recognition of bulk exports, inappropriate privilege use, or anomalous administrative behavior. Any future monitoring must be proportionate and reviewed by Legal and People Operations to address employment, privacy, and regional notice obligations.

The COO shall sponsor a design proposal by August 31, 2026. The CISO shall define minimum telemetry and escalation requirements; General Counsel shall review privacy constraints; and People Operations shall define investigation and disciplinary interfaces. Management accepts the present residual risk through December 31, 2026 because current staffing and fiscal-year funding do not support full implementation sooner. The CEO approved this time-bounded acceptance on April 4, 2026.

### 3.4 R-04 — Outsourced SOC Coverage and Handoff

**Rating:** MODERATE. **Executive owner:** CISO. **Control owner:** Security Operations Manager. **Target date:** July 31, 2026.

The outsourced SOC provides continuous alert intake, but incident ownership transfers to Northwind Systems for investigation and containment. Q1 sampling found inconsistent ticket enrichment and two cases where application context was requested after escalation rather than maintained in the runbook. This creates delay risk under CC7.2, particularly during after-hours events.

The Security Operations Manager shall update the handoff matrix by May 31, 2026, test paging monthly, and conduct one joint scenario exercise by July 31, 2026. Severity, tenant impact, evidence-preservation, and notification fields shall be mandatory. Residual risk is accepted through the target date, with weekly review of all high-severity SOC tickets.

## 4. Governance and Certification Position

### 4.1 ISO 27001 Decision

ISO 27001 certification has been deferred for budget reasons. The FY2026 operating plan does not fund readiness consulting, certification audit fees, or the incremental governance capacity required to establish and maintain the certification scope. Northwind Systems has no ISO 27001 certification and shall not state or imply otherwise in customer responses, proposals, or sales materials.

The decision does not suspend existing SOC 2 commitments or contractual security obligations. The Security Team will continue mapping material controls where operationally useful, but such mapping is not an implementation statement. The CFO and CISO will reconsider funding during FY2027 planning by October 15, 2026. Until then, Sales shall route certification questions to Security and Legal and shall describe only the company's current SOC 2 Type II status.

### 4.2 Resource Constraints

The two-person Security Team is operating at capacity across assurance, incident response, vendor risk, vulnerability management, and customer diligence. The 12 engineers must balance remediation with availability and product delivery. Current constraints are a cause of slower treatment, not a basis for downgrading risk. The Executive Team shall make explicit priority decisions when remediation dates conflict with committed product work.

### 4.3 Assurance Boundaries

Control owners shall distinguish between corporate controls, production-platform controls, and controls operated independently by acquired units. Quarterly reporting shall identify exceptions rather than averaging them into an enterprise-wide assertion. Evidence presented for CC6.1, AC-2, AC-6, IA-2, or CC7.2 must state the systems and identity provider covered.

## 5. Required Actions and Oversight

### 5.1 Thirty- and Sixty-Day Actions

By May 15, 2026, the Cloud Platform Lead shall complete the legacy storage policy review. By May 31, 2026, the CTO shall submit the identity integration plan and Security Operations shall revise the outsourced SOC handoff matrix. By June 15, 2026, owners shall complete and retest CRITICAL penetration-test remediation. Missed dates shall be escalated to the CEO within two business days with a revised plan and documented impact.

### 5.2 Quarterly Reporting

The CISO shall report status at each quarterly Executive Team risk review. Reporting shall include current rating, overdue actions, compensating controls, accepted-risk expiration dates, and changes in exposure. Risk owners shall certify their entries no later than five business days before the meeting. Security shall retain approvals and supporting evidence for seven years.

### 5.3 Acceptance Governance

Only the CEO, with written concurrence from the CISO and accountable executive owner, may accept a HIGH residual risk for more than 90 days. CRITICAL risk acceptance is prohibited except for a temporary compensating-control period not exceeding 30 days. Accepted risk shall identify a specific expiration date; statements that a risk is accepted “until resources permit” are invalid.

## 6. Conclusion

### 6.1 CISO Assessment

Northwind Systems can reduce its immediate exposure if executive owners protect the stated remediation dates and treat identity consolidation as operational risk reduction rather than optional infrastructure work. The most important facts are straightforward: acquired environments remain divided across separate identity providers, critical technical weaknesses require prompt closure, insider-threat monitoring is not a formal programme, and ISO 27001 has been deferred because the approved budget does not support it. These conditions are manageable only with visible ownership and time-bounded acceptance.

### 6.2 Next Review

The next formal review is scheduled for July 15, 2026. The CISO may issue an interim revision if a CRITICAL finding remains open after its due date, a material incident occurs, an acquisition identity migration fails, or an accepted-risk condition is breached.
