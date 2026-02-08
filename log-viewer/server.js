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

// Create tables (Updated for rich content)
db.exec(`
  CREATE TABLE IF NOT EXISTS project_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS llm_interactions (
    id TEXT PRIMARY KEY,
    role TEXT,
    content_json TEXT, -- Stores the full content array as JSON
    tokens INTEGER,
    timestamp DATETIME
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration: Add content_json if it doesn't exist
const columns = db.prepare("PRAGMA table_info(llm_interactions)").all();
if (!columns.find(c => c.name === 'content_json')) {
    db.exec('ALTER TABLE llm_interactions ADD COLUMN content_json TEXT');
}

// Dynamic Discovery: Find the current active session file
function getActiveSessionPath() {
    try {
        const sessionsJson = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'sessions.json'), 'utf8'));
        const activeSession = sessionsJson["agent:main:main"];
        if (activeSession && activeSession.sessionFile) {
            return activeSession.sessionFile;
        }
    } catch (e) { console.error('Discovery failed', e); }
    return null;
}

// Sync logic
function syncLogs() {
    console.log('Syncing logs (Rich Parsing)...');
    
    // 1. Sync Project Log
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
                INSERT OR IGNORE INTO llm_interactions (id, role, content_json, tokens, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `);

            const transaction = db.transaction((lines) => {
                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        if (item.type === 'message') {
                            // Normalize content for display
                            let contentArr = item.message.content || [];
                            
                            // If it's a tool result, wrap it into a readable format for the UI
                            if (item.message.role === 'toolResult') {
                                contentArr = [{
                                    type: 'toolResult',
                                    toolName: item.message.toolName,
                                    text: item.message.content.find(c => c.type === 'text')?.text || "Success"
                                }];
                            }

                            insertInteraction.run(
                                item.id,
                                item.message.role,
                                JSON.stringify(contentArr),
                                item.message.usage?.totalTokens || 0,
                                item.timestamp
                            );
                        }
                    } catch (e) { console.error('Line parse error', e); }
                }
            });

            transaction(newLines);
            db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(stateKey, stats.size.toString());
        }
    } catch (e) { console.error('LLM log sync failed', e); }
}

const checkAuth = (req, res, next) => {
    const key = req.headers['x-access-key'] || req.query.key;
    if (ACCESS_KEY && key !== ACCESS_KEY) return res.status(403).json({ error: 'Access denied' });
    next();
};

app.use(express.static('public'));

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
            outputTokens: session.outputTokens
        });
    } catch (e) { res.status(500).json({ error: 'Read error' }); }
});

app.get('/api/logs/llm', checkAuth, (req, res) => {
    const search = req.query.q || '';
    const limit = parseInt(req.query.limit) || 50;
    let query = 'SELECT * FROM llm_interactions';
    const params = [];
    if (search) {
        query += ' WHERE content_json LIKE ?';
        params.push(`%${search}%`);
    }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const rows = db.prepare(query).all(...params);
    const history = rows.map(r => ({
        ...r,
        content: JSON.parse(r.content_json || '[]')
    }));
    res.json(history);
});

syncLogs();
setInterval(syncLogs, 30000); 

app.listen(PORT, () => {
    console.log(`Rich Log Viewer API running at http://localhost:${PORT}`);
});
