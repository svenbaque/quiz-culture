// Quiz Culture : QCM de culture générale.
// Onglet « Partie libre » : on choisit le nombre de questions, les thèmes et le niveau, puis on joue.

const LEVELS = [
  { id: 1, label: '🟢 Facile' },
  { id: 2, label: '🟡 Moyen' },
  { id: 3, label: '🔴 Difficile' },
  { id: 0, label: '🎲 Tous niveaux' },
];
const LEVEL_NAMES = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };
const LETTERS = ['A', 'B', 'C', 'D'];
const MIN_QUESTIONS = 5;

// ---------- Questions ----------

// Aplatit la banque : chaque question reçoit un identifiant stable (thème-niveau-numéro).
const ALL = [];
for (const theme of THEMES) {
  for (const level of [1, 2, 3]) {
    (BANQUE[theme.id]?.[level] || []).forEach((row, i) => {
      const [q, good, ...rest] = row;
      ALL.push({ id: `${theme.id}-${level}-${i}`, theme: theme.id, level, q, good, wrong: rest.slice(0, 3), context: rest[3] });
    });
  }
}
const themeById = Object.fromEntries(THEMES.map(t => [t.id, t]));

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Mémoire locale ----------

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible : tant pis */ }
  },
};

const DEFAULT_SETTINGS = { count: 10, random: true, themes: [], level: 1 };
let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('reglages', {}));

function saveSettings() { store.set('reglages', settings); }

function selectedThemes() {
  return settings.random ? THEMES.map(t => t.id) : settings.themes;
}

function pool() {
  const themes = new Set(selectedThemes());
  return ALL.filter(q => themes.has(q.theme) && (settings.level === 0 || q.level === settings.level));
}

// Tire les questions en privilégiant celles pas encore vues, pour éviter les répétitions d'une partie à l'autre.
function drawQuestions(count) {
  const candidates = pool();
  const seen = new Set(store.get('vues', []));
  let fresh = candidates.filter(q => !seen.has(q.id));
  if (fresh.length < count) {
    // Plus assez de questions nouvelles dans cette sélection : on « oublie » celles de la sélection et on recommence.
    const ids = new Set(candidates.map(q => q.id));
    store.set('vues', [...seen].filter(id => !ids.has(id)));
    const old = shuffle(candidates.filter(q => seen.has(q.id)));
    fresh = shuffle(fresh).concat(old);
  } else {
    fresh = shuffle(fresh);
  }
  return fresh.slice(0, count).map(q => {
    const options = shuffle([q.good, ...q.wrong]);
    return { ...q, options, answer: options.indexOf(q.good) };
  });
}

function markSeen(id) {
  const seen = store.get('vues', []);
  if (!seen.includes(id)) { seen.push(id); store.set('vues', seen); }
}

// ---------- Affichage ----------

const view = document.getElementById('view');
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
const titleEl = document.getElementById('title');

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function setHeader({ title = 'Quiz Culture', left = null, right = null } = {}) {
  titleEl.textContent = title;
  for (const [btn, cfg] of [[leftBtn, left], [rightBtn, right]]) {
    btn.hidden = !cfg;
    if (cfg) { btn.textContent = cfg.text; btn.onclick = cfg.onClick; btn.setAttribute('aria-label', cfg.label || cfg.text); }
  }
}

function themeToggle() {
  const dark = document.documentElement.dataset.theme !== 'light';
  return {
    text: dark ? '☀︎' : '☾',
    label: dark ? 'Passer en thème clair' : 'Passer en thème sombre',
    onClick: () => {
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* ignoré */ }
      renderSetup();
    },
  };
}

// ---------- Onglet Partie libre : réglages ----------

