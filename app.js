/* ============================================================
   CRICKET HUB — APP.JS
   Fixed Layout, Restored Features, Public/Private Hubs,
   NRR Math, Smart Extras, Undo System, & Broadcast Scorecard
   ============================================================ */
'use strict';

const ADMIN_EMAIL = "shivamsanjaysaroj654@gmail.com";

window.hasEditAccess = function () {
  return App.state.currentRoom !== 'public' || App.state.isAdmin;
};

/* ============================================================
   1. STATE & PERSISTENCE
   ============================================================ */
const App = {
  state: {
    players: [],
    auctionRooms: [],
    tournaments: [],
    matches: [],
    notifications: [],
    activeRoute: 'home',
    activeScoringMatchId: null,
    currentUser: null,
    isAdmin: false,
    currentRoom: 'public',
    myPlayerId: null
  },

  initAuth() {
    if (!window.FirebaseAuth) return;
    window.FirebaseOnAuth(window.FirebaseAuth, (user) => {
      if (user) {
        App.state.currentUser = user.email;
        App.state.isAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
        App.state.myPlayerId = localStorage.getItem(`ch_linked_${user.email}`);
        Modal.close();
        Toast.show(`Welcome back! ${App.state.isAdmin ? '(Admin)' : ''}`, 'success');
        App.initLiveSync();
      } else {
        App.state.currentUser = null;
        App.state.isAdmin = false;
        AuthUI.showLogin();
      }
    });
  },

  initLiveSync() {
    if (!window.FirebaseDB) return;

    // Toggle the Global Exit button safely inside the standard nav menus
    const isPriv = App.state.currentRoom !== 'public';
    const exitBtn = el('exit-private-btn'); if (exitBtn) exitBtn.style.display = isPriv ? 'inline-block' : 'none';
    const exitBtnMob = el('exit-private-btn-mob'); if (exitBtnMob) exitBtnMob.style.display = isPriv ? 'block' : 'none';

    const dbPath = isPriv ? `crickethub_rooms/${App.state.currentRoom}` : 'crickethub_live_data';
    const dbRef = window.FirebaseRef(window.FirebaseDB, dbPath);

    window.FirebaseOnValue(dbRef, (snapshot) => {
      const data = snapshot.val() || {};
      App.state.players = data.players || [];
      App.state.auctionRooms = data.auctionRooms || [];
      App.state.tournaments = data.tournaments || [];
      App.state.matches = data.matches || [];

      const route = App.state.activeRoute;
      const renderers = { home: Home, players: Players, auction: Auction, tournament: Tournament, quickmatch: QuickMatch, scores: Scores, stats: Stats, room: RoomManager, profile: MyProfile };
      if (renderers[route]) renderers[route].render();

      updateLivePill();
      if (App.state.activeScoringMatchId && el('scoring-overlay').classList.contains('active')) {
        QuickMatch.renderScoringPanel(App.state.activeScoringMatchId);
      }
    });
  },

  save() {
    if (!window.FirebaseDB || !App.state.currentUser) return;
    if (!hasEditAccess()) return;
    const dbPath = App.state.currentRoom === 'public' ? 'crickethub_live_data' : `crickethub_rooms/${App.state.currentRoom}`;
    const dbRef = window.FirebaseRef(window.FirebaseDB, dbPath);
    window.FirebaseSet(dbRef, { players: App.state.players, auctionRooms: App.state.auctionRooms, tournaments: App.state.tournaments, matches: App.state.matches });
  },

  broadcast(msg) { try { App.channel.postMessage(msg); } catch (e) { } },
};

/* ============================================================
   AUTHENTICATION UI
   ============================================================ */
const AuthUI = {
  showLogin() {
    Modal.open(`
      <div style="text-align:center; margin-bottom:1.5rem;">
        <div style="font-size:3rem;">🏏</div>
        <h2 class="modal-title">Welcome to Cricket Hub</h2>
        <p style="color:var(--text-2); font-size:0.9rem;">Please log in to enter</p>
      </div>
      <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="auth-email" placeholder="your@email.com"></div>
      <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" id="auth-pass" placeholder="••••••••"></div>
      <button class="btn btn-primary btn-full" style="margin-bottom:0.5rem" onclick="AuthUI.login()">Login</button>
      <button class="btn btn-outline btn-full" onclick="AuthUI.signup()">Create Account</button>
    `);
    el('modal-overlay').onclick = null; el('modal-close').style.display = 'none';
  },
  async login() { try { await window.FirebaseSignIn(window.FirebaseAuth, el('auth-email').value, el('auth-pass').value); } catch (e) { Toast.show(e.message.replace('Firebase: ', ''), 'error'); } },
  async signup() { try { await window.FirebaseSignUp(window.FirebaseAuth, el('auth-email').value, el('auth-pass').value); } catch (e) { Toast.show(e.message.replace('Firebase: ', ''), 'error'); } },
  logout() { window.FirebaseSignOut(window.FirebaseAuth); }
};

/* ============================================================
   ROOM MANAGER & PROFILE
   ============================================================ */
const RoomManager = {
  render() {
    const isPublic = App.state.currentRoom === 'public';
    el('section-room').innerHTML = `
      <div class="container">
        <div class="section-header"><div><h1 class="section-title"><span class="icon">🏠</span> Hub Manager</h1></div></div>
        <div class="card" style="text-align:center; padding: 2rem; margin-bottom: 2rem; border: 2px solid ${isPublic ? 'var(--border)' : 'var(--gold)'}">
            <div style="font-size: 0.9rem; color: var(--text-2); font-weight: 700; letter-spacing: 1px;">CURRENT HUB</div>
            <div style="font-size: 2.5rem; font-weight: 900; color: ${isPublic ? 'var(--text)' : 'var(--gold)'}; margin: 0.5rem 0;">${isPublic ? '🌍 GLOBAL PUBLIC HUB' : `🔒 PRIVATE ROOM: ${App.state.currentRoom}`}</div>
            <p style="color:var(--text-2); font-size: 0.9rem; margin-bottom: 1.5rem;">${isPublic ? 'You are in the Public space. You can view all global matches and stats here.' : 'You are in a Private Hub. You have full admin rights to create players, auctions, and tournaments here!'}</p>
            ${!isPublic ? `<button class="btn btn-red" onclick="RoomManager.switchRoom('public')">🚪 Return to Global Hub</button>` : ''}
        </div>
        <div class="grid-2">
            <div class="card" style="padding: 1.5rem;"><h3 style="margin-bottom: 0.5rem; font-weight: 800;">Create Private Hub</h3><p style="color:var(--text-2); font-size:0.85rem; margin-bottom: 1rem;">Generate a fresh database for your own leagues.</p><button class="btn btn-primary btn-full" onclick="RoomManager.createRoom()">+ Generate Private Room</button></div>
            <div class="card" style="padding: 1.5rem;"><h3 style="margin-bottom: 0.5rem; font-weight: 800;">Join Private Hub</h3><p style="color:var(--text-2); font-size:0.85rem; margin-bottom: 1rem;">Enter a 6-character room code to access a private database.</p>
                <div style="display:flex; gap: 0.5rem;"><input class="form-input" id="join-room-code" placeholder="Enter Code" style="text-transform: uppercase;"><button class="btn btn-primary" onclick="RoomManager.joinRoom()">Join</button></div>
            </div>
        </div>
      </div>
    `;
  },
  createRoom() { const code = Math.random().toString(36).slice(2, 8).toUpperCase(); this.switchRoom(code); Toast.show(`Private Room ${code} created!`, 'success'); },
  joinRoom() { const code = el('join-room-code')?.value.trim().toUpperCase(); if (!code) return Toast.show('Enter a code', 'error'); this.switchRoom(code); },
  switchRoom(code) { App.state.currentRoom = code; App.state.players = []; App.state.auctionRooms = []; App.state.tournaments = []; App.state.matches = []; App.initLiveSync(); navigate('home'); Toast.show(code === 'public' ? 'Returned to Global Hub' : `Joined Private Hub: ${code}`, 'success'); }
};

