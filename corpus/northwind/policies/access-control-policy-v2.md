---
Document ID: NWS-POL-AC-002
Version: "2.0"
Effective Date: 2024-06-01
Owner: Chief Information Security Officer
Classification: INTERNAL — SUPERSEDED
Review Cycle: Annual
Status: SUPERSEDED by Version 3.0 effective 2026-01-15
---

# Access Control Policy

## 1. Purpose and Authority

### 1.1 Purpose

This policy establishes requirements for granting, modifying, reviewing, and revoking logical access to Northwind Systems information assets. It applies least privilege, need to know, and separation of duties in support of SOC 2 controls CC6.1, CC6.2, and CC6.3 and the objectives of AC-2, AC-3, AC-5, AC-6, and IA-2.

### 1.2 Authority

The Chief Information Security Officer (CISO) owns this policy. System Owners implement its requirements for their assigned systems. Security may suspend access when misuse, compromise, or an unapproved privilege creates material risk. Managers may approve access within their business function but shall not approve their own access.

## 2. Scope and Definitions

### 2.1 Scope

This policy applies to employees, contractors, interns, service providers, and machine identities accessing Northwind Systems assets. Covered assets include AWS environments, production and non-production applications, source repositories, customer-support tools, corporate SaaS applications, identity providers, databases, and administrative interfaces.

### 2.2 Definitions

An **Administrative Account** is a human or machine identity able to manage identities, change security configuration, deploy production code, access tenant-wide data, alter audit settings, or administer cloud resources. A **System Owner** is the accountable role listed in the asset inventory. A **Privileged Role** is an RBAC role containing administrative permissions. A **Workforce Account** is an individually assigned employee or contractor identity.

## 3. Access Governance

### 3.1 Access Principles

Access shall be denied by default and granted only for an approved business purpose. Permissions shall be limited by data, function, environment, and duration. Shared human accounts are prohibited except for documented emergency accounts under Clause 4.4. Production access shall be separated from development access, and access to customer employment records shall be restricted to assigned duties.

### 3.2 Role-Based Access Control

Material systems shall use role-based access control (RBAC) where technically supported. System Owners shall document each role’s job function, permitted actions, data scope, approval authority, and incompatible assignments. Security shall review new privileged roles before deployment. Material changes to production roles shall be tested in a non-production environment and recorded under change management.

### 3.3 Separation of Duties

An individual shall not request and finally approve the same access assignment. Production deployment approval, identity administration, security-log administration, and key administration shall be separated where practical. If Engineering staffing prevents complete separation, the System Owner shall document peer approval, immutable logging, or retrospective review within three business days as a compensating control.

## 4. Identity and Privileged Access

### 4.1 Unique Accounts and Authentication

Each workforce user shall have a unique account linked to a current personnel or contractor record. Passwords, authentication devices, tokens, and secrets shall not be shared. Where passwords are accepted, systems shall enforce a minimum length of 12 characters, block known-compromised passwords where supported, and limit repeated failed authentication attempts. Authentication logs shall be retained for at least 365 days.

### 4.2 Multi-Factor Authentication

Multi-factor authentication (MFA) is **recommended for administrators**, particularly for AWS consoles, production tooling, identity-provider administration, source-control administration, and security platforms. System Owners should enable available additional factors for Administrative Accounts based on platform capability and risk. SMS should not be used as the sole additional factor where stronger methods are available. Security shall document systems where administrative MFA has not been enabled and review the resulting risk during the annual policy review.

### 4.3 Privileged Access Management

Privileged access shall use named administrative identities or role assumption where supported. Standing administrative access should be reduced in favor of time-bound elevation. Requests for production privileges shall identify the system, business purpose, and expected duration and require manager or System Owner approval. Privileged sessions shall be logged centrally when the relevant platform supports such logging.

Administrative role assignments shall expire after one business day unless a shorter platform maximum applies. Persistent access requires CISO approval, documented justification, an owner, and an expiration date no later than 180 days after approval. Security shall review active persistent-access exceptions quarterly.

### 4.4 Emergency Access

Emergency accounts shall be stored in an approved secrets vault and tested semi-annually. Use is limited to incidents in which ordinary privileged access is unavailable or would materially delay recovery. Use shall create a Security notification and be reviewed within two business days. Emergency credentials shall be rotated after use and at least every 180 days when unused.

## 5. Account Lifecycle

### 5.1 Provisioning

Access requests shall be submitted through the approved ticketing workflow and include the beneficiary, manager, system, requested role, business justification, and expected duration. The beneficiary’s manager and System Owner shall approve production access or access to customer employment records. Security approval is required for roles that permit tenant-wide data access, identity administration, or modification of audit settings.

