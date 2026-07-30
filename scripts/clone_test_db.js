const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const lmsDbPath = path.join(__dirname, '../../lms/database.sqlite'); // Base de l'ancien projet LMS
const studyAgentDbPath = path.join(__dirname, '../study_agent.db');

if (!fs.existsSync(lmsDbPath)) {
  console.error("Base de données LMS source introuvable :", lmsDbPath);
  process.exit(1);
}

// Pour éviter d'écraser si on a déjà des choses importantes
if (fs.existsSync(studyAgentDbPath)) {
  console.log("Attention: study_agent.db existe déjà. Création d'une sauvegarde...");
  fs.copyFileSync(studyAgentDbPath, studyAgentDbPath + '.bak');
}

// On copie physiquement le fichier
console.log("Clonage de la base de données...");
fs.copyFileSync(lmsDbPath, studyAgentDbPath);

// On va juste appliquer l'ecole_id de test sur la base clonée
const db = new Database(studyAgentDbPath);

// Configurer l'école par défaut pour contourner l'Onboarding
const DEFAULT_ECOLE_ID = 'ecole-principale-001';
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('ecole_id', JSON.stringify(DEFAULT_ECOLE_ID));

console.log(`Base copiée. Instance par défaut configurée avec l'ID: ${DEFAULT_ECOLE_ID}`);
console.log("NB : Les migrations 032 et 033 s'appliqueront automatiquement au prochain démarrage de l'app Electron sur study_agent.db.");

db.close();
console.log("Clonage terminé !");
