/* ============================================================
   ReadTrack V2 — netlify/functions/session.js
   Netlify Serverless Function
   Endpoint: POST /.netlify/functions/session
   ============================================================ */

'use strict';

const fetch    = require('node-fetch');
const FormData = require('form-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const BASE_URL  = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Parse multipart/form-data ────────────────────────────────
function parseMultipart(event) {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  const boundary    = contentType.split('boundary=')[1];
  if (!boundary) return { fields: {}, photoBuffer: null, photoName: 'verification.jpg' };

  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'binary');

  const fields    = {};
  let photoBuffer = null;
  let photoName   = 'verification.jpg';

  const boundaryBuf = Buffer.from('--' + boundary);
  const parts       = splitBuffer(bodyBuffer, boundaryBuf);

  for (const part of parts) {
    if (!part || part.length < 4) continue;
    const sepIdx = indexOfSeq(part, Buffer.from('\r\n\r\n'));
    if (sepIdx === -1) continue;

    const headers  = part.slice(0, sepIdx).toString('utf8');
    const bodyRaw  = part.slice(sepIdx + 4);
    const bodyTrim = bodyRaw.slice(0, bodyRaw.length - (bodyRaw.slice(-2).toString() === '\r\n' ? 2 : 0));

    const dispMatch = headers.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    if (!dispMatch) continue;

    const fieldName   = dispMatch[1];
    const fileMatch   = headers.match(/filename="([^"]+)"/i);

    if (fileMatch) {
      photoName   = fileMatch[1];
      photoBuffer = bodyTrim;
    } else {
      fields[fieldName] = bodyTrim.toString('utf8');
    }
  }
  return { fields, photoBuffer, photoName };
}

function splitBuffer(buf, delim) {
  const parts = []; let start = 0;
  let idx = buf.indexOf(delim, start);
  while (idx !== -1) { parts.push(buf.slice(start, idx)); start = idx + delim.length; idx = buf.indexOf(delim, start); }
  parts.push(buf.slice(start));
  return parts;
}

function indexOfSeq(buf, seq) {
  for (let i = 0; i <= buf.length - seq.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) { if (buf[i+j] !== seq[j]) { ok = false; break; } }
    if (ok) return i;
  }
  return -1;
}

// ── Sanitize ─────────────────────────────────────────────────
function str(val, max = 200) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>]/g, '').trim().slice(0, max);
}
function flt(val) { const n = parseFloat(val); return isNaN(n) ? null : n; }

// ── Format date string nicely ─────────────────────────────────
function fmtDate(iso) {
  if (!iso) return 'N/A';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

// ── Build Telegram message ────────────────────────────────────
function buildMessage(data) {
  const {
    sessionId, startTime, endTime, duration,
    latitude, longitude, accuracy,
    browser, os, device, screenRes,
    cameraOk, pdfName,
  } = data;

  const locationLine = (latitude && longitude)
    ? `📍 *Location:* \`${parseFloat(latitude).toFixed(6)}, ${parseFloat(longitude).toFixed(6)}\`\n📡 *GPS Accuracy:* ${accuracy ? parseFloat(accuracy).toFixed(1) + ' m' : 'N/A'}`
    : '📍 *Location:* Unavailable';

  const readingMaterial = pdfName ? `📄 *Reading Material:* ${pdfName}` : '📄 *Reading Material:* Not specified';

  return (
    `📚 *Reading Session Completed*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🆔 *Session ID:* \`${sessionId}\`\n` +
    `📅 *Date:* ${fmtDate(startTime).split(',')[0]}\n` +
    `🕐 *Start Time:* ${fmtDate(startTime)}\n` +
    `🕑 *End Time:*   ${fmtDate(endTime)}\n` +
    `⏱️ *Duration:*   ${duration}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${locationLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🌐 *Browser:*     ${browser}\n` +
    `💻 *OS:*          ${os}\n` +
    `📱 *Device:*      ${device}\n` +
    `🖥️ *Resolution:*  ${screenRes || 'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${readingMaterial}\n` +
    `📷 *Camera:* ${cameraOk === 'true' || cameraOk === true ? '✅ Verified' : '⚠️ Not captured'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *Session Status:* COMPLETED`
  );
}

// ── Send text ─────────────────────────────────────────────────
async function sendMessage(text) {
  const res  = await fetch(`${BASE_URL}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'Markdown' }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage: ${json.description}`);
  return json;
}

// ── Send photo ────────────────────────────────────────────────
async function sendPhoto(photoBuffer, filename, caption) {
  const form = new FormData();
  form.append('chat_id',    CHAT_ID);
  form.append('caption',    caption);
  form.append('parse_mode', 'Markdown');
  form.append('photo', photoBuffer, { filename, contentType: 'image/jpeg' });

  const res  = await fetch(`${BASE_URL}/sendPhoto`, { method: 'POST', body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendPhoto: ${json.description}`);
  return json;
}

// ── Netlify Handler ───────────────────────────────────────────
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }
  if (!BOT_TOKEN || !CHAT_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server not configured.' }) };
  }

  try {
    const { fields, photoBuffer, photoName } = parseMultipart(event);

    const sessionId = str(fields.sessionId, 50);
    if (!sessionId) return { statusCode: 400, body: JSON.stringify({ error: 'sessionId required.' }) };

    const data = {
      sessionId,
      startTime:  str(fields.startTime, 50),
      endTime:    str(fields.endTime,   50),
      duration:   str(fields.duration,  30),
      latitude:   flt(fields.latitude),
      longitude:  flt(fields.longitude),
      accuracy:   flt(fields.accuracy),
      browser:    str(fields.browser,  100),
      os:         str(fields.os,       100),
      device:     str(fields.device,    50),
      screenRes:  str(fields.screenRes, 20),
      cameraOk:   fields.cameraOk,
      pdfName:    str(fields.pdfName,  200),
    };

    const message = buildMessage(data);

    if (photoBuffer && photoBuffer.length > 0) {
      await sendPhoto(photoBuffer, photoName, message);
    } else {
      await sendMessage(message);
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, sessionId }) };

  } catch (err) {
    console.error('[Session Function]', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to process session.' }) };
  }
};