const MyProfile = {
  render() {
    const player = App.state.players.find(p => p.id === App.state.myPlayerId);
    let content = !player ? `
        <div class="empty-state"><div class="empty-icon">👤</div><div class="empty-title">Profile Not Linked</div><div class="empty-desc">Link a registered player profile to track your stats.</div>
            <div class="form-group" style="width: 100%; max-width: 300px; margin: 1.5rem auto 0;"><select class="form-select" id="link-player-select"><option value="">-- Select Your Player Profile --</option>${App.state.players.map(p => `<option value="${p.id}">${escHtml(p.name)} (${escHtml(p.role)})</option>`).join('')}</select><button class="btn btn-primary btn-full mt-2" onclick="MyProfile.linkProfile()">Link Profile</button></div>
        </div>` : `
        <div class="card" style="position: relative; overflow: hidden;">
            <div style="background: linear-gradient(135deg, var(--surface-3) 0%, var(--surface-1) 100%); padding: 3rem 1.5rem; text-align: center; border-bottom: 1px solid var(--border);">
                <div style="margin-bottom: 1rem; display:flex; justify-content:center;">${renderAvatar(player.photo, '5rem')}</div>
                <h1 style="font-size: 2.2rem; font-weight: 900;">${escHtml(player.name)}</h1><div style="color: var(--gold); font-weight: 700; font-size: 1.1rem; margin-top: 0.5rem;">${escHtml(player.role).toUpperCase()}</div><button class="btn btn-outline btn-sm mt-3" onclick="MyProfile.unlinkProfile()">Unlink Profile</button>
            </div>
            <div style="padding: 2rem;">
                <h3 style="margin-bottom: 1.5rem; font-weight: 800; border-left: 4px solid var(--gold); padding-left: 0.75rem;">Lifetime Statistics</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 1rem;">
                    ${[['Matches', player.stats.matches], ['Total Runs', player.stats.runs], ['Wickets', player.stats.wickets], ['Sixes', player.stats.sixes], ['Fours', player.stats.fours], ['Avg SR', player.stats.runs && player.stats.matches ? ((player.stats.runs / (player.stats.matches || 1))).toFixed(1) : '0'], ['High Score', player.stats.highScore], ['Fifties', player.stats.fifties], ['Hundreds', player.stats.hundreds], ['Fantasy Pts', player.stats.fantasyPoints]].map(([l, v]) => `<div style="background:var(--surface-2); border-radius:var(--radius-md); padding:1.2rem; text-align:center; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"><div style="font-size:1.8rem; font-weight:900; color:var(--text); font-family:'Roboto Mono',monospace;">${v || 0}</div><div style="font-size:0.75rem; color:var(--text-2); margin-top:0.4rem; text-transform: uppercase; font-weight: 700;">${l}</div></div>`).join('')}
                </div>
            </div>
        </div>`;
    el('section-profile').innerHTML = `<div class="container"><div class="section-header"><div><h1 class="section-title"><span class="icon">📈</span> Personal Dashboard</h1></div></div>${content}</div>`;
  },
  linkProfile() { const id = el('link-player-select')?.value; if (!id) return Toast.show('Select a player', 'error'); App.state.myPlayerId = id; localStorage.setItem(`ch_linked_${App.state.currentUser}`, id); Toast.show('Profile linked!', 'success'); this.render(); },
  unlinkProfile() { App.state.myPlayerId = null; localStorage.removeItem(`ch_linked_${App.state.currentUser}`); this.render(); }
};

/* ============================================================
   UTILITIES & NAVIGATION
   ============================================================ */
App.channel = (() => { try { return new BroadcastChannel('cricket-hub'); } catch (e) { return { postMessage: () => { }, onmessage: null }; } })();
const uid = () => Math.random().toString(36).slice(2, 10);
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const fmt = (n) => (n || 0).toLocaleString('en-IN');
const now = () => new Date().toISOString();
const dateStr = (d) => { const dt = new Date(d); return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); };
const timeStr = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
function el(id) { return document.getElementById(id); }
function escHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const renderAvatar = (photoStr, size = '2.8rem') => {
  if (photoStr && photoStr.startsWith('http')) return `<img src="${escHtml(photoStr)}" style="width:${size};height:${size};object-fit:cover;border-radius:50%;border:2px solid var(--surface-3);">`;
  return `<span style="font-size:${size}; display:inline-block;">${photoStr || '🏏'}</span>`;
};

const Toast = { show(msg, type = 'default', duration = 3500) { const tc = el('toast-container'); const div = document.createElement('div'); div.className = `toast ${type}`; div.innerHTML = `<span class="toast-msg">${escHtml(msg)}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`; tc.prepend(div); setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 300); }, duration); } };
const Modal = { open(html, title = '') { el('modal-body').innerHTML = (title ? `<h2 class="modal-title">${escHtml(title)}</h2>` : '') + html; el('modal-overlay').classList.add('active'); }, close() { el('modal-overlay').classList.remove('active'); el('modal-body').innerHTML = ''; } };

function navigate(route) {
  App.state.activeRoute = route;
  document.querySelectorAll('.section, .nav-link, .mobile-nav-link').forEach(s => s.classList.remove('active'));
  const sec = el(`section-${route}`); if (sec) sec.classList.add('active');
  const navLink = el(`nav-${route}`); if (navLink) navLink.classList.add('active');
  document.querySelectorAll(`[data-route="${route}"]`).forEach(a => a.classList.add('active'));
  el('mobile-nav').classList.remove('open');
  const renderers = { home: Home, players: Players, auction: Auction, tournament: Tournament, quickmatch: QuickMatch, scores: Scores, stats: Stats, room: RoomManager, profile: MyProfile };
  if (renderers[route]) renderers[route].render();
  window.scrollTo(0, 0);
}

/* ============================================================
   HOME & CORE MODULES
   ============================================================ */
