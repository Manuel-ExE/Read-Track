/* ReadTrack V2 — script.js */
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
  const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return [h,m,sec].map(v => String(v).padStart(2,'0')).join(':');
}
function formatDateTime(d) {
  return d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function getBrowser() {
  const u = navigator.userAgent;
  if (/Edg\//.test(u)) return 'Edge';
  if (/OPR\/|Opera/.test(u)) return 'Opera';
  if (/Chrome\//.test(u)) return 'Chrome';
  if (/Firefox\//.test(u)) return 'Firefox';
  if (/Safari\//.test(u)) return 'Safari';
  return 'Unknown';
}
function getOS() {
  const u = navigator.userAgent;
  if (/Android/.test(u)) return 'Android';
  if (/iPhone|iPad|iPod/.test(u)) return 'iOS';
  if (/Windows NT 10/.test(u)) return 'Windows 10/11';
  if (/Windows/.test(u)) return 'Windows';
  if (/Mac OS X/.test(u)) return 'macOS';
  if (/Linux/.test(u)) return 'Linux';
  return 'Unknown';
}
function getDevice() {
  const u = navigator.userAgent;
  if (/Tablet|iPad/.test(u)) return 'Tablet';
  if (/Mobile|Android|iPhone|iPod/.test(u)) return 'Mobile';
  return 'Desktop';
}

// ── Settings ─────────────────────────────────────────────────
function applyTheme(theme) {
  localStorage.setItem('rt-theme', theme);
  if (theme === 'auto') document.body.removeAttribute('data-theme');
  else document.body.setAttribute('data-theme', theme);
  const sel = document.getElementById('select-theme');
  if (sel) sel.value = theme;
}
applyTheme(localStorage.getItem('rt-theme') || 'auto');

// ── Page Router ───────────────────────────────────────────────
const PAGES = ['landing','terms','permissions','session','pdf','complete','settings','errorCamera','errorLocation','errorOffline'];
const pageEls = {};
PAGES.forEach(name => {
  const id = 'page-' + name.replace(/([A-Z])/g, c => '-' + c.toLowerCase());
  pageEls[name] = document.getElementById(id);
});

let currentPage = 'landing';

function showPage(name) {
  PAGES.forEach(n => { if (pageEls[n]) pageEls[n].classList.remove('active'); });
  if (pageEls[name]) {
    pageEls[name].classList.add('active');
    currentPage = name;
    window.scrollTo(0, 0);
  }
}

// ── Session State ─────────────────────────────────────────────
const session = {
  id:'', startTime:null, endTime:null, duration:0,
  lat:null, lng:null, accuracy:null, gpsTs:null,
  cameraOk:false, photoBlob:null,
  browser:getBrowser(), os:getOS(), device:getDevice(),
  screenRes: screen.width+'x'+screen.height,
  pdfName:''
};

// ── Timer ─────────────────────────────────────────────────────
let timerInterval=null, timerStartTs=null, timerElapsed=0, timerRunning=false;
const CIRCUMFERENCE = 565.5;

function startTimer()  { timerStartTs=Date.now(); timerRunning=true; timerInterval=setInterval(tickTimer,500); updateTimerUI(); }
function pauseTimer()  { if(!timerRunning)return; timerElapsed+=Date.now()-timerStartTs; clearInterval(timerInterval); timerRunning=false; updateTimerUI(); }
function resumeTimer() { if(timerRunning)return; timerStartTs=Date.now(); timerRunning=true; timerInterval=setInterval(tickTimer,500); updateTimerUI(); }
function stopTimer()   { if(timerRunning) timerElapsed+=Date.now()-timerStartTs; clearInterval(timerInterval); timerRunning=false; session.duration=timerElapsed; updateTimerUI(); }

function tickTimer() {
  const cur = timerElapsed + (Date.now()-timerStartTs);
  const el = document.getElementById('timer-display');
  if (el) el.textContent = formatDuration(cur);
  const circle = document.getElementById('timer-progress-circle');
  if (circle) circle.style.strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(cur/3600000,1));
}

function updateTimerUI() {
  const disp  = document.getElementById('timer-display');
  const status= document.getElementById('session-status-text');
  const pause = document.getElementById('icon-pause');
  const play  = document.getElementById('icon-play');
  const label = document.getElementById('pause-resume-label');
  if (timerRunning) {
    if(disp)   disp.classList.remove('paused');
    if(status) { status.classList.remove('paused'); status.textContent='Active'; }
    if(pause)  pause.classList.remove('hidden');
    if(play)   play.classList.add('hidden');
    if(label)  label.textContent='Pause';
  } else {
    if(disp)   disp.classList.add('paused');
    if(status) { status.classList.add('paused'); status.textContent='Paused'; }
    if(pause)  pause.classList.add('hidden');
    if(play)   play.classList.remove('hidden');
    if(label)  label.textContent='Resume';
  }
}

document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
  if (timerRunning) pauseTimer(); else resumeTimer();
});

// ── Camera ────────────────────────────────────────────────────
let cameraStream = null;
async function requestCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:'user'}, audio:false });
    const v = document.getElementById('camera-video');
    if (v) v.srcObject = cameraStream;
    return true;
  } catch(e) { return false; }
}
function capturePhoto() {
  return new Promise(resolve => {
    if (!cameraStream) { resolve(null); return; }
    const v = document.getElementById('camera-video');
    const c = document.getElementById('camera-canvas');

    function doCapture() {
      const t = cameraStream.getVideoTracks()[0].getSettings();
      c.width  = t.width  || v.videoWidth  || 640;
      c.height = t.height || v.videoHeight || 480;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(blob => {
        if (!blob) { resolve(null); return; }
        session.photoBlob = blob;
        resolve(blob);
      }, 'image/jpeg', 0.82);
    }

    // Wait for video to be actually playing with real frames
    if (v.readyState >= 2 && v.videoWidth > 0) {
      // Already playing — wait a bit more to ensure frame is visible
      setTimeout(doCapture, 800);
    } else {
      v.addEventListener('canplay', () => setTimeout(doCapture, 800), { once: true });
    }
  });
}
function stopCamera() { if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop()); cameraStream=null;} }

