/* ReadTrack — teacher.js V2 (Charts + PDF Reports + Auth) */
'use strict';

let currentClass = null;
let allSessions  = [];
let allStudents  = [];
let assignments  = [];
let charts       = {};
let authToken    = '';

function $(id) { return document.getElementById(id); }

// Get auth token from stored session
function getToken() {
  try {
    const s = JSON.parse(localStorage.getItem('rt-auth')||'null');
    return (s && s.expiresAt > Date.now()) ? s.token : '';
  } catch { return ''; }
}

// Check if teacher is logged in via auth
function checkAuthLogin() {
  const profile = JSON.parse(localStorage.getItem('rt-profile')||'null');
  const session = JSON.parse(localStorage.getItem('rt-auth')||'null');
  if (profile?.role === 'teacher' && session?.token && session.expiresAt > Date.now()) {
    return { profile, token: session.token };
  }
  return null;
}

function $(id) { return document.getElementById(id); }

function fmt(ms) {
  if (!ms) return '—';
  const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return [h,m,sec].map(v=>String(v).padStart(2,'0')).join(':');
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function loadLocal(key,fb){ try{const v=localStorage.getItem(key);return v?JSON.parse(v):fb;}catch{return fb;} }
function saveLocal(key,val){ try{localStorage.setItem(key,JSON.stringify(val));}catch{} }

async function apiCall(path,method='GET',body=null){
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(body) opts.body=JSON.stringify(body);
  const res=await fetch(path,opts);
  if(!res.ok) throw new Error('API error: '+res.status);
  return res.json();
}

// ── Login ──────────────────────────────────────────────────────
$('btn-login')?.addEventListener('click',async()=>{
  const code=$('input-class-code')?.value.trim().toUpperCase();
  const pin=$('input-pin')?.value.trim();
  const errEl=$('login-error');
  const btn=$('btn-login');
  if(!code||!pin){if(errEl){errEl.textContent='Please enter class code and PIN.';errEl.classList.remove('hidden');}return;}
  btn.disabled=true;btn.textContent='Signing in…';
  if(errEl) errEl.classList.add('hidden');
  try{
    const data=await apiCall('/.netlify/functions/teacher-auth','POST',{classCode:code,pin});
    if(!data.success) throw new Error(data.error||'Invalid credentials');
    currentClass=data.class;
    saveLocal('rt-teacher-session',{classCode:code,className:data.class.class_name,teacherName:data.class.teacher_name});
    showDashboard();
  }catch(e){
    if(errEl){errEl.textContent='Error: '+e.message;errEl.classList.remove('hidden');}
    btn.disabled=false;btn.textContent='Sign In';
  }
});

function showDashboard(){
  $('t-page-login')?.classList.remove('active');
  $('t-page-dashboard')?.classList.add('active');
  if($('t-class-name-label')) $('t-class-name-label').textContent=currentClass?.class_name||'—';
  if($('t-class-code-label')) $('t-class-code-label').textContent='Code: '+(currentClass?.class_code||'—');
  loadAllData();
}

// ── Load Data ──────────────────────────────────────────────────
async function loadAllData(){
  if(!currentClass) return;
  try{
    const [sessData,studData]=await Promise.all([
      apiCall(`/.netlify/functions/teacher-data?classCode=${currentClass.class_code}&type=sessions`),
      apiCall(`/.netlify/functions/teacher-data?classCode=${currentClass.class_code}&type=students`),
    ]);
    allSessions=sessData.data||[];
    allStudents=studData.data||[];
    assignments=loadLocal('rt-assignments-'+currentClass.class_code,[]);
    renderOverview();
    renderStudents();
    renderSessions();
    renderAssignments();
  }catch(e){console.error('Load error:',e);}
}

// ── Overview ───────────────────────────────────────────────────
function renderOverview(){
  const totalMs=allSessions.reduce((a,s)=>a+(s.duration_ms||0),0);
  const verified=allSessions.filter(s=>s.camera_ok&&s.latitude).length;
  const verPct=allSessions.length?Math.round(verified/allSessions.length*100):0;
  const today=new Date().toISOString().slice(0,10);
  const todaySessions=allSessions.filter(s=>s.created_at?.slice(0,10)===today).length;

  // Top reader
  const byStudent={};
  allSessions.forEach(s=>{
    if(!byStudent[s.student_name]) byStudent[s.student_name]=0;
    byStudent[s.student_name]+=(s.duration_ms||0);
  });
  const sorted=Object.entries(byStudent).sort((a,b)=>b[1]-a[1]);
  const topReader=sorted[0]?sorted[0][0]:'—';

  if($('stat-students'))  $('stat-students').textContent=allStudents.length;
  if($('stat-sessions'))  $('stat-sessions').textContent=allSessions.length;
  if($('stat-hours'))     $('stat-hours').textContent=Math.floor(totalMs/3600000)+'h '+Math.floor((totalMs%3600000)/60000)+'m';
  if($('stat-verified'))  $('stat-verified').textContent=verPct+'%';
  if($('stat-top-reader'))$('stat-top-reader').textContent=topReader;
  if($('stat-today'))     $('stat-today').textContent=todaySessions;

  // Top readers list
  const topList=$('top-readers-list');
  if(topList){
    const rankClass=['gold','silver','bronze'];
    const rankEmoji=['🥇','🥈','🥉'];
    const maxMs=sorted[0]?sorted[0][1]:1;
    topList.innerHTML=sorted.slice(0,5).map(([name,ms],i)=>`
      <div class="top-reader-item">
        <div class="top-reader-rank ${rankClass[i]||''}">${rankEmoji[i]||i+1}</div>
        <div class="top-reader-name">${name}</div>
        <div class="top-reader-bar-wrap">
          <div class="top-reader-bar" style="width:${Math.round(ms/maxMs*100)}%"></div>
        </div>
        <div class="top-reader-time">${fmt(ms)}</div>
      </div>
    `).join('')||'<div class="t-empty">No sessions yet.</div>';
  }

  // Recent sessions
  const wrap=$('recent-sessions-list');
  if(wrap){
    const recent=[...allSessions].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8);
    wrap.innerHTML=recent.length?buildSessionTable(recent):'<div class="t-empty">No sessions yet.</div>';
  }
}

