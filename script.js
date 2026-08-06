/* ReadTrack V3 — Unified script.js */
'use strict';

// ── PDF.js ────────────────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Utilities ─────────────────────────────────────────────────
function generateSessionId() {
  return 'RS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,7).toUpperCase();
}
function formatDuration(ms) {
  const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return [h,m,sec].map(v=>String(v).padStart(2,'0')).join(':');
}
function formatDateTime(d) {
  return d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function formatDateShort(d) { return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
function getBrowser() {
  const u=navigator.userAgent;
  if(/Edg\//.test(u)) return 'Edge'; if(/OPR\/|Opera/.test(u)) return 'Opera';
  if(/Chrome\//.test(u)) return 'Chrome'; if(/Firefox\//.test(u)) return 'Firefox';
  if(/Safari\//.test(u)) return 'Safari'; return 'Unknown';
}
function getOS() {
  const u=navigator.userAgent;
  if(/Android/.test(u)) return 'Android'; if(/iPhone|iPad|iPod/.test(u)) return 'iOS';
  if(/Windows NT 10/.test(u)) return 'Windows 10/11'; if(/Windows/.test(u)) return 'Windows';
  if(/Mac OS X/.test(u)) return 'macOS'; if(/Linux/.test(u)) return 'Linux'; return 'Unknown';
}
function getDevice() {
  const u=navigator.userAgent;
  if(/Tablet|iPad/.test(u)) return 'Tablet';
  if(/Mobile|Android|iPhone|iPod/.test(u)) return 'Mobile'; return 'Desktop';
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function loadData(key,fb){ try{const v=localStorage.getItem(key);return v?JSON.parse(v):fb;}catch{return fb;} }
function saveData(key,val){ try{localStorage.setItem(key,JSON.stringify(val));}catch{} }
function escHtml(str){ return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }
function timeAgo(iso){
  const diff=Date.now()-new Date(iso).getTime();
  const m=Math.floor(diff/60000),h=Math.floor(diff/3600000),d=Math.floor(diff/86400000);
  if(diff<60000) return 'just now'; if(diff<3600000) return m+'m ago';
  if(diff<86400000) return h+'h ago'; return d+'d ago';
}
function avatarEl(name,url,color,size=38){
  const letter=(name||'U').charAt(0).toUpperCase();
  if(url) return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0"><img src="${url}" style="width:100%;height:100%;object-fit:cover" /></div>`;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color||'#6366f1'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.floor(size*.4)}px;font-weight:800;flex-shrink:0">${letter}</div>`;
}

// ── Supabase ──────────────────────────────────────────────────
let SUPA_URL='', SUPA_KEY='', AUTH_TOKEN='', USER_ID='', USER_PROFILE=null;

async function loadConfig(){
  try{
    const res=await fetch('/.netlify/functions/config');
    const cfg=await res.json();
    SUPA_URL=cfg.supabaseUrl; SUPA_KEY=cfg.supabaseKey;
  }catch(e){console.error('Config error:',e);}
}
async function sbGet(table,filter=''){
  const res=await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`,{
    headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN}
  });
  return res.json();
}
async function sbPost(table,body){
  const res=await fetch(`${SUPA_URL}/rest/v1/${table}`,{
    method:'POST',
    headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN,'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify(body)
  });
  return res.json();
}
async function sbDelete(table,filter){
  await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`,{
    method:'DELETE',headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN}
  });
}
async function sbUpdate(table,filter,body){
  const res=await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`,{
    method:'PATCH',
    headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN,'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify(body)
  });
  return res.json();
}
async function sbAuth(endpoint,body){
  const res=await fetch(`${SUPA_URL}/auth/v1/${endpoint}`,{
    method:'POST',headers:{'apikey':SUPA_KEY,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  return{ok:res.ok,data:await res.json()};
}
async function uploadFile(bucket,path,file){
  const res=await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`,{
    method:'POST',headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN,'Content-Type':file.type},body:file
  });
  const data=await res.json();
  if(data.Key) return `${SUPA_URL}/storage/v1/object/public/${data.Key}`;
  return null;
}
function saveAuthSession(data){
  localStorage.setItem('rt-auth',JSON.stringify({
    token:data.access_token,refresh:data.refresh_token,
    userId:data.user?.id,email:data.user?.email,
    expiresAt:Date.now()+(data.expires_in||3600)*1000
  }));
}
function getAuthSession(){ try{return JSON.parse(localStorage.getItem('rt-auth')||'null');}catch{return null;} }
function clearAuth(){ localStorage.removeItem('rt-auth');localStorage.removeItem('rt-profile'); }

// ── Page Router ───────────────────────────────────────────────
const PAGE_IDS={
  landing:'page-landing',auth:'page-auth',terms:'page-terms',
  permissions:'page-permissions',school:'page-school',goal:'page-goal',
  session:'page-session',pdf:'page-pdf',complete:'page-complete',
  certificate:'page-certificate',qr:'page-qr',
  community:'page-community',profile:'page-profile',
  history:'page-history',achievements:'page-achievements',
  settings:'page-settings',teacher:'page-teacher',
  errorCamera:'page-errorCamera',errorLocation:'page-errorLocation',errorOffline:'page-errorOffline'
};
const pageEls={};
Object.entries(PAGE_IDS).forEach(([k,v])=>{pageEls[k]=document.getElementById(v);});
let currentPage='landing';

function showPage(name){
  Object.values(pageEls).forEach(p=>{if(p)p.classList.remove('active');});
  if(pageEls[name]){
    pageEls[name].classList.add('active');
    currentPage=name;
    window.scrollTo(0,0);
  }
  updateBottomNav(name);
  updateTopNav();
}

// ── Bottom Nav ────────────────────────────────────────────────
function updateBottomNav(name){
  document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.page===name);
  });
}
document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const pg=btn.dataset.page;
    if(pg==='community'){
      if(!AUTH_TOKEN){showPage('auth');return;}
      loadCommunityFeed();
    }
    if(pg==='achievements') renderAchievements();
    if(pg==='teacher') initTeacherPage();
    showPage(pg);
  });
});
document.getElementById('nav-read-btn')?.addEventListener('click',()=>showPage('terms'));
document.getElementById('nav-profile-btn')?.addEventListener('click',()=>{
  if(!AUTH_TOKEN){showPage('auth');return;}
  loadProfileTab();
  showPage('profile');
});

// ── Top Nav ───────────────────────────────────────────────────
function updateTopNav(){
  const nav=document.getElementById('top-nav');
  const badge=document.getElementById('top-user-badge');
  const signoutBtn=document.getElementById('btn-top-signout');
  const hideOnPages=['landing','auth','terms','permissions','school','goal','session','pdf','complete','certificate','qr','errorCamera','errorLocation','errorOffline'];
  if(hideOnPages.includes(currentPage)){nav?.classList.add('hidden');return;}
  if(USER_PROFILE){
    nav?.classList.remove('hidden');
    if(badge) badge.textContent=USER_PROFILE.full_name||'User';
    signoutBtn?.classList.remove('hidden');
  }
}
document.getElementById('btn-top-signout')?.addEventListener('click',()=>{
  clearAuth(); AUTH_TOKEN=''; USER_ID=''; USER_PROFILE=null;
  showPage('landing');
});

// ── Settings ──────────────────────────────────────────────────
function applyTheme(theme){
  localStorage.setItem('rt-theme',theme);
  if(theme==='auto') document.body.removeAttribute('data-theme');
  else document.body.setAttribute('data-theme',theme);
  const sel=document.getElementById('select-theme');
  if(sel) sel.value=theme;
}
applyTheme(localStorage.getItem('rt-theme')||'auto');
function applyContrast(enabled){
  localStorage.setItem('rt-contrast',enabled?'1':'0');
  if(enabled) document.body.setAttribute('data-contrast','high');
  else document.body.removeAttribute('data-contrast');
  const t=document.getElementById('toggle-contrast');
  if(t) t.checked=enabled;
}
applyContrast(localStorage.getItem('rt-contrast')==='1');
document.getElementById('select-theme')?.addEventListener('change',e=>applyTheme(e.target.value));
document.getElementById('toggle-contrast')?.addEventListener('change',function(){applyContrast(this.checked);});
document.getElementById('select-language')?.addEventListener('change',e=>localStorage.setItem('rt-lang',e.target.value));
document.getElementById('btn-reset-data')?.addEventListener('click',()=>{
  if(!confirm('Reset all data?')) return;
  ['rt-history','rt-streaks','rt-achievements','rt-challenges','rt-prefs','rt-school'].forEach(k=>localStorage.removeItem(k));
  alert('All data reset.'); showPage('landing');
});
const prefs=loadData('rt-prefs',{cameraReq:true,locationReq:true});
const tCam=document.getElementById('toggle-camera-req');
const tLoc=document.getElementById('toggle-location-req');
if(tCam){tCam.checked=prefs.cameraReq!==false;tCam.addEventListener('change',function(){prefs.cameraReq=this.checked;saveData('rt-prefs',prefs);});}
if(tLoc){tLoc.checked=prefs.locationReq!==false;tLoc.addEventListener('change',function(){prefs.locationReq=this.checked;saveData('rt-prefs',prefs);});}

// ── Navigation Wiring ─────────────────────────────────────────
document.getElementById('btn-hero-start')?.addEventListener('click',()=>showPage('terms'));
document.getElementById('btn-hero-community')?.addEventListener('click',()=>{
  if(!AUTH_TOKEN){showPage('auth');return;}
  loadCommunityFeed(); showPage('community');
});
document.getElementById('btn-footer-community')?.addEventListener('click',()=>{
  if(!AUTH_TOKEN){showPage('auth');return;}
  loadCommunityFeed(); showPage('community');
});
document.getElementById('btn-footer-signin')?.addEventListener('click',()=>showPage('auth'));
document.getElementById('link-footer-terms')?.addEventListener('click',e=>{e.preventDefault();showPage('terms');});
document.getElementById('link-footer-settings')?.addEventListener('click',e=>{e.preventDefault();showPage('settings');});
document.getElementById('btn-back-terms')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-back-perms')?.addEventListener('click',()=>{stopCamera();showPage('terms');});
document.getElementById('btn-back-school')?.addEventListener('click',()=>showPage('permissions'));
document.getElementById('btn-back-goal')?.addEventListener('click',()=>showPage('school'));
document.getElementById('btn-open-pdf')?.addEventListener('click',()=>showPage('pdf'));
document.getElementById('btn-session-settings')?.addEventListener('click',()=>showPage('settings'));
document.getElementById('btn-back-pdf')?.addEventListener('click',()=>showPage('session'));
document.getElementById('btn-back-settings')?.addEventListener('click',()=>showPage(currentPage==='settings'?'landing':currentPage));
document.getElementById('btn-back-history')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-back-achievements')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-back-profile')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-back-certificate')?.addEventListener('click',()=>showPage('complete'));
document.getElementById('btn-back-qr')?.addEventListener('click',()=>showPage('complete'));
document.getElementById('btn-back-teacher')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-retry-camera')?.addEventListener('click',()=>showPage('permissions'));
document.getElementById('btn-error-camera-home')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-retry-location')?.addEventListener('click',()=>showPage('permissions'));
document.getElementById('btn-error-location-home')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-retry-offline')?.addEventListener('click',()=>{if(navigator.onLine)showPage('landing');else alert('Still offline.');});
document.getElementById('btn-error-offline-home')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-new-session')?.addEventListener('click',()=>{resetAll();showPage('terms');});
document.getElementById('btn-back-home')?.addEventListener('click',()=>{resetAll();showPage('landing');});
document.getElementById('btn-signout-profile')?.addEventListener('click',()=>{clearAuth();AUTH_TOKEN='';USER_ID='';USER_PROFILE=null;showPage('landing');});
// FAQ
document.querySelectorAll('.faq-question').forEach(q=>{
  q.addEventListener('click',()=>{
    const item=q.parentElement;const open=item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i=>i.classList.remove('open'));
    if(!open) item.classList.add('open');
  });
});

// ── Auth ──────────────────────────────────────────────────────
let selectedRole='student';

// Auth card switching
function showAuthCard(id){
  document.querySelectorAll('.auth-card').forEach(c=>c.classList.add('hidden'));
  document.getElementById(id)?.classList.remove('hidden');
}
document.querySelectorAll('.role-card').forEach(card=>{
  card.addEventListener('click',()=>{
    selectedRole=card.dataset.role;
    if(document.getElementById('login-title')) document.getElementById('login-title').textContent=selectedRole==='teacher'?'Teacher Login':'Student Login';
    if(document.getElementById('signup-title')) document.getElementById('signup-title').textContent=selectedRole==='teacher'?'Create Teacher Account':'Create Student Account';
    const cf=document.getElementById('signup-class-field');
    if(cf) cf.style.display=selectedRole==='teacher'?'none':'';
    showAuthCard('auth-card-login');
  });
});
document.getElementById('btn-auth-back-home')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-auth-skip')?.addEventListener('click',()=>showPage('landing'));
document.getElementById('btn-login-back')?.addEventListener('click',()=>showAuthCard('auth-card-role'));
document.getElementById('btn-signup-back')?.addEventListener('click',()=>showAuthCard('auth-card-login'));
document.getElementById('btn-go-signup')?.addEventListener('click',()=>showAuthCard('auth-card-signup'));
document.getElementById('btn-go-login')?.addEventListener('click',()=>showAuthCard('auth-card-login'));
document.getElementById('btn-forgot-pw')?.addEventListener('click',()=>showAuthCard('auth-card-forgot'));
document.getElementById('btn-forgot-back')?.addEventListener('click',()=>showAuthCard('auth-card-login'));
document.getElementById('btn-back-to-login')?.addEventListener('click',()=>showAuthCard('auth-card-login'));

document.getElementById('btn-login')?.addEventListener('click',async()=>{
  const email=document.getElementById('login-email')?.value.trim();
  const password=document.getElementById('login-password')?.value;
  const errEl=document.getElementById('login-error');
  const btn=document.getElementById('btn-login');
  if(!email||!password){if(errEl){errEl.textContent='Please enter email and password.';errEl.classList.remove('hidden');}return;}
  btn.disabled=true; btn.textContent='Signing in…';
  if(errEl) errEl.classList.add('hidden');
  const{ok,data}=await sbAuth('token?grant_type=password',{email,password});
  if(!ok){
    if(errEl){errEl.textContent=data.error_description||data.message||'Invalid email or password.';errEl.classList.remove('hidden');}
    btn.disabled=false; btn.textContent='Sign In'; return;
  }
  saveAuthSession(data);
  AUTH_TOKEN=data.access_token; USER_ID=data.user.id;
  const profiles=await sbGet('profiles',`?id=eq.${data.user.id}&select=*`);
  const profile=Array.isArray(profiles)?profiles[0]:null;
  if(profile){USER_PROFILE=profile;localStorage.setItem('rt-profile',JSON.stringify(profile));}
  btn.disabled=false; btn.textContent='Sign In';
  onLoginSuccess();
});

document.getElementById('btn-signup')?.addEventListener('click',async()=>{
  const name=document.getElementById('signup-name')?.value.trim();
  const email=document.getElementById('signup-email')?.value.trim();
  const classCode=document.getElementById('signup-class-code')?.value.trim().toUpperCase();
  const password=document.getElementById('signup-password')?.value;
  const confirm=document.getElementById('signup-confirm')?.value;
  const errEl=document.getElementById('signup-error');
  const btn=document.getElementById('btn-signup');
  if(errEl) errEl.classList.add('hidden');
  document.getElementById('signup-success')?.classList.add('hidden');
  if(!name||!email||!password){if(errEl){errEl.textContent='Please fill in all required fields.';errEl.classList.remove('hidden');}return;}
  if(selectedRole==='student'&&!classCode){if(errEl){errEl.textContent='Please enter your class code.';errEl.classList.remove('hidden');}return;}
  if(password.length<6){if(errEl){errEl.textContent='Password must be at least 6 characters.';errEl.classList.remove('hidden');}return;}
  if(password!==confirm){if(errEl){errEl.textContent='Passwords do not match.';errEl.classList.remove('hidden');}return;}
  btn.disabled=true; btn.textContent='Creating account…';
  const{ok,data}=await sbAuth('signup',{email,password});
  if(!ok){if(errEl){errEl.textContent=data.error_description||data.message||'Sign up failed.';errEl.classList.remove('hidden');}btn.disabled=false;btn.textContent='Create Account';return;}
  if(data.access_token){
    await fetch(`${SUPA_URL}/rest/v1/profiles`,{
      method:'POST',
      headers:{'apikey':SUPA_KEY,'Authorization':'Bearer '+data.access_token,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({id:data.user.id,full_name:name,role:selectedRole,class_code:selectedRole==='student'?classCode:null})
    });
  }
  document.getElementById('signup-success')?.classList.remove('hidden');
  btn.disabled=false; btn.textContent='Create Account';
});

document.getElementById('btn-reset-pw')?.addEventListener('click',async()=>{
  const email=document.getElementById('forgot-email')?.value.trim();
  if(!email){return;}
  const{ok}=await sbAuth('recover',{email});
  if(ok) document.getElementById('forgot-success')?.classList.remove('hidden');
  else document.getElementById('forgot-error')?.classList.remove('hidden');
});

function onLoginSuccess(){
  updateTopNav();
  // Show teacher dashboard button if teacher
  const teacherBtn=document.getElementById('nav-teacher-btn');
  if(teacherBtn) teacherBtn.classList.toggle('hidden', USER_PROFILE?.role!=='teacher');
  // Pre-fill school data
  if(USER_PROFILE?.class_code){
    schoolData.classCode=USER_PROFILE.class_code;
    schoolData.studentName=USER_PROFILE.full_name||'';
    const sc=document.getElementById('school-class-code');
    const sn=document.getElementById('school-student-name');
    if(sc) sc.value=schoolData.classCode;
    if(sn) sn.value=schoolData.studentName;
    saveData('rt-school',schoolData);
  }
  showPage('landing');
}

// ── Session State ─────────────────────────────────────────────
const session={
  id:'',startTime:null,endTime:null,duration:0,
  lat:null,lng:null,accuracy:null,gpsTs:null,
  cameraOk:false,photoBlob:null,
  browser:getBrowser(),os:getOS(),device:getDevice(),
  screenRes:screen.width+'x'+screen.height,
  pdfName:'',goalMs:0
};
const schoolData=loadData('rt-school',{classCode:'',studentName:''});

// ── Terms ─────────────────────────────────────────────────────
document.getElementById('chk-agree')?.addEventListener('change',function(){
  const btn=document.getElementById('btn-agree');
  if(btn) btn.disabled=!this.checked;
});
document.getElementById('btn-agree')?.addEventListener('click',()=>{
  const chk=document.getElementById('chk-agree');
  if(!chk||!chk.checked) return;
  showPage('permissions');
});

// ── Camera ────────────────────────────────────────────────────
let cameraStream=null;
async function requestCamera(){
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    const v=document.getElementById('camera-video');
    if(v) v.srcObject=cameraStream;
    return true;
  }catch{return false;}
}
function capturePhoto(){
  return new Promise(resolve=>{
    if(!cameraStream){resolve(null);return;}
    const v=document.getElementById('camera-video');
    const c=document.getElementById('camera-canvas');
    let attempts=0;
    function doCapture(){
      attempts++;
      const t=cameraStream.getVideoTracks()[0].getSettings();
      c.width=t.width||v.videoWidth||640; c.height=t.height||v.videoHeight||480;
      const ctx=c.getContext('2d'); ctx.drawImage(v,0,0,c.width,c.height);
      const pixel=ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data;
      if((pixel[0]+pixel[1]+pixel[2])<10&&attempts<5){setTimeout(doCapture,800);return;}
      c.toBlob(blob=>{if(!blob){resolve(null);return;}session.photoBlob=blob;resolve(blob);},'image/jpeg',0.85);
    }
    if(v.readyState>=2&&v.videoWidth>0) setTimeout(doCapture,1500);
    else v.addEventListener('canplay',()=>setTimeout(doCapture,1500),{once:true});
  });
}
function stopCamera(){if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}}

// ── Geolocation ───────────────────────────────────────────────
async function requestLocation(){
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
let cameraGranted=false,locationGranted=false;
function setPermBadge(elId,cardId,state){
  const map={pending:'<span class="badge badge-pending">Pending</span>',granted:'<span class="badge badge-granted">Granted ✓</span>',denied:'<span class="badge badge-denied">Denied ✗</span>'};
  const el=document.getElementById(elId);const card=document.getElementById(cardId);
  if(el) el.innerHTML=map[state]||map.pending;
  if(card) card.className='perm-card'+(state==='granted'?' granted':state==='denied'?' denied':'');
}
document.getElementById('btn-grant-perms')?.addEventListener('click',async()=>{
  const btn=document.getElementById('btn-grant-perms');
  const err=document.getElementById('perms-error');
  btn.disabled=true;btn.textContent='Requesting…';
  if(err) err.classList.add('hidden');
  setPermBadge('perm-status-camera','perm-card-camera','pending');
  cameraGranted=await requestCamera();
  setPermBadge('perm-status-camera','perm-card-camera',cameraGranted?'granted':'denied');
  setPermBadge('perm-status-location','perm-card-location','pending');
  locationGranted=await requestLocation();
  setPermBadge('perm-status-location','perm-card-location',locationGranted?'granted':'denied');
  btn.disabled=false;btn.textContent='Grant Permissions';
  if(!cameraGranted){showPage('errorCamera');return;}
  if(!locationGranted){showPage('errorLocation');return;}
  showPage('school');
});

// ── School Mode ───────────────────────────────────────────────
const savedSchool=loadData('rt-school',{});
if(savedSchool.classCode){const sc=document.getElementById('school-class-code');if(sc)sc.value=savedSchool.classCode;}
if(savedSchool.studentName){const sn=document.getElementById('school-student-name');if(sn)sn.value=savedSchool.studentName;}
document.getElementById('btn-save-school')?.addEventListener('click',()=>{
  const code=document.getElementById('school-class-code')?.value.trim().toUpperCase();
  const name=document.getElementById('school-student-name')?.value.trim();
  const err=document.getElementById('school-error');
  if(!code||!name){if(err)err.classList.remove('hidden');return;}
  if(err)err.classList.add('hidden');
  schoolData.classCode=code;schoolData.studentName=name;
  saveData('rt-school',schoolData);showPage('goal');
});
document.getElementById('btn-skip-school')?.addEventListener('click',()=>{
  schoolData.classCode='';schoolData.studentName='';
  saveData('rt-school',schoolData);showPage('goal');
});

// ── Timer ─────────────────────────────────────────────────────
let timerInterval=null,timerStartTs=null,timerElapsed=0,timerRunning=false;
const CIRCUMFERENCE=565.5;
function startTimer(){timerStartTs=Date.now();timerRunning=true;timerInterval=setInterval(tickTimer,500);updateTimerUI();}
function pauseTimer(){if(!timerRunning)return;timerElapsed+=Date.now()-timerStartTs;clearInterval(timerInterval);timerRunning=false;updateTimerUI();}
function resumeTimer(){if(timerRunning)return;timerStartTs=Date.now();timerRunning=true;timerInterval=setInterval(tickTimer,500);updateTimerUI();}
function stopTimer(){if(timerRunning)timerElapsed+=Date.now()-timerStartTs;clearInterval(timerInterval);timerRunning=false;session.duration=timerElapsed;updateTimerUI();}
function tickTimer(){
  const cur=timerElapsed+(Date.now()-timerStartTs);
  const el=document.getElementById('timer-display');
  if(el)el.textContent=formatDuration(cur);
  const circle=document.getElementById('timer-progress-circle');
  if(circle)circle.style.strokeDashoffset=CIRCUMFERENCE*(1-Math.min(cur/3600000,1));
  if(session.goalMs>0){
    const pct=Math.min(cur/session.goalMs*100,100);
    const fill=document.getElementById('goal-progress-fill');
    if(fill)fill.style.width=pct+'%';
    if(pct>=100){const lbl=document.getElementById('goal-label-text');if(lbl)lbl.textContent='🎉 Goal reached!';}
  }
}
function updateTimerUI(){
  const disp=document.getElementById('timer-display');
  const status=document.getElementById('session-status-text');
  const pause=document.getElementById('icon-pause');const play=document.getElementById('icon-play');
  const label=document.getElementById('pause-resume-label');
  if(timerRunning){
    disp?.classList.remove('paused');
    if(status){status.classList.remove('paused');status.textContent='Active';}
    pause?.classList.remove('hidden');play?.classList.add('hidden');
    if(label)label.textContent='Pause';
  }else{
    disp?.classList.add('paused');
    if(status){status.classList.add('paused');status.textContent='Paused';}
    pause?.classList.add('hidden');play?.classList.remove('hidden');
    if(label)label.textContent='Resume';
  }
}
document.getElementById('btn-pause-resume')?.addEventListener('click',()=>{if(timerRunning)pauseTimer();else resumeTimer();});

// ── Goal Selector ─────────────────────────────────────────────
document.querySelectorAll('.goal-card').forEach(card=>{
  card.addEventListener('click',()=>{
    document.querySelectorAll('.goal-card').forEach(c=>c.classList.remove('selected'));
    card.classList.add('selected');
    const mins=card.dataset.minutes;
    if(mins==='custom'){document.getElementById('custom-duration-wrap')?.classList.remove('hidden');}
    else{document.getElementById('custom-duration-wrap')?.classList.add('hidden');session.goalMs=parseInt(mins)*60000;startSessionWithGoal();}
  });
});
document.getElementById('btn-confirm-custom')?.addEventListener('click',()=>{
  const val=parseInt(document.getElementById('custom-minutes')?.value||'0');
  if(!val||val<1){alert('Please enter a valid duration.');return;}
  session.goalMs=val*60000;startSessionWithGoal();
});

async function startSessionWithGoal(){
  session.id=generateSessionId();session.startTime=new Date();
  const photo=await capturePhoto();session.cameraOk=!!photo;
  const idEl=document.getElementById('session-id-label');
  const camEl=document.getElementById('status-camera');const locEl=document.getElementById('status-location');
  if(idEl)idEl.textContent=session.id;
  if(camEl){camEl.textContent=session.cameraOk?'Verified ✓':'No Photo';camEl.className='status-value '+(session.cameraOk?'status-ok':'status-warning');}
  if(locEl){locEl.textContent=session.lat?'Captured ✓':'Unavailable';locEl.className='status-value '+(session.lat?'status-ok':'status-warning');}
  const goalSection=document.getElementById('goal-progress-section');
  const goalLbl=document.getElementById('goal-label-text');
  const goalFill=document.getElementById('goal-progress-fill');
  if(session.goalMs>0){
    if(goalSection)goalSection.classList.remove('hidden');
    if(goalLbl)goalLbl.textContent='Goal: '+Math.round(session.goalMs/60000)+' min';
    if(goalFill)goalFill.style.width='0%';
  }else{if(goalSection)goalSection.classList.add('hidden');}
  timerElapsed=0;timerStartTs=null;
  const circle=document.getElementById('timer-progress-circle');
  const disp=document.getElementById('timer-display');
  if(circle)circle.style.strokeDashoffset=CIRCUMFERENCE;
  if(disp)disp.textContent='00:00:00';
  showPage('session');startTimer();
}

// ── End Session ───────────────────────────────────────────────
document.getElementById('btn-end-session')?.addEventListener('click',()=>{
  if(!confirm('End the session?'))return;
  stopTimer();session.endTime=new Date();stopCamera();
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('c-duration',formatDuration(session.duration));
  set('c-start',formatDateTime(session.startTime));
  set('c-end',formatDateTime(session.endTime));
  set('c-location',session.lat?`${session.lat.toFixed(5)}, ${session.lng.toFixed(5)}`:'Unavailable');
  set('c-camera',session.cameraOk?'Verified ✓':'Not captured');
  saveSessionToHistory();updateStreak();checkAchievements();updateChallengeProgress();
  const qrWrap=document.getElementById('qr-preview-wrap');
  const qrCanvas=document.getElementById('qr-preview-canvas');
  if(qrWrap&&qrCanvas){qrWrap.classList.remove('hidden');drawQRCode(qrCanvas,buildQRData(session),120);}
  showPage('complete');sendSessionData();
});

// ── Send Data ─────────────────────────────────────────────────
async function sendSessionData(){
  const show=id=>document.getElementById(id)?.classList.remove('hidden');
  const hide=id=>document.getElementById(id)?.classList.add('hidden');
  show('complete-sending');hide('complete-sent');hide('complete-error');
  const fd=new FormData();
  fd.append('sessionId',session.id);fd.append('startTime',session.startTime.toISOString());
  fd.append('endTime',session.endTime.toISOString());fd.append('duration',formatDuration(session.duration));
  fd.append('durationMs',String(session.duration));fd.append('latitude',session.lat??'');
  fd.append('longitude',session.lng??'');fd.append('accuracy',session.accuracy??'');
  fd.append('browser',session.browser);fd.append('os',session.os);fd.append('device',session.device);
  fd.append('screenRes',session.screenRes);fd.append('cameraOk',String(session.cameraOk));
  fd.append('pdfName',session.pdfName||'');
  fd.append('studentName',schoolData.studentName||USER_PROFILE?.full_name||'');
  fd.append('classCode',schoolData.classCode||USER_PROFILE?.class_code||'');
  if(session.photoBlob)fd.append('photo',session.photoBlob,`verify-${session.id}.jpg`);
  try{
    if(!navigator.onLine)throw new Error('Offline');
    const res=await fetch('/.netlify/functions/session',{method:'POST',body:fd});
    if(!res.ok)throw new Error('HTTP '+res.status);
    hide('complete-sending');show('complete-sent');
  }catch(e){
    hide('complete-sending');show('complete-error');
    try{localStorage.setItem('rt-fail-'+session.id,JSON.stringify({id:session.id}));}catch{}
  }
}

// ── PDF Reader ────────────────────────────────────────────────
let pdfDoc=null,pdfPage=1,pdfScale=1.5,pdfRendering=false,pdfPending=null;
function renderPage(num){
  if(!pdfDoc)return;
  if(pdfRendering){pdfPending=num;return;}
  pdfRendering=true;
  const cur=document.getElementById('pdf-current-page');if(cur)cur.textContent=num;
  const fill=document.getElementById('pdf-progress-fill');const bar=document.getElementById('pdf-progress-bar');
  if(fill)fill.style.width=Math.round(num/pdfDoc.numPages*100)+'%';
  if(bar)bar.classList.remove('hidden');
  pdfDoc.getPage(num).then(pg=>{
    const vp=pg.getViewport({scale:pdfScale});
    const canvas=document.getElementById('pdf-canvas');
    canvas.height=vp.height;canvas.width=vp.width;
    pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise.then(()=>{
      pdfRendering=false;
      if(pdfPending!==null){renderPage(pdfPending);pdfPending=null;}
    });
  });
}
function loadPDF(file){
  if(!file||file.type!=='application/pdf')return;
  session.pdfName=file.name;
  const nameEl=document.getElementById('pdf-filename');
  if(nameEl)nameEl.textContent=file.name.length>30?file.name.slice(0,27)+'…':file.name;
  const reader=new FileReader();
  reader.onload=e=>{
    pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise.then(doc=>{
      pdfDoc=doc;pdfPage=1;
      const tot=document.getElementById('pdf-total-pages');if(tot)tot.textContent=doc.numPages;
      document.getElementById('pdf-drop-zone')?.classList.add('hidden');
      document.getElementById('pdf-viewer-wrap')?.classList.remove('hidden');
      renderPage(1);
    });
  };
  reader.readAsArrayBuffer(file);
}
document.getElementById('btn-select-pdf')?.addEventListener('click',()=>document.getElementById('pdf-file-input')?.click());
document.getElementById('pdf-file-input')?.addEventListener('change',e=>{if(e.target.files[0])loadPDF(e.target.files[0]);});
document.getElementById('btn-prev-page')?.addEventListener('click',()=>{if(pdfDoc&&pdfPage>1)renderPage(--pdfPage);});
document.getElementById('btn-next-page')?.addEventListener('click',()=>{if(pdfDoc&&pdfPage<pdfDoc.numPages)renderPage(++pdfPage);});
document.getElementById('btn-zoom-in')?.addEventListener('click',()=>{if(pdfScale<4){pdfScale=Math.round((pdfScale+0.25)*100)/100;const z=document.getElementById('zoom-level');if(z)z.textContent=Math.round(pdfScale*100)+'%';if(pdfDoc)renderPage(pdfPage);}});
document.getElementById('btn-zoom-out')?.addEventListener('click',()=>{if(pdfScale>0.5){pdfScale=Math.round((pdfScale-0.25)*100)/100;const z=document.getElementById('zoom-level');if(z)z.textContent=Math.round(pdfScale*100)+'%';if(pdfDoc)renderPage(pdfPage);}});
document.getElementById('btn-pdf-fullscreen')?.addEventListener('click',()=>{const el=document.getElementById('pdf-viewer-wrap');if(el?.requestFullscreen)el.requestFullscreen();else if(el?.webkitRequestFullscreen)el.webkitRequestFullscreen();});

// ── History ───────────────────────────────────────────────────
function saveSessionToHistory(){
  const h=loadData('rt-history',[]);
  h.unshift({id:session.id,date:session.startTime.toISOString(),duration:session.duration,cameraOk:session.cameraOk,locationOk:!!session.lat,device:session.device,pdfName:session.pdfName||'',goalMs:session.goalMs||0});
  saveData('rt-history',h.slice(0,100));
}
function renderHistory(){
  const h=loadData('rt-history',[]);
  const list=document.getElementById('history-list');
  const empty=document.getElementById('history-empty');
  if(!list)return;
  list.innerHTML='';
  if(!h.length){if(empty)empty.classList.remove('hidden');return;}
  if(empty)empty.classList.add('hidden');
  h.forEach(s=>{
    const v=s.cameraOk&&s.locationOk;
    const div=document.createElement('div');div.className='history-item';
    div.innerHTML=`<div class="history-icon">${v?'✅':'⚠️'}</div><div class="history-info"><div class="history-date">${formatDateShort(s.date)}</div><div class="history-duration">${formatDuration(s.duration)}</div><div class="history-meta">${s.pdfName||s.device||'Session'}</div></div><div class="history-status ${v?'verified':'partial'}">${v?'Verified':'Partial'}</div>`;
    list.appendChild(div);
  });
}
document.getElementById('btn-clear-history')?.addEventListener('click',()=>{if(!confirm('Clear all history?'))return;saveData('rt-history',[]);renderHistory();});

// ── Streaks & Achievements ────────────────────────────────────
function updateStreak(){
  const d=loadData('rt-streaks',{current:0,longest:0,lastDate:'',totalMs:0,totalSessions:0});
  const today=todayStr();const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  if(d.lastDate===today){}
  else if(d.lastDate===yesterday)d.current+=1;
  else d.current=1;
  d.lastDate=today;d.longest=Math.max(d.longest,d.current);
  d.totalMs=(d.totalMs||0)+session.duration;d.totalSessions=(d.totalSessions||0)+1;
  saveData('rt-streaks',d);
}
const ACHIEVEMENTS=[
  {id:'first',emoji:'🎯',name:'First Session',desc:'Complete your first session',check:d=>d.totalSessions>=1},
  {id:'s5',emoji:'📚',name:'5 Sessions',desc:'Complete 5 sessions',check:d=>d.totalSessions>=5},
  {id:'s10',emoji:'🏅',name:'10 Sessions',desc:'Complete 10 sessions',check:d=>d.totalSessions>=10},
  {id:'s25',emoji:'🥇',name:'25 Sessions',desc:'Complete 25 sessions',check:d=>d.totalSessions>=25},
  {id:'s50',emoji:'🏆',name:'50 Sessions',desc:'Complete 50 sessions',check:d=>d.totalSessions>=50},
  {id:'h1',emoji:'⏱️',name:'1 Hour Read',desc:'Read for 1 hour total',check:d=>d.totalMs>=3600000},
  {id:'h5',emoji:'🔥',name:'5 Hours Read',desc:'Read for 5 hours total',check:d=>d.totalMs>=18000000},
  {id:'h10',emoji:'⚡',name:'10 Hours Read',desc:'Read for 10 hours total',check:d=>d.totalMs>=36000000},
  {id:'streak3',emoji:'🗓️',name:'3-Day Streak',desc:'Read 3 days in a row',check:d=>d.current>=3},
  {id:'streak7',emoji:'🔆',name:'Week Warrior',desc:'Read 7 days in a row',check:d=>d.current>=7},
  {id:'streak30',emoji:'💎',name:'Month Master',desc:'Read 30 days in a row',check:d=>d.current>=30},
];
function checkAchievements(){
  const d=loadData('rt-streaks',{});const u=loadData('rt-achievements',[]);
  ACHIEVEMENTS.forEach(a=>{if(!u.includes(a.id)&&a.check(d))u.push(a.id);});
  saveData('rt-achievements',u);
}
function renderAchievements(){
  const d=loadData('rt-streaks',{});const u=loadData('rt-achievements',[]);
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('streak-count',d.current||0);set('streak-longest',d.longest||0);
  set('streak-total-sessions',d.totalSessions||0);
  set('streak-total-hours',Math.floor((d.totalMs||0)/3600000)+'h');
  const grid=document.getElementById('achievements-grid');
  if(!grid)return;
  grid.innerHTML=ACHIEVEMENTS.map(a=>`
    <div class="achievement-card ${u.includes(a.id)?'unlocked':'locked'}">
      <div class="achievement-emoji">${a.emoji}</div>
      <div class="achievement-name">${a.name}</div>
      <div class="achievement-desc">${a.desc}</div>
    </div>`).join('');
  renderChallenges();
}

// ── Challenges ────────────────────────────────────────────────
const CHALLENGES=[
  {id:'c30',emoji:'🔥',name:'30-Day Challenge',desc:'Read every day for 30 days',days:30,target:30},
  {id:'c7',emoji:'📅',name:'Week Challenge',desc:'Complete 7 sessions this week',days:7,target:7},
  {id:'cWE',emoji:'🌅',name:'Weekend Challenge',desc:'Read every weekend for 4 weeks',days:28,target:8},
  {id:'cAM',emoji:'🌄',name:'Morning Reader',desc:'Complete 10 morning sessions',days:30,target:10},
  {id:'cNO',emoji:'🌙',name:'Night Owl',desc:'Complete 10 evening sessions',days:30,target:10},
  {id:'cSP',emoji:'⚡',name:'Speed Reader',desc:'Complete 5 sessions of 45+ min',days:14,target:5},
];
function renderChallenges(){
  const list=document.getElementById('challenges-list');if(!list)return;
  const joined=loadData('rt-challenges',{});
  list.innerHTML=CHALLENGES.map(c=>{
    const isJoined=!!joined[c.id];
    const progress=isJoined?Math.min(joined[c.id].progress||0,c.target):0;
    const pct=Math.round(progress/c.target*100);
    return `<div class="challenge-card${isJoined?' joined':''}">
      <div class="challenge-emoji">${c.emoji}</div>
      <div class="challenge-body">
        <div class="challenge-name">${c.name}</div>
        <div class="challenge-desc">${c.desc}</div>
        ${isJoined?`<div class="challenge-progress"><div class="challenge-progress-fill" style="width:${pct}%"></div></div><div class="challenge-meta">${progress}/${c.target} · ${pct}%</div>`:`<div class="challenge-meta">${c.days}-day challenge</div>`}
      </div>
      <div class="challenge-action">${isJoined?`<span class="challenge-badge">Joined ✓</span>`:`<button class="btn btn-primary btn-sm" data-cid="${c.id}">Join</button>`}</div>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-cid]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const saved=loadData('rt-challenges',{});
      saved[btn.dataset.cid]={joinedAt:new Date().toISOString(),progress:0};
      saveData('rt-challenges',saved);renderChallenges();
    });
  });
}
function updateChallengeProgress(){
  const j=loadData('rt-challenges',{});
  Object.keys(j).forEach(cid=>{j[cid].progress=(j[cid].progress||0)+1;});
  saveData('rt-challenges',j);
}

// ── Certificate & QR ──────────────────────────────────────────
function drawQRCode(canvasEl,text,size){
  if(!canvasEl)return;
  const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{canvasEl.width=size;canvasEl.height=size;canvasEl.getContext('2d').drawImage(img,0,0,size,size);};
  img.src=`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=ffffff&color=1a1a2e`;
}
function buildQRData(s){
  return JSON.stringify({id:s.id,date:s.startTime?s.startTime.toISOString().slice(0,10):'',duration:formatDuration(s.duration),status:'VERIFIED'});
}
function drawCertificate(canvasEl,sessionData,streakData){
  if(!canvasEl)return;
  const W=800,H=560;canvasEl.width=W;canvasEl.height=H;
  const ctx=canvasEl.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#0f172a');bg.addColorStop(0.5,'#1e1b4b');bg.addColorStop(1,'#0f172a');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#6366f1';ctx.lineWidth=4;ctx.strokeRect(16,16,W-32,H-32);
  ctx.font='bold 28px sans-serif';ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.fillText('📚 Certificate of Reading',W/2,100);
  ctx.font='14px sans-serif';ctx.fillStyle='rgba(255,255,255,0.6)';ctx.fillText('This certifies the successful completion of a verified reading session',W/2,130);
  const details=[['Session ID',sessionData.id],['Duration',formatDuration(sessionData.duration)],['Date',sessionData.startTime?sessionData.startTime.toLocaleDateString():''],['Total Sessions',String(streakData.totalSessions||1)],['Total Hours',Math.floor((streakData.totalMs||0)/3600000)+'h']];
  ctx.textAlign='left';
  details.forEach(([label,val],i)=>{
    const y=180+i*45;
    ctx.font='13px sans-serif';ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fillText(label,W/2-200,y);
    ctx.font='bold 15px sans-serif';ctx.fillStyle='#ffffff';ctx.fillText(val,W/2+20,y);
  });
  ctx.textAlign='center';ctx.font='13px sans-serif';ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.fillText('ReadTrack — Generated on '+new Date().toLocaleDateString(),W/2,H-24);
}
document.getElementById('btn-view-certificate')?.addEventListener('click',()=>{
  const canvas=document.getElementById('cert-canvas');
  drawCertificate(canvas,session,loadData('rt-streaks',{}));showPage('certificate');
});
document.getElementById('btn-download-cert')?.addEventListener('click',()=>{
  const canvas=document.getElementById('cert-canvas');if(!canvas)return;
  const link=document.createElement('a');link.download=`ReadTrack-Certificate-${session.id||'session'}.png`;link.href=canvas.toDataURL('image/png');link.click();
});
document.getElementById('btn-view-qr')?.addEventListener('click',()=>{
  const qrCanvas=document.getElementById('qr-canvas');
  drawQRCode(qrCanvas,buildQRData(session),300);
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('qr-session-id',session.id||'—');set('qr-duration',formatDuration(session.duration));
  set('qr-date',session.startTime?session.startTime.toLocaleDateString():'—');
  showPage('qr');
});
document.getElementById('btn-download-qr')?.addEventListener('click',()=>{
  const canvas=document.getElementById('qr-canvas');if(!canvas)return;
  const link=document.createElement('a');link.download=`ReadTrack-QR-${session.id||'session'}.png`;link.href=canvas.toDataURL('image/png');link.click();
});

// ── Community ─────────────────────────────────────────────────
let postImageFile=null,chatImageFile=null,allProfiles=[],currentChatUserId=null,currentChatName='';

function loadCommunityFeed(){
  loadFeed();loadSidebarStats();
  const compAvatar=document.getElementById('composer-avatar');
  if(compAvatar&&USER_PROFILE){
    if(USER_PROFILE.avatar_url)compAvatar.innerHTML=`<img src="${USER_PROFILE.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>`;
    else compAvatar.textContent=(USER_PROFILE.full_name||'U').charAt(0).toUpperCase();
    if(USER_PROFILE.theme_color)compAvatar.style.background=USER_PROFILE.theme_color;
  }
}

// Community tab switching
document.querySelectorAll('.comm-tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const tab=btn.dataset.ctab;
    document.querySelectorAll('.comm-tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.comm-tab-content').forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ctab-'+tab)?.classList.add('active');
    if(tab==='messages')loadConversations();
    if(tab==='members')loadMembers();
  });
});

