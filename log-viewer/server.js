require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const app = express();
const PORT = process.env.PORT || 3001;
const ACCESS_KEY = process.env.ACCESS_KEY;

// Paths from environment
const PROJECT_LOG_PATH = process.env.PROJECT_LOG_PATH;
const SESSION_DIR = process.env.SESSION_DIR;

// Initialize SQLite DB
const db = new Database('logs.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS project_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS llm_interactions (
    id TEXT PRIMARY KEY,
    role TEXT,
    text TEXT,
    tokens INTEGER,
    timestamp DATETIME
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Dynamic Discovery: Find the current active session file
function getActiveSessionPath() {
    try {
        const sessionsJson = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'sessions.json'), 'utf8'));
        const activeSession = sessionsJson["agent:main:main"];
        if (activeSession && activeSession.sessionFile) {
            return activeSession.sessionFile;
        }
    } catch (e) {
        console.error('Failed to discover active session via sessions.json');
    }
    
    // Fallback: most recently modified .jsonl file
    const files = fs.readdirSync(SESSION_DIR)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, time: fs.statSync(path.join(SESSION_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
    
    return files.length > 0 ? path.join(SESSION_DIR, files[0].name) : null;
}

// Incremental Sync logic
function syncLogs() {
    console.log('Syncing logs...');
    
    // 1. Sync Project Log (Full re-read is fine for small MD file)
    try {
        const content = fs.readFileSync(PROJECT_LOG_PATH, 'utf8');
        const existing = db.prepare('SELECT content FROM project_logs LIMIT 1').get();
        if (!existing) {
            db.prepare('INSERT INTO project_logs (content) VALUES (?)').run(content);
        } else if (existing.content !== content) {
            db.prepare('UPDATE project_logs SET content = ?, last_updated = CURRENT_TIMESTAMP').run(content);
        }
    } catch (e) { console.error('Project log sync failed', e); }

    // 2. Incremental Sync LLM Interactions
    const sessionFile = getActiveSessionPath();
    if (!sessionFile) return;

    try {
        const stateKey = `offset:${sessionFile}`;
        const lastOffset = parseInt(db.prepare('SELECT value FROM sync_state WHERE key = ?').get(stateKey)?.value || '0');
        const stats = fs.statSync(sessionFile);
        
        if (stats.size > lastOffset) {
            const fd = fs.openSync(sessionFile, 'r');
            const buffer = Buffer.alloc(stats.size - lastOffset);
            fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
            fs.closeSync(fd);

            const newLines = buffer.toString('utf8').trim().split('\n').filter(l => l.trim());
            
            const insertInteraction = db.prepare(`
                INSERT OR IGNORE INTO llm_interactions (id, role, text, tokens, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `);

            const transaction = db.transaction((lines) => {
                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        if (item.type === 'message') {
                            insertInteraction.run(
                                item.id,
                                item.message.role,
                                item.message.content.find(c => c.type === 'text')?.text || "[Media/Tool]",
                                item.message.usage?.totalTokens || 0,
                                item.timestamp
                            );
                        }
                    } catch (e) { /* Skip malformed lines */ }
                }
            });

            transaction(newLines);
            db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(stateKey, stats.size.toString());
            console.log(`Synced ${newLines.length} log lines.`);
        }
    } catch (e) { console.error('LLM log sync failed', e); }
}

// Security Middleware
const checkAuth = (req, res, next) => {
    const key = req.headers['x-access-key'] || req.query.key;
    if (ACCESS_KEY && key !== ACCESS_KEY) {
        return res.status(403).json({ error: 'Access denied. Invalid key.' });
    }
    next();
};

app.use(express.static('public'));

// Secure API Routes
app.get('/api/logs/project', checkAuth, (req, res) => {
    const row = db.prepare('SELECT content FROM project_logs LIMIT 1').get();
    res.json({ content: row ? row.content : 'No logs found.' });
});

app.get('/api/logs/usage', checkAuth, (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'sessions.json'), 'utf8'));
        const session = data["agent:main:main"];
        res.json({
            model: session.model,
            totalTokens: session.totalTokens,
            inputTokens: session.inputTokens,
            outputTokens: session.outputTokens,
            contextWindow: session.contextTokens
        });
    } catch (e) { res.status(500).json({ error: 'Could not read usage' }); }
});

app.get('/api/logs/llm', checkAuth, (req, res) => {
    const search = req.query.q || '';
    const limit = parseInt(req.query.limit) || 50;
    let query = 'SELECT * FROM llm_interactions';
    const params = [];
    if (search) {
        query += ' WHERE text LIKE ?';
        params.push(`%${search}%`);
    }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    res.json(db.prepare(query).all(...params));
});

// Initial sync and start server
syncLogs();
setInterval(syncLogs, 30000); 

app.listen(PORT, () => {
    console.log(`Hardened Log Viewer API running at http://localhost:${PORT}`);
});