// ── Students ───────────────────────────────────────────────────
function renderStudents(filter=''){
  const wrap=$('students-list');
  if(!wrap) return;
  const list=filter?allStudents.filter(s=>s.name.toLowerCase().includes(filter.toLowerCase())):allStudents;
  if(!list.length){wrap.innerHTML='<div class="t-empty">No students found.</div>';return;}
  const rows=list.map(s=>{
    const sess=allSessions.filter(x=>x.student_name===s.name);
    const totalMs=sess.reduce((a,x)=>a+(x.duration_ms||0),0);
    const lastSess=sess.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0];
    return `<tr>
      <td><strong>${s.name}</strong></td>
      <td>${sess.length}</td>
      <td>${fmt(totalMs)}</td>
      <td>${lastSess?fmtDate(lastSess.created_at):'—'}</td>
      <td><span class="t-badge ${sess.length?'t-badge-green':'t-badge-yellow'}">${sess.length?'Active':'No sessions'}</span></td>
    </tr>`;
  }).join('');
  wrap.innerHTML=`<table class="t-table"><thead><tr><th>Name</th><th>Sessions</th><th>Total Time</th><th>Last Session</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

$('search-students')?.addEventListener('input',e=>renderStudents(e.target.value));

// ── Sessions ───────────────────────────────────────────────────
function renderSessions(nameFilter='',dateFilter=''){
  const wrap=$('sessions-list');
  if(!wrap) return;
  let list=[...allSessions].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(nameFilter) list=list.filter(s=>s.student_name?.toLowerCase().includes(nameFilter.toLowerCase()));
  if(dateFilter) list=list.filter(s=>s.created_at?.slice(0,10)===dateFilter);
  wrap.innerHTML=list.length?buildSessionTable(list):'<div class="t-empty">No sessions found.</div>';
}

function buildSessionTable(list){
  const rows=list.map(s=>{
    const verified=s.camera_ok&&s.latitude;
    return `<tr>
      <td><strong>${s.student_name||'—'}</strong></td>
      <td>${fmtDate(s.created_at)}</td>
      <td>${fmt(s.duration_ms)}</td>
      <td>${s.pdf_name||'—'}</td>
      <td>${s.device||'—'}</td>
      <td><span class="t-badge ${verified?'t-badge-green':'t-badge-yellow'}">${verified?'Verified':'Partial'}</span></td>
    </tr>`;
  }).join('');
  return `<table class="t-table"><thead><tr><th>Student</th><th>Date</th><th>Duration</th><th>Material</th><th>Device</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

$('search-sessions')?.addEventListener('input',e=>renderSessions(e.target.value,$('filter-date')?.value||''));
$('filter-date')?.addEventListener('change',e=>renderSessions($('search-sessions')?.value||'',e.target.value));
$('btn-clear-filters')?.addEventListener('click',()=>{
  if($('search-sessions'))$('search-sessions').value='';
  if($('filter-date'))$('filter-date').value='';
  renderSessions();
});

