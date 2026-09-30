-- ============================================================================
-- Migration 040: Add cash closures table (Avenant N°3), print tracking and performance indexes
-- Multi-tenant universal implementation for Study Agent
-- ============================================================================

-- 1. Table cash_closures multi-tenant pour le Ticket Z et le Billetage
CREATE TABLE IF NOT EXISTS cash_closures (
    id TEXT PRIMARY KEY,
    ecole_id TEXT NOT NULL,
    closure_date DATE NOT NULL,
    closure_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
    cashier_username TEXT NOT NULL,
    station_code TEXT NOT NULL DEFAULT 'C1',
    total_tickets INTEGER NOT NULL DEFAULT 0,
    expected_cash REAL NOT NULL DEFAULT 0,
    expected_check REAL NOT NULL DEFAULT 0,
    expected_mobile REAL NOT NULL DEFAULT 0,
    expected_transfer REAL NOT NULL DEFAULT 0,
    expected_total REAL NOT NULL DEFAULT 0,
    counted_cash REAL NOT NULL DEFAULT 0,
    counted_breakdown TEXT,
    cash_difference REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'closed',
    notes TEXT,
    is_locked INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT DEFAULT 'pending',
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cash_closures_ecole ON cash_closures(ecole_id);
CREATE INDEX IF NOT EXISTS idx_cash_closures_date ON cash_closures(closure_date);
CREATE INDEX IF NOT EXISTS idx_cash_closures_cashier ON cash_closures(cashier_username);
CREATE INDEX IF NOT EXISTS idx_cash_closures_station ON cash_closures(station_code);
CREATE INDEX IF NOT EXISTS idx_cash_closures_ecole_date ON cash_closures(ecole_id, closure_date, cashier_username);

-- 2. Colonnes de suivi d'impression et liaisons pour cash_journal
ALTER TABLE cash_journal ADD COLUMN print_count INTEGER DEFAULT 0;
ALTER TABLE cash_journal ADD COLUMN last_printed_at DATETIME;
ALTER TABLE cash_journal ADD COLUMN last_printed_by TEXT;
ALTER TABLE cash_journal ADD COLUMN related_payment_id TEXT;
ALTER TABLE cash_journal ADD COLUMN created_by TEXT;
ALTER TABLE cash_journal ADD COLUMN receipt_number TEXT;

-- 3. Tarif dérogatoire bus sur student_fees
ALTER TABLE student_fees ADD COLUMN bus_monthly_fee REAL;

-- 4. Suivi et résilience de la file de synchronisation
ALTER TABLE sync_queue ADD COLUMN updated_at DATETIME;

-- 5. Index ciblés de haute performance pour le grand livre et les paiements
CREATE INDEX IF NOT EXISTS idx_cash_journal_ecole ON cash_journal(ecole_id);
CREATE INDEX IF NOT EXISTS idx_cash_journal_deleted ON cash_journal(deleted);
CREATE INDEX IF NOT EXISTS idx_cash_journal_created_by ON cash_journal(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_journal_related_payment ON cash_journal(related_payment_id);
CREATE INDEX IF NOT EXISTS idx_cash_journal_receipt ON cash_journal(receipt_number);

CREATE INDEX IF NOT EXISTS idx_student_payments_ecole ON student_payments(ecole_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_deleted ON student_payments(deleted);
CREATE INDEX IF NOT EXISTS idx_student_payments_created_by ON student_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_student_payments_receipt ON student_payments(receipt_number);
CREATE INDEX IF NOT EXISTS idx_student_payments_composite ON student_payments(student_id, payment_date, deleted);

CREATE INDEX IF NOT EXISTS idx_students_deleted ON students(deleted);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry ON sync_queue(status, retry_count);
