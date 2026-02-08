const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const app = express();
const PORT = 3001;

// Paths to the source logs
const PROJECT_LOG_PATH = '/home/locvv/.openclaw/workspace/prod-todolist/PROJECT_LOG.md';
const LLM_JSONL_PATH = '/home/locvv/.openclaw/agents/main/sessions/a5d6e76f-67e0-4c56-91b3-24004a56572f.jsonl';
const SESSION_JSON_PATH = '/home/locvv/.openclaw/agents/main/sessions/sessions.json';

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
`);

// Sync logic: Pull from files into DB
function syncLogs() {
    console.log('Syncing logs to SQLite...');
    
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

    // 2. Sync LLM Interactions
    try {
        const raw = fs.readFileSync(LLM_JSONL_PATH, 'utf8');
        const lines = raw.trim().split('\n').map(l => JSON.parse(l));
        
        const insertInteraction = db.prepare(`
            INSERT OR IGNORE INTO llm_interactions (id, role, text, tokens, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `);

        const transaction = db.transaction((msgs) => {
            for (const msg of msgs) {
                insertInteraction.run(
                    msg.id,
                    msg.role,
                    msg.text,
                    msg.tokens,
                    msg.timestamp
                );
            }
        });

        const history = lines
            .filter(item => item.type === 'message')
            .map(item => ({
                id: item.id,
                role: item.message.role,
                text: item.message.content.find(c => c.type === 'text')?.text || "[Media/Tool]",
                tokens: item.message.usage?.totalTokens || 0,
                timestamp: item.timestamp
            }));

        transaction(history);
    } catch (e) { console.error('LLM log sync failed', e); }
}

app.use(express.static('public'));

// API to get project audit log from DB
app.get('/api/logs/project', (req, res) => {
    const row = db.prepare('SELECT content FROM project_logs LIMIT 1').get();
    res.json({ content: row ? row.content : 'No logs found.' });
});

// API to get session usage (still read from live JSON for accuracy)
app.get('/api/logs/usage', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(SESSION_JSON_PATH, 'utf8'));
        const session = data["agent:main:main"];
        res.json({
            model: session.model,
            totalTokens: session.totalTokens,
            inputTokens: session.inputTokens,
            outputTokens: session.outputTokens,
            contextWindow: session.contextTokens
        });
    } catch (e) {
        res.status(500).json({ error: 'Could not read session usage' });
    }
});

// API to get LLM message history from DB (with sorting and search)
app.get('/api/logs/llm', (req, res) => {
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

    const history = db.prepare(query).all(...params);
    res.json(history);
});

// Initial sync and scheduled sync
syncLogs();
setInterval(syncLogs, 60000); // Sync every minute

app.listen(PORT, () => {
    console.log(`SQLite Log Viewer API running at http://localhost:${PORT}`);
});
