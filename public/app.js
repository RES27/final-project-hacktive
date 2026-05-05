const chatLog = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const typingIndicator = document.getElementById('typingIndicator');
const resetBtn = document.getElementById('resetBtn');
const quickButtons = document.querySelectorAll('[data-action]');

const STORAGE_KEY = 'geminiChatSessionId';
let sessionId = localStorage.getItem(STORAGE_KEY) || null;
let isStreaming = false;

function addMessage(role, content) {
  const item = document.createElement('div');
  item.className = `chat-item ${role}`;
  item.textContent = content;
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setTyping(show) {
  typingIndicator.classList.toggle('hidden', !show);
}

async function fetchSessionHistory() {
  if (!sessionId) return;
  try {
    const response = await fetch(`/api/chat/${sessionId}`);
    if (!response.ok) return;
    const data = await response.json();
    chatLog.innerHTML = '';
    data.messages.forEach((message) => {
      if (message.role === 'system') return;
      addMessage(message.role, message.content);
    });
  } catch (error) {
    console.error(error);
  }
}

async function sendMessage(message, stream = true) {
  if (isStreaming) return;
  if (!message.trim()) return;

  addMessage('user', message.trim());
  messageInput.value = '';
  setTyping(true);

  try {
    if (stream) {
      await streamChat(message);
    } else {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      sessionId = data.sessionId;
      localStorage.setItem(STORAGE_KEY, sessionId);
      addMessage('assistant', data.message);
    }
  } catch (error) {
    addMessage('assistant', 'Maaf, sistem sedang sibuk. Coba lagi sebentar.');
    console.error(error);
  } finally {
    setTyping(false);
  }
}

async function streamChat(message) {
  isStreaming = true;
  const controller = new AbortController();
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
    signal: controller.signal
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data?.error || 'Streaming gagal');
  }

  sessionId = sessionId || response.headers.get('x-session-id');
  if (sessionId) localStorage.setItem(STORAGE_KEY, sessionId);

  const decoder = new TextDecoder();
  let assistantNode = document.createElement('div');
  assistantNode.className = 'chat-item assistant';
  assistantNode.textContent = '';
  chatLog.appendChild(assistantNode);
  chatLog.scrollTop = chatLog.scrollHeight;

  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop();

    for (const eventPayload of events) {
      if (!eventPayload.trim()) continue;
      const lines = eventPayload.split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const text = line.replace(/^data:\s*/, '');
          if (text === '[DONE]') {
            isStreaming = false;
            return;
          }
          assistantNode.textContent += text.replace(/\\n/g, '\n');
          chatLog.scrollTop = chatLog.scrollHeight;
        }
      }
    }
  }

  isStreaming = false;
}

async function resetSession() {
  if (!sessionId) {
    chatLog.innerHTML = '';
    addMessage('assistant', 'Sesi baru sudah siap. Silakan mulai percakapan.');
    return;
  }
  const response = await fetch(`/api/chat/${sessionId}/reset`, { method: 'POST' });
  if (!response.ok) {
    addMessage('assistant', 'Gagal reset sesi.');
    return;
  }
  const data = await response.json();
  sessionId = data.sessionId;
  localStorage.setItem(STORAGE_KEY, sessionId);
  chatLog.innerHTML = '';
  addMessage('assistant', 'Percakapan telah direset. Apa yang ingin Anda tanyakan?');
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendMessage(messageInput.value, true);
});

resetBtn.addEventListener('click', () => {
  resetSession();
});

quickButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'ulang') {
      sendMessage('Tolong ulangi jawaban sebelumnya dengan detail yang sama.', false);
    } else if (action === 'ringkas') {
      sendMessage('Tolong ringkas jawaban terakhir dengan poin-poin penting.', false);
    } else if (action === 'lanjut') {
      sendMessage('Berikan saran pertanyaan lanjutan yang cocok untuk topik ini.', false);
    }
  });
});

window.addEventListener('load', () => {
  if (!sessionId) {
    const session = localStorage.getItem(STORAGE_KEY);
    if (session) sessionId = session;
  }
  fetchSessionHistory();
});