// ── Charts ─────────────────────────────────────────────────────
function renderCharts(){
  renderSessionsPerDayChart();
  renderTimePerStudentChart();
  renderSessionsPerStudentChart();
  renderVerificationChart();
}

function getChartColors(){
  const dark = window.matchMedia('(prefers-color-scheme:dark)').matches;
  return {
    grid:  dark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
    text:  dark?'#94a3b8':'#64748b',
    bg:    dark?'#1e293b':'#ffffff',
  };
}

function destroyChart(id){
  if(charts[id]){ charts[id].destroy(); delete charts[id]; }
}

function renderSessionsPerDayChart(){
  destroyChart('perDay');
  const canvas=$('chart-sessions-per-day');
  if(!canvas) return;
  const days=14;
  const labels=[], counts=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(Date.now()-i*86400000);
    const str=d.toISOString().slice(0,10);
    labels.push(fmtDateShort(str));
    counts.push(allSessions.filter(s=>s.created_at?.slice(0,10)===str).length);
  }
  const c=getChartColors();
  charts.perDay=new Chart(canvas,{
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'Sessions',
        data:counts,
        backgroundColor:'rgba(99,102,241,0.7)',
        borderColor:'#6366f1',
        borderWidth:2,
        borderRadius:6,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{color:c.grid},ticks:{color:c.text,font:{size:11}}},
        y:{grid:{color:c.grid},ticks:{color:c.text,stepSize:1,font:{size:11}},beginAtZero:true},
      }
    }
  });
}

function renderTimePerStudentChart(){
  destroyChart('timePerStudent');
  const canvas=$('chart-time-per-student');
  if(!canvas) return;
  const byStudent={};
  allSessions.forEach(s=>{ byStudent[s.student_name]=(byStudent[s.student_name]||0)+(s.duration_ms||0); });
  const sorted=Object.entries(byStudent).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const c=getChartColors();
  charts.timePerStudent=new Chart(canvas,{
    type:'bar',
    data:{
      labels:sorted.map(([n])=>n),
      datasets:[{
        label:'Minutes',
        data:sorted.map(([,ms])=>Math.round(ms/60000)),
        backgroundColor:'rgba(139,92,246,0.7)',
        borderColor:'#8b5cf6',
        borderWidth:2,
        borderRadius:6,
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{color:c.grid},ticks:{color:c.text,font:{size:11}}},
        y:{grid:{color:c.grid},ticks:{color:c.text,font:{size:11}}},
      }
    }
  });
}

