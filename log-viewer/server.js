const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3001;

// Paths to the logs
const PROJECT_LOG_PATH = '/home/locvv/.openclaw/workspace/prod-todolist/PROJECT_LOG.md';
const LLM_JSONL_PATH = '/home/locvv/.openclaw/agents/main/sessions/a5d6e76f-67e0-4c56-91b3-24004a56572f.jsonl';
const SESSION_JSON_PATH = '/home/locvv/.openclaw/agents/main/sessions/sessions.json';

app.use(express.static('public'));

// API to get project audit log
app.get('/api/logs/project', (req, res) => {
    try {
        const content = fs.readFileSync(PROJECT_LOG_PATH, 'utf8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: 'Could not read project log' });
    }
});

// API to get session usage
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

// API to get LLM message history (parsed JSONL)
app.get('/api/logs/llm', (req, res) => {
    try {
        const raw = fs.readFileSync(LLM_JSONL_PATH, 'utf8');
        const lines = raw.trim().split('\n').map(l => JSON.parse(l));
        
        // Filter for messages and format for display
        const history = lines
            .filter(item => item.type === 'message')
            .map(item => ({
                id: item.id,
                role: item.message.role,
                text: item.message.content.find(c => c.type === 'text')?.text || "[Media/Tool]",
                tokens: item.message.usage?.totalTokens || 0,
                timestamp: item.timestamp
            }));
            
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: 'Could not read LLM history' });
    }
});

app.listen(PORT, () => {
    console.log(`Log Viewer API running at http://localhost:${PORT}`);
});
