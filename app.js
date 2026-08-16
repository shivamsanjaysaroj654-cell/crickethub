/* ============================================================
   CRICKET HUB — APP.JS
   Full SPA logic with Real-time Firebase Sync & Auth!
   ============================================================ */
'use strict';

/* ============================================================
   1. STATE & PERSISTENCE (LIVE FIREBASE SYNC + AUTH)
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
    currentUser: null
  },

  initAuth() {
    if (!window.FirebaseAuth) return;

    window.FirebaseOnAuth(window.FirebaseAuth, (user) => {
      if (user) {
        App.state.currentUser = user.email;
        Modal.close();
        Toast.show(`Welcome back, ${user.email.split('@')[0]}!`, 'success');
        App.initLiveSync();
      } else {
        App.state.currentUser = null;
        AuthUI.showLogin();
      }
    });
  },

  initLiveSync() {
    if (!window.FirebaseDB) return;
    const dbRef = window.FirebaseRef(window.FirebaseDB, 'crickethub_live_data');

    window.FirebaseOnValue(dbRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        App.state.players = data.players || [];
        App.state.auctionRooms = data.auctionRooms || [];
        App.state.tournaments = data.tournaments || [];
        App.state.matches = data.matches || [];

        const route = App.state.activeRoute;
        const renderers = { home: Home, players: Players, auction: Auction, tournament: Tournament, quickmatch: QuickMatch, scores: Scores, stats: Stats };
        if (renderers[route]) renderers[route].render();

        updateLivePill();
        if (App.state.activeScoringMatchId && el('scoring-overlay').classList.contains('active')) {
          QuickMatch.renderScoringPanel(App.state.activeScoringMatchId);
        }
      }
    });
  },

  save() {
    if (!window.FirebaseDB || !App.state.currentUser) return;
    const dbRef = window.FirebaseRef(window.FirebaseDB, 'crickethub_live_data');
    window.FirebaseSet(dbRef, {
      players: App.state.players,
      auctionRooms: App.state.auctionRooms,
      tournaments: App.state.tournaments,
      matches: App.state.matches
    });
  },

  broadcast(msg) {
    try { App.channel.postMessage(msg); } catch (e) { }
  },
};

/* ============================================================
   AUTHENTICATION UI
   ============================================================ */
const AuthUI = {
  showLogin() {
    Modal.open(`
      <div style="text-align:center; margin-bottom:1.5rem;">
        <div style="font-size:3rem;">🔐</div>
        <h2 class="modal-title">Admin Access Required</h2>
        <p style="color:var(--text-2); font-size:0.9rem;">Please log in to manage Cricket Hub</p>
      </div>
      <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="auth-email" placeholder="admin@crickethub.com"></div>
      <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" id="auth-pass" placeholder="••••••••"></div>
      
      <button class="btn btn-primary btn-full" style="margin-bottom:0.5rem" onclick="AuthUI.login()">Login</button>
      <button class="btn btn-outline btn-full" onclick="AuthUI.signup()">Create Account</button>
    `);

    el('modal-overlay').onclick = null;
    el('modal-close').style.display = 'none';
  },

  async login() {
    const email = el('auth-email').value;
    const pass = el('auth-pass').value;
    try {
      await window.FirebaseSignIn(window.FirebaseAuth, email, pass);
    } catch (error) {
      Toast.show(error.message.replace('Firebase: ', ''), 'error');
    }
  },

  async signup() {
    const email = el('auth-email').value;
    const pass = el('auth-pass').value;
    try {
      await window.FirebaseSignUp(window.FirebaseAuth, email, pass);
    } catch (error) {
      Toast.show(error.message.replace('Firebase: ', ''), 'error');
    }
  },

  logout() {
    window.FirebaseSignOut(window.FirebaseAuth);
  }
};

/* ============================================================
   2. BROADCAST CHANNEL
   ============================================================ */
App.channel = (() => {
  try { return new BroadcastChannel('cricket-hub'); } catch (e) { return { postMessage: () => { }, onmessage: null }; }
})();

App.channel.onmessage = (e) => {
  const { type, payload } = e.data || {};
  switch (type) {
    case 'SCORE_UPDATE': Toast.show('📊 Live score updated!', 'info'); break;
    case 'MATCH_CREATED': Toast.show(`🏏 New match started: ${payload?.name || ''}`, 'info'); break;
    case 'BID_UPDATE': Toast.show(`💰 New bid: ₹${(payload?.amount || 0).toLocaleString('en-IN')}`, 'info'); break;
    case 'PLAYER_REGISTERED': Toast.show(`👤 New player registered: ${payload?.name}`, 'success'); break;
    case 'ROOM_CREATED': Toast.show(`🔨 New auction room: ${payload?.name}`, 'info'); break;
    case 'TOURNAMENT_CREATED': Toast.show(`🏆 New tournament: ${payload?.name}`, 'info'); break;
  }
};

/* ============================================================
   3. UTILITIES
   ============================================================ */
