/* ReadTrack — netlify/functions/teacher-auth.js */
'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode:405, body:JSON.stringify({error:'Method not allowed'}) };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    return { statusCode:500, body:JSON.stringify({error:'Server not configured. Check environment variables.'}) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode:400, body:JSON.stringify({error:'Invalid JSON'}) }; }

  const { classCode, pin } = body;
  if (!classCode || !pin) {
    return { statusCode:400, body:JSON.stringify({error:'classCode and pin required'}) };
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/classes?class_code=eq.${encodeURIComponent(classCode.toUpperCase())}&select=*`;
    const res  = await fetch(url, {
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json',
      }
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('Supabase error:', res.status, txt);
      return { statusCode:500, body:JSON.stringify({error:'Database error: ' + res.status}) };
    }

    const data = await res.json();
    console.log('Query result:', JSON.stringify(data));

    if (!Array.isArray(data) || data.length === 0) {
      return { statusCode:401, body:JSON.stringify({success:false, error:'Invalid class code'}) };
    }

    const cls = data[0];
    if (String(cls.teacher_pin) !== String(pin)) {
      return { statusCode:401, body:JSON.stringify({success:false, error:'Invalid PIN'}) };
    }

    return { statusCode:200, body:JSON.stringify({success:true, class:cls}) };

  } catch(e) {
    console.error('Handler error:', e.message);
    return { statusCode:500, body:JSON.stringify({error:'Server error: ' + e.message}) };
  }
};
