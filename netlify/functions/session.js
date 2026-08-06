/* ============================================================
   ReadTrack V2 — netlify/functions/session.js
   Uses native fetch (Node 18+) — no npm dependencies
   ============================================================ */
'use strict';

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID      = process.env.TELEGRAM_CHAT_ID;
const BASE_URL     = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ── Parse multipart/form-data ─────────────────────────────────
function parseMultipart(event) {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  const boundary    = contentType.split('boundary=')[1];
  if (!boundary) return { fields:{}, photoBuffer:null, photoName:'verification.jpg' };

  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'binary');

  const fields = {}; let photoBuffer = null; let photoName = 'verification.jpg';
  const boundaryBuf = Buffer.from('--' + boundary);
  const parts = splitBuffer(bodyBuffer, boundaryBuf);

  for (const part of parts) {
    if (!part || part.length < 4) continue;
    const sepIdx = indexOfSeq(part, Buffer.from('\r\n\r\n'));
    if (sepIdx === -1) continue;
    const headers  = part.slice(0, sepIdx).toString('utf8');
    const bodyRaw  = part.slice(sepIdx + 4);
    const bodyTrim = bodyRaw.slice(0, bodyRaw.length - (bodyRaw.slice(-2).toString() === '\r\n' ? 2 : 0));
    const dispMatch = headers.match(/Content-Disposition:[^\r\n]*name="([^"]+)"/i);
    if (!dispMatch) continue;
    const fieldName = dispMatch[1];
    const fileMatch = headers.match(/filename="([^"]+)"/i);
    if (fileMatch) { photoName = fileMatch[1]; photoBuffer = bodyTrim; }
    else { fields[fieldName] = bodyTrim.toString('utf8'); }
  }
  return { fields, photoBuffer, photoName };
}

function splitBuffer(buf, delim) {
  const parts = []; let start = 0;
  let idx = buf.indexOf(delim, start);
  while (idx !== -1) { parts.push(buf.slice(start, idx)); start = idx + delim.length; idx = buf.indexOf(delim, start); }
  parts.push(buf.slice(start)); return parts;
}

function indexOfSeq(buf, seq) {
  for (let i = 0; i <= buf.length - seq.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) { if (buf[i+j] !== seq[j]) { ok = false; break; } }
    if (ok) return i;
  } return -1;
}

function str(val, max=200) { if(typeof val!=='string') return ''; return val.replace(/[<>]/g,'').trim().slice(0,max); }
function flt(val) { const n=parseFloat(val); return isNaN(n)?null:n; }

function fmtDate(iso) {
  if (!iso) return 'N/A';
  try { return new Date(iso).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
  catch { return iso; }
}

function buildMessage(data) {
  const { sessionId,startTime,endTime,duration,latitude,longitude,accuracy,browser,os,device,screenRes,cameraOk,pdfName,studentName,classCode } = data;
  const locationLine = (latitude&&longitude)
    ? `📍 *Location:* \`${parseFloat(latitude).toFixed(6)}, ${parseFloat(longitude).toFixed(6)}\`\n📡 *GPS Accuracy:* ${accuracy?parseFloat(accuracy).toFixed(1)+' m':'N/A'}`
    : '📍 *Location:* Unavailable';
  const studentLine = studentName ? `👤 *Student:* ${studentName}\n🏫 *Class:* ${classCode||'Personal'}\n` : '';
  return (
    `📚 *Reading Session Completed*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${studentLine}` +
    `🆔 *Session ID:* \`${sessionId}\`\n` +
    `📅 *Date:* ${fmtDate(startTime).split(',')[0]}\n` +
    `🕐 *Start:* ${fmtDate(startTime)}\n` +
    `🕑 *End:*   ${fmtDate(endTime)}\n` +
    `⏱️ *Duration:* ${duration}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${locationLine}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🌐 *Browser:* ${browser}\n` +
    `💻 *OS:* ${os}\n` +
    `📱 *Device:* ${device}\n` +
    `🖥️ *Resolution:* ${screenRes||'N/A'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📄 *Material:* ${pdfName||'Not specified'}\n` +
    `📷 *Camera:* ${cameraOk==='true'||cameraOk===true?'✅ Verified':'⚠️ Not captured'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `✅ *Status:* COMPLETED`
  );
}

// ── Send text to Telegram ─────────────────────────────────────
async function sendMessage(text) {
  const res  = await fetch(`${BASE_URL}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:CHAT_ID,text,parse_mode:'Markdown'}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage: ${json.description}`);
  return json;
}

// ── Send photo to Telegram (using multipart manually) ─────────
async function sendPhoto(photoBuffer, filename, caption) {
  // Build multipart manually without form-data package
  const boundary = '----TelegramBoundary' + Date.now();
  const CRLF     = '\r\n';

  const metaParts = [
    `--${boundary}${CRLF}Content-Disposition: form-data; name="chat_id"${CRLF}${CRLF}${CHAT_ID}`,
    `--${boundary}${CRLF}Content-Disposition: form-data; name="parse_mode"${CRLF}${CRLF}Markdown`,
    `--${boundary}${CRLF}Content-Disposition: form-data; name="caption"${CRLF}${CRLF}${caption}`,
  ];

  const metaBuffer  = Buffer.from(metaParts.join(CRLF) + CRLF);
  const fileHeader  = Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="photo"; filename="${filename}"${CRLF}Content-Type: image/jpeg${CRLF}${CRLF}`);
  const fileFooter  = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
  const body        = Buffer.concat([metaBuffer, fileHeader, photoBuffer, fileFooter]);

  const res  = await fetch(`${BASE_URL}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendPhoto: ${json.description}`);
  return json;
}

