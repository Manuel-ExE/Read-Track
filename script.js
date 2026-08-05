/* ============================================================
   ReadTrack — script.js
   Camera · Geolocation · Timer · PDF.js · Session logic
   ============================================================ */

'use strict';

// ── PDF.js worker ──────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ============================================================
// UTILITIES
// ============================================================

/** Generate a short unique session ID */
function generateSessionId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `RS-${ts}-${rand}`;
}

/** Format milliseconds → HH:MM:SS */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

/** Format a Date object to a readable local string */
function formatDateTime(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Detect browser name */
function getBrowserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua))         return 'Microsoft Edge';
  if (/OPR\/|Opera/.test(ua))   return 'Opera';
  if (/Chrome\//.test(ua))      return 'Google Chrome';
  if (/Firefox\//.test(ua))     return 'Mozilla Firefox';
  if (/Safari\//.test(ua))      return 'Apple Safari';
  return 'Unknown Browser';
}

/** Detect OS */
function getOSName() {
  const ua = navigator.userAgent;
  if (/Android/.test(ua))        return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Windows NT 10/.test(ua))  return 'Windows 10/11';
  if (/Windows/.test(ua))        return 'Windows';
  if (/Mac OS X/.test(ua))       return 'macOS';
  if (/Linux/.test(ua))          return 'Linux';
  return 'Unknown OS';
}

/** Detect device type */
function getDeviceType() {
  const ua = navigator.userAgent;
  if (/Tablet|iPad/.test(ua))                          return 'Tablet';
  if (/Mobile|Android|iPhone|iPod/.test(ua))           return 'Mobile';
  return 'Desktop';
}

// ============================================================
// PAGE ROUTER
// ============================================================

const pages = {
  home:        document.getElementById('page-home'),
  terms:       document.getElementById('page-terms'),
  permissions: document.getElementById('page-permissions'),
  session:     document.getElementById('page-session'),
  pdf:         document.getElementById('page-pdf'),
  complete:    document.getElementById('page-complete'),
};

let currentPage = 'home';

function showPage(name) {
  Object.values(pages).forEach(p => p.classList.remove('active'));
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
  id:         '',
  startTime:  null,
  endTime:    null,
  duration:   0,        // ms
  lat:        null,
  lng:        null,
  accuracy:   null,
  gpsTs:      null,
  cameraOk:   false,
  photoBlob:  null,     // captured verification photo
  photoBase64: null,
  browser:    getBrowserName(),
  os:         getOSName(),
  device:     getDeviceType(),
};

// ============================================================
// TIMER
// ============================================================

let timerInterval   = null;
let timerStartTs    = null;  // Date.now() when timer last resumed
let timerElapsed    = 0;     // accumulated ms before latest start
let timerRunning    = false;

const timerDisplay      = document.getElementById('timer-display');
const sessionStatusText = document.getElementById('session-status-text');
const btnPauseResume    = document.getElementById('btn-pause-resume');
const iconPause         = document.getElementById('icon-pause');
const iconPlay          = document.getElementById('icon-play');
const pauseResumeLabel  = document.getElementById('pause-resume-label');

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
  if (timerRunning) {
    timerElapsed += Date.now() - timerStartTs;
  }
  clearInterval(timerInterval);
  timerRunning = false;
  session.duration = timerElapsed;
  updateTimerUI();
}

function tickTimer() {
  const current = timerElapsed + (Date.now() - timerStartTs);
  timerDisplay.textContent = formatDuration(current);
}

