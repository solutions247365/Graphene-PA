import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb, getDb } from './db.js';
import { encryptPassword, decryptPassword } from './crypto.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend files
app.use(express.static('.'));

// Initialize database on startup
await initDb();

/* ===== auth routes ===== */

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDb();
    const existing = await db.get('SELECT id FROM accounts WHERE email = ?', [email]);

    if (existing) {
      await db.run(
        'UPDATE accounts SET encrypted_password = ? WHERE email = ?',
        [encryptPassword(password), email]
      );
    } else {
      await db.run(
        'INSERT INTO accounts (email, encrypted_password) VALUES (?, ?)',
        [email, encryptPassword(password)]
      );
    }

    // Trigger background sync
    syncWithTutanota(email).catch(console.error);

    res.json({ success: true, email });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const { email } = req.body;
    const db = getDb();
    await db.run('DELETE FROM accounts WHERE email = ?', [email]);
    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/* ===== email routes ===== */

app.get('/api/emails', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email query parameter required' });
    }

    const db = getDb();
    const emails = await db.all(
      `SELECT id, sender, subject, body, received_at, is_read
       FROM emails
       WHERE account_email = ?
       ORDER BY received_at DESC
       LIMIT 100`,
      [email]
    );

    res.json({ emails });
  } catch (error) {
    console.error('Fetch emails error:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

/* ===== event routes ===== */

app.get('/api/events', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email query parameter required' });
    }

    const db = getDb();
    const events = await db.all(
      `SELECT id, title, description, start_time, end_time
       FROM events
       WHERE account_email = ?
       ORDER BY start_time DESC
       LIMIT 100`,
      [email]
    );

    res.json({ events });
  } catch (error) {
    console.error('Fetch events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/* ===== sync route ===== */

app.post('/api/sync', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    await syncWithTutanota(email);
    res.json({ success: true, synced: true });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

/* ===== sync logic (placeholder) ===== */

async function syncWithTutanota(email) {
  const db = getDb();

  const account = await db.get('SELECT * FROM accounts WHERE email = ?', [email]);
  if (!account) throw new Error('Account not found');

  // TODO: Integrate actual Tutanota SDK here
  // For now, this is a placeholder that will be populated with real sync logic

  console.log(`[Sync] Fetching emails and events for ${email}...`);

  // Placeholder: in production, call Tutanota API to fetch emails/events
  // Then store them in the database

  await db.run('UPDATE accounts SET synced_at = CURRENT_TIMESTAMP WHERE email = ?', [email]);

  console.log(`[Sync] Complete for ${email}`);
}

app.listen(PORT, () => {
  console.log(`Graphene PA server running on http://localhost:${PORT}`);
});
