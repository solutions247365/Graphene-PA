# Graphene PA — Personal Assistant for GrapheneOS

A privacy-first, open-source personal assistant that integrates your emails, calendar, and text messages into a unified interface with intelligent task extraction.

## What It Does

**Graphene PA** connects to your Tutanota account (email + calendar) and your SMS messages, then intelligently extracts actionable tasks from:
- **Emails** — scans for action keywords ("call", "review", "submit") and dates
- **Text messages** — extracts commitments and requests from incoming SMS
- **Calendar events** — automatically creates tasks for scheduled meetings
- **Manual entry** — add your own tasks with due dates

All data syncs to a backend database with end-to-end encryption for passwords, and caches locally on your device for offline access.

## Features

### 🔐 Privacy First
- Minimal permissions (internet only)
- No cleartext traffic
- Encrypted password storage (AES-256-GCM)
- No telemetry or tracking
- Designed for GrapheneOS security model

### 📱 5-Tab Interface
- **Chat** — main conversation interface for assistant
- **Tasks** — view tasks, accept suggestions, create new tasks
- **Messages** — SMS threads grouped by contact
- **Schedule** — calendar view of upcoming events (30 days)
- **Profile** — account info, sync counts, manual refresh

### 🧠 Smart Task Extraction
- Scans emails/SMS for action keywords (call, email, review, submit, etc.)
- Extracts due dates ("Friday", "by next week", "tomorrow")
- Auto-suggests tasks from calendar events
- Confidence scoring to filter low-quality suggestions
- One-click to convert suggestions into tasks

### 🔄 Hybrid Sync
- **Backend (source of truth)** — stores 3 months of emails, events, SMS
- **Local cache (IndexedDB)** — recent data for instant offline access
- Automatic sync on login + manual refresh button
- Status indicator showing email/calendar/message counts

### 🌓 Dark/Light Mode
- System preference auto-detection
- Smooth theme switching
- Eye-friendly colors optimized for both modes
- Edge-to-edge rendering with safe area support

## Architecture

```
┌─────────────────────────────────────────┐
│     Graphene PA Android App (WebView)   │
├─────────────────────────────────────────┤
│         Web Frontend (HTML/CSS/JS)      │
│  • Chat, Tasks, Messages, Schedule tabs │
│  • IndexedDB for local caching           │
└──────────────┬──────────────────────────┘
               │ HTTP (localhost:3000)
┌──────────────▼──────────────────────────┐
│    Node.js Backend (Express)            │
├─────────────────────────────────────────┤
│ • REST API (auth, emails, events, tasks)│
│ • Task extraction engine                │
│ • SQLite database with encryption       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      Tutanota API (emails/calendar)     │
│      SMS Provider (mock → Twilio)       │
└─────────────────────────────────────────┘
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm
- Android Studio (for building the mobile app)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/solutions247365/Graphene-PA.git
   cd Graphene-PA
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the backend server**
   ```bash
   npm start
   ```
   Server runs on `http://localhost:3000`

4. **Open in browser**
   ```bash
   # Visit http://localhost:3000 in your web browser
   ```

5. **Create an account**
   - Enter your Tutanota email and password
   - App syncs emails, calendar, and SMS
   - Task suggestions appear automatically

### Using the App

#### Tasks Tab
1. **View Suggestions** — AI-extracted tasks appear automatically
2. **Accept Suggestion** — click "Add Task" to convert to your task list
3. **Dismiss** — skip suggestions you're not interested in
4. **Create New** — form to manually add tasks with due dates
5. **Complete Tasks** — check checkbox to mark done
6. **Delete** — × button to remove tasks

#### Messages Tab
- SMS threads grouped by contact
- Shows most recent message preview
- Last message time

#### Schedule Tab
- Next 30 days of calendar events
- Sorted by date and time
- Event titles and descriptions

#### Profile Tab
- Account email
- Total synced emails, events, messages
- "Force Sync" button for manual refresh

## Building for GrapheneOS

See [ANDROID_BUILD.md](ANDROID_BUILD.md) for detailed build instructions.

### Quick Build
```bash
cd android
./build.sh install    # Build and install debug app
```

### Release
```bash
cd android
./build.sh release    # Build unsigned release APK
```

## Technology Stack

### Frontend
- **HTML/CSS/JavaScript** — vanilla, no frameworks
- **IndexedDB** — offline data caching
- **Dark/light mode** — CSS custom properties

### Backend
- **Node.js + Express** — REST API
- **SQLite** — persistent data storage
- **Crypto** — AES-256-GCM password encryption
- **JavaScript** — full-stack unified language

