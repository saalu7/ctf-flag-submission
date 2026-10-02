const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- JSON DATABASE ----------
let db = { players: [], submissions: [] };

function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (!db.players) db.players = [];
      if (!db.submissions) db.submissions = [];
    } catch (e) {
      console.error('DB load failed, starting fresh:', e.message);
      db = { players: [], submissions: [] };
    }
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

loadDB();

function nextPlayerId() {
  return db.players.length ? Math.max(...db.players.map(p => p.id)) + 1 : 1;
}
function nextSubmissionId() {
  return db.submissions.length ? Math.max(...db.submissions.map(s => s.id)) + 1 : 1;
}
const crypto = require('crypto');

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function newSalt() {
  return crypto.randomBytes(16).toString('hex');
}
// ---------- FLAGS ----------
const FLAGS = {
  1: 'Core26_1{tR14!gR4#nT$}',
  2: 'Core26_2{v44p4ch1d3_l3g4cy}',
  3: 'Core26_3{7h00k1yall0_n4dh4}',
  4: 'Core26_4{4bs0lu73_c1n3m4}',
  5: 'Core26_5{rA4!b1T_h0l3}',
  6: 'Core26_6{aNk9xK2_m35s!}',
};

// ---------- FLAG 4 REWARD ----------
// IP address shown as a popup when a player submits flag 4.
// Change this when you're ready.
const FLAG4_REWARD_IP = '103.207.183.19';

// ==================================================
// ROUTES
// ==================================================

// ---------- Register / Login ----------
// ---------- Register / Login ----------
app.post('/api/login', (req, res) => {
  const { type, name, password, members } = req.body;

  if (!type || !name || !password) {
    return res.status(400).json({ error: 'Name and password are required' });
  }
  if (type !== 'individual' && type !== 'team') {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const trimmedName = name.trim();

  if (type === 'team') {
    if (!Array.isArray(members)) {
      return res.status(400).json({ error: 'Team members required' });
    }
    const validMembers = members.filter(m => m && m.trim());
    if (validMembers.length < 2 || validMembers.length > 4) {
      return res.status(400).json({ error: 'Teams must have 2 to 4 members' });
    }
  }

  const existing = db.players.find(p => p.name === trimmedName);

  if (existing) {
    // Name taken → treat this as a login attempt, verify password
    if (existing.type !== type) {
      return res.status(409).json({ error: 'Name already taken' });
    }

    // Legacy players without a password field (registered before this change)
    if (!existing.salt || !existing.password_hash) {
      return res.status(403).json({
        error: 'This name has no password set. Ask an admin to reset it.',
      });
    }

    const attempt = hashPassword(password, existing.salt);
    if (attempt !== existing.password_hash) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

        // Success → return player without exposing secrets
    const { salt, password_hash, password_plain, ...safe } = existing;
    return res.json({ player: safe, message: 'Logged in' });
  }

    // New registration
  const salt = newSalt();
  const player = {
    id: nextPlayerId(),
    type,
    name: trimmedName,
    members: type === 'team' ? members.filter(m => m && m.trim()) : null,
    salt,
    password_hash: hashPassword(password, salt),
    password_plain: password,   // ⚠️ LAB ONLY — for admin recovery
    created_at: Date.now(),
  };
  db.players.push(player);
  saveDB();

   const { salt: s, password_hash: ph, password_plain: pp, ...safe } = player;
  res.json({ player: safe, message: 'Registered' });
});

// ---------- Get player's own submissions ----------
app.get('/api/player/:id/submissions', (req, res) => {
  const playerId = parseInt(req.params.id, 10);
  const rows = db.submissions
    .filter(s => s.player_id === playerId)
    .sort((a, b) => a.flag_number - b.flag_number)
    .map(s => ({ flag_number: s.flag_number, submitted_at: s.submitted_at }));
  res.json(rows);
});

// ---------- Submit a flag ----------
app.post('/api/submit', (req, res) => {
  const { player_id, flag_number, flag_value } = req.body;

  if (!player_id || !flag_number || !flag_value) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const player = db.players.find(p => p.id === player_id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  if (FLAGS[flag_number] !== flag_value.trim()) {
    return res.status(400).json({ error: 'Incorrect flag' });
  }

  const already = db.submissions.find(
    s => s.player_id === player_id && s.flag_number === flag_number
  );
  if (already) {
    return res.status(400).json({ error: 'Flag already submitted' });
  }

  // Prerequisite: flags 3 and 4 require 1 and 2
  if (flag_number === 3 || flag_number === 4) {
    const has1 = db.submissions.some(s => s.player_id === player_id && s.flag_number === 1);
    const has2 = db.submissions.some(s => s.player_id === player_id && s.flag_number === 2);
    if (!has1 || !has2) {
      return res.status(403).json({
        error: 'You must submit flags 1 and 2 before flags 3 or 4',
      });
    }
  }

  const now = Date.now();
  db.submissions.push({
    id: nextSubmissionId(),
    player_id,
    flag_number,
    submitted_at: now,
  });
  saveDB();

  const response = { success: true, submitted_at: now };

  // Reward for flag 4: send back an IP address
  if (flag_number === 4) {
    response.reward_ip = FLAG4_REWARD_IP;
    response.reward_message = 'Flag 4 accepted. Here is your reward IP:';
  }

  res.json(response);
});

// ---------- Per-player summary (stars / race track / podium) ----------
app.get('/api/players', (req, res) => {
  const players = db.players.map(p => {
    const subs = db.submissions
      .filter(s => s.player_id === p.id)
      .sort((a, b) => a.submitted_at - b.submitted_at);
    const flags = subs.map(s => s.flag_number);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      members: p.members,
      flags_solved: flags,
      stars: flags.length,
      last_submission: subs.length ? subs[subs.length - 1].submitted_at : null,
    };
  });
  res.json(players);
});

// ---------- Per-flag timeline (grouped by flag) ----------
app.get('/api/leaderboard', (req, res) => {
  const grouped = {};
  for (let i = 1; i <= 6; i++) grouped[i] = [];

  const sorted = [...db.submissions].sort((a, b) => a.submitted_at - b.submitted_at);

  for (const s of sorted) {
    const p = db.players.find(pl => pl.id === s.player_id);
    if (!p) continue;
    grouped[s.flag_number].push({
      player_id: p.id,
      name: p.name,
      type: p.type,
      members: p.members,
      submitted_at: s.submitted_at,
    });
  }

  res.json(grouped);
});

// ==================================================
// START SERVER
// ==================================================
app.listen(PORT, () => {
  console.log(`CTF server running at http://localhost:${PORT}`);
});