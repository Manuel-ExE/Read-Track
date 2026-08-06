/* ReadTrack V2 + Phase 2 — script.js */
'use strict';

// PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// SVG gradient for circular timer
document.body.insertAdjacentHTML('afterbegin', `
<svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
  <defs>
    <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
</svg>`);

// ── Utilities ────────────────────────────────────────────────
function generateSessionId() {
  return 'RS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,7).toUpperCase();
}
function formatDuration(ms) {
  const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  return [h,m,sec].map(v=>String(v).padStart(2,'0')).join(':');
}
function formatDateTime(d) {
  return d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function formatDateShort(d) {
  return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}
function getBrowser() {
  const u=navigator.userAgent;
  if(/Edg\//.test(u)) return 'Edge';
  if(/OPR\/|Opera/.test(u)) return 'Opera';
  if(/Chrome\//.test(u)) return 'Chrome';
  if(/Firefox\//.test(u)) return 'Firefox';
  if(/Safari\//.test(u)) return 'Safari';
  return 'Unknown';
}
function getOS() {
  const u=navigator.userAgent;
  if(/Android/.test(u)) return 'Android';
  if(/iPhone|iPad|iPod/.test(u)) return 'iOS';
  if(/Windows NT 10/.test(u)) return 'Windows 10/11';
  if(/Windows/.test(u)) return 'Windows';
  if(/Mac OS X/.test(u)) return 'macOS';
  if(/Linux/.test(u)) return 'Linux';
  return 'Unknown';
}
function getDevice() {
  const u=navigator.userAgent;
  if(/Tablet|iPad/.test(u)) return 'Tablet';
  if(/Mobile|Android|iPhone|iPod/.test(u)) return 'Mobile';
  return 'Desktop';
}
function todayStr() {
  return new Date().toISOString().slice(0,10);
}

// ── Settings ─────────────────────────────────────────────────
function applyTheme(theme) {
  localStorage.setItem('rt-theme', theme);
  if (theme==='auto') document.body.removeAttribute('data-theme');
  else document.body.setAttribute('data-theme', theme);
  const sel=document.getElementById('select-theme');
  if(sel) sel.value=theme;
}
applyTheme(localStorage.getItem('rt-theme')||'auto');

// ── Page Router ───────────────────────────────────────────────
const PAGE_IDS = {
  landing:'page-landing', terms:'page-terms', permissions:'page-permissions',
  goal:'page-goal', session:'page-session', pdf:'page-pdf',
  complete:'page-complete', settings:'page-settings', history:'page-history',
  achievements:'page-achievements', certificate:'page-certificate',
  challenges:'page-challenges', qr:'page-qr',
  errorCamera:'page-error-camera', errorLocation:'page-error-location', errorOffline:'page-error-offline'
};
const pageEls = {};
Object.entries(PAGE_IDS).forEach(([k,v]) => { pageEls[k] = document.getElementById(v); });

let currentPage = 'landing';

function showPage(name) {
  Object.values(pageEls).forEach(p => { if(p) p.classList.remove('active'); });
  if (pageEls[name]) {
    pageEls[name].classList.add('active');
    currentPage = name;
    window.scrollTo(0,0);
  }
  updateBottomNav(name);
}

// ── Bottom Nav ────────────────────────────────────────────────
const NAV_PAGES = ['landing','history','achievements','settings'];

function updateBottomNav(name) {
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === name);
  });
}

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    const pg = btn.dataset.page;
    if (pg === 'history')      renderHistory();
    if (pg === 'achievements') renderAchievements();
    showPage(pg);
  });
});

document.getElementById('nav-start-btn')?.addEventListener('click', () => showPage('terms'));

// ── Session State ─────────────────────────────────────────────
const session = {
  id:'', startTime:null, endTime:null, duration:0,
  lat:null, lng:null, accuracy:null, gpsTs:null,
  cameraOk:false, photoBlob:null,
  browser:getBrowser(), os:getOS(), device:getDevice(),
  screenRes:screen.width+'x'+screen.height,
  pdfName:'', goalMs:0
};