async function loadFeed(){
  const list=document.getElementById('feed-list');if(!list)return;
  list.innerHTML='<div class="feed-loading">Loading…</div>';
  const posts=await sbGet('posts','?order=created_at.desc&limit=50');
  if(!Array.isArray(posts)||!posts.length){list.innerHTML='<div class="feed-empty">No posts yet. Be the first to post!</div>';return;}
  list.innerHTML=posts.map(p=>renderPost(p)).join('');
  bindPostActions();
}

function renderPost(p){
  const isOwn=p.user_id===USER_ID;
  return `<div class="post-card" data-post-id="${p.id}">
    <div class="post-header">
      ${avatarEl(p.author_name,p.author_avatar,null,38)}
      <div><div class="post-author">${escHtml(p.author_name||'User')}</div><div class="post-time">${timeAgo(p.created_at)}</div></div>
      ${isOwn?`<button class="post-action-btn" style="margin-left:auto" data-delete-post="${p.id}">🗑️</button>`:''}
    </div>
    ${p.content?`<div class="post-content">${escHtml(p.content)}</div>`:''}
    ${p.image_url?`<div class="post-image"><img src="${p.image_url}" loading="lazy" /></div>`:''}
    <div class="post-actions">
      <button class="post-action-btn like-btn" data-post-id="${p.id}" data-likes="${p.likes||0}">❤️ <span class="like-count">${p.likes||0}</span></button>
      <button class="post-action-btn reply-toggle" data-post-id="${p.id}">💬 Reply</button>
    </div>
    <div class="post-replies" id="replies-${p.id}" style="display:none">
      <div class="reply-composer">
        <input type="text" class="reply-input" data-post-id="${p.id}" placeholder="Write a reply…" maxlength="300" />
        <button class="btn btn-primary btn-sm send-reply" data-post-id="${p.id}">Send</button>
      </div>
      <div class="replies-list" id="replies-list-${p.id}"></div>
    </div>
  </div>`;
}

