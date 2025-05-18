CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('frontend', 'backend')),
    level VARCHAR(10) DEFAULT 'info',
    message TEXT NOT NULL,
    request_id VARCHAR(100),
    project_id VARCHAR(100),
    deployment_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_logs_timestamp ON logs(timestamp DESC);
CREATE INDEX idx_logs_source ON logs(source);
CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_request_id ON logs(request_id);
CREATE INDEX idx_logs_message_gin ON logs USING gin(to_tsvector('english', message));

-- Clean up old logs function (optional - not used by default)
-- This function exists but is NOT automatically called
-- To enable auto-cleanup, you would need to create a cron job or pg_cron trigger
CREATE OR REPLACE FUNCTION cleanup_old_logs() RETURNS void AS $$
BEGIN
    DELETE FROM logs WHERE timestamp < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- NOTE: Log retention is UNLIMITED by default
-- The cleanup function above is provided but NOT automatically executed