function updateTimerUI() {
  if (timerRunning) {
    timerDisplay.classList.remove('paused');
    sessionStatusText.classList.remove('paused');
    sessionStatusText.textContent = 'Session Active';
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

btnPauseResume.addEventListener('click', () => {
  if (timerRunning) pauseTimer();
  else              resumeTimer();
});

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
    videoEl.srcObject = cameraStream;
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
    const settings = track.getSettings();
    const w        = settings.width  || 640;
    const h        = settings.height || 480;

    canvasEl.width  = w;
    canvasEl.height = h;

    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);

    canvasEl.toBlob(blob => {
      if (blob) {
        session.photoBlob = blob;
        const reader = new FileReader();
        reader.onloadend = () => {
          session.photoBase64 = reader.result.split(',')[1]; // base64 only
          resolve(blob);
        };
        reader.readAsDataURL(blob);
      } else {
        resolve(null);
      }
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
      (err) => {
        console.warn('Geolocation error:', err);
        resolve(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// ============================================================
// PERMISSIONS PAGE LOGIC
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
  const badgeMap = {
    pending: '<span class="badge badge-pending">Pending</span>',
    granted: '<span class="badge badge-granted">Granted ✓</span>',
    denied:  '<span class="badge badge-denied">Denied ✗</span>',
  };
  el.innerHTML = badgeMap[state] || badgeMap.pending;
  card.className = 'perm-card' + (state === 'granted' ? ' granted' : state === 'denied' ? ' denied' : '');
}

btnGrantPerms.addEventListener('click', async () => {
  btnGrantPerms.disabled = true;
  btnGrantPerms.textContent = 'Requesting…';
  permsError.classList.add('hidden');

  // Request camera
  setPermBadge(permStatusCamera, permCardCamera, 'pending');
  cameraGranted = await requestCamera();
  setPermBadge(permStatusCamera, permCardCamera, cameraGranted ? 'granted' : 'denied');

  // Request location
  setPermBadge(permStatusLocation, permCardLocation, 'pending');
  locationGranted = await requestLocation();
  setPermBadge(permStatusLocation, permCardLocation, locationGranted ? 'granted' : 'denied');

  if (cameraGranted && locationGranted) {
    // Both granted — start session
    await beginSession();
  } else {
    permsError.classList.remove('hidden');
    btnGrantPerms.disabled = false;
    btnGrantPerms.textContent = 'Try Again';
  }
});

// ============================================================
// BEGIN SESSION
// ============================================================

async function beginSession() {
  // Generate session ID
  session.id        = generateSessionId();
  session.startTime = new Date();

  // Capture verification photo (non-blocking — best effort)
  const photo = await capturePhoto();
  session.cameraOk = !!photo;

  // Update session page UI
  document.getElementById('session-id-label').textContent = session.id;
  document.getElementById('status-camera').textContent    = session.cameraOk ? 'Verified ✓' : 'No Photo';
  document.getElementById('status-location').textContent  = session.lat ? 'Captured ✓' : 'Unavailable';

  if (!session.cameraOk) {
    document.getElementById('status-camera').className = 'status-card-value status-warning';
  }
  if (!session.lat) {
    document.getElementById('status-location').className = 'status-card-value status-warning';
  }

  // Reset timer state
  timerElapsed = 0;
  timerStartTs = null;

  showPage('session');
  startTimer();
}

// ============================================================
// END SESSION
// ============================================================

document.getElementById('btn-end-session').addEventListener('click', () => {
  if (!confirm('Are you sure you want to end the session?')) return;
  endSession();
});

async function endSession() {
  stopTimer();
  session.endTime = new Date();

  // Optionally capture a final photo
  if (cameraStream && !session.photoBase64) {
    await capturePhoto();
  }

  stopCamera();

  // Populate complete page
  populateCompletePage();
  showPage('complete');

  // Send to backend
  await sendSessionData();
}

function populateCompletePage() {
  document.getElementById('c-session-id').textContent = session.id;
  document.getElementById('c-duration').textContent   = formatDuration(session.duration);
  document.getElementById('c-start').textContent      = formatDateTime(session.startTime);
  document.getElementById('c-end').textContent        = formatDateTime(session.endTime);
  document.getElementById('c-location').textContent   =
    session.lat
      ? `${session.lat.toFixed(5)}, ${session.lng.toFixed(5)}`
      : 'Unavailable';
  document.getElementById('c-camera').textContent     = session.cameraOk ? 'Verified ✓' : 'Not captured';
}

// ============================================================
// SEND SESSION DATA TO BACKEND
// ============================================================

async function sendSessionData() {
  const sendingEl = document.getElementById('complete-sending');
  const sentEl    = document.getElementById('complete-sent');
  const errorEl   = document.getElementById('complete-error');

  sendingEl.classList.remove('hidden');
  sentEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  // Build multipart form to support photo upload
  const formData = new FormData();
  formData.append('sessionId',    session.id);
  formData.append('startTime',    session.startTime.toISOString());
  formData.append('endTime',      session.endTime.toISOString());
  formData.append('duration',     formatDuration(session.duration));
  formData.append('durationMs',   String(session.duration));
  formData.append('latitude',     session.lat  != null ? String(session.lat)      : '');
  formData.append('longitude',    session.lng  != null ? String(session.lng)      : '');
  formData.append('accuracy',     session.accuracy != null ? String(session.accuracy) : '');
  formData.append('gpsTimestamp', session.gpsTs != null ? String(session.gpsTs)   : '');
  formData.append('browser',      session.browser);
  formData.append('os',           session.os);
  formData.append('device',       session.device);
  formData.append('cameraOk',     String(session.cameraOk));

  if (session.photoBlob) {
    formData.append('photo', session.photoBlob, `verify-${session.id}.jpg`);
  }

  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    sendingEl.classList.add('hidden');
    sentEl.classList.remove('hidden');
  } catch (err) {
    console.error('Send error:', err);
    sendingEl.classList.add('hidden');
    errorEl.classList.remove('hidden');

    // Persist locally as fallback
    try {
      const fallback = {
        sessionId: session.id,
        startTime: session.startTime.toISOString(),
        endTime:   session.endTime.toISOString(),
        duration:  formatDuration(session.duration),
        lat:       session.lat,
        lng:       session.lng,
        accuracy:  session.accuracy,
        browser:   session.browser,
        os:        session.os,
        device:    session.device,
        cameraOk:  session.cameraOk,
      };
      localStorage.setItem(`readtrack-${session.id}`, JSON.stringify(fallback));
    } catch (_) { /* storage full or unavailable */ }
  }
}

// ============================================================
// PDF READER
// ============================================================

let pdfDoc       = null;
let pdfPageNum   = 1;
let pdfScale     = 1.5;
let pdfRendering = false;
let pdfPendingPage = null;

const pdfCanvas       = document.getElementById('pdf-canvas');
const pdfCtx          = pdfCanvas.getContext('2d');
const pdfCurrentPage  = document.getElementById('pdf-current-page');
const pdfTotalPages   = document.getElementById('pdf-total-pages');
const pdfFilename     = document.getElementById('pdf-filename');
const pdfDropZone     = document.getElementById('pdf-drop-zone');
const pdfViewerWrap   = document.getElementById('pdf-viewer-wrap');
const zoomLevelEl     = document.getElementById('zoom-level');

function renderPdfPage(num) {
  if (!pdfDoc) return;

  if (pdfRendering) {
    pdfPendingPage = num;
    return;
  }

  pdfRendering = true;
  pdfCurrentPage.textContent = num;

  pdfDoc.getPage(num).then(page => {
    const viewport = page.getViewport({ scale: pdfScale });
    pdfCanvas.height = viewport.height;
    pdfCanvas.width  = viewport.width;

    const renderCtx = { canvasContext: pdfCtx, viewport };

    page.render(renderCtx).promise.then(() => {
      pdfRendering = false;
      if (pdfPendingPage !== null) {
        renderPdfPage(pdfPendingPage);
        pdfPendingPage = null;
      }
    });
  });
}

function loadPdfFile(file) {
  if (!file || file.type !== 'application/pdf') return;

  pdfFilename.textContent = file.name.length > 30
    ? file.name.slice(0, 27) + '…'
    : file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    const typedArray = new Uint8Array(e.target.result);
    pdfjsLib.getDocument(typedArray).promise.then(doc => {
      pdfDoc     = doc;
      pdfPageNum = 1;
      pdfTotalPages.textContent = doc.numPages;

      pdfDropZone.classList.add('hidden');
      pdfViewerWrap.classList.remove('hidden');

      renderPdfPage(pdfPageNum);
    }).catch(err => {
      alert('Could not open PDF: ' + err.message);
    });
  };
  reader.readAsArrayBuffer(file);
}

// File input
document.getElementById('btn-select-pdf').addEventListener('click', () => {
  document.getElementById('pdf-file-input').click();
});

document.getElementById('pdf-file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) loadPdfFile(e.target.files[0]);
});

// Drag & drop
pdfDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  pdfDropZone.style.borderColor = 'var(--primary)';
});