const uid = () => Math.random().toString(36).slice(2, 10);
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const fmt = (n) => (n || 0).toLocaleString('en-IN');
const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '0.00';
const now = () => new Date().toISOString();
const dateStr = (d) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const timeStr = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function el(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   4. TOAST NOTIFICATIONS
   ============================================================ */
const Toast = {
  show(msg, type = 'default', duration = 3500) {
    const icons = { default: '🏏', success: '✅', error: '❌', info: '📢', warning: '⚠️' };
    const tc = el('toast-container');
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.innerHTML = `<span class="toast-icon">${icons[type] || '🏏'}</span><span class="toast-msg">${escHtml(msg)}</span><span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
    tc.prepend(div);
    setTimeout(() => { div.classList.add('out'); setTimeout(() => div.remove(), 300); }, duration);
  }
};

/* ============================================================
   5. MODAL
   ============================================================ */
const Modal = {
  open(html, title = '') {
    el('modal-body').innerHTML = (title ? `<h2 class="modal-title">${escHtml(title)}</h2>` : '') + html;
    el('modal-overlay').classList.add('active');
  },
  close() {
    el('modal-overlay').classList.remove('active');
    el('modal-body').innerHTML = '';
  }
};

/* ============================================================
   6. ROUTER 
   ============================================================ */
function navigate(route) {
  App.state.activeRoute = route;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(a => a.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-link').forEach(a => a.classList.remove('active'));

  const sec = el(`section-${route}`);
  if (sec) sec.classList.add('active');
  const navLink = el(`nav-${route}`);
  if (navLink) navLink.classList.add('active');
  document.querySelectorAll(`[data-route="${route}"]`).forEach(a => a.classList.add('active'));

  el('mobile-nav').classList.remove('open');

  const renderers = {
    home: () => Home.render(),
    players: () => Players.render(),
    auction: () => Auction.render(),
    tournament: () => Tournament.render(),
    quickmatch: () => QuickMatch.render(),
    scores: () => Scores.render(),
    stats: () => Stats.render()
  };

  if (renderers[route]) renderers[route]();
  window.scrollTo(0, 0);
}

/* ============================================================
   7. HOME
   ============================================================ */
const Home = {
  render() {
    const s = App.state;
    const liveMatches = s.matches.filter(m => m.status === 'live');
    const totalRuns = s.matches.reduce((a, m) => a + (m.innings?.[0]?.total || 0) + (m.innings?.[1]?.total || 0), 0);
    const totalWickets = s.matches.reduce((a, m) => a + (m.innings?.[0]?.wickets || 0) + (m.innings?.[1]?.wickets || 0), 0);

    el('section-home').innerHTML = `
    ${this.ticker(liveMatches)}
    <div class="hero">
      <div class="hero-content">
        <div class="hero-badge">🏏 India's #1 Cricket Management Platform</div>
        <h1 class="hero-title">Where Cricket<br><span class="accent">Legends</span> Are Made</h1>
        <p class="hero-desc">Register players, run auctions, organize tournaments, and follow live ball-by-ball scores — all in one place.</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" onclick="navigate('players')">👤 Register Player</button>
          <button class="btn btn-outline btn-lg" onclick="navigate('quickmatch')">⚡ Quick Match</button>
          <button class="btn btn-ghost btn-lg" onclick="navigate('auction')">🔨 Start Auction</button>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><div class="hero-stat-val">${s.players.length}</div><div class="hero-stat-lbl">Registered Players</div></div>
          <div class="hero-stat"><div class="hero-stat-val">${s.auctionRooms.length}</div><div class="hero-stat-lbl">Auction Rooms</div></div>
          <div class="hero-stat"><div class="hero-stat-val">${s.tournaments.length}</div><div class="hero-stat-lbl">Tournaments</div></div>
          <div class="hero-stat"><div class="hero-stat-val">${liveMatches.length}</div><div class="hero-stat-lbl">Live Matches</div></div>
          <div class="hero-stat"><div class="hero-stat-val">${fmt(totalRuns)}</div><div class="hero-stat-lbl">Total Runs Scored</div></div>
          <div class="hero-stat"><div class="hero-stat-val">${totalWickets}</div><div class="hero-stat-lbl">Total Wickets</div></div>
        </div>
      </div>
    </div>
    <div class="container">
      <div class="section-header mt-3"><h2 class="section-title">Quick Actions</h2></div>
      <div class="home-grid">
        ${this.actionCard('👤', 'Register Player', 'Add yourself or your players to the auction pool with full stats.', 'players')}
        ${this.actionCard('🔨', 'Create Auction Room', 'Set up an IPL-style auction room. Share the room code with others.', 'auction')}
        ${this.actionCard('🏆', 'New Tournament', 'Organize a T20 / ODI / Test series with teams, schedule & standings.', 'tournament')}
        ${this.actionCard('⚡', 'Quick Match', 'Set up a match in 60 seconds. Full live scoring with ball-by-ball commentary.', 'quickmatch')}
        ${this.actionCard('📊', 'Live Scores', 'Watch real-time ball-by-ball updates for all ongoing matches.', 'scores')}
        ${this.actionCard('📈', 'Stats Hub', 'Leaderboards, emerging players, most sixes, best bowling & more.', 'stats')}
      </div>
      ${liveMatches.length ? `
      <div class="section-header mt-3"><h2 class="section-title">🔴 Live Now</h2></div>
      ${liveMatches.map(m => this.liveMatchCard(m)).join('')}` : ''}
      ${this.recentMatches()}
      ${this.topPerformers()}
      
      <div style="text-align:center; margin-top: 3rem;">
         <button class="btn btn-outline btn-sm" onclick="AuthUI.logout()">Logout</button>
      </div>
    </div>`;
    this.updateTicker();
  },

  actionCard(icon, title, desc, route) {
    return `<div class="quick-action-card" onclick="navigate('${route}')">
      <div class="qa-icon">${icon}</div>
      <div class="qa-title">${escHtml(title)}</div>
      <div class="qa-desc">${escHtml(desc)}</div>
    </div>`;
  },

  liveMatchCard(m) {
    const i0 = m.innings?.[0]; const i1 = m.innings?.[1];
    return `<div class="match-row" onclick="navigate('scores')">
      <div class="match-teams-row">
        <span class="match-team-name">${escHtml(m.team1)}</span>
        <span class="match-vs">vs</span>
        <span class="match-team-name">${escHtml(m.team2)}</span>
      </div>
      <div class="match-score-row">${i0 ? `${i0.total}/${i0.wickets} (${i0.overs || 0} ov)` : ''} ${i1 ? ` | ${i1.total}/${i1.wickets} (${i1.overs || 0} ov)` : ''}</div>
      <span class="match-status-badge match-live">● LIVE</span>
    </div>`;
  },

  recentMatches() {
    const done = App.state.matches.filter(m => m.status === 'completed').slice(-5).reverse();
    if (!done.length) return '';
    return `<div class="section-header mt-3"><h2 class="section-title">📋 Recent Results</h2></div>
    ${done.map(m => `<div class="match-row" onclick="Scores.viewScorecard('${m.id}')">
      <div class="match-teams-row">
        <span class="match-team-name">${escHtml(m.team1)}</span>
        <span class="match-vs">vs</span>
        <span class="match-team-name">${escHtml(m.team2)}</span>
      </div>
      <div class="match-score-row" style="font-size:.78rem;color:var(--text-2)">${escHtml(m.result || '')}</div>
      <span class="match-status-badge match-done">✓ Done</span>
    </div>`).join('')}`;
  },

  topPerformers() {
    const players = App.state.players;
    if (!players.length) return '';
    const sorted = [...players].sort((a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0)).slice(0, 3);
    return `<div class="section-header mt-3"><h2 class="section-title">🌟 Top Performers</h2></div>
    <div class="grid-3">
    ${sorted.map((p, i) => `<div class="card" style="display:flex;align-items:center;gap:1rem;">
      <div style="font-size:1.8rem">${['🥇', '🥈', '🥉'][i]}</div>
      <div>
        <div style="font-weight:700">${escHtml(p.name)}</div>
        <div style="font-size:.78rem;color:var(--gold)">${escHtml(p.role || '')}</div>
        <div style="font-size:.82rem;color:var(--text-2);margin-top:.25rem">${p.stats?.runs || 0} runs • ${p.stats?.wickets || 0} wkts</div>
      </div>
    </div>`).join('')}
    </div>`;
  },

  ticker(liveMatches) {
    if (!liveMatches.length) return '';
    let items = liveMatches.map(m => {
      const i = m.innings?.[m.currentInnings || 0];
      return `<span class="ticker-item">${escHtml(m.team1)} vs ${escHtml(m.team2)}: <span class="score">${i ? `${i.total}/${i.wickets}` : 'Yet to bat'}</span> ${i ? `(${i.overs || 0} ov)` : ''}</span>`;
    });
    const full = items.join('') + items.join('');
    return `<div class="ticker-wrap" id="ticker-wrap">
      <div class="ticker-label">🔴 LIVE</div>
      <div class="ticker-track">${full}${full}</div>
    </div>`;
  },

  updateTicker() {
    updateLivePill();
  }
};

function updateLivePill() {
  const liveCount = App.state.matches.filter(m => m.status === 'live').length;
  const pill = el('live-pill');
  if (!pill) return;
  if (liveCount > 0) {
    pill.style.display = 'flex';
    el('live-count').textContent = liveCount;
  } else {
    pill.style.display = 'none';
  }
}

/* ============================================================
   8. PLAYERS (WITH DIRECT AUCTION ENTRY)
   ============================================================ */
const Players = {
  filter: { role: 'all', search: '', sort: 'name' },

  render() {
    const sec = el('section-players');
    sec.innerHTML = `<div class="container">
      <div class="section-header">
        <div>
          <h1 class="section-title"><span class="icon">👤</span> Players Registry</h1>
          <div class="section-subtitle">${App.state.players.length} players registered</div>
        </div>
        <button class="btn btn-primary" onclick="Players.openRegister()">+ Register Player</button>
      </div>
      <div class="search-bar">
        <div class="search-input-wrap">
          <span class="search-icon">🔍</span>
          <input class="search-input" id="player-search" placeholder="Search by name, city…" oninput="Players.applyFilter()" value="${escHtml(this.filter.search)}">
        </div>
        <select class="filter-select" id="role-filter" onchange="Players.applyFilter()">
          <option value="all">All Roles</option>
          <option value="Batsman">Batsman</option>
          <option value="Bowler">Bowler</option>
          <option value="All-rounder">All-rounder</option>
          <option value="Wicketkeeper">Wicketkeeper</option>
        </select>
        <select class="filter-select" id="sort-filter" onchange="Players.applyFilter()">
          <option value="name">Sort: Name</option>
          <option value="runs">Sort: Most Runs</option>
          <option value="wickets">Sort: Most Wickets</option>
          <option value="matches">Sort: Most Matches</option>
        </select>
      </div>
      <div class="grid-3" id="players-grid"></div>
    </div>`;
    this.renderGrid();
  },

  applyFilter() {
    this.filter.search = el('player-search')?.value || '';
    this.filter.role = el('role-filter')?.value || 'all';
    this.filter.sort = el('sort-filter')?.value || 'name';
    this.renderGrid();
  },

  renderGrid() {
    let list = [...App.state.players];
    if (this.filter.search) {
      const q = this.filter.search.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.city || '').toLowerCase().includes(q));
    }
    if (this.filter.role !== 'all') list = list.filter(p => p.role === this.filter.role);
    const sortMap = { name: (a, b) => a.name.localeCompare(b.name), runs: (a, b) => (b.stats?.runs || 0) - (a.stats?.runs || 0), wickets: (a, b) => (b.stats?.wickets || 0) - (a.stats?.wickets || 0), matches: (a, b) => (b.stats?.matches || 0) - (a.stats?.matches || 0) };
    list.sort(sortMap[this.filter.sort] || sortMap.name);
    const grid = el('players-grid');
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👤</div><div class="empty-title">No players found</div><div class="empty-desc">Register your first player to get started.</div><button class="btn btn-primary" onclick="Players.openRegister()">+ Register Player</button></div>`;
      return;
    }
    grid.innerHTML = list.map(p => this.playerCard(p)).join('');
  },

  playerCard(p) {
    const statusClass = { available: 'status-available', sold: 'status-sold', unsold: 'status-unsold' }[p.status || 'available'] || 'status-available';
    const statusLabel = { available: 'Available', sold: 'Sold', unsold: 'Unsold' }[p.status || 'available'] || 'Available';
    const roleEmoji = { Batsman: '🏏', Bowler: '🎳', 'All-rounder': '⚡', Wicketkeeper: '🧤' }[p.role] || '🏏';
    const achievements = this.getAchievements(p);
    return `<div class="player-card" onclick="Players.viewPlayer('${p.id}')">
      <div class="player-card-header">
        <span style="font-size:2.8rem">${p.photo || roleEmoji}</span>
        <span class="player-card-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="player-card-body">
        <div class="player-name">${escHtml(p.name)}</div>
        <div class="player-role">${escHtml(p.role || '')}${p.city ? ` • ${escHtml(p.city)}` : ''}</div>
        ${achievements.length ? `<div style="margin-top:.5rem;display:flex;gap:.3rem;flex-wrap:wrap">${achievements.map(a => `<span class="achievement">${a}</span>`).join('')}</div>` : ''}
        <div class="player-stats">
          <div class="pstat"><div class="pstat-val">${p.stats?.matches || 0}</div><div class="pstat-lbl">M</div></div>
          <div class="pstat"><div class="pstat-val">${p.stats?.runs || 0}</div><div class="pstat-lbl">Runs</div></div>
          <div class="pstat"><div class="pstat-val">${p.stats?.wickets || 0}</div><div class="pstat-lbl">Wkts</div></div>
          <div class="pstat"><div class="pstat-val">${p.stats?.sixes || 0}</div><div class="pstat-lbl">6s</div></div>
        </div>
      </div>
    </div>`;
  },

  getAchievements(p) {
    const ach = [];
    if ((p.stats?.runs || 0) >= 1000) ach.push('🏅 1K Runs');
    if ((p.stats?.runs || 0) >= 500) ach.push('💯 500 Runs');
    if ((p.stats?.wickets || 0) >= 50) ach.push('🎳 50 Wkts');
    if ((p.stats?.sixes || 0) >= 20) ach.push('💥 20 Sixes');
    if ((p.stats?.hundreds || 0) >= 1) ach.push('💯 Century');
    if ((p.stats?.fifties || 0) >= 5) ach.push('⭐ 5 Fifties');
    return ach.slice(0, 2);
  },

  openRegister() {
    const openRooms = App.state.auctionRooms.filter(r => r.status !== 'completed');
    const roomOptions = openRooms.map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join('');

    Modal.open(`
      <h2 class="modal-title">👤 Register Player</h2>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" id="p-name" placeholder="e.g. Virat Kohli"></div>
        <div class="form-group"><label class="form-label">Age *</label><input class="form-input" type="number" id="p-age" min="10" max="60" placeholder="25"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Role *</label>
          <select class="form-select" id="p-role">
            <option value="">Select Role</option>
            <option>Batsman</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Batting Style</label>
          <select class="form-select" id="p-bat">
            <option>Right-handed</option><option>Left-handed</option>
          </select>
        </div>
      </div>
      
      ${openRooms.length > 0 ? `
      <div style="background:rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-sm); padding: 1rem; margin-bottom: 1rem;">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label" style="color:var(--gold)">🔨 Enter directly into an upcoming Auction? (Optional)</label>
          <select class="form-select" id="p-auction">
            <option value="">-- Do not enter into auction yet --</option>
            ${roomOptions}
          </select>
          <div class="form-hint" style="margin-top:0.4rem">Selecting a room adds you instantly to its bidding queue.</div>
        </div>
      </div>
      ` : ''}

      <div class="form-row">
        <div class="form-group"><label class="form-label">Bowling Style</label>
          <select class="form-select" id="p-bowl">
            <option>Right-arm Fast</option><option>Right-arm Medium</option><option>Right-arm Off-spin</option>
            <option>Left-arm Fast</option><option>Left-arm Medium</option><option>Left-arm Spin</option>
            <option>Leg-spin</option><option>N/A</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">City</label><input class="form-input" id="p-city" placeholder="Mumbai"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Contact / Phone</label><input class="form-input" id="p-contact" placeholder="+91 98765 43210"></div>
        <div class="form-group"><label class="form-label">Jersey Number</label><input class="form-input" type="number" id="p-jersey" min="1" max="99" placeholder="18"></div>
      </div>
      <div class="form-group"><label class="form-label">Player Emoji / Avatar</label>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.25rem">
          ${['🏏', '🎳', '⚡', '🧤', '🌟', '🦁', '🔥', '💪', '👑', '🦅'].map(e => `<button class="btn btn-ghost" style="font-size:1.5rem;padding:.35rem" onclick="el('p-emoji').value='${e}';this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));this.classList.add('selected')">${e}</button>`).join('')}
        </div>
        <input type="hidden" id="p-emoji" value="🏏">
      </div>
      <div class="form-group"><label class="form-label">About / Bio</label><textarea class="form-textarea" id="p-bio" placeholder="A short bio…"></textarea></div>
      <button class="btn btn-primary btn-full" onclick="Players.register()">Register Player</button>
    `);
  },

  register() {
    const name = el('p-name')?.value?.trim();
    const age = el('p-age')?.value;
    const role = el('p-role')?.value;
    const targetAuctionId = el('p-auction')?.value;

    if (!name) { Toast.show('Name is required', 'error'); return; }
    if (!role) { Toast.show('Please select a role', 'error'); return; }

    const player = {
      id: uid(), name, age: +age || 20, role,
      battingStyle: el('p-bat')?.value,
      bowlingStyle: el('p-bowl')?.value,
      city: el('p-city')?.value?.trim(),
      contact: el('p-contact')?.value?.trim(),
      jersey: el('p-jersey')?.value,
      photo: el('p-emoji')?.value || '🏏',
      bio: el('p-bio')?.value?.trim(),
      status: 'available',
      registeredAt: now(),
      stats: { matches: 0, runs: 0, wickets: 0, sixes: 0, fours: 0, catches: 0, highScore: 0, bestBowling: '0/0', fifties: 0, hundreds: 0, ducks: 0, fantasyPoints: 0 },
      form: [],
    };

    App.state.players.push(player);

    if (targetAuctionId) {
      const room = App.state.auctionRooms.find(r => r.id === targetAuctionId);
      if (room) {
        room.playerIds = room.playerIds || [];
        room.playerQueue = room.playerQueue || [];
        room.playerIds.push(player.id);
        room.playerQueue.push(player.id);
      }
    }

    App.save();
    App.broadcast({ type: 'PLAYER_REGISTERED', payload: { name } });
    Modal.close();

    if (targetAuctionId) {
      Toast.show(`✅ ${name} registered & added to Auction Queue!`, 'success');
    } else {
      Toast.show(`✅ ${name} registered successfully!`, 'success');
    }

    this.render();
  },

  viewPlayer(id) {
    const p = App.state.players.find(x => x.id === id);
    if (!p) return;
    const roleEmoji = { Batsman: '🏏', Bowler: '🎳', 'All-rounder': '⚡', Wicketkeeper: '🧤' }[p.role] || '🏏';
    const sr = p.stats.runs && p.stats.matches ? ((p.stats.runs / (p.stats.matches || 1))).toFixed(1) : '0';
    const formHtml = (p.form || []).slice(-5).map(f => `<div class="form-dot form-${f}"></div>`).join('');
    Modal.open(`
      <div style="text-align:center;margin-bottom:1.5rem">
        <div style="font-size:4rem;margin-bottom:.5rem">${p.photo || roleEmoji}</div>
        <h2 style="font-size:1.6rem;font-weight:800">${escHtml(p.name)}</h2>
        <div style="color:var(--gold);font-weight:600;margin:.25rem 0">${escHtml(p.role || '')} • ${escHtml(p.city || '')}</div>
        <div class="badge ${p.status === 'sold' ? 'badge-red' : p.status === 'unsold' ? 'badge-green' : 'badge-gold'}" style="margin:.5rem auto">${p.status || 'available'}</div>
        ${p.bio ? `<p style="color:var(--text-2);font-size:.85rem;margin-top:.75rem">${escHtml(p.bio)}</p>` : ''}
      </div>
      <div class="form-dots" style="justify-content:center;margin-bottom:1.5rem">${formHtml || '<span style="color:var(--text-3);font-size:.8rem">No match history</span>'}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem">
        ${[['Matches', p.stats.matches], ['Runs', p.stats.runs], ['Wickets', p.stats.wickets], ['Sixes', p.stats.sixes], ['Fours', p.stats.fours], ['Avg', sr], ['High Score', p.stats.highScore], ['Fifties', p.stats.fifties], ['Hundreds', p.stats.hundreds]].map(([l, v]) => `<div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:.9rem;text-align:center"><div style="font-size:1.3rem;font-weight:800;color:var(--gold);font-family:'Roboto Mono',monospace">${v || 0}</div><div style="font-size:.72rem;color:var(--text-2);margin-top:.2rem">${l}</div></div>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:.5rem;font-size:.85rem;color:var(--text-2)">
        <div><strong style="color:var(--text)">Batting:</strong> ${escHtml(p.battingStyle || 'N/A')}</div>
        <div><strong style="color:var(--text)">Bowling:</strong> ${escHtml(p.bowlingStyle || 'N/A')}</div>
        <div><strong style="color:var(--text)">Jersey:</strong> #${p.jersey || 'N/A'}</div>
        <div><strong style="color:var(--text)">Contact:</strong> ${escHtml(p.contact || 'N/A')}</div>
        <div><strong style="color:var(--text)">Fantasy Points:</strong> <span style="color:var(--gold)">${p.stats.fantasyPoints || 0} pts</span></div>
        <div><strong style="color:var(--text)">Registered:</strong> ${dateStr(p.registeredAt)}</div>
      </div>
    `);
  }
};

/* ============================================================
   9. AUCTION
   ============================================================ */
const Auction = {
  activeRoomId: null,

  render() {
    const sec = el('section-auction');
    sec.innerHTML = `<div class="container">
      <div class="section-header">
        <div>
          <h1 class="section-title"><span class="icon">🔨</span> Auction Rooms</h1>
          <div class="section-subtitle">Create or join an IPL-style cricket auction</div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-outline" onclick="Auction.openJoin()">🔗 Join Room</button>
          <button class="btn btn-primary" onclick="Auction.openCreate()">+ Create Room</button>
        </div>
      </div>
      ${this.renderRooms()}
    </div>`;
  },

  renderRooms() {
    const rooms = App.state.auctionRooms;
    if (!rooms.length) return `<div class="empty-state"><div class="empty-icon">🔨</div><div class="empty-title">No Auction Rooms Yet</div><div class="empty-desc">Create the first auction room and invite teams to bid!</div><button class="btn btn-primary" onclick="Auction.openCreate()">+ Create Room</button></div>`;
    return `<div class="grid-2">${rooms.map(r => this.roomCard(r)).join('')}</div>`;
  },

  roomCard(r) {
    const playerCount = (r.playerIds || []).length;
    const teamCount = (r.teams || []).length;
    const statusColor = r.status === 'active' ? 'var(--gold)' : r.status === 'completed' ? 'var(--text-2)' : 'var(--green-2)';
    return `<div class="room-card" onclick="Auction.openRoom('${r.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
        <div>
          <div style="font-size:1.1rem;font-weight:800;margin-bottom:.35rem">${escHtml(r.name)}</div>
          <div class="room-code">${escHtml(r.code)}</div>
        </div>
        <div style="text-align:right">
          <div class="room-status"><div class="dot-green" style="${r.status !== 'open' ? 'background:var(--text-3)' : ''}"></div><span style="font-size:.78rem;font-weight:600;color:${statusColor}">${r.status?.toUpperCase() || 'OPEN'}</span></div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.25rem">${dateStr(r.createdAt)}</div>
        </div>
      </div>
      <div style="display:flex;gap:1.5rem;font-size:.85rem;color:var(--text-2)">
        <div>👥 ${teamCount}/${r.maxTeams || 8} Teams</div>
        <div>👤 ${playerCount} Players</div>
        <div>💰 Base: ₹${fmt(r.basePrice || 20)}&nbsp;L</div>
      </div>
      ${r.currentPlayer ? `<div style="margin-top:1rem;padding:.6rem;background:rgba(245,158,11,.08);border-radius:var(--radius-sm);font-size:.82rem">🎯 Bidding: <strong style="color:var(--gold)">${escHtml(this.getPlayerName(r.currentPlayer))}</strong></div>` : ''}
    </div>`;
  },

  getPlayerName(pid) {
    const p = App.state.players.find(x => x.id === pid);
    return p?.name || pid;
  },

  openCreate() {
    Modal.open(`
      <h2 class="modal-title">🔨 Create Auction Room</h2>
      <div class="form-group"><label class="form-label">Room Name *</label><input class="form-input" id="r-name" placeholder="IPL Mega Auction 2026"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Max Teams</label>
          <select class="form-select" id="r-teams"><option>4</option><option>6</option><option selected>8</option><option>10</option></select>
        </div>
        <div class="form-group"><label class="form-label">Base Price (Lakhs) ₹</label><input class="form-input" type="number" id="r-base" value="20" min="1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Budget per Team (Crores) ₹</label><input class="form-input" type="number" id="r-budget" value="100" min="10"></div>
        <div class="form-group"><label class="form-label">Auction Date</label><input class="form-input" type="date" id="r-date"></div>
      </div>
      <div class="form-group"><label class="form-label">Your Team Name *</label><input class="form-input" id="r-myteam" placeholder="Mumbai Indians"></div>
      <div class="form-group"><label class="form-label">Bid Increment (Lakhs) ₹</label>
        <select class="form-select" id="r-increment"><option value="5">₹5 L</option><option value="10" selected>₹10 L</option><option value="25">₹25 L</option><option value="50">₹50 L</option></select>
      </div>
      <button class="btn btn-primary btn-full" onclick="Auction.createRoom()">Create Room</button>
    `);
    const today = new Date().toISOString().split('T')[0];
    const dateEl = el('r-date'); if (dateEl) dateEl.value = today;
  },

  createRoom() {
    const name = el('r-name')?.value?.trim();
    const myTeam = el('r-myteam')?.value?.trim();
    if (!name) { Toast.show('Room name required', 'error'); return; }
    if (!myTeam) { Toast.show('Enter your team name', 'error'); return; }
    const room = {
      id: uid(), name, code: roomCode(),
      maxTeams: +(el('r-teams')?.value || 8),
      basePrice: +(el('r-base')?.value || 20),
      budget: +(el('r-budget')?.value || 100) * 100,
      increment: +(el('r-increment')?.value || 10),
      auctionDate: el('r-date')?.value,
      status: 'open',
      teams: [{ name: myTeam, budget: +(el('r-budget')?.value || 100) * 100, players: [], spent: 0 }],
      playerIds: App.state.players.map(p => p.id),
      playerQueue: App.state.players.map(p => p.id),
      currentPlayer: null,
      bids: [],
      soldLog: [],
      createdAt: now(),
    };
    App.state.auctionRooms.push(room);
    App.save();
    App.broadcast({ type: 'ROOM_CREATED', payload: { name } });
    Modal.close();
    Toast.show(`✅ Room created! Code: ${room.code}`, 'success', 6000);
    this.openRoom(room.id);
    this.render();
  },

  openJoin() {
    Modal.open(`
      <h2 class="modal-title">🔗 Join Auction Room</h2>
      <div class="form-group"><label class="form-label">Room Code *</label><input class="form-input" id="join-code" placeholder="ABC123" style="text-transform:uppercase;font-family:'Roboto Mono',monospace;letter-spacing:3px;font-size:1.2rem"></div>
      <div class="form-group"><label class="form-label">Your Team Name *</label><input class="form-input" id="join-team" placeholder="Chennai Super Kings"></div>
      <button class="btn btn-primary btn-full" onclick="Auction.joinRoom()">Join Room</button>
    `);
    const ci = el('join-code'); if (ci) ci.addEventListener('input', () => { ci.value = ci.value.toUpperCase(); });
  },

  joinRoom() {
    const code = el('join-code')?.value?.trim().toUpperCase();
    const teamName = el('join-team')?.value?.trim();
    if (!code || !teamName) { Toast.show('Fill all fields', 'error'); return; }
    const room = App.state.auctionRooms.find(r => r.code === code);
    if (!room) { Toast.show('Room not found. Check the code!', 'error'); return; }
    if (room.status === 'completed') { Toast.show('This auction is already completed', 'error'); return; }
    if ((room.teams || []).length >= room.maxTeams) { Toast.show('Room is full', 'error'); return; }
    if (room.teams.some(t => t.name.toLowerCase() === teamName.toLowerCase())) { Toast.show('Team name already taken', 'error'); return; }
    room.teams.push({ name: teamName, budget: room.budget, players: [], spent: 0 });
    App.save();
    App.broadcast({ type: 'BID_UPDATE', payload: { amount: 0 } });
    Modal.close();
    Toast.show(`✅ Joined room as ${teamName}!`, 'success');
    this.openRoom(room.id);
    this.render();
  },

  openRoom(roomId) {
    const room = App.state.auctionRooms.find(r => r.id === roomId);
    if (!room) return;
    this.activeRoomId = roomId;
    Modal.open(this.buildRoomHTML(room));
  },

  buildRoomHTML(room) {
    const playerQueue = (room.playerQueue || []).filter(pid => !room.soldLog?.some(s => s.playerId === pid));
    const currentPlayer = room.currentPlayer ? App.state.players.find(p => p.id === room.currentPlayer) : null;
    const lastBid = room.bids?.[room.bids.length - 1];
    return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
      <div><h2 style="font-size:1.3rem;font-weight:800">${escHtml(room.name)}</h2>
      <div class="room-code">${escHtml(room.code)}</div></div>
      <span class="badge ${room.status === 'open' ? 'badge-green' : room.status === 'active' ? 'badge-gold' : 'badge-green'}">${room.status?.toUpperCase()}</span>
    </div>

    ${currentPlayer ? `
    <div class="current-player-bid">
      <div style="font-size:3rem;margin-bottom:.5rem">${currentPlayer.photo || '🏏'}</div>
      <div style="font-size:1.2rem;font-weight:800">${escHtml(currentPlayer.name)}</div>
      <div style="color:var(--gold);font-size:.85rem;margin:.3rem 0">${escHtml(currentPlayer.role || '')}</div>
      <div class="bid-amount">₹${fmt(room.currentBid || room.basePrice)}&nbsp;L</div>
      ${lastBid ? `<div style="font-size:.82rem;color:var(--text-2);margin-top:.5rem">Leading: <strong style="color:var(--gold)">${escHtml(lastBid.team)}</strong></div>` : ''}
      <div class="bid-teams" style="margin-top:1rem">
        ${(room.teams || []).map(t => `<button class="team-chip ${lastBid?.team === t.name ? 'leading' : ''}" onclick="Auction.placeBid('${room.id}','${escHtml(t.name)}')">${escHtml(t.name)}<br><small>₹${fmt(t.budget)}&nbsp;L left</small></button>`).join('')}
      </div>
      <div style="display:flex;gap:.5rem;justify-content:center;margin-top:1rem;flex-wrap:wrap">
        <button class="btn btn-green btn-sm" onclick="Auction.sellPlayer('${room.id}')">✅ Sell</button>
        <button class="btn btn-ghost btn-sm" onclick="Auction.passPlayer('${room.id}')">⏭ Unsold / Pass</button>
      </div>
    </div>` : `<div style="text-align:center;padding:2rem;background:var(--surface-2);border-radius:var(--radius-lg);margin-bottom:1rem">
      <div style="font-size:2rem;margin-bottom:.5rem">🔨</div>
      <div style="font-weight:700;margin-bottom:.5rem">No player up for bidding</div>
      <button class="btn btn-primary" onclick="Auction.nextPlayer('${room.id}')">▶ Start Bidding</button>
    </div>`}

    <div class="tabs" style="margin-top:1.5rem">
      <div class="tab active" onclick="Auction.switchTab(this,'at-queue')">📋 Queue (${playerQueue.length})</div>
      <div class="tab" onclick="Auction.switchTab(this,'at-teams')">👥 Teams</div>
      <div class="tab" onclick="Auction.switchTab(this,'at-sold')">✅ Sold (${(room.soldLog || []).length})</div>
      <div class="tab" onclick="Auction.switchTab(this,'at-history')">📜 Bid History</div>
    </div>
    <div id="at-queue">
      <div style="display:flex;flex-direction:column;gap:.5rem;max-height:260px;overflow-y:auto">
        ${playerQueue.slice(0, 20).map(pid => {
      const p = App.state.players.find(x => x.id === pid);
      if (!p) return '';
      return `<div style="display:flex;align-items:center;gap:.75rem;padding:.65rem;background:var(--surface-2);border-radius:var(--radius-sm)">
            <span style="font-size:1.4rem">${p.photo || '🏏'}</span>
            <div style="flex:1"><div style="font-weight:600;font-size:.88rem">${escHtml(p.name)}</div><div style="font-size:.72rem;color:var(--gold)">${escHtml(p.role || '')}</div></div>
            <div style="font-size:.78rem;color:var(--text-2)">Base: ₹${fmt(room.basePrice)}&nbsp;L</div>
            <button class="btn btn-ghost btn-sm" onclick="Auction.setBidPlayer('${room.id}','${pid}')">Bid</button>
          </div>`;
    }).join('')}
        ${playerQueue.length === 0 ? `<div class="empty-state" style="padding:1.5rem"><div class="empty-title">Queue is empty</div></div>` : ''}
      </div>
    </div>
    <div id="at-teams" style="display:none">
      ${(room.teams || []).map(t => `<div style="padding:1rem;background:var(--surface-2);border-radius:var(--radius-sm);margin-bottom:.5rem">
        <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700">${escHtml(t.name)}</div><div style="color:var(--gold);font-weight:700">₹${fmt(t.budget)}&nbsp;L</div></div>
        <div style="font-size:.78rem;color:var(--text-2);margin-top:.35rem">${t.players?.length || 0} players • Spent: ₹${fmt(t.spent || 0)}&nbsp;L</div>
        ${t.players?.length ? `<div style="margin-top:.5rem;font-size:.8rem;color:var(--text-3)">${t.players.map(x => escHtml(x.name)).join(', ')}</div>` : ''}
      </div>`).join('')}
    </div>
    <div id="at-sold" style="display:none">
      ${(room.soldLog || []).map(s => `<div style="display:flex;align-items:center;gap:.75rem;padding:.65rem;background:var(--surface-2);border-radius:var(--radius-sm);margin-bottom:.4rem">
        <span>✅</span>
        <div style="flex:1"><div style="font-weight:600;font-size:.88rem">${escHtml(s.playerName)}</div><div style="font-size:.72rem;color:var(--text-2)">Bought by: <span style="color:var(--gold)">${escHtml(s.team)}</span></div></div>
        <div style="font-family:'Roboto Mono',monospace;font-size:.85rem;color:var(--gold)">₹${fmt(s.amount)}&nbsp;L</div>
      </div>`).join('') || `<div class="empty-state" style="padding:1.5rem"><div class="empty-title">No players sold yet</div></div>`}
    </div>
    <div id="at-history" style="display:none">
      ${(room.bids || []).slice(-20).reverse().map(b => `<div style="display:flex;justify-content:space-between;padding:.5rem .75rem;border-bottom:1px solid var(--border);font-size:.83rem">
        <span style="color:var(--text-2)">${escHtml(b.player)}</span>
        <span style="color:var(--gold);font-weight:700">₹${fmt(b.amount)}&nbsp;L</span>
        <span style="color:var(--text-3)">${escHtml(b.team)}</span>
        <span style="color:var(--text-3)">${timeStr(b.at)}</span>
      </div>`).join('') || `<div style="text-align:center;padding:1.5rem;color:var(--text-3)">No bids yet</div>`}
    </div>`;
  },

  switchTab(btn, showId) {
    const tabBar = btn.closest('.tabs');
    if (tabBar) tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['at-queue', 'at-teams', 'at-sold', 'at-history'].forEach(id => {
      const el2 = el(id); if (el2) el2.style.display = id === showId ? 'block' : 'none';
    });
  },

  setBidPlayer(roomId, playerId) {
    const room = App.state.auctionRooms.find(r => r.id === roomId);
    if (!room) return;
    room.currentPlayer = playerId;
    room.currentBid = room.basePrice;
    room.status = 'active';
    App.save();
    App.broadcast({ type: 'BID_UPDATE', payload: { amount: room.currentBid } });
    this.openRoom(roomId);
  },

  nextPlayer(roomId) {
    const room = App.state.auctionRooms.find(r => r.id === roomId);
    if (!room) return;
    const queue = (room.playerQueue || []).filter(pid => !room.soldLog?.some(s => s.playerId === pid) && pid !== room.currentPlayer);
    if (!queue.length) { Toast.show('All players auctioned!', 'success'); return; }
    room.currentPlayer = queue[0];
    room.currentBid = room.basePrice;
    room.status = 'active';
    App.save();
    App.broadcast({ type: 'BID_UPDATE', payload: { amount: room.currentBid } });
    this.openRoom(roomId);
  },

  placeBid(roomId, teamName) {
    const room = App.state.auctionRooms.find(r => r.id === roomId);
    if (!room || !room.currentPlayer) { Toast.show('No player up for bidding', 'error'); return; }
    const team = room.teams.find(t => t.name === teamName);
    if (!team) return;
    const newBid = (room.currentBid || room.basePrice) + (room.increment || 10);
    if (team.budget < newBid) { Toast.show(`${teamName} doesn't have enough budget!`, 'error'); return; }
    room.currentBid = newBid;
    const player = App.state.players.find(p => p.id === room.currentPlayer);
    room.bids.push({ player: player?.name || 'Unknown', team: teamName, amount: newBid, at: now() });
    App.save();
    App.broadcast({ type: 'BID_UPDATE', payload: { amount: newBid } });
    Toast.show(`💰 ${teamName} bids ₹${fmt(newBid)} L!`, 'default');
    this.openRoom(roomId);
  },

  sellPlayer(roomId) {
    const room = App.state.auctionRooms.find(r => r.id === roomId);
    if (!room || !room.currentPlayer) return;
    const lastBid = room.bids?.[room.bids.length - 1];
    if (!lastBid) { Toast.show('No bids placed! Use Pass/Unsold.', 'error'); return; }
    const player = App.state.players.find(p => p.id === room.currentPlayer);
    const team = room.teams.find(t => t.name === lastBid.team);
    if (player) { player.status = 'sold'; player.soldTo = lastBid.team; player.soldAmount = room.currentBid; }
    if (team) { team.players.push({ id: room.currentPlayer, name: player?.name || '', amount: room.currentBid }); team.budget -= room.currentBid; team.spent = (team.spent || 0) + room.currentBid; }
    room.soldLog = room.soldLog || [];
    room.soldLog.push({ playerId: room.currentPlayer, playerName: player?.name || 'Unknown', team: lastBid.team, amount: room.currentBid, at: now() });
    room.currentPlayer = null; room.currentBid = null;
    App.save();
    App.broadcast({ type: 'BID_UPDATE', payload: { amount: 0 } });
    Toast.show(`✅ ${player?.name} SOLD to ${lastBid.team} for ₹${fmt(room.currentBid || 0)} L!`, 'success', 5000);
    this.openRoom(roomId);
  },

  passPlayer(roomId) {
    const room = App.state.auctionRooms.find(r => r.id === roomId);
    if (!room || !room.currentPlayer) return;
    const player = App.state.players.find(p => p.id === room.currentPlayer);
    if (player) { player.status = 'unsold'; }
    room.soldLog = room.soldLog || [];
    room.soldLog.push({ playerId: room.currentPlayer, playerName: player?.name || 'Unknown', team: '—', amount: 0, unsold: true, at: now() });
    room.currentPlayer = null; room.currentBid = null;
    App.save();
    Toast.show(`${player?.name || 'Player'} is UNSOLD.`, 'default');
    this.openRoom(roomId);
  }
};

/* ============================================================
   10. TOURNAMENT (WITH DIRECT START & TOSS)
   ============================================================ */
const Tournament = {
  activeId: null,

  render() {
    const sec = el('section-tournament');
    const ts = App.state.tournaments;
    sec.innerHTML = `<div class="container">
      <div class="section-header">
        <div>
          <h1 class="section-title"><span class="icon">🏆</span> Tournaments</h1>
          <div class="section-subtitle">${ts.length} tournaments organized</div>
        </div>
        <button class="btn btn-primary" onclick="Tournament.openCreate()">+ New Tournament</button>
      </div>
      ${!ts.length ? `<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">No Tournaments Yet</div><div class="empty-desc">Organize your first cricket tournament with automatic scheduling.</div><button class="btn btn-primary" onclick="Tournament.openCreate()">+ Create Tournament</button></div>` :
        `<div class="grid-2">${ts.map(t => this.tournCard(t)).join('')}</div>`}
    </div>`;
  },

  tournCard(t) {
    const matches = App.state.matches.filter(m => m.tournamentId === t.id);
    const live = matches.filter(m => m.status === 'live').length;
    const done = matches.filter(m => m.status === 'completed').length;
    return `<div class="tournament-card" onclick="Tournament.openDetail('${t.id}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">
        <div>
          <div style="font-size:1.15rem;font-weight:800;margin-bottom:.4rem">${escHtml(t.name)}</div>
          <span class="format-badge format-${t.format}">${t.format}</span>
        </div>
        ${live ? `<span class="live-badge"><span class="pulse-dot"></span>LIVE</span>` : ''}
      </div>
      <div style="display:flex;gap:1.5rem;font-size:.85rem;color:var(--text-2);margin-bottom:.75rem">
        <div>👥 ${(t.teams || []).length} Teams</div>
        <div>🏏 ${matches.length} Matches</div>
        <div>✅ ${done} Done</div>
        ${t.overs ? `<div>⚙️ ${t.overs} Overs</div>` : ''}
      </div>
      <div style="font-size:.78rem;color:var(--text-3)">${dateStr(t.createdAt)}</div>
    </div>`;
  },

  openCreate() {
    Modal.open(`
      <h2 class="modal-title">🏆 New Tournament</h2>
      <div class="form-group"><label class="form-label">Tournament Name *</label><input class="form-input" id="t-name" placeholder="Summer Cricket League 2026"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Format *</label>
          <select class="form-select" id="t-format" onchange="Tournament.onFormatChange()">
            <option value="T20">T20 (20 overs)</option>
            <option value="T10">T10 (10 overs)</option>
            <option value="ODI">ODI (50 overs)</option>
            <option value="Test">Test</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Custom Overs</label><input class="form-input" type="number" id="t-overs" placeholder="20" min="1" max="50"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Stage</label>
          <select class="form-select" id="t-stage">
            <option value="round-robin">Round Robin</option>
            <option value="knockout">Knockout</option>
            <option value="group+knockout">Group + Knockout</option>
            <option value="manual">Manual (Direct Matchmaking)</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="t-date"></div>
      </div>
      <div class="form-group"><label class="form-label">Teams (comma-separated) *</label><textarea class="form-textarea" id="t-teams" placeholder="Mumbai Indians, Chennai Super Kings, Kolkata Knight Riders, Delhi Capitals" style="min-height:80px"></textarea><div class="form-hint">Enter at least 2 team names separated by commas.</div></div>
      <button class="btn btn-primary btn-full" onclick="Tournament.create()">Create & Generate Schedule</button>
    `);
    const today = new Date().toISOString().split('T')[0];
    const d = el('t-date'); if (d) d.value = today;
    const o = el('t-overs'); if (o) o.value = '20';
  },

  onFormatChange() {
    const fmt2 = el('t-format')?.value;
    const oEl = el('t-overs');
    if (oEl) { oEl.value = { T20: '20', T10: '10', ODI: '50', Test: '' }[fmt2] || ''; }
  },

  create() {
    const name = el('t-name')?.value?.trim();
    const format = el('t-format')?.value;
    const teamsRaw = el('t-teams')?.value;
    const overs = el('t-overs')?.value;
    const stage = el('t-stage')?.value;
    if (!name) { Toast.show('Tournament name required', 'error'); return; }
    const teams = teamsRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (teams.length < 2) { Toast.show('At least 2 teams needed', 'error'); return; }

    const tourn = {
      id: uid(), name, format, overs: +overs || 20, stage, teams,
      startDate: el('t-date')?.value,
      createdAt: now(),
      stats: { topScorers: [], topWickets: [], mostSixes: [], mostFours: [], potm: {} },
      standings: teams.map(t => ({ team: t, played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: '0.000', runsFor: 0, runsAgainst: 0 })),
    };

    const matchObjects = stage === 'manual' ? [] : this.generateSchedule(tourn);

    App.state.tournaments.push(tourn);
    App.state.matches.push(...matchObjects);
    App.save();
    App.broadcast({ type: 'TOURNAMENT_CREATED', payload: { name } });
    Modal.close();
    Toast.show(`🏆 ${name} created!`, 'success');
    this.render();
    this.openDetail(tourn.id);
  },

  generateSchedule(tourn) {
    const teams = tourn.teams;
    const matches = [];
    let ts = new Date(tourn.startDate || Date.now()).getTime();
    if (tourn.stage === 'knockout') {
      for (let i = 0; i < teams.length - 1; i += 2) {
        matches.push(this.makeMatch(tourn, teams[i], teams[i + 1], new Date(ts)));
        ts += 24 * 60 * 60 * 1000;
      }
    } else {
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          matches.push(this.makeMatch(tourn, teams[i], teams[j], new Date(ts)));
          ts += 24 * 60 * 60 * 1000;
        }
      }
    }
    return matches;
  },

  makeMatch(tourn, t1, t2, date) {
    return {
      id: uid(), tournamentId: tourn.id, team1: t1, team2: t2,
      format: tourn.format, overs: tourn.overs,
      date: new Date(date).toISOString(),
      status: 'upcoming', result: '', playerOfMatch: null,
      innings: [], currentInnings: 0, toss: null,
      commentary: [], createdAt: now(),
    };
  },

  openDetail(id) {
    this.activeId = id;
    const t = App.state.tournaments.find(x => x.id === id);
    if (!t) return;
    const matches = App.state.matches.filter(m => m.tournamentId === id);
    const live = matches.filter(m => m.status === 'live');
    const done = matches.filter(m => m.status === 'completed');
    const upcoming = matches.filter(m => m.status === 'upcoming');

    Modal.open(`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
        <div>
          <h2 style="font-size:1.4rem;font-weight:800">${escHtml(t.name)}</h2>
          <div style="display:flex;gap:.5rem;margin-top:.35rem">
            <span class="format-badge format-${t.format}">${t.format}</span>
            ${t.overs ? `<span class="badge badge-blue">${t.overs} overs</span>` : ''}
            <span class="badge badge-green">${t.stage}</span>
          </div>
        </div>
        ${live.length ? `<span class="live-badge"><span class="pulse-dot"></span>${live.length} LIVE</span>` : ''}
      </div>
      <div class="tabs">
        <div class="tab active" onclick="Tournament.switchTab(this,'td-schedule')">📅 Schedule</div>
        <div class="tab" onclick="Tournament.switchTab(this,'td-standings')">📊 Standings</div>
        <div class="tab" onclick="Tournament.switchTab(this,'td-stats')">⭐ Stats</div>
      </div>
      <div id="td-schedule">
        <div style="margin-bottom: 1rem;">
          <button class="btn btn-outline btn-sm" style="width: 100%; border-style: dashed; padding: 0.75rem" onclick="Tournament.openAddMatch('${t.id}')">➕ Direct Matchmaking (Add Custom Match)</button>
        </div>
        ${live.length ? `<div style="margin-bottom:1rem"><div style="font-size:.8rem;font-weight:700;color:var(--red-2);margin-bottom:.5rem">🔴 LIVE</div>${live.map(m => this.matchRow(m)).join('')}</div>` : ''}
        ${upcoming.length ? `<div style="margin-bottom:1rem"><div style="font-size:.8rem;font-weight:700;color:var(--text-2);margin-bottom:.5rem">UPCOMING</div>${upcoming.slice(0, 10).map(m => this.matchRow(m)).join('')}</div>` : ''}
        ${done.length ? `<div><div style="font-size:.8rem;font-weight:700;color:var(--text-2);margin-bottom:.5rem">COMPLETED</div>${done.slice().reverse().slice(0, 10).map(m => this.matchRow(m)).join('')}</div>` : ''}
      </div>
      <div id="td-standings" style="display:none">${this.standingsTable(t)}</div>
      <div id="td-stats" style="display:none">${this.tournStats(t, matches)}</div>
    `);
  },

  openAddMatch(tournId) {
    const t = App.state.tournaments.find(x => x.id === tournId);
    if (!t) return;
    const teamOpts = t.teams.map(team => `<option value="${escHtml(team)}">${escHtml(team)}</option>`).join('');
    Modal.open(`
      <h2 class="modal-title">➕ Direct Matchmaking</h2>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Team 1</label><select class="form-select" id="dm-t1">${teamOpts}</select></div>
        <div class="form-group"><label class="form-label">Team 2</label><select class="form-select" id="dm-t2">${teamOpts}</select></div>
      </div>
      <div class="form-group"><label class="form-label">Custom Date & Time</label><input class="form-input" type="datetime-local" id="dm-date"></div>
      <button class="btn btn-primary btn-full" onclick="Tournament.saveAddMatch('${tournId}')">Schedule Match</button>
      <button class="btn btn-ghost btn-full mt-2" onclick="Tournament.openDetail('${tournId}')">Cancel</button>
    `);
  },

  saveAddMatch(tournId) {
    const t = App.state.tournaments.find(x => x.id === tournId);
    const t1 = el('dm-t1')?.value;
    const t2 = el('dm-t2')?.value;
    let dateVal = el('dm-date')?.value;

    if (t1 === t2) { Toast.show('Teams must be different', 'error'); return; }
    if (!dateVal) dateVal = now();

    const newMatch = this.makeMatch(t, t1, t2, dateVal);
    App.state.matches.push(newMatch);
    App.save();
    Toast.show('✅ Custom match added to schedule!', 'success');
    this.openDetail(tournId);
  },

  editMatchDate(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const dateFormatted = new Date(match.date).toISOString().slice(0, 16);
    Modal.open(`
      <h2 class="modal-title">📅 Reschedule Match</h2>
      <div style="font-weight: 700; margin-bottom: 1rem; text-align: center;">${escHtml(match.team1)} vs ${escHtml(match.team2)}</div>
      <div class="form-group"><label class="form-label">New Date & Time</label><input class="form-input" type="datetime-local" id="edit-date" value="${dateFormatted}"></div>
      <button class="btn btn-primary btn-full" onclick="Tournament.saveMatchDate('${matchId}')">Save Date</button>
      <button class="btn btn-ghost btn-full mt-2" onclick="Tournament.openDetail('${match.tournamentId}')">Cancel</button>
    `);
  },

  saveMatchDate(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    const newDate = el('edit-date')?.value;
    if (match && newDate) {
      match.date = new Date(newDate).toISOString();
      App.save();
      Toast.show('✅ Date updated successfully!', 'success');
      this.openDetail(match.tournamentId);
    }
  },

  matchRow(m) {
    const isUpcoming = m.status === 'upcoming';
    const clickAction = isUpcoming ? `Tournament.promptStartMatch('${m.id}')` : `QuickMatch.openScoring('${m.id}')`;

    return `<div class="match-row" onclick="${clickAction}">
      <div class="match-teams-row">
        <span class="match-team-name">${escHtml(m.team1)}</span>
        <span class="match-vs">vs</span>
        <span class="match-team-name">${escHtml(m.team2)}</span>
      </div>
      <div>
        ${m.innings?.length ? `<span class="match-score-row">${m.innings.map(i => `${i.total}/${i.wickets} (${i.overs || 0})`).join(' | ')}</span>` : ''}
        ${m.result ? `<div style="font-size:.75rem;color:var(--text-2)">${escHtml(m.result)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
        <span class="match-date">${dateStr(m.date)} ${isUpcoming ? `<span style="cursor:pointer; padding: 2px" onclick="event.stopPropagation(); Tournament.editMatchDate('${m.id}')">✏️</span>` : ''}</span>
        <span class="match-status-badge ${m.status === 'live' ? 'match-live' : m.status === 'completed' ? 'match-done' : 'match-upcoming'}">${m.status === 'live' ? '● LIVE' : m.status === 'completed' ? '✓ Done' : 'Upcoming'}</span>
      </div>
    </div>`;
  },

  promptStartMatch(matchId) {
    const m = App.state.matches.find(x => x.id === matchId);
    if (!m) return;
    Modal.open(`
      <h2 class="modal-title">🏏 Start Match?</h2>
      <p style="text-align:center; margin-bottom: 1rem; color: var(--text-2); font-size: 0.9rem;">
        Do you want to start the match between <strong>${escHtml(m.team1)}</strong> and <strong>${escHtml(m.team2)}</strong> right now?
      </p>
      
      <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1.5rem">
        <div style="font-size:.82rem;font-weight:700;margin-bottom:.5rem">🪙 Quick Toss</div>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="tm-toss-winner" value="${escHtml(m.team1)}" checked><span>${escHtml(m.team1)}</span></label>
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="tm-toss-winner" value="${escHtml(m.team2)}"><span>${escHtml(m.team2)}</span></label>
        </div>
        <div style="display:flex;gap:.75rem;margin-top:.75rem;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="tm-toss-choice" value="bat" checked><span>Bat First</span></label>
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="tm-toss-choice" value="bowl"><span>Bowl First</span></label>
        </div>
      </div>
      
      <div style="display:flex; gap: .5rem;">
        <button class="btn btn-primary btn-full" onclick="Tournament.startMatch('${matchId}')">Yes, Start Match</button>
        <button class="btn btn-ghost btn-full" onclick="${m.tournamentId ? `Tournament.openDetail('${m.tournamentId}')` : 'Modal.close()'}">No, Cancel</button>
      </div>
    `);
  },

  startMatch(matchId) {
    const match = App.state.matches.find(x => x.id === matchId);
    if (!match) return;

    const tossWinner = document.querySelector('input[name="tm-toss-winner"]:checked')?.value || match.team1;
    const tossChoice = document.querySelector('input[name="tm-toss-choice"]:checked')?.value || 'bat';

    let bat1, bat2;
    if (tossWinner === match.team1 && tossChoice === 'bat') { bat1 = match.team1; bat2 = match.team2; }
    else if (tossWinner === match.team1 && tossChoice === 'bowl') { bat1 = match.team2; bat2 = match.team1; }
    else if (tossWinner === match.team2 && tossChoice === 'bat') { bat1 = match.team2; bat2 = match.team1; }
    else { bat1 = match.team1; bat2 = match.team2; }

    const getPlayers = (team) => {
      return Array.from({ length: 11 }, (_, i) => ({ name: `${team} P${i + 1}`, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, how: '', notout: true }));
    };

    match.toss = { winner: tossWinner, chose: tossChoice };
    match.battingFirst = bat1;
    match.bowlingFirst = bat2;
    match.status = 'live';
    match.innings = [{
      battingTeam: bat1, bowlingTeam: bat2,
      batting: getPlayers(bat1),
      bowling: getPlayers(bat2).map(p => ({ ...p, overs: 0, overBalls: 0, runs: 0, wickets: 0, maidens: 0 })),
      total: 0, wickets: 0, balls: 0, overs: 0,
      extras: { wide: 0, noBall: 0, bye: 0, legBye: 0 },
      fallOfWickets: [], currentOver: [],
      striker: 0, nonStriker: 1, bowlerIdx: 0,
    }];
    match.currentInnings = 0;
    match.playerXI = { [match.team1]: getPlayers(match.team1).map(p => p.name), [match.team2]: getPlayers(match.team2).map(p => p.name) };

    App.save();
    App.broadcast({ type: 'MATCH_CREATED', payload: { name: `${match.team1} vs ${match.team2}` } });
    Modal.close();
    Toast.show(`🏏 Match started! ${bat1} is batting first.`, 'success');
    QuickMatch.openScoring(matchId);
  },

  switchTab(btn, showId) {
    btn.closest('.modal-body')?.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['td-schedule', 'td-standings', 'td-stats'].forEach(id => {
      const e = el(id); if (e) e.style.display = id === showId ? 'block' : 'none';
    });
  },

  standingsTable(t) {
    const rows = [...(t.standings || [])].sort((a, b) => b.points - a.points || parseFloat(b.nrr) - parseFloat(a.nrr));
    if (!rows.length) return '<div class="empty-state" style="padding:1rem"><div class="empty-title">No standings yet</div></div>';
    return `<div class="table-wrap"><table class="points-table">
      <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>NRR</th></tr></thead>
      <tbody>
      ${rows.map((r, i) => `<tr>
        <td><span class="rank-badge rank-${i + 1 <= 3 ? i + 1 : ''}" style="${i >= 3 ? 'color:var(--text-3)' : ''}>${i + 1}</span></td>
        <td style="font-weight:700">${escHtml(r.team)}</td>
        <td>${r.played}</td><td class="text-green">${r.won}</td>
        <td class="text-red">${r.lost}</td><td>${r.tied}</td>
        <td style="font-weight:800;color:var(--gold)">${r.points}</td>
        <td class="${parseFloat(r.nrr) >= 0 ? 'nrr-pos' : 'nrr-neg'}">${r.nrr || '0.000'}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>`;
  },

  tournStats(t, matches) {
    const done = matches.filter(m => m.status === 'completed');
    if (!done.length) return `<div class="empty-state" style="padding:1rem"><div class="empty-title">Stats will appear after matches are completed</div></div>`;
    const playerMap = {};
    done.forEach(m => {
      m.innings?.forEach(inn => {
        inn.batting?.forEach(b => {
          if (!playerMap[b.name]) playerMap[b.name] = { name: b.name, runs: 0, balls: 0, sixes: 0, fours: 0, wickets: 0, matches: 0, potm: 0, ducks: 0 };
          playerMap[b.name].runs += b.runs || 0;
          playerMap[b.name].balls += b.balls || 0;
          playerMap[b.name].sixes += b.sixes || 0;
          playerMap[b.name].fours += b.fours || 0;
          playerMap[b.name].matches += 1;
          if ((b.runs || 0) === 0 && b.out) playerMap[b.name].ducks++;
        });
        inn.bowling?.forEach(bw => {
          if (!playerMap[bw.name]) playerMap[bw.name] = { name: bw.name, runs: 0, balls: 0, sixes: 0, fours: 0, wickets: 0, matches: 0, potm: 0, ducks: 0 };
          playerMap[bw.name].wickets += bw.wickets || 0;
        });
      });
      if (m.playerOfMatch) { if (!playerMap[m.playerOfMatch]) playerMap[m.playerOfMatch] = { name: m.playerOfMatch, runs: 0, balls: 0, sixes: 0, fours: 0, wickets: 0, matches: 0, potm: 0, ducks: 0 }; playerMap[m.playerOfMatch].potm++; }
    });
    const list = Object.values(playerMap);
    const topRuns = [...list].sort((a, b) => b.runs - a.runs).slice(0, 5);
    const topWkts = [...list].sort((a, b) => b.wickets - a.wickets).slice(0, 5);
    const mostSixes = [...list].sort((a, b) => b.sixes - a.sixes).slice(0, 3);
    const mostFours = [...list].sort((a, b) => b.fours - a.fours).slice(0, 3);
    const emerging = [...list].filter(p => p.matches >= 1).sort((a, b) => ((b.runs + (b.wickets * 20)) / b.matches) - ((a.runs + (a.wickets * 20)) / a.matches))[0];
    const potm = [...list].sort((a, b) => b.potm - a.potm)[0];
    return `
    <div class="grid-2" style="margin-bottom:1.5rem">
      ${potm?.potm ? `<div class="stats-award-card"><div class="award-icon">🏆</div><div class="award-title">PLAYER OF THE SERIES</div><div class="award-player">${escHtml(potm.name)}</div><div class="award-value">${potm.potm}× POTM Awards</div></div>` : ''}
      ${emerging ? `<div class="stats-award-card"><div class="award-icon">⭐</div><div class="award-title">EMERGING PLAYER</div><div class="award-player">${escHtml(emerging.name)}</div><div class="award-value">${emerging.runs} runs • ${emerging.wickets} wkts</div></div>` : ''}
    </div>
    <div class="grid-2" style="margin-bottom:1rem">
      ${mostSixes[0] ? `<div class="stats-award-card"><div class="award-icon">💥</div><div class="award-title">MOST SIXES</div><div class="award-player">${escHtml(mostSixes[0].name)}</div><div class="award-value">${mostSixes[0].sixes} Sixes</div></div>` : ''}
      ${mostFours[0] ? `<div class="stats-award-card"><div class="award-icon">🎯</div><div class="award-title">MOST FOURS</div><div class="award-player">${escHtml(mostFours[0].name)}</div><div class="award-value">${mostFours[0].fours} Fours</div></div>` : ''}
    </div>
    <div style="font-weight:700;margin-bottom:.75rem;font-size:.9rem">🏏 Top Run Scorers</div>
    <div class="card card-sm" style="margin-bottom:1rem">
      ${topRuns.map((p, i) => `<div class="stat-row">
        <div class="stat-rank">${i + 1}</div>
        <div class="stat-avatar">${this.getEmoji(p.name)}</div>
        <div class="stat-info"><div class="stat-player-name">${escHtml(p.name)}</div><div class="stat-player-meta">${p.matches} innings • SR: ${p.balls ? ((p.runs / p.balls) * 100).toFixed(1) : '0'}</div></div>
        <div class="stat-value">${p.runs}</div>
      </div>`).join('')}
    </div>
    <div style="font-weight:700;margin-bottom:.75rem;font-size:.9rem">🎳 Top Wicket Takers</div>
    <div class="card card-sm">
      ${topWkts.map((p, i) => `<div class="stat-row">
        <div class="stat-rank">${i + 1}</div>
        <div class="stat-avatar">${this.getEmoji(p.name)}</div>
        <div class="stat-info"><div class="stat-player-name">${escHtml(p.name)}</div><div class="stat-player-meta">${p.matches} matches</div></div>
        <div class="stat-value">${p.wickets}</div>
      </div>`).join('')}
    </div>`;
  },

  getEmoji(name) {
    const emojis = ['🏏', '🎳', '⚡', '🧤', '🌟', '🦁', '🔥', '💪', '👑', '🦅'];
    return emojis[(name?.charCodeAt(0) || 0) % emojis.length];
  },

  updateStandings(matchId) {
    const m = App.state.matches.find(x => x.id === matchId);
    if (!m || !m.tournamentId) return;
    const t = App.state.tournaments.find(x => x.id === m.tournamentId);
    if (!t) return;
    t.standings = t.standings || [];
    const getRow = (team) => { let r = t.standings.find(s => s.team === team); if (!r) { r = { team, played: 0, won: 0, lost: 0, tied: 0, points: 0, nrr: '0.000', runsFor: 0, runsAgainst: 0 }; t.standings.push(r); } return r; };
    const r1 = getRow(m.team1); const r2 = getRow(m.team2);
    r1.played++; r2.played++;
    const inn1 = m.innings?.[0]; const inn2 = m.innings?.[1];
    if (inn1) { r1.runsFor = (r1.runsFor || 0) + (inn1.total || 0); r2.runsAgainst = (r2.runsAgainst || 0) + (inn1.total || 0); }
    if (inn2) { r2.runsFor = (r2.runsFor || 0) + (inn2.total || 0); r1.runsAgainst = (r1.runsAgainst || 0) + (inn2.total || 0); }
    if (m.winner === m.team1) { r1.won++; r1.points += 2; r2.lost++; }
    else if (m.winner === m.team2) { r2.won++; r2.points += 2; r1.lost++; }
    else { r1.tied++; r2.tied++; r1.points++; r2.points++; }
    const calcNRR = (r) => { const f = r.runsFor / (r.played || 1); const a = r.runsAgainst / (r.played || 1); return (f - a).toFixed(3); };
    r1.nrr = calcNRR(r1); r2.nrr = calcNRR(r2);
  }
};

/* ============================================================
   11. QUICK MATCH & LIVE SCORING
   ============================================================ */
const QuickMatch = {
  render() {
    const sec = el('section-quickmatch');
    const matches = App.state.matches.filter(m => !m.tournamentId);
    sec.innerHTML = `<div class="container">
      <div class="section-header">
        <div>
          <h1 class="section-title"><span class="icon">⚡</span> Quick Match</h1>
          <div class="section-subtitle">Set up & score a match in under 60 seconds</div>
        </div>
        <button class="btn btn-primary" onclick="QuickMatch.openCreate()">+ New Match</button>
      </div>
      <div class="grid-2">
        <div class="card" style="text-align:center;padding:2.5rem">
          <div style="font-size:3rem;margin-bottom:1rem">⚡</div>
          <h3 style="font-weight:800;margin-bottom:.5rem">Quick Match</h3>
          <p style="color:var(--text-2);font-size:.88rem;margin-bottom:1.5rem;line-height:1.6">Set up a casual match with any players. Live scoring, commentary, and full scorecard.</p>
          <button class="btn btn-primary btn-full" onclick="QuickMatch.openCreate()">Set Up Match</button>
        </div>
        <div class="card" style="text-align:center;padding:2.5rem">
          <div style="font-size:3rem;margin-bottom:1rem">🤖</div>
          <h3 style="font-weight:800;margin-bottom:.5rem">Simulated Match</h3>
          <p style="color:var(--text-2);font-size:.88rem;margin-bottom:1.5rem;line-height:1.6">Auto-simulate a cricket match with generated scores and statistics.</p>
          <button class="btn btn-outline btn-full" onclick="QuickMatch.simulate()">Simulate Match</button>
        </div>
      </div>
      ${matches.length ? `
      <div class="section-header mt-3"><h2 class="section-title">🏏 Your Matches</h2></div>
      <div style="display:flex;flex-direction:column;gap:.5rem">
        ${matches.slice().reverse().map(m => Tournament.matchRow(m)).join('')}
      </div>`: ''}
    </div>`;
  },

  openCreate() {
    Modal.open(`
      <h2 class="modal-title">⚡ Quick Match Setup</h2>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Team 1 Name *</label><input class="form-input" id="qm-t1" placeholder="Team Alpha"></div>
        <div class="form-group"><label class="form-label">Team 2 Name *</label><input class="form-input" id="qm-t2" placeholder="Team Beta"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Format</label>
          <select class="form-select" id="qm-format" onchange="QuickMatch.onFmtChange()">
            <option value="T20">T20 (20 overs)</option><option value="T10">T10 (10 overs)</option>
            <option value="ODI">ODI (50 overs)</option><option value="Custom">Custom</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Overs *</label><input class="form-input" type="number" id="qm-overs" value="20" min="1" max="50"></div>
      </div>
      <div class="form-group"><label class="form-label">Team 1 Players (comma-separated)</label><textarea class="form-textarea" id="qm-t1p" placeholder="Rohit, Virat, KL Rahul, Hardik, Jadeja, Dhoni, Bumrah, Shami, Kuldeep, Siraj, Axar"></textarea></div>
      <div class="form-group"><label class="form-label">Team 2 Players (comma-separated)</label><textarea class="form-textarea" id="qm-t2p" placeholder="Warner, Head, Smith, Inglis, Maxwell, Stoinis, Cummins, Starc, Hazlewood, Zampa, Green"></textarea></div>
      <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1rem">
        <div style="font-size:.82rem;font-weight:700;margin-bottom:.5rem">⚙️ Toss</div>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="toss-winner" id="toss-t1" value="t1"><span id="toss-t1-lbl">Team 1</span></label>
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="toss-winner" id="toss-t2" value="t2"><span id="toss-t2-lbl">Team 2</span></label>
        </div>
        <div style="display:flex;gap:.75rem;margin-top:.5rem;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="toss-choice" id="tc-bat" value="bat"><span>Bat First</span></label>
          <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer"><input type="radio" name="toss-choice" id="tc-bowl" value="bowl"><span>Bowl First</span></label>
        </div>
      </div>
      <button class="btn btn-primary btn-full" onclick="QuickMatch.create()">🏏 Start Match & Score Live</button>
    `);
    ['qm-t1', 'qm-t2'].forEach((id, i) => {
      el(id)?.addEventListener('input', () => {
        const lbl = el(`toss-t${i + 1}-lbl`);
        if (lbl) lbl.textContent = el(id).value || `Team ${i + 1}`;
      });
    });
    const t1r = el('toss-t1'); if (t1r) t1r.checked = true;
    const tc = el('tc-bat'); if (tc) tc.checked = true;
  },

  onFmtChange() {
    const fmt2 = el('qm-format')?.value;
    const oEl = el('qm-overs');
    if (oEl && fmt2 !== 'Custom') oEl.value = { T20: '20', T10: '10', ODI: '50' }[fmt2] || '20';
  },

  create() {
    const t1 = el('qm-t1')?.value?.trim();
    const t2 = el('qm-t2')?.value?.trim();
    if (!t1 || !t2) { Toast.show('Both team names required', 'error'); return; }
    if (t1 === t2) { Toast.show('Teams must have different names', 'error'); return; }
    const overs = +(el('qm-overs')?.value || 20);
    const format = el('qm-format')?.value;
    const t1players = (el('qm-t1p')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const t2players = (el('qm-t2p')?.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const tossWinner = document.querySelector('input[name="toss-winner"]:checked')?.value === 't2' ? t2 : t1;
    const tossChoice = document.querySelector('input[name="toss-choice"]:checked')?.value || 'bat';
    let bat1, bat2;
    if (tossWinner === t1 && tossChoice === 'bat') { bat1 = t1; bat2 = t2; }
    else if (tossWinner === t1 && tossChoice === 'bowl') { bat1 = t2; bat2 = t1; }
    else if (tossWinner === t2 && tossChoice === 'bat') { bat1 = t2; bat2 = t1; }
    else { bat1 = t1; bat2 = t2; }
    const getPlayers = (team, names) => {
      if (names.length) return names.map(n => ({ name: n, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, how: '', notout: true }));
      return Array.from({ length: 11 }, (_, i) => ({ name: `${team} P${i + 1}`, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, how: '', notout: true }));
    };
    const match = {
      id: uid(), team1: t1, team2: t2, format, overs,
      toss: { winner: tossWinner, chose: tossChoice },
      battingFirst: bat1, bowlingFirst: bat2,
      status: 'live',
      innings: [{
        battingTeam: bat1, bowlingTeam: bat2,
        batting: getPlayers(bat1, bat1 === t1 ? t1players : t2players),
        bowling: getPlayers(bat2, bat1 === t1 ? t2players : t1players).map(p => ({ ...p, overs: 0, overBalls: 0, runs: 0, wickets: 0, maidens: 0 })),
        total: 0, wickets: 0, balls: 0, overs: 0,
        extras: { wide: 0, noBall: 0, bye: 0, legBye: 0 },
        fallOfWickets: [], currentOver: [],
        striker: 0, nonStriker: 1, bowlerIdx: 0,
      }],
      currentInnings: 0,
      playerOfMatch: null, result: '', commentary: [],
      playerXI: { [t1]: getPlayers(t1, t1players).map(p => p.name), [t2]: getPlayers(t2, t2players).map(p => p.name) },
      createdAt: now(),
    };
    App.state.matches.push(match);
    App.save();
    App.broadcast({ type: 'MATCH_CREATED', payload: { name: `${t1} vs ${t2}` } });
    Modal.close();
    updateLivePill();
    Toast.show(`🏏 Match started! ${bat1} batting first.`, 'success');
    this.openScoring(match.id);
  },

  simulate() {
    const teamPairs = [['India', 'Australia'], ['Pakistan', 'England'], ['South Africa', 'New Zealand'], ['West Indies', 'Sri Lanka']];
    const [t1, t2] = teamPairs[Math.floor(Math.random() * teamPairs.length)];
    const names1 = ['Rohit', 'Virat', 'KL Rahul', 'Hardik', 'Jadeja', 'Dhoni', 'Bumrah', 'Shami', 'Kuldeep', 'Siraj', 'Axar'];
    const names2 = ['Warner', 'Head', 'Smith', 'Inglis', 'Maxwell', 'Stoinis', 'Cummins', 'Starc', 'Hazlewood', 'Zampa', 'Green'];
    const randScore = () => Math.floor(Math.random() * 180) + 80;
    const randWkts = (s) => Math.floor(Math.random() * (s > 150 ? 5 : 9)) + 1;
    const s1 = randScore(); const w1 = randWkts(s1);
    const s2 = randScore(); const w2 = randWkts(s2);
    const overs = 20;
    const winner = s1 > s2 ? t1 : (s2 > s1 ? t2 : 'Tie');
    const result = s1 > s2 ? `${t1} won by ${s1 - s2} runs` : (s2 > s1 ? `${t2} won by ${11 - w2} wickets` : 'Match tied');
    const potm = names1[Math.floor(Math.random() * 11)];
    const buildBatting = (names, runs) => {
      let rem = runs; const bat = names.map((name, i) => {
        const r = i < names.length - 1 ? Math.floor(Math.random() * rem * 0.3) : rem;
        rem -= r;
        const b = Math.max(r, Math.floor(r * 0.8 + Math.random() * 10));
        const sixes = Math.floor(r / 30); const fours = Math.floor(r / 15);
        return { name, runs: r, balls: b, fours, sixes, out: true, how: 'b Bowler' };
      });
      return bat;
    };
    const buildBowling = (names) => names.slice(0, 5).map(name => ({ name, overs: 4, runs: Math.floor(Math.random() * 40) + 20, wickets: Math.floor(Math.random() * 3), maidens: Math.floor(Math.random() * 2) }));
    const match = {
      id: uid(), team1: t1, team2: t2, format: 'T20', overs,
      toss: { winner: t1, chose: 'bat' }, battingFirst: t1, bowlingFirst: t2,
      status: 'completed', result, winner, playerOfMatch: potm,
      innings: [
        { battingTeam: t1, bowlingTeam: t2, batting: buildBatting(names1, s1), bowling: buildBowling(names2), total: s1, wickets: w1, overs, extras: { wide: 5, noBall: 2, bye: 1, legBye: 2 }, fallOfWickets: [], currentOver: [] },
        { battingTeam: t2, bowlingTeam: t1, batting: buildBatting(names2, s2), bowling: buildBowling(names1), total: s2, wickets: w2, overs, extras: { wide: 4, noBall: 1, bye: 2, legBye: 1 }, fallOfWickets: [], currentOver: [] },
      ],
      currentInnings: 1, commentary: [], createdAt: now(),
    };
    App.state.matches.push(match);
    App.save();
    Toast.show(`🤖 Simulated: ${result}`, 'success');
    this.render();
    navigate('scores');
    setTimeout(() => Scores.viewScorecard(match.id), 300);
  },

  openScoring(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    App.state.activeScoringMatchId = matchId;
    if (match.status === 'completed') { Scores.viewScorecard(matchId); return; }
    const overlay = el('scoring-overlay');
    overlay.classList.add('active');
    this.renderScoringPanel(matchId);
  },

  closeScoring() {
    el('scoring-overlay').classList.remove('active');
    el('scoring-panel').innerHTML = '';
    App.state.activeScoringMatchId = null;
  },

  renderScoringPanel(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const ci = match.currentInnings || 0;
    const inn = match.innings?.[ci];
    if (!inn) return;
    const striker = inn.batting?.[inn.striker || 0];
    const nonStriker = inn.batting?.[inn.nonStriker || 1];
    const bowler = inn.bowling?.[inn.bowlerIdx || 0];
    const overs = Math.floor((inn.balls || 0) / 6);
    const ballsInOver = (inn.balls || 0) % 6;
    const target = ci === 1 ? (match.innings?.[0]?.total || 0) + 1 : null;
    const required = target ? target - (inn.total || 0) : null;
    const runsInOver = (inn.currentOver || []).reduce((a, b) => a + (b.runs || 0), 0);
    const panel = el('scoring-panel');
    panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:.75rem">
      <div>
        <div style="font-size:1.1rem;font-weight:800">${escHtml(match.team1)} vs ${escHtml(match.team2)}</div>
        <div style="font-size:.8rem;color:var(--text-2)">${match.format} • ${match.overs} overs • <span style="color:var(--gold)">${inn.battingTeam}</span> batting</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-outline btn-sm" onclick="Scores.viewScorecard('${matchId}')">📊 Full Card</button>
        <button class="btn btn-ghost btn-sm" onclick="QuickMatch.closeScoring()">✕ Close</button>
      </div>
    </div>

    <div class="scoring-live-score">
      <div class="scoring-total">${inn.total || 0}/${inn.wickets || 0}</div>
      <div class="scoring-meta">
        ${match.format} • Over ${overs}.${ballsInOver} of ${match.overs}
        ${target ? `• Need ${required} from ${(match.overs - overs) * 6 - ballsInOver} balls` : ''}
        • CRR: ${inn.balls ? ((inn.total || 0) / (inn.balls / 6)).toFixed(2) : '0.00'}
        ${target && inn.balls > 6 ? ` • RRR: ${((required || 0) / ((match.overs - (inn.balls / 6)) || 1)).toFixed(2)}` : ' '}
      </div>
      <div style="margin-top:.75rem">
        <div style="font-size:.78rem;font-weight:700;color:var(--text-3);margin-bottom:.4rem">THIS OVER (${runsInOver} runs)</div>
        <div class="over-balls">${(inn.currentOver || []).map(b => this.ballChip(b)).join('')}</div>
      </div>
    </div>

    <div class="scoring-batsmen">
      <div class="batsman-box striker">
        <div style="font-size:.7rem;font-weight:700;color:var(--gold);margin-bottom:.35rem">⚡ STRIKER</div>
        <div class="batsman-name">${escHtml(striker?.name || '—')}</div>
        <div class="batsman-score">${striker?.runs || 0}</div>
        <div class="batsman-balls">${striker?.balls || 0} balls • SR: ${striker?.balls ? ((striker.runs / striker.balls) * 100).toFixed(1) : '0'}</div>
        <div style="font-size:.75rem;color:var(--text-3);margin-top:.25rem">${striker?.fours || 0}×4 • ${striker?.sixes || 0}×6</div>
      </div>
      <div class="batsman-box">
        <div style="font-size:.7rem;font-weight:700;color:var(--text-3);margin-bottom:.35rem">NON-STRIKER</div>
        <div class="batsman-name">${escHtml(nonStriker?.name || '—')}</div>
        <div class="batsman-score">${nonStriker?.runs || 0}</div>
        <div class="batsman-balls">${nonStriker?.balls || 0} balls</div>
      </div>
    </div>

    <div class="bowler-box">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:.7rem;font-weight:700;color:var(--text-3);margin-bottom:.25rem">BOWLING</div>
          <div style="font-weight:700">${escHtml(bowler?.name || '—')}</div>
        </div>
        <div style="text-align:right;font-size:.85rem;color:var(--text-2)">
          ${bowler?.overs || 0}-${bowler?.maidens || 0}-${bowler?.runs || 0}-${bowler?.wickets || 0}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="QuickMatch.changeBowler('${matchId}')">Change</button>
      </div>
    </div>

    <div class="ball-buttons">
      ${['0', '1', '2', '3', '4', '6'].map(v => `<button class="ball-btn ball-btn-${v}" onclick="QuickMatch.addBall('${matchId}',${v},'run')">${v}</button>`).join('')}
      <button class="ball-btn ball-btn-W" onclick="QuickMatch.addWicket('${matchId}')">W</button>
      <button class="ball-btn ball-btn-Wd" onclick="QuickMatch.addBall('${matchId}',1,'wide')">Wd</button>
      <button class="ball-btn ball-btn-Nb" onclick="QuickMatch.addBall('${matchId}',1,'noball')">Nb</button>
      <button class="ball-btn ball-btn-0" onclick="QuickMatch.addBall('${matchId}',1,'bye')">Bye</button>
      <button class="ball-btn ball-btn-0" onclick="QuickMatch.addBall('${matchId}',1,'legbye')">Lb</button>
      <button class="btn btn-outline" onclick="QuickMatch.undoLast('${matchId}')" style="font-size:.78rem">⬅ Undo</button>
    </div>

    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
      <button class="btn btn-outline btn-sm" onclick="QuickMatch.changeBatsmen('${matchId}')">🔄 Swap Striker</button>
      ${ci === 0 && inn.overs >= (match.overs) ? `<button class="btn btn-green btn-sm" onclick="QuickMatch.endInnings('${matchId}')">⏭ End Innings</button>` : ''}
      ${ci === 1 ? `<button class="btn btn-red btn-sm" onclick="QuickMatch.declareResult('${matchId}')">🏆 End Match</button>` : ''}
    </div>

    <div class="commentary-feed" id="commentary-feed">
      ${(match.commentary || []).slice(-15).reverse().map(c => `<div class="commentary-item"><span class="ball-label">${c.over}</span> ${escHtml(c.text)}</div>`).join('')}
      ${!(match.commentary || []).length ? '<div style="color:var(--text-3);font-size:.82rem;text-align:center">Commentary will appear here…</div>' : ''}
    </div>`;
  },

  ballChip(b) {
    const cls = b.wicket ? 'W' : b.type === 'wide' ? 'Wd' : b.type === 'noball' ? 'Nb' : b.runs >= 6 ? '6' : b.runs >= 4 ? '4' : b.runs || '0';
    const label = b.wicket ? 'W' : b.type === 'wide' ? 'wd' : b.type === 'noball' ? 'nb' : b.runs;
    return `<div class="ball-chip ball-${cls}">${label}</div>`;
  },

  addBall(matchId, runs, type) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const ci = match.currentInnings || 0;
    const inn = match.innings?.[ci];
    if (!inn) return;
    const striker = inn.batting?.[inn.striker || 0];
    const bowler = inn.bowling?.[inn.bowlerIdx || 0];
    const isExtra = ['wide', 'noball', 'bye', 'legbye'].includes(type);

    inn.total = (inn.total || 0) + runs;
    if (type === 'wide') { inn.extras.wide = (inn.extras.wide || 0) + 1; }
    else if (type === 'noball') { inn.extras.noBall = (inn.extras.noBall || 0) + 1; }
    else if (type === 'bye') { inn.extras.bye = (inn.extras.bye || 0) + 1; }
    else if (type === 'legbye') { inn.extras.legBye = (inn.extras.legBye || 0) + 1; }

    if (!isExtra || type === 'noball') {
      if (striker) {
        if (type === 'run' || type === 'noball') {
          striker.runs = (striker.runs || 0) + runs;
          if (runs === 4) striker.fours = (striker.fours || 0) + 1;
          if (runs === 6) striker.sixes = (striker.sixes || 0) + 1;
        }
        striker.balls = (striker.balls || 0) + 1;
      }
    }

    if (bowler) {
      bowler.runs = (bowler.runs || 0) + runs;
      if (!isExtra || type === 'noball') bowler.overBalls = (bowler.overBalls || 0) + 1;
    }

    const ballObj = { runs, type, wicket: false };
    inn.currentOver = inn.currentOver || [];
    if (!isExtra || type === 'noball') { inn.balls = (inn.balls || 0) + 1; inn.currentOver.push(ballObj); }
    else { inn.currentOver.push(ballObj); }

    if ((runs % 2 === 1) && (type === 'run' || type === 'bye' || type === 'legbye' || type === 'noball')) {
      this.swapStrike(inn);
    }

    const overs = Math.floor((inn.balls || 0) / 6);
    const ballsInOver = (inn.balls || 0) % 6;
    const overStr = `${overs - 1 + (ballsInOver === 0 ? 1 : 0)}.${ballsInOver === 0 ? 6 : ballsInOver}`;

    const target = ci === 1 ? (match.innings?.[0]?.total || 0) + 1 : null;
    const required = target ? target - (inn.total || 0) : null;
    const ballsLeft = (match.overs * 6) - (inn.balls || 0);
    const rrr = target && ballsLeft > 0 ? ((required / ballsLeft) * 6).toFixed(1) : null;

    const comText = this.generateSmartCommentary(type, runs, striker?.name || 'Batsman', bowler?.name || 'Bowler', required, ballsLeft, rrr);

    match.commentary = match.commentary || [];
    match.commentary.push({ over: overStr, text: comText });

    if (!isExtra && inn.balls % 6 === 0 && inn.balls > 0) {
      inn.overs = Math.floor(inn.balls / 6);
      if (bowler) { bowler.overs = (bowler.overs || 0) + 1; bowler.overBalls = 0; }
      inn.currentOver = [];
      this.swapStrike(inn);
    }

    App.save();
    App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } });
    updateLivePill();
    if ((inn.wickets || 0) >= 10 || inn.balls >= match.overs * 6) {
      this.promptEndInnings(matchId);
      return;
    }
    this.renderScoringPanel(matchId);
  },

  addWicket(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const ci = match.currentInnings || 0;
    const inn = match.innings?.[ci];
    if (!inn) return;
    if ((inn.wickets || 0) >= 10) { Toast.show('All out!', 'error'); return; }
    Modal.open(`
      <h2 class="modal-title">🎳 Wicket!</h2>
      <div class="form-group"><label class="form-label">Dismissal Type</label>
        <select class="form-select" id="w-type">
          <option>Caught</option><option>Bowled</option><option>LBW</option><option>Run Out</option><option>Stumped</option><option>Hit Wicket</option><option>Caught & Bowled</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Fielder (for catches/run-out)</label><input class="form-input" id="w-fielder" placeholder="Fielder name"></div>
      <div class="form-group"><label class="form-label">Runs (before wicket on this ball)</label><input class="form-input" type="number" id="w-runs" value="0" min="0" max="6"></div>
      <div class="form-group"><label class="form-label">Next Batsman Name</label><input class="form-input" id="w-next" placeholder="${escHtml(inn.batting?.[inn.wickets + 2]?.name || 'New Batsman')}"></div>
      <button class="btn btn-red btn-full" onclick="QuickMatch.confirmWicket('${matchId}')">Confirm Wicket</button>
    `);
  },

  confirmWicket(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const ci = match.currentInnings || 0;
    const inn = match.innings?.[ci];
    if (!inn) return;
    const type = el('w-type')?.value;
    const fielder = el('w-fielder')?.value?.trim();
    const runs = +(el('w-runs')?.value || 0);
    const nextName = el('w-next')?.value?.trim();
    const striker = inn.batting?.[inn.striker || 0];
    const bowler = inn.bowling?.[inn.bowlerIdx || 0];
    if (striker) {
      striker.out = true;
      striker.how = fielder ? `${type} ${fielder}` : type;
      striker.runs = (striker.runs || 0) + runs;
      striker.balls = (striker.balls || 0) + 1;
    }
    if (bowler && !['Run Out', 'Obstructing the Field'].includes(type)) bowler.wickets = (bowler.wickets || 0) + 1;
    inn.wickets = (inn.wickets || 0) + 1;
    inn.balls = (inn.balls || 0) + 1;
    inn.total = (inn.total || 0) + runs;
    if (bowler) { bowler.runs = (bowler.runs || 0) + runs; bowler.overBalls = (bowler.overBalls || 0) + 1; }
    inn.currentOver = inn.currentOver || [];
    inn.currentOver.push({ runs, type: 'run', wicket: true });
    const newBatIdx = inn.wickets + 1;
    if (nextName && inn.batting?.[newBatIdx]) inn.batting[newBatIdx].name = nextName;
    else if (nextName) inn.batting?.push({ name: nextName, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, how: '', notout: true });
    inn.striker = newBatIdx < (inn.batting?.length || 0) ? newBatIdx : inn.striker;
    inn.fallOfWickets = inn.fallOfWickets || [];
    inn.fallOfWickets.push({ score: inn.total, wicket: inn.wickets, batsman: striker?.name || '', at: `${Math.floor(inn.balls / 6)}.${inn.balls % 6}` });
    if (inn.balls % 6 === 0 && inn.balls > 0) { inn.overs = Math.floor(inn.balls / 6); if (bowler) { bowler.overs = (bowler.overs || 0) + 1; bowler.overBalls = 0; } inn.currentOver = []; this.swapStrike(inn); }

    const comText = `OUT! ${striker?.name || 'Batsman'} ${type}${fielder ? ' ' + fielder : ''}. Huge breakthrough for ${match.innings[ci === 0 ? 1 : 0].battingTeam}!`;
    match.commentary = match.commentary || [];
    match.commentary.push({ over: `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`, text: comText });
    App.save();
    App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } });
    Modal.close();
    if (inn.wickets >= 10 || inn.balls >= match.overs * 6) { this.promptEndInnings(matchId); return; }
    this.renderScoringPanel(matchId);
  },

  swapStrike(inn) {
    const s = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = s;
  },

  changeBatsmen(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn = match.innings?.[match.currentInnings || 0];
    if (!inn) return;
    this.swapStrike(inn);
    App.save();
    this.renderScoringPanel(matchId);
  },

  changeBowler(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn = match.innings?.[match.currentInnings || 0];
    if (!inn) return;
    const names = (inn.bowling || []).map((b, i) => `<option value="${i}">${escHtml(b.name)}</option>`).join('');
    Modal.open(`
      <h2 class="modal-title">🔄 Change Bowler</h2>
      <div class="form-group"><label class="form-label">Select Bowler</label><select class="form-select" id="cb-select">${names}</select></div>
      <div class="form-group"><label class="form-label">Or enter new bowler name</label><input class="form-input" id="cb-new" placeholder="New bowler name"></div>
      <button class="btn btn-primary btn-full" onclick="QuickMatch.confirmChangeBowler('${matchId}')">Confirm</button>
    `);
  },

  confirmChangeBowler(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn = match.innings?.[match.currentInnings || 0];
    if (!inn) return;
    const newName = el('cb-new')?.value?.trim();
    if (newName) {
      inn.bowling = inn.bowling || [];
      let existing = inn.bowling.find(b => b.name === newName);
      if (!existing) { existing = { name: newName, overs: 0, overBalls: 0, runs: 0, wickets: 0, maidens: 0 }; inn.bowling.push(existing); }
      inn.bowlerIdx = inn.bowling.indexOf(existing);
    } else {
      inn.bowlerIdx = +(el('cb-select')?.value || 0);
    }
    App.save();
    Modal.close();
    this.renderScoringPanel(matchId);
  },

  undoLast(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn = match.innings?.[match.currentInnings || 0];
    if (!inn || !inn.balls) { Toast.show('Nothing to undo', 'error'); return; }
    match.commentary?.pop();
    const lastBall = (inn.currentOver || []).pop();
    if (lastBall) { inn.total = Math.max(0, (inn.total || 0) - (lastBall.runs || 0)); if (!lastBall.type || lastBall.type === 'run') inn.balls = Math.max(0, (inn.balls || 0) - 1); }
    App.save();
    App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } });
    this.renderScoringPanel(matchId);
    Toast.show('Last ball undone', 'default');
  },

  promptEndInnings(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const ci = match.currentInnings || 0;
    const inn = match.innings?.[ci];
    if (ci === 0) {
      Modal.open(`
        <h2 class="modal-title">⏭ End of Innings</h2>
        <div style="text-align:center;margin:1.5rem 0">
          <div style="font-size:2rem;margin-bottom:.5rem">${escHtml(inn.battingTeam)}</div>
          <div style="font-size:2.5rem;font-weight:900;color:var(--gold)">${inn.total}/${inn.wickets}</div>
          <div style="color:var(--text-2)">${inn.overs || 0} overs</div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1rem;text-align:center">
          Target for <strong>${escHtml(match.team2 === inn.battingTeam ? match.team1 : match.team2)}</strong>: <span style="color:var(--gold);font-size:1.5rem;font-weight:800">${(inn.total || 0) + 1}</span>
        </div>
        <button class="btn btn-primary btn-full" onclick="QuickMatch.startSecondInnings('${matchId}')">Start 2nd Innings →</button>
      `);
    } else {
      this.declareResult(matchId);
    }
  },

  endInnings(matchId) { this.promptEndInnings(matchId); },

  startSecondInnings(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn1 = match.innings?.[0];
    const bat2 = match.team1 === inn1.battingTeam ? match.team2 : match.team1;
    const bowl2 = match.team1 === inn1.battingTeam ? match.team1 : match.team2;
    const getPlayers = (team) => {
      const xi = match.playerXI?.[team] || [];
      return xi.length ? xi.map(n => ({ name: n, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, how: '', notout: true })) :
        Array.from({ length: 11 }, (_, i) => ({ name: `${team} P${i + 1}`, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, how: '', notout: true }));
    };
    const getBowlers = (team) => {
      const xi = match.playerXI?.[team] || [];
      return xi.length ? xi.map(n => ({ name: n, overs: 0, overBalls: 0, runs: 0, wickets: 0, maidens: 0 })) :
        Array.from({ length: 11 }, (_, i) => ({ name: `${team} P${i + 1}`, overs: 0, overBalls: 0, runs: 0, wickets: 0, maidens: 0 }));
    };
    match.innings.push({
      battingTeam: bat2, bowlingTeam: bowl2,
      batting: getPlayers(bat2), bowling: getBowlers(bowl2),
      total: 0, wickets: 0, balls: 0, overs: 0,
      extras: { wide: 0, noBall: 0, bye: 0, legBye: 0 },
      fallOfWickets: [], currentOver: [],
      striker: 0, nonStriker: 1, bowlerIdx: 0,
    });
    match.currentInnings = 1;
    App.save();
    Modal.close();
    Toast.show(`2nd innings started! Target: ${(inn1.total || 0) + 1}`, 'success');
    this.renderScoringPanel(matchId);
  },

  declareResult(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn1 = match.innings?.[0];
    const inn2 = match.innings?.[1];
    let result = '', winner = '';
    if (inn2) {
      if ((inn2.total || 0) > (inn1.total || 0)) { winner = inn2.battingTeam; result = `${inn2.battingTeam} won by ${10 - (inn2.wickets || 0)} wickets`; }
      else if ((inn1.total || 0) > (inn2.total || 0)) { winner = inn1.battingTeam; result = `${inn1.battingTeam} won by ${(inn1.total || 0) - (inn2.total || 0)} runs`; }
      else { result = 'Match tied'; }
    } else if (inn1) {
      result = `${inn1.battingTeam}: ${inn1.total}/${inn1.wickets}`;
    }
    Modal.open(`
      <h2 class="modal-title">🏆 Match Result</h2>
      <div style="text-align:center;margin:1.5rem 0">
        <div style="font-size:3rem;margin-bottom:.75rem">🎉</div>
        <div style="font-size:1.4rem;font-weight:800;color:var(--gold)">${escHtml(result)}</div>
        ${inn1 ? `<div style="color:var(--text-2);margin-top:.75rem">${escHtml(inn1.battingTeam)}: ${inn1.total}/${inn1.wickets} (${inn1.overs || 0} ov)</div>` : ''}
        ${inn2 ? `<div style="color:var(--text-2)">${escHtml(inn2.battingTeam)}: ${inn2.total}/${inn2.wickets} (${inn2.overs || 0} ov)</div>` : ''}
      </div>
      <div class="form-group"><label class="form-label">🏅 Player of the Match</label><input class="form-input" id="potm-name" placeholder="Enter player name"></div>
      <button class="btn btn-primary btn-full" onclick="QuickMatch.finalizeResult('${matchId}')">Finalize & Save</button>
    `);
  },

  finalizeResult(matchId) {
    const match = App.state.matches.find(m => m.id === matchId);
    if (!match) return;
    const inn1 = match.innings?.[0]; const inn2 = match.innings?.[1];
    const potm = el('potm-name')?.value?.trim();
    let result = '', winner = '';
    if (inn2) {
      if ((inn2.total || 0) > (inn1?.total || 0)) { winner = inn2.battingTeam; result = `${inn2.battingTeam} won by ${10 - (inn2.wickets || 0)} wickets`; }
      else if ((inn1?.total || 0) > (inn2.total || 0)) { winner = inn1?.battingTeam || ''; result = `${inn1?.battingTeam} won by ${(inn1?.total || 0) - (inn2.total || 0)} runs`; }
      else { result = 'Match tied'; }
    } else { result = `${inn1?.battingTeam || ''}: ${inn1?.total || 0}/${inn1?.wickets || 0}`; }
    match.result = result; match.winner = winner;
    match.playerOfMatch = potm || null;
    match.status = 'completed';
    this.updatePlayerStats(match);
    if (match.tournamentId) Tournament.updateStandings(matchId);
    App.save();
    App.broadcast({ type: 'SCORE_UPDATE', payload: { matchId } });
    updateLivePill();
    Modal.close();
    this.closeScoring();
    Toast.show(`✅ Match saved! ${result}`, 'success', 5000);
    navigate('scores');
  },

  updatePlayerStats(match) {
    match.innings?.forEach(inn => {
      inn.batting?.forEach(b => {
        const p = App.state.players.find(x => x.name?.toLowerCase() === b.name?.toLowerCase());
        if (!p) return;
        p.stats.matches = (p.stats.matches || 0) + 1;
        p.stats.runs = (p.stats.runs || 0) + (b.runs || 0);
        p.stats.sixes = (p.stats.sixes || 0) + (b.sixes || 0);
        p.stats.fours = (p.stats.fours || 0) + (b.fours || 0);
        if ((b.runs || 0) > (p.stats.highScore || 0)) p.stats.highScore = b.runs;
        if ((b.runs || 0) >= 100) p.stats.hundreds = (p.stats.hundreds || 0) + 1;
        else if ((b.runs || 0) >= 50) p.stats.fifties = (p.stats.fifties || 0) + 1;
        if (b.out && (b.runs || 0) === 0) p.stats.ducks = (p.stats.ducks || 0) + 1;
        p.stats.fantasyPoints = (p.stats.fantasyPoints || 0) + (b.runs || 0) + (b.sixes || 0) * 2 + (b.fours || 0);
        if ((b.runs || 0) >= 50) p.stats.fantasyPoints += 8;
        if ((b.runs || 0) >= 100) p.stats.fantasyPoints += 16;
        p.form = p.form || [];
        p.form.push((b.runs || 0) >= 30 ? 'W' : 'L');
        if (p.form.length > 5) p.form.shift();
      });
      inn.bowling?.forEach(bw => {
        const p = App.state.players.find(x => x.name?.toLowerCase() === bw.name?.toLowerCase());
        if (!p) return;
        p.stats.wickets = (p.stats.wickets || 0) + (bw.wickets || 0);
        p.stats.fantasyPoints = (p.stats.fantasyPoints || 0) + (bw.wickets || 0) * 25;
        if ((bw.wickets || 0) >= 5) p.stats.fantasyPoints += 16;
        else if ((bw.wickets || 0) >= 4) p.stats.fantasyPoints += 8;
      });
    });
    if (match.playerOfMatch) {
      const p = App.state.players.find(x => x.name?.toLowerCase() === match.playerOfMatch?.toLowerCase());
      if (p) p.stats.fantasyPoints = (p.stats.fantasyPoints || 0) + 50;
    }
  },

  generateSmartCommentary(type, runs, batsman, bowler, required, ballsLeft, rrr) {
    const templates = {
      '6': [`SHOT! ${batsman} hits it right out of the ground for SIX! 💥`, `MAXIMUM! ${batsman} launches ${bowler} into the stands!`, `What a hit! ${batsman} clears the boundary with ease. SIX!`],
      '4': [`FOUR! ${batsman} drives it elegantly past cover point.`, `Smashed to the boundary! ${batsman} finds the gap perfectly.`, `Brilliant stroke play from ${batsman} for FOUR!`],
      '3': [`Good running! Three runs for ${batsman} and partner.`],
      '2': [`Pushed to mid-off, two easy runs.`, `A comfortable two for ${batsman}.`],
      '1': [`Single taken, rotates the strike.`, `Nudged off the pads for one.`, `Quick single, ${batsman} is in good touch.`],
      '0': [`Dot ball! ${bowler} beats ${batsman} outside off.`, `Maiden delivery. ${bowler} keeps it tight.`, `Good line and length from ${bowler}.`],
      'wide': [`Wide down leg! Extra for the batting side.`, `Down the leg side, wide called by the umpire.`],
      'noball': [`No ball! Free hit coming up. Extra runs for the batting side.`],
      'bye': [`Byes! Keeper fails to collect cleanly.`],
      'legbye': [`Leg bye taken.`],
    };

    const key = type === 'run' ? String(runs) : type;
    const opts = templates[key] || [`${runs} run${runs !== 1 ? 's' : ''} added.`];
    let baseText = opts[Math.floor(Math.random() * opts.length)];

    if (required !== null && ballsLeft > 0 && ballsLeft <= 30) {
      if (runs >= 4) {
        baseText += ` Crucial boundary! Need ${required} more from ${ballsLeft} balls.`;
      } else if (type === '0' || runs === 0) {
        baseText += ` Pressure building... RRR is climbing to ${rrr}.`;
      }
    }

    return baseText;
  }
};

