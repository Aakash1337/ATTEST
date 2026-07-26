---
Document ID: NWS-POL-ENC-002
Version: 2.1
Effective Date: 2026-02-01
Owner: Chief Information Security Officer
Classification: INTERNAL
Review Cycle: Annual
---

# Encryption & Key Management Policy

## 1. Purpose and Authority

### 1.1 Purpose

This policy establishes mandatory cryptographic safeguards for information processed, stored, or transmitted by Northwind Systems. It defines approved encryption standards, key custody requirements, rotation intervals, and operational responsibilities for the workforce analytics platform and supporting corporate systems. The policy supports SOC 2 controls CC6.1, CC6.7, CC7.2, and the access-control principles expressed in AC-6 and IA-2.

### 1.2 Authority

The Chief Information Security Officer (CISO) is the approving authority for this policy. The Security Engineering function interprets technical requirements, maintains approved cryptographic configurations, and may issue implementation standards that are more restrictive than this policy. Product Engineering, Cloud Operations, Data Engineering, and Corporate IT shall implement applicable requirements within their assigned systems.

### 1.3 Objectives

Cryptographic controls shall preserve confidentiality and integrity while remaining supportable by a 12-person engineering organization. Implementations shall use managed, centrally auditable services where practical, minimize plaintext exposure, separate key administration from ordinary application access, and permit recovery following a regional disruption.

## 2. Scope and Definitions

### 2.1 Scope

This policy applies to production and disaster-recovery infrastructure, customer tenant data, application databases, object storage, logs, search indexes, message queues, exports, backups, employee endpoints, and corporate SaaS systems administered by Northwind Systems. It covers data containing employee names, business email addresses, employment records, customer configuration, authentication material, and internal operational records.

Payment-card data and protected health information are outside the platform’s approved processing scope. Their exclusion does not reduce the requirements for information otherwise classified CONFIDENTIAL or RESTRICTED.

### 2.2 Definitions

“CMK” means a customer-managed AWS Key Management Service key whose policy, grants, aliases, and lifecycle are controlled by Northwind Systems. “Data key” means a symmetric key generated for envelope encryption and protected by a CMK. “Key owner” means the named role accountable for authorized use, lifecycle decisions, and access review. “Cryptographic material” includes keys, certificates, secrets used to derive keys, and recovery copies.

### 2.3 Approved Methods

Approved cryptography shall be drawn from current, vendor-supported implementations. Custom cryptographic algorithms are prohibited. AES-256 is the minimum symmetric encryption standard for covered stored data. Transport security shall use TLS 1.2 or later. Hashing used for integrity or signing workflows shall use SHA-256 or stronger; password storage shall use an approved adaptive password-hashing function with unique salts.

## 3. Encryption at Rest

### 3.1 Production Data Stores

All CONFIDENTIAL and RESTRICTED information at rest in production shall be encrypted using AES-256 through AWS KMS-integrated services or an approved envelope-encryption implementation. Production databases, object stores, block volumes, search clusters, message queues, and managed caches shall use CMKs assigned to the production account. Provider-managed keys do not satisfy this requirement for primary production data stores unless the CISO approves a time-limited exception.

Production CMKs shall be separate from development, test, and disaster-recovery keys. Application roles may receive only the encrypt, decrypt, generate-data-key, or re-encrypt operations necessary for their workload. Broad key administration rights shall not be granted to application execution roles.

### 3.2 Non-Production and Endpoint Storage

Production customer records shall not be copied into non-production environments unless de-identified through a Security Engineering-approved process. When CONFIDENTIAL information is approved for test use, the target store shall use AES-256 encryption with a non-production KMS key and access shall be limited to the assigned engineering group.

Company-managed laptops shall use full-disk encryption enforced by Corporate IT. Removable media storage is prohibited unless specifically approved for incident response or legal collection; approved media shall use hardware-backed AES-256 encryption and be inventoried by serial number.

### 3.3 Exports, Logs, and Temporary Storage

Customer exports shall be written only to encrypted storage locations and shall expire no later than seven days after creation unless a contract requires a shorter period. Temporary processing files containing CONFIDENTIAL or RESTRICTED information shall be encrypted and deleted within 24 hours of job completion. Logs shall exclude credentials, session tokens, encryption keys, and full employment-record payloads. Where identifiers are required for troubleshooting, logging shall prefer tenant-scoped opaque identifiers.

### 3.4 Backup Encryption

Database snapshots, object-storage replication, configuration archives, and other backups shall be encrypted with AES-256 using AWS KMS. Backup encryption shall be verified during the monthly backup-control check and each semi-annual restoration test. Copies transferred to the disaster-recovery region in us-west-2 shall be re-encrypted under the designated disaster-recovery CMK and shall not retain dependency on a key available only in us-east-1. Backup retention shall follow the applicable retention schedule; cryptographic deletion may be used only when Security Engineering confirms that all dependent recovery copies are addressed.

## 4. Encryption in Transit

