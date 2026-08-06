/* ReadTrack — netlify/functions/teacher-data.js */
'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode:405, body:JSON.stringify({error:'Method not allowed'}) };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode:500, body:JSON.stringify({error:'Server not configured'}) };
  }

  const { classCode, type } = event.queryStringParameters || {};
  if (!classCode || !type) {
    return { statusCode:400, body:JSON.stringify({error:'classCode and type required'}) };
  }

  const headers = {
    'apikey':        SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type':  'application/json',
  };

  const code = encodeURIComponent(classCode.toUpperCase());

  try {
    let url;
    if (type === 'sessions') {
      url = `${SUPABASE_URL}/rest/v1/sessions?class_code=eq.${code}&order=created_at.desc&limit=500`;
    } else if (type === 'students') {
      url = `${SUPABASE_URL}/rest/v1/students?class_code=eq.${code}&order=joined_at.desc`;
    } else {
      return { statusCode:400, body:JSON.stringify({error:'Invalid type'}) };
    }

    const res  = await fetch(url, { headers });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode:500, body:JSON.stringify({error:'Database error: ' + txt}) };
    }

    const data = await res.json();
    return { statusCode:200, body:JSON.stringify({success:true, data}) };

  } catch(e) {
    return { statusCode:500, body:JSON.stringify({error:'Server error: ' + e.message}) };
  }
};
