import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb, getDb } from './db.js';
import { encryptPassword, decryptPassword } from './crypto.js';
import { authenticateWithTutanota, fetchEmailsFromTutanota, fetchEventsFromTutanota, fetchMessagesFromTutanota } from './tutanota.js';
import { extractTasksFromData, createTaskFromSuggestion, createTask, updateTask, deleteTask, getTasksForEmail } from './task-extraction.js';

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

/* ===== message routes ===== */

app.get('/api/messages', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email query parameter required' });
    }

    const db = getDb();
    const messages = await db.all(
      `SELECT id, phone_number, contact_name, body, is_incoming, sent_at
       FROM messages
       WHERE account_email = ?
       ORDER BY sent_at DESC
       LIMIT 100`,
      [email]
    );

    res.json({ messages });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/* ===== task routes ===== */

app.get('/api/tasks', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email query parameter required' });
    }

    const tasks = await getTasksForEmail(email);
    res.json({ tasks });
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { email, title, description, due_date } = req.body;

    if (!email || !title) {
      return res.status(400).json({ error: 'Email and title required' });
    }

    const taskId = await createTask(email, title, description || null, due_date || null);
    res.json({ success: true, task_id: taskId });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    await updateTask(id, updates);
    res.json({ success: true });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await deleteTask(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

app.get('/api/tasks/suggestions', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email query parameter required' });
    }

    const suggestions = await extractTasksFromData(email);
    res.json({ suggestions });
  } catch (error) {
    console.error('Task extraction error:', error);
    res.status(500).json({ error: 'Failed to extract tasks' });
  }
});

app.post('/api/tasks/from-suggestion', async (req, res) => {
  try {
    const { email, suggestion } = req.body;

    if (!email || !suggestion) {
      return res.status(400).json({ error: 'Email and suggestion required' });
    }

    const taskId = await createTaskFromSuggestion(email, suggestion);
    res.json({ success: true, task_id: taskId });
  } catch (error) {
    console.error('Create task from suggestion error:', error);
    res.status(500).json({ error: 'Failed to create task' });
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

    // Fetch emails, events, and messages
    await Promise.all([
      fetchEmailsFromTutanota(email),
      fetchEventsFromTutanota(email),
      fetchMessagesFromTutanota(email),
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
