-- Migration 039: Table de séquences pour les numéros de reçus et traçabilité des duplicatas
-- Format standard : REC-[CODE_ECOLE]-[AAAA]-[XXXXX]

-- 1. Création de la table de séquences de reçus multi-tenant
CREATE TABLE IF NOT EXISTS receipt_sequences (
    id TEXT PRIMARY KEY,
    ecole_id TEXT NOT NULL,
    school_year TEXT NOT NULL,
    prefix TEXT NOT NULL DEFAULT 'REC',
    last_sequence INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ecole_id, school_year, prefix)
);

CREATE INDEX IF NOT EXISTS idx_receipt_seq_lookup 
ON receipt_sequences(ecole_id, school_year, prefix);

-- 2. Ajout des colonnes de traçabilité des impressions sur student_payments
-- (géré avec vérification dans db.ts ou ALTER silencieux)
-- Note: les colonnes print_count, last_printed_at, last_printed_by