// ── Geolocation ───────────────────────────────────────────────
async function requestLocation() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(false); return; }

    // First attempt — high accuracy
    navigator.geolocation.getCurrentPosition(
      pos => {
        session.lat      = pos.coords.latitude;
        session.lng      = pos.coords.longitude;
        session.accuracy = pos.coords.accuracy;
        session.gpsTs    = pos.timestamp;
        resolve(true);
      },
      () => {
        // Second attempt — lower accuracy, faster
        navigator.geolocation.getCurrentPosition(
          pos => {
            session.lat      = pos.coords.latitude;
            session.lng      = pos.coords.longitude;
            session.accuracy = pos.coords.accuracy;
            session.gpsTs    = pos.timestamp;
            resolve(true);
          },
          () => resolve(false),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ── Permissions ───────────────────────────────────────────────
let cameraGranted=false, locationGranted=false;

function setPermBadge(elId, cardId, state) {
  const el   = document.getElementById(elId);
  const card = document.getElementById(cardId);
  const map  = { pending:'<span class="badge badge-pending">Pending</span>', granted:'<span class="badge badge-granted">Granted ✓</span>', denied:'<span class="badge badge-denied">Denied ✗</span>' };
  if (el)   el.innerHTML = map[state]||map.pending;
  if (card) card.className = 'perm-card'+(state==='granted'?' granted':state==='denied'?' denied':'');
}

document.getElementById('btn-grant-perms')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-grant-perms');
  const err = document.getElementById('perms-error');
  btn.disabled=true; btn.textContent='Requesting…';
  if(err) err.classList.add('hidden');

  setPermBadge('perm-status-camera','perm-card-camera','pending');
  cameraGranted = await requestCamera();
  setPermBadge('perm-status-camera','perm-card-camera', cameraGranted?'granted':'denied');

  setPermBadge('perm-status-location','perm-card-location','pending');
  locationGranted = await requestLocation();
  setPermBadge('perm-status-location','perm-card-location', locationGranted?'granted':'denied');

  if (!cameraGranted) { btn.disabled=false; btn.textContent='Try Again'; showPage('errorCamera'); return; }
  if (!locationGranted) { btn.disabled=false; btn.textContent='Try Again'; showPage('errorLocation'); return; }

  await beginSession();
});

// ── Begin Session ─────────────────────────────────────────────
async function beginSession() {
  session.id = generateSessionId();
  session.startTime = new Date();
  const photo = await capturePhoto();
  session.cameraOk = !!photo;

  const idEl  = document.getElementById('session-id-label');
  const camEl = document.getElementById('status-camera');
  const locEl = document.getElementById('status-location');
  if(idEl)  idEl.textContent = session.id;
  if(camEl) { camEl.textContent=session.cameraOk?'Verified ✓':'No Photo'; camEl.className='status-value '+(session.cameraOk?'status-ok':'status-warning'); }
  if(locEl) { locEl.textContent=session.lat?'Captured ✓':'Unavailable'; locEl.className='status-value '+(session.lat?'status-ok':'status-warning'); }

  timerElapsed=0; timerStartTs=null;
  const circle = document.getElementById('timer-progress-circle');
  const disp   = document.getElementById('timer-display');
  if(circle) circle.style.strokeDashoffset = CIRCUMFERENCE;
  if(disp)   disp.textContent = '00:00:00';

  showPage('session');
  startTimer();
}

// ── End Session ───────────────────────────────────────────────
document.getElementById('btn-end-session')?.addEventListener('click', () => {
  if (!confirm('Are you sure you want to end the session?')) return;
  stopTimer(); session.endTime=new Date();
  stopCamera();
  const set = (id,val) => { const e=document.getElementById(id); if(e) e.textContent=val; };
  set('c-duration', formatDuration(session.duration));
  set('c-start',    formatDateTime(session.startTime));
  set('c-end',      formatDateTime(session.endTime));
  set('c-location', session.lat?`${session.lat.toFixed(5)}, ${session.lng.toFixed(5)}`:'Unavailable');
  set('c-camera',   session.cameraOk?'Verified ✓':'Not captured');
  showPage('complete');
  sendSessionData();
});

// ── Send Data ─────────────────────────────────────────────────
async function sendSessionData() {
  const show = id => document.getElementById(id)?.classList.remove('hidden');
  const hide = id => document.getElementById(id)?.classList.add('hidden');
  show('complete-sending'); hide('complete-sent'); hide('complete-error');

  const fd = new FormData();
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
  if (session.photoBlob) fd.append('photo', session.photoBlob, `verify-${session.id}.jpg`);

  try {
    const res = await fetch('/.netlify/functions/session', { method:'POST', body:fd });
    if (!res.ok) throw new Error('HTTP '+res.status);
    hide('complete-sending'); show('complete-sent');
  } catch(e) {
    hide('complete-sending'); show('complete-error');
    try { localStorage.setItem('rt-'+session.id, JSON.stringify({...session, startTime:session.startTime.toISOString(), endTime:session.endTime.toISOString()})); } catch(_){}
  }
}

// ── PDF Reader ────────────────────────────────────────────────
let pdfDoc=null, pdfPage=1, pdfScale=1.5, pdfRendering=false, pdfPending=null;

function renderPage(num) {
  if (!pdfDoc) return;
  if (pdfRendering) { pdfPending=num; return; }
  pdfRendering=true;
  const cur = document.getElementById('pdf-current-page');
  if(cur) cur.textContent=num;
  const fill = document.getElementById('pdf-progress-fill');
  const bar  = document.getElementById('pdf-progress-bar');
  if(fill) fill.style.width = Math.round(num/pdfDoc.numPages*100)+'%';
  if(bar)  bar.classList.remove('hidden');

  pdfDoc.getPage(num).then(pg => {
    const vp = pg.getViewport({scale:pdfScale});
    const canvas = document.getElementById('pdf-canvas');
    canvas.height=vp.height; canvas.width=vp.width;
    pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(()=>{
      pdfRendering=false;
      if(pdfPending!==null){renderPage(pdfPending);pdfPending=null;}
    });
  });
}

function loadPDF(file) {
  if(!file||file.type!=='application/pdf') return;
  session.pdfName = file.name;
  const nameEl = document.getElementById('pdf-filename');
  if(nameEl) nameEl.textContent = file.name.length>30?file.name.slice(0,27)+'…':file.name;
  const reader = new FileReader();
  reader.onload = e => {
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

document.getElementById('btn-select-pdf')?.addEventListener('click', ()=>document.getElementById('pdf-file-input')?.click());
document.getElementById('pdf-file-input')?.addEventListener('change', e=>{ if(e.target.files[0]) loadPDF(e.target.files[0]); });
document.getElementById('btn-prev-page')?.addEventListener('click', ()=>{ if(pdfDoc&&pdfPage>1) renderPage(--pdfPage); });
document.getElementById('btn-next-page')?.addEventListener('click', ()=>{ if(pdfDoc&&pdfPage<pdfDoc.numPages) renderPage(++pdfPage); });
document.getElementById('btn-zoom-in')?.addEventListener('click',  ()=>{ if(pdfScale<4){pdfScale=Math.round((pdfScale+0.25)*100)/100; const z=document.getElementById('zoom-level'); if(z) z.textContent=Math.round(pdfScale*100)+'%'; if(pdfDoc)renderPage(pdfPage);} });
document.getElementById('btn-zoom-out')?.addEventListener('click', ()=>{ if(pdfScale>0.5){pdfScale=Math.round((pdfScale-0.25)*100)/100; const z=document.getElementById('zoom-level'); if(z) z.textContent=Math.round(pdfScale*100)+'%'; if(pdfDoc)renderPage(pdfPage);} });
document.getElementById('btn-pdf-fullscreen')?.addEventListener('click', ()=>{ const el=document.getElementById('pdf-viewer-wrap'); if(el?.requestFullscreen) el.requestFullscreen(); else if(el?.webkitRequestFullscreen) el.webkitRequestFullscreen(); });

// ── Navigation ────────────────────────────────────────────────
document.getElementById('btn-hero-start')?.addEventListener('click', ()=>showPage('terms'));
document.getElementById('btn-hero-learn')?.addEventListener('click', ()=>document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'}));
document.getElementById('link-footer-terms')?.addEventListener('click', e=>{e.preventDefault();showPage('terms');});
document.getElementById('link-footer-settings')?.addEventListener('click', e=>{e.preventDefault();showPage('settings');});
document.getElementById('btn-back-terms')?.addEventListener('click', ()=>showPage('landing'));
document.getElementById('btn-back-perms')?.addEventListener('click', ()=>{stopCamera();showPage('terms');});
document.getElementById('btn-open-pdf')?.addEventListener('click', ()=>showPage('pdf'));
document.getElementById('btn-session-settings')?.addEventListener('click', ()=>showPage('settings'));
document.getElementById('btn-back-pdf')?.addEventListener('click', ()=>showPage('session'));
document.getElementById('btn-back-settings')?.addEventListener('click', ()=>showPage('landing'));
document.getElementById('btn-retry-camera')?.addEventListener('click', ()=>showPage('permissions'));
document.getElementById('btn-error-camera-home')?.addEventListener('click', ()=>showPage('landing'));
document.getElementById('btn-retry-location')?.addEventListener('click', ()=>showPage('permissions'));
document.getElementById('btn-error-location-home')?.addEventListener('click', ()=>showPage('landing'));
document.getElementById('btn-retry-offline')?.addEventListener('click', ()=>{ if(navigator.onLine)showPage('landing'); else alert('Still offline.'); });
document.getElementById('btn-error-offline-home')?.addEventListener('click', ()=>showPage('landing'));

document.getElementById('btn-new-session')?.addEventListener('click', ()=>{ resetAll(); showPage('terms'); });
document.getElementById('btn-back-home')?.addEventListener('click',   ()=>{ resetAll(); showPage('landing'); });

document.getElementById('select-theme')?.addEventListener('change', e=>applyTheme(e.target.value));

// Terms checkbox
document.getElementById('chk-agree')?.addEventListener('change', function() {
  const btn = document.getElementById('btn-agree');
  if(btn) btn.disabled = !this.checked;
});

document.getElementById('btn-agree')?.addEventListener('click', ()=>{
  const chk = document.getElementById('chk-agree');
  if(!chk||!chk.checked) return;
  showPage('permissions');
});

// FAQ accordion
document.querySelectorAll('.faq-question').forEach(q=>{
  q.addEventListener('click', ()=>{
    const item=q.parentElement;
    const open=item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));
    if(!open) item.classList.add('open');
  });
});

// ── Reset ─────────────────────────────────────────────────────
function resetAll() {
  timerElapsed=0; timerStartTs=null; timerRunning=false;
  Object.assign(session,{id:'',startTime:null,endTime:null,duration:0,lat:null,lng:null,accuracy:null,cameraOk:false,photoBlob:null,pdfName:''});
  const disp=document.getElementById('timer-display');
  const circle=document.getElementById('timer-progress-circle');
  if(disp)   disp.textContent='00:00:00';
  if(circle) circle.style.strokeDashoffset=CIRCUMFERENCE;
  updateTimerUI();
  const chk=document.getElementById('chk-agree');
  const btn=document.getElementById('btn-agree');
  if(chk) chk.checked=false;
  if(btn) btn.disabled=true;
  document.getElementById('complete-sending')?.classList.remove('hidden');
  document.getElementById('complete-sent')?.classList.add('hidden');
  document.getElementById('complete-error')?.classList.add('hidden');
  pdfDoc=null; pdfPage=1;
  document.getElementById('pdf-drop-zone')?.classList.remove('hidden');
  document.getElementById('pdf-viewer-wrap')?.classList.add('hidden');
  document.getElementById('pdf-progress-bar')?.classList.add('hidden');
}

// ── Guards ────────────────────────────────────────────────────
window.addEventListener('beforeunload', e=>{
  if(currentPage==='session'&&timerRunning){e.preventDefault();e.returnValue='Session is active.';}
});
window.addEventListener('offline', ()=>{ if(currentPage!=='landing') showPage('errorOffline'); });

// ── PWA ───────────────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
}

// ── Init ──────────────────────────────────────────────────────
showPage('landing');
