# AI Chatbot Gemini Interaktif

Proyek ini adalah prototipe chatbot web dengan frontend native JavaScript dan backend Express.js. Integrasi model AI menggunakan `GEMINI_API_KEY` melalui environment variable.

## Fitur utama

- Chat interaktif dengan riwayat percakapan
- Streaming jawaban bot
- Quick reply buttons
- Reset sesi percakapan
- API endpoint untuk log dan kesehatan

## Struktur project

- `server.js` — backend Express dan endpoint AI
- `public/index.html` — antarmuka chat
- `public/style.css` — styling
- `public/app.js` — logika frontend

## Instalasi

1. Pasang dependensi:

```bash
npm install
```

2. Buat file `.env` berdasarkan `.env.example` dan tambahkan kunci API Anda.

3. Jalankan server:

```bash
npm start
```

4. Buka di browser:

```text
http://localhost:4000
```

## API

- `POST /api/chat` — kirim pesan ke bot
- `POST /api/chat/stream` — kirim pesan dan terima respons streaming
- `GET /api/chat/:sessionId` — ambil riwayat chat
- `POST /api/chat/:sessionId/reset` — reset percakapan
- `GET /api/logs` — lihat log internal sederhana
- `GET /api/health` — status server

## Catatan

- Pastikan `GEMINI_API_KEY` tidak disimpan di frontend.
- Endpoint `GEMINI_API_URL` mendukung kompatibilitas OpenAI/Google. Sesuaikan sesuai provider Anda.
