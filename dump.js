const fs = require('fs');
const db = require('better-sqlite3')('study_agent.db');
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
fs.writeFileSync('schema.json', JSON.stringify(tables, null, 2), 'utf8');
process.exit(0);