function bindPostActions(){
  document.querySelectorAll('.like-btn').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const postId=btn.dataset.postId;btn.classList.toggle('liked');
      const liked=btn.classList.contains('liked');const countEl=btn.querySelector('.like-count');
      let count=parseInt(btn.dataset.likes||0);
      if(liked){count++;await sbPost('post_likes',{post_id:postId,user_id:USER_ID}).catch(()=>{});await sbUpdate('posts','?id=eq.'+postId,{likes:count});}
      else{count=Math.max(0,count-1);await sbDelete('post_likes',`?post_id=eq.${postId}&user_id=eq.${USER_ID}`);await sbUpdate('posts','?id=eq.'+postId,{likes:count});}
      btn.dataset.likes=count;if(countEl)countEl.textContent=count;
    });
  });
  document.querySelectorAll('.reply-toggle').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const sec=document.getElementById('replies-'+btn.dataset.postId);if(!sec)return;
      const isOpen=sec.style.display!=='none';
      sec.style.display=isOpen?'none':'flex';sec.style.flexDirection='column';
      if(!isOpen)await loadReplies(btn.dataset.postId);
    });
  });
  document.querySelectorAll('.send-reply').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const postId=btn.dataset.postId;
      const input=document.querySelector(`.reply-input[data-post-id="${postId}"]`);
      if(!input||!input.value.trim())return;
      await sbPost('replies',{post_id:postId,user_id:USER_ID,author_name:USER_PROFILE?.full_name||'User',author_avatar:USER_PROFILE?.avatar_url||null,content:input.value.trim()});
      input.value='';await loadReplies(postId);
    });
  });
  document.querySelectorAll('[data-delete-post]').forEach(btn=>{
    btn.addEventListener('click',async()=>{if(!confirm('Delete?'))return;await sbDelete('posts','?id=eq.'+btn.dataset.deletePost);loadFeed();});
  });
}
async function loadReplies(postId){
  const list=document.getElementById('replies-list-'+postId);if(!list)return;
  const replies=await sbGet('replies',`?post_id=eq.${postId}&order=created_at.asc`);
  if(!Array.isArray(replies)||!replies.length){list.innerHTML='';return;}
  list.innerHTML=replies.map(r=>`<div class="reply-item">${avatarEl(r.author_name,r.author_avatar,null,28)}<div class="reply-body"><div class="reply-author">${escHtml(r.author_name)}</div><div class="reply-text">${escHtml(r.content)}</div></div></div>`).join('');
}

