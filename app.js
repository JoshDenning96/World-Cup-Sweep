'use strict';

const ROUND_LABELS = {
  group: 'Group',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter-Final',
  sf: 'Semi-Final',
  final: 'Final',
  third_place: '3rd Place',
};

const ROUND_ORDER = ['group', 'r32', 'r16', 'qf', 'sf', 'final', 'third_place'];

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// ── Country flag emoji helper ────────────────────────────────────────────────
const COUNTRY_CODES = {
  'Algeria': 'DZ', 'Argentina': 'AR', 'Australia': 'AU', 'Austria': 'AT',
  'Belgium': 'BE', 'Bosnia and Herzegovina': 'BA', 'Brazil': 'BR',
  'Canada': 'CA', 'Cape Verde': 'CV', 'Colombia': 'CO', 'Croatia': 'HR',
  'Czech Republic': 'CZ', 'DR Congo': 'CD', 'Ecuador': 'EC',
  'Egypt': 'EG', 'England': 'GB', 'France': 'FR', 'Germany': 'DE',
  'Ghana': 'GH', 'Haiti': 'HT', 'Iran': 'IR', 'Iraq': 'IQ',
  'Ivory Coast': 'CI', 'Japan': 'JP', 'Jordan': 'JO', 'Mexico': 'MX',
  'Morocco': 'MA', 'Netherlands': 'NL', 'New Zealand': 'NZ',
  'Norway': 'NO', 'Panama': 'PA', 'Paraguay': 'PY', 'Portugal': 'PT',
  'Qatar': 'QA', 'Saudi Arabia': 'SA', 'Scotland': 'GB', 'Senegal': 'SN',
  'South Africa': 'ZA', 'South Korea': 'KR', 'Spain': 'ES', 'Sweden': 'SE',
  'Switzerland': 'CH', 'Tunisia': 'TN', 'Turkey': 'TR', 'Uruguay': 'UY',
  'USA': 'US', 'Uzbekistan': 'UZ', 'Curaçao': 'CW',
};

function flag(team) {
  const code = COUNTRY_CODES[team];
  if (!code) return '';
  const cp = code.split('').map(c => 0x1F1E6 - 65 + c.charCodeAt(0));
  return String.fromCodePoint(...cp) + ' ';
}

// ── Points calculation ───────────────────────────────────────────────────────
function calculateStandings(data) {
  const { participants, matches, group_winners, points_config: pts } = data;

  const teamOwner = {};
  const strongTeams = new Set();
  const underdogTeams = new Set();

  for (const p of participants) {
    teamOwner[p.strong_team] = { p, type: 'strong' };
    teamOwner[p.underdog_team] = { p, type: 'underdog' };
    strongTeams.add(p.strong_team);
    underdogTeams.add(p.underdog_team);
  }

  const scores = {};
  for (const p of participants) {
    scores[p.name] = { participant: p, total: 0, group: 0, knockout: 0, bonuses: 0 };
  }

  const addPts = (name, amount, bucket) => {
    if (!name || amount <= 0) return;
    scores[name].total += amount;
    scores[name][bucket] += amount;
  };

  for (const match of matches) {
    if (match.home_score === null || match.away_score === null) continue;

    const hs = match.home_score;
    const as = match.away_score;
    const homeWin = hs > as;
    const awayWin = as > hs;
    const draw = hs === as;
    const homeEntry = teamOwner[match.home_team];
    const awayEntry = teamOwner[match.away_team];

    if (match.round === 'group') {
      if (homeEntry) {
        addPts(homeEntry.p.name, homeWin ? pts.group_win : draw ? pts.group_draw : 0, 'group');
      }
      if (awayEntry) {
        addPts(awayEntry.p.name, awayWin ? pts.group_win : draw ? pts.group_draw : 0, 'group');
      }
    } else {
      const winPts = pts[match.round] || 0;
      if (homeWin && homeEntry) addPts(homeEntry.p.name, winPts, 'knockout');
      if (awayWin && awayEntry) addPts(awayEntry.p.name, winPts, 'knockout');
    }

    // Underdog bonus: underdog beats a strong team
    const udBonus = pts.underdog_bonus || 0;
    if (udBonus > 0) {
      if (homeWin && underdogTeams.has(match.home_team) && strongTeams.has(match.away_team) && homeEntry) {
        addPts(homeEntry.p.name, udBonus, 'bonuses');
      }
      if (awayWin && underdogTeams.has(match.away_team) && strongTeams.has(match.home_team) && awayEntry) {
        addPts(awayEntry.p.name, udBonus, 'bonuses');
      }
    }
  }

  // Group winner bonus
  const gwBonus = pts.group_winner_bonus || 0;
  if (gwBonus > 0 && group_winners) {
    for (const team of group_winners) {
      const entry = teamOwner[team];
      if (entry) addPts(entry.p.name, gwBonus, 'bonuses');
    }
  }

  return Object.values(scores).sort((a, b) => b.total - a.total || a.participant.name.localeCompare(b.participant.name));
}

// ── Recent results (last 10 played matches) ──────────────────────────────────
function getRecentResults(data) {
  const played = data.matches.filter(m => m.home_score !== null && m.away_score !== null);
  return played.slice(-10).reverse();
}

