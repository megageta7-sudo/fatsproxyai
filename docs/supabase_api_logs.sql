-- ================================================================
-- Supabase Schema: API Telemetry, Requests, and Attempts
-- ================================================================

-- 1. Tabel Utama: api_requests (Level Permintaan Masuk)
CREATE TABLE IF NOT EXISTS api_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INT NOT NULL,
    total_latency_ms INT NOT NULL,
    final_provider VARCHAR(50),
    final_model VARCHAR(100),
    final_key_id VARCHAR(100),
    final_key_preview VARCHAR(50),
    attempts_count INT DEFAULT 1,
    client_ip VARCHAR(50),
    user_email VARCHAR(150),
    error_code VARCHAR(50),
    error_message TEXT
);

-- 2. Tabel Rincian: api_attempts (Level Percobaan Rotasi / Fallback)
CREATE TABLE IF NOT EXISTS api_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id VARCHAR(100) NOT NULL REFERENCES api_requests(request_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    attempt_number INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    key_id VARCHAR(100) NOT NULL,
    key_preview VARCHAR(50),
    key_hash VARCHAR(64),
    status_code INT,
    error_code VARCHAR(50),
    latency_ms INT NOT NULL,
    error_message TEXT,
    is_success BOOLEAN DEFAULT false
);

-- 3. Indeks Performa & Analitik Cepat
CREATE INDEX IF NOT EXISTS idx_api_requests_created_at ON api_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_requests_provider ON api_requests (final_provider);
CREATE INDEX IF NOT EXISTS idx_api_requests_status ON api_requests (status_code);
CREATE INDEX IF NOT EXISTS idx_api_requests_req_id ON api_requests (request_id);

CREATE INDEX IF NOT EXISTS idx_api_attempts_req_id ON api_attempts (request_id);
CREATE INDEX IF NOT EXISTS idx_api_attempts_key_id ON api_attempts (key_id);
CREATE INDEX IF NOT EXISTS idx_api_attempts_created_at ON api_attempts (created_at DESC);
