-- Shared cache table for PM2 cluster mode.
-- Used by server/src/utils/sharedCache.js to provide a MySQL-backed
-- cache that all PM2 instances can read/write consistently.
-- Replaces per-process in-memory caches for pubCache and overviewCache.

CREATE TABLE IF NOT EXISTS _shared_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  cache_data LONGTEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