// ── Render helpers ───────────────────────────────────────────────────────────
function renderLeaderboard(standings, data) {
  const { participants } = data;
  const teamOwner = {};
  for (const p of participants) {
    teamOwner[p.strong_team] = p;
    teamOwner[p.underdog_team] = p;
  }

  const played = data.matches.filter(m => m.home_score !== null).length;
  const total = data.matches.length;

  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Teams</th>
        <th class="right" colspan="2">Points</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');
  let prevTotal = null;
  let displayRank = 0;
  let trueRank = 0;

  for (const row of standings) {
    trueRank++;
    if (row.total !== prevTotal) displayRank = trueRank;
    prevTotal = row.total;

    const { participant: p, total, group, knockout, bonuses } = row;
    const tr = document.createElement('tr');
    tr.className = `rank-${displayRank}`;

    const rankCell = MEDALS[displayRank]
      ? `<span class="rank">${MEDALS[displayRank]}</span>`
      : `<span class="rank-num">${displayRank}</span>`;

    const breakdown = [
      group ? `${group} group` : '',
      knockout ? `${knockout} KO` : '',
      bonuses ? `${bonuses} bonus` : '',
    ].filter(Boolean).join(' · ');

    tr.innerHTML = `
      <td>${rankCell}</td>
      <td class="name-cell">${p.name}</td>
      <td class="teams-cell">
        <span class="team-strong">${flag(p.strong_team)}${p.strong_team}</span><br>
        <span class="team-underdog">${flag(p.underdog_team)}${p.underdog_team}</span>
      </td>
      <td class="pts-total">${total}</td>
      <td class="pts-breakdown">${breakdown || '—'}</td>
    `;
    tbody.appendChild(tr);
  }

  const container = document.getElementById('leaderboard-container');
  container.innerHTML = '';
  container.appendChild(table);

  document.getElementById('last-updated').textContent =
    `${played} / ${total} matches played`;
}

function renderRules(pts) {
  const rules = [
    { label: 'Group Win',    pts: pts.group_win,         sub: 'per win' },
    { label: 'Group Draw',   pts: pts.group_draw,        sub: 'per draw' },
    { label: 'Group Winner', pts: pts.group_winner_bonus, sub: 'bonus' },
    { label: 'Round of 32',  pts: pts.r32,               sub: 'per win' },
    { label: 'Round of 16',  pts: pts.r16,               sub: 'per win' },
    { label: 'Quarter-Final',pts: pts.qf,                sub: 'per win' },
    { label: 'Semi-Final',   pts: pts.sf,                sub: 'per win' },
    { label: 'Final',        pts: pts.final,             sub: 'per win' },
    { label: 'Underdog',     pts: pts.underdog_bonus,    sub: 'beats strong' },
  ];

  const grid = document.createElement('div');
  grid.className = 'rules-grid';
  for (const r of rules) {
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.innerHTML = `
      <div class="rule-label">${r.label}</div>
      <div class="rule-pts">+${r.pts}</div>
      <div class="rule-sub">${r.sub}</div>
    `;
    grid.appendChild(card);
  }

  document.getElementById('rules-container').innerHTML = '';
  document.getElementById('rules-container').appendChild(grid);
}

function renderRecentResults(data) {
  const recent = getRecentResults(data);
  const container = document.getElementById('recent-container');

  if (recent.length === 0) {
    container.innerHTML = '<p class="no-results">No matches played yet.</p>';
    return;
  }

  const teamOwner = {};
  const underdogTeams = new Set();
  const strongTeams = new Set();
  for (const p of data.participants) {
    teamOwner[p.strong_team] = { p, type: 'strong' };
    teamOwner[p.underdog_team] = { p, type: 'underdog' };
    strongTeams.add(p.strong_team);
    underdogTeams.add(p.underdog_team);
  }

  const list = document.createElement('div');
  list.className = 'results-list';

  for (const m of recent) {
    const homeOwner = teamOwner[m.home_team];
    const awayOwner = teamOwner[m.away_team];
    const homeWin = m.home_score > m.away_score;
    const awayWin = m.away_score > m.home_score;

    const homeUdBonus = homeWin && underdogTeams.has(m.home_team) && strongTeams.has(m.away_team);
    const awayUdBonus = awayWin && underdogTeams.has(m.away_team) && strongTeams.has(m.home_team);

    const ownerParts = [];
    if (homeOwner) {
      let label = `<span class="owner-name">${homeOwner.p.name}</span>`;
      if (homeOwner.type === 'underdog') label += `<span class="badge-underdog">ud</span>`;
      if (homeUdBonus) label += `<span class="badge-bonus">+bonus</span>`;
      ownerParts.push(label);
    }
    if (awayOwner) {
      let label = `<span class="owner-name">${awayOwner.p.name}</span>`;
      if (awayOwner.type === 'underdog') label += `<span class="badge-underdog">ud</span>`;
      if (awayUdBonus) label += `<span class="badge-bonus">+bonus</span>`;
      ownerParts.push(label);
    }

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
      <span class="result-round-badge">${ROUND_LABELS[m.round] || m.round}</span>
      <div class="result-teams">
        <span class="result-team">${flag(m.home_team)}${m.home_team}</span>
        <span class="result-score">${m.home_score} – ${m.away_score}</span>
        <span class="result-team away">${flag(m.away_team)}${m.away_team}</span>
      </div>
      <div class="result-owners">${ownerParts.join(' vs ')}</div>
    `;
    list.appendChild(card);
  }

  container.innerHTML = '';
  container.appendChild(list);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function init() {
  let data;
  try {
    const res = await fetch(`data.json?_=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    document.getElementById('leaderboard-container').innerHTML =
      `<p class="loading">Error loading data: ${e.message}</p>`;
    return;
  }

  const standings = calculateStandings(data);
  renderLeaderboard(standings, data);
  renderRules(data.points_config);
  renderRecentResults(data);
}

init();