pdfDropZone.addEventListener('dragleave', () => {
  pdfDropZone.style.borderColor = '';
});

pdfDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  pdfDropZone.style.borderColor = '';
  if (e.dataTransfer.files[0]) loadPdfFile(e.dataTransfer.files[0]);
});

// Pagination
document.getElementById('btn-prev-page').addEventListener('click', () => {
  if (!pdfDoc || pdfPageNum <= 1) return;
  pdfPageNum--;
  renderPdfPage(pdfPageNum);
});

document.getElementById('btn-next-page').addEventListener('click', () => {
  if (!pdfDoc || pdfPageNum >= pdfDoc.numPages) return;
  pdfPageNum++;
  renderPdfPage(pdfPageNum);
});

// Zoom
document.getElementById('btn-zoom-in').addEventListener('click', () => {
  if (pdfScale >= 4) return;
  pdfScale = Math.round((pdfScale + 0.25) * 100) / 100;
  zoomLevelEl.textContent = Math.round(pdfScale * 100) + '%';
  if (pdfDoc) renderPdfPage(pdfPageNum);
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
  if (pdfScale <= 0.5) return;
  pdfScale = Math.round((pdfScale - 0.25) * 100) / 100;
  zoomLevelEl.textContent = Math.round(pdfScale * 100) + '%';
  if (pdfDoc) renderPdfPage(pdfPageNum);
});

