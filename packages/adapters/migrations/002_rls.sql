-- 002_rls.sql — row-level security on EVERY tenant-scoped table
-- docs/07-security-threat-model.md §4 layer 4, docs/06-data-model.md §3.2.
--
-- The first draft enabled RLS on `chunk` only, leaving `document`, `document_version`,
-- `live_evidence` and the searchable `prior_answer` unprotected. `prior_answer` is
-- reachable by a tool and carries tenant and ACL fields, so that gap mattered.
--
-- RLS is DEFENCE IN DEPTH. The primary control is the in-query predicate applied by the
-- data-access layer. This catches the query that forgets it.
--
-- FORCE is required as well as ENABLE: without FORCE, the table owner bypasses the
-- policy, and the application role is frequently the owner in a single-database setup.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'document', 'document_version', 'chunk', 'live_evidence', 'prior_answer'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = current_setting(''attest.tenant_id'', true))',
      t || '_tenant_isolation', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Guard: every table carrying a tenant_id must have RLS enabled AND forced.
-- A new tenant-scoped table cannot silently opt out — this view is asserted by
-- scripts/ci/check-rls-coverage.mjs and by the isolation test suite.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW rls_coverage AS
SELECT
  c.relname::text                AS table_name,
  c.relrowsecurity               AS rls_enabled,
  c.relforcerowsecurity          AS rls_forced,
  (c.relrowsecurity AND c.relforcerowsecurity) AS compliant
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND a.attnum > 0 AND NOT a.attisdropped
  );