### Mobile
- **Android WebView** — app wrapper
- **Gradle** — build system
- **GrapheneOS** — target platform

## API Endpoints

All endpoints require `email` parameter (query string or request body).

### Authentication
- `POST /api/auth/login` — authenticate with Tutanota
- `POST /api/auth/logout` — sign out

### Data Fetching
- `GET /api/emails?email=...` — fetch cached emails
- `GET /api/events?email=...` — fetch calendar events
- `GET /api/messages?email=...` — fetch SMS threads

### Tasks
- `GET /api/tasks?email=...` — list user tasks
- `POST /api/tasks` — create new task
- `PUT /api/tasks/:id` — update task (title, description, due date, completion status)
- `DELETE /api/tasks/:id` — delete task
- `GET /api/tasks/suggestions?email=...` — get suggested tasks
- `POST /api/tasks/from-suggestion` — create task from suggestion

### Sync
- `POST /api/sync` — manually trigger sync with Tutanota

## Configuration

### Environment Variables
Create a `.env` file:
```env
PORT=3000
ENCRYPTION_KEY=your-256-bit-hex-key-here
NODE_ENV=development
```

Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Development

### Project Structure
```
Graphene-PA/
├── index.html              # Frontend (single-page app)
├── style.css               # Styling (dark/light modes)
├── client.js               # Frontend API client
├── server.js               # Express backend
├── db.js                   # SQLite database
├── crypto.js               # Password encryption
├── tutanota.js             # Tutanota API integration
├── task-extraction.js      # Smart task extraction
├── package.json
└── android/                # Mobile app wrapper
    ├── app/
    │   ├── build.gradle.kts
    │   ├── src/main/
    │   │   ├── AndroidManifest.xml
    │   │   ├── java/com/graphenepa/app/MainActivity.java
    │   │   └── res/
    │   └── proguard-rules.pro
    └── build.sh
```

### Making Changes

1. **Frontend changes** — edit `index.html`, `style.css`, `client.js`
2. **Backend changes** — edit `server.js`, `db.js`, `tutanota.js`, `task-extraction.js`
3. **Restart server** — `npm start`
4. **Refresh browser** — changes auto-reload

### Building for Testing
```bash
# Terminal 1: Run backend
npm start

# Terminal 2: Build Android app
cd android
./build.sh install
```

## Roadmap

### Phase 1 (Done ✅)
- [x] Mobile-first web UI (dark/light mode)
- [x] Tutanota integration (emails + calendar)
- [x] SMS message support
- [x] Smart task extraction
- [x] Task CRUD operations
- [x] Android WebView wrapper
- [x] Hybrid storage (backend + local cache)

### Phase 2 (Next)
- [ ] Real Tutanota SDK (replace mock data)
- [ ] Twilio SMS integration (replace mock)
- [ ] Native SMS access on GrapheneOS
- [ ] Chat assistant responses (AI using OpenAI/Claude API)
- [ ] Email/message/event detail views
- [ ] Task templates and recurring tasks

### Phase 3 (Future)
- [ ] F-Droid distribution
- [ ] End-to-end encryption for task data
- [ ] Multi-device sync
- [ ] Offline-first architecture
- [ ] Calendar event creation from chat
- [ ] Email reply composition
- [ ] SMS reply from app

## Security Considerations

### Current
- ✅ Encrypted password storage (AES-256-GCM)
- ✅ Minimal permissions (internet only)
- ✅ No file/contact/calendar system access
- ✅ No analytics or tracking
- ✅ HTTPS-only after network configuration

### Future
- [ ] E2E encryption for task data
- [ ] Biometric unlock
- [ ] OAuth for Tutanota (when available)
- [ ] Hardware-backed encryption keys

## Contributing

Contributions welcome! Areas to help:

1. **Real API integrations**
   - Replace mock data with real Tutanota SDK
   - Add Twilio for SMS
   - Integrate AI APIs for chat responses

2. **UI/UX improvements**
   - Email/message/event detail views
   - Task templates
   - Recurring tasks
   - Search and filtering

3. **Performance**
   - Database indexing
   - Query optimization
   - Caching strategies

4. **Security**
   - End-to-end encryption
   - OAuth flow
   - Audit logging

## License

Open source under [LICENSE](LICENSE).

## Support

For issues, feature requests, or questions:
- Open an issue on GitHub
- Check existing documentation
- Review ANDROID_BUILD.md for mobile-specific help

---

**Graphene PA** — your personal assistant, your data, your device.
