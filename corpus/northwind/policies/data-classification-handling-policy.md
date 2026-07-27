---
Document ID: NWS-POL-DCH-002
Version: 2.0
Effective Date: 2026-02-01
Owner: Chief Information Security Officer
Classification: INTERNAL
Review Cycle: Annual
---

# Data Classification & Handling Policy

## 1. Purpose and Authority

### 1.1 Purpose

This policy establishes the mandatory classification vocabulary and handling requirements for information created, received, processed, stored, or transmitted by Northwind Systems. It supports SOC 2 controls CC6.1, CC6.6, CC6.7, CC7.2, and CC8.1 by assigning access, storage, transmission, sharing, labeling, retention, and disposal requirements according to business impact.

### 1.2 Authority

The Chief Information Security Officer (CISO) owns this policy. The Security Team maintains implementation standards, investigates violations, and may impose temporary handling restrictions when information is exposed or its classification is uncertain. System Owners implement technical controls. Data Owners determine classification and retention. All workforce members and contractors must comply with the assigned classification.

### 1.3 Scope

This policy applies to information in any form, including application records, source code, logs, exports, support attachments, email, collaboration content, printed material, backups, screenshots, and derived datasets. It applies to Northwind Systems personnel, contractors, service providers, and systems in the production region, disaster-recovery region, corporate environment, and approved third-party services.

## 2. Classification Governance

### 2.1 Authoritative Vocabulary

Northwind Systems uses exactly four classification tiers: PUBLIC, INTERNAL, CONFIDENTIAL, and RESTRICTED. These values are the authoritative vocabulary for document labels, repository metadata, data-loss-prevention rules, object tags, access-control-list attributes, and downstream retrieval filters. Systems implementing classification tags must preserve the uppercase spelling and must not substitute locally invented values.

### 2.2 Classification Responsibility

The Data Owner assigns a classification when information is created or introduced. Where several information elements are combined, the resulting record must receive the highest classification applicable to any included element. A recipient may raise a classification immediately but may not lower it without written Data Owner approval. The Security Team must resolve classification disputes within five business days.

### 2.3 Default and Review

Unlabeled business information defaults to INTERNAL. Unlabeled information containing customer employee names, email addresses, employment records, authentication material, security findings, or legal restrictions must be treated as CONFIDENTIAL or RESTRICTED, as applicable, until the Data Owner labels it. Data Owners must review classifications annually and following a material change in content, use, contractual obligation, exposure risk, or applicable law.

## 3. PUBLIC

### 3.1 Definition

PUBLIC information is approved for unrestricted external release and would not create material harm if disclosed. Examples include published website content, approved press statements, public product documentation, and released job postings. Information is not PUBLIC merely because it is available to a broad internal audience.

### 3.2 Access, Storage, and Transmission

PUBLIC information may be accessed without authentication after Communications or the accountable Data Owner approves publication. It may be stored in approved corporate systems or public distribution services. Encryption in transit must be used where the hosting service supports it. Integrity controls, version history, and change approval remain required for official publications.

### 3.3 Sharing, Labeling, Retention, and Disposal

External sharing is permitted after publication approval. Draft content must retain its prepublication classification. A PUBLIC label is optional on a public webpage but mandatory in internal repositories when automated access rules depend on metadata. Retention follows the applicable records schedule. Disposal may use standard deletion or recycling processes, provided no higher-classification material is commingled.

## 4. INTERNAL

### 4.1 Definition

INTERNAL information is intended for the Northwind Systems workforce and approved contractors and would cause limited operational or reputational harm if disclosed. Examples include routine procedures, internal announcements, ordinary project plans, organization charts, and noncustomer operational metrics.

### 4.2 Access, Storage, and Transmission

Access requires an active Northwind Systems identity or an approved contractor identity and must be based on legitimate business need under CC6.1 and AC-2. INTERNAL information must be stored in company-managed endpoints, approved SaaS services, or authorized AWS accounts. Transmission must use company email, approved collaboration services, HTTPS, SFTP, or an approved encrypted tunnel. Personal email, consumer file-sharing services, and unmanaged removable media are prohibited.

### 4.3 Sharing, Labeling, Retention, and Disposal

External sharing requires Data Owner approval and a contractual confidentiality obligation. Documents should display “INTERNAL” in their header, footer, front matter, or repository metadata; automated systems must apply the value to access-control tags. Retention follows the departmental schedule and must not exceed seven years unless Legal places a hold. Electronic disposal must remove active copies and allow approved backup expiration; paper must be placed in secure recycling bins.

## 5. CONFIDENTIAL

### 5.1 Definition

CONFIDENTIAL information could cause significant business, customer, contractual, or individual harm if disclosed or altered. It includes customer employee names, email addresses, employment records, customer exports, nonpublic financial records, source code, production architecture, security configurations, executed contracts, and personnel files that do not contain authentication secrets.

### 5.2 Access and Authorization

Access must be limited by role and business need, approved by the Data Owner or delegated System Owner, and reviewed at least quarterly in accordance with CC6.1, AC-2, and AC-6. Shared accounts are prohibited. Service access must use uniquely attributable identities where technically feasible. Access logs must be retained for at least 365 days and reviewed when alerts, investigations, or contractual commitments require it.

