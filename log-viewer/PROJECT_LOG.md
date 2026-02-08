# Log Viewer - Project Audit Log 📜

This file tracks the development milestones, commands, and architectural decisions for the Log Viewer dashboard.

## 🕒 2026-02-07

### 🚀 Initial Deployment
- **Task:** Create a web-based dashboard to view AI logs and token usage.
- **Technology:** Node.js, Express, Tailwind CSS.
- **Result:** Dashboard live on port 8080.

### 🐙 Source Control Setup
- **Task:** Link project to GitHub.
- **Result:** Code versioned at `https://github.com/vinhlocvobook-lab/log-viewer`.

## 🕒 2026-02-08

### 🗄️ SQLite Migration & Search
- **Task:** Scale the logging system using a database and add search functionality.
- **Branch:** `feat/sqlite-logging`
- **Result:** Efficient, database-backed log viewing with instant filtering.

### 🛡️ Scaling & Hardening
- **Task:** Improve reliability and security.
- **Branch:** `feat/hardening-and-scaling`
- **Improvements:**
  - **Dynamic Discovery:** System now automatically finds the active session file.
  - **Incremental Sync:** Replaced full-file reads with offset-based streaming for performance.
  - **Auth Shield:** Added an mandatory Access Key to protect log data.
- **Result:** Enterprise-grade logging system ready for large session files.

### 🛠️ Rich Content Parsing
- **Task:** Parse and display internal AI logic (Thinking, Tool Calls, Tool Results).
- **Branch:** `feat/rich-parsing`
- **Result:** Full transparency into what the AI is "thinking" and what commands it is running.

### 🔒 Security & Source Control Fix
- **Task:** Remove sensitive `.env` file from GitHub history.
- **Decision:** Untracked `.env` using `git rm --cached` and provided `.env.example` for setup.
- **Result:** Secrets are no longer pushed to the repository.
