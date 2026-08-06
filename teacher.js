/* ReadTrack — teacher.js */
'use strict';

// ── State ─────────────────────────────────────────────────────
let currentClass = null;
let allSessions  = [];
let allStudents  = [];
let assignments  = [];

// ── Helpers ───────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function fmt(ms) {
  if (!ms) return '—';
  const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return [h,m,sec].map(v=>String(v).padStart(2,'0')).join(':');
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function loadLocal(key,fb){ try{const v=localStorage.getItem(key);return v?JSON.parse(v):fb;}catch{return fb;} }
function saveLocal(key,val){ try{localStorage.setItem(key,JSON.stringify(val));}catch{} }

// ── API ───────────────────────────────────────────────────────
async function apiCall(path, method='GET', body=null) {
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error('API error: ' + res.status);
  return res.json();
}

// ── Login ─────────────────────────────────────────────────────
$('btn-login')?.addEventListener('click', async () => {
  const code = $('input-class-code')?.value.trim().toUpperCase();
  const pin  = $('input-pin')?.value.trim();
  const errEl= $('login-error');
  const btn  = $('btn-login');

  if (!code || !pin) { if(errEl){errEl.textContent='Please enter class code and PIN.';errEl.classList.remove('hidden');} return; }

  btn.disabled=true; btn.textContent='Signing in…';
  if(errEl) errEl.classList.add('hidden');

  try {
    const data = await apiCall(`/.netlify/functions/teacher-auth`, 'POST', { classCode:code, pin });
    if (!data.success) throw new Error(data.error || 'Invalid credentials');

    currentClass = data.class;
    saveLocal('rt-teacher-session', { classCode:code, className:data.class.class_name, teacherName:data.class.teacher_name });

    showDashboard();
  } catch (e) {
    if(errEl){ errEl.textContent='Error: ' + e.message; errEl.classList.remove('hidden'); }
    btn.disabled=false; btn.textContent='Sign In';
  }
});

function showDashboard() {
  $('t-page-login')?.classList.remove('active');
  $('t-page-dashboard')?.classList.add('active');
  if($('t-class-name-label')) $('t-class-name-label').textContent = currentClass?.class_name || '—';
  if($('t-class-code-label')) $('t-class-code-label').textContent = 'Code: ' + (currentClass?.class_code || '—');
  loadAllData();
}

// ── Load Data ─────────────────────────────────────────────────
async function loadAllData() {
  if (!currentClass) return;
  try {
    const [sessData, studData] = await Promise.all([
      apiCall(`/.netlify/functions/teacher-data?classCode=${currentClass.class_code}&type=sessions`),
      apiCall(`/.netlify/functions/teacher-data?classCode=${currentClass.class_code}&type=students`),
    ]);
    allSessions = sessData.data || [];
    allStudents = studData.data || [];
    assignments = loadLocal('rt-assignments-'+currentClass.class_code, []);
    renderOverview();
    renderStudents();
    renderSessions();
    renderAssignments();
  } catch(e) {
    console.error('Failed to load data:', e);
  }
}

// ── Overview ──────────────────────────────────────────────────
function renderOverview() {
  const totalMs    = allSessions.reduce((a,s)=>a+(s.duration_ms||0),0);
  const verified   = allSessions.filter(s=>s.camera_ok&&s.latitude).length;
  const verifiedPct= allSessions.length ? Math.round(verified/allSessions.length*100) : 0;

  if($('stat-students')) $('stat-students').textContent = allStudents.length;
  if($('stat-sessions')) $('stat-sessions').textContent = allSessions.length;
  if($('stat-hours'))    $('stat-hours').textContent    = Math.floor(totalMs/3600000)+'h '+ Math.floor((totalMs%3600000)/60000)+'m';
  if($('stat-verified')) $('stat-verified').textContent = verifiedPct+'%';

  const wrap = $('recent-sessions-list');
  if (!wrap) return;
  const recent = [...allSessions].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,10);
  wrap.innerHTML = recent.length ? buildSessionTable(recent) : '<div class="t-empty">No sessions yet.</div>';
}