// ── Storage Helpers ───────────────────────────────────────────
function loadData(key, fallback) {
  try { const v=localStorage.getItem(key); return v?JSON.parse(v):fallback; } catch { return fallback; }
}
function saveData(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Timer ─────────────────────────────────────────────────────
let timerInterval=null, timerStartTs=null, timerElapsed=0, timerRunning=false;
const CIRCUMFERENCE=565.5;

function startTimer()  { timerStartTs=Date.now(); timerRunning=true; timerInterval=setInterval(tickTimer,500); updateTimerUI(); }
function pauseTimer()  { if(!timerRunning)return; timerElapsed+=Date.now()-timerStartTs; clearInterval(timerInterval); timerRunning=false; updateTimerUI(); }
function resumeTimer() { if(timerRunning)return; timerStartTs=Date.now(); timerRunning=true; timerInterval=setInterval(tickTimer,500); updateTimerUI(); }
function stopTimer()   { if(timerRunning) timerElapsed+=Date.now()-timerStartTs; clearInterval(timerInterval); timerRunning=false; session.duration=timerElapsed; updateTimerUI(); }

function tickTimer() {
  const cur=timerElapsed+(Date.now()-timerStartTs);
  const el=document.getElementById('timer-display');
  if(el) el.textContent=formatDuration(cur);
  // circular progress
  const circle=document.getElementById('timer-progress-circle');
  if(circle) circle.style.strokeDashoffset=CIRCUMFERENCE*(1-Math.min(cur/3600000,1));
  // goal progress bar
  if(session.goalMs>0) {
    const pct=Math.min(cur/session.goalMs*100,100);
    const fill=document.getElementById('goal-progress-fill');
    if(fill) fill.style.width=pct+'%';
    if(pct>=100 && timerRunning) {
      const lbl=document.getElementById('goal-label-text');
      if(lbl) lbl.textContent='🎉 Goal reached!';
    }
  }
}

function updateTimerUI() {
  const disp=document.getElementById('timer-display');
  const status=document.getElementById('session-status-text');
  const pause=document.getElementById('icon-pause');
  const play=document.getElementById('icon-play');
  const label=document.getElementById('pause-resume-label');
  if(timerRunning) {
    disp?.classList.remove('paused');
    if(status){status.classList.remove('paused');status.textContent='Active';}
    pause?.classList.remove('hidden');
    play?.classList.add('hidden');
    if(label) label.textContent='Pause';
  } else {
    disp?.classList.add('paused');
    if(status){status.classList.add('paused');status.textContent='Paused';}
    pause?.classList.add('hidden');
    play?.classList.remove('hidden');
    if(label) label.textContent='Resume';
  }
}

document.getElementById('btn-pause-resume')?.addEventListener('click', ()=>{ if(timerRunning) pauseTimer(); else resumeTimer(); });

// ── Camera ────────────────────────────────────────────────────
let cameraStream=null;
async function requestCamera() {
  try {
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    const v=document.getElementById('camera-video');
    if(v) v.srcObject=cameraStream;
    return true;
  } catch { return false; }
}
function capturePhoto() {
  return new Promise(resolve => {
    if(!cameraStream){resolve(null);return;}
    const v=document.getElementById('camera-video');
    const c=document.getElementById('camera-canvas');
    function doCapture(){
      const t=cameraStream.getVideoTracks()[0].getSettings();
      c.width=t.width||v.videoWidth||640;
      c.height=t.height||v.videoHeight||480;
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      c.toBlob(blob=>{
        if(!blob){resolve(null);return;}
        session.photoBlob=blob;
        resolve(blob);
      },'image/jpeg',0.82);
    }
    if(v.readyState>=2&&v.videoWidth>0) setTimeout(doCapture,800);
    else v.addEventListener('canplay',()=>setTimeout(doCapture,800),{once:true});
  });
}
function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}}

// ── Geolocation ───────────────────────────────────────────────
async function requestLocation() {
  return new Promise(resolve=>{
    if(!navigator.geolocation){resolve(false);return;}
    navigator.geolocation.getCurrentPosition(
      pos=>{session.lat=pos.coords.latitude;session.lng=pos.coords.longitude;session.accuracy=pos.coords.accuracy;session.gpsTs=pos.timestamp;resolve(true);},
      ()=>navigator.geolocation.getCurrentPosition(
        pos=>{session.lat=pos.coords.latitude;session.lng=pos.coords.longitude;session.accuracy=pos.coords.accuracy;session.gpsTs=pos.timestamp;resolve(true);},
        ()=>resolve(false),
        {enableHighAccuracy:false,timeout:10000,maximumAge:30000}
      ),
      {enableHighAccuracy:true,timeout:15000,maximumAge:0}
    );
  });
}

// ── Permissions ───────────────────────────────────────────────
let cameraGranted=false, locationGranted=false;

function setPermBadge(elId,cardId,state){
  const map={pending:'<span class="badge badge-pending">Pending</span>',granted:'<span class="badge badge-granted">Granted ✓</span>',denied:'<span class="badge badge-denied">Denied ✗</span>'};
  const el=document.getElementById(elId);
  const card=document.getElementById(cardId);
  if(el) el.innerHTML=map[state]||map.pending;
  if(card) card.className='perm-card'+(state==='granted'?' granted':state==='denied'?' denied':'');
}

