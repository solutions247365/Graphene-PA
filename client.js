/* API and storage client for the PA app */

const API_BASE = 'http://localhost:3000';

// ===== IndexedDB setup =====

let db = null;

export async function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('GraphenePA', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('emails')) {
        database.createObjectStore('emails', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('events')) {
        database.createObjectStore('events', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('messages')) {
        database.createObjectStore('messages', { keyPath: 'id' });
      }
    };
  });
}

function getDb() {
  if (!db) throw new Error('IndexedDB not initialized');
  return db;
}

// ===== API calls =====

export async function loginWithTutanota(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Login failed');
  }

  return res.json();
}

export async function logoutFromTutanota(email) {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function fetchEmails(email) {
  const res = await fetch(`${API_BASE}/api/emails?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch emails');
  }

  const data = await res.json();
  const emails = data.emails || [];

  // Cache in IndexedDB
  const database = getDb();
  const tx = database.transaction('emails', 'readwrite');
  const store = tx.objectStore('emails');

  for (const email of emails) {
    await store.put(email);
  }

  return emails;
}

export async function fetchEvents(email) {
  const res = await fetch(`${API_BASE}/api/events?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch events');
  }

  const data = await res.json();
  const events = data.events || [];

  // Cache in IndexedDB
  const database = getDb();
  const tx = database.transaction('events', 'readwrite');
  const store = tx.objectStore('events');

  for (const event of events) {
    await store.put(event);
  }

  return events;
}

export async function getCachedEmails() {
  const database = getDb();
  const tx = database.transaction('emails', 'readonly');
  const store = tx.objectStore('emails');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getCachedEvents() {
  const database = getDb();
  const tx = database.transaction('events', 'readonly');
  const store = tx.objectStore('events');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function triggerSync(email) {
  const res = await fetch(`${API_BASE}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    throw new Error('Sync failed');
  }

  return res.json();
}

export async function fetchMessages(email) {
  const res = await fetch(`${API_BASE}/api/messages?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch messages');
  }

  const data = await res.json();
  const messages = data.messages || [];

  // Cache in IndexedDB
  const database = getDb();
  const tx = database.transaction('messages', 'readwrite');
  const store = tx.objectStore('messages');

  for (const msg of messages) {
    await store.put(msg);
  }

  return messages;
}

export async function getCachedMessages() {
  const database = getDb();
  const tx = database.transaction('messages', 'readonly');
  const store = tx.objectStore('messages');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function fetchTasks(email) {
  const res = await fetch(`${API_BASE}/api/tasks?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch tasks');
  }

  return res.json();
}

export async function fetchTaskSuggestions(email) {
  const res = await fetch(`${API_BASE}/api/tasks/suggestions?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch task suggestions');
  }

  return res.json();
}

export async function createNewTask(email, title, description, dueDate) {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, title, description, due_date: dueDate }),
  });

  if (!res.ok) {
    throw new Error('Failed to create task');
  }

  return res.json();
}

export async function acceptTaskSuggestion(email, suggestion) {
  const res = await fetch(`${API_BASE}/api/tasks/from-suggestion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, suggestion }),
  });

  if (!res.ok) {
    throw new Error('Failed to accept suggestion');
  }

  return res.json();
}

export async function updateTask(taskId, updates) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    throw new Error('Failed to update task');
  }

  return res.json();
}

export async function deleteTask(taskId) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error('Failed to delete task');
  }

  return res.json();
}