// ============================================================
// NAVIGATION WIRING
// ============================================================

// Home → Terms
document.getElementById('btn-start').addEventListener('click', () => {
  showPage('terms');
});

// Home terms link → Terms
document.getElementById('link-terms-home').addEventListener('click', (e) => {
  e.preventDefault();
  showPage('terms');
});

// Terms back → Home
document.getElementById('btn-back-terms').addEventListener('click', () => {
  showPage('home');
});

// Terms checkbox enables button
const chkAgree = document.getElementById('chk-agree');
const btnAgree = document.getElementById('btn-agree');

chkAgree.addEventListener('change', () => {
  btnAgree.disabled = !chkAgree.checked;
});

// Terms agree → Permissions
btnAgree.addEventListener('click', () => {
  if (!chkAgree.checked) return;
  // Reset permission state
  cameraGranted   = false;
  locationGranted = false;
  setPermBadge(permStatusCamera,   permCardCamera,   'pending');
  setPermBadge(permStatusLocation, permCardLocation, 'pending');
  permsError.classList.add('hidden');
  btnGrantPerms.disabled    = false;
  btnGrantPerms.textContent = 'Grant Permissions';
  showPage('permissions');
});

// Permissions back → Terms
document.getElementById('btn-back-perms').addEventListener('click', () => {
  stopCamera();
  showPage('terms');
});

// Session → PDF reader
document.getElementById('btn-open-pdf').addEventListener('click', () => {
  showPage('pdf');
});

// PDF back → Session
document.getElementById('btn-back-pdf').addEventListener('click', () => {
  showPage('session');
});

// Complete → New Session
document.getElementById('btn-new-session').addEventListener('click', () => {
  // Reset all state
  timerElapsed  = 0;
  timerStartTs  = null;
  timerRunning  = false;
  session.id         = '';
  session.startTime  = null;
  session.endTime    = null;
  session.duration   = 0;
  session.lat        = null;
  session.lng        = null;
  session.accuracy   = null;
  session.cameraOk   = false;
  session.photoBlob  = null;
  session.photoBase64 = null;

  timerDisplay.textContent = '00:00:00';
  timerDisplay.classList.remove('paused');
  sessionStatusText.textContent = 'Session Active';
  sessionStatusText.classList.remove('paused');
  iconPause.classList.remove('hidden');
  iconPlay.classList.add('hidden');
  pauseResumeLabel.textContent = 'Pause';

  chkAgree.checked = false;
  btnAgree.disabled = true;

  document.getElementById('complete-sending').classList.remove('hidden');
  document.getElementById('complete-sent').classList.add('hidden');
  document.getElementById('complete-error').classList.add('hidden');

  showPage('home');
});

// ============================================================
// PREVENT ACCIDENTAL BACK / CLOSE DURING SESSION
// ============================================================

window.addEventListener('beforeunload', (e) => {
  if (currentPage === 'session' && timerRunning) {
    e.preventDefault();
    e.returnValue = 'Your reading session is active. Are you sure you want to leave?';
    return e.returnValue;
  }
});

// ============================================================
// INIT
// ============================================================

showPage('home');
