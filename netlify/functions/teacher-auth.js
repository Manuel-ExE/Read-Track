/* ReadTrack — netlify/functions/teacher-auth.js
   Validates teacher class code + PIN against Supabase */
'use strict';

const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode:405, body:JSON.stringify({error:'Method not allowed'}) };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode:500, body:JSON.stringify({error:'Server not configured'}) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch { return { statusCode:400, body:JSON.stringify({error:'Invalid JSON'}) }; }

  const { classCode, pin } = body;
  if (!classCode || !pin) return { statusCode:400, body:JSON.stringify({error:'classCode and pin required'}) };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/classes?class_code=eq.${encodeURIComponent(classCode.toUpperCase())}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    const data = await res.json();
    if (!data.length) return { statusCode:401, body:JSON.stringify({success:false, error:'Invalid class code'}) };

    const cls = data[0];
    if (cls.teacher_pin !== pin) return { statusCode:401, body:JSON.stringify({success:false, error:'Invalid PIN'}) };

    return { statusCode:200, body:JSON.stringify({ success:true, class:cls }) };
  } catch(e) {
    return { statusCode:500, body:JSON.stringify({error:'Database error: '+e.message}) };
  }
};