document.getElementById('btn-grant-perms')?.addEventListener('click',async()=>{
  const btn=document.getElementById('btn-grant-perms');
  const err=document.getElementById('perms-error');
  btn.disabled=true; btn.textContent='Requesting…';
  if(err) err.classList.add('hidden');
  setPermBadge('perm-status-camera','perm-card-camera','pending');
  cameraGranted=await requestCamera();
  setPermBadge('perm-status-camera','perm-card-camera',cameraGranted?'granted':'denied');
  setPermBadge('perm-status-location','perm-card-location','pending');
  locationGranted=await requestLocation();
  setPermBadge('perm-status-location','perm-card-location',locationGranted?'granted':'denied');
  if(!cameraGranted){btn.disabled=false;btn.textContent='Try Again';showPage('errorCamera');return;}
  if(!locationGranted){btn.disabled=false;btn.textContent='Try Again';showPage('errorLocation');return;}
  showPage('goal');
});

// ── Goal Selector ─────────────────────────────────────────────
document.querySelectorAll('.goal-card').forEach(card=>{
  card.addEventListener('click',()=>{
    document.querySelectorAll('.goal-card').forEach(c=>c.classList.remove('selected'));
    card.classList.add('selected');
    const mins=card.dataset.minutes;
    if(mins==='custom'){
      document.getElementById('custom-duration-wrap')?.classList.remove('hidden');
    } else {
      document.getElementById('custom-duration-wrap')?.classList.add('hidden');
      session.goalMs=parseInt(mins)*60*1000;
      startSessionWithGoal();
    }
  });
});

document.getElementById('btn-confirm-custom')?.addEventListener('click',()=>{
  const val=parseInt(document.getElementById('custom-minutes')?.value||'0');
  if(!val||val<1){alert('Please enter a valid duration.');return;}
  session.goalMs=val*60*1000;
  startSessionWithGoal();
});

document.getElementById('btn-back-goal')?.addEventListener('click',()=>showPage('permissions'));

async function startSessionWithGoal(){
  session.id=generateSessionId();
  session.startTime=new Date();
  const photo=await capturePhoto();
  session.cameraOk=!!photo;

  const idEl=document.getElementById('session-id-label');
  const camEl=document.getElementById('status-camera');
  const locEl=document.getElementById('status-location');
  if(idEl) idEl.textContent=session.id;
  if(camEl){camEl.textContent=session.cameraOk?'Verified ✓':'No Photo';camEl.className='status-value '+(session.cameraOk?'status-ok':'status-warning');}
  if(locEl){locEl.textContent=session.lat?'Captured ✓':'Unavailable';locEl.className='status-value '+(session.lat?'status-ok':'status-warning');}

  // Goal progress UI
  const goalSection=document.getElementById('goal-progress-section');
  const goalLbl=document.getElementById('goal-label-text');
  const goalFill=document.getElementById('goal-progress-fill');
  if(session.goalMs>0){
    const mins=Math.round(session.goalMs/60000);
    if(goalSection) goalSection.classList.remove('hidden');
    if(goalLbl) goalLbl.textContent='Goal: '+mins+' min';
    if(goalFill) goalFill.style.width='0%';
  } else {
    if(goalSection) goalSection.classList.add('hidden');
  }

  timerElapsed=0; timerStartTs=null;
  const circle=document.getElementById('timer-progress-circle');
  const disp=document.getElementById('timer-display');
  if(circle) circle.style.strokeDashoffset=CIRCUMFERENCE;
  if(disp) disp.textContent='00:00:00';

  showPage('session');
  startTimer();
}

// ── End Session ───────────────────────────────────────────────
document.getElementById('btn-end-session')?.addEventListener('click',()=>{
  if(!confirm('Are you sure you want to end the session?')) return;
  stopTimer();
  session.endTime=new Date();
  stopCamera();

  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('c-duration',formatDuration(session.duration));
  set('c-start',formatDateTime(session.startTime));
  set('c-end',formatDateTime(session.endTime));
  set('c-location',session.lat?`${session.lat.toFixed(5)}, ${session.lng.toFixed(5)}`:'Unavailable');
  set('c-camera',session.cameraOk?'Verified ✓':'Not captured');

  saveSessionToHistory();
  updateStreak();
  checkAchievements();
  updateChallengeProgress();

  // Generate QR preview on complete page
  const qrPreviewWrap   = document.getElementById('qr-preview-wrap');
  const qrPreviewCanvas = document.getElementById('qr-preview-canvas');
  if (qrPreviewWrap && qrPreviewCanvas) {
    qrPreviewWrap.classList.remove('hidden');
    drawQRCode(qrPreviewCanvas, buildQRData(session), 120);
  }

  showPage('complete');
  sendSessionData();
});

