/* Smart task extraction from emails, SMS, and calendar */

import { getDb } from './db.js';
import crypto from 'crypto';

const ACTION_KEYWORDS = [
  'call', 'email', 'send', 'review', 'approve', 'check', 'reply', 'respond',
  'follow up', 'remind', 'schedule', 'book', 'buy', 'pay', 'confirm',
  'submit', 'upload', 'download', 'install', 'update', 'fix', 'complete',
  'finish', 'meet', 'discuss', 'clarify', 'verify', 'investigate',
];

const DATE_KEYWORDS = [
  'tomorrow', 'today', 'tonight', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'next week', 'this week',
  'asap', 'urgent', 'before', 'by', 'deadline',
];

export async function extractTasksFromData(email) {
  const db = getDb();

  const [emails, messages, events] = await Promise.all([
    db.all('SELECT * FROM emails WHERE account_email = ? ORDER BY received_at DESC LIMIT 50', [email]),
    db.all('SELECT * FROM messages WHERE account_email = ? ORDER BY sent_at DESC LIMIT 30', [email]),
    db.all('SELECT * FROM events WHERE account_email = ? AND start_time >= datetime("now") ORDER BY start_time ASC LIMIT 20', [email]),
  ]);

  const suggestions = [];

  // Extract from emails
  for (const emailMsg of emails) {
    const extracted = extractFromText(emailMsg.subject + ' ' + (emailMsg.body || ''), 'email', emailMsg.id, emailMsg.sender);
    suggestions.push(...extracted);
  }

  // Extract from SMS
  for (const sms of messages) {
    if (sms.is_incoming) {
      const extracted = extractFromText(sms.body, 'sms', sms.id, sms.contact_name);
      suggestions.push(...extracted);
    }
  }

  // Extract from calendar events
  for (const event of events) {
    suggestions.push({
      title: `Attend: ${event.title}`,
      description: event.description || '',
      due_date: event.start_time,
      source_type: 'calendar',
      source_id: event.id,
      confidence: 0.95,
      from: event.title,
    });
  }

  // Deduplicate and filter by confidence
  const unique = deduplicateSuggestions(suggestions);
  return unique.filter((s) => s.confidence >= 0.6).slice(0, 15);
}

function extractFromText(text, source, sourceId, from) {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const suggestions = [];

  // Look for sentences with action keywords
  const sentences = text.split(/[.!?]\s+/);

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();

    // Check if sentence contains action keyword
    const hasAction = ACTION_KEYWORDS.some((kw) => lowerSentence.includes(kw));
    if (!hasAction) continue;

    // Check for date keyword
    const hasDate = DATE_KEYWORDS.some((kw) => lowerSentence.includes(kw));

    // Extract task
    let title = sentence.trim().substring(0, 60);
    if (title.length > 50) title = title.substring(0, 50) + '…';

    suggestions.push({
      title: `${source === 'email' ? '📧' : '💬'} ${title}`,
      description: `From ${from}: "${sentence.trim().substring(0, 100)}"`,
      due_date: hasDate ? estimateDueDate(sentence) : null,
      source_type: source,
      source_id: sourceId,
      confidence: hasDate ? 0.8 : 0.65,
      from,
    });
  }

  return suggestions;
}

function estimateDueDate(text) {
  const now = new Date();
  const lower = text.toLowerCase();

  if (lower.includes('today')) return now.toISOString();
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString();
  }
  if (lower.includes('this week')) {
    const friday = new Date(now);
    friday.setDate(friday.getDate() + (5 - friday.getDay()));
    return friday.toISOString();
  }
  if (lower.includes('next week')) {
    const nextMonday = new Date(now);
    nextMonday.setDate(nextMonday.getDate() + (8 - nextMonday.getDay()));
    return nextMonday.toISOString();
  }

  // Try to extract a date like "Friday" or "Monday"
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < dayNames.length; i++) {
    if (lower.includes(dayNames[i])) {
      const targetDate = new Date(now);
      const currentDay = now.getDay();
      let daysAhead = i - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      targetDate.setDate(targetDate.getDate() + daysAhead);
      return targetDate.toISOString();
    }
  }

  return null;
}

function deduplicateSuggestions(suggestions) {
  const seen = new Set();
  const unique = [];

  for (const suggestion of suggestions) {
    const key = suggestion.title.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(suggestion);
    }
  }

  return unique;
}

export async function createTaskFromSuggestion(email, suggestion) {
  const db = getDb();
  const taskId = crypto.randomUUID();

  await db.run(
    `INSERT INTO tasks (id, account_email, title, description, due_date, source_type, source_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [taskId, email, suggestion.title, suggestion.description, suggestion.due_date, suggestion.source_type, suggestion.source_id]
  );

  return taskId;
}

export async function createTask(email, title, description, dueDate) {
  const db = getDb();
  const taskId = crypto.randomUUID();

  await db.run(
    `INSERT INTO tasks (id, account_email, title, description, due_date)
     VALUES (?, ?, ?, ?, ?)`,
    [taskId, email, title, description, dueDate || null]
  );

  return taskId;
}

export async function updateTask(taskId, updates) {
  const db = getDb();

  const setClauses = [];
  const values = [];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }
  if (updates.due_date !== undefined) {
    setClauses.push('due_date = ?');
    values.push(updates.due_date);
  }
  if (updates.is_completed !== undefined) {
    setClauses.push('is_completed = ?');
    values.push(updates.is_completed ? 1 : 0);
  }

  if (setClauses.length === 0) return;

  values.push(taskId);
  await db.run(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`, values);
}

export async function deleteTask(taskId) {
  const db = getDb();
  await db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
}

export async function getTasksForEmail(email) {
  const db = getDb();
  return db.all(
    `SELECT * FROM tasks WHERE account_email = ? ORDER BY
     is_completed ASC,
     CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
     due_date ASC`,
    [email]
  );
}
