require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const app = express();
const PORT = process.env.PORT || 3001;
const ACCESS_KEY = process.env.ACCESS_KEY;

const PROJECT_LOG_PATH = process.env.PROJECT_LOG_PATH;
const SESSION_DIR = process.env.SESSION_DIR;

const db = new Database('logs.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS project_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS llm_interactions (
    id TEXT PRIMARY KEY,
    role TEXT,
    content_json TEXT,
    tokens INTEGER,
    timestamp DATETIME
  );

  CREATE TABLE IF NOT EXISTS usage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_tokens INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function getActiveSessionPath() {
    try {
        const sessionsJson = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'sessions.json'), 'utf8'));
        const activeSession = sessionsJson["agent:main:main"];
        return activeSession?.sessionFile || null;
    } catch (e) { return null; }
}

function syncLogs() {
    console.log('Syncing logs (Reliability Update)...');
    
    try {
        // 1. Sync Project Log
        if (fs.existsSync(PROJECT_LOG_PATH)) {
            const content = fs.readFileSync(PROJECT_LOG_PATH, 'utf8');
            const existing = db.prepare('SELECT content FROM project_logs LIMIT 1').get();
            if (!existing) {
                db.prepare('INSERT INTO project_logs (content) VALUES (?)').run(content);
            } else if (existing.content !== content) {
                db.prepare('UPDATE project_logs SET content = ?, last_updated = CURRENT_TIMESTAMP').run(content);
            }
        }

        // 2. Sync Usage History
        const sessionJsonPath = path.join(SESSION_DIR, 'sessions.json');
        if (fs.existsSync(sessionJsonPath)) {
            const data = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
            const session = data["agent:main:main"];
            if (session) {
                const last = db.prepare('SELECT total_tokens FROM usage_history ORDER BY timestamp DESC LIMIT 1').get();
                if (!last || last.total_tokens !== session.totalTokens) {
                    db.prepare('INSERT INTO usage_history (total_tokens, input_tokens, output_tokens) VALUES (?, ?, ?)')
                      .run(session.totalTokens, session.inputTokens, session.outputTokens);
                }
            }
        }

        // 3. Incremental Sync LLM Interactions
        const sessionFile = getActiveSessionPath();
        if (sessionFile && fs.existsSync(sessionFile)) {
            const stateKey = `offset:${sessionFile}`;
            const lastOffset = parseInt(db.prepare('SELECT value FROM sync_state WHERE key = ?').get(stateKey)?.value || '0');
            const stats = fs.statSync(sessionFile);
            
            if (stats.size > lastOffset) {
                const fd = fs.openSync(sessionFile, 'r');
                const buffer = Buffer.alloc(stats.size - lastOffset);
                fs.readSync(fd, buffer, 0, buffer.length, lastOffset);
                fs.closeSync(fd);

                const lines = buffer.toString('utf8').split('\n').filter(l => l.trim());
                const insertInteraction = db.prepare(`INSERT OR IGNORE INTO llm_interactions (id, role, content_json, tokens, timestamp) VALUES (?, ?, ?, ?, ?)`);

                const transaction = db.transaction((logLines) => {
                    for (const line of logLines) {
                        try {
                            const item = JSON.parse(line);
                            let role = 'unknown';
                            let contentArr = [];
                            let tokens = 0;

                            if (item.type === 'message') {
                                role = item.message.role;
                                tokens = item.message.usage?.totalTokens || 0;
                                
                                if (role === 'toolResult') {
                                    // Normalize tool results for the UI
                                    contentArr = [{ 
                                        type: 'toolResult', 
                                        toolName: item.message.toolName || 'tool', 
                                        text: item.message.content.find(c => c.type === 'text')?.text || "Success" 
                                    }];
                                } else {
                                    contentArr = item.message.content || [];
                                }
                            } else if (item.type === 'systemEvent') {
                                role = 'system';
                                contentArr = [{ type: 'text', text: item.text }];
                            } else if (item.type === 'toolResult') {
                                role = 'toolResult';
                                contentArr = [{ 
                                    type: 'toolResult', 
                                    toolName: item.toolName, 
                                    text: item.content?.[0]?.text || "Success" 
                                }];
                            }

                            if (role !== 'unknown') {
                                insertInteraction.run(
                                    item.id || `evt-${item.timestamp || Date.now()}-${Math.random()}`, 
                                    role, 
                                    JSON.stringify(contentArr), 
                                    tokens, 
                                    item.timestamp || new Date().toISOString()
                                );
                            }
                        } catch (e) { /* skip */ }
                    }
                });

                transaction(lines);
                db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').run(stateKey, stats.size.toString());
            }
        }
    } catch (e) { console.error('Global sync error', e); }
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
        const history = db.prepare('SELECT * FROM usage_history ORDER BY timestamp ASC LIMIT 100').all();
        res.json({
            current: {
                model: session.model,
                totalTokens: session.totalTokens,
                inputTokens: session.inputTokens,
                outputTokens: session.outputTokens,
                systemPrompt: session.systemPromptReport?.systemPrompt?.text || ""
            },
            history: history
        });
    } catch (e) { res.status(500).json({ error: 'Read error' }); }
});

app.get('/api/logs/llm', checkAuth, (req, res) => {
    const search = req.query.q || '';
    const limit = parseInt(req.query.limit) || 100;
    let query = 'SELECT * FROM llm_interactions';
    const params = [];
    if (search) {
        query += ' WHERE content_json LIKE ?';
        params.push(`%${search}%`);
    }
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    const rows = db.prepare(query).all(...params);
    res.json(rows.map(r => ({ ...r, content: JSON.parse(r.content_json || '[]') })));
});

syncLogs();
setInterval(syncLogs, 30000); 

app.listen(PORT, () => {
    console.log(`Reliability Log Viewer API running at http://localhost:${PORT}`);
});