// ── Session History ───────────────────────────────────────────
function saveSessionToHistory(){
  const history=loadData('rt-history',[]);
  history.unshift({
    id:session.id,
    date:session.startTime.toISOString(),
    duration:session.duration,
    cameraOk:session.cameraOk,
    locationOk:!!session.lat,
    device:session.device,
    pdfName:session.pdfName||'',
    goalMs:session.goalMs||0,
  });
  // Keep last 100 sessions
  saveData('rt-history', history.slice(0,100));
}

function renderHistory(){
  const history=loadData('rt-history',[]);
  const list=document.getElementById('history-list');
  const empty=document.getElementById('history-empty');
  if(!list) return;
  list.innerHTML='';
  if(history.length===0){
    if(empty) empty.classList.remove('hidden');
    return;
  }
  if(empty) empty.classList.add('hidden');
  history.forEach(s=>{
    const verified=s.cameraOk&&s.locationOk;
    const div=document.createElement('div');
    div.className='history-item';
    div.innerHTML=`
      <div class="history-icon">${verified?'✅':'⚠️'}</div>
      <div class="history-info">
        <div class="history-date">${formatDateShort(s.date)}</div>
        <div class="history-duration">${formatDuration(s.duration)}</div>
        <div class="history-meta">${s.pdfName||s.device||'Session'}</div>
      </div>
      <div class="history-status ${verified?'verified':'partial'}">${verified?'Verified':'Partial'}</div>
    `;
    list.appendChild(div);
  });
}

document.getElementById('btn-back-history')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-clear-history')?.addEventListener('click',()=>{
  if(!confirm('Clear all session history?')) return;
  saveData('rt-history',[]);
  renderHistory();
});

// ── Streaks ───────────────────────────────────────────────────
function updateStreak(){
  const data=loadData('rt-streaks',{current:0,longest:0,lastDate:'',totalMs:0,totalSessions:0});
  const today=todayStr();
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);

  if(data.lastDate===today){
    // Already logged today — just add time
  } else if(data.lastDate===yesterday){
    data.current+=1;
  } else if(data.lastDate===''||data.lastDate<yesterday){
    data.current=1;
  }
  data.lastDate=today;
  data.longest=Math.max(data.longest,data.current);
  data.totalMs=(data.totalMs||0)+session.duration;
  data.totalSessions=(data.totalSessions||0)+1;
  saveData('rt-streaks',data);
}

function getStreakData(){ return loadData('rt-streaks',{current:0,longest:0,lastDate:'',totalMs:0,totalSessions:0}); }

// ── Achievements ──────────────────────────────────────────────
const ACHIEVEMENTS=[
  {id:'first',    emoji:'🎯', name:'First Session',   desc:'Complete your first reading session', check:d=>d.totalSessions>=1},
  {id:'s5',       emoji:'📚', name:'5 Sessions',       desc:'Complete 5 reading sessions',         check:d=>d.totalSessions>=5},
  {id:'s10',      emoji:'🏅', name:'10 Sessions',      desc:'Complete 10 reading sessions',        check:d=>d.totalSessions>=10},
  {id:'s25',      emoji:'🥇', name:'25 Sessions',      desc:'Complete 25 reading sessions',        check:d=>d.totalSessions>=25},
  {id:'s50',      emoji:'🏆', name:'50 Sessions',      desc:'Complete 50 reading sessions',        check:d=>d.totalSessions>=50},
  {id:'h1',       emoji:'⏱️', name:'1 Hour Read',      desc:'Read for a total of 1 hour',          check:d=>d.totalMs>=3600000},
  {id:'h5',       emoji:'🔥', name:'5 Hours Read',     desc:'Read for a total of 5 hours',         check:d=>d.totalMs>=18000000},
  {id:'h10',      emoji:'⚡', name:'10 Hours Read',    desc:'Read for a total of 10 hours',        check:d=>d.totalMs>=36000000},
  {id:'h50',      emoji:'🌟', name:'50 Hours Read',    desc:'Read for a total of 50 hours',        check:d=>d.totalMs>=180000000},
  {id:'streak3',  emoji:'🗓️', name:'3-Day Streak',     desc:'Read 3 days in a row',                check:d=>d.current>=3},
  {id:'streak7',  emoji:'🔆', name:'Week Warrior',     desc:'Read 7 days in a row',                check:d=>d.current>=7},
  {id:'streak30', emoji:'💎', name:'Month Master',     desc:'Read 30 days in a row',               check:d=>d.current>=30},
];