// ── Save to Supabase ──────────────────────────────────────────
async function saveToSupabase(data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const headers = {
    'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,
    'Content-Type':'application/json','Prefer':'return=minimal',
  };
  if (data.studentName && data.classCode) {
    await fetch(`${SUPABASE_URL}/rest/v1/students`,{
      method:'POST',
      headers:{...headers,'Prefer':'return=minimal,resolution=ignore-duplicates'},
      body:JSON.stringify({name:data.studentName,class_code:data.classCode}),
    }).catch(()=>{});
  }
  await fetch(`${SUPABASE_URL}/rest/v1/sessions`,{
    method:'POST', headers,
    body:JSON.stringify({
      session_id:data.sessionId, student_name:data.studentName||'Anonymous',
      class_code:data.classCode||'NONE', start_time:data.startTime||null,
      end_time:data.endTime||null, duration_ms:data.durationMs?parseInt(data.durationMs):null,
      duration_text:data.duration||null, latitude:data.latitude||null,
      longitude:data.longitude||null, accuracy:data.accuracy||null,
      browser:data.browser||null, os:data.os||null, device:data.device||null,
      screen_res:data.screenRes||null,
      camera_ok:data.cameraOk==='true'||data.cameraOk===true,
      pdf_name:data.pdfName||null,
    }),
  });
}

// ── Handler ───────────────────────────────────────────────────
exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return {statusCode:405, body:JSON.stringify({error:'Method not allowed.'})};
  }
  if (!BOT_TOKEN || !CHAT_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return {statusCode:500, body:JSON.stringify({error:'Server not configured.'})};
  }

  try {
    const {fields, photoBuffer, photoName} = parseMultipart(event);
    const sessionId = str(fields.sessionId, 50);
    if (!sessionId) return {statusCode:400, body:JSON.stringify({error:'sessionId required.'})};

    const data = {
      sessionId,
      startTime:  str(fields.startTime,50),  endTime:    str(fields.endTime,50),
      duration:   str(fields.duration,30),   durationMs: str(fields.durationMs,20),
      latitude:   flt(fields.latitude),      longitude:  flt(fields.longitude),
      accuracy:   flt(fields.accuracy),      browser:    str(fields.browser,100),
      os:         str(fields.os,100),        device:     str(fields.device,50),
      screenRes:  str(fields.screenRes,20),  cameraOk:   fields.cameraOk,
      pdfName:    str(fields.pdfName,200),   studentName:str(fields.studentName,100),
      classCode:  str(fields.classCode,50),
    };

    const message = buildMessage(data);

    if (photoBuffer && photoBuffer.length > 0) {
      await sendPhoto(photoBuffer, photoName, message);
    } else {
      await sendMessage(message);
    }

    if (data.classCode && data.classCode !== 'NONE') {
      await saveToSupabase(data).catch(e=>console.error('Supabase error:',e.message));
    }

    return {statusCode:200, body:JSON.stringify({success:true, sessionId})};
  } catch(err) {
    console.error('[Session]', err.message);
    return {statusCode:500, body:JSON.stringify({error:'Failed to process session: '+err.message})};
  }
};