/* ============================================================
   12. SCORES / LIVE SCORECARDS
   ============================================================ */
const Scores = {
  render() {
    const sec = el('section-scores');
    const live = App.state.matches.filter(m => m.status === 'live');
    const done = App.state.matches.filter(m => m.status === 'completed').slice().reverse();
    sec.innerHTML = `<div class="container">
      <div class="section-header">
        <div>
          <h1 class="section-title"><span class="icon">📊</span> Live Scores</h1>
          <div class="section-subtitle">${live.length} live • ${done.length} completed</div>
        </div>
        <button class="btn btn-primary" onclick="QuickMatch.openCreate()">+ New Match</button>
      </div>
      ${live.length ? `
      <h3 style="font-size:1rem;font-weight:700;color:var(--red-2);margin-bottom:.75rem">🔴 Live Matches</h3>
      ${live.map(m => this.matchCard(m, true)).join('')}` : ''}
      ${done.length ? `
      <h3 style="font-size:1rem;font-weight:700;color:var(--text-2);margin:1.5rem 0 .75rem">✅ Completed</h3>
      ${done.map(m => this.matchCard(m, false)).join('')}` : ''}
      ${!live.length && !done.length ? `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No Matches Yet</div><div class="empty-desc">Start a quick match or a tournament match to see live scores here.</div><button class="btn btn-primary" onclick="QuickMatch.openCreate()">+ Quick Match</button></div>` : ''}
    </div>`;
  },

  matchCard(m, isLive) {
    const inn1 = m.innings?.[0]; const inn2 = m.innings?.[1];
    const ci = m.currentInnings || 0;
    const currentInn = m.innings?.[ci];
    return `<div class="scorecard" style="margin-bottom:1rem;cursor:pointer" onclick="Scores.viewScorecard('${m.id}')">
      <div class="scorecard-header">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
          <div style="display:flex;gap:.5rem;align-items:center">
            ${isLive ? `<span class="live-badge"><span class="pulse-dot"></span>LIVE</span>` : ''}
            <span class="format-badge format-${m.format}">${m.format}</span>
            ${m.tournamentId ? `<span class="badge badge-blue">${escHtml(App.state.tournaments.find(t => t.id === m.tournamentId)?.name || 'Tournament')}</span>` : ''}
          </div>
          <span style="font-size:.78rem;color:var(--text-3)">${dateStr(m.date || m.createdAt)}</span>
        </div>
        <div class="match-teams">
          <div class="team-score-block">
            <div class="team-name-sc">${escHtml(m.team1)}</div>
            <div class="team-score-sc">${inn1 && inn1.battingTeam === m.team1 ? `${inn1.total || 0}/${inn1.wickets || 0}` : inn2 && inn2.battingTeam === m.team1 ? `${inn2.total || 0}/${inn2.wickets || 0}` : '-'}</div>
            <div class="team-overs">${inn1 && inn1.battingTeam === m.team1 ? `(${inn1.overs || 0} ov)` : inn2 && inn2.battingTeam === m.team1 ? `(${inn2.overs || 0} ov)` : ''}</div>
          </div>
          <div class="vs-badge">VS</div>
          <div class="team-score-block">
            <div class="team-name-sc">${escHtml(m.team2)}</div>
            <div class="team-score-sc">${inn1 && inn1.battingTeam === m.team2 ? `${inn1.total || 0}/${inn1.wickets || 0}` : inn2 && inn2.battingTeam === m.team2 ? `${inn2.total || 0}/${inn2.wickets || 0}` : '-'}</div>
            <div class="team-overs">${inn1 && inn1.battingTeam === m.team2 ? `(${inn1.overs || 0} ov)` : inn2 && inn2.battingTeam === m.team2 ? `(${inn2.overs || 0} ov)` : ''}</div>
          </div>
        </div>
        ${isLive && currentInn ? `<div class="crr-box" style="margin-top:1rem">
          <div class="crr-item"><div class="crr-val">${currentInn.balls ? ((currentInn.total || 0) / (currentInn.balls / 6)).toFixed(2) : '0.00'}</div><div class="crr-lbl">CRR</div></div>
          <div class="crr-item"><div class="crr-val">${currentInn.balls || 0}</div><div class="crr-lbl">Balls</div></div>
          <div class="crr-item"><div class="crr-val">${(currentInn.extras?.wide || 0) + (currentInn.extras?.noBall || 0) + (currentInn.extras?.bye || 0) + (currentInn.extras?.legBye || 0)}</div><div class="crr-lbl">Extras</div></div>
          ${ci === 1 ? `<div class="crr-item"><div class="crr-val" style="color:var(--red-2)">${(m.innings?.[0]?.total || 0) + 1 - (currentInn.total || 0)}</div><div class="crr-lbl">To Win</div></div>` : ''}
        </div>`: ''}
        ${m.result ? `<div style="text-align:center;margin-top:.75rem;font-weight:700;color:var(--gold)">${escHtml(m.result)}</div>` : ''}
        ${m.playerOfMatch ? `<div style="text-align:center;margin-top:.35rem;font-size:.82rem;color:var(--text-2)">🏅 POTM: <strong style="color:var(--text)">${escHtml(m.playerOfMatch)}</strong></div>` : ''}
      </div>
      <div style="padding:.75rem 1.5rem;font-size:.78rem;color:var(--text-3);text-align:center">Tap to view full scorecard →</div>
    </div>`;
  },

  viewScorecard(matchId) {
    const m = App.state.matches.find(x => x.id === matchId);
    if (!m) return;
    const tabs = (m.innings || []).map((inn, i) => `<div class="tab ${i === 0 ? 'active' : ''}" onclick="Scores.switchInn(this,'sc-inn-${i}')">${escHtml(inn.battingTeam)} Innings</div>`).join('');
    const innHtml = (m.innings || []).map((inn, i) => this.inningsHTML(inn, i)).join('');
    Modal.open(`
      <div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem">
          <h2 style="font-size:1.2rem;font-weight:800">${escHtml(m.team1)} vs ${escHtml(m.team2)}</h2>
          <div style="display:flex;gap:.4rem">
            <span class="format-badge format-${m.format}">${m.format}</span>
            ${m.status === 'live' ? `<span class="live-badge"><span class="pulse-dot"></span>LIVE</span>` : ''}
          </div>
        </div>
        ${m.toss ? `<div style="font-size:.8rem;color:var(--text-2)">🪙 Toss: <strong>${escHtml(m.toss.winner)}</strong> chose to ${m.toss.chose}</div>` : ''}
        ${m.result ? `<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.2);border-radius:var(--radius-sm);padding:.6rem 1rem;margin-top:.75rem;font-weight:700;color:var(--gold);text-align:center">${escHtml(m.result)}</div>` : ''}
        ${m.playerOfMatch ? `<div style="text-align:center;margin-top:.5rem;font-size:.85rem">🏅 Player of the Match: <strong style="color:var(--gold)">${escHtml(m.playerOfMatch)}</strong></div>` : ''}
      </div>
      ${m.innings?.length ? `<div class="tabs">${tabs}</div>${innHtml}` : '<div class="empty-state" style="padding:1rem"><div class="empty-title">No innings data yet</div></div>'}
      ${m.status === 'live' ? `<div style="margin-top:1rem"><button class="btn btn-primary btn-full" onclick="Modal.close();QuickMatch.openScoring('${m.id}')">📝 Score This Match</button></div>` : ''}
    `);
  },

  inningsHTML(inn, idx) {
    return `<div id="sc-inn-${idx}" ${idx > 0 ? 'style="display:none"' : ''}>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
        <div style="font-weight:700">${escHtml(inn.battingTeam)}</div>
        <div style="font-size:1.5rem;font-weight:900;color:var(--gold);font-family:'Roboto Mono',monospace">${inn.total || 0}/${inn.wickets || 0} <span style="font-size:.85rem;color:var(--text-2)">(${inn.overs || 0} ov)</span></div>
      </div>
      <div style="font-size:.78rem;color:var(--text-2);margin-bottom:.75rem">Extras: ${(inn.extras?.wide || 0) + (inn.extras?.noBall || 0) + (inn.extras?.bye || 0) + (inn.extras?.legBye || 0)} (w:${inn.extras?.wide || 0}, nb:${inn.extras?.noBall || 0}, b:${inn.extras?.bye || 0}, lb:${inn.extras?.legBye || 0})</div>
      <div class="table-wrap" style="margin-bottom:1rem">
        <table>
          <thead class="sc-table-head"><tr><th>Batter</th><th>How Out</th><th class="nums">R</th><th class="nums">B</th><th class="nums">4s</th><th class="nums">6s</th><th class="nums">SR</th></tr></thead>
          <tbody>
          ${(inn.batting || []).map(b => `<tr>
            <td class="player-cell ${b.notout && !b.out ? 'batting-on' : ''}">${escHtml(b.name)}${b.notout && !b.out ? ' *' : ''}</td>
            <td style="font-size:.75rem;color:var(--text-2)">${b.out ? escHtml(b.how || '') : 'not out'}</td>
            <td class="nums" style="font-weight:700">${b.runs || 0}</td>
            <td class="nums">${b.balls || 0}</td>
            <td class="nums">${b.fours || 0}</td>
            <td class="nums">${b.sixes || 0}</td>
            <td class="nums">${b.balls ? ((b.runs || 0) / b.balls * 100).toFixed(1) : '—'}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-wrap" style="margin-bottom:.75rem">
        <table>
          <thead class="sc-table-head"><tr><th>Bowler</th><th class="nums">O</th><th class="nums">M</th><th class="nums">R</th><th class="nums">W</th><th class="nums">Eco</th></tr></thead>
          <tbody>
          ${(inn.bowling || []).filter(b => b.overs > 0 || (b.overBalls || 0) > 0).map(b => `<tr>
            <td class="player-cell">${escHtml(b.name)}</td>
            <td class="nums">${b.overs || 0}${b.overBalls ? `.${b.overBalls}` : ''}</td>
            <td class="nums">${b.maidens || 0}</td>
            <td class="nums">${b.runs || 0}</td>
            <td class="nums" style="font-weight:700;color:var(--gold)">${b.wickets || 0}</td>
            <td class="nums">${b.overs ? ((b.runs || 0) / (b.overs || 1)).toFixed(2) : '—'}</td>
          </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${inn.fallOfWickets?.length ? `<div style="font-size:.78rem;color:var(--text-2)"><strong style="color:var(--text)">Fall of Wickets:</strong> ${inn.fallOfWickets.map(f => `${f.score}/${f.wicket} (${escHtml(f.batsman)}, ${f.at})`).join(' • ')}</div>` : ''}
    </div>`;
  },

  switchInn(btn, showId) {
    btn.closest('.modal-body')?.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('[id^="sc-inn-"]').forEach(d => d.style.display = 'none');
    const target = el(showId); if (target) target.style.display = 'block';
  }
};

/* ============================================================
   13. STATS HUB
   ============================================================ */
const Stats = {
  render() {
    const sec = el('section-stats');
    const allMatches = App.state.matches.filter(m => m.status === 'completed');
    const playerMap = {};
    allMatches.forEach(m => {
      m.innings?.forEach(inn => {
        inn.batting?.forEach(b => {
          if (!playerMap[b.name]) playerMap[b.name] = { name: b.name, runs: 0, balls: 0, sixes: 0, fours: 0, wickets: 0, matches: 0, potm: 0, ducks: 0, fifties: 0, hundreds: 0, catches: 0, bestScore: 0, overs: 0, econRuns: 0 };
          playerMap[b.name].runs += (b.runs || 0);
          playerMap[b.name].balls += (b.balls || 0);
          playerMap[b.name].sixes += (b.sixes || 0);
          playerMap[b.name].fours += (b.fours || 0);
          playerMap[b.name].matches++;
          if ((b.runs || 0) >= 100) playerMap[b.name].hundreds++;
          else if ((b.runs || 0) >= 50) playerMap[b.name].fifties++;
          if ((b.runs || 0) === 0 && b.out) playerMap[b.name].ducks++;
          if ((b.runs || 0) > playerMap[b.name].bestScore) playerMap[b.name].bestScore = b.runs;
        });
        inn.bowling?.forEach(bw => {
          if (!playerMap[bw.name]) playerMap[bw.name] = { name: bw.name, runs: 0, balls: 0, sixes: 0, fours: 0, wickets: 0, matches: 0, potm: 0, ducks: 0, fifties: 0, hundreds: 0, catches: 0, bestScore: 0, overs: 0, econRuns: 0 };
          playerMap[bw.name].wickets += (bw.wickets || 0);
          playerMap[bw.name].overs += (bw.overs || 0);
          playerMap[bw.name].econRuns += (bw.runs || 0);
        });
      });
      if (m.playerOfMatch) { if (!playerMap[m.playerOfMatch]) playerMap[m.playerOfMatch] = { name: m.playerOfMatch, runs: 0, balls: 0, sixes: 0, fours: 0, wickets: 0, matches: 0, potm: 0, ducks: 0, fifties: 0, hundreds: 0, catches: 0, bestScore: 0, overs: 0, econRuns: 0 }; playerMap[m.playerOfMatch].potm++; }
    });
    const list = Object.values(playerMap);
    const topRuns = [...list].sort((a, b) => b.runs - a.runs).slice(0, 10);
    const topWkts = [...list].sort((a, b) => b.wickets - a.wickets).slice(0, 10);
    const mostSixes = [...list].sort((a, b) => b.sixes - a.sixes).slice(0, 10);
    const mostFours = [...list].sort((a, b) => b.fours - a.fours).slice(0, 10);
    const topSR = [...list].filter(p => p.balls >= 20).sort((a, b) => ((b.runs / b.balls) * 100) - ((a.runs / a.balls) * 100)).slice(0, 5);
    const topEcon = [...list].filter(p => p.overs >= 5).sort((a, b) => (a.econRuns / a.overs) - (b.econRuns / b.overs)).slice(0, 5);
    const emerging = [...list].filter(p => p.matches >= 1).sort((a, b) => ((b.runs + (b.wickets * 20) + (b.potm * 50)) / b.matches) - ((a.runs + (a.wickets * 20) + (a.potm * 50)) / a.matches)).slice(0, 1)[0];
    const potmKing = [...list].sort((a, b) => b.potm - a.potm).slice(0, 1)[0];
    const sixesKing = [...list].sort((a, b) => b.sixes - a.sixes).slice(0, 1)[0];
    const centuryKing = [...list].sort((a, b) => b.hundreds - a.hundreds).slice(0, 1)[0];

    sec.innerHTML = `<div class="container">
      <div class="section-header">
        <div>
          <h1 class="section-title"><span class="icon">📈</span> Stats Hub</h1>
          <div class="section-subtitle">Overall records across all matches</div>
        </div>
      </div>

      ${!allMatches.length ? `<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-title">No Stats Yet</div><div class="empty-desc">Complete a match to see stats, leaderboards, and awards here.</div><button class="btn btn-primary" onclick="navigate('quickmatch')">⚡ Start a Match</button></div>` : `

      <!-- Awards Row -->
      <div class="grid-4" style="margin-bottom:2rem">
        ${emerging ? `<div class="stats-award-card"><div class="award-icon">⭐</div><div class="award-title">EMERGING PLAYER</div><div class="award-player">${escHtml(emerging.name)}</div><div class="award-value">${emerging.runs} runs • ${emerging.wickets} wkts</div></div>` : ''}
        ${potmKing?.potm ? `<div class="stats-award-card"><div class="award-icon">🏆</div><div class="award-title">POTM AWARDS</div><div class="award-player">${escHtml(potmKing.name)}</div><div class="award-value">${potmKing.potm}× POTM</div></div>` : ''}
        ${sixesKing?.sixes ? `<div class="stats-award-card"><div class="award-icon">💥</div><div class="award-title">SIX MACHINE</div><div class="award-player">${escHtml(sixesKing.name)}</div><div class="award-value">${sixesKing.sixes} Sixes</div></div>` : ''}
        ${centuryKing?.hundreds ? `<div class="stats-award-card"><div class="award-icon">💯</div><div class="award-title">CENTURY KING</div><div class="award-player">${escHtml(centuryKing.name)}</div><div class="award-value">${centuryKing.hundreds} Hundreds</div></div>` : ''}
      </div>

      <div class="tabs">
        <div class="tab active" onclick="Stats.switchTab(this,'st-runs')">🏏 Runs</div>
        <div class="tab" onclick="Stats.switchTab(this,'st-wickets')">🎳 Wickets</div>
        <div class="tab" onclick="Stats.switchTab(this,'st-sixes')">💥 Sixes</div>
        <div class="tab" onclick="Stats.switchTab(this,'st-fours')">🎯 Fours</div>
        <div class="tab" onclick="Stats.switchTab(this,'st-sr')">⚡ Strike Rate</div>
        <div class="tab" onclick="Stats.switchTab(this,'st-econ')">💰 Economy</div>
        <div class="tab" onclick="Stats.switchTab(this,'st-overall')">📊 Overview</div>
      </div>

      <div id="st-runs">${this.statList(topRuns, 'runs', 'Runs', 'matches', 'Matches')}</div>
      <div id="st-wickets" style="display:none">${this.statList(topWkts, 'wickets', 'Wickets', 'matches', 'Matches')}</div>
      <div id="st-sixes" style="display:none">${this.statList(mostSixes, 'sixes', 'Sixes', 'fours', 'Fours')}</div>
      <div id="st-fours" style="display:none">${this.statList(mostFours, 'fours', 'Fours', 'sixes', 'Sixes')}</div>
      <div id="st-sr" style="display:none">${this.statList(topSR.map(p => ({ ...p, srVal: ((p.runs / p.balls) * 100).toFixed(1) })), 'srVal', 'Strike Rate', 'balls', 'Balls')}</div>
      <div id="st-econ" style="display:none">${this.statList(topEcon.map(p => ({ ...p, econVal: (p.econRuns / p.overs).toFixed(2) })), 'econVal', 'Economy', 'overs', 'Overs')}</div>
      <div id="st-overall" style="display:none">${this.overallTable(list)}</div>
      `}
    </div>`;
  },

  statList(list, mainKey, mainLabel, subKey, subLabel) {
    if (!list.length) return `<div class="empty-state" style="padding:2rem"><div class="empty-title">No data yet</div></div>`;
    return `<div class="card">
      ${list.map((p, i) => `<div class="stat-row">
        <div class="stat-rank" style="${i < 3 ? 'color:var(--gold)' : 'color:var(--text-3)'}">${i + 1}</div>
        <div class="stat-avatar">${Tournament.getEmoji(p.name)}</div>
        <div class="stat-info">
          <div class="stat-player-name">${escHtml(p.name)}</div>
          <div class="stat-player-meta">${p[subKey] || 0} ${subLabel} ${p.fifties ? `• ${p.fifties} 50s` : ''} ${p.hundreds ? `• ${p.hundreds} 100s` : ''}</div>
          <div class="form-dots">${(App.state.players.find(x => x.name?.toLowerCase() === p.name?.toLowerCase())?.form || []).slice(-5).map(f => `<div class="form-dot form-${f}"></div>`).join('')}</div>
        </div>
        <div class="stat-value">${p[mainKey] || 0}</div>
      </div>`).join('')}
    </div>`;
  },

  overallTable(list) {
    if (!list.length) return `<div class="empty-state" style="padding:2rem"><div class="empty-title">No data yet</div></div>`;
    const sorted = [...list].sort((a, b) => b.runs - a.runs);
    return `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Player</th><th>M</th><th>Runs</th><th>Wkts</th><th>6s</th><th>4s</th><th>50s</th><th>100s</th><th>POTM</th></tr></thead>
      <tbody>${sorted.map((p, i) => `<tr>
        <td><span class="rank-badge rank-${i < 3 ? i + 1 : ''}" style="${i >= 3 ? 'color:var(--text-3)' : ''}>${i + 1}</span></td>
        <td style="font-weight:700">${escHtml(p.name)}</td>
        <td>${p.matches || 0}</td>
        <td style="color:var(--gold);font-weight:700">${p.runs || 0}</td>
        <td style="color:var(--red-2);font-weight:700">${p.wickets || 0}</td>
        <td>${p.sixes || 0}</td>
        <td>${p.fours || 0}</td>
        <td>${p.fifties || 0}</td>
        <td>${p.hundreds || 0}</td>
        <td style="color:var(--gold)">${p.potm || 0}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  },

  switchTab(btn, showId) {
    const tabBar = btn.closest('.tabs');
    if (tabBar) tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    ['st-runs', 'st-wickets', 'st-sixes', 'st-fours', 'st-sr', 'st-econ', 'st-overall'].forEach(id => {
      const e2 = el(id); if (e2) e2.style.display = id === showId ? 'block' : 'none';
    });
  }
};

/* ============================================================
   14. EVENT LISTENERS & INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

  setTimeout(() => {
    if (window.FirebaseAuth) App.initAuth();
  }, 500);

  setTimeout(() => {
    el('loader').classList.add('hidden');
    navigate('home');
  }, 1400);

  document.querySelectorAll('[data-route]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.route);
    });
  });

  el('hamburger')?.addEventListener('click', () => {
    el('mobile-nav').classList.toggle('open');
  });

  el('modal-close')?.addEventListener('click', Modal.close);
  el('modal-overlay')?.addEventListener('click', (e) => { if (e.target === el('modal-overlay')) Modal.close(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (el('scoring-overlay').classList.contains('active')) QuickMatch.closeScoring();
      else Modal.close();
    }
  });
});

window.navigate = navigate;
window.Players = Players;
window.Auction = Auction;
window.Tournament = Tournament;
window.QuickMatch = QuickMatch;
window.Scores = Scores;
window.Stats = Stats;
window.Home = Home;
window.Modal = Modal;
window.Toast = Toast;
window.el = el;
window.AuthUI = AuthUI;