document.getElementById('btn-post')?.addEventListener('click',async()=>{
  const content=document.getElementById('post-content')?.value.trim();
  if(!content&&!postImageFile){alert('Write something or attach a photo.');return;}
  const btn=document.getElementById('btn-post');btn.disabled=true;btn.textContent='Posting…';
  let imageUrl=null;
  if(postImageFile){const path=`posts/${USER_ID}-${Date.now()}.${postImageFile.name.split('.').pop()}`;imageUrl=await uploadFile('readtrack-media',path,postImageFile);}
  await sbPost('posts',{user_id:USER_ID,author_name:USER_PROFILE?.full_name||'User',author_avatar:USER_PROFILE?.avatar_url||null,content:content||null,image_url:imageUrl});
  if(document.getElementById('post-content'))document.getElementById('post-content').value='';
  const cc=document.getElementById('post-char-count');if(cc)cc.textContent='0';
  postImageFile=null;
  const preview=document.getElementById('post-img-preview');
  if(preview){preview.innerHTML='';preview.classList.add('hidden');}
  btn.disabled=false;btn.textContent='Post';loadFeed();
});
document.getElementById('post-content')?.addEventListener('input',function(){const c=document.getElementById('post-char-count');if(c)c.textContent=this.value.length;});
document.getElementById('post-image-input')?.addEventListener('change',e=>{
  postImageFile=e.target.files[0];
  const preview=document.getElementById('post-img-preview');
  if(preview&&postImageFile){preview.innerHTML=`<img src="${URL.createObjectURL(postImageFile)}" />`;preview.classList.remove('hidden');}
});

