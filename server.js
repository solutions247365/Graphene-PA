import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb, getDb } from './db.js';
import { encryptPassword, decryptPassword } from './crypto.js';
import { authenticateWithTutanota, fetchEmailsFromTutanota, fetchEventsFromTutanota } from './tutanota.js';

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

    // Trigger background sync (don't wait for it)
    syncWithTutanota(email, password)
      .then(() => console.log(`[Login] Sync completed for ${email}`))
      .catch((err) => console.error(`[Login] Sync failed for ${email}:`, err.message));

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
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const db = getDb();
    const account = await db.get('SELECT encrypted_password FROM accounts WHERE email = ?', [email]);

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const decryptedPassword = password || decryptPassword(account.encrypted_password);

    await syncWithTutanota(email, decryptedPassword);
    res.json({ success: true, synced: true });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

/* ===== sync logic ===== */

async function syncWithTutanota(email, password) {
  const db = getDb();

  const account = await db.get('SELECT * FROM accounts WHERE email = ?', [email]);
  if (!account) throw new Error('Account not found');

  try {
    // Authenticate with Tutanota
    await authenticateWithTutanota(email, password);

    // Fetch emails and events
    await Promise.all([
      fetchEmailsFromTutanota(email),
      fetchEventsFromTutanota(email),
    ]);

    // Update sync timestamp
    await db.run('UPDATE accounts SET synced_at = CURRENT_TIMESTAMP WHERE email = ?', [email]);

    console.log(`[Sync] Complete for ${email}`);
  } catch (error) {
    console.error(`[Sync] Error for ${email}:`, error.message);
    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Graphene PA server running on http://localhost:${PORT}`);
});
