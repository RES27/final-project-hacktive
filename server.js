const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

const envResult = dotenv.config({ path: path.join(__dirname, '.env') });
if (envResult.error) {
  console.warn('Warning: .env file not loaded.', envResult.error.message || envResult.error);
}

const app = express();
const PORT = process.env.PORT || 4000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

if (!GEMINI_API_KEY) {
  console.warn('Warning: GEMINI_API_KEY is not set. The API will not work until the key is configured.');
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();
const logs = [];

function logEvent(type, message, metadata = {}) {
  const entry = { id: crypto.randomUUID(), type, message, metadata, createdAt: new Date().toISOString() };
  logs.unshift(entry);
  if (logs.length > 200) logs.pop();
  console.log(`[${type}]`, message, metadata);
}

function createSession(sessionId = null) {
  const id = sessionId || crypto.randomUUID();
  const session = {
    id,
    createdAt: new Date().toISOString(),
    messages: [
      {
        role: 'system',
        content:
          'Kamu adalah Gemini AI Chatbot yang ramah, interaktif, menggunakan bahasa Indonesia, memberikan jawaban ringkas dan relevan, dan selalu menawarkan saran follow-up.'
      }
    ]
  };
  sessions.set(id, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function buildGeminiPayload(messages) {
  const systemMessage = messages.find((item) => item.role === 'system')?.content || '';

  const contents = messages
    .filter((item) => item.role !== 'system')
    .slice(-12)
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }]
    }));

  return {
    ...(systemMessage
      ? {
          systemInstruction: {
            parts: [{ text: systemMessage }]
          }
        }
      : {}),
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 512
    }
  };
}

async function callGemini(messages) {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY in environment. Set GEMINI_API_KEY in .env or environment variables.');
  }

  const body = buildGeminiPayload(messages);

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    logEvent('error', 'Gemini API failed', { status: response.status, body: errorText });
    throw new Error('Gemini API error');
  }

  const data = await response.json();

  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts
    .map((part) => part.text || '')
    .join('')
    .trim();

  return content;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.get('/api/chat/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ sessionId: session.id, messages: session.messages });
});

app.post('/api/chat/:sessionId/reset', (req, res) => {
  const sessionId = req.params.sessionId;
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const newSession = createSession(sessionId);
  logEvent('session_reset', `Reset session ${sessionId}`);
  res.json({ sessionId: newSession.id, messages: newSession.messages });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const session = getSession(sessionId) || createSession(sessionId);
    session.messages.push({ role: 'user', content: message.trim() });

    const assistantText = await callGemini(session.messages);

    session.messages.push({ role: 'assistant', content: assistantText });
    logEvent('chat', 'New chat response', { sessionId: session.id, userMessage: message.trim() });

    res.json({ sessionId: session.id, message: assistantText, messages: session.messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Maaf, sistem sedang sibuk. Silakan coba lagi.' });
  }
});

app.post('/api/chat/stream', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const session = getSession(sessionId) || createSession(sessionId);
    session.messages.push({ role: 'user', content: message.trim() });

    const assistantText = await callGemini(session.messages);
    session.messages.push({ role: 'assistant', content: assistantText });
    logEvent('chat_stream', 'Streaming chat response', { sessionId: session.id, userMessage: message.trim() });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chunkSize = 80;
    for (let i = 0; i < assistantText.length; i += chunkSize) {
      const chunk = assistantText.slice(i, i + chunkSize);
      res.write(`data: ${chunk.replace(/\n/g, '\\n')}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    res.write('event: done\ndata: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error(error);
    res.write('event: error\ndata: Maaf, sistem sedang sibuk.\n\n');
    res.end();
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});