const Home = {
  render() {
    const s = App.state; const isPublic = s.currentRoom === 'public'; const liveMatches = s.matches.filter(m => m.status === 'live');
    const doneMatches = s.matches.filter(m => m.status === 'completed').slice(-5).reverse();
    const canEdit = hasEditAccess();

    // Display all Quick Actions so they are easily accessible from Home
    el('section-home').innerHTML = `
    <div class="hero"><div class="hero-content">
        <div class="hero-badge">🏏 ${isPublic ? 'GLOBAL PUBLIC HUB' : `PRIVATE HUB: ${s.currentRoom}`}</div>
        <h1 class="hero-title">Where Cricket<br><span class="accent">Legends</span> Are Made</h1>
        <p class="hero-desc">Follow live ball-by-ball scores, tournaments, and real-time auctions.</p>
        ${canEdit ? `
        <div class="hero-actions">
            <button class="btn btn-primary btn-lg" onclick="navigate('players')">👤 Register Player</button>
            <button class="btn btn-outline btn-lg" onclick="navigate('quickmatch')">⚡ Quick Match</button>
            <button class="btn btn-ghost btn-lg" onclick="navigate('auction')">🔨 Start Auction</button>
        </div>` : '<p style="color:var(--text-2); margin-bottom: 2rem;">Viewing in Viewer Mode. Log in as admin to make changes.</p>'}
    </div></div>
    <div class="container">
      <div class="section-header mt-3"><h2 class="section-title">Navigation Hub</h2></div>
      <div class="home-grid">
        <div class="quick-action-card" onclick="navigate('room')"><div class="qa-icon">🏠</div><div class="qa-title">Hub Manager</div><div class="qa-desc">Switch between Public and Private rooms.</div></div>
        <div class="quick-action-card" onclick="navigate('profile')"><div class="qa-icon">👤</div><div class="qa-title">My Profile</div><div class="qa-desc">View your personal linked career stats.</div></div>
        <div class="quick-action-card" onclick="navigate('scores')"><div class="qa-icon">📊</div><div class="qa-title">Live Scores</div><div class="qa-desc">Watch real-time ball-by-ball updates.</div></div>
        <div class="quick-action-card" onclick="navigate('tournament')"><div class="qa-icon">🏆</div><div class="qa-title">Tournaments</div><div class="qa-desc">Organize and view schedules & standings.</div></div>
        <div class="quick-action-card" onclick="navigate('auction')"><div class="qa-icon">🔨</div><div class="qa-title">Auctions</div><div class="qa-desc">Join or view live IPL-style bidding rooms.</div></div>
        <div class="quick-action-card" onclick="navigate('stats')"><div class="qa-icon">📈</div><div class="qa-title">Stats Hub</div><div class="qa-desc">Leaderboards and awards.</div></div>
      </div>

      ${liveMatches.length ? `<div class="section-header mt-3"><h2 class="section-title">🔴 Live Now</h2></div>${liveMatches.map(m => Tournament.matchRow(m)).join('')}` : ''}
      ${doneMatches.length ? `<div class="section-header mt-4"><h2 class="section-title">📋 Recent Results</h2></div>${doneMatches.map(m => Tournament.matchRow(m)).join('')}` : ''}
      
      <div style="text-align:center; margin-top: 3rem;">
         <div style="font-size:0.8rem; color:var(--text-3); margin-bottom: 0.5rem;">Logged in as: ${App.state.currentUser}</div>
         <button class="btn btn-outline btn-sm" onclick="AuthUI.logout()">Logout</button>
      </div>
    </div>`;
    updateLivePill();
  }
};

function updateLivePill() { const liveCount = App.state.matches.filter(m => m.status === 'live').length; const pill = el('live-pill'); if (pill) pill.style.display = liveCount > 0 ? 'flex' : 'none'; if (el('live-count')) el('live-count').textContent = liveCount; }

/* ============================================================
   PLAYERS
   ============================================================ */