### 4.1 External Connections

All customer, administrative, API, webhook, and browser connections shall use TLS 1.2 or later. TLS 1.0, TLS 1.1, SSL, plaintext HTTP, and anonymous cipher suites are prohibited. Public endpoints shall redirect HTTP requests to HTTPS only when no sensitive content is accepted on the plaintext request. Certificates shall be issued by an approved certificate authority, automatically renewed where supported, and monitored for expiration beginning 45 days before expiry.

### 4.2 Internal Service Communications

Service-to-service communication carrying CONFIDENTIAL or RESTRICTED information shall use TLS 1.2 or later, including traffic crossing account, availability-zone, virtual-network, or regional boundaries. Mutual TLS shall be used for security-sensitive internal services where supported by the service architecture. Connections to managed databases and caches shall require transport encryption and reject unencrypted negotiation.

### 4.3 Administrative and File Transfer Protocols

Administrative access shall use encrypted protocols such as HTTPS, SSH, or an approved managed session service. FTP, Telnet, and unencrypted remote administration are prohibited. Bulk file transfers shall use SFTP, HTTPS, or an approved encrypted object-storage workflow. Emailed attachments shall not be used to transfer RESTRICTED data; approved secure exchange channels shall enforce expiration and recipient authentication.

### 4.4 Configuration Verification

Cloud Operations shall scan Internet-facing endpoints monthly for protocol and certificate configuration. Security Engineering shall review the permitted cipher baseline at least annually and within 30 days of a material cryptographic advisory. Failed scans affecting production shall be tracked as security defects, with critical exposure corrected within 72 hours and high exposure within 14 calendar days.

## 5. Key Management

### 5.1 Key Creation, Storage, and Use

Cryptographic keys shall be generated using AWS KMS, an approved hardware-backed keystore, or a cryptographically secure key-generation facility. Plaintext production keys shall not be committed to source control, stored in tickets, copied into chat, or embedded in application configuration. Key policies shall use named roles, least privilege under AC-6, and explicit separation between key administrators and key users.

Production workloads shall use CMKs. CMK aliases shall identify environment and purpose without including customer personal information. Key grants shall be narrowly scoped and reviewed after material architecture changes. Importing externally generated key material requires written approval from the CISO and a documented recovery procedure.

### 5.2 Key Ownership and Rotation

Every production CMK shall have a registered owner from Cloud Operations, Security Engineering, or the accountable application team, plus a technical custodian responsible for implementation. The owner shall approve intended use, validate the key policy, review authorized principals quarterly, and document service dependencies before disabling or scheduling deletion.

Production CMKs shall rotate at least annually. Automatic annual rotation shall be enabled where the service supports it. Where automatic rotation is unavailable, the key owner shall create replacement material, reconfigure dependent services, validate decryptability, and retire the prior version under a documented change record. Certificates and other cryptographic material shall rotate according to their validity period and no later than vendor or Security Engineering requirements.

Emergency rotation shall begin within four hours when a key is suspected of compromise, when unauthorized use is observed, or when a privileged custodian’s credentials are materially exposed. Security Engineering shall coordinate containment, dependency validation, and incident documentation. Rotation evidence shall include the old and new key identifiers, timestamps, affected services, validation results, and approving owner.

### 5.3 Disablement, Deletion, and Recovery

Keys shall not be deleted until the owning team inventories live data, replicas, archives, backups, and legal-hold obligations that depend on the key. Production KMS keys shall use a minimum 30-day deletion waiting period. Disabling a key requires a tested rollback plan unless performed during active incident containment. Recovery access shall be limited to designated Security Engineering and Cloud Operations roles and tested annually without exporting plaintext key material.

### 5.4 Access Logging and Review

KMS administration and use events shall be logged centrally and retained for at least 400 days. The outsourced security operations center shall monitor for key-policy changes, deletion scheduling, disabled audit logging, anomalous decrypt volume, and use from unexpected accounts or regions. Security Engineering shall review high-risk alerts within one business day and complete a quarterly review of CMK administrators, key users, cross-account grants, and stale keys.

## 6. Exceptions, Compliance, and Review

### 6.1 Exceptions

Exceptions require a documented business justification, affected data classification, compensating controls, risk owner, and expiration date. The CISO shall approve all production exceptions. Exceptions shall not exceed 180 days and shall be reviewed at least every 90 days. Expired exceptions constitute noncompliance.

### 6.2 Evidence and Enforcement

Control evidence shall include configuration exports, key inventories, rotation records, endpoint scan results, access-review attestations, exception approvals, and restoration-test records. Evidence shall be retained for at least 18 months. Violations may result in access suspension, corrective action, or vendor remediation requirements, consistent with contractual and personnel procedures.

### 6.3 Policy Review

The CISO shall review this policy annually and following a material platform change, cryptographic incident, regulatory change, or significant update to accepted industry practice. Security Engineering shall propose revisions; affected system owners shall confirm implementation feasibility before approval.