function renderSetup() {
  document.body.classList.remove('playing');
  setHeader({ title: 'Partie libre', right: themeToggle() });

  const available = pool().length;
  const max = Math.max(MIN_QUESTIONS, available);
  if (settings.count > max) settings.count = max;
  if (settings.count < MIN_QUESTIONS) settings.count = MIN_QUESTIONS;
  const enough = available >= MIN_QUESTIONS;
  const noTheme = selectedThemes().length === 0;

  let dispo;
  if (noTheme) dispo = '<p class="dispo warn">Choisissez au moins un thème.</p>';
  else if (!enough) dispo = `<p class="dispo warn">Seulement ${available} question${available > 1 ? 's' : ''} pour ce choix : ajoutez un thème ou prenez « Tous niveaux ».</p>`;
  else dispo = `<p class="dispo">${available} questions disponibles avec ces réglages</p>`;

  view.innerHTML = `
    <div class="section">
      <h2>Nombre de questions <small>minimum ${MIN_QUESTIONS}</small></h2>
      <div class="stepper">
        <button id="minus" aria-label="Moins de questions" ${settings.count <= MIN_QUESTIONS ? 'disabled' : ''}>−</button>
        <div class="count">${settings.count}</div>
        <button id="plus" aria-label="Plus de questions" ${settings.count >= max ? 'disabled' : ''}>+</button>
      </div>
      <div class="chips center">
        ${[5, 10, 15, 20, 30].filter(n => n <= max).map(n => `<button class="chip ${settings.count === n ? 'on' : ''}" data-count="${n}">${n}</button>`).join('')}
        <button class="chip ${settings.count === max && ![5, 10, 15, 20, 30].includes(max) ? 'on' : ''}" data-count="${max}">Max (${max})</button>
      </div>
    </div>

    <div class="section">
      <h2>Thèmes <small>${settings.random ? 'tous' : settings.themes.length + ' choisi' + (settings.themes.length > 1 ? 's' : '')}</small></h2>
      <button class="random ${settings.random ? 'on' : ''}" id="random">
        <span>🎲</span><span>Aléatoire : tous les thèmes</span><span class="check">${settings.random ? '✓' : ''}</span>
      </button>
      <div class="themes">
        ${THEMES.map(t => `<button class="theme ${!settings.random && settings.themes.includes(t.id) ? 'on' : ''}" data-theme="${t.id}"><span class="e">${t.emoji}</span><span>${esc(t.label)}</span></button>`).join('')}
      </div>
    </div>

    <div class="section">
      <h2>Niveau de difficulté</h2>
      <div class="levels">
        ${LEVELS.map(l => `<button class="level ${settings.level === l.id ? 'on' : ''}" data-level="${l.id}">${l.label}</button>`).join('')}
      </div>
    </div>

    ${dispo}
    <button class="primary" id="start" ${enough && !noTheme ? '' : 'disabled'}>Lancer la partie</button>
  `;

  const update = () => { saveSettings(); renderSetup(); };
  view.querySelector('#minus').onclick = () => { settings.count = Math.max(MIN_QUESTIONS, settings.count - 1); update(); };
  view.querySelector('#plus').onclick = () => { settings.count = Math.min(max, settings.count + 1); update(); };
  view.querySelectorAll('[data-count]').forEach(b => b.onclick = () => { settings.count = +b.dataset.count; update(); });
  view.querySelector('#random').onclick = () => { settings.random = !settings.random; if (settings.random) settings.themes = []; update(); };
  view.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => {
    const id = b.dataset.theme;
    if (settings.random) { settings.random = false; settings.themes = [id]; }
    else if (settings.themes.includes(id)) settings.themes = settings.themes.filter(t => t !== id);
    else settings.themes = [...settings.themes, id];
    if (settings.themes.length === THEMES.length) { settings.random = true; settings.themes = []; }
    update();
  });
  view.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { settings.level = +b.dataset.level; update(); });
  view.querySelector('#start').onclick = startGame;
}

// ---------- Partie ----------

let game = null;

function startGame() {
  const questions = drawQuestions(settings.count);
  if (questions.length < MIN_QUESTIONS) return;
  game = { questions, index: 0, answers: [] };
  document.body.classList.add('playing');
  window.scrollTo(0, 0);
  renderQuestion();
}

function quitGame() {
  if (game && game.answers.length < game.questions.length && !confirm('Abandonner la partie en cours ?')) return;
  game = null;
  renderSetup();
}

function renderQuestion() {
  const q = game.questions[game.index];
  const total = game.questions.length;
  const score = game.answers.filter(Boolean).length;
  const t = themeById[q.theme];
  setHeader({ title: `Question ${game.index + 1}/${total}`, left: { text: '✕', label: 'Quitter la partie', onClick: quitGame } });

  view.innerHTML = `
    <div class="progress"><div style="width:${(game.index / total) * 100}%"></div></div>
    <div class="qmeta">
      <div class="badges"><span class="badge">${t.emoji} ${esc(t.label)}</span><span class="badge">${LEVEL_NAMES[q.level]}</span></div>
      <span class="score-live">${score} pt${score > 1 ? 's' : ''}</span>
    </div>
    <div class="question">${esc(q.q)}</div>
    <div class="answers">
      ${q.options.map((o, i) => `<button class="answer" data-i="${i}"><span class="l">${LETTERS[i]}</span><span>${esc(o)}</span></button>`).join('')}
    </div>
    <div id="fb"></div>
  `;
  view.querySelectorAll('.answer').forEach(b => b.onclick = () => answer(+b.dataset.i));
}

