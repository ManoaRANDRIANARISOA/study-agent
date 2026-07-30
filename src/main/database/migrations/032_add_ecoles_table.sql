-- Migration 032: Add ecoles table for multi-tenant (SaaS)

CREATE TABLE IF NOT EXISTS ecoles (
  id TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  parametrage TEXT, -- JSON configuration (canteen, bus, cnaps_rate, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
