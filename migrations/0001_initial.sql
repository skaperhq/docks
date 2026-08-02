CREATE SCHEMA IF NOT EXISTS skaper;

CREATE TABLE IF NOT EXISTS skaper.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skaper.workspaces (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skaper.workspace_credentials (
  workspace_id text PRIMARY KEY REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  password_salt bytea NOT NULL,
  password_hash bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skaper.workspace_sessions (
  workspace_id text NOT NULL REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, token_hash)
);

CREATE INDEX IF NOT EXISTS workspace_sessions_expires_at_idx
  ON skaper.workspace_sessions (expires_at);

CREATE TABLE IF NOT EXISTS skaper.environments (
  workspace_id text NOT NULL REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  base_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS skaper.environment_variables (
  workspace_id text NOT NULL,
  environment_id text NOT NULL,
  id text NOT NULL,
  key text NOT NULL,
  value text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  is_secret boolean NOT NULL DEFAULT false,
  description text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, environment_id, id),
  FOREIGN KEY (workspace_id, environment_id)
    REFERENCES skaper.environments(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skaper.request_tabs (
  workspace_id text NOT NULL REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  request_tab text NOT NULL,
  draft jsonb NOT NULL,
  position integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, operation_id)
);

CREATE TABLE IF NOT EXISTS skaper.workspace_settings (
  workspace_id text NOT NULL REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, key)
);

CREATE TABLE IF NOT EXISTS skaper.saved_responses (
  workspace_id text NOT NULL REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  operation_id text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  name text NOT NULL,
  status integer NOT NULL,
  ok boolean NOT NULL,
  duration_ms double precision NOT NULL,
  size_bytes integer NOT NULL,
  content_type text NOT NULL DEFAULT '',
  request_snapshot jsonb,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS saved_responses_workspace_created_at_idx
  ON skaper.saved_responses (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS skaper.collections (
  workspace_id text NOT NULL REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS skaper.custom_requests (
  workspace_id text NOT NULL REFERENCES skaper.workspaces(id) ON DELETE CASCADE,
  id text NOT NULL,
  collection_id text NOT NULL,
  name text NOT NULL,
  method text NOT NULL,
  transport text NOT NULL,
  mode text NOT NULL,
  url text NOT NULL,
  draft jsonb NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS custom_requests_workspace_collection_idx
  ON skaper.custom_requests (workspace_id, collection_id, position);
