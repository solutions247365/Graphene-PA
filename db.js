import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db = null;

export async function initDb() {
  if (db) return db;

  db = await open({
    filename: path.join(__dirname, 'graphene.db'),
    driver: sqlite3.Database,
  });

  await db.exec('PRAGMA journal_mode = WAL');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      encrypted_password TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      synced_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      sender TEXT,
      subject TEXT,
      body TEXT,
      received_at DATETIME,
      is_read BOOLEAN DEFAULT 0,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_email) REFERENCES accounts(email)
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      title TEXT,
      description TEXT,
      start_time DATETIME,
      end_time DATETIME,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_email) REFERENCES accounts(email)
    );

    CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_email);
    CREATE INDEX IF NOT EXISTS idx_events_account ON events(account_email);
  `);

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}
