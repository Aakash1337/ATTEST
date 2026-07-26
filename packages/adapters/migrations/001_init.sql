-- 001_init.sql — core schema
-- Derives from docs/06-data-model.md §3 and docs/14-contracts.md §6.
-- Forward-only. Idempotent. Re-runnable.

-- KEY TYPE: text, not uuid.
-- docs/14-contracts.md §1 mandates prefixed ULIDs (doc_01H…, chk_01H…). Those cannot be
-- stored in a uuid column, and a hidden uuid<->ULID mapping would mean the id a citation
-- carries is not the id the row has — precisely the indirection ADR-0006 exists to remove.
-- CHECK constraints below recover the format validation the uuid type provided.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Logical document identity. Stable across versions. Metadata only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document (
  document_id        text PRIMARY KEY,
  tenant_id          text NOT NULL,
  title              text NOT NULL,
  doc_type           text NOT NULL,
  current_version_id text,                       -- FK added in 003 once the target exists
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_id_fmt CHECK (document_id ~ '^doc_[0-9A-HJKMNP-TV-Z]{26}$')
);

-- ---------------------------------------------------------------------------
-- IMMUTABLE once INDEXED. This is what a citation is pinned to (ADR-0006).
--
-- The first design made document_id a single-row primary key with `version` as an
-- ordinary column, so two versions could not coexist and a citation could not be tied
-- to the version it cited. That broke the audit story. This table is the correction.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_version (
  document_version_id text PRIMARY KEY,
  document_id         text NOT NULL REFERENCES document(document_id),
  tenant_id           text NOT NULL,
  version             int  NOT NULL,
  status              text NOT NULL,             -- DocumentStatus (14-contracts.md §2)
  acl_tags            text[] NOT NULL,
  content_hash        text NOT NULL,
  source_etag         text,
  screening_verdict   text,                      -- CLEAN | FLAGGED
  screening_reason    text,
  released_by         text,                      -- set when a human releases a quarantine
  released_at         timestamptz,
  superseded_by       text REFERENCES document_version(document_version_id),
  failure_reason      text,
  ingested_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_version_unique_version UNIQUE (document_id, version),
  CONSTRAINT document_version_unique_hash    UNIQUE (tenant_id, content_hash),
  CONSTRAINT document_version_status_ck CHECK (status IN (
    'PENDING_UPLOAD','PARSING','SCREENING','QUARANTINED',
    'EMBEDDING','INDEXED','SUPERSEDED','FAILED')),
  CONSTRAINT document_version_screening_ck CHECK (
    screening_verdict IS NULL OR screening_verdict IN ('CLEAN','FLAGGED')),
  -- A quarantined version must carry a reason. Silent quarantine is unreviewable.
  CONSTRAINT document_version_quarantine_ck CHECK (
    status <> 'QUARANTINED' OR screening_reason IS NOT NULL),
  CONSTRAINT document_version_id_fmt CHECK (document_version_id ~ '^dv_[0-9A-HJKMNP-TV-Z]{26}$')
);

-- ---------------------------------------------------------------------------
-- IMMUTABLE. Only `active` ever changes.
--   Retrieval filters active = true  — never answer from a superseded policy.
--   Citation resolution ignores active — historical answers stay verifiable forever.
-- Two code paths, two rules. They must not be shared.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chunk (
  chunk_id            text PRIMARY KEY,
  document_version_id text NOT NULL REFERENCES document_version(document_version_id),
  tenant_id           text NOT NULL,
  ordinal             int  NOT NULL,
  acl_tags            text[] NOT NULL,
  heading_path        text[] NOT NULL,
  page                int,
  raw_text            text NOT NULL,             -- what is quoted and cited
  contextualised_text text NOT NULL,             -- what is embedded
  token_count         int NOT NULL,
  embedding           vector(1024) NOT NULL,
  tsv                 tsvector GENERATED ALWAYS AS
                        (to_tsvector('english', contextualised_text)) STORED,
  embed_model_id      text NOT NULL,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chunk_unique_ordinal UNIQUE (document_version_id, ordinal),
  CONSTRAINT chunk_acl_nonempty CHECK (cardinality(acl_tags) > 0),
  CONSTRAINT chunk_id_fmt CHECK (chunk_id ~ '^chk_[0-9A-HJKMNP-TV-Z]{26}$')
);

-- ---------------------------------------------------------------------------
-- IMMUTABLE. Minted when a live tool returns, BEFORE the model sees the result.
-- This is what makes a claim grounded in live cloud state citable at all.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS live_evidence (
  evidence_id   text PRIMARY KEY,
  tenant_id     text NOT NULL,
  acl_tags      text[] NOT NULL,
  source        text NOT NULL,
  check_name    text NOT NULL,
  scope         jsonb NOT NULL,
  result        jsonb NOT NULL,
  rendered_text text NOT NULL,
  observed_at   timestamptz NOT NULL,
  stale_after   timestamptz NOT NULL,
  CONSTRAINT live_evidence_window_ck CHECK (stale_after > observed_at),
  CONSTRAINT live_evidence_id_fmt CHECK (evidence_id ~ '^ev_[0-9A-HJKMNP-TV-Z]{26}$')
);

-- ---------------------------------------------------------------------------
-- Extension, not core: lookup_prior_answer is deferred (11-delivery-plan.md §3).
-- The table exists now because it is tenant-scoped and must be covered by RLS and by
-- the static predicate check from the day it appears.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prior_answer (
  prior_id      text PRIMARY KEY,
  tenant_id     text NOT NULL,
  acl_tags      text[] NOT NULL,
  question_text text NOT NULL,
  answer_text   text NOT NULL,
  approved_at   timestamptz NOT NULL,
  run_id        text NOT NULL,
  embedding     vector(1024) NOT NULL,
  tsv           tsvector GENERATED ALWAYS AS
                  (to_tsvector('english', question_text)) STORED,
  CONSTRAINT prior_answer_id_fmt CHECK (prior_id ~ '^ans_[0-9A-HJKMNP-TV-Z]{26}$')
);
