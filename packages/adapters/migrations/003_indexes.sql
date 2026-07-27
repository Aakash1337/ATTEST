-- 003_indexes.sql — retrieval indexes and the deferred FK
-- docs/06-data-model.md §3, docs/adr/0007-filtered-vector-search.md.

ALTER TABLE document DROP CONSTRAINT IF EXISTS document_current_version_fk;
ALTER TABLE document ADD CONSTRAINT document_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES document_version(document_version_id);

-- Vector search. m/ef_construction are tuned parameters; any change is recorded
-- alongside the retrieval metric it moved, because a recall number without its index
-- parameters is not reproducible.
CREATE INDEX IF NOT EXISTS chunk_embedding_hnsw
  ON chunk USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS chunk_tsv_gin        ON chunk USING gin (tsv);
CREATE INDEX IF NOT EXISTS chunk_acl_gin        ON chunk USING gin (acl_tags);
CREATE INDEX IF NOT EXISTS chunk_tenant_active  ON chunk (tenant_id, active) WHERE active;
CREATE INDEX IF NOT EXISTS chunk_version        ON chunk (document_version_id);

CREATE INDEX IF NOT EXISTS doc_version_document ON document_version (document_id, version);
CREATE INDEX IF NOT EXISTS doc_version_tenant   ON document_version (tenant_id, status);

CREATE INDEX IF NOT EXISTS live_ev_tenant
  ON live_evidence (tenant_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS prior_answer_embedding_hnsw
  ON prior_answer USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS prior_answer_tsv_gin ON prior_answer USING gin (tsv);
CREATE INDEX IF NOT EXISTS prior_answer_acl_gin ON prior_answer USING gin (acl_tags);
