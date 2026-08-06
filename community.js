/* ReadTrack — community.js */
'use strict';

let SUPA_URL = '', SUPA_KEY = '', AUTH_TOKEN = '', USER_ID = '', USER_PROFILE = null;
let currentChatUserId = null, currentChatName = '';
let postImageFile = null, chatImageFile = null;
let allProfiles = [];

// ── Init ───────────────────────────────────────────────────────
async function init() {
  // Load config
  try {
    const res  = await fetch('/.netlify/functions/config');
    const cfg  = await res.json();
    SUPA_URL   = cfg.supabaseUrl;
    SUPA_KEY   = cfg.supabaseKey;
  } catch(e) { console.error('Config error:', e); }

  // Check auth
  const session = JSON.parse(localStorage.getItem('rt-auth')||'null');
  const profile = JSON.parse(localStorage.getItem('rt-profile')||'null');

  if (!session?.token || session.expiresAt < Date.now()) {
    document.getElementById('comm-guard')?.classList.remove('hidden');
    return;
  }

  AUTH_TOKEN   = session.token;
  USER_ID      = session.userId;
  USER_PROFILE = profile;

  document.getElementById('comm-app')?.classList.remove('hidden');

  // Set user badge
  const badge = document.getElementById('comm-user-badge');
  if (badge) badge.textContent = profile?.full_name || session.email || 'User';

  // Set composer avatar
  const compAvatar = document.getElementById('composer-avatar');
  if (compAvatar) {
    if (profile?.avatar_url) compAvatar.innerHTML = `<img src="${profile.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
    else compAvatar.textContent = (profile?.full_name||'U').charAt(0).toUpperCase();
    if (profile?.theme_color) compAvatar.style.background = profile.theme_color;
  }

  loadFeed();
  loadSidebarStats();
  loadProfileTab();
  loadMembers();
  checkUnreadMessages();

  // Char counter
  document.getElementById('post-content')?.addEventListener('input', function() {
    const count = document.getElementById('post-char-count');
    if (count) count.textContent = this.value.length;
  });
}

// ── Supabase helpers ───────────────────────────────────────────
async function sbGet(table, filter='') {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`, {
    headers: { 'apikey':SUPA_KEY, 'Authorization':'Bearer '+AUTH_TOKEN }
  });
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method:'POST',
    headers:{ 'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN,'Content-Type':'application/json','Prefer':'return=representation' },
    body:JSON.stringify(body)
  });
  return res.json();
}

async function sbDelete(table, filter) {
  await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`, {
    method:'DELETE',
    headers:{ 'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN }
  });
}

async function sbUpdate(table, filter, body) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}${filter}`, {
    method:'PATCH',
    headers:{ 'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN,'Content-Type':'application/json','Prefer':'return=representation' },
    body:JSON.stringify(body)
  });
  return res.json();
}

async function uploadFile(bucket, path, file) {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${path}`, {
    method:'POST',
    headers:{ 'apikey':SUPA_KEY,'Authorization':'Bearer '+AUTH_TOKEN,'Content-Type':file.type },
    body:file
  });
  const data = await res.json();
  if (data.Key) return `${SUPA_URL}/storage/v1/object/public/${data.Key}`;
  return null;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000), d=Math.floor(diff/86400000);
  if (diff<60000)  return 'just now';
  if (diff<3600000)return m+'m ago';
  if (diff<86400000)return h+'h ago';
  return d+'d ago';
}

function avatarEl(name, url, color, size=38) {
  const letter=(name||'U').charAt(0).toUpperCase();
  if (url) return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0"><img src="${url}" style="width:100%;height:100%;object-fit:cover" /></div>`;
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color||'#6366f1'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.floor(size*0.4)}px;font-weight:800;flex-shrink:0">${letter}</div>`;
}

// ── FEED ──────────────────────────────────────────────────────
async function loadFeed() {
  const list = document.getElementById('feed-list');
  if (!list) return;
  list.innerHTML = '<div class="feed-loading">Loading…</div>';
  const posts = await sbGet('posts', '?order=created_at.desc&limit=50');
  if (!Array.isArray(posts) || !posts.length) {
    list.innerHTML = '<div class="feed-empty">No posts yet. Be the first to post!</div>';
    return;
  }
  list.innerHTML = posts.map(p => renderPost(p)).join('');
  bindPostActions();
}

