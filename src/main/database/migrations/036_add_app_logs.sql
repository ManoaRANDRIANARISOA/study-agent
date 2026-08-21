-- ============================================
-- APP LOGS (Multi-tenant)
-- ============================================

CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT,                       -- Nullable for global/system errors
    level TEXT NOT NULL,                  -- 'info', 'warn', 'error'
    context TEXT,                         -- 'sync', 'database', 'ipc', etc.
    message TEXT NOT NULL,
    details TEXT,                         -- JSON string of error details, stack trace, or payload
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT 0,
    FOREIGN KEY(tenant_id) REFERENCES ecoles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_logs_tenant_id ON app_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
CREATE INDEX IF NOT EXISTS idx_app_logs_context ON app_logs(context);
CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at);
