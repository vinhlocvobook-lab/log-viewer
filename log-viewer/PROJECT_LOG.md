# Log Viewer - Project Audit Log 📜

This file tracks the development milestones, commands, and architectural decisions for the Log Viewer dashboard.

## 🕒 2026-02-07

### 🚀 Initial Deployment
- **Task:** Create a web-based dashboard to view AI logs and token usage.
- **Technology:** Node.js, Express, Tailwind CSS.
- **Commands:**
  - `mkdir log-viewer && npm init -y`
  - `npm install express tailwindcss`
  - `pm2 start server.js --name "log-viewer"`
- **Result:** Dashboard live on port 8080.

### 🐙 Source Control Setup
- **Task:** Link project to GitHub.
- **Commands:**
  - `git init`
  - `git remote add origin git@github.com:vinhlocvobook-lab/log-viewer.git`
  - `git push -u origin master`
- **Result:** Code versioned at `https://github.com/vinhlocvobook-lab/log-viewer`.

## 🕒 2026-02-08

### 🗄️ SQLite Migration & Search
- **Task:** Scale the logging system using a database and add search functionality.
- **Branch:** `feat/sqlite-logging`
- **Commands:**
  - `git checkout -b feat/sqlite-logging`
  - `npm install better-sqlite3`
  - `pm2 restart log-viewer`
- **Decision:** Implemented a **Sync Engine** to pull raw file data into SQLite for faster queries. Added a frontend **Live Search** bar.
- **Result:** Efficient, database-backed log viewing with instant filtering.

### 📄 Documentation Phase
- **Task:** Add technical documentation.
- **Result:** Created `README.md` (Setup) and `ARCHITECTURE.md` (System Design).
