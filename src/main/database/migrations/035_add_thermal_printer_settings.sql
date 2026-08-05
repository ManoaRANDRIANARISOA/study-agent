-- Migration 035: Add thermal printer detailed settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('thermal_printer_name', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('thermal_printer_size', '"80mm"');
