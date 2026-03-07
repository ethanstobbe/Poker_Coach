// API base URL: use backend when served from same origin (Node serves frontend) or set for separate dev server
const API_BASE = typeof window !== 'undefined' && window.location.origin
  ? `${window.location.origin}/api`
  : '/api';

async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function login() {
  const userEl = document.getElementById('user');
  const passEl = document.getElementById('pass');
  const email = userEl?.value?.trim();
  const password = passEl?.value;

  if (!email || !password) {
    alert('Enter email/username and password');
    return;
  }

  apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
    .then(() => {
      window.location.href = 'menu.html';
    })
    .catch((err) => {
      alert(err.message || 'Invalid login');
    });
}

function goPlay() {
  window.location.href = 'play.html';
}

function goProfile() {
  window.location.href = 'profile.html';
}

function goLeaderboards() {
  window.location.href = 'leaderboards.html';
}

function logout() {
  window.location.href = 'index.html';
}

let xp = 0;
let rankIndex = 0;

const ranks = [
  'Bronze',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
];

function addXP(amount) {
  xp += amount;

  if (xp >= 100) {
    xp = xp - 100;
    rankIndex++;

    if (rankIndex >= ranks.length) {
      rankIndex = ranks.length - 1;
    }
  }

  updateProfileUI();
}

function updateProfileUI() {
  const fill = document.getElementById('xpFill');
  const xpText = document.getElementById('xpText');
  const rankLabel = document.getElementById('rankLabel');

  if (!fill) return;

  fill.style.width = xp + '%';
  if (xpText) xpText.innerText = `XP: ${xp} / 100`;
  if (rankLabel) rankLabel.innerText = 'Rank: ' + ranks[rankIndex];
}

function goMenu() {
  window.location.href = 'menu.html';
}

let leaderboardData = [
  { name: 'AceMaster', rank: 'Diamond', chips: 25000, winrate: '68%' },
  { name: 'CardShark', rank: 'Platinum', chips: 18200, winrate: '64%' },
  { name: 'BluffKing', rank: 'Gold', chips: 15100, winrate: '61%' },
  { name: 'RiverQueen', rank: 'Gold', chips: 12000, winrate: '59%' },
  { name: 'PocketPair', rank: 'Silver', chips: 9800, winrate: '55%' },
];

function loadLeaderboard() {
  const body = document.getElementById('leaderboardBody');
  if (!body) return;

  apiFetch('/leaderboards')
    .then((data) => {
      leaderboardData = Array.isArray(data) ? data : leaderboardData;
      renderLeaderboard(body, leaderboardData);
    })
    .catch(() => {
      renderLeaderboard(body, leaderboardData);
    });
}

function renderLeaderboard(body, data) {
  body.innerHTML = '';
  data.forEach((player, index) => {
    const row = document.createElement('tr');
    if (index === 0) row.className = 'rank-1';
    if (index === 1) row.className = 'rank-2';
    if (index === 2) row.className = 'rank-3';
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${player.name}</td>
      <td>${player.rank}</td>
      <td>$${player.chips}</td>
      <td>${player.winrate}</td>
    `;
    body.appendChild(row);
  });
}

if (document.getElementById('leaderboardBody')) {
  loadLeaderboard();
}
