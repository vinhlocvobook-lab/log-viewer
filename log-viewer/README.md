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
Create a `.env` file with the following:
```env
PORT=3001
ACCESS_KEY=your-secure-key
SESSION_DIR=/home/locvv/.openclaw/agents/main/sessions
PROJECT_LOG_PATH=/home/locvv/.openclaw/workspace/prod-todolist/PROJECT_LOG.md
```

### 4. Running the App
Using PM2:
```bash
pm2 restart log-viewer || pm2 start server.js --name "log-viewer"
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
- **Rich Content Engine:** Parses complex JSONL structures to separate normal text from **Thinking**, **Tool Calls**, and **Tool Results**.
- **Incremental Sync:** Uses file offsets to only read new data from `.jsonl` logs, ensuring scalability.
- **Dynamic Discovery:** Automatically resolves the active session path via `sessions.json`.
- **Database:** **SQLite** (`logs.db`) caches all logs for high-performance searching.
- **Security:** Dashboard access is protected by a secret **Access Key**.

## 📄 Documents
- README: `/home/locvv/.openclaw/workspace/log-viewer/README.md`
- Audit Log: `/home/locvv/.openclaw/workspace/log-viewer/PROJECT_LOG.md`
- Architecture: `/home/locvv/.openclaw/workspace/log-viewer/ARCHITECTURE.md`
- Apache Config: `/home/locvv/.openclaw/workspace/log-viewer/apache-logs.conf`
