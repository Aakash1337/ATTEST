---
Document ID: NWS-POL-AC-003
Version: "3.0"
Effective Date: 2026-01-15
Owner: Chief Information Security Officer
Classification: INTERNAL
Review Cycle: Annual
---

# Access Control Policy

## 1. Purpose and Authority

### 1.1 Purpose

This policy establishes the requirements by which Northwind Systems grants, changes, reviews, and revokes logical access to company systems and customer-data environments. It supports the principles of least privilege, need to know, and separation of duties and provides the governing requirements for SOC 2 controls CC6.1, CC6.2, and CC6.3 and the intent of AC-2, AC-3, AC-5, AC-6, and IA-2.

### 1.2 Authority

The Chief Information Security Officer (CISO) owns this policy. System Owners are accountable for implementation within their systems. The Security Team may suspend access when misuse, compromise, policy deviation, or an unresolved ownership condition creates unacceptable risk. Business managers may approve access only within their area of responsibility and may not approve their own access.

## 2. Scope and Definitions

### 2.1 Scope

This policy applies to employees, contractors, interns, service providers, and machine identities accessing Northwind Systems information assets. Covered assets include AWS accounts in us-east-1 and us-west-2, production and non-production services, source repositories, CI/CD platforms, customer-support tooling, corporate SaaS applications, identity providers, databases, and administrative interfaces.

### 2.2 Definitions

An **Administrative Account** is any human or machine identity capable of changing security settings, managing identities, deploying production code, accessing tenant-wide data, altering audit records, or administering cloud resources. A **System Owner** is the role recorded in the asset inventory as accountable for access decisions. A **Privileged Role** is an RBAC role containing one or more administrative permissions. A **Workforce Account** is an individually assigned identity used by an employee or contractor.

## 3. Access Governance

### 3.1 Access Principles

Access shall be denied by default and granted only for an approved business purpose. Permissions shall be limited to the minimum data, functions, environment, and duration required. Shared human accounts are prohibited except for documented emergency accounts under Clause 4.4. Production access shall be separated from development access, and access to customer employment records shall be limited to personnel whose assigned duties require it.

### 3.2 Role-Based Access Control

System Owners shall maintain role-based access control (RBAC) definitions for material systems. Roles shall map to job functions rather than named individuals and shall document permitted actions, data scope, approval authority, and incompatible roles. Security shall review new privileged roles before release. Role changes affecting production administration or tenant-wide data shall be tested in a non-production environment and recorded in the change-management system.

### 3.3 Separation of Duties

No individual may both request and finally approve the same access assignment. Production deployment approval, security-log administration, key administration, and billing administration shall be separated where staffing permits. Where the 12-person Engineering organization cannot fully separate duties, the System Owner shall document a compensating control, such as peer approval, immutable logging, or retrospective review within two business days.

## 4. Identity and Privileged Access

### 4.1 Unique Accounts and Authentication

Each workforce user shall receive a unique account linked to a current personnel record. Passwords, secrets, tokens, and authentication devices shall not be shared. Authentication configurations shall follow the approved identity-provider baseline, including minimum password length of 14 characters where passwords are accepted, blocking of known-compromised passwords, and rate limiting after repeated failed attempts. Authentication events shall be logged for at least 365 days.

### 4.2 Multi-Factor Authentication

Multi-factor authentication (MFA) is required for **ALL ADMINISTRATIVE accounts**. This requirement applies to cloud consoles, production orchestration, identity-provider administration, security tooling, source-control administration, customer-support administration, and any other account meeting the definition in Clause 2.2. Phishing-resistant methods shall be used where supported; SMS shall not be the sole additional factor for privileged access. The CISO shall review the administrative MFA requirement and its implementation annually, with evidence retained in the compliance repository for three years.

### 4.3 Privileged Access Management

Privileged access shall be issued through named administrative identities or time-bound role assumption. Standing privileges shall be avoided where the platform supports just-in-time elevation. Elevation to production shall require an approved ticket, identified system, business purpose, requested duration, and manager or System Owner approval. Sessions shall be attributable to one individual, logged centrally, and reviewed by Security when alerts indicate anomalous geography, unusual time of use, or bulk data access.

Administrative permissions shall expire after eight hours unless a shorter platform maximum applies. Persistent exceptions require CISO approval, documented justification, a named owner, and an expiration date no later than 90 days from approval. Security shall review active exceptions monthly.

### 4.4 Emergency Access

Emergency or “break-glass” accounts shall be stored in an access-controlled secrets vault, monitored continuously, and tested quarterly. Use is limited to incidents where normal privileged access is unavailable or would materially delay containment or recovery. Any use shall generate an immediate Security alert and a review within one business day. Credentials shall be rotated after each use and at least every 90 days when unused.

## 5. Account Lifecycle

### 5.1 Provisioning

