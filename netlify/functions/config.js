/* ReadTrack — netlify/functions/config.js
   Returns public config (Supabase URL + anon key) to frontend
   The anon key is safe to expose — it's public by design */
'use strict';

exports.handler = async function() {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    body: JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL     || 'https://oejeoqfvpvalnxnurbvm.supabase.co',
      supabaseKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lamVvcWZ2cHZhbG54bnVyYnZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMTgzMzAsImV4cCI6MjEwMTU5NDMzMH0.iRJYkITvATyniLZP5gKDuF4ZYxoMNhF12t5FThUbWKI',
    }),
  };
};