function checkAchievements(){
  const data=getStreakData();
  const unlocked=loadData('rt-achievements',[]);
  ACHIEVEMENTS.forEach(a=>{
    if(!unlocked.includes(a.id)&&a.check(data)) unlocked.push(a.id);
  });
  saveData('rt-achievements',unlocked);
}

function renderAchievements(){
  const data=getStreakData();
  const unlocked=loadData('rt-achievements',[]);

  const el=s=>document.getElementById(s);
  if(el('streak-count'))         el('streak-count').textContent=data.current||0;
  if(el('streak-longest'))       el('streak-longest').textContent=data.longest||0;
  if(el('streak-total-sessions'))el('streak-total-sessions').textContent=data.totalSessions||0;
  if(el('streak-total-hours'))   el('streak-total-hours').textContent=Math.floor((data.totalMs||0)/3600000)+'h';

  const grid=document.getElementById('achievements-grid');
  if(!grid) return;
  grid.innerHTML='';
  ACHIEVEMENTS.forEach(a=>{
    const isUnlocked=unlocked.includes(a.id);
    const div=document.createElement('div');
    div.className='achievement-card '+(isUnlocked?'unlocked':'locked');
    div.innerHTML=`
      <div class="achievement-emoji">${a.emoji}</div>
      <div class="achievement-name">${a.name}</div>
      <div class="achievement-desc">${a.desc}</div>
    `;
    grid.appendChild(div);
  });
}

document.getElementById('btn-back-achievements')?.addEventListener('click',()=>showPage('landing'));

// ── Send Session Data ─────────────────────────────────────────
async function sendSessionData(){
  const show=id=>document.getElementById(id)?.classList.remove('hidden');
  const hide=id=>document.getElementById(id)?.classList.add('hidden');
  show('complete-sending'); hide('complete-sent'); hide('complete-error');

  const fd=new FormData();
  fd.append('sessionId',  session.id);
  fd.append('startTime',  session.startTime.toISOString());
  fd.append('endTime',    session.endTime.toISOString());
  fd.append('duration',   formatDuration(session.duration));
  fd.append('latitude',   session.lat??'');
  fd.append('longitude',  session.lng??'');
  fd.append('accuracy',   session.accuracy??'');
  fd.append('browser',    session.browser);
  fd.append('os',         session.os);
  fd.append('device',     session.device);
  fd.append('screenRes',  session.screenRes);
  fd.append('cameraOk',   String(session.cameraOk));
  fd.append('pdfName',    session.pdfName||'');
  if(session.photoBlob) fd.append('photo',session.photoBlob,`verify-${session.id}.jpg`);

  try {
    if(!navigator.onLine) throw new Error('Offline');
    const res=await fetch('/.netlify/functions/session',{method:'POST',body:fd});
    if(!res.ok) throw new Error('HTTP '+res.status);
    hide('complete-sending'); show('complete-sent');
  } catch(e){
    hide('complete-sending'); show('complete-error');
    try{localStorage.setItem('rt-fail-'+session.id,JSON.stringify({id:session.id,start:session.startTime.toISOString(),end:session.endTime.toISOString(),duration:formatDuration(session.duration)}));}catch{}
  }
}

// ── PDF Reader ────────────────────────────────────────────────
let pdfDoc=null,pdfPage=1,pdfScale=1.5,pdfRendering=false,pdfPending=null;

function renderPage(num){
  if(!pdfDoc) return;
  if(pdfRendering){pdfPending=num;return;}
  pdfRendering=true;
  const cur=document.getElementById('pdf-current-page');
  if(cur) cur.textContent=num;
  const fill=document.getElementById('pdf-progress-fill');
  const bar=document.getElementById('pdf-progress-bar');
  if(fill) fill.style.width=Math.round(num/pdfDoc.numPages*100)+'%';
  if(bar) bar.classList.remove('hidden');
  pdfDoc.getPage(num).then(pg=>{
    const vp=pg.getViewport({scale:pdfScale});
    const canvas=document.getElementById('pdf-canvas');
    canvas.height=vp.height; canvas.width=vp.width;
    pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(()=>{
      pdfRendering=false;
      if(pdfPending!==null){renderPage(pdfPending);pdfPending=null;}
    });
  });
}

