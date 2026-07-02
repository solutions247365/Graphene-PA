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

  // Migrate existing tables if needed
  const tables = await db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'`);
  if (tables.length > 0) {
    const columns = await db.all(`PRAGMA table_info(tasks)`);
    const hasRecurringId = columns.some(col => col.name === 'recurring_task_id');
    if (!hasRecurringId) {
      await db.exec(`ALTER TABLE tasks ADD COLUMN recurring_task_id TEXT`);
    }
  }

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

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      phone_number TEXT,
      contact_name TEXT,
      body TEXT,
      is_incoming BOOLEAN DEFAULT 1,
      sent_at DATETIME,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_email) REFERENCES accounts(email)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATETIME,
      is_completed BOOLEAN DEFAULT 0,
      source_type TEXT,
      source_id TEXT,
      recurring_task_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_email) REFERENCES accounts(email),
      FOREIGN KEY (recurring_task_id) REFERENCES recurring_tasks(id)
    );

    CREATE TABLE IF NOT EXISTS recurring_tasks (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      recurrence_type TEXT NOT NULL,
      recurrence_data TEXT,
      start_date DATETIME NOT NULL,
      end_date DATETIME,
      next_due_date DATETIME,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_email) REFERENCES accounts(email)
    );

    CREATE TABLE IF NOT EXISTS task_templates (
      id TEXT PRIMARY KEY,
      account_email TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date_offset INTEGER,
      is_recurring BOOLEAN DEFAULT 0,
      recurrence_type TEXT,
      recurrence_data TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_email) REFERENCES accounts(email)
    );

    CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_email);
    CREATE INDEX IF NOT EXISTS idx_events_account ON events(account_email);
    CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_email);
    CREATE INDEX IF NOT EXISTS idx_tasks_account ON tasks(account_email);
    CREATE INDEX IF NOT EXISTS idx_recurring_tasks_account ON recurring_tasks(account_email);
    CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(recurring_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_templates_account ON task_templates(account_email);
  `);

  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}