### 5.3 Storage and Transmission

Electronic storage must be encrypted at rest using approved platform encryption, including AWS KMS controls for production data. Local storage is permitted only on company-managed, encrypted endpoints and only when required for an assigned task. Transmission must use TLS 1.2 or higher, SFTP, an approved VPN, or an approved encrypted file-transfer mechanism. Email attachments must be access-controlled or encrypted when sent outside Northwind Systems.

### 5.4 Sharing and Labeling

Internal sharing is limited to authorized recipients. External sharing requires Data Owner approval, an executed nondisclosure agreement or equivalent confidentiality clause, and verification that the recipient and delivery address are correct. Public links are prohibited. The label “CONFIDENTIAL” must appear in document front matter, headers, footers, export filenames, or system metadata. Printed copies must display the label on each page where practical.

### 5.5 Retention and Disposal

Customer records must be retained for the contract term plus 90 days unless the contract, law, or legal hold requires otherwise. Support attachments containing customer data must be deleted within 30 days after ticket closure. Electronic media must be cryptographically erased or sanitized under NIST SP 800-88-aligned procedures before reuse or disposal. Paper must be cross-cut shredded by an approved service. Disposal evidence must be retained for three years when performed by a vendor.

## 6. RESTRICTED

### 6.1 Definition

RESTRICTED information presents the highest potential impact and requires narrowly controlled access. It includes production credentials, private cryptographic key material, authentication secrets, unremediated critical security findings, raw penetration-test evidence, active incident investigation records, legal strategy, and bulk customer employment-record exports.

### 6.2 Access and Authorization

Access must be explicitly approved by the Data Owner and limited to named individuals or tightly scoped service roles under AC-6. Group membership must be reviewed monthly, and emergency access must expire within 24 hours unless renewed with written justification. Authentication must meet applicable IA-2 requirements. Access events must be logged, protected from alteration, retained for at least 400 days, and made available to the Security Team.

### 6.3 Storage and Transmission

RESTRICTED information must be stored only in specifically approved repositories with encryption at rest, access logging, and prevention of public access. Production key material must remain within approved key-management or secrets-management services and must not be exported. Local storage, removable media, and synchronization to general-purpose collaboration folders are prohibited unless the CISO grants a time-limited exception. Transmission must use mutually authenticated or recipient-verified encrypted channels. Unencrypted email and public links are prohibited.

### 6.4 Sharing and Labeling

External sharing requires written CISO approval, Data Owner approval, a current data-processing or confidentiality agreement, and a documented recipient list. The sender must verify recipient identity through a separate channel before releasing authentication material or security evidence. Every file, page, export, and repository object must carry the “RESTRICTED” label where supported. Systems must enforce the classification through ACL tags and must deny retrieval when the requesting identity lacks the corresponding authorization.

### 6.5 Retention and Disposal

RESTRICTED information must be retained only for the documented purpose and shortest applicable period. Production credentials must be invalidated immediately when no longer needed. Raw penetration-test evidence must be deleted three years after report acceptance unless Legal directs otherwise. Incident investigation records must be retained for seven years. Disposal requires cryptographic erasure or verified secure destruction; completion must be recorded in a ticket approved by the Data Owner or Security Team.

## 7. Operational Requirements

### 7.1 Copies, Derivatives, and Backups

Copies, excerpts, screenshots, transformed records, test fixtures, and analytical outputs inherit the source classification unless the Data Owner documents that identifying and protected elements were irreversibly removed. Backups retain the classification of source data and must follow the same access restrictions. Backup expiration under an approved lifecycle is an acceptable disposal method when individual deletion is technically impracticable.

### 7.2 Nonproduction Use

CONFIDENTIAL or RESTRICTED production data must not be used in development, test, demonstrations, or training unless the Data Owner and Security Team approve a documented exception. Approved use must minimize fields, restrict access, establish a deletion date, and preserve required encryption and logging. Synthetic data should be used whenever it can meet the business purpose.

### 7.3 Legal Holds and Contractual Terms

Legal holds suspend scheduled deletion without changing classification. If a contract or law requires stronger handling than this policy, the stronger requirement governs. Privacy, Legal, and Security must be consulted before transferring customer employment records across national boundaries or to a new subprocessor.

## 8. Compliance and Exceptions

### 8.1 Monitoring and Violations

The Security Team may inspect access logs, sharing links, classification tags, repository permissions, and disposal records under CC7.2. Suspected misclassification, unauthorized disclosure, or loss must be reported through the incident channel within one hour of discovery. Violations may result in access suspension, corrective action, contract remedies, or disciplinary action.

### 8.2 Exceptions

Exceptions require a documented business justification, affected data, compensating controls, accountable owner, and expiration date. The CISO must approve exceptions involving CONFIDENTIAL or RESTRICTED information. Exceptions may not exceed 180 days and must be reviewed at least every 90 days. Expired exceptions are invalid and must be closed or renewed before continued use.

### 8.3 Review and Evidence

The CISO reviews this policy annually. The Security Team must sample at least ten repositories each quarter for label accuracy and handling compliance, including at least two repositories containing customer records. Evidence of reviews, exceptions, access approvals, and remediation must be retained for three years.