function answer(choice) {
  const q = game.questions[game.index];
  if (game.answers.length > game.index) return; // déjà répondu
  const ok = choice === q.answer;
  game.answers.push(ok);
  q.choice = choice;
  markSeen(q.id);

  view.querySelectorAll('.answer').forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add('good');
    else if (i === choice) b.classList.add('bad');
    else b.classList.add('dim');
  });
  const score = game.answers.filter(Boolean).length;
  view.querySelector('.score-live').textContent = `${score} pt${score > 1 ? 's' : ''}`;

  const last = game.index === game.questions.length - 1;
  const fb = view.querySelector('#fb');
  fb.innerHTML = `
    <div class="feedback">
      <div class="verdict ${ok ? 'ok' : 'ko'}">
        ${ok ? '✅ Bonne réponse !' : '❌ Raté !'}
        ${ok ? '' : `<small>La bonne réponse était ${LETTERS[q.answer]} : ${esc(q.good)}</small>`}
      </div>
      <div class="context"><b>📖 Le saviez-vous ?</b>${esc(q.context)}</div>
      <button class="primary" id="next">${last ? 'Voir mon résultat' : 'Question suivante →'}</button>
    </div>
  `;
  fb.querySelector('#next').onclick = () => {
    if (last) return renderResults();
    game.index++;
    window.scrollTo(0, 0);
    renderQuestion();
  };
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Résultats ----------

function resultMessage(pct) {
  if (pct === 100) return ['🏆', 'Sans faute, bravo !'];
  if (pct >= 80) return ['🥇', 'Excellent !'];
  if (pct >= 60) return ['🥈', 'Très bien joué !'];
  if (pct >= 40) return ['🥉', 'Pas mal, continuez !'];
  return ['📚', 'Chaque erreur est une chose apprise !'];
}

function renderResults() {
  const total = game.questions.length;
  const score = game.answers.filter(Boolean).length;
  const pct = Math.round((score / total) * 100);
  const [icon, msg] = resultMessage(pct);
  setHeader({ title: 'Résultat' });
  window.scrollTo(0, 0);

  const byTheme = {};
  game.questions.forEach((q, i) => {
    byTheme[q.theme] = byTheme[q.theme] || { ok: 0, n: 0 };
    byTheme[q.theme].n++;
    if (game.answers[i]) byTheme[q.theme].ok++;
  });

  view.innerHTML = `
    <div class="result-hero">
      <div class="trophy">${icon}</div>
      <div class="big">${score}/${total}</div>
      <div class="pct">${pct} % de bonnes réponses</div>
      <div class="msg">${msg}</div>
    </div>

    ${Object.keys(byTheme).length > 1 ? `
    <div class="section">
      <h2>Par thème</h2>
      <div class="bytheme">
        ${Object.entries(byTheme).map(([id, r]) => `
          <div class="bt-row"><span>${themeById[id].emoji} ${esc(themeById[id].label)}</span><span>${r.ok}/${r.n}</span>
          <div class="bt-bar"><div style="width:${(r.ok / r.n) * 100}%"></div></div></div>`).join('')}
      </div>
    </div>` : ''}

    <div class="section recap">
      <h2>Les questions <small>touchez pour relire</small></h2>
      ${game.questions.map((q, i) => `
        <details>
          <summary><span class="mark">${game.answers[i] ? '✅' : '❌'}</span><span>${esc(q.q)}</span></summary>
          <div class="rep">
            ${game.answers[i] ? '' : `<div class="ko">Votre réponse : ${esc(q.options[q.choice])}</div>`}
            <div class="ok">Bonne réponse : ${esc(q.good)}</div>
          </div>
          <div class="ctx">${esc(q.context)}</div>
        </details>`).join('')}
    </div>

    <button class="primary" id="again">Rejouer avec les mêmes réglages</button>
    <button class="secondary" id="settings">Changer les réglages</button>
  `;
  view.querySelector('#again').onclick = startGame;
  view.querySelector('#settings').onclick = () => { game = null; renderSetup(); };
}

// ---------- Démarrage ----------

document.querySelectorAll('#tabs .tab').forEach(tab => tab.onclick = () => { if (!game) renderSetup(); });
renderSetup();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
