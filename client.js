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
      if (!database.objectStoreNames.contains('tasks')) {
        database.createObjectStore('tasks', { keyPath: 'id' });
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

  const data = await res.json();
  const tasks = data.tasks || [];

  // Cache in IndexedDB
  await cacheTasks(tasks);

  return data;
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

  const result = await res.json();

  // Refresh tasks cache
  await fetchTasks(email);

  return result;
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

  // Update local cache
  const database = getDb();
  const task = await database.get('tasks', taskId);
  if (task) {
    const updated = { ...task, ...updates };
    await database.put('tasks', updated);
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

  // Update local cache
  const database = getDb();
  const tx = database.transaction('tasks', 'readwrite');
  const store = tx.objectStore('tasks');
  await store.delete(taskId);

  return res.json();
}

export async function getCachedTasks() {
  const database = getDb();
  const tx = database.transaction('tasks', 'readonly');
  const store = tx.objectStore('tasks');

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function cacheTasks(tasks) {
  const database = getDb();
  const tx = database.transaction('tasks', 'readwrite');
  const store = tx.objectStore('tasks');

  for (const task of tasks) {
    await store.put(task);
  }
}

export async function createRecurringTask(email, title, description, recurrenceType, recurrenceData, startDate, endDate = null) {
  const res = await fetch(`${API_BASE}/api/recurring-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      title,
      description,
      recurrence_type: recurrenceType,
      recurrence_data: recurrenceData,
      start_date: startDate,
      end_date: endDate,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to create recurring task');
  }

  return res.json();
}

export async function getRecurringTasks(email) {
  const res = await fetch(`${API_BASE}/api/recurring-tasks?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch recurring tasks');
  }

  return res.json();
}

export async function updateRecurringTask(taskId, updates) {
  const res = await fetch(`${API_BASE}/api/recurring-tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    throw new Error('Failed to update recurring task');
  }

  return res.json();
}

export async function deleteRecurringTask(taskId) {
  const res = await fetch(`${API_BASE}/api/recurring-tasks/${taskId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error('Failed to delete recurring task');
  }

  return res.json();
}

export async function getTaskTemplates(email) {
  const res = await fetch(`${API_BASE}/api/task-templates?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch task templates');
  }

  return res.json();
}

export async function createTaskTemplate(email, title, description, dueDateOffset, isRecurring, recurrenceType, category) {
  const res = await fetch(`${API_BASE}/api/task-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      title,
      description,
      due_date_offset: dueDateOffset,
      is_recurring: isRecurring,
      recurrence_type: recurrenceType,
      category,
    }),
  });

  if (!res.ok) {
    throw new Error('Failed to create task template');
  }

  return res.json();
}

export async function deleteTaskTemplate(templateId) {
  const res = await fetch(`${API_BASE}/api/task-templates/${templateId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error('Failed to delete task template');
  }

  return res.json();
}

export async function useTaskTemplate(email, templateId) {
  const res = await fetch(`${API_BASE}/api/task-templates/${templateId}/use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    throw new Error('Failed to use task template');
  }

  return res.json();
}

export async function getPreferences(email) {
  const res = await fetch(`${API_BASE}/api/preferences?email=${encodeURIComponent(email)}`);

  if (!res.ok) {
    throw new Error('Failed to fetch preferences');
  }

  return res.json();
}

export async function updatePreferences(email, preferences) {
  const res = await fetch(`${API_BASE}/api/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ...preferences }),
  });

  if (!res.ok) {
    throw new Error('Failed to update preferences');
  }

  return res.json();
}

export async function exportTasks(email, format = 'csv') {
  const res = await fetch(`${API_BASE}/api/export/tasks?email=${encodeURIComponent(email)}&format=${format}`);

  if (!res.ok) {
    throw new Error('Failed to export tasks');
  }

  if (format === 'csv') {
    const blob = await res.blob();
    downloadFile(blob, 'tasks.csv');
  } else {
    return res.json();
  }
}

export async function exportEmails(email, format = 'csv') {
  const res = await fetch(`${API_BASE}/api/export/emails?email=${encodeURIComponent(email)}&format=${format}`);

  if (!res.ok) {
    throw new Error('Failed to export emails');
  }

  if (format === 'csv') {
    const blob = await res.blob();
    downloadFile(blob, 'emails.csv');
  } else {
    return res.json();
  }
}

export async function exportEvents(email, format = 'csv') {
  const res = await fetch(`${API_BASE}/api/export/events?email=${encodeURIComponent(email)}&format=${format}`);

  if (!res.ok) {
    throw new Error('Failed to export events');
  }

  if (format === 'csv') {
    const blob = await res.blob();
    downloadFile(blob, 'events.csv');
  } else {
    return res.json();
  }
}

export async function exportAll(email) {
  const res = await fetch(`${API_BASE}/api/export/all?email=${encodeURIComponent(email)}&format=json`);

  if (!res.ok) {
    throw new Error('Failed to export data');
  }

  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadFile(blob, `backup-${new Date().toISOString().split('T')[0]}.json`);
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function search(email, query) {
  const res = await fetch(`${API_BASE}/api/search?email=${encodeURIComponent(email)}&q=${encodeURIComponent(query)}`);

  if (!res.ok) {
    throw new Error('Search failed');
  }

  return res.json();
}

export async function searchTasks(email, options = {}) {
  const params = new URLSearchParams({ email });

  if (options.query) params.append('q', options.query);
  if (options.completed !== undefined) params.append('completed', options.completed);
  if (options.dueAfter) params.append('dueAfter', options.dueAfter);
  if (options.dueBefore) params.append('dueBefore', options.dueBefore);
  if (options.sort) params.append('sort', options.sort);

  const res = await fetch(`${API_BASE}/api/search/tasks?${params}`);

  if (!res.ok) {
    throw new Error('Task search failed');
  }

  return res.json();
}

export async function searchEmails(email, options = {}) {
  const params = new URLSearchParams({ email });

  if (options.query) params.append('q', options.query);
  if (options.isRead !== undefined) params.append('isRead', options.isRead);
  if (options.fromAfter) params.append('fromAfter', options.fromAfter);
  if (options.fromBefore) params.append('fromBefore', options.fromBefore);

  const res = await fetch(`${API_BASE}/api/search/emails?${params}`);

  if (!res.ok) {
    throw new Error('Email search failed');
  }

  return res.json();
}

export async function searchEvents(email, options = {}) {
  const params = new URLSearchParams({ email });

  if (options.query) params.append('q', options.query);
  if (options.startAfter) params.append('startAfter', options.startAfter);
  if (options.startBefore) params.append('startBefore', options.startBefore);

  const res = await fetch(`${API_BASE}/api/search/events?${params}`);

  if (!res.ok) {
    throw new Error('Event search failed');
  }

  return res.json();
}