// ── Students ──────────────────────────────────────────────────
function renderStudents(filter='') {
  const wrap = $('students-list');
  if (!wrap) return;
  const list = filter ? allStudents.filter(s=>s.name.toLowerCase().includes(filter.toLowerCase())) : allStudents;
  if (!list.length) { wrap.innerHTML='<div class="t-empty">No students found.</div>'; return; }

  const rows = list.map(s=>{
    const sess = allSessions.filter(x=>x.student_name===s.name);
    const totalMs = sess.reduce((a,x)=>a+(x.duration_ms||0),0);
    return `<tr>
      <td><strong>${s.name}</strong></td>
      <td>${sess.length}</td>
      <td>${fmt(totalMs)}</td>
      <td>${sess.length?fmtDate(sess.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0].created_at):'—'}</td>
      <td><span class="t-badge ${sess.length?'t-badge-green':'t-badge-yellow'}">${sess.length?'Active':'No sessions'}</span></td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="t-table">
    <thead><tr><th>Name</th><th>Sessions</th><th>Total Time</th><th>Last Session</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

$('search-students')?.addEventListener('input', e=>renderStudents(e.target.value));

// ── Sessions ──────────────────────────────────────────────────
function renderSessions(nameFilter='', dateFilter='') {
  const wrap = $('sessions-list');
  if (!wrap) return;
  let list = [...allSessions].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if (nameFilter) list=list.filter(s=>s.student_name?.toLowerCase().includes(nameFilter.toLowerCase()));
  if (dateFilter) list=list.filter(s=>s.created_at?.slice(0,10)===dateFilter);
  wrap.innerHTML = list.length ? buildSessionTable(list) : '<div class="t-empty">No sessions found.</div>';
}

function buildSessionTable(list) {
  const rows = list.map(s=>{
    const verified = s.camera_ok && s.latitude;
    return `<tr>
      <td><strong>${s.student_name||'—'}</strong></td>
      <td>${fmtDate(s.created_at)}</td>
      <td>${fmt(s.duration_ms)}</td>
      <td>${s.pdf_name||'—'}</td>
      <td>${s.device||'—'}</td>
      <td><span class="t-badge ${verified?'t-badge-green':'t-badge-yellow'}">${verified?'Verified':'Partial'}</span></td>
    </tr>`;
  }).join('');
  return `<table class="t-table">
    <thead><tr><th>Student</th><th>Date</th><th>Duration</th><th>Material</th><th>Device</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

$('search-sessions')?.addEventListener('input', e=>renderSessions(e.target.value, $('filter-date')?.value||''));
$('filter-date')?.addEventListener('change', e=>renderSessions($('search-sessions')?.value||'', e.target.value));
$('btn-clear-filters')?.addEventListener('click',()=>{ if($('search-sessions'))$('search-sessions').value=''; if($('filter-date'))$('filter-date').value=''; renderSessions(); });

// ── Assignments ───────────────────────────────────────────────
function renderAssignments() {
  const list = $('assignments-list');
  if (!list) return;
  if (!assignments.length) { list.innerHTML='<div class="t-empty">No assignments yet.</div>'; return; }
  list.innerHTML = assignments.map((a,i)=>`
    <div class="t-assignment-card">
      <div class="t-assignment-info">
        <div class="t-assignment-title">${a.title}</div>
        <div class="t-assignment-meta">Duration: ${a.duration} min · Due: ${a.due||'No due date'} · ${a.desc||''}</div>
      </div>
      <button class="t-assignment-del" data-idx="${i}">Delete</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-idx]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      assignments.splice(parseInt(btn.dataset.idx),1);
      saveLocal('rt-assignments-'+currentClass.class_code, assignments);
      renderAssignments();
    });
  });
}

$('btn-create-assignment')?.addEventListener('click',()=>{
  const title    = $('assign-title')?.value.trim();
  const duration = $('assign-duration')?.value;
  const due      = $('assign-due')?.value;
  const desc     = $('assign-desc')?.value.trim();
  if (!title||!duration){alert('Please enter title and duration.');return;}
  assignments.push({title,duration:parseInt(duration),due,desc,createdAt:new Date().toISOString()});
  saveLocal('rt-assignments-'+currentClass.class_code, assignments);
  if($('assign-title'))    $('assign-title').value='';
  if($('assign-duration')) $('assign-duration').value='';
  if($('assign-due'))      $('assign-due').value='';
  if($('assign-desc'))     $('assign-desc').value='';
  renderAssignments();
});

// ── Export CSV ────────────────────────────────────────────────
$('btn-export-csv')?.addEventListener('click',()=>{
  if (!allSessions.length){alert('No sessions to export.');return;}
  const headers=['Session ID','Student','Date','Duration','Duration (ms)','Latitude','Longitude','Accuracy','Browser','OS','Device','Screen','Camera OK','PDF Name'];
  const rows=allSessions.map(s=>[
    s.session_id, s.student_name, s.created_at, s.duration_text, s.duration_ms,
    s.latitude, s.longitude, s.accuracy, s.browser, s.os, s.device, s.screen_res,
    s.camera_ok?'Yes':'No', s.pdf_name||''
  ].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));
  const csv='data:text/csv;charset=utf-8,'+[headers.join(','),...rows].join('\n');
  const link=document.createElement('a');
  link.href=encodeURI(csv);
  link.download=`ReadTrack-${currentClass?.class_code||'export'}-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
});

// ── Navigation ────────────────────────────────────────────────
const viewTitles={overview:'Overview',students:'Students',sessions:'Sessions',assignments:'Assignments'};
document.querySelectorAll('.t-nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const view=btn.dataset.view;
    document.querySelectorAll('.t-nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.t-view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    $('view-'+view)?.classList.add('active');
    if($('t-view-title')) $('t-view-title').textContent=viewTitles[view]||view;
    $('t-sidebar')?.classList.remove('open');
  });
});

$('btn-menu-toggle')?.addEventListener('click',()=>$('t-sidebar')?.classList.toggle('open'));
$('btn-sidebar-close')?.addEventListener('click',()=>$('t-sidebar')?.classList.remove('open'));
$('btn-refresh')?.addEventListener('click',()=>loadAllData());
$('btn-logout')?.addEventListener('click',()=>{
  currentClass=null; allSessions=[]; allStudents=[];
  localStorage.removeItem('rt-teacher-session');
  $('t-page-dashboard')?.classList.remove('active');
  $('t-page-login')?.classList.add('active');
});

// ── Auto-restore session ──────────────────────────────────────
const saved = loadLocal('rt-teacher-session', null);
if (saved) {
  currentClass = { class_code: saved.classCode, class_name: saved.className, teacher_name: saved.teacherName };
  showDashboard();
}
