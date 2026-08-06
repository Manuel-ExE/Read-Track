/* ============================================================
   ReadTrack V2 — script.js
   Camera · Geolocation · Timer · PDF.js · PWA · Settings
   ============================================================ */
'use strict';

// ── PDF.js worker ──────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Inject SVG gradient for circular timer ─────────────────
document.body.insertAdjacentHTML('afterbegin', `
  <svg class="svg-defs" aria-hidden="true">
    <defs>
      <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#8b5cf6"/>
      </linearGradient>
    </defs>
  </svg>
`);

// ============================================================
// UTILITIES
// ============================================================
function generateSessionId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `RS-${ts}-${rand}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function getBrowserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua))        return 'Microsoft Edge';
  if (/OPR\/|Opera/.test(ua))  return 'Opera';
  if (/Chrome\//.test(ua))     return 'Google Chrome';
  if (/Firefox\//.test(ua))    return 'Mozilla Firefox';
  if (/Safari\//.test(ua))     return 'Apple Safari';
  return 'Unknown Browser';
}

function getOSName() {
  const ua = navigator.userAgent;
  if (/Android/.test(ua))          return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Windows NT 10/.test(ua))    return 'Windows 10/11';
  if (/Windows/.test(ua))          return 'Windows';
  if (/Mac OS X/.test(ua))         return 'macOS';
  if (/Linux/.test(ua))            return 'Linux';
  return 'Unknown OS';
}

function getDeviceType() {
  const ua = navigator.userAgent;
  if (/Tablet|iPad/.test(ua))             return 'Tablet';
  if (/Mobile|Android|iPhone|iPod/.test(ua)) return 'Mobile';
  return 'Desktop';
}

function getScreenResolution() {
  return `${screen.width}x${screen.height}`;
}

// ============================================================
// SETTINGS
// ============================================================
const settings = {
  theme: localStorage.getItem('rt-theme') || 'auto',
};

function applyTheme(theme) {
  settings.theme = theme;
  localStorage.setItem('rt-theme', theme);
  if (theme === 'auto') {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', theme);
  }
  const sel = document.getElementById('select-theme');
  if (sel) sel.value = theme;
}

applyTheme(settings.theme);

// ============================================================
// PAGE ROUTER
// ============================================================
const pages = {
  landing:        document.getElementById('page-landing'),
  terms:          document.getElementById('page-terms'),
  permissions:    document.getElementById('page-permissions'),
  session:        document.getElementById('page-session'),
  pdf:            document.getElementById('page-pdf'),
  complete:       document.getElementById('page-complete'),
  settings:       document.getElementById('page-settings'),
  errorCamera:    document.getElementById('page-error-camera'),
  errorLocation:  document.getElementById('page-error-location'),
  errorOffline:   document.getElementById('page-error-offline'),
};

let currentPage = 'landing';

function showPage(name) {
  Object.values(pages).forEach(p => { if (p) p.classList.remove('active'); });
  if (pages[name]) {
    pages[name].classList.add('active');
    currentPage = name;
    window.scrollTo(0, 0);
  }
}

// ============================================================
// SESSION STATE
// ============================================================
const session = {
  id:          '',
  startTime:   null,
  endTime:     null,
  duration:    0,
  lat:         null,
  lng:         null,
  accuracy:    null,
  gpsTs:       null,
  cameraOk:    false,
  photoBlob:   null,
  photoBase64: null,
  browser:     getBrowserName(),
  os:          getOSName(),
  device:      getDeviceType(),
  screenRes:   getScreenResolution(),
  pdfName:     '',
};

// ============================================================
// TIMER
// ============================================================
let timerInterval   = null;
let timerStartTs    = null;
let timerElapsed    = 0;
let timerRunning    = false;

const timerDisplay         = document.getElementById('timer-display');
const sessionStatusText    = document.getElementById('session-status-text');
const btnPauseResume       = document.getElementById('btn-pause-resume');
const iconPause            = document.getElementById('icon-pause');
const iconPlay             = document.getElementById('icon-play');
const pauseResumeLabel     = document.getElementById('pause-resume-label');
const timerProgressCircle  = document.getElementById('timer-progress-circle');

const CIRCLE_CIRCUMFERENCE = 565.5;

function startTimer() {
  timerStartTs = Date.now();
  timerRunning = true;
  timerInterval = setInterval(tickTimer, 500);
  updateTimerUI();
}

function pauseTimer() {
  if (!timerRunning) return;
  timerElapsed += Date.now() - timerStartTs;
  clearInterval(timerInterval);
  timerRunning = false;
  updateTimerUI();
}

function resumeTimer() {
  if (timerRunning) return;
  timerStartTs = Date.now();
  timerRunning = true;
  timerInterval = setInterval(tickTimer, 500);
  updateTimerUI();
}

function stopTimer() {
  if (timerRunning) timerElapsed += Date.now() - timerStartTs;
  clearInterval(timerInterval);
  timerRunning = false;
  session.duration = timerElapsed;
  updateTimerUI();
}

function tickTimer() {
  const current = timerElapsed + (Date.now() - timerStartTs);
  timerDisplay.textContent = formatDuration(current);
  updateCircularProgress(current);
}

function updateCircularProgress(ms) {
  const maxTime = 3600000;
  const progress = Math.min(ms / maxTime, 1);
  const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);
  if (timerProgressCircle) timerProgressCircle.style.strokeDashoffset = offset;
}

function updateTimerUI() {
  if (timerRunning) {
    timerDisplay.classList.remove('paused');
    sessionStatusText.classList.remove('paused');
    sessionStatusText.textContent = 'Active';
    iconPause.classList.remove('hidden');
    iconPlay.classList.add('hidden');
    pauseResumeLabel.textContent = 'Pause';
  } else {
    timerDisplay.classList.add('paused');
    sessionStatusText.classList.add('paused');
    sessionStatusText.textContent = 'Paused';
    iconPause.classList.add('hidden');
    iconPlay.classList.remove('hidden');
    pauseResumeLabel.textContent = 'Resume';
  }
}

if (btnPauseResume) {
  btnPauseResume.addEventListener('click', () => {
    if (timerRunning) pauseTimer();
    else              resumeTimer();
  });
}

// ============================================================
// CAMERA
// ============================================================
const videoEl  = document.getElementById('camera-video');
const canvasEl = document.getElementById('camera-canvas');
let cameraStream = null;

async function requestCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    if (videoEl) videoEl.srcObject = cameraStream;
    return true;
  } catch (err) {
    console.warn('Camera error:', err);
    return false;
  }
}

function capturePhoto() {
  return new Promise((resolve) => {
    if (!cameraStream) { resolve(null); return; }
    const track    = cameraStream.getVideoTracks()[0];
    const s        = track.getSettings();
    const w        = s.width  || 640;
    const h        = s.height || 480;
    canvasEl.width  = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    canvasEl.toBlob(blob => {
      if (blob) {
        session.photoBlob = blob;
        const reader = new FileReader();
        reader.onloadend = () => {
          session.photoBase64 = reader.result.split(',')[1];
          resolve(blob);
        };
        reader.readAsDataURL(blob);
      } else { resolve(null); }
    }, 'image/jpeg', 0.82);
  });
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

// ============================================================
// GEOLOCATION
// ============================================================
async function requestLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(false); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        session.lat      = pos.coords.latitude;
        session.lng      = pos.coords.longitude;
        session.accuracy = pos.coords.accuracy;
        session.gpsTs    = pos.timestamp;
        resolve(true);
      },
      (err) => { console.warn('Geolocation error:', err); resolve(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ============================================================
// PERMISSIONS PAGE
// ============================================================
let cameraGranted   = false;
let locationGranted = false;

const permStatusCamera   = document.getElementById('perm-status-camera');
const permStatusLocation = document.getElementById('perm-status-location');
const permCardCamera     = document.getElementById('perm-card-camera');
const permCardLocation   = document.getElementById('perm-card-location');
const permsError         = document.getElementById('perms-error');
const btnGrantPerms      = document.getElementById('btn-grant-perms');

function setPermBadge(el, card, state) {
  const map = {
    pending: '<span class="badge badge-pending">Pending</span>',
    granted: '<span class="badge badge-granted">Granted ✓</span>',
    denied:  '<span class="badge badge-denied">Denied ✗</span>',
  };
  if (el) el.innerHTML = map[state] || map.pending;
  if (card) card.className = 'perm-card' + (state === 'granted' ? ' granted' : state === 'denied' ? ' denied' : '');
}

if (btnGrantPerms) {
  btnGrantPerms.addEventListener('click', async () => {
    btnGrantPerms.disabled = true;
    btnGrantPerms.textContent = 'Requesting…';
    if (permsError) permsError.classList.add('hidden');

    setPermBadge(permStatusCamera, permCardCamera, 'pending');
    cameraGranted = await requestCamera();
    setPermBadge(permStatusCamera, permCardCamera, cameraGranted ? 'granted' : 'denied');

    setPermBadge(permStatusLocation, permCardLocation, 'pending');
    locationGranted = await requestLocation();
    setPermBadge(permStatusLocation, permCardLocation, locationGranted ? 'granted' : 'denied');

    if (!cameraGranted) {
      btnGrantPerms.disabled = false;
      btnGrantPerms.textContent = 'Try Again';
      showPage('errorCamera'); return;
    }
    if (!locationGranted) {
      btnGrantPerms.disabled = false;
      btnGrantPerms.textContent = 'Try Again';
      showPage('errorLocation'); return;
    }

    await beginSession();
  });
}

// ============================================================
// BEGIN SESSION
// ============================================================
async function beginSession() {
  session.id        = generateSessionId();
  session.startTime = new Date();

  const photo = await capturePhoto();
  session.cameraOk  = !!photo;

  const idLabel = document.getElementById('session-id-label');
  if (idLabel) idLabel.textContent = session.id;

  const statusCam = document.getElementById('status-camera');
  const statusLoc = document.getElementById('status-location');

  if (statusCam) {
    statusCam.textContent  = session.cameraOk ? 'Verified ✓' : 'No Photo';
    statusCam.className    = 'status-value ' + (session.cameraOk ? 'status-ok' : 'status-warning');
  }
  if (statusLoc) {
    statusLoc.textContent  = session.lat ? 'Captured ✓' : 'Unavailable';
    statusLoc.className    = 'status-value ' + (session.lat ? 'status-ok' : 'status-warning');
  }

  timerElapsed = 0; timerStartTs = null;
  if (timerProgressCircle) timerProgressCircle.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE;
  if (timerDisplay) timerDisplay.textContent = '00:00:00';

  showPage('session');
  startTimer();
}

// ============================================================
// END SESSION
// ============================================================
const btnEndSession = document.getElementById('btn-end-session');
if (btnEndSession) {
  btnEndSession.addEventListener('click', () => {
    if (!confirm('Are you sure you want to end the session?')) return;
    endSession();
  });
}

async function endSession() {
  stopTimer();
  session.endTime = new Date();
  if (cameraStream && !session.photoBase64) await capturePhoto();
  stopCamera();
  populateCompletePage();
  showPage('complete');
  await sendSessionData();
}

function populateCompletePage() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('c-duration', formatDuration(session.duration));
  set('c-start',    formatDateTime(session.startTime));
  set('c-end',      formatDateTime(session.endTime));
  set('c-location', session.lat ? `${session.lat.toFixed(5)}, ${session.lng.toFixed(5)}` : 'Unavailable');
  set('c-camera',   session.cameraOk ? 'Verified ✓' : 'Not captured');
}

// ============================================================
// SEND SESSION DATA
// ============================================================
async function sendSessionData() {
  const sendingEl = document.getElementById('complete-sending');
  const sentEl    = document.getElementById('complete-sent');
  const errorEl   = document.getElementById('complete-error');

  if (sendingEl) sendingEl.classList.remove('hidden');
  if (sentEl)    sentEl.classList.add('hidden');
  if (errorEl)   errorEl.classList.add('hidden');

  const formData = new FormData();
  formData.append('sessionId',    session.id);
  formData.append('startTime',    session.startTime.toISOString());
  formData.append('endTime',      session.endTime.toISOString());
  formData.append('duration',     formatDuration(session.duration));
  formData.append('durationMs',   String(session.duration));
  formData.append('latitude',     session.lat      != null ? String(session.lat)      : '');
  formData.append('longitude',    session.lng      != null ? String(session.lng)      : '');
  formData.append('accuracy',     session.accuracy != null ? String(session.accuracy) : '');
  formData.append('gpsTimestamp', session.gpsTs    != null ? String(session.gpsTs)    : '');
  formData.append('browser',      session.browser);
  formData.append('os',           session.os);
  formData.append('device',       session.device);
  formData.append('screenRes',    session.screenRes);
  formData.append('cameraOk',     String(session.cameraOk));
  formData.append('pdfName',      session.pdfName || '');

  if (session.photoBlob) {
    formData.append('photo', session.photoBlob, `verify-${session.id}.jpg`);
  }

  try {
    if (!navigator.onLine) throw new Error('Offline');

    const res = await fetch('/.netlify/functions/session', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (sendingEl) sendingEl.classList.add('hidden');
    if (sentEl)    sentEl.classList.remove('hidden');
  } catch (err) {
    console.error('Send error:', err);
    if (sendingEl) sendingEl.classList.add('hidden');
    if (errorEl)   errorEl.classList.remove('hidden');

    try {
      const fallback = {
        sessionId: session.id,
        startTime: session.startTime.toISOString(),
        endTime:   session.endTime.toISOString(),
        duration:  formatDuration(session.duration),
        lat:       session.lat,
        lng:       session.lng,
        browser:   session.browser,
        os:        session.os,
        device:    session.device,
        screenRes: session.screenRes,
        cameraOk:  session.cameraOk,
      };
      localStorage.setItem(`rt-${session.id}`, JSON.stringify(fallback));
    } catch (_) { /* ignore */ }
  }
}

// ============================================================
// PDF READER
// ============================================================
let pdfDoc        = null;
let pdfPageNum    = 1;
let pdfScale      = 1.5;
let pdfRendering  = false;
let pdfPendingPg  = null;

const pdfCanvas      = document.getElementById('pdf-canvas');
const pdfCtx         = pdfCanvas ? pdfCanvas.getContext('2d') : null;
const pdfCurrentPage = document.getElementById('pdf-current-page');
const pdfTotalPages  = document.getElementById('pdf-total-pages');
const pdfFilenameEl  = document.getElementById('pdf-filename');
const pdfDropZone    = document.getElementById('pdf-drop-zone');
const pdfViewerWrap  = document.getElementById('pdf-viewer-wrap');
const zoomLevelEl    = document.getElementById('zoom-level');
const pdfProgressBar = document.getElementById('pdf-progress-bar');
const pdfProgressFill= document.getElementById('pdf-progress-fill');

function renderPdfPage(num) {
  if (!pdfDoc || !pdfCtx) return;
  if (pdfRendering) { pdfPendingPg = num; return; }
  pdfRendering = true;
  if (pdfCurrentPage) pdfCurrentPage.textContent = num;
  updatePdfProgress(num);

  pdfDoc.getPage(num).then(page => {
    const viewport = page.getViewport({ scale: pdfScale });
    pdfCanvas.height = viewport.height;
    pdfCanvas.width  = viewport.width;
    page.render({ canvasContext: pdfCtx, viewport }).promise.then(() => {
      pdfRendering = false;
      if (pdfPendingPg !== null) {
        renderPdfPage(pdfPendingPg);
        pdfPendingPg = null;
      }
    });
  });
}

function updatePdfProgress(num) {
  if (!pdfDoc || !pdfProgressFill || !pdfProgressBar) return;
  const pct = Math.round((num / pdfDoc.numPages) * 100);
  pdfProgressFill.style.width = pct + '%';
  pdfProgressBar.classList.remove('hidden');
}

function loadPdfFile(file) {
  if (!file || file.type !== 'application/pdf') return;
  const name = file.name.length > 30 ? file.name.slice(0, 27) + '…' : file.name;
  if (pdfFilenameEl) pdfFilenameEl.textContent = name;
  session.pdfName = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    const arr = new Uint8Array(e.target.result);
    pdfjsLib.getDocument(arr).promise.then(doc => {
      pdfDoc    = doc;
      pdfPageNum = 1;
      if (pdfTotalPages) pdfTotalPages.textContent = doc.numPages;
      if (pdfDropZone)   pdfDropZone.classList.add('hidden');
      if (pdfViewerWrap) pdfViewerWrap.classList.remove('hidden');
      renderPdfPage(pdfPageNum);
    }).catch(err => alert('Could not open PDF: ' + err.message));
  };
  reader.readAsArrayBuffer(file);
}

const btnSelectPdf = document.getElementById('btn-select-pdf');
const pdfFileInput = document.getElementById('pdf-file-input');
if (btnSelectPdf) btnSelectPdf.addEventListener('click', () => pdfFileInput.click());
if (pdfFileInput)  pdfFileInput.addEventListener('change', e => { if (e.target.files[0]) loadPdfFile(e.target.files[0]); });

if (pdfDropZone) {
  pdfDropZone.addEventListener('dragover',  e => { e.preventDefault(); pdfDropZone.style.borderColor = 'var(--primary)'; });
  pdfDropZone.addEventListener('dragleave', ()=> { pdfDropZone.style.borderColor = ''; });
  pdfDropZone.addEventListener('drop', e => { e.preventDefault(); pdfDropZone.style.borderColor = ''; if (e.dataTransfer.files[0]) loadPdfFile(e.dataTransfer.files[0]); });
}

const btnPrev = document.getElementById('btn-prev-page');
const btnNext = document.getElementById('btn-next-page');
if (btnPrev) btnPrev.addEventListener('click', () => { if (pdfDoc && pdfPageNum > 1) renderPdfPage(--pdfPageNum); });
if (btnNext) btnNext.addEventListener('click', () => { if (pdfDoc && pdfPageNum < pdfDoc.numPages) renderPdfPage(++pdfPageNum); });

const btnZoomIn  = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
if (btnZoomIn) btnZoomIn.addEventListener('click', () => {
  if (pdfScale >= 4) return;
  pdfScale = Math.round((pdfScale + 0.25) * 100) / 100;
  if (zoomLevelEl) zoomLevelEl.textContent = Math.round(pdfScale * 100) + '%';
  if (pdfDoc) renderPdfPage(pdfPageNum);
});
if (btnZoomOut) btnZoomOut.addEventListener('click', () => {
  if (pdfScale <= 0.5) return;
  pdfScale = Math.round((pdfScale - 0.25) * 100) / 100;
  if (zoomLevelEl) zoomLevelEl.textContent = Math.round(pdfScale * 100) + '%';
  if (pdfDoc) renderPdfPage(pdfPageNum);
});

const btnFullscreen = document.getElementById('btn-pdf-fullscreen');
if (btnFullscreen) {
  btnFullscreen.addEventListener('click', () => {
    const el = pdfViewerWrap || document.getElementById('page-pdf');
    if (el && el.requestFullscreen) el.requestFullscreen();
    else if (el && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  });
}

// ============================================================
// NAVIGATION WIRING
// ============================================================

// Landing
const btnHeroStart = document.getElementById('btn-hero-start');
const btnHeroLearn = document.getElementById('btn-hero-learn');
if (btnHeroStart) btnHeroStart.addEventListener('click', () => showPage('terms'));
if (btnHeroLearn) btnHeroLearn.addEventListener('click', () => {
  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
});

// Footer links
document.getElementById('link-footer-terms')?.addEventListener('click', e => { e.preventDefault(); showPage('terms'); });
document.getElementById('link-footer-settings')?.addEventListener('click', e => { e.preventDefault(); showPage('settings'); });

// Terms page
document.getElementById('btn-back-terms')?.addEventListener('click', () => showPage('landing'));

const chkAgree = document.getElementById('chk-agree');
const btnAgree = document.getElementById('btn-agree');
if (chkAgree) chkAgree.addEventListener('change', () => { if (btnAgree) btnAgree.disabled = !chkAgree.checked; });
if (btnAgree) btnAgree.addEventListener('click', () => {
  if (!chkAgree || !chkAgree.checked) return;
  setPermBadge(permStatusCamera,   permCardCamera,   'pending');
  setPermBadge(permStatusLocation, permCardLocation, 'pending');
  if (permsError)    permsError.classList.add('hidden');
  if (btnGrantPerms) { btnGrantPerms.disabled = false; btnGrantPerms.textContent = 'Grant Permissions'; }
  showPage('permissions');
});

// Permissions back
document.getElementById('btn-back-perms')?.addEventListener('click', () => { stopCamera(); showPage('terms'); });

// Session page
document.getElementById('btn-open-pdf')?.addEventListener('click', () => showPage('pdf'));
document.getElementById('btn-session-settings')?.addEventListener('click', () => showPage('settings'));

// PDF back
document.getElementById('btn-back-pdf')?.addEventListener('click', () => showPage('session'));

// Complete page
document.getElementById('btn-new-session')?.addEventListener('click', () => {
  resetSession();
  showPage('terms');
});
document.getElementById('btn-back-home')?.addEventListener('click', () => {
  resetSession();
  showPage('landing');
});

// Settings back
document.getElementById('btn-back-settings')?.addEventListener('click', () => showPage('landing'));
const selectTheme = document.getElementById('select-theme');
if (selectTheme) selectTheme.addEventListener('change', e => applyTheme(e.target.value));

// Error pages
document.getElementById('btn-retry-camera')?.addEventListener('click',   () => showPage('permissions'));
document.getElementById('btn-error-camera-home')?.addEventListener('click', () => showPage('landing'));
document.getElementById('btn-retry-location')?.addEventListener('click',  () => showPage('permissions'));
document.getElementById('btn-error-location-home')?.addEventListener('click', () => showPage('landing'));
document.getElementById('btn-retry-offline')?.addEventListener('click',   () => {
  if (navigator.onLine) showPage('landing');
  else alert('Still offline. Please check your connection.');
});
document.getElementById('btn-error-offline-home')?.addEventListener('click', () => showPage('landing'));

// FAQ accordion
document.querySelectorAll('.faq-question').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.parentElement;
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ============================================================
// RESET SESSION
// ============================================================
function resetSession() {
  timerElapsed = 0; timerStartTs = null; timerRunning = false;
  session.id = ''; session.startTime = null; session.endTime = null;
  session.duration = 0; session.lat = null; session.lng = null;
  session.accuracy = null; session.cameraOk = false;
  session.photoBlob = null; session.photoBase64 = null;
  session.pdfName = '';

  if (timerDisplay)         timerDisplay.textContent = '00:00:00';
  if (timerDisplay)         timerDisplay.classList.remove('paused');
  if (sessionStatusText)    sessionStatusText.textContent = 'Active';
  if (sessionStatusText)    sessionStatusText.classList.remove('paused');
  if (iconPause)            iconPause.classList.remove('hidden');
  if (iconPlay)             iconPlay.classList.add('hidden');
  if (pauseResumeLabel)     pauseResumeLabel.textContent = 'Pause';
  if (timerProgressCircle)  timerProgressCircle.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE;

  if (chkAgree)   chkAgree.checked = false;
  if (btnAgree)   btnAgree.disabled = true;

  const completeSending = document.getElementById('complete-sending');
  const completeSent    = document.getElementById('complete-sent');
  const completeError   = document.getElementById('complete-error');
  if (completeSending) completeSending.classList.remove('hidden');
  if (completeSent)    completeSent.classList.add('hidden');
  if (completeError)   completeError.classList.add('hidden');

  pdfDoc = null; pdfPageNum = 1;
  if (pdfDropZone)     pdfDropZone.classList.remove('hidden');
  if (pdfViewerWrap)   pdfViewerWrap.classList.add('hidden');
  if (pdfProgressBar)  pdfProgressBar.classList.add('hidden');
  if (pdfFilenameEl)   pdfFilenameEl.textContent = 'PDF Reader';
  if (pdfCurrentPage)  pdfCurrentPage.textContent = '—';
  if (pdfTotalPages)   pdfTotalPages.textContent = '—';
}

// ============================================================
// PREVENT ACCIDENTAL CLOSE
// ============================================================
window.addEventListener('beforeunload', e => {
  if (currentPage === 'session' && timerRunning) {
    e.preventDefault();
    e.returnValue = 'Your reading session is active. Are you sure you want to leave?';
    return e.returnValue;
  }
});

// ============================================================
// OFFLINE DETECTION
// ============================================================
window.addEventListener('offline', () => {
  if (currentPage !== 'landing') showPage('errorOffline');
});

// ============================================================
// PWA REGISTRATION
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('✅ Service Worker registered'))
      .catch(err => console.warn('⚠️ Service Worker registration failed:', err));
  });
}

// ============================================================
// INIT
// ============================================================
showPage('landing');
