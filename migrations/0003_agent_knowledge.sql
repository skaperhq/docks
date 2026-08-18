ALTER TABLE skaper.workspaces
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS skaper.api_sources (
  workspace_id text PRIMARY KEY REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  document_hash text NOT NULL,
  document jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