Group and role assignment shall be used where available. The administrator completing the request shall verify assignment against the approval and retain the ticket for three years. Informal chat or verbal requests are not sufficient except during a declared incident; emergency access granted without prior approval shall be documented and retrospectively approved within two business days.

### 5.2 Transfers and Role Changes

Managers shall notify IT of transfers by the employee’s effective date. Access no longer required shall be removed within two business days. New privileged access shall be separately requested and shall not carry over automatically. Human Resources and IT shall reconcile transfer records monthly. Discrepancies unresolved for more than ten business days shall be escalated to Security.

### 5.3 Offboarding

For involuntary or high-risk terminations, workforce access shall be disabled at the separation time communicated by Human Resources, with a target of 30 minutes from authorized notice. For voluntary departures, access shall be disabled by the end of the last working day and no later than eight hours after the recorded separation time.

Privileged sessions, API tokens, active refresh tokens, VPN sessions, and managed-device certificates shall be revoked within eight hours after account disablement. Shared secrets known to the departing individual shall be rotated within two business days when the System Owner identifies continuing exposure. IT shall transfer ownership of repositories, files, tickets, dashboards, and automation before deletion. Disabled accounts shall be held for 30 days for recovery and legal-hold review and then deleted or anonymized under applicable retention requirements.

### 5.4 Dormant and Temporary Accounts

Temporary access shall expire within 180 days. Contractor accounts shall expire on the contract end date unless renewed through a documented approval. Workforce accounts inactive for 60 days shall be suspended unless the manager confirms leave or another valid reason. System Owners shall review service accounts with no observed use for 90 days and disable them after validating that no production dependency remains.

## 6. Session Controls

### 6.1 Interactive Session Timeouts

Administrative console sessions shall lock or terminate after 30 minutes of inactivity and require reauthentication. Production shell sessions shall terminate after 60 minutes of inactivity where supported. Other interactive corporate applications shall enforce an inactivity timeout not exceeding 12 hours. The maximum continuous administrative session shall be 12 hours. Session tokens shall be invalidated upon password reset, account disablement, or confirmed compromise.

### 6.2 Remote and Automated Sessions

Remote administrative access shall use approved company devices and authorized secure-access paths. Service-to-service sessions shall use scoped machine credentials stored in an approved secrets manager where feasible. Static access keys require a named owner and rotation at least every 180 days. Exceptions to that interval require Security approval and quarterly owner attestation.

## 7. Access Reviews and Monitoring

### 7.1 Semi-Annual Access Reviews

System Owners shall conduct access reviews **semi-annually** for production systems, AWS accounts, identity-provider groups, source-control administration, security tools, and customer-support tooling. Reviews shall be completed within 20 business days after June 30 and December 31 and shall verify employment status, role alignment, privilege level, tenant scope, dormant access, shared-account prohibition, and exception validity.

Security shall coordinate evidence collection and sample removals. Reviewers shall explicitly certify retained privileged access. Unjustified access shall be removed within five business days; critical excessive privilege shall be removed within one business day. Reviews overdue by ten business days shall be escalated to the relevant executive and the CISO.

### 7.2 Automated Monitoring

Available authentication and privilege logs shall be forwarded to the centralized logging platform and monitored by the outsourced security operations center under CC7.2. Alert rules shall address repeated authentication failures, unusual administrative activity, access-key creation, identity-policy changes, and access from blocked locations. Suspected compromise shall be handled under the Incident Response Plan.

### 7.3 Evidence Retention

Access requests, approvals, access-review certifications, exceptions, and remediation records shall be retained for three years. Authentication and privilege-use logs shall be retained online for 12 months and may be archived for a further 12 months. Records shall be protected against unauthorized alteration and made available for authorized compliance review.

## 8. Exceptions, Enforcement, and Review

### 8.1 Exceptions

Exceptions shall identify the control, justification, risk, compensating controls, owner, approval date, and expiration. CISO approval is required. Exceptions shall expire within 180 days unless renewed and shall be reviewed quarterly by Security.

### 8.2 Enforcement

Violations may result in access suspension, disciplinary action, contract remedies, or termination. Repeated failure to complete access reviews or remove unjustified access may result in reassignment of approval authority. Suspected misuse shall be reported promptly to Security.

### 8.3 Policy Review and Supersession

The CISO shall review this policy annually and after material identity-platform changes, incidents, acquisitions, or regulatory changes. Approved revisions shall be communicated to affected personnel. This Version 2.0 is retained as a superseded record and shall not be used as the current control baseline after the effective date of Version 3.0.