function loadPDF(file){
  if(!file||file.type!=='application/pdf') return;
  session.pdfName=file.name;
  const nameEl=document.getElementById('pdf-filename');
  if(nameEl) nameEl.textContent=file.name.length>30?file.name.slice(0,27)+'…':file.name;
  const reader=new FileReader();
  reader.onload=e=>{
    pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise.then(doc=>{
      pdfDoc=doc; pdfPage=1;
      const tot=document.getElementById('pdf-total-pages');
      if(tot) tot.textContent=doc.numPages;
      document.getElementById('pdf-drop-zone')?.classList.add('hidden');
      document.getElementById('pdf-viewer-wrap')?.classList.remove('hidden');
      renderPage(1);
    });
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('btn-select-pdf')?.addEventListener('click',()=>document.getElementById('pdf-file-input')?.click());
document.getElementById('pdf-file-input')?.addEventListener('change',e=>{if(e.target.files[0]) loadPDF(e.target.files[0]);});
document.getElementById('btn-prev-page')?.addEventListener('click',()=>{if(pdfDoc&&pdfPage>1) renderPage(--pdfPage);});
document.getElementById('btn-next-page')?.addEventListener('click',()=>{if(pdfDoc&&pdfPage<pdfDoc.numPages) renderPage(++pdfPage);});
document.getElementById('btn-zoom-in')?.addEventListener('click',()=>{if(pdfScale<4){pdfScale=Math.round((pdfScale+0.25)*100)/100;const z=document.getElementById('zoom-level');if(z)z.textContent=Math.round(pdfScale*100)+'%';if(pdfDoc)renderPage(pdfPage);}});
document.getElementById('btn-zoom-out')?.addEventListener('click',()=>{if(pdfScale>0.5){pdfScale=Math.round((pdfScale-0.25)*100)/100;const z=document.getElementById('zoom-level');if(z)z.textContent=Math.round(pdfScale*100)+'%';if(pdfDoc)renderPage(pdfPage);}});
document.getElementById('btn-pdf-fullscreen')?.addEventListener('click',()=>{const el=document.getElementById('pdf-viewer-wrap');if(el?.requestFullscreen)el.requestFullscreen();else if(el?.webkitRequestFullscreen)el.webkitRequestFullscreen();});

// ── QR Code Generator (pure JS, no library) ───────────────────
// Minimal QR code using a data URI approach via canvas
function drawQRCode(canvasEl, text, size) {
  if (!canvasEl) return;
  // Use a free QR API to generate and draw on canvas
  const img = new Image();
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=1a1a2e`;
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    canvasEl.width  = size;
    canvasEl.height = size;
    canvasEl.getContext('2d').drawImage(img, 0, 0, size, size);
  };
  img.src = url;
}

function buildQRData(s) {
  return JSON.stringify({
    id:       s.id,
    date:     s.startTime ? s.startTime.toISOString().slice(0,10) : '',
    duration: formatDuration(s.duration),
    status:   'VERIFIED',
    url:      'https://read-track.netlify.app',
  });
}

// ── Certificate Generator ──────────────────────────────────────
function drawCertificate(canvasEl, sessionData, streakData) {
  if (!canvasEl) return;
  const W = 800, H = 560;
  canvasEl.width  = W;
  canvasEl.height = H;
  const ctx = canvasEl.getContext('2d');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   '#0f172a');
  bg.addColorStop(0.5, '#1e1b4b');
  bg.addColorStop(1,   '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Border
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth   = 4;
  ctx.strokeRect(16, 16, W-32, H-32);
  ctx.strokeStyle = 'rgba(99,102,241,0.3)';
  ctx.lineWidth   = 1;
  ctx.strokeRect(24, 24, W-48, H-48);

  // Emoji
  ctx.font      = '60px serif';
  ctx.textAlign = 'center';
  ctx.fillText('📚', W/2, 100);

  // Title
  ctx.font      = 'bold 32px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Certificate of Reading', W/2, 155);

  // Subtitle
  ctx.font      = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('This certifies the successful completion of a verified reading session', W/2, 190);

  // Divider
  const grad = ctx.createLinearGradient(W/2-180, 0, W/2+180, 0);
  grad.addColorStop(0,   'transparent');
  grad.addColorStop(0.5, '#6366f1');
  grad.addColorStop(1,   'transparent');
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(W/2-180, 210); ctx.lineTo(W/2+180, 210); ctx.stroke();

  // Session details
  const details = [
    ['Session ID',  sessionData.id],
    ['Duration',    formatDuration(sessionData.duration)],
    ['Date',        sessionData.startTime ? sessionData.startTime.toLocaleDateString() : ''],
    ['Total Sessions', String(streakData.totalSessions || 1)],
    ['Total Hours',   Math.floor((streakData.totalMs||0)/3600000) + 'h'],
  ];

  ctx.textAlign = 'left';
  details.forEach(([label, value], i) => {
    const y = 250 + i * 40;
    ctx.font      = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(label, W/2 - 200, y);
    ctx.font      = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, W/2 + 20, y);
  });

  // Footer
  ctx.textAlign = 'center';
  ctx.font      = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('ReadTrack — read-track.netlify.app', W/2, H - 40);
  ctx.fillText('Generated on ' + new Date().toLocaleDateString(), W/2, H - 22);
}

// ── Challenges ────────────────────────────────────────────────
const CHALLENGES = [
  { id:'c30',  emoji:'🔥', name:'30-Day Challenge',     desc:'Read every day for 30 days straight',  days:30,  target:30 },
  { id:'c7',   emoji:'📅', name:'Week Reading Challenge', desc:'Complete 7 sessions this week',        days:7,   target:7  },
  { id:'cWE',  emoji:'🌅', name:'Weekend Challenge',    desc:'Read every weekend for 4 weeks',        days:28,  target:8  },
  { id:'cAM',  emoji:'🌄', name:'Morning Reader',       desc:'Complete 10 morning reading sessions',  days:30,  target:10 },
  { id:'cNO',  emoji:'🌙', name:'Night Owl Reader',     desc:'Complete 10 evening reading sessions',  days:30,  target:10 },
  { id:'cSP',  emoji:'⚡', name:'Speed Reader',         desc:'Complete 5 sessions of 45+ minutes',   days:14,  target:5  },
];

function renderChallenges() {
  const list      = document.getElementById('challenges-list');
  if (!list) return;
  const joined    = loadData('rt-challenges', {});
  const history   = loadData('rt-history',   []);
  list.innerHTML  = '';

  CHALLENGES.forEach(c => {
    const isJoined = !!joined[c.id];
    const progress = isJoined ? Math.min(joined[c.id].progress || 0, c.target) : 0;
    const pct      = Math.round(progress / c.target * 100);
    const div      = document.createElement('div');
    div.className  = 'challenge-card' + (isJoined ? ' joined' : '');
    div.innerHTML  = `
      <div class="challenge-emoji">${c.emoji}</div>
      <div class="challenge-body">
        <div class="challenge-name">${c.name}</div>
        <div class="challenge-desc">${c.desc}</div>
        ${isJoined ? `
          <div class="challenge-progress">
            <div class="challenge-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="challenge-meta">${progress}/${c.target} sessions · ${pct}% complete</div>
        ` : `<div class="challenge-meta">${c.days}-day challenge · ${c.target} sessions</div>`}
      </div>
      <div class="challenge-action">
        ${isJoined
          ? `<span class="challenge-badge">Joined ✓</span>`
          : `<button class="btn btn-primary btn-sm" data-cid="${c.id}">Join</button>`}
      </div>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-cid]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cid   = btn.dataset.cid;
      const saved = loadData('rt-challenges', {});
      saved[cid]  = { joinedAt: new Date().toISOString(), progress: 0 };
      saveData('rt-challenges', saved);
      renderChallenges();
    });
  });
}