const Players = {
  filter: { role: 'all', search: '', sort: 'name' },
  render() { el('section-players').innerHTML = `<div class="container"><div class="section-header"><div><h1 class="section-title">👤 Players Registry</h1><div class="section-subtitle">${App.state.players.length} players registered</div></div>${hasEditAccess() ? `<button class="btn btn-primary" onclick="Players.openRegister()">+ Register Player</button>` : ''}</div><div class="search-bar"><div class="search-input-wrap"><span class="search-icon">🔍</span><input class="search-input" id="player-search" placeholder="Search by name…" oninput="Players.applyFilter()" value="${escHtml(this.filter.search)}"></div></div><div class="grid-3" id="players-grid"></div></div>`; this.renderGrid(); },
  applyFilter() { this.filter.search = el('player-search')?.value || ''; this.renderGrid(); },
  renderGrid() {
    const grid = el('players-grid'); if (!grid) return;
    let list = [...App.state.players];
    if (this.filter.search) { const q = this.filter.search.toLowerCase(); list = list.filter(p => (p.name || '').toLowerCase().includes(q)); }
    grid.innerHTML = list.length ? list.map(p => `<div class="player-card" onclick="Players.viewPlayer('${p.id}')"><div class="player-card-header"><div style="width:45px; height:45px;">${renderAvatar(p.photo, '100%')}</div><span class="player-card-status status-${p.status || 'available'}">${p.status || 'Available'}</span></div><div class="player-card-body"><div class="player-name">${escHtml(p.name)}</div><div class="player-role">${escHtml(p.role || '')}</div></div></div>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👤</div><div class="empty-title">No players found</div></div>`;
  },
  openRegister() { if (hasEditAccess()) Modal.open(`<h2 class="modal-title">👤 Register Player</h2><div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="p-name"></div><div class="form-group"><label class="form-label">Role *</label><select class="form-select" id="p-role"><option>Batsman</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option></select></div><div class="form-group"><label class="form-label">Photo URL (Optional image link)</label><input type="url" class="form-input" id="p-photo" placeholder="https://example.com/photo.jpg"></div><div class="form-hint" style="margin-bottom:1rem;">Leave blank to use default emoji avatar.</div><button class="btn btn-primary btn-full" onclick="Players.register()">Register</button>`); },
  register() { if (!hasEditAccess()) return; const name = el('p-name')?.value?.trim(); if (!name) return Toast.show('Name is required', 'error'); const photoUrl = el('p-photo')?.value?.trim(); App.state.players.push({ id: uid(), name, role: el('p-role')?.value, photo: photoUrl || '🏏', status: 'available', registeredAt: now(), stats: { matches: 0, runs: 0, wickets: 0, sixes: 0, fours: 0, highScore: 0, fifties: 0, hundreds: 0, ducks: 0, fantasyPoints: 0 }, form: [] }); App.save(); Modal.close(); this.render(); Toast.show('Player added!', 'success'); },
  viewPlayer(id) { const p = App.state.players.find(x => x.id === id); if (!p) return; Modal.open(`<div style="text-align:center"><div style="display:flex; justify-content:center; margin-bottom:1rem;">${renderAvatar(p.photo, '5rem')}</div><h2>${escHtml(p.name)}</h2><div style="color:var(--gold)">${escHtml(p.role)}</div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1.5rem;text-align:center">${[['Matches', p.stats.matches], ['Runs', p.stats.runs], ['Wkts', p.stats.wickets], ['High Score', p.stats.highScore]].map(([l, v]) => `<div style="background:var(--surface-2);padding:1rem;border-radius:8px"><div style="font-size:1.5rem;font-weight:800;color:var(--gold)">${v || 0}</div><div style="font-size:0.75rem">${l}</div></div>`).join('')}</div>`); }
};

/* ============================================================
   AUCTION
   ============================================================ */
const Auction = {
  render() { el('section-auction').innerHTML = `<div class="container"><div class="section-header"><div><h1 class="section-title">🔨 Auctions</h1></div>${hasEditAccess() ? `<button class="btn btn-primary" onclick="Auction.openCreate()">+ Create Room</button>` : ''}</div><div class="grid-2" id="auction-grid"></div></div>`; this.renderRooms(); },
  renderRooms() { const grid = el('auction-grid'); if (!grid) return; grid.innerHTML = App.state.auctionRooms.length ? App.state.auctionRooms.map(r => `<div class="room-card" onclick="Auction.openRoom('${r.id}')"><h3>${escHtml(r.name)}</h3><div class="room-code">${r.code}</div></div>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">No Rooms</div></div>`; },
  openCreate() { if (hasEditAccess()) Modal.open(`<h2 class="modal-title">🔨 Create Room</h2><div class="form-group"><label>Room Name</label><input class="form-input" id="r-name"></div><div class="form-group"><label>Your Team Name</label><input class="form-input" id="r-team"></div><button class="btn btn-primary btn-full" onclick="Auction.createRoom()">Create</button>`); },
  createRoom() { if (!hasEditAccess()) return; const name = el('r-name')?.value; const team = el('r-team')?.value; if (!name || !team) return; App.state.auctionRooms.push({ id: uid(), name, code: roomCode(), status: 'open', teams: [{ name: team, budget: 10000, players: [], spent: 0 }], playerIds: App.state.players.map(p => p.id), playerQueue: App.state.players.map(p => p.id), bids: [], soldLog: [], createdAt: now() }); App.save(); Modal.close(); this.render(); Toast.show('Room created', 'success'); },
  openRoom(id) { const room = App.state.auctionRooms.find(r => r.id === id); if (!room) return; Modal.open(`<h2>${escHtml(room.name)}</h2><div class="room-code">${room.code}</div><p style="margin-top:1rem;color:var(--text-3)">Bidding Engine Active.</p>`); }
};

/* ============================================================
   TOURNAMENT (WITH NRR AND AUCTION IMPORT)
   ============================================================ */
const Tournament = {
  render() { el('section-tournament').innerHTML = `<div class="container"><div class="section-header"><div><h1 class="section-title">🏆 Tournaments</h1></div>${hasEditAccess() ? `<button class="btn btn-primary" onclick="Tournament.openCreate()">+ New Tournament</button>` : ''}</div><div class="grid-2" id="tourn-grid"></div></div>`; this.renderGrid(); },
  renderGrid() { const grid = el('tourn-grid'); if (!grid) return; grid.innerHTML = App.state.tournaments.length ? App.state.tournaments.map(t => `<div class="tournament-card" onclick="Tournament.openDetail('${t.id}')"><h3>${escHtml(t.name)}</h3><span class="format-badge format-${t.format}">${t.format}</span></div>`).join('') : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">No Tournaments</div></div>`; },

  openCreate() {
    if (!hasEditAccess()) return;
    const rooms = App.state.auctionRooms.filter(r => r.status === 'completed' || r.status === 'active' || r.status === 'open');
    const auctionOptions = rooms.map(r => `<option value="${r.id}">Import Teams from Auction: ${escHtml(r.name)}</option>`).join('');
    Modal.open(`
      <h2 class="modal-title">🏆 New Tournament</h2>
      <div class="form-group"><label>Name</label><input class="form-input" id="t-name"></div>
      <div class="form-group"><label>Format</label><select class="form-select" id="t-format"><option>T20</option><option>ODI</option></select></div>
      
      <div class="form-group"><label>Team Selection Method</label>
        <select class="form-select" id="t-source" onchange="document.getElementById('t-direct').style.display = this.value === 'direct' ? 'block' : 'none';">
            <option value="direct">Manual (Enter Teams Direct)</option>
            ${auctionOptions}
        </select>
      </div>
      <div id="t-direct" class="form-group"><label>Teams (comma separated)</label><textarea class="form-textarea" id="t-teams" placeholder="Team A, Team B, Team C"></textarea></div>
      <button class="btn btn-primary btn-full" onclick="Tournament.create()">Create & Generate Schedule</button>`);
  },

  create() {
    if (!hasEditAccess()) return;
    const name = el('t-name')?.value;
    const src = el('t-source')?.value;
    let teams = [];

    if (src === 'direct') {
      teams = (el('t-teams')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    } else {
      const room = App.state.auctionRooms.find(r => r.id === src);
      if (room && room.teams) teams = room.teams.map(t => t.name);
    }

    if (!name || teams.length < 2) return Toast.show('Name and at least 2 teams required', 'error');

    const tourn = {
      id: uid(), name, format: el('t-format').value, overs: 20, teams,
      standings: teams.map(t => ({ team: t.trim(), played: 0, won: 0, lost: 0, points: 0, nrr: '0.000', runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0 }))
    };
    App.state.tournaments.push(tourn);

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        App.state.matches.push({ id: uid(), tournamentId: tourn.id, team1: teams[i], team2: teams[j], format: tourn.format, overs: tourn.overs, status: 'upcoming', date: now() });
      }
    }

    App.save(); Modal.close(); this.render(); Toast.show('Tournament created!', 'success');
  },

  openDetail(id) {
    const t = App.state.tournaments.find(x => x.id === id); if (!t) return;
    const matches = App.state.matches.filter(m => m.tournamentId === id);
    Modal.open(`
      <h2>${escHtml(t.name)}</h2>
      <div class="tabs" style="margin: 1rem 0;"><div class="tab active" onclick="Tournament.switchTab(this,'t-sch')">Schedule</div><div class="tab" onclick="Tournament.switchTab(this,'t-std')">Points Table</div></div>
      <div id="t-sch">
        <div style="margin-top:1rem">${matches.map(m => this.matchRow(m)).join('') || '<p>No matches yet</p>'}</div>
        ${hasEditAccess() ? `<button class="btn btn-outline btn-full mt-2" onclick="Tournament.addMatch('${id}')">+ Add Custom Match</button>` : ''}
      </div>
      <div id="t-std" style="display:none;">${this.standingsTable(t)}</div>
      `);
  },
  switchTab(btn, showId) { btn.closest('.modal-body')?.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); btn.classList.add('active');['t-sch', 't-std'].forEach(id => { const e = el(id); if (e) e.style.display = id === showId ? 'block' : 'none'; }); },

  standingsTable(t) {
    const rows = [...(t.standings || [])].sort((a, b) => b.points - a.points || parseFloat(b.nrr) - parseFloat(a.nrr));
    return `<div class="table-wrap"><table class="points-table" style="width:100%; text-align:left; border-collapse: collapse;">
      <thead style="background:var(--surface-3); font-size:0.8rem; color:var(--text-3);"><tr><th style="padding:8px">Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr></thead>
      <tbody>
      ${rows.map(r => `<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px; font-weight:700">${escHtml(r.team)}</td>
        <td>${r.played}</td><td style="color:var(--green)">${r.won}</td><td style="color:var(--red-2)">${r.lost}</td>
        <td style="font-weight:800;color:var(--gold)">${r.points}</td>
        <td style="font-family:monospace; color:${parseFloat(r.nrr) >= 0 ? 'var(--green)' : 'var(--red-2)'}">${r.nrr}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>`;
  },

  updateStandings(matchId) {
    const m = App.state.matches.find(x => x.id === matchId);
    if (!m || !m.tournamentId) return;
    const t = App.state.tournaments.find(x => x.id === m.tournamentId);
    if (!t) return;

    const getRow = (team) => { let r = t.standings.find(s => s.team === team); if (!r) { r = { team, played: 0, won: 0, lost: 0, points: 0, nrr: '0.000', runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0 }; t.standings.push(r); } return r; };
    const r1 = getRow(m.team1); const r2 = getRow(m.team2);

    r1.played++; r2.played++;
    const inn1 = m.innings?.[0]; const inn2 = m.innings?.[1];
    const calcOvers = (balls) => Math.floor(balls / 6) + ((balls % 6) / 6);

    if (inn1) {
      r1.runsFor += inn1.total || 0; r1.oversFor += calcOvers(inn1.balls || 0) || 1;
      r2.runsAgainst += inn1.total || 0; r2.oversAgainst += calcOvers(inn1.balls || 0) || 1;
    }
    if (inn2) {
      r2.runsFor += inn2.total || 0; r2.oversFor += calcOvers(inn2.balls || 0) || 1;
      r1.runsAgainst += inn2.total || 0; r1.oversAgainst += calcOvers(inn2.balls || 0) || 1;
    }

    if (m.winner === m.team1) { r1.won++; r1.points += 2; r2.lost++; }
    else if (m.winner === m.team2) { r2.won++; r2.points += 2; r1.lost++; }
    else { r1.points++; r2.points++; }

    const calculateNRR = (r) => { const nrr = (r.runsFor / (r.oversFor || 1)) - (r.runsAgainst / (r.oversAgainst || 1)); return isNaN(nrr) ? '0.000' : (nrr > 0 ? '+' : '') + nrr.toFixed(3); };
    r1.nrr = calculateNRR(r1); r2.nrr = calculateNRR(r2);
  },

  addMatch(id) { if (!hasEditAccess()) return; const t = App.state.tournaments.find(x => x.id === id); if (!t) return; App.state.matches.push({ id: uid(), tournamentId: id, team1: t.teams[0], team2: t.teams[1], format: t.format, overs: t.overs, status: 'upcoming', date: now() }); App.save(); Modal.close(); this.openDetail(id); },
  matchRow(m) { const isUp = m.status === 'upcoming'; const click = hasEditAccess() ? (isUp ? `Tournament.startMatch('${m.id}')` : `QuickMatch.openScoring('${m.id}')`) : (isUp ? '' : `Scores.viewScorecard('${m.id}')`); return `<div class="match-row" ${click ? `onclick="${click}"` : ''}><div class="match-teams-row"><span class="match-team-name">${escHtml(m.team1)}</span> <span class="match-vs">vs</span> <span class="match-team-name">${escHtml(m.team2)}</span></div><span class="match-status-badge match-${m.status === 'live' ? 'live' : isUp ? 'upcoming' : 'done'}">${m.status.toUpperCase()}</span></div>`; },
  startMatch(id) { if (!hasEditAccess()) return; const m = App.state.matches.find(x => x.id === id); if (!m) return; m.status = 'live'; m.innings = [{ battingTeam: m.team1, bowlingTeam: m.team2, batting: Array.from({ length: 11 }, (_, i) => ({ name: `${m.team1} P${i + 1}`, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, notout: true })), bowling: Array.from({ length: 11 }, (_, i) => ({ name: `${m.team2} P${i + 1}`, overs: 0, overBalls: 0, runs: 0, wickets: 0, maidens: 0 })), total: 0, wickets: 0, balls: 0, overs: 0, extras: { wide: 0, noBall: 0, bye: 0, legBye: 0 }, fallOfWickets: [], currentOver: [], striker: 0, nonStriker: 1, bowlerIdx: 0 }]; m.currentInnings = 0; m.commentary = []; App.save(); Modal.close(); QuickMatch.openScoring(id); }
};

/* ============================================================
   STATS & SCORES
   ============================================================ */
const Stats = { render() { el('section-stats').innerHTML = `<div class="container"><div class="section-header"><h1 class="section-title">📈 Stats Hub</h1></div><div class="empty-state">Stats populate globally after matches.</div></div>`; } };
const Scores = { render() { el('section-scores').innerHTML = `<div class="container"><div class="section-header"><h1 class="section-title">📊 Live Scorecards</h1></div><div class="grid-2">${App.state.matches.map(m => Tournament.matchRow(m)).join('')}</div></div>`; }, viewScorecard(id) { const m = App.state.matches.find(x => x.id === id); if (!m) return; Modal.open(`<h2>${m.team1} vs ${m.team2}</h2><div style="font-size:2rem; font-weight:800; color:var(--gold); margin:1rem 0;">${m.innings?.[0]?.total || 0}/${m.innings?.[0]?.wickets || 0}</div><div style="color:var(--text-2)">${m.result || 'Live'}</div>${hasEditAccess() && m.status === 'live' ? `<button class="btn btn-primary mt-2" onclick="Modal.close();QuickMatch.openScoring('${id}')">Score Match</button>` : ''}`); } };

/* ============================================================
   QUICK MATCH & SCORING ENGINE (WITH UNDO AND BROADCAST UI)
   ============================================================ */
const QuickMatch = {
  render() {
    const matches = App.state.matches.filter(m => !m.tournamentId);
    el('section-quickmatch').innerHTML = `<div class="container"><div class="section-header"><div><h1 class="section-title"><span class="icon">⚡</span> Match Center</h1></div>${hasEditAccess() ? `<button class="btn btn-primary" onclick="QuickMatch.openCreate()">+ New Match</button>` : ''}</div><div class="grid-2" id="qm-grid"></div></div>`;
    const grid = el('qm-grid');
    if (grid) grid.innerHTML = matches.length ? matches.map(m => Tournament.matchRow(m)).join('') : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-title">No Matches</div></div>`;
  },

  openCreate() { if (hasEditAccess()) Tournament.openAddMatch(); },

  openScoring(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    App.state.activeScoringMatchId = matchId;
    if (match.status === 'completed') { Scores.viewScorecard(matchId); return; }
    el('scoring-overlay').classList.add('active');
    this.renderScoringPanel(matchId);
  },

  closeScoring() { el('scoring-overlay').classList.remove('active'); App.state.activeScoringMatchId = null; },

  saveSnapshot(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    if (!match.history) match.history = [];
    if (match.history.length > 20) match.history.shift();
    match.history.push({
      innings: JSON.parse(JSON.stringify(match.innings)),
      commentary: JSON.parse(JSON.stringify(match.commentary || [])),
      currentInnings: match.currentInnings,
      status: match.status
    });
  },

  undoLast(matchId) {
    if (!hasEditAccess()) return;
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match || !match.history || match.history.length === 0) return Toast.show('No previous actions to undo!', 'error');

    const lastState = match.history.pop();
    match.innings = lastState.innings;
    match.commentary = lastState.commentary;
    match.currentInnings = lastState.currentInnings;
    match.status = lastState.status;

    App.save(); App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } });
    this.renderScoringPanel(matchId);
    Toast.show('Undo successful. Restored previous ball state.', 'info');
  },

  promptExtra(matchId, type) {
    if (!hasEditAccess()) return;
    const labels = { wide: 'Wide', noball: 'No Ball', bye: 'Byes', legbye: 'Leg Byes' };
    let html = `<h2 class="modal-title">🏏 Add ${labels[type]}</h2>`;

    if (type === 'noball') {
      html += `<p style="margin-bottom:1rem;color:var(--text-2)">How many runs off the bat?</p><div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.5rem;">${[0, 1, 2, 3, 4, 6].map(r => `<button class="btn btn-outline" style="height:3.5rem;font-size:1.2rem;font-weight:800;" onclick="QuickMatch.processExtra('${matchId}','${type}',${r})">${r}</button>`).join('')}</div>`;
    } else if (type === 'wide') {
      html += `<p style="margin-bottom:1rem;color:var(--text-2)">Total wide runs (including any byes to boundary)?</p><div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.5rem;">${[1, 2, 3, 4, 5].map(r => `<button class="btn btn-outline" style="height:3.5rem;font-size:1.2rem;font-weight:800;" onclick="QuickMatch.processExtra('${matchId}','${type}',${r})">${r}</button>`).join('')}</div>`;
    } else {
      html += `<p style="margin-bottom:1rem;color:var(--text-2)">How many ${labels[type]} run?</p><div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:0.5rem;">${[1, 2, 3, 4].map(r => `<button class="btn btn-outline" style="height:3.5rem;font-size:1.2rem;font-weight:800;" onclick="QuickMatch.processExtra('${matchId}','${type}',${r})">${r}</button>`).join('')}</div>`;
    }
    Modal.open(html);
  },

  processExtra(matchId, type, extraValue) {
    Modal.close(); this.saveSnapshot(matchId);
    const match = App.state.matches.find(m => m.id === matchId);
    const inn = match.innings[match.currentInnings];
    const striker = inn.batting[inn.striker];
    const bowler = inn.bowling[inn.bowlerIdx];

    let runsToAddTotal = 0; let runsToBatsman = 0; let runsToBowler = 0; let ballValid = true;

    if (type === 'noball') { runsToAddTotal = extraValue + 1; runsToBatsman = extraValue; runsToBowler = extraValue + 1; inn.extras.noBall += 1; ballValid = false; }
    else if (type === 'wide') { runsToAddTotal = extraValue; runsToBowler = extraValue; inn.extras.wide += extraValue; ballValid = false; }
    else if (type === 'bye') { runsToAddTotal = extraValue; inn.extras.bye += extraValue; }
    else if (type === 'legbye') { runsToAddTotal = extraValue; inn.extras.legBye += extraValue; }

    inn.total += runsToAddTotal;

    if (striker) {
      striker.runs += runsToBatsman;
      if (type === 'noball' && extraValue === 4) striker.fours++;
      if (type === 'noball' && extraValue === 6) striker.sixes++;
      if (ballValid || type === 'noball') striker.balls++;
    }

    if (bowler) { bowler.runs += runsToBowler; if (ballValid) bowler.overBalls++; }

    inn.currentOver.push({ runs: runsToAddTotal, type: type, wicket: false });
    if (ballValid) inn.balls++;

    let runsRun = (type === 'noball') ? extraValue : extraValue;
    if (runsRun % 2 === 1) this.swapStrike(inn);

    match.commentary = match.commentary || [];
    match.commentary.push({ over: `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`, text: `${type.toUpperCase()}! ${runsToAddTotal} runs added to total.` });

    this.checkOverEnd(inn, bowler); App.save(); App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } }); this.renderScoringPanel(matchId);
  },

  addBall(matchId, runs) {
    if (!hasEditAccess()) return;
    this.saveSnapshot(matchId);

    const match = App.state.matches.find(m => m.id === matchId);
    const inn = match.innings[match.currentInnings];
    const striker = inn.batting[inn.striker];
    const bowler = inn.bowling[inn.bowlerIdx];

    inn.total += runs;
    if (striker) { striker.runs += runs; striker.balls++; if (runs === 4) striker.fours++; if (runs === 6) striker.sixes++; }
    if (bowler) { bowler.runs += runs; bowler.overBalls++; }

    inn.balls++;
    inn.currentOver.push({ runs, type: 'run', wicket: false });
    if (runs % 2 === 1) this.swapStrike(inn);

    match.commentary = match.commentary || [];
    match.commentary.push({ over: `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`, text: `Clean strike. ${runs} run${runs !== 1 ? 's' : ''} taken.` });

    this.checkOverEnd(inn, bowler); App.save(); App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } }); this.renderScoringPanel(matchId);
  },

  addWicket(matchId) {
    if (!hasEditAccess()) return;
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    if (match.innings[match.currentInnings].wickets >= 10) return Toast.show('All out!', 'error');

    Modal.open(`
      <h2 class="modal-title">🎳 Wicket!</h2>
      <div class="form-group"><label class="form-label">Dismissal Type</label><select class="form-select" id="w-type"><option>Caught</option><option>Bowled</option><option>LBW</option><option>Run Out</option></select></div>
      <div class="form-group"><label class="form-label">Runs completed before wicket?</label><input class="form-input" type="number" id="w-runs" value="0" min="0" max="6"></div>
      <button class="btn btn-red btn-full" onclick="QuickMatch.confirmWicket('${matchId}')">Confirm Wicket</button>
    `);
  },

  confirmWicket(matchId) {
    if (!hasEditAccess()) return;
    this.saveSnapshot(matchId);

    const match = App.state.matches.find(m => m.id === matchId);
    const inn = match.innings[match.currentInnings];
    const type = el('w-type')?.value; const runs = +(el('w-runs')?.value || 0);
    const striker = inn.batting[inn.striker]; const bowler = inn.bowling[inn.bowlerIdx];

    if (striker) { striker.out = true; striker.how = type; striker.runs += runs; striker.balls++; }
    if (bowler && type !== 'Run Out') bowler.wickets++;
    if (bowler) { bowler.runs += runs; bowler.overBalls++; }

    inn.wickets++; inn.balls++; inn.total += runs;
    inn.currentOver.push({ runs, type: 'run', wicket: true });

    const newBatIdx = inn.wickets + 1;
    if (inn.batting[newBatIdx]) inn.striker = newBatIdx;

    match.commentary = match.commentary || []; match.commentary.push({ over: `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`, text: `OUT! ${striker.name} departs via ${type}.` });

    this.checkOverEnd(inn, bowler); App.save(); App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } }); Modal.close(); this.renderScoringPanel(matchId);
  },

  swapStrike(inn) { const s = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = s; },
  checkOverEnd(inn, bowler) { if (inn.balls % 6 === 0 && inn.balls > 0) { inn.overs = Math.floor(inn.balls / 6); if (bowler) { bowler.overs++; bowler.overBalls = 0; } inn.currentOver = []; this.swapStrike(inn); } },

  renderScoringPanel(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const ci = match.currentInnings || 0; const inn = match.innings?.[ci];
    if (!inn) return;

    const striker = inn.batting?.[inn.striker || 0]; const nonStriker = inn.batting?.[inn.nonStriker || 1]; const bowler = inn.bowling?.[inn.bowlerIdx || 0];
    const overs = Math.floor((inn.balls || 0) / 6); const ballsInOver = (inn.balls || 0) % 6;
    const runsInOver = (inn.currentOver || []).reduce((a, b) => a + (b.runs || 0), 0);
    const target = ci === 1 ? (match.innings?.[0]?.total || 0) + 1 : null;

    const panel = el('scoring-panel');
    panel.innerHTML = `
    <!-- Broadcast Scorecard (Safely styled inline) -->
    <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <span class="live-badge" style="margin-bottom: 0.5rem;"><span class="pulse-dot"></span>LIVE</span>
                <div style="font-size:1.1rem; color:var(--text-2); font-weight:600;">${escHtml(match.team1)} vs ${escHtml(match.team2)}</div>
                <div style="font-size:4rem; font-weight:900; color:white; font-family:'Roboto Mono', monospace; line-height: 1;">${inn.total || 0}<span style="font-size:2rem; color:var(--text-3)">/${inn.wickets || 0}</span></div>
                <div style="font-size:1rem; color:var(--gold); margin-top:0.5rem; font-weight: 700;">Overs: ${overs}.${ballsInOver} <span style="color:var(--text-3); margin: 0 8px;">|</span> CRR: ${inn.balls ? ((inn.total || 0) / (inn.balls / 6)).toFixed(2) : '0.00'} ${target ? `<span style="color:var(--text-3); margin: 0 8px;">|</span> Target: <span style="color:var(--red-2)">${target}</span>` : ''}</div>
            </div>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,0.1); color:white;" onclick="QuickMatch.closeScoring()">✕ Close</button>
        </div>
        <div style="margin-top: 1.5rem; background: rgba(0,0,0,0.3); padding: 0.75rem; border-radius: 8px;">
            <div style="font-size:0.75rem; color:var(--text-3); text-transform:uppercase; font-weight:800; margin-bottom:0.5rem; letter-spacing:1px;">This Over (${runsInOver} Runs)</div>
            <div style="display:flex; gap: 8px; overflow-x:auto; padding-bottom: 4px;">
                ${(inn.currentOver || []).map(b => {
      const cls = b.wicket ? '#ef4444' : (b.runs >= 4 ? '#f59e0b' : '#334155');
      const label = b.wicket ? 'W' : (b.type !== 'run' ? b.type.substring(0, 2).toUpperCase() : b.runs);
      return `<div style="min-width: 32px; height: 32px; border-radius: 50%; background: ${cls}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.85rem; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${label}</div>`;
    }).join('')}
            </div>
        </div>
    </div>

    <!-- Batsman/Bowler Stats -->
    <div style="display: grid; grid-template-columns: 1fr; gap: 1rem; margin-bottom: 1.5rem;">
        <div style="background: var(--surface-2); border-radius: 12px; padding: 1.25rem; border-left: 4px solid var(--gold);">
            <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);">
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--gold);">🏏 ${escHtml(striker?.name || 'Striker')} <span style="font-size:0.7rem; color:var(--text-3)">(Striker)</span></div>
                <div style="font-family:'Roboto Mono', monospace; font-size: 1.4rem; font-weight: 800;">${striker?.runs || 0}<span style="font-size:0.9rem; color:var(--text-3)"> (${striker?.balls || 0})</span></div>
            </div>
            <div style="display:flex; justify-content: space-between; align-items:center;">
                <div style="font-weight: 600; font-size: 0.95rem; color: var(--text-2);">${escHtml(nonStriker?.name || 'Non-Striker')}</div>
                <div style="font-family:'Roboto Mono', monospace; font-size: 0.95rem; color: var(--text-2);">${nonStriker?.runs || 0} (${nonStriker?.balls || 0})</div>
            </div>
        </div>
        <div style="background: var(--surface-2); border-radius: 12px; padding: 1.25rem; border-left: 4px solid var(--green);">
            <div style="display:flex; justify-content: space-between; align-items:center;">
                <div style="font-weight: 800; font-size: 1.1rem; color: var(--green);">🎳 ${escHtml(bowler?.name || 'Bowler')}</div>
                <div style="font-family:'Roboto Mono', monospace; font-size: 1.2rem; font-weight: 800; color: var(--text);">${bowler?.overs || 0}-${bowler?.maidens || 0}-${bowler?.runs || 0}-<span style="color:var(--red-2)">${bowler?.wickets || 0}</span></div>
            </div>
        </div>
    </div>

    <!-- Controls Panel -->
    ${hasEditAccess() ? `
    <div style="font-size:0.8rem; font-weight:800; color:var(--text-3); text-transform:uppercase; margin-bottom:0.5rem; letter-spacing:1px;">Runs off Bat</div>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 1rem;">
      ${[0, 1, 2, 3, 4, 6].map(v => `<button class="btn btn-outline" style="font-size:1.2rem; font-weight:900; height: 3.5rem; ${v === 4 || v === 6 ? 'border-color:var(--gold); color:var(--gold)' : ''}" onclick="QuickMatch.addBall('${matchId}',${v})">${v}</button>`).join('')}
    </div>
    <div style="font-size:0.8rem; font-weight:800; color:var(--text-3); text-transform:uppercase; margin-bottom:0.5rem; letter-spacing:1px;">Action Panel</div>
    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; margin-bottom: 1.5rem;">
      <button class="btn btn-red" style="font-weight:800;" onclick="QuickMatch.addWicket('${matchId}')">W</button>
      <button class="btn btn-outline" style="background:var(--surface-3);border:none;" onclick="QuickMatch.promptExtra('${matchId}','wide')">Wd</button>
      <button class="btn btn-outline" style="background:var(--surface-3);border:none;" onclick="QuickMatch.promptExtra('${matchId}','noball')">Nb</button>
      <button class="btn btn-outline" style="background:var(--surface-3);border:none;" onclick="QuickMatch.promptExtra('${matchId}','bye')">B</button>
      <button class="btn btn-outline" style="background:var(--surface-3);border:none;" onclick="QuickMatch.promptExtra('${matchId}','legbye')">Lb</button>
    </div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem; border-top: 1px solid var(--border); padding-top: 1rem;">
      <button class="btn btn-outline btn-sm" onclick="QuickMatch.changeBatsmen('${matchId}')">🔄 Swap Striker</button>
      <button class="btn btn-outline btn-sm" onclick="QuickMatch.changeBowler('${matchId}')">🔄 Change Bowler</button>
      <button class="btn btn-outline btn-sm" style="color:var(--red-2); border-color:var(--red-2);" onclick="QuickMatch.undoLast('${matchId}')">↩ Undo Ball</button>
      ${ci === 0 ? `<button class="btn btn-green btn-sm" onclick="QuickMatch.declareResult('${matchId}')">⏭ End Innings</button>` : `<button class="btn btn-red btn-sm" onclick="QuickMatch.declareResult('${matchId}')">🏆 End Match</button>`}
    </div>` : `<div style="text-align:center; padding: 2rem; color: var(--text-3); font-style: italic;">Viewing in read-only mode.</div>`}
    
    <div class="commentary-feed" style="margin-top: 1.5rem; max-height: 200px; overflow-y:auto;">
      ${(match.commentary || []).slice(-10).reverse().map(c => `<div class="commentary-item" style="border-left: 2px solid var(--gold); padding-left: 0.75rem; margin-bottom: 0.5rem;"><span style="font-weight:800; color:var(--text-2); margin-right: 0.5rem;">${c.over}</span> ${escHtml(c.text)}</div>`).join('')}
    </div>`;
  },

  declareResult(matchId) {
    if (!hasEditAccess()) return;
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn1 = match.innings?.[0];
    const inn2 = match.innings?.[1];

    if (!inn2) {
      Modal.open(`
        <h2 class="modal-title">⏭ End 1st Innings</h2>
        <div style="text-align:center;margin:1.5rem 0"><div style="font-size:2.5rem;font-weight:900;color:var(--gold)">${inn1.total}/${inn1.wickets}</div><p>Target: ${(inn1.total || 0) + 1}</p></div>
        <button class="btn btn-primary btn-full" onclick="QuickMatch.startSecondInnings('${matchId}')">Start 2nd Innings</button>
      `);
      return;
    }

    let result = '', winner = '';
    if ((inn2.total || 0) > (inn1.total || 0)) { winner = inn2.battingTeam; result = `${inn2.battingTeam} won by ${10 - (inn2.wickets || 0)} wickets`; }
    else if ((inn1.total || 0) > (inn2.total || 0)) { winner = inn1.battingTeam; result = `${inn1.battingTeam} won by ${(inn1.total || 0) - (inn2.total || 0)} runs`; }
    else { result = 'Match tied'; }

    Modal.open(`
      <h2 class="modal-title">🏆 Match Result</h2>
      <div style="text-align:center;margin:1.5rem 0"><div style="font-size:1.4rem;font-weight:800;color:var(--gold)">${escHtml(result)}</div></div>
      <button class="btn btn-primary btn-full" onclick="QuickMatch.finalizeResult('${matchId}', '${escHtml(result)}', '${escHtml(winner)}')">Save Result</button>
    `);
  },

  startSecondInnings(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    const inn1 = match.innings?.[0];
    const bat2 = match.team1 === inn1.battingTeam ? match.team2 : match.team1;
    const bowl2 = match.team1 === inn1.battingTeam ? match.team1 : match.team2;
    match.innings.push({
      battingTeam: bat2, bowlingTeam: bowl2,
      batting: Array.from({ length: 11 }, (_, i) => ({ name: `${bat2} P${i + 1}`, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, notout: true })),
      bowling: Array.from({ length: 11 }, (_, i) => ({ name: `${bowl2} P${i + 1}`, overs: 0, overBalls: 0, runs: 0, wickets: 0, maidens: 0 })),
      total: 0, wickets: 0, balls: 0, overs: 0, extras: { wide: 0, noBall: 0, bye: 0, legBye: 0 }, fallOfWickets: [], currentOver: [], striker: 0, nonStriker: 1, bowlerIdx: 0
    });
    match.currentInnings = 1;
    App.save(); Modal.close(); this.renderScoringPanel(matchId);
  },

  finalizeResult(matchId, result, winner) {
    const match = App.state.matches.find(m => m.id === matchId);
    match.result = result; match.winner = winner; match.status = 'completed';
    if (match.tournamentId) Tournament.updateStandings(matchId);
    App.save(); App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } });
    Modal.close(); this.closeScoring(); navigate('scores');
  }
};

/* ============================================================
   14. EVENT LISTENERS - REPAIRED LAYOUT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  // Safely inject sections without breaking existing styles
  const main = document.querySelector('main');
  if (main && !document.getElementById('section-room')) {
    main.insertAdjacentHTML('beforeend', '<section id="section-room" class="section"></section>');
    main.insertAdjacentHTML('beforeend', '<section id="section-profile" class="section"></section>');
  }

  // Safely inject normal nav links. NO layout-breaking CSS.
  const navLinks = document.querySelector('.nav-links');
  if (navLinks && !document.getElementById('nav-room')) {
    navLinks.insertAdjacentHTML('beforeend', `<a href="#" class="nav-link" data-route="room" id="nav-room">🏠 Hub Manager</a>`);
    navLinks.insertAdjacentHTML('beforeend', `<a href="#" class="nav-link" data-route="profile" id="nav-profile">👤 Profile</a>`);
    navLinks.insertAdjacentHTML('beforeend', `<button id="exit-private-btn" class="btn btn-red btn-sm" style="display:none; margin-left:1rem; cursor:pointer;" onclick="RoomManager.switchRoom('public')">🚪 Exit Hub</button>`);
  }

  const mobLinks = document.querySelector('.mobile-nav');
  if (mobLinks && !document.getElementById('mob-room')) {
    mobLinks.insertAdjacentHTML('beforeend', `<a href="#" class="mobile-nav-link" data-route="room" id="mob-room">🏠 Hub Manager</a>`);
    mobLinks.insertAdjacentHTML('beforeend', `<a href="#" class="mobile-nav-link" data-route="profile" id="mob-profile">👤 Profile</a>`);
    mobLinks.insertAdjacentHTML('beforeend', `<button id="exit-private-btn-mob" class="btn btn-red btn-full" style="display:none; margin-top:1rem; cursor:pointer;" onclick="RoomManager.switchRoom('public')">🚪 Exit Hub</button>`);
  }

  // Failsafe Loading
  setTimeout(() => { try { if (window.FirebaseAuth) App.initAuth(); const l = el('loader'); if (l) l.classList.add('hidden'); navigate('home'); } catch (e) { const l = el('loader'); if (l) l.classList.add('hidden'); } }, 1200);
  setTimeout(() => { const l = el('loader'); if (l && !l.classList.contains('hidden')) { l.classList.add('hidden'); navigate('home'); } }, 3500);

  document.querySelectorAll('[data-route]').forEach(link => { link.addEventListener('click', (e) => { e.preventDefault(); navigate(link.dataset.route); }); });
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-route]') || e.target.closest('[data-route]')) {
      e.preventDefault(); const target = e.target.closest('[data-route]'); if (target) navigate(target.dataset.route);
    }
  });

  el('hamburger')?.addEventListener('click', () => { el('mobile-nav').classList.toggle('open'); });
  el('modal-close')?.addEventListener('click', Modal.close);
  el('modal-overlay')?.addEventListener('click', (e) => { if (e.target === el('modal-overlay')) Modal.close(); });
});

window.navigate = navigate; window.Players = Players; window.Auction = Auction; window.Tournament = Tournament; window.QuickMatch = QuickMatch; window.Scores = Scores; window.Stats = Stats; window.Home = Home; window.Modal = Modal; window.Toast = Toast; window.el = el; window.AuthUI = AuthUI; window.RoomManager = RoomManager; window.MyProfile = MyProfile;