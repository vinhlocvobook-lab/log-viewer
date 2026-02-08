# DevFriend Log Viewer 📜

A web-based dashboard to monitor and audit DevFriend's system commands, internal logic, and LLM interactions.

## 🚀 Setup Guide

### 1. Requirements
- Node.js v22+
- npm
- Apache2 (for reverse proxy)

### 2. Installation
```bash
cd log-viewer
npm install
```

### 3. Configuration
The application uses hardcoded absolute paths to the OpenClaw session files. Ensure the paths in `server.js` match your environment:
- Project Log: `/home/locvv/.openclaw/workspace/prod-todolist/PROJECT_LOG.md`
- LLM History: `/home/locvv/.openclaw/agents/main/sessions/<session-id>.jsonl`

### 4. Running the App
Using PM2:
```bash
pm2 start server.js --name "log-viewer"
pm2 save
```

### 5. Apache Configuration
The viewer runs on port 3001 but is exposed via port 8080.
```bash
sudo cp apache-logs.conf /etc/apache2/sites-available/log-viewer.conf
sudo a2ensite log-viewer.conf
sudo systemctl restart apache2
```

## 🏗 Architecture
- **Frontend:** Single-page app using **Tailwind CSS** and **Vanilla JS**.
- **Backend:** **Node.js/Express** server with a background sync engine.
- **Database:** **SQLite** (`logs.db`) caches file-based logs for high-performance searching and filtering.
- **Sync Engine:** Automatically ingests new entries from `PROJECT_LOG.md` and OpenClaw `.jsonl` files every 60 seconds.

## 📄 Documents
- README: `/home/locvv/.openclaw/workspace/log-viewer/README.md`
- Architecture: `/home/locvv/.openclaw/workspace/log-viewer/ARCHITECTURE.md`
- Apache Config: `/home/locvv/.openclaw/workspace/log-viewer/apache-logs.conf`
