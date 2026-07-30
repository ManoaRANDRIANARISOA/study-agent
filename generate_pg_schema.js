const fs = require('fs');

const sqliteSchema = JSON.parse(fs.readFileSync('schema.json', 'utf8'));

let pgSchema = `-- AUTOMATICALLY GENERATED POSTGRES SCHEMA FROM SQLITE\n\n`;

for (const table of sqliteSchema) {
  if (['migrations', 'sqlite_sequence', 'sessions', 'sync_queue', 'audit_logs'].includes(table.name)) {
    continue; // Don't sync these
  }

  let sql = table.sql;
  
  // Drop table if exists
  pgSchema += `DROP TABLE IF EXISTS ${table.name} CASCADE;\n\n`;

  // Replace types and keywords
  sql = sql.replace(/DATETIME/g, 'timestamptz');
  sql = sql.replace(/CURRENT_TIMESTAMP/g, 'now()');
  sql = sql.replace(/REAL/g, 'numeric');
  sql = sql.replace(/BOOLEAN DEFAULT 0/g, 'boolean DEFAULT false');
  sql = sql.replace(/BOOLEAN DEFAULT 1/g, 'boolean DEFAULT true');
  
  pgSchema += sql + ';\n\n';
  
  // Add RLS
  pgSchema += `ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;\n\n`;
}

// Add the JWT function
pgSchema += `
-- Fonction utilitaire pour récupérer l'ecole_id du token JWT
DROP FUNCTION IF EXISTS auth_ecole_id();

CREATE OR REPLACE FUNCTION auth_ecole_id()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT current_setting('request.jwt.claim.app_metadata', true)::jsonb->>'ecole_id';
$$;
`;

fs.writeFileSync('scripts/supabase_full_schema.sql', pgSchema);
console.log('Done generating supabase_full_schema.sql');
process.exit(0);
