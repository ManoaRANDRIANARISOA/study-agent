-- Migration 033: Add ecole_id to all main tables for multi-tenant

-- Note: In SQLite, you can only add columns with ALTER TABLE.
-- We add 'ecole_id' as TEXT. It will be nullable for existing rows initially,
-- but the sync engine and application logic will expect it to be populated.

ALTER TABLE students ADD COLUMN ecole_id TEXT;
ALTER TABLE student_fees ADD COLUMN ecole_id TEXT;
ALTER TABLE student_payments ADD COLUMN ecole_id TEXT;
ALTER TABLE personnel ADD COLUMN ecole_id TEXT;
ALTER TABLE time_tracking ADD COLUMN ecole_id TEXT;
ALTER TABLE daily_attendance ADD COLUMN ecole_id TEXT;
ALTER TABLE personnel_absences ADD COLUMN ecole_id TEXT;
ALTER TABLE salary_advances ADD COLUMN ecole_id TEXT;
ALTER TABLE custom_deductions ADD COLUMN ecole_id TEXT;
ALTER TABLE cash_journal ADD COLUMN ecole_id TEXT;
ALTER TABLE subjects ADD COLUMN ecole_id TEXT;
ALTER TABLE grades ADD COLUMN ecole_id TEXT;
ALTER TABLE class_subjects ADD COLUMN ecole_id TEXT;
ALTER TABLE parent_events ADD COLUMN ecole_id TEXT;
ALTER TABLE event_payments ADD COLUMN ecole_id TEXT;
ALTER TABLE bus_attendance ADD COLUMN ecole_id TEXT;
ALTER TABLE canteen_attendance ADD COLUMN ecole_id TEXT;
ALTER TABLE users ADD COLUMN ecole_id TEXT;