function renderSessionsPerStudentChart(){
  destroyChart('sessPerStudent');
  const canvas=$('chart-sessions-per-student');
  if(!canvas) return;
  const byStudent={};
  allSessions.forEach(s=>{ byStudent[s.student_name]=(byStudent[s.student_name]||0)+1; });
  const sorted=Object.entries(byStudent).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const c=getChartColors();
  charts.sessPerStudent=new Chart(canvas,{
    type:'bar',
    data:{
      labels:sorted.map(([n])=>n),
      datasets:[{
        label:'Sessions',
        data:sorted.map(([,v])=>v),
        backgroundColor:'rgba(6,182,212,0.7)',
        borderColor:'#06b6d4',
        borderWidth:2,
        borderRadius:6,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{grid:{color:c.grid},ticks:{color:c.text,font:{size:11}}},
        y:{grid:{color:c.grid},ticks:{color:c.text,stepSize:1,font:{size:11}},beginAtZero:true},
      }
    }
  });
}

function renderVerificationChart(){
  destroyChart('verify');
  const canvas=$('chart-verification');
  if(!canvas) return;
  const verified=allSessions.filter(s=>s.camera_ok&&s.latitude).length;
  const partial=allSessions.length-verified;
  charts.verify=new Chart(canvas,{
    type:'doughnut',
    data:{
      labels:['Verified','Partial'],
      datasets:[{
        data:[verified,partial],
        backgroundColor:['rgba(34,197,94,0.8)','rgba(245,158,11,0.8)'],
        borderColor:['#22c55e','#f59e0b'],
        borderWidth:2,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{color:getChartColors().text,font:{size:12}}}}
    }
  });
}

// ── PDF Report ─────────────────────────────────────────────────
function generatePDFReport(){
  const canvas=$('report-canvas');
  if(!canvas) return;

  const dateFrom=$('report-date-from')?.value||'';
  const dateTo=$('report-date-to')?.value||'';

  let sessions=[...allSessions].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(dateFrom) sessions=sessions.filter(s=>s.created_at?.slice(0,10)>=dateFrom);
  if(dateTo)   sessions=sessions.filter(s=>s.created_at?.slice(0,10)<=dateTo);

  const W=800, H=Math.max(600, 280+sessions.length*36+100);
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');

  // Background
  ctx.fillStyle='#0f172a';
  ctx.fillRect(0,0,W,H);

  // Header gradient
  const hg=ctx.createLinearGradient(0,0,W,120);
  hg.addColorStop(0,'#1e1b4b');
  hg.addColorStop(1,'#312e81');
  ctx.fillStyle=hg;
  ctx.fillRect(0,0,W,120);

  // Logo + title
  ctx.font='bold 28px sans-serif';
  ctx.fillStyle='#ffffff';
  ctx.textAlign='left';
  ctx.fillText('📚 ReadTrack — Class Report', 32, 48);

  ctx.font='14px sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.6)';
  ctx.fillText(`Class: ${currentClass?.class_name||'—'}  ·  Code: ${currentClass?.class_code||'—'}  ·  Teacher: ${currentClass?.teacher_name||'—'}`, 32, 76);
  ctx.fillText(`Generated: ${new Date().toLocaleString()}  ·  Period: ${dateFrom||'All time'} → ${dateTo||'Today'}`, 32, 100);

  // Stats bar
  const totalMs=sessions.reduce((a,s)=>a+(s.duration_ms||0),0);
  const verified=sessions.filter(s=>s.camera_ok&&s.latitude).length;
  const stats=[
    ['Total Sessions', sessions.length],
    ['Students',       allStudents.length],
    ['Total Time',     Math.floor(totalMs/3600000)+'h '+Math.floor((totalMs%3600000)/60000)+'m'],
    ['Verified',       verified+'/'+sessions.length],
  ];
  ctx.fillStyle='rgba(255,255,255,0.05)';
  ctx.fillRect(0,120,W,60);
  stats.forEach(([label,val],i)=>{
    const x=32+i*(W/4);
    ctx.font='bold 18px sans-serif';
    ctx.fillStyle='#818cf8';
    ctx.fillText(String(val),x,152);
    ctx.font='11px sans-serif';
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.fillText(label,x,170);
  });

  // Table header
  const cols=[['Student',180],['Date',160],['Duration',100],['Material',160],['Status',80]];
  let y=210;
  ctx.fillStyle='rgba(99,102,241,0.2)';
  ctx.fillRect(0,y-20,W,32);
  ctx.font='bold 12px sans-serif';
  ctx.fillStyle='#818cf8';
  ctx.textAlign='left';
  let x=32;
  cols.forEach(([label,w])=>{ ctx.fillText(label,x,y); x+=w; });

  // Rows
  sessions.forEach((s,i)=>{
    y+=36;
    if(i%2===0){ ctx.fillStyle='rgba(255,255,255,0.02)'; ctx.fillRect(0,y-20,W,32); }
    ctx.font='13px sans-serif';
    ctx.fillStyle='#e2e8f0';
    x=32;
    const rowData=[
      s.student_name||'—',
      fmtDate(s.created_at),
      fmt(s.duration_ms),
      (s.pdf_name||'—').slice(0,20),
      (s.camera_ok&&s.latitude)?'✅ Verified':'⚠️ Partial',
    ];
    cols.forEach(([,w],ci)=>{ ctx.fillText(rowData[ci],x,y); x+=w; });
  });

  // Footer
  ctx.fillStyle='rgba(255,255,255,0.1)';
  ctx.fillRect(0,H-40,W,40);
  ctx.font='12px sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.textAlign='center';
  ctx.fillText('ReadTrack — read-track.netlify.app',W/2,H-16);

  // Show preview
  $('report-preview')?.classList.remove('hidden');

  // Download
  const link=document.createElement('a');
  link.download=`ReadTrack-Report-${currentClass?.class_code||'class'}-${new Date().toISOString().slice(0,10)}.png`;
  link.href=canvas.toDataURL('image/png');
  link.click();
}

$('btn-generate-pdf')?.addEventListener('click', generatePDFReport);

$('btn-export-csv-report')?.addEventListener('click',()=>{
  if(!allSessions.length){alert('No sessions to export.');return;}
  const dateFrom=$('report-date-from')?.value||'';
  const dateTo=$('report-date-to')?.value||'';
  let sessions=[...allSessions];
  if(dateFrom) sessions=sessions.filter(s=>s.created_at?.slice(0,10)>=dateFrom);
  if(dateTo)   sessions=sessions.filter(s=>s.created_at?.slice(0,10)<=dateTo);
  exportCSV(sessions);
});

// ── Assignments ────────────────────────────────────────────────
function renderAssignments(){
  const list=$('assignments-list');
  if(!list) return;
  if(!assignments.length){list.innerHTML='<div class="t-empty">No assignments yet.</div>';return;}
  list.innerHTML=assignments.map((a,i)=>`
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
      saveLocal('rt-assignments-'+currentClass.class_code,assignments);
      renderAssignments();
    });
  });
}

$('btn-create-assignment')?.addEventListener('click',()=>{
  const title=$('assign-title')?.value.trim();
  const duration=$('assign-duration')?.value;
  const due=$('assign-due')?.value;
  const desc=$('assign-desc')?.value.trim();
  if(!title||!duration){alert('Please enter title and duration.');return;}
  assignments.push({title,duration:parseInt(duration),due,desc,createdAt:new Date().toISOString()});
  saveLocal('rt-assignments-'+currentClass.class_code,assignments);
  if($('assign-title'))    $('assign-title').value='';
  if($('assign-duration')) $('assign-duration').value='';
  if($('assign-due'))      $('assign-due').value='';
  if($('assign-desc'))     $('assign-desc').value='';
  renderAssignments();
});

// ── CSV Export ─────────────────────────────────────────────────
function exportCSV(sessions){
  const headers=['Session ID','Student','Date','Duration','Duration (ms)','Latitude','Longitude','Accuracy','Browser','OS','Device','Screen','Camera OK','PDF Name'];
  const rows=sessions.map(s=>[
    s.session_id,s.student_name,s.created_at,s.duration_text,s.duration_ms,
    s.latitude,s.longitude,s.accuracy,s.browser,s.os,s.device,s.screen_res,
    s.camera_ok?'Yes':'No',s.pdf_name||''
  ].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));
  const csv='data:text/csv;charset=utf-8,'+[headers.join(','),...rows].join('\n');
  const link=document.createElement('a');
  link.href=encodeURI(csv);
  link.download=`ReadTrack-${currentClass?.class_code||'export'}-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
}

$('btn-export-csv')?.addEventListener('click',()=>{
  if(!allSessions.length){alert('No sessions to export.');return;}
  exportCSV(allSessions);
});

// ── Navigation ─────────────────────────────────────────────────
const viewTitles={overview:'Overview',students:'Students',sessions:'Sessions',charts:'Charts',assignments:'Assignments',report:'Reports'};
document.querySelectorAll('.t-nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const view=btn.dataset.view;
    document.querySelectorAll('.t-nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.t-view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    $('view-'+view)?.classList.add('active');
    if($('t-view-title')) $('t-view-title').textContent=viewTitles[view]||view;
    $('t-sidebar')?.classList.remove('open');
    if(view==='charts') setTimeout(renderCharts,100);
  });
});