async function loadSidebarStats(){
  const statsEl=document.getElementById('sidebar-stats');const topEl=document.getElementById('sidebar-top');
  const history=loadData('rt-history',[]);const streaks=loadData('rt-streaks',{});
  const totalMs=history.reduce((a,s)=>a+(s.duration||0),0);
  if(statsEl)statsEl.innerHTML=`<div class="sidebar-stat"><span class="sidebar-stat-label">Sessions</span><span class="sidebar-stat-val">${history.length}</span></div><div class="sidebar-stat"><span class="sidebar-stat-label">Total Time</span><span class="sidebar-stat-val">${Math.floor(totalMs/3600000)}h ${Math.floor((totalMs%3600000)/60000)}m</span></div><div class="sidebar-stat"><span class="sidebar-stat-label">Streak</span><span class="sidebar-stat-val">${streaks.current||0} days 🔥</span></div>`;
  try{
    const sessions=await sbGet('sessions','?order=duration_ms.desc&limit=100');
    if(Array.isArray(sessions)){
      const byStudent={};sessions.forEach(s=>{byStudent[s.student_name]=(byStudent[s.student_name]||0)+(s.duration_ms||0);});
      const top=Object.entries(byStudent).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if(topEl)topEl.innerHTML=top.map(([name,ms],i)=>`<div class="sidebar-top-item"><span class="sidebar-top-rank">${['🥇','🥈','🥉','4','5'][i]}</span><span class="sidebar-top-name">${escHtml(name)}</span><span class="sidebar-top-time">${Math.floor(ms/3600000)}h</span></div>`).join('');
    }
  }catch{}
}

