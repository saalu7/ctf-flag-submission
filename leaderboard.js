const $ = (id) => document.getElementById(id);
const TOTAL_FLAGS = 6;

document.addEventListener('DOMContentLoaded', loadAll);
$('refresh-btn').addEventListener('click', loadAll);

async function loadAll() {
  const [players, perFlag] = await Promise.all([
    fetch('/api/players').then(r => r.json()),
    fetch('/api/leaderboard').then(r => r.json()),
  ]);

  const ranked = rankPlayers(players);
  renderPodium(ranked);
  renderGraph(ranked);
  renderTimeline(perFlag);
}

// ---------- Ranking logic ----------
// Sort by: flags_solved DESC, then last_submission ASC (earlier wins)
// If a player has 0 flags, put them at the bottom sorted by registration time.
function rankPlayers(players) {
  return [...players].sort((a, b) => {
    if (b.stars !== a.stars) return b.stars - a.stars;
    // tie → earlier last submission wins
    if (a.last_submission && b.last_submission) {
      return a.last_submission - b.last_submission;
    }
    // fallbacks (0-flag players or edge cases)
    if (a.last_submission) return -1;
    if (b.last_submission) return 1;
    return a.id - b.id;
  });
}

// ---------- Podium ----------
function renderPodium(ranked) {
  const podium = $('podium');
  podium.innerHTML = '';

  const top5 = ranked.filter(p => p.stars > 0).slice(0, 5);

  if (top5.length === 0) {
    podium.innerHTML = '<div class="podium-empty">No flags captured yet. Be the first! 🚩</div>';
    return;
  }

  // Rank 1..5 with badges
  const badges = ['🥇', '🥈', '🥉', '🏅', '🎖️'];
  const tiers  = ['gold', 'silver', 'bronze', 'crtp', 'crtp'];
  const titles = ['OSCP', 'OSCP', 'OSCP', 'CRTP', 'CRTP'];

  top5.forEach((p, i) => {
    const step = document.createElement('div');
    step.className = `podium-step ${tiers[i]}`;
    step.innerHTML = `
      <div class="podium-medal">${badges[i]}</div>
      <div class="podium-name">${escapeHtml(p.name)}</div>
      <div class="podium-type">
        ${p.type}${p.members ? ` · ${p.members.length} members` : ''}
      </div>
      <div class="podium-title">${titles[i]}</div>
      <div class="stars">${renderStars(p.stars)}</div>
    `;
    podium.appendChild(step);
  });
}

// ---------- Rank graph ----------
function renderGraph(ranked) {
  const wrap = $('rank-graph');
  wrap.innerHTML = '';

  if (ranked.length === 0) {
    wrap.innerHTML = '<div class="podium-empty">No players yet.</div>';
    return;
  }

  ranked.forEach((p, i) => {
    const pos = i + 1;
    const row = document.createElement('div');
    row.className = `rank-row pos-${pos <= 3 ? pos : 'n'}`;

    const posEl = document.createElement('div');
    posEl.className = 'rank-pos';
    posEl.textContent = `#${pos}`;

    const nameWrap = document.createElement('div');
    nameWrap.className = 'rank-name-wrap';
    nameWrap.innerHTML = `
      <div class="rank-name">${escapeHtml(p.name)}</div>
      <div class="rank-meta">${p.type}${p.members ? ` · ${p.members.length}m` : ''}</div>
    `;

    const barTrack = document.createElement('div');
    barTrack.className = 'rank-bar-track';
    const pct = (p.stars / TOTAL_FLAGS) * 100;
    const fill = document.createElement('div');
    fill.className = 'rank-bar-fill';
    fill.style.width = `${pct}%`;
    if (p.stars > 0) fill.textContent = `${p.stars}/${TOTAL_FLAGS}`;
    barTrack.appendChild(fill);

    const starsWrap = document.createElement('div');
    starsWrap.className = 'rank-stars';
    starsWrap.innerHTML = renderStars(p.stars);

    row.appendChild(posEl);
    row.appendChild(nameWrap);
    row.appendChild(barTrack);
    row.appendChild(starsWrap);

    wrap.appendChild(row);
  });
}

// ---------- Timeline (per flag) ----------
function renderTimeline(data) {
  const wrap = $('timeline');
  wrap.innerHTML = '';

  for (let i = 1; i <= TOTAL_FLAGS; i++) {
    const entries = data[i] || [];
    const card = document.createElement('div');
    card.className = 'tl-card';

    const h = document.createElement('h3');
    h.textContent = `🚩 Flag ${i} — first to submit`;
    card.appendChild(h);

    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tl-empty';
      empty.textContent = 'No submissions yet.';
      card.appendChild(empty);
    } else {
      entries.forEach((e, idx) => {
        const row = document.createElement('div');
        row.className = 'tl-row';
        const rankClass = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
        row.innerHTML = `
          <div class="tl-rank ${rankClass}">#${idx + 1}</div>
          <div class="tl-name">${escapeHtml(e.name)}</div>
          <div class="tl-time">${formatTime(e.submitted_at)}</div>
        `;
        card.appendChild(row);
      });
    }

    wrap.appendChild(card);
  }
}

// ---------- Utils ----------
function renderStars(count) {
  let html = '';
  for (let i = 0; i < TOTAL_FLAGS; i++) {
    html += `<span class="star ${i < count ? 'filled' : ''}">★</span>`;
  }
  return html;
}

function formatTime(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = d.toLocaleDateString();
  return `${date} ${time}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}