/* Tutanota API integration */

import { getDb } from './db.js';

const TUTANOTA_API_BASE = 'https://mail.tutanota.com';

// Tutanota auth token (obtained during login)
let authToken = null;
let userId = null;

export async function authenticateWithTutanota(email, password) {
  try {
    // NOTE: Tutanota doesn't expose a public REST API for third-party apps.
    // This integration requires either:
    // 1. Using the official tutanota npm package (complex, requires deep crypto knowledge)
    // 2. Implementing OAuth (if Tutanota supports it)
    // 3. Using unofficial reverse-engineered endpoints (not recommended for production)

    // Placeholder: In production, implement actual Tutanota authentication
    // For now, we'll store the credentials securely and fetch mock data

    console.log(`[Tutanota] Authenticating ${email}...`);

    // Simulate successful authentication
    authToken = Buffer.from(`${email}:${password}`).toString('base64');
    userId = email.split('@')[0];

    return {
      authenticated: true,
      email,
      userId,
    };
  } catch (error) {
    console.error('[Tutanota] Authentication failed:', error);
    throw new Error('Tutanota authentication failed');
  }
}

export async function fetchEmailsFromTutanota(email) {
  if (!authToken) {
    throw new Error('Not authenticated with Tutanota');
  }

  try {
    console.log(`[Tutanota] Fetching emails for ${email}...`);

    // In production, call actual Tutanota API here
    // const response = await fetch(`${TUTANOTA_API_BASE}/rest/tutanota/mail`, {
    //   headers: { 'Authorization': `Bearer ${authToken}` }
    // });

    // For now, generate mock emails for testing
    const emails = generateMockEmails(email, 50);

    // Store in database
    const db = getDb();
    for (const email of emails) {
      await db.run(
        `INSERT OR REPLACE INTO emails
         (id, account_email, sender, subject, body, received_at, is_read)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          email.id,
          email.account_email,
          email.sender,
          email.subject,
          email.body,
          email.received_at,
          email.is_read,
        ]
      );
    }

    console.log(`[Tutanota] Fetched and cached ${emails.length} emails`);
    return emails;
  } catch (error) {
    console.error('[Tutanota] Email fetch failed:', error);
    throw new Error('Failed to fetch emails from Tutanota');
  }
}

export async function fetchEventsFromTutanota(email) {
  if (!authToken) {
    throw new Error('Not authenticated with Tutanota');
  }

  try {
    console.log(`[Tutanota] Fetching calendar events for ${email}...`);

    // In production, call actual Tutanota API here
    // const response = await fetch(`${TUTANOTA_API_BASE}/rest/tutanota/calendar`, {
    //   headers: { 'Authorization': `Bearer ${authToken}` }
    // });

    // For now, generate mock events for testing
    const events = generateMockEvents(email, 20);

    // Store in database
    const db = getDb();
    for (const event of events) {
      await db.run(
        `INSERT OR REPLACE INTO events
         (id, account_email, title, description, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.account_email,
          event.title,
          event.description,
          event.start_time,
          event.end_time,
        ]
      );
    }

    console.log(`[Tutanota] Fetched and cached ${events.length} events`);
    return events;
  } catch (error) {
    console.error('[Tutanota] Event fetch failed:', error);
    throw new Error('Failed to fetch events from Tutanota');
  }
}