// ── Messages ──────────────────────────────────────────────────
async function loadConversations(){
  const convEl=document.getElementById('conversations');if(!convEl)return;
  const msgs=await sbGet('messages',`?or=(sender_id.eq.${USER_ID},receiver_id.eq.${USER_ID})&order=created_at.desc&limit=200`);
  if(!Array.isArray(msgs)||!msgs.length){convEl.innerHTML='<div class="feed-empty" style="padding:16px;font-size:.85rem">No messages yet</div>';return;}
  const convMap={};
  msgs.forEach(m=>{
    const otherId=m.sender_id===USER_ID?m.receiver_id:m.sender_id;
    const otherName=m.sender_id===USER_ID?(m.receiver_name||'User'):m.sender_name;
    if(!convMap[otherId])convMap[otherId]={id:otherId,name:otherName,lastMsg:m.content||'📷 Photo',time:m.created_at,unread:0};
    if(!m.read&&m.receiver_id===USER_ID)convMap[otherId].unread++;
  });
  convEl.innerHTML=Object.values(convMap).map(c=>`<div class="conv-item" data-user-id="${c.id}" data-user-name="${escHtml(c.name)}">${avatarEl(c.name,null,null,40)}<div class="conv-info"><div class="conv-name">${escHtml(c.name)}</div><div class="conv-preview">${escHtml(c.lastMsg||'')}</div></div>${c.unread?`<span class="conv-unread">${c.unread}</span>`:''}</div>`).join('');
  convEl.querySelectorAll('.conv-item').forEach(item=>{item.addEventListener('click',()=>openChat(item.dataset.userId,item.dataset.userName));});
}

async function openChat(userId,userName){
  currentChatUserId=userId;currentChatName=userName;
  const win=document.getElementById('chat-window');if(!win)return;
  win.innerHTML=`<div class="chat-window-header">${avatarEl(userName,null,null,36)}<div class="chat-window-name">${escHtml(userName)}</div></div><div class="chat-messages" id="chat-messages"></div><div class="chat-input-area"><label class="chat-img-btn" for="chat-img-input"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><input type="file" id="chat-img-input" accept="image/*" style="display:none"/></label><textarea id="chat-input" class="chat-input" placeholder="Type a message…" rows="1" maxlength="1000"></textarea><button id="chat-send-btn" class="chat-send-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg></button></div>`;
  await loadChatMessages();
  document.getElementById('chat-send-btn')?.addEventListener('click',sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();}});
  document.getElementById('chat-img-input')?.addEventListener('change',e=>{chatImageFile=e.target.files[0];sendChatMessage();});
}

async function loadChatMessages(){
  const msgEl=document.getElementById('chat-messages');if(!msgEl)return;
  const msgs=await sbGet('messages',`?or=(and(sender_id.eq.${USER_ID},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${USER_ID}))&order=created_at.asc&limit=100`);
  if(!Array.isArray(msgs))return;
  msgEl.innerHTML=msgs.map(m=>{
    const sent=m.sender_id===USER_ID;
    return `<div class="chat-msg ${sent?'sent':''}">${!sent?avatarEl(m.sender_name,null,null,30):''}<div class="chat-bubble">${m.content?`<p>${escHtml(m.content)}</p>`:''}${m.image_url?`<img src="${m.image_url}" loading="lazy" />`:''}<div class="chat-bubble-time">${timeAgo(m.created_at)}</div></div>${sent?avatarEl(USER_PROFILE?.full_name||'Me',USER_PROFILE?.avatar_url||null,USER_PROFILE?.theme_color||null,30):''}</div>`;
  }).join('');
  msgEl.scrollTop=msgEl.scrollHeight;
  await sbUpdate('messages',`?sender_id=eq.${currentChatUserId}&receiver_id=eq.${USER_ID}`,{read:true}).catch(()=>{});
}

async function sendChatMessage(){
  const input=document.getElementById('chat-input');const content=input?.value.trim();
  if(!content&&!chatImageFile)return;
  let imageUrl=null;
  if(chatImageFile){const path=`messages/${USER_ID}-${Date.now()}.${chatImageFile.name.split('.').pop()}`;imageUrl=await uploadFile('readtrack-media',path,chatImageFile);chatImageFile=null;}
  await sbPost('messages',{sender_id:USER_ID,receiver_id:currentChatUserId,sender_name:USER_PROFILE?.full_name||'User',content:content||null,image_url:imageUrl});
  if(input)input.value='';await loadChatMessages();
}

document.getElementById('btn-new-message')?.addEventListener('click',async()=>{
  document.getElementById('new-msg-modal')?.classList.remove('hidden');
  const profiles=await sbGet('profiles',`?id=neq.${USER_ID}&select=*`);
  allProfiles=Array.isArray(profiles)?profiles:[];renderUserResults(allProfiles);
});
document.getElementById('btn-close-modal')?.addEventListener('click',()=>document.getElementById('new-msg-modal')?.classList.add('hidden'));
function renderUserResults(list){
  const results=document.getElementById('msg-user-results');if(!results)return;
  results.innerHTML=list.map(p=>`<div class="msg-user-item" data-user-id="${p.id}" data-user-name="${escHtml(p.full_name||'User')}">${avatarEl(p.full_name,p.avatar_url,p.theme_color,36)}<div><div class="msg-user-name">${escHtml(p.full_name||'User')}</div><div class="msg-user-role">${p.role||'member'}</div></div></div>`).join('');
  results.querySelectorAll('.msg-user-item').forEach(item=>{
    item.addEventListener('click',()=>{
      document.getElementById('new-msg-modal')?.classList.add('hidden');
      openChat(item.dataset.userId,item.dataset.userName);
      document.querySelectorAll('.comm-tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.comm-tab-content').forEach(c=>c.classList.remove('active'));
      document.querySelector('.comm-tab-btn[data-ctab="messages"]')?.classList.add('active');
      document.getElementById('ctab-messages')?.classList.add('active');
    });
  });
}
document.getElementById('msg-search-user')?.addEventListener('input',function(){
  renderUserResults(allProfiles.filter(p=>(p.full_name||'').toLowerCase().includes(this.value.toLowerCase())));
});