$('btn-menu-toggle')?.addEventListener('click',()=>$('t-sidebar')?.classList.toggle('open'));
$('btn-sidebar-close')?.addEventListener('click',()=>$('t-sidebar')?.classList.remove('open'));
$('btn-refresh')?.addEventListener('click',()=>loadAllData());

$('btn-logout')?.addEventListener('click',()=>{
  currentClass=null;allSessions=[];allStudents=[];
  Object.values(charts).forEach(c=>c.destroy());
  charts={};
  localStorage.removeItem('rt-teacher-session');
  $('t-page-dashboard')?.classList.remove('active');
  $('t-page-login')?.classList.add('active');
});

// ── Auto-restore ───────────────────────────────────────────────
// Check auth-based login first (email/password)
const authLogin = checkAuthLogin();
if (authLogin) {
  // Teacher logged in via auth — load their class
  authToken = authLogin.token;
  const saved = loadLocal('rt-teacher-session', null);
  if (saved) {
    currentClass = { class_code:saved.classCode, class_name:saved.className, teacher_name:saved.teacherName };
    showDashboard();
  } else {
    // Show login to enter class code
    showPage && $('t-page-login')?.classList.add('active');
  }
} else {
  // Check PIN-based login
  const saved = loadLocal('rt-teacher-session', null);
  if (saved) {
    currentClass = { class_code:saved.classCode, class_name:saved.className, teacher_name:saved.teacherName };
    showDashboard();
  }
}
