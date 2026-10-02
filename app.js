let currentPlayer = null;
let currentType = 'individual';

// Restore session from localStorage on page load
(function restoreSession() {
  try {
    const saved = localStorage.getItem('ctf_player');
    if (saved) {
      currentPlayer = JSON.parse(saved);
    }
  } catch (e) {
    localStorage.removeItem('ctf_player');
  }
})();
const API = ''; 
const $ = (id) => document.getElementById(id);

// ---------- Tabs ----------
$('tab-individual').addEventListener('click', () => switchTab('individual'));
$('tab-team').addEventListener('click', () => switchTab('team'));

function switchTab(type) {
  currentType = type;
  $('tab-individual').classList.toggle('active', type === 'individual');
  $('tab-team').classList.toggle('active', type === 'team');
  $('individual-form').classList.toggle('hidden', type !== 'individual');
  $('team-form').classList.toggle('hidden', type !== 'team');
}

// ---------- Member inputs ----------
$('team-count').addEventListener('change', renderMemberInputs);
function renderMemberInputs() {
  const count = parseInt($('team-count').value, 10);
  const container = $('member-inputs');
  container.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const label = document.createElement('label');
    label.textContent = `Member ${i} Name`;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'member-input';
    input.placeholder = `Member ${i}`;
    container.appendChild(label);
    container.appendChild(input);
  }
}
renderMemberInputs();

// ---------- Login ----------
$('login-btn').addEventListener('click', async () => {
  const msg = $('login-msg');
  msg.textContent = '';
  msg.className = 'msg';

   let payload = { type: currentType };

  if (currentType === 'individual') {
    const name = $('individual-name').value.trim();
    const password = $('individual-password').value;
    if (!name) return showMsg('Please enter a name', 'error');
    if (!password) return showMsg('Please enter a password', 'error');
    payload.name = name;
    payload.password = password;
  } else {
    const name = $('team-name').value.trim();
    const password = $('team-password').value;
    if (!name) return showMsg('Please enter a team name', 'error');
    if (!password) return showMsg('Please enter a team password', 'error');
    const members = [...document.querySelectorAll('.member-input')]
      .map(i => i.value.trim())
      .filter(Boolean);
    if (members.length < 2 || members.length > 4) {
      return showMsg('Team must have between 2 and 4 members', 'error');
    }
    payload.name = name;
    payload.password = password;
    payload.members = members;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      return showMsg(data.error || 'Login failed', 'error');
    }
        currentPlayer = data.player;
    localStorage.setItem('ctf_player', JSON.stringify(data.player));
    enterDashboard();
  } catch (err) {
    showMsg('Server error', 'error');
  }
});

function showMsg(text, type) {
  const msg = $('login-msg');
  msg.textContent = text;
  msg.className = 'msg ' + type;
}

// ---------- Dashboard ----------
function enterDashboard() {
  $('login-screen').classList.add('hidden');
  $('dashboard').classList.remove('hidden');

  const members = currentPlayer.members ? JSON.parse(currentPlayer.members) : null;
  $('player-label').textContent =
    (currentPlayer.type === 'team' ? '🏴 Team: ' : '👤 ') + currentPlayer.name;

  if (members) {
    $('player-members').textContent = `(${members.length} members: ${members.join(', ')})`;
  } else {
    $('player-members').textContent = '';
  }

  renderFlags();
}

$('logout-btn').addEventListener('click', () => {
  currentPlayer = null;
  localStorage.removeItem('ctf_player');
  $('dashboard').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  $('login-msg').textContent = '';
});

// ---------- Flags ----------
async function renderFlags() {
  const grid = $('flag-grid');
  grid.innerHTML = '';

  const res = await fetch(`/api/player/${currentPlayer.id}/submissions`);
  const submissions = await res.json();
  const solvedSet = new Set(submissions.map(s => s.flag_number));

  const prereqMet = solvedSet.has(1) && solvedSet.has(2);

  for (let i = 1; i <= 6; i++) {
    const card = document.createElement('div');
    card.className = 'flag-card';

    const solved = solvedSet.has(i);
    const locked = (i === 3 || i === 4) && !prereqMet;

    if (solved) card.classList.add('solved');
    if (locked && !solved) card.classList.add('locked');

    const title = document.createElement('div');
    title.className = 'flag-title';
    title.textContent = `Flag ${i}`;
    card.appendChild(title);

    const status = document.createElement('div');
    status.className = 'flag-status';
    if (solved) {
      status.classList.add('solved');
      const sub = submissions.find(s => s.flag_number === i);
      status.textContent = `✔ Solved at ${formatTime(sub.submitted_at)}`;
    } else if (locked) {
      status.classList.add('locked');
      status.textContent = '🔒 Requires Flag 1 & 2';
    } else {
      status.textContent = 'Not submitted';
    }
    card.appendChild(status);

    if (!solved) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = `flag${i}{...}`;
      input.id = `flag-input-${i}`;
      input.disabled = locked;
      card.appendChild(input);

      const btn = document.createElement('button');
      btn.textContent = locked ? 'Locked' : 'Submit';
      btn.disabled = locked;
      btn.addEventListener('click', () => submitFlag(i));
      card.appendChild(btn);
    }

    grid.appendChild(card);
  }
}

async function submitFlag(flagNumber) {
  const input = $(`flag-input-${flagNumber}`);
  const value = input.value.trim();
  if (!value) return alert('Enter a flag first');

  const res = await fetch(API + '/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_id: currentPlayer.id,
      flag_number: flagNumber,
      flag_value: value,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Error');
    return;
  }

  // Flag 4 reward popup
  if (flagNumber === 4 && data.reward_ip) {
    showRewardPopup(data.reward_ip, data.reward_message);
  }

  await renderFlags();
}



// ---------- Utils ----------
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
// If session was restored, skip the login screen
if (currentPlayer) {
  enterDashboard();
}
// ---------- Reward Popup (Flag 4) ----------
function showRewardPopup(ip, message) {
  // Remove any existing popup
  const existing = document.getElementById('reward-popup-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'reward-popup-overlay';
  overlay.className = 'reward-overlay';

  overlay.innerHTML = `
    <div class="reward-popup">
      <div class="reward-icon">🎯</div>
      <h2 class="reward-title">Target Acquired!</h2>
      <p class="reward-message">${escapeHtml(message || 'Flag 4 accepted.')}</p>
      <div class="reward-ip">${escapeHtml(ip)}</div>
      <button class="reward-close btn-primary">Got it</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  const close = () => overlay.remove();
  overlay.querySelector('.reward-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEsc);
    }
  });
}