async function loadMembers(filter=''){
  const list=document.getElementById('members-list');if(!list)return;
  list.innerHTML='<div class="feed-loading">Loading…</div>';
  const profiles=await sbGet('profiles','?select=*&limit=100');
  if(!Array.isArray(profiles)){list.innerHTML='<div class="feed-empty">No members found.</div>';return;}
  const filtered=filter?profiles.filter(p=>(p.full_name||'').toLowerCase().includes(filter.toLowerCase())):profiles;
  list.innerHTML=filtered.map(p=>`<div class="member-card"><div class="member-avatar" style="background:${p.theme_color||'#6366f1'}">${p.avatar_url?`<img src="${p.avatar_url}"/>`:(p.full_name||'U').charAt(0).toUpperCase()}</div><div class="member-name">${escHtml(p.full_name||'User')}</div><div class="member-role">${p.role||'member'}</div>${p.genre?`<div class="member-stats">📚 ${p.genre}</div>`:''}<button class="member-msg-btn" data-user-id="${p.id}" data-user-name="${escHtml(p.full_name||'User')}">${p.id===USER_ID?'You':'Message'}</button></div>`).join('');
  list.querySelectorAll('.member-msg-btn:not([data-user-id="'+USER_ID+'"])').forEach(btn=>{
    btn.addEventListener('click',()=>{
      openChat(btn.dataset.userId,btn.dataset.userName);
      document.querySelectorAll('.comm-tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.comm-tab-content').forEach(c=>c.classList.remove('active'));
      document.querySelector('.comm-tab-btn[data-ctab="messages"]')?.classList.add('active');
      document.getElementById('ctab-messages')?.classList.add('active');
    });
  });
}
document.getElementById('search-members')?.addEventListener('input',function(){loadMembers(this.value);});

// ── Profile ───────────────────────────────────────────────────
async function loadProfileTab(){
  if(!USER_ID)return;
  const profile=await sbGet('profiles',`?id=eq.${USER_ID}&select=*`);
  const p=Array.isArray(profile)?profile[0]:null;
  if(!p)return;
  USER_PROFILE={...USER_PROFILE,...p};localStorage.setItem('rt-profile',JSON.stringify(USER_PROFILE));
  const history=loadData('rt-history',[]);const streaks=loadData('rt-streaks',{});
  const totalMs=history.reduce((a,s)=>a+(s.duration||0),0);
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('profile-name-display',p.full_name||'—');set('profile-bio-display',p.bio||'No bio yet.');
  const rb=document.getElementById('profile-role-badge');if(rb)rb.textContent=(p.role||'student').charAt(0).toUpperCase()+(p.role||'student').slice(1);
  const gb=document.getElementById('profile-genre-badge');if(gb&&p.genre){gb.textContent='📚 '+p.genre;gb.classList.remove('hidden');}
  const cover=document.getElementById('profile-cover');if(cover&&p.theme_color)cover.style.background=p.theme_color;
  const avatarD=document.getElementById('profile-avatar-display');
  if(avatarD){if(p.avatar_url)avatarD.innerHTML=`<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover"/>`;else avatarD.textContent=(p.full_name||'U').charAt(0).toUpperCase();if(p.theme_color)avatarD.style.background=p.theme_color;}
  const sr=document.getElementById('profile-stats-row');
  if(sr)sr.innerHTML=`<div class="profile-stat"><div class="profile-stat-num">${history.length}</div><div class="profile-stat-label">Sessions</div></div><div class="profile-stat"><div class="profile-stat-num">${Math.floor(totalMs/3600000)}h</div><div class="profile-stat-label">Reading</div></div><div class="profile-stat"><div class="profile-stat-num">${streaks.current||0}</div><div class="profile-stat-label">Streak</div></div>`;
  const en=document.getElementById('edit-name');const eb=document.getElementById('edit-bio');const eg=document.getElementById('edit-genre');
  if(en)en.value=p.full_name||'';if(eb)eb.value=p.bio||'';if(eg)eg.value=p.genre||'';
  document.querySelectorAll('.color-btn').forEach(btn=>btn.classList.toggle('selected',btn.dataset.color===p.theme_color));
}
document.querySelectorAll('.color-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    const c=document.getElementById('profile-cover');const a=document.getElementById('profile-avatar-display');
    if(c)c.style.background=btn.dataset.color;
    if(a&&!USER_PROFILE?.avatar_url)a.style.background=btn.dataset.color;
  });
});
document.getElementById('btn-save-profile')?.addEventListener('click',async()=>{
  const name=document.getElementById('edit-name')?.value.trim();
  const bio=document.getElementById('edit-bio')?.value.trim();
  const genre=document.getElementById('edit-genre')?.value;
  const color=document.querySelector('.color-btn.selected')?.dataset.color||'#6366f1';
  const msgEl=document.getElementById('profile-save-msg');
  const btn=document.getElementById('btn-save-profile');
  if(!name){if(msgEl){msgEl.textContent='Name is required.';msgEl.className='auth-alert auth-alert-error';msgEl.classList.remove('hidden');}return;}
  btn.disabled=true;btn.textContent='Saving…';
  await sbUpdate('profiles',`?id=eq.${USER_ID}`,{full_name:name,bio,genre,theme_color:color});
  USER_PROFILE={...USER_PROFILE,full_name:name,bio,genre,theme_color:color};
  localStorage.setItem('rt-profile',JSON.stringify(USER_PROFILE));
  if(msgEl){msgEl.textContent='✅ Saved!';msgEl.className='auth-alert auth-alert-success';msgEl.classList.remove('hidden');}
  btn.disabled=false;btn.textContent='Save Profile';loadProfileTab();
});
document.getElementById('avatar-upload')?.addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  const path=`avatars/${USER_ID}.${file.name.split('.').pop()}`;
  const url=await uploadFile('readtrack-media',path,file);
  if(url){await sbUpdate('profiles',`?id=eq.${USER_ID}`,{avatar_url:url});USER_PROFILE.avatar_url=url;localStorage.setItem('rt-profile',JSON.stringify(USER_PROFILE));loadProfileTab();}
});

// ── Teacher Dashboard (inline) ────────────────────────────────
let teacherClass=null,allTeacherSessions=[],allTeacherStudents=[],teacherAssignments=[],tCharts={};

async function initTeacherPage(){
  // Check if logged in via auth as teacher
  if(USER_PROFILE?.role==='teacher'){
    const saved=loadData('rt-teacher-session',null);
    if(saved){teacherClass={class_code:saved.classCode,class_name:saved.className};showTeacherDashboard();return;}
  }
  const tLogin=document.getElementById('t-login-section');const tDash=document.getElementById('t-dashboard-section');
  if(tLogin)tLogin.style.display='';if(tDash)tDash.classList.add('hidden');
}

document.getElementById('btn-t-login')?.addEventListener('click',async()=>{
  const code=document.getElementById('t-input-class-code')?.value.trim().toUpperCase();
  const pin=document.getElementById('t-input-pin')?.value.trim();
  const errEl=document.getElementById('t-login-error');const btn=document.getElementById('btn-t-login');
  if(!code||!pin){if(errEl){errEl.textContent='Please enter class code and PIN.';errEl.classList.remove('hidden');}return;}
  btn.disabled=true;btn.textContent='Signing in…';if(errEl)errEl.classList.add('hidden');
  try{
    const data=await fetch('/.netlify/functions/teacher-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({classCode:code,pin})}).then(r=>r.json());
    if(!data.success)throw new Error(data.error||'Invalid');
    teacherClass=data.class;saveData('rt-teacher-session',{classCode:code,className:data.class.class_name});
    showTeacherDashboard();
  }catch(e){if(errEl){errEl.textContent='Error: '+e.message;errEl.classList.remove('hidden');}btn.disabled=false;btn.textContent='Access Dashboard';}
});

function showTeacherDashboard(){
  const tLogin=document.getElementById('t-login-section');const tDash=document.getElementById('t-dashboard-section');
  if(tLogin)tLogin.style.display='none';if(tDash)tDash.classList.remove('hidden');
  const nameLabel=document.getElementById('t-class-name-label');
  if(nameLabel)nameLabel.textContent=teacherClass?.class_name||'Teacher Dashboard';
  loadTeacherData();
}

async function loadTeacherData(){
  if(!teacherClass)return;
  const[sessData,studData]=await Promise.all([
    fetch(`/.netlify/functions/teacher-data?classCode=${teacherClass.class_code}&type=sessions`).then(r=>r.json()),
    fetch(`/.netlify/functions/teacher-data?classCode=${teacherClass.class_code}&type=students`).then(r=>r.json()),
  ]);
  allTeacherSessions=sessData.data||[];allTeacherStudents=studData.data||[];
  teacherAssignments=loadData('rt-assignments-'+teacherClass.class_code,[]);
  renderTeacherOverview();renderTeacherStudents();renderTeacherSessions();renderTeacherAssignments();
}

function renderTeacherOverview(){
  const totalMs=allTeacherSessions.reduce((a,s)=>a+(s.duration_ms||0),0);
  const verified=allTeacherSessions.filter(s=>s.camera_ok&&s.latitude).length;
  const verPct=allTeacherSessions.length?Math.round(verified/allTeacherSessions.length*100):0;
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  set('stat-students',allTeacherStudents.length);set('stat-sessions',allTeacherSessions.length);
  set('stat-hours',Math.floor(totalMs/3600000)+'h '+Math.floor((totalMs%3600000)/60000)+'m');set('stat-verified',verPct+'%');
  const byStudent={};allTeacherSessions.forEach(s=>{byStudent[s.student_name]=(byStudent[s.student_name]||0)+(s.duration_ms||0);});
  const sorted=Object.entries(byStudent).sort((a,b)=>b[1]-a[1]);
  const topList=document.getElementById('top-readers-list');
  if(topList){const rankClass=['gold','silver','bronze'];const rankEmoji=['🥇','🥈','🥉'];const maxMs=sorted[0]?sorted[0][1]:1;
    topList.innerHTML=sorted.slice(0,5).map(([name,ms],i)=>`<div class="top-reader-item"><div class="top-reader-rank ${rankClass[i]||''}">${rankEmoji[i]||i+1}</div><div class="top-reader-name">${escHtml(name)}</div><div class="top-reader-bar-wrap"><div class="top-reader-bar" style="width:${Math.round(ms/maxMs*100)}%"></div></div><div class="top-reader-time">${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m</div></div>`).join('')||'<div class="t-empty">No sessions yet.</div>';}
  const wrap=document.getElementById('recent-sessions-list');
  if(wrap){const recent=[...allTeacherSessions].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8);wrap.innerHTML=recent.length?buildTeacherSessionTable(recent):'<div class="t-empty">No sessions yet.</div>';}
}