function updateChallengeProgress() {
  const joined = loadData('rt-challenges', {});
  let changed  = false;
  Object.keys(joined).forEach(cid => {
    joined[cid].progress = (joined[cid].progress || 0) + 1;
    changed = true;
  });
  if (changed) saveData('rt-challenges', joined);
}

// ── Navigation Wiring ─────────────────────────────────────────
document.getElementById('btn-hero-start')?.addEventListener('click',()=>showPage('terms'));
document.getElementById('btn-hero-learn')?.addEventListener('click',()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'}));
document.getElementById('link-footer-terms')?.addEventListener('click',e=>{e.preventDefault();showPage('terms');});
document.getElementById('link-footer-settings')?.addEventListener('click',e=>{e.preventDefault();showPage('settings');});
document.getElementById('btn-back-terms')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-back-perms')?.addEventListener('click',()=>{stopCamera();showPage('terms');});
document.getElementById('btn-open-pdf')?.addEventListener('click',()=>showPage('pdf'));
document.getElementById('btn-session-settings')?.addEventListener('click',()=>showPage('settings'));
document.getElementById('btn-back-pdf')?.addEventListener('click',()=>showPage('session'));
document.getElementById('btn-back-settings')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-retry-camera')?.addEventListener('click',()=>showPage('permissions'));
document.getElementById('btn-error-camera-home')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-retry-location')?.addEventListener('click',()=>showPage('permissions'));
document.getElementById('btn-error-location-home')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-retry-offline')?.addEventListener('click',()=>{if(navigator.onLine)showPage('landing');else alert('Still offline.');});
document.getElementById('btn-error-offline-home')?.addEventListener('click',()=>showPage('landing'));

document.getElementById('btn-new-session')?.addEventListener('click',()=>{resetAll();showPage('terms');});
document.getElementById('btn-back-home')?.addEventListener('click',()=>{resetAll();showPage('landing');});
document.getElementById('select-theme')?.addEventListener('change',e=>applyTheme(e.target.value));

// Certificate
document.getElementById('btn-view-certificate')?.addEventListener('click',()=>{
  const canvas    = document.getElementById('cert-canvas');
  const streakData= getStreakData();
  drawCertificate(canvas, session, streakData);
  showPage('certificate');
});
document.getElementById('btn-back-certificate')?.addEventListener('click',()=>showPage('complete'));
document.getElementById('btn-download-cert')?.addEventListener('click',()=>{
  const canvas = document.getElementById('cert-canvas');
  if (!canvas) return;
  const link   = document.createElement('a');
  link.download = `ReadTrack-Certificate-${session.id||'session'}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
});

// QR Code
document.getElementById('btn-view-qr')?.addEventListener('click',()=>{
  const qrCanvas = document.getElementById('qr-canvas');
  const data     = buildQRData(session);
  drawQRCode(qrCanvas, data, 300);
  const set = (id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('qr-session-id', session.id||'—');
  set('qr-duration',   formatDuration(session.duration));
  set('qr-date',       session.startTime?session.startTime.toLocaleDateString():'—');
  showPage('qr');
});
document.getElementById('btn-back-qr')?.addEventListener('click',()=>showPage('complete'));
document.getElementById('btn-download-qr')?.addEventListener('click',()=>{
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  const link   = document.createElement('a');
  link.download = `ReadTrack-QR-${session.id||'session'}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
});

// Challenges
document.getElementById('btn-back-challenges')?.addEventListener('click',()=>showPage('settings'));
document.getElementById('btn-go-challenges')?.addEventListener('click',()=>{ renderChallenges(); showPage('challenges'); });

document.getElementById('chk-agree')?.addEventListener('change',function(){
  const btn=document.getElementById('btn-agree');
  if(btn) btn.disabled=!this.checked;
});
document.getElementById('btn-agree')?.addEventListener('click',()=>{
  const chk=document.getElementById('chk-agree');
  if(!chk||!chk.checked) return;
  showPage('permissions');
});

document.querySelectorAll('.faq-question').forEach(q=>{
  q.addEventListener('click',()=>{
    const item=q.parentElement;
    const open=item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));
    if(!open) item.classList.add('open');
  });
});

