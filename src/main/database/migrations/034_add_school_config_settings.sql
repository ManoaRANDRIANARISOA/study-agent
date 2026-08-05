-- Migration 034: Add school configuration settings for universal CMS
INSERT OR IGNORE INTO settings (key, value) VALUES ('school_address', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('school_city', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('school_phone', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('school_email', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('school_type', '"Enseignement Général"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('director_name', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('director_title', '"Le Directeur"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('receipt_prefix', '"REC"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('primary_color', '"24 23% 57%"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('module_cantine', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('module_bus', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('module_uniforms', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('module_evaluations', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('thermal_printer_enabled', 'false');