function renderPost(p) {
  const isOwn = p.user_id === USER_ID;
  return `
  <div class="post-card" data-post-id="${p.id}">
    <div class="post-header">
      ${avatarEl(p.author_name, p.author_avatar, USER_PROFILE?.theme_color)}
      <div>
        <div class="post-author">${p.author_name||'User'}</div>
        <div class="post-time">${timeAgo(p.created_at)}</div>
      </div>
      ${isOwn?`<button class="post-action-btn" style="margin-left:auto" data-delete-post="${p.id}">🗑️</button>`:''}
    </div>
    ${p.content?`<div class="post-content">${escHtml(p.content)}</div>`:''}
    ${p.image_url?`<div class="post-image"><img src="${p.image_url}" loading="lazy" /></div>`:''}
    <div class="post-actions">
      <button class="post-action-btn like-btn" data-post-id="${p.id}" data-likes="${p.likes||0}">
        ❤️ <span class="like-count">${p.likes||0}</span>
      </button>
      <button class="post-action-btn reply-toggle" data-post-id="${p.id}">
        💬 Reply
      </button>
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

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function bindPostActions() {
  // Like
  document.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.postId;
      btn.classList.toggle('liked');
      const liked = btn.classList.contains('liked');
      const countEl = btn.querySelector('.like-count');
      let count = parseInt(btn.dataset.likes||0);
      if (liked) {
        count++;
        await sbPost('post_likes',{post_id:postId,user_id:USER_ID}).catch(()=>{});
        await sbUpdate('posts','?id=eq.'+postId,{likes:count});
      } else {
        count=Math.max(0,count-1);
        await sbDelete('post_likes',`?post_id=eq.${postId}&user_id=eq.${USER_ID}`);
        await sbUpdate('posts','?id=eq.'+postId,{likes:count});
      }
      btn.dataset.likes=count;
      if(countEl) countEl.textContent=count;
    });
  });

  // Reply toggle
  document.querySelectorAll('.reply-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.postId;
      const section = document.getElementById('replies-'+postId);
      if (!section) return;
      const isOpen = section.style.display !== 'none';
      section.style.display = isOpen ? 'none' : 'flex';
      section.style.flexDirection = 'column';
      if (!isOpen) await loadReplies(postId);
    });
  });

  // Send reply
  document.querySelectorAll('.send-reply').forEach(btn => {
    btn.addEventListener('click', async () => {
      const postId = btn.dataset.postId;
      const input = document.querySelector(`.reply-input[data-post-id="${postId}"]`);
      if (!input || !input.value.trim()) return;
      const name = USER_PROFILE?.full_name || 'User';
      const avatar = USER_PROFILE?.avatar_url || null;
      await sbPost('replies',{post_id:postId,user_id:USER_ID,author_name:name,author_avatar:avatar,content:input.value.trim()});
      input.value='';
      await loadReplies(postId);
    });
  });

  // Delete post
  document.querySelectorAll('[data-delete-post]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this post?')) return;
      await sbDelete('posts','?id=eq.'+btn.dataset.deletePost);
      loadFeed();
    });
  });
}

async function loadReplies(postId) {
  const list = document.getElementById('replies-list-'+postId);
  if (!list) return;
  const replies = await sbGet('replies',`?post_id=eq.${postId}&order=created_at.asc`);
  if (!Array.isArray(replies) || !replies.length) { list.innerHTML=''; return; }
  list.innerHTML = replies.map(r=>`
    <div class="reply-item">
      ${avatarEl(r.author_name,r.author_avatar,null,28)}
      <div class="reply-body">
        <div class="reply-author">${r.author_name}</div>
        <div class="reply-text">${escHtml(r.content)}</div>
      </div>
    </div>
  `).join('');
}

// Create post
document.getElementById('btn-post')?.addEventListener('click', async () => {
  const content = document.getElementById('post-content')?.value.trim();
  if (!content && !postImageFile) { alert('Write something or attach a photo.'); return; }
  const btn = document.getElementById('btn-post');
  btn.disabled=true; btn.textContent='Posting…';

  let imageUrl = null;
  if (postImageFile) {
    const path = `posts/${USER_ID}-${Date.now()}.${postImageFile.name.split('.').pop()}`;
    imageUrl = await uploadFile('readtrack-media', path, postImageFile);
  }

  const name   = USER_PROFILE?.full_name || 'User';
  const avatar = USER_PROFILE?.avatar_url || null;
  await sbPost('posts',{user_id:USER_ID,author_name:name,author_avatar:avatar,content:content||null,image_url:imageUrl});

  if(document.getElementById('post-content')) document.getElementById('post-content').value='';
  const charCount = document.getElementById('post-char-count');
  if(charCount) charCount.textContent='0';
  postImageFile=null;
  const preview=document.getElementById('post-img-preview');
  if(preview){preview.innerHTML='';preview.classList.add('hidden');}
  btn.disabled=false; btn.textContent='Post';
  loadFeed();
});

// Post image picker
document.getElementById('post-image-input')?.addEventListener('change', e => {
  postImageFile = e.target.files[0];
  const preview = document.getElementById('post-img-preview');
  if (preview && postImageFile) {
    preview.innerHTML=`<img src="${URL.createObjectURL(postImageFile)}" />`;
    preview.classList.remove('hidden');
  }
});

// Sidebar stats
async function loadSidebarStats() {
  const statsEl = document.getElementById('sidebar-stats');
  const topEl   = document.getElementById('sidebar-top');
  const history = JSON.parse(localStorage.getItem('rt-history')||'[]');
  const streaks = JSON.parse(localStorage.getItem('rt-streaks')||'{}');
  const totalMs = history.reduce((a,s)=>a+(s.duration||0),0);

  if (statsEl) statsEl.innerHTML = `
    <div class="sidebar-stat"><span class="sidebar-stat-label">Sessions</span><span class="sidebar-stat-val">${history.length}</span></div>
    <div class="sidebar-stat"><span class="sidebar-stat-label">Total Time</span><span class="sidebar-stat-val">${Math.floor(totalMs/3600000)}h ${Math.floor((totalMs%3600000)/60000)}m</span></div>
    <div class="sidebar-stat"><span class="sidebar-stat-label">Streak</span><span class="sidebar-stat-val">${streaks.current||0} days 🔥</span></div>
  `;

  // Top readers from Supabase
  try {
    const sessions = await sbGet('sessions','?order=duration_ms.desc&limit=100');
    if (Array.isArray(sessions)) {
      const byStudent={};
      sessions.forEach(s=>{ byStudent[s.student_name]=(byStudent[s.student_name]||0)+(s.duration_ms||0); });
      const top=Object.entries(byStudent).sort((a,b)=>b[1]-a[1]).slice(0,5);
      if(topEl) topEl.innerHTML=top.map(([name,ms],i)=>`
        <div class="sidebar-top-item">
          <span class="sidebar-top-rank">${['🥇','🥈','🥉','4','5'][i]}</span>
          <span class="sidebar-top-name">${name}</span>
          <span class="sidebar-top-time">${Math.floor(ms/3600000)}h</span>
        </div>
      `).join('');
    }
  } catch{}
}

// ── MESSAGES ──────────────────────────────────────────────────
async function loadConversations() {
  const convEl = document.getElementById('conversations');
  if (!convEl) return;
  const msgs = await sbGet('messages',`?or=(sender_id.eq.${USER_ID},receiver_id.eq.${USER_ID})&order=created_at.desc&limit=200`);
  if (!Array.isArray(msgs) || !msgs.length) {
    convEl.innerHTML='<div class="feed-empty" style="padding:20px;font-size:0.85rem">No messages yet</div>';
    return;
  }
  // Group by conversation partner
  const convMap={};
  msgs.forEach(m=>{
    const otherId   = m.sender_id===USER_ID ? m.receiver_id : m.sender_id;
    const otherName = m.sender_id===USER_ID ? (m.receiver_name||'User') : m.sender_name;
    if (!convMap[otherId]) convMap[otherId]={id:otherId,name:otherName,lastMsg:m.content||'📷 Photo',time:m.created_at,unread:0};
    if (!m.read && m.receiver_id===USER_ID) convMap[otherId].unread++;
  });
  convEl.innerHTML=Object.values(convMap).map(c=>`
    <div class="conv-item" data-user-id="${c.id}" data-user-name="${escHtml(c.name)}">
      ${avatarEl(c.name,null,null,40)}
      <div class="conv-info">
        <div class="conv-name">${escHtml(c.name)}</div>
        <div class="conv-preview">${escHtml(c.lastMsg||'')}</div>
      </div>
      ${c.unread?`<span class="conv-unread">${c.unread}</span>`:''}
    </div>
  `).join('');
  convEl.querySelectorAll('.conv-item').forEach(item=>{
    item.addEventListener('click',()=>openChat(item.dataset.userId,item.dataset.userName));
  });
}

async function openChat(userId, userName) {
  currentChatUserId = userId;
  currentChatName   = userName;
  const win = document.getElementById('chat-window');
  if (!win) return;

  win.innerHTML=`
    <div class="chat-window-header">
      ${avatarEl(userName,null,null,36)}
      <div class="chat-window-name">${escHtml(userName)}</div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-area">
      <label class="chat-img-btn" for="chat-img-input">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <input type="file" id="chat-img-input" accept="image/*" style="display:none" />
      </label>
      <textarea id="chat-input" class="chat-input" placeholder="Type a message…" rows="1" maxlength="1000"></textarea>
      <button id="chat-send-btn" class="chat-send-btn">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
  `;

  await loadChatMessages();

  document.getElementById('chat-send-btn')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keydown', e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();}
  });
  document.getElementById('chat-img-input')?.addEventListener('change', e=>{chatImageFile=e.target.files[0]; sendChatMessage();});
}

async function loadChatMessages() {
  const msgEl = document.getElementById('chat-messages');
  if (!msgEl) return;
  const msgs = await sbGet('messages',
    `?or=(and(sender_id.eq.${USER_ID},receiver_id.eq.${currentChatUserId}),and(sender_id.eq.${currentChatUserId},receiver_id.eq.${USER_ID}))&order=created_at.asc&limit=100`
  );
  if (!Array.isArray(msgs)) return;
  const myName = USER_PROFILE?.full_name||'Me';
  msgEl.innerHTML=msgs.map(m=>{
    const sent=m.sender_id===USER_ID;
    return `
      <div class="chat-msg ${sent?'sent':''}">
        ${!sent?avatarEl(m.sender_name,null,null,30):''}
        <div class="chat-bubble">
          ${m.content?`<p>${escHtml(m.content)}</p>`:''}
          ${m.image_url?`<img src="${m.image_url}" loading="lazy" />`:''}
          <div class="chat-bubble-time">${timeAgo(m.created_at)}</div>
        </div>
        ${sent?avatarEl(myName,USER_PROFILE?.avatar_url||null,USER_PROFILE?.theme_color||null,30):''}
      </div>`;
  }).join('');
  msgEl.scrollTop=msgEl.scrollHeight;

  // Mark as read
  await sbUpdate('messages',`?sender_id=eq.${currentChatUserId}&receiver_id=eq.${USER_ID}`,{read:true}).catch(()=>{});
}

async function sendChatMessage() {
  const input   = document.getElementById('chat-input');
  const content = input?.value.trim();
  if (!content && !chatImageFile) return;

  let imageUrl=null;
  if(chatImageFile){
    const path=`messages/${USER_ID}-${Date.now()}.${chatImageFile.name.split('.').pop()}`;
    imageUrl=await uploadFile('readtrack-media',path,chatImageFile);
    chatImageFile=null;
  }

  const name = USER_PROFILE?.full_name||'User';
  await sbPost('messages',{
    sender_id:USER_ID, receiver_id:currentChatUserId,
    sender_name:name, content:content||null, image_url:imageUrl
  });
  if(input) input.value='';
  await loadChatMessages();
}

async function checkUnreadMessages() {
  const msgs=await sbGet('messages',`?receiver_id=eq.${USER_ID}&read=eq.false&select=id`).catch(()=>[]);
  const count=Array.isArray(msgs)?msgs.length:0;
  const badge=document.getElementById('msg-badge');
  if(badge){badge.textContent=count;badge.classList.toggle('hidden',count===0);}
}

// New message modal
document.getElementById('btn-new-message')?.addEventListener('click',async()=>{
  document.getElementById('new-msg-modal')?.classList.remove('hidden');
  await loadAllProfiles();
});
document.getElementById('btn-close-modal')?.addEventListener('click',()=>{
  document.getElementById('new-msg-modal')?.classList.add('hidden');
});

async function loadAllProfiles(){
  const results=document.getElementById('msg-user-results');
  if(!results) return;
  const profiles=await sbGet('profiles',`?id=neq.${USER_ID}&select=*`);
  allProfiles=Array.isArray(profiles)?profiles:[];
  renderUserResults(allProfiles);
}

function renderUserResults(list){
  const results=document.getElementById('msg-user-results');
  if(!results) return;
  results.innerHTML=list.map(p=>`
    <div class="msg-user-item" data-user-id="${p.id}" data-user-name="${escHtml(p.full_name||'User')}">
      ${avatarEl(p.full_name,p.avatar_url,p.theme_color,36)}
      <div><div class="msg-user-name">${escHtml(p.full_name||'User')}</div><div class="msg-user-role">${p.role||'member'}</div></div>
    </div>
  `).join('');
  results.querySelectorAll('.msg-user-item').forEach(item=>{
    item.addEventListener('click',()=>{
      document.getElementById('new-msg-modal')?.classList.add('hidden');
      openChat(item.dataset.userId,item.dataset.userName);
      switchTab('messages');
    });
  });
}

document.getElementById('msg-search-user')?.addEventListener('input',function(){
  const q=this.value.toLowerCase();
  renderUserResults(allProfiles.filter(p=>(p.full_name||'').toLowerCase().includes(q)));
});

// ── PROFILE ───────────────────────────────────────────────────
async function loadProfileTab() {
  const profile = await sbGet('profiles',`?id=eq.${USER_ID}&select=*`);
  const p = Array.isArray(profile)?profile[0]:null;
  if (!p) return;
  USER_PROFILE = {...USER_PROFILE, ...p};
  localStorage.setItem('rt-profile', JSON.stringify(USER_PROFILE));

  const history = JSON.parse(localStorage.getItem('rt-history')||'[]');
  const streaks = JSON.parse(localStorage.getItem('rt-streaks')||'{}');
  const totalMs = history.reduce((a,s)=>a+(s.duration||0),0);

  // Display
  const nameDisp = document.getElementById('profile-name-display');
  const bioDisp  = document.getElementById('profile-bio-display');
  const roleB    = document.getElementById('profile-role-badge');
  const genreB   = document.getElementById('profile-genre-badge');
  const avatarD  = document.getElementById('profile-avatar-display');
  const cover    = document.getElementById('profile-cover');
  const statsRow = document.getElementById('profile-stats-row');

  if(nameDisp) nameDisp.textContent=p.full_name||'—';
  if(bioDisp)  bioDisp.textContent =p.bio||'No bio yet.';
  if(roleB)    roleB.textContent   =(p.role||'student').charAt(0).toUpperCase()+(p.role||'student').slice(1);
  if(genreB&&p.genre){ genreB.textContent='📚 '+p.genre; genreB.classList.remove('hidden'); }
  if(cover&&p.theme_color) cover.style.background=p.theme_color;
  if(avatarD){
    if(p.avatar_url) avatarD.innerHTML=`<img src="${p.avatar_url}" style="width:100%;height:100%;object-fit:cover" />`;
    else avatarD.textContent=(p.full_name||'U').charAt(0).toUpperCase();
    if(p.theme_color) avatarD.style.background=p.theme_color;
  }
  if(statsRow) statsRow.innerHTML=`
    <div class="profile-stat"><div class="profile-stat-num">${history.length}</div><div class="profile-stat-label">Sessions</div></div>
    <div class="profile-stat"><div class="profile-stat-num">${Math.floor(totalMs/3600000)}h</div><div class="profile-stat-label">Reading</div></div>
    <div class="profile-stat"><div class="profile-stat-num">${streaks.current||0}</div><div class="profile-stat-label">Streak</div></div>
  `;

  // Fill edit form
  const editName  = document.getElementById('edit-name');
  const editBio   = document.getElementById('edit-bio');
  const editGenre = document.getElementById('edit-genre');
  if(editName)  editName.value =p.full_name||'';
  if(editBio)   editBio.value  =p.bio||'';
  if(editGenre) editGenre.value=p.genre||'';

  // Color buttons
  document.querySelectorAll('.color-btn').forEach(btn=>{
    btn.classList.toggle('selected', btn.dataset.color===p.theme_color);
  });
}

// Color picker
document.querySelectorAll('.color-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('selected'));
    btn.classList.add('selected');
    const cover=document.getElementById('profile-cover');
    const avatar=document.getElementById('profile-avatar-display');
    if(cover)  cover.style.background=btn.dataset.color;
    if(avatar&&!USER_PROFILE?.avatar_url) avatar.style.background=btn.dataset.color;
  });
});

// Save profile
document.getElementById('btn-save-profile')?.addEventListener('click', async()=>{
  const name   = document.getElementById('edit-name')?.value.trim();
  const bio    = document.getElementById('edit-bio')?.value.trim();
  const genre  = document.getElementById('edit-genre')?.value;
  const color  = document.querySelector('.color-btn.selected')?.dataset.color || '#6366f1';
  const msgEl  = document.getElementById('profile-save-msg');
  const btn    = document.getElementById('btn-save-profile');

  if(!name){if(msgEl){msgEl.textContent='Name is required.';msgEl.className='auth-alert auth-alert-error';msgEl.classList.remove('hidden');}return;}

  btn.disabled=true; btn.textContent='Saving…';
  await sbUpdate('profiles',`?id=eq.${USER_ID}`,{full_name:name,bio,genre,theme_color:color});
  USER_PROFILE={...USER_PROFILE,full_name:name,bio,genre,theme_color:color};
  localStorage.setItem('rt-profile',JSON.stringify(USER_PROFILE));

  if(msgEl){msgEl.textContent='✅ Profile saved!';msgEl.className='auth-alert auth-alert-success';msgEl.classList.remove('hidden');}
  btn.disabled=false; btn.textContent='Save Profile';
  loadProfileTab();
});

// Avatar upload
document.getElementById('avatar-upload')?.addEventListener('change', async e=>{
  const file=e.target.files[0];
  if(!file) return;
  const path=`avatars/${USER_ID}.${file.name.split('.').pop()}`;
  const url=await uploadFile('readtrack-media',path,file);
  if(url){
    await sbUpdate('profiles',`?id=eq.${USER_ID}`,{avatar_url:url});
    USER_PROFILE.avatar_url=url;
    localStorage.setItem('rt-profile',JSON.stringify(USER_PROFILE));
    loadProfileTab();
  }
});

// ── MEMBERS ───────────────────────────────────────────────────
async function loadMembers(filter='') {
  const list=document.getElementById('members-list');
  if(!list) return;
  list.innerHTML='<div class="feed-loading">Loading…</div>';
  const profiles=await sbGet('profiles','?select=*&limit=100');
  if(!Array.isArray(profiles)){list.innerHTML='<div class="feed-empty">No members found.</div>';return;}
  const filtered=filter?profiles.filter(p=>(p.full_name||'').toLowerCase().includes(filter.toLowerCase())):profiles;
  list.innerHTML=filtered.map(p=>`
    <div class="member-card">
      <div class="member-avatar" style="background:${p.theme_color||'#6366f1'}">
        ${p.avatar_url?`<img src="${p.avatar_url}" />`:(p.full_name||'U').charAt(0).toUpperCase()}
      </div>
      <div class="member-name">${escHtml(p.full_name||'User')}</div>
      <div class="member-role">${p.role||'member'}</div>
      ${p.genre?`<div class="member-stats">📚 ${p.genre}</div>`:''}
      ${p.id!==USER_ID?`<button class="member-msg-btn" data-user-id="${p.id}" data-user-name="${escHtml(p.full_name||'User')}">Message</button>`:'<div class="member-stats">You</div>'}
    </div>
  `).join('');
  list.querySelectorAll('.member-msg-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      openChat(btn.dataset.userId,btn.dataset.userName);
      switchTab('messages');
    });
  });
}

document.getElementById('search-members')?.addEventListener('input',function(){loadMembers(this.value);});

// ── TAB NAVIGATION ────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.comm-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.comm-nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name)?.classList.add('active');
  document.querySelector(`.comm-nav-btn[data-tab="${name}"]`)?.classList.add('active');
  if(name==='messages') loadConversations();
  if(name==='members')  loadMembers();
}

document.querySelectorAll('.comm-nav-btn').forEach(btn=>{
  btn.addEventListener('click',()=>switchTab(btn.dataset.tab));
});

// ── INIT ──────────────────────────────────────────────────────
init();