Access requests shall originate from the approved ticketing or identity-governance workflow and identify the requester, beneficiary, manager, system, role, business justification, and requested start and end dates. The beneficiary’s manager and the System Owner shall approve access to production, security systems, or customer employment records. Security approval is additionally required for privileged roles and cross-tenant data access.

Provisioning shall use automated group or role assignment where available. Administrators shall validate successful assignment against the approved request and retain workflow records for three years. Accounts may not be created from informal chat, email, or verbal requests except during a declared incident; emergency provisioning shall be retrospectively approved within one business day.

### 5.2 Transfers and Role Changes

Managers shall submit access changes no later than the effective date of a transfer. Access no longer required shall be removed within one business day, and new access shall follow Clause 5.1. Privileged access shall not carry forward automatically. Human Resources and IT shall reconcile transfer records weekly. Unresolved discrepancies older than five business days shall be escalated to the CISO.

### 5.3 Offboarding

For involuntary terminations or terminations designated high risk, workforce access shall be disabled at or before the separation time communicated by Human Resources, with a target of 15 minutes from the authorized notice. For planned voluntary departures, access shall be disabled by the end of the individual’s last working day and no later than four hours after the recorded separation time.

Privileged sessions, API tokens, personal access tokens, active refresh tokens, VPN sessions, and managed-device certificates shall be revoked within four hours of account disablement. Shared secrets known to the departing individual shall be rotated within one business day when the manager or System Owner identifies continuing exposure. IT shall transfer ownership of files, tickets, repositories, dashboards, and automation before deletion. Accounts shall remain disabled for 30 days for recovery and legal-hold review and then be deleted or anonymized according to retention requirements.

### 5.4 Dormant and Temporary Accounts

Temporary access shall have a defined expiration not exceeding 90 days. Contractor access shall expire on the contract end date unless renewed through a new approval. Workforce accounts inactive for 45 days shall be suspended unless the manager documents leave or another valid reason. System Owners shall review service accounts with no observed use for 60 days and disable them after confirming that no production dependency remains.

## 6. Session Controls

### 6.1 Interactive Session Timeouts

Administrative console sessions shall lock or terminate after 15 minutes of inactivity and require reauthentication. Production shell sessions shall terminate after 30 minutes of inactivity where technically supported. Other interactive corporate applications shall enforce an inactivity timeout not exceeding 12 hours. The maximum continuous administrative session shall be eight hours. Session tokens shall be invalidated upon password reset, account disablement, or confirmed compromise.

### 6.2 Remote and Automated Sessions

Remote administrative access shall use approved managed devices and company-authorized secure access paths. Service-to-service sessions shall use scoped, non-human credentials stored in an approved secrets manager. Long-lived static keys are prohibited unless a documented technical constraint exists. Such exceptions require Security approval, rotation at least every 90 days, and monthly owner attestation.

## 7. Access Reviews and Monitoring

### 7.1 Quarterly Access Reviews

System Owners shall conduct access reviews **quarterly** for production systems, AWS accounts, identity-provider groups, source-control administration, security tools, customer-support tooling, and repositories containing customer data. Reviews shall be completed within 15 business days after quarter end and shall verify employment status, role alignment, privilege level, tenant scope, dormant access, shared-account prohibition, and exception validity.

Security shall coordinate evidence collection and sample completed removals. Reviewers shall explicitly certify retained privileged access; silence or non-response does not constitute approval. Unjustified access shall be removed within two business days, and critical excessive privilege shall be removed within four hours. Overdue reviews shall be escalated after five business days to the relevant executive and the CISO.

### 7.2 Automated Monitoring

Security logs shall be forwarded to the centralized logging service and monitored by the outsourced security operations center under CC7.2. Alerts shall cover repeated authentication failures, unusual privileged-role assumption, impossible travel, creation of access keys, changes to identity policies, and access from blocked locations. High-confidence compromise alerts shall initiate the Incident Response Plan.

### 7.3 Evidence Retention

Access requests, approvals, review certifications, exception records, and remediation evidence shall be retained for three years. Authentication and privilege-use logs shall be retained online for 12 months and may then be archived for an additional 12 months. Records shall be protected from alteration and made available to Security, Internal Audit, and authorized external auditors.

## 8. Exceptions, Enforcement, and Review

### 8.1 Exceptions

Exceptions shall document the affected control, business justification, risk assessment, compensating controls, owner, approval date, and expiration. The CISO shall approve all exceptions. Exceptions shall not exceed 90 days without renewal and shall be reviewed monthly by Security.

### 8.2 Enforcement

Violations may result in immediate access suspension, disciplinary action, contract remedies, or termination. System Owners who repeatedly fail to complete reviews or remove access may have approval authority reassigned. Suspected misuse shall be reported to Security and handled under the Incident Response Plan.

### 8.3 Policy Review

The CISO shall review this policy annually and after material identity-platform changes, significant incidents, acquisitions, or regulatory changes. Revisions shall be approved through the policy-governance process, communicated to affected personnel, and retained with superseded versions for at least six years.