function buildTeacherSessionTable(list){
  const rows=list.map(s=>{const v=s.camera_ok&&s.latitude;return `<tr><td><strong>${escHtml(s.student_name||'—')}</strong></td><td>${new Date(s.created_at).toLocaleDateString()}</td><td>${s.duration_text||'—'}</td><td><span class="t-badge ${v?'t-badge-green':'t-badge-yellow'}">${v?'Verified':'Partial'}</span></td></tr>`;}).join('');
  return `<table class="t-table"><thead><tr><th>Student</th><th>Date</th><th>Duration</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTeacherStudents(filter=''){
  const wrap=document.getElementById('students-list');if(!wrap)return;
  const list=filter?allTeacherStudents.filter(s=>s.name.toLowerCase().includes(filter.toLowerCase())):allTeacherStudents;
  if(!list.length){wrap.innerHTML='<div class="t-empty">No students found.</div>';return;}
  const rows=list.map(s=>{const sess=allTeacherSessions.filter(x=>x.student_name===s.name);const totalMs=sess.reduce((a,x)=>a+(x.duration_ms||0),0);return `<tr><td><strong>${escHtml(s.name)}</strong></td><td>${sess.length}</td><td>${Math.floor(totalMs/3600000)}h ${Math.floor((totalMs%3600000)/60000)}m</td><td><span class="t-badge ${sess.length?'t-badge-green':'t-badge-yellow'}">${sess.length?'Active':'No sessions'}</span></td></tr>`;}).join('');
  wrap.innerHTML=`<table class="t-table"><thead><tr><th>Name</th><th>Sessions</th><th>Total Time</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTeacherSessions(nameF='',dateF=''){
  const wrap=document.getElementById('sessions-list');if(!wrap)return;
  let list=[...allTeacherSessions].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(nameF)list=list.filter(s=>s.student_name?.toLowerCase().includes(nameF.toLowerCase()));
  if(dateF)list=list.filter(s=>s.created_at?.slice(0,10)===dateF);
  wrap.innerHTML=list.length?buildTeacherSessionTable(list):'<div class="t-empty">No sessions found.</div>';
}

function renderTeacherAssignments(){
  const list=document.getElementById('assignments-list');if(!list)return;
  if(!teacherAssignments.length){list.innerHTML='<div class="t-empty">No assignments yet.</div>';return;}
  list.innerHTML=teacherAssignments.map((a,i)=>`<div class="t-assignment-card"><div class="t-assignment-info"><div class="t-assignment-title">${escHtml(a.title)}</div><div class="t-assignment-meta">Duration: ${a.duration} min · Due: ${a.due||'No due date'}</div></div><button class="t-assignment-del" data-idx="${i}">Delete</button></div>`).join('');
  list.querySelectorAll('[data-idx]').forEach(btn=>{btn.addEventListener('click',()=>{teacherAssignments.splice(parseInt(btn.dataset.idx),1);saveData('rt-assignments-'+teacherClass.class_code,teacherAssignments);renderTeacherAssignments();});});
}

document.getElementById('search-students')?.addEventListener('input',e=>renderTeacherStudents(e.target.value));
document.getElementById('search-sessions')?.addEventListener('input',e=>renderTeacherSessions(e.target.value,document.getElementById('filter-date')?.value||''));
document.getElementById('filter-date')?.addEventListener('change',e=>renderTeacherSessions(document.getElementById('search-sessions')?.value||'',e.target.value));
document.getElementById('btn-clear-filters')?.addEventListener('click',()=>{if(document.getElementById('search-sessions'))document.getElementById('search-sessions').value='';if(document.getElementById('filter-date'))document.getElementById('filter-date').value='';renderTeacherSessions();});
document.getElementById('btn-create-assignment')?.addEventListener('click',()=>{
  const title=document.getElementById('assign-title')?.value.trim();
  const duration=document.getElementById('assign-duration')?.value;
  const due=document.getElementById('assign-due')?.value;
  const desc=document.getElementById('assign-desc')?.value.trim();
  if(!title||!duration){alert('Please enter title and duration.');return;}
  teacherAssignments.push({title,duration:parseInt(duration),due,desc,createdAt:new Date().toISOString()});
  saveData('rt-assignments-'+teacherClass.class_code,teacherAssignments);
  ['assign-title','assign-duration','assign-due','assign-desc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  renderTeacherAssignments();
});
document.getElementById('btn-export-csv')?.addEventListener('click',()=>{
  if(!allTeacherSessions.length){alert('No sessions to export.');return;}
  const headers=['Session ID','Student','Date','Duration','Camera OK','Latitude','Longitude'];
  const rows=allTeacherSessions.map(s=>[s.session_id,s.student_name,s.created_at,s.duration_text,s.camera_ok?'Yes':'No',s.latitude,s.longitude].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(','));
  const csv='data:text/csv;charset=utf-8,'+[headers.join(','),...rows].join('\n');
  const link=document.createElement('a');link.href=encodeURI(csv);link.download=`ReadTrack-${teacherClass?.class_code||'export'}.csv`;link.click();
});
document.getElementById('btn-refresh')?.addEventListener('click',()=>loadTeacherData());

// Teacher inner nav
document.querySelectorAll('.t-nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const view=btn.dataset.view;
    document.querySelectorAll('.t-nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.t-view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');document.getElementById('view-'+view)?.classList.add('active');
    if(view==='charts')setTimeout(()=>{renderTeacherCharts();},100);
  });
});

function renderTeacherCharts(){
  const c1=document.getElementById('chart-sessions-per-day');
  const c2=document.getElementById('chart-time-per-student');
  if(c1&&typeof Chart!=='undefined'){
    if(tCharts.c1){tCharts.c1.destroy();}
    const days=14,labels=[],counts=[];
    for(let i=days-1;i>=0;i--){const d=new Date(Date.now()-i*86400000);const str=d.toISOString().slice(0,10);labels.push(d.toLocaleDateString(undefined,{month:'short',day:'numeric'}));counts.push(allTeacherSessions.filter(s=>s.created_at?.slice(0,10)===str).length);}
    tCharts.c1=new Chart(c1,{type:'bar',data:{labels,datasets:[{label:'Sessions',data:counts,backgroundColor:'rgba(99,102,241,0.7)',borderColor:'#6366f1',borderWidth:2,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:10}}},y:{beginAtZero:true,ticks:{stepSize:1}}}}});
  }
  if(c2&&typeof Chart!=='undefined'){
    if(tCharts.c2){tCharts.c2.destroy();}
    const byStudent={};allTeacherSessions.forEach(s=>{byStudent[s.student_name]=(byStudent[s.student_name]||0)+(s.duration_ms||0);});
    const sorted=Object.entries(byStudent).sort((a,b)=>b[1]-a[1]).slice(0,8);
    tCharts.c2=new Chart(c2,{type:'bar',data:{labels:sorted.map(([n])=>n),datasets:[{label:'Minutes',data:sorted.map(([,ms])=>Math.round(ms/60000)),backgroundColor:'rgba(139,92,246,0.7)',borderColor:'#8b5cf6',borderWidth:2,borderRadius:6}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
  }
}

// ── Reset ─────────────────────────────────────────────────────
function resetAll(){
  timerElapsed=0;timerStartTs=null;timerRunning=false;
  Object.assign(session,{id:'',startTime:null,endTime:null,duration:0,lat:null,lng:null,accuracy:null,cameraOk:false,photoBlob:null,pdfName:'',goalMs:0});
  const disp=document.getElementById('timer-display');const circle=document.getElementById('timer-progress-circle');
  if(disp)disp.textContent='00:00:00';if(circle)circle.style.strokeDashoffset=CIRCUMFERENCE;
  updateTimerUI();
  const chk=document.getElementById('chk-agree');const btn=document.getElementById('btn-agree');
  if(chk)chk.checked=false;if(btn)btn.disabled=true;
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

// ── PWA ───────────────────────────────────────────────────────
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredInstall=e;
  const banner=document.getElementById('pwa-banner');
  if(banner&&!localStorage.getItem('rt-pwa-dismissed'))banner.classList.remove('hidden');
});
document.getElementById('btn-pwa-install')?.addEventListener('click',async()=>{
  if(!deferredInstall)return;
  deferredInstall.prompt();deferredInstall=null;
  document.getElementById('pwa-banner')?.classList.add('hidden');
});
document.getElementById('btn-pwa-dismiss')?.addEventListener('click',()=>{
  document.getElementById('pwa-banner')?.classList.add('hidden');
  localStorage.setItem('rt-pwa-dismissed','1');
});

// ── Guards ────────────────────────────────────────────────────
window.addEventListener('beforeunload',e=>{if(currentPage==='session'&&timerRunning){e.preventDefault();e.returnValue='Session is active.';}});
window.addEventListener('offline',()=>{if(!['landing','auth'].includes(currentPage))showPage('errorOffline');});

// ── Service Worker ────────────────────────────────────────────
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
}

// ── Init ──────────────────────────────────────────────────────
async function init(){
  await loadConfig();
  const session_=getAuthSession();
  const profile=JSON.parse(localStorage.getItem('rt-profile')||'null');
  if(session_?.token&&session_.expiresAt>Date.now()){
    AUTH_TOKEN=session_.token;USER_ID=session_.userId||'';USER_PROFILE=profile;
    const teacherBtn=document.getElementById('nav-teacher-btn');
    if(teacherBtn)teacherBtn.classList.toggle('hidden',profile?.role!=='teacher');
    if(profile?.class_code){schoolData.classCode=profile.class_code;schoolData.studentName=profile.full_name||'';}
  }
  showPage('landing');
}

init();
