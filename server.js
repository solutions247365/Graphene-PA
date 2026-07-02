import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
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

/* ===== recurring task routes ===== */

app.get('/api/recurring-tasks', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email query parameter required' });
    }

    const db = getDb();
    const recurringTasks = await db.all(
      `SELECT id, title, description, recurrence_type, recurrence_data, start_date, end_date, next_due_date, is_active
       FROM recurring_tasks
       WHERE account_email = ? AND is_active = 1
       ORDER BY next_due_date ASC`,
      [email]
    );

    res.json({ recurring_tasks: recurringTasks });
  } catch (error) {
    console.error('Fetch recurring tasks error:', error);
    res.status(500).json({ error: 'Failed to fetch recurring tasks' });
  }
});

app.post('/api/recurring-tasks', async (req, res) => {
  try {
    const { email, title, description, recurrence_type, recurrence_data, start_date, end_date } = req.body;

    if (!email || !title || !recurrence_type || !start_date) {
      return res.status(400).json({ error: 'Email, title, recurrence type, and start date required' });
    }

    const db = getDb();
    const taskId = crypto.randomUUID();
    const nextDueDate = calculateNextDueDate(start_date, recurrence_type, recurrence_data);

    await db.run(
      `INSERT INTO recurring_tasks (id, account_email, title, description, recurrence_type, recurrence_data, start_date, end_date, next_due_date, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [taskId, email, title, description || null, recurrence_type, JSON.stringify(recurrence_data || {}), start_date, end_date || null, nextDueDate]
    );

    res.json({ success: true, recurring_task_id: taskId });
  } catch (error) {
    console.error('Create recurring task error:', error);
    res.status(500).json({ error: 'Failed to create recurring task' });
  }
});

app.put('/api/recurring-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const db = getDb();
    const fieldsToUpdate = [];
    const values = [];

    if (updates.title !== undefined) {
      fieldsToUpdate.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fieldsToUpdate.push('description = ?');
      values.push(updates.description);
    }
    if (updates.is_active !== undefined) {
      fieldsToUpdate.push('is_active = ?');
      values.push(updates.is_active ? 1 : 0);
    }

    if (fieldsToUpdate.length > 0) {
      values.push(id);
      await db.run(
        `UPDATE recurring_tasks SET ${fieldsToUpdate.join(', ')} WHERE id = ?`,
        values
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update recurring task error:', error);
    res.status(500).json({ error: 'Failed to update recurring task' });
  }
});

app.delete('/api/recurring-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // Mark as inactive instead of deleting
    await db.run('UPDATE recurring_tasks SET is_active = 0 WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete recurring task error:', error);
    res.status(500).json({ error: 'Failed to delete recurring task' });
  }
});

/* ===== recurring task helpers ===== */

function calculateNextDueDate(startDate, recurrenceType, recurrenceData = {}) {
  const today = new Date().toISOString().split('T')[0];

  // Parse dates as YYYY-MM-DD for comparison
  const startStr = startDate.split('T')[0];

  if (recurrenceType === 'daily') {
    // If start is today or earlier, next instance is today
    if (startStr <= today) {
      return today;
    }
    return startStr;
  }

  if (recurrenceType === 'weekly') {
    // If start is today or earlier, next instance is today (weekly means same day each week)
    if (startStr <= today) {
      return today;
    }
    return startStr;
  }

  if (recurrenceType === 'monthly') {
    // If start is today or earlier, next instance is today (monthly means same date each month)
    if (startStr <= today) {
      return today;
    }
    return startStr;
  }

  return startDate;
}

async function generateRecurringTaskInstances() {
  const db = getDb();
  const recurringTasks = await db.all(
    `SELECT id, account_email, title, description, recurrence_type, recurrence_data, next_due_date, end_date, is_active
     FROM recurring_tasks
     WHERE is_active = 1 AND next_due_date <= DATE('now')`
  );

  for (const rt of recurringTasks) {
    // Create a task instance
    const taskId = crypto.randomUUID();
    await db.run(
      `INSERT INTO tasks (id, account_email, title, description, due_date, recurring_task_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [taskId, rt.account_email, rt.title, rt.description, rt.next_due_date, rt.id]
    );

    // Calculate next due date
    const nextDue = calculateNextDueDate(rt.next_due_date, rt.recurrence_type, JSON.parse(rt.recurrence_data || '{}'));
    const endDate = rt.end_date ? new Date(rt.end_date) : null;
    const nextDueDate = new Date(nextDue);

    // Check if past end date
    if (endDate && nextDueDate > endDate) {
      await db.run('UPDATE recurring_tasks SET is_active = 0 WHERE id = ?', [rt.id]);
    } else {
      await db.run('UPDATE recurring_tasks SET next_due_date = ? WHERE id = ?', [nextDue, rt.id]);
    }
  }
}

/* ===== SMS sync from Android (native) ===== */

app.post('/api/sms/sync', async (req, res) => {
  try {
    const { email, messages } = req.body;

    if (!email || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Email and messages array required' });
    }

    const db = getDb();

    // Clear old messages and insert new ones
    await db.run('DELETE FROM messages WHERE account_email = ?', [email]);

    for (const msg of messages) {
      await db.run(
        `INSERT INTO messages
         (id, account_email, phone_number, contact_name, body, is_incoming, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [msg.id, email, msg.phone_number, msg.contact_name, msg.body, msg.is_incoming, msg.sent_at]
      );
    }

    console.log(`[SMS Sync] Synced ${messages.length} messages for ${email}`);
    res.json({ success: true, count: messages.length });
  } catch (error) {
    console.error('SMS sync error:', error);
    res.status(500).json({ error: 'Failed to sync SMS' });
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

// Periodic task generation for recurring tasks
setInterval(async () => {
  try {
    await generateRecurringTaskInstances();
  } catch (error) {
    console.error('Error generating recurring task instances:', error);
  }
}, 60 * 60 * 1000); // Check every hour

// Generate on startup
await generateRecurringTaskInstances();

app.listen(PORT, () => {
  console.log(`Graphene PA server running on http://localhost:${PORT}`);
});