// ── Reset ─────────────────────────────────────────────────────
function resetAll(){
  timerElapsed=0;timerStartTs=null;timerRunning=false;
  Object.assign(session,{id:'',startTime:null,endTime:null,duration:0,lat:null,lng:null,accuracy:null,cameraOk:false,photoBlob:null,pdfName:'',goalMs:0});
  const disp=document.getElementById('timer-display');
  const circle=document.getElementById('timer-progress-circle');
  if(disp) disp.textContent='00:00:00';
  if(circle) circle.style.strokeDashoffset=CIRCUMFERENCE;
  updateTimerUI();
  const chk=document.getElementById('chk-agree');
  const btn=document.getElementById('btn-agree');
  if(chk) chk.checked=false;
  if(btn) btn.disabled=true;
  document.getElementById('complete-sending')?.classList.remove('hidden');
  document.getElementById('complete-sent')?.classList.add('hidden');
  document.getElementById('complete-error')?.classList.add('hidden');
  document.getElementById('goal-progress-section')?.classList.add('hidden');
  document.querySelectorAll('.goal-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('custom-duration-wrap')?.classList.add('hidden');
  pdfDoc=null;pdfPage=1;
  document.getElementById('pdf-drop-zone')?.classList.remove('hidden');
  document.getElementById('pdf-viewer-wrap')?.classList.add('hidden');
  document.getElementById('pdf-progress-bar')?.classList.add('hidden');
}

// ── Guards & PWA ──────────────────────────────────────────────
window.addEventListener('beforeunload',e=>{if(currentPage==='session'&&timerRunning){e.preventDefault();e.returnValue='Session is active.';}});
window.addEventListener('offline',()=>{if(currentPage!=='landing') showPage('errorOffline');});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
}

// ── Init ──────────────────────────────────────────────────────
showPage('landing');
