-- ============================================================
-- Script de migration vers le multi-tenant pour Study Agent
-- À exécuter dans le SQL Editor de Supabase
-- ============================================================

-- 1. Création de la table des écoles (Tenants)
DROP TABLE IF EXISTS ecoles CASCADE;
CREATE TABLE IF NOT EXISTS ecoles (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nom text NOT NULL,
  parametrage jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ecoles ENABLE ROW LEVEL SECURITY;

-- 2. Fonction utilitaire pour récupérer l'ecole_id du compte actuellement connecté
-- NB : Cela implique que vous utilisiez auth.jwt() -> 'user_metadata' -> 'ecole_id'
-- Ou que vous ajoutiez une table profils_utilisateurs comme spécifié dans le CDC.
DROP FUNCTION IF EXISTS auth_ecole_id();

CREATE OR REPLACE FUNCTION auth_ecole_id()
RETURNS text
LANGUAGE sql STABLE
AS $$
  -- Si 'ecole_id' est stocké dans les app_metadata ou user_metadata de Supabase Auth
  SELECT nullif(current_setting('request.jwt.claim.app_metadata', true)::jsonb->>'ecole_id', '')::text;
  -- Alternative avec table utilisateurs : select ecole_id from profils_utilisateurs where id = auth.uid()
$$;

-- 3. Ajout de la colonne ecole_id sur toutes les tables métiers existantes
DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY[
    'students', 'student_fees', 'student_payments', 'personnel', 'time_tracking',
    'daily_attendance', 'personnel_absences', 'salary_advances', 'custom_deductions',
    'cash_journal', 'subjects', 'grades', 'class_subjects', 'parent_events',
    'event_payments', 'bus_attendance', 'canteen_attendance'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ADD COLUMN IF NOT EXISTS ecole_id text REFERENCES ecoles(id);', t);
  END LOOP;
END $$;

-- 4. Activation du Row Level Security sur toutes les tables métier
DO $$ 
DECLARE 
  t text;
  tables text[] := ARRAY[
    'students', 'student_fees', 'student_payments', 'personnel', 'time_tracking',
    'daily_attendance', 'personnel_absences', 'salary_advances', 'custom_deductions',
    'cash_journal', 'subjects', 'grades', 'class_subjects', 'parent_events',
    'event_payments', 'bus_attendance', 'canteen_attendance'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY;', t);
    
    -- Suppression de la politique si elle existe déjà pour éviter l'erreur "already exists"
    EXECUTE format('DROP POLICY IF EXISTS "isolation_ecole_%I" ON %I;', t, t);
    
    -- Création de la politique d'isolation
    EXECUTE format('CREATE POLICY "isolation_ecole_%I" ON %I FOR ALL USING (ecole_id = auth_ecole_id()) WITH CHECK (ecole_id = auth_ecole_id());', t, t);
  END LOOP;
END $$;

-- 5. Insertion de l'école par défaut (LMS - Migration)
-- Optionnel : Si vous souhaitez conserver les données actuelles sous un premier tenant.
-- INSERT INTO ecoles (nom, parametrage) VALUES ('Lycée Manjary Soa', '{}') RETURNING id;
-- UPDATE students SET ecole_id = (SELECT id FROM ecoles LIMIT 1) WHERE ecole_id IS NULL;
-- ... etc pour toutes les tables.

