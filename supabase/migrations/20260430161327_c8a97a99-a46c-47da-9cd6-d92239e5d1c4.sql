-- Lock down the backup table created by DEC-005. Only service_role/postgres
-- can read it directly; PostgREST exposes nothing because there are no policies.
ALTER TABLE public._archive_org_70aa944f ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public._archive_org_70aa944f IS 'Sprint 1 / DEC-005 — snapshot defensivo da org 70aa944f antes do arquivamento. Acesso restrito ao service_role (sem policies).';