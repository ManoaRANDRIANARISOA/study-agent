import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

// We need the postgres connection string, usually constructed from the Supabase URL and db password
// e.g. postgres://postgres.[project-ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("ERREUR: Veuillez définir SUPABASE_DB_URL dans votre fichier .env");
  console.error("Exemple: postgres://postgres.[project-ref]:[mot-de-passe]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
  process.exit(1);
}

const tenantName = process.argv[2];

if (!tenantName) {
  console.error("ERREUR: Veuillez spécifier le nom de l'établissement.");
  console.error("Exemple: npm run add-client ecole_oio");
  process.exit(1);
}

// Ensure schema name is valid (lowercase, no spaces)
const schemaName = tenantName.toLowerCase().replace(/[^a-z0-9_]/g, '_');

console.log(`Création du locataire (Tenant) pour le schéma : ${schemaName}...`);

const sql = postgres(dbUrl, { max: 1 });

async function createTenant() {
  try {
    // 1. Create Schema
    console.log(`> Création du schéma ${schemaName}...`);
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    
    // Set the search path to our new schema so all subsequent CREATE tables go there
    await sql.unsafe(`SET search_path TO "${schemaName}"`);
    console.log(`> Schéma défini par défaut pour cette session.`);

    // 2. Read and apply all migrations
    // @ts-ignore - CommonJS __dirname workaround if running in ESM
    const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.join(currentDir, '../src/main/database/migrations');
    
    if (!fs.existsSync(migrationsDir)) {
        console.error("Le dossier de migrations est introuvable :", migrationsDir);
        process.exit(1);
    }
    
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
      console.log(`> Application de la migration: ${file}`);
      let sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      
      // Convert SQLite dialect to PostgreSQL dialect
      sqlContent = sqlContent.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
      sqlContent = sqlContent.replace(/DATETIME/gi, 'TIMESTAMP');
      sqlContent = sqlContent.replace(/BOOLEAN DEFAULT 0/gi, 'BOOLEAN DEFAULT FALSE');
      sqlContent = sqlContent.replace(/BOOLEAN DEFAULT 1/gi, 'BOOLEAN DEFAULT TRUE');
      
      // PostgreSQL doesn't like double quotes for strings, but sqlite files might use them occasionally
      // (Usually sqlite uses single quotes for strings, which is standard SQL and works in PG).
      
      // Split by statements if necessary, but sql.unsafe can run multiple statements usually
      await sql.unsafe(sqlContent);
    }
    
    console.log(`✅ Succès ! Le schéma ${schemaName} a été créé avec toutes les tables standards.`);
    console.log(`\n====================================================================`);
    console.log(`⚠️  ACTION MANUELLE REQUISE DANS SUPABASE ⚠️`);
    console.log(`1. Allez dans votre Dashboard Supabase -> Settings -> API`);
    console.log(`2. Cherchez la section "Exposed schemas"`);
    console.log(`3. Ajoutez "${schemaName}" à la liste des schémas exposés.`);
    console.log(`====================================================================\n`);
    
  } catch (err) {
    console.error("❌ Erreur lors de la création du tenant :", err);
  } finally {
    await sql.end();
  }
}

createTenant();
