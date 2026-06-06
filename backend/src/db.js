const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/safebackup.db';

// Ensure the directory exists
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_model TEXT,
      device_os TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      backup_date TEXT NOT NULL,
      size_bytes INTEGER DEFAULT 0,
      file_count INTEGER DEFAULT 0,
      destination_type TEXT NOT NULL CHECK(destination_type IN ('sd_card', 'usb', 'cloud', 'local')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backup_files (
      id TEXT PRIMARY KEY,
      backup_id TEXT NOT NULL,
      original_path TEXT,
      file_name TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      file_type TEXT,
      storage_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (backup_id) REFERENCES backups(id) ON DELETE CASCADE
    );
  `);

  console.log('Database initialized successfully.');
}

module.exports = { db, initDb };