export async function fetchMessagesFromTutanota(email) {
  if (!authToken) {
    throw new Error('Not authenticated with Tutanota');
  }

  try {
    console.log(`[Tutanota] Fetching SMS messages for ${email}...`);

    // In production, integrate with SMS provider (Twilio, native SMS API, etc.)
    // For now, generate mock messages for testing
    const messages = generateMockMessages(email, 30);

    // Store in database
    const db = getDb();
    for (const msg of messages) {
      await db.run(
        `INSERT OR REPLACE INTO messages
         (id, account_email, phone_number, contact_name, body, is_incoming, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          msg.id,
          msg.account_email,
          msg.phone_number,
          msg.contact_name,
          msg.body,
          msg.is_incoming,
          msg.sent_at,
        ]
      );
    }

    console.log(`[Tutanota] Fetched and cached ${messages.length} messages`);
    return messages;
  } catch (error) {
    console.error('[Tutanota] Message fetch failed:', error);
    throw new Error('Failed to fetch messages from Tutanota');
  }
}

/* ===== Mock data generation (for testing) ===== */

function generateMockEmails(email, count) {
  const senders = [
    'team@company.com',
    'boss@company.com',
    'support@service.com',
    'newsletter@blog.com',
    'noreply@app.com',
  ];

  const subjects = [
    'Meeting reminder: Q3 planning',
    'Action required: Review proposal',
    'Weekly digest',
    'Your password will expire soon',
    'Project update: On track',
    'Team lunch this Friday?',
    'New feature released',
    'Invoice #12345',
  ];

  const bodies = [
    'Just a friendly reminder about our meeting tomorrow at 2 PM.',
    'Please review the attached document and provide feedback.',
    "Here's your weekly summary of activity.",
    'Your account security update is ready.',
    "We're making good progress on the project.",
  ];

  const emails = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 90); // 3 months
    const receivedAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    emails.push({
      id: `email-${i}`,
      account_email: email,
      sender: senders[Math.floor(Math.random() * senders.length)],
      subject: subjects[Math.floor(Math.random() * subjects.length)],
      body: bodies[Math.floor(Math.random() * bodies.length)],
      received_at: receivedAt.toISOString(),
      is_read: Math.random() > 0.3 ? 1 : 0,
    });
  }

  return emails.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
}

function generateMockEvents(email, count) {
  const titles = [
    'Team standup',
    'Client call',
    'Design review',
    '1:1 with manager',
    'Product meeting',
    'Lunch break',
    'Code review',
    'Planning session',
  ];

  const events = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const daysFromNow = Math.floor(Math.random() * 90) - 30; // -30 to +60 days
    const startTime = new Date(now.getTime() + daysFromNow * 24 * 60 * 60 * 1000);
    startTime.setHours(Math.floor(Math.random() * 16) + 8); // 8 AM to 12 AM
    startTime.setMinutes(0);

    const endTime = new Date(startTime.getTime() + (30 + Math.random() * 90) * 60 * 1000); // 30-120 min

    events.push({
      id: `event-${i}`,
      account_email: email,
      title: titles[Math.floor(Math.random() * titles.length)],
      description: 'Calendar event from Tutanota',
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    });
  }

  return events.sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time)
  );
}

function generateMockMessages(email, count) {
  const contacts = [
    { name: 'Alex', phone: '+1-555-0101' },
    { name: 'Jordan', phone: '+1-555-0102' },
    { name: 'Casey', phone: '+1-555-0103' },
    { name: 'Morgan', phone: '+1-555-0104' },
    { name: 'Sam', phone: '+1-555-0105' },
    { name: 'Mom', phone: '+1-555-0201' },
    { name: 'Work', phone: '+1-555-0301' },
  ];

  const messageBodies = [
    "Hey, are you free tomorrow?",
    "Don't forget about the meeting at 2",
    "Thanks for the update!",
    "I'll be there in 10 minutes",
    "Did you see my email?",
    "Sounds good to me",
    "Let me know when you're ready",
    "Perfect timing!",
    "I have a quick question",
    "No problem, talk later",
  ];

  const messages = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const contact = contacts[Math.floor(Math.random() * contacts.length)];
    const daysAgo = Math.floor(Math.random() * 90); // Past 3 months
    const sentAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    sentAt.setHours(Math.floor(Math.random() * 24));
    sentAt.setMinutes(Math.floor(Math.random() * 60));

    messages.push({
      id: `msg-${i}`,
      account_email: email,
      phone_number: contact.phone,
      contact_name: contact.name,
      body: messageBodies[Math.floor(Math.random() * messageBodies.length)],
      is_incoming: Math.random() > 0.4 ? 1 : 0, // 60% incoming, 40% outgoing
      sent_at: sentAt.toISOString(),
    });
  }

  return messages.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
}
