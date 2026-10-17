// Quiz Culture : QCM de culture générale.
// Comptes stockés sur l'appareil, onglets Partie libre, Survie, Profil et Admin.

const LEVELS = [
  { id: 1, label: '🟢 Facile' },
  { id: 2, label: '🟡 Moyen' },
  { id: 3, label: '🔴 Difficile' },
  { id: 0, label: '🎲 Tous niveaux' },
];
const LEVEL_NAMES = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };
const LETTERS = ['A', 'B', 'C', 'D'];
const MIN_QUESTIONS = 5;
const ADMIN_ID = 'admin';
const ADMIN_MDP_DEFAUT = 'admin';

// ---------- Questions ----------

// Identifiant stable tiré du texte de la question : il ne change pas si l'on réordonne la banque.
function hashTexte(texte) {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const ALL = [];
for (const theme of THEMES) {
  for (const level of [1, 2, 3]) {
    for (const row of BANQUE[theme.id]?.[level] || []) {
      const [q, good, ...rest] = row;
      ALL.push({ id: `${theme.id}-${hashTexte(q)}`, theme: theme.id, level, q, good, wrong: rest.slice(0, 3), context: rest[3] });
    }
  }
}
const themeById = Object.fromEntries(THEMES.map(t => [t.id, t]));
const questionById = Object.fromEntries(ALL.map(q => [q.id, q]));

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

// ---------- Questions retirées ----------
// RETIREES (retirees.js) : retraits publiés pour tout le monde.
// « corrections » : choix de l'admin sur cet appareil, en attente de publication (id -> true retirée / false rétablie).

const publiees = new Set(typeof RETIREES !== 'undefined' ? RETIREES : []);
function corrections() { return store.get('corrections', {}); }
function estRetiree(id) {
  const c = corrections();
  return id in c ? c[id] : publiees.has(id);
}
function questionsActives() { return ALL.filter(q => !estRetiree(q.id)); }
function changementsEnAttente() {
  return Object.entries(corrections()).filter(([id, retiree]) => retiree !== publiees.has(id) && questionById[id]);
}

// ---------- Comptes ----------

async function hashMdp(sel, mdp) {
  const data = new TextEncoder().encode(sel + ':' + mdp);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function nouveauSel() {
  return [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
}

function comptes() { return store.get('comptes', []); }
function sauverComptes(liste) { store.set('comptes', liste); }

function nouveauProfil(id, nom, sel, hash, admin = false) {
  return { id, nom, sel, hash, admin, creeLe: new Date().toISOString(), vues: [], record: 0, stats: { repondues: 0, bonnes: 0 }, parties: [] };
}

async function assurerAdmin() {
  const liste = comptes();
  if (liste.some(c => c.id === ADMIN_ID)) return;
  const sel = nouveauSel();
  liste.unshift(nouveauProfil(ADMIN_ID, 'admin', sel, await hashMdp(sel, ADMIN_MDP_DEFAUT), true));
  sauverComptes(liste);
}

let user = null;

function sauverUser() {
  const liste = comptes();
  const i = liste.findIndex(c => c.id === user.id);
  if (i >= 0) liste[i] = user; else liste.push(user);
  sauverComptes(liste);
}

function connecter(compte) {
  user = compte;
  store.set('session', compte.id);
  ouvrirOnglet('libre');
}

function deconnecter() {
  user = null;
  game = null;
  store.set('session', null);
  renderConnexion();
}

function enregistrerPartie(partie) {
  user.parties.unshift({ date: new Date().toISOString(), ...partie });
  user.parties = user.parties.slice(0, 50);
  sauverUser();
}

function marquerVue(id) {
  if (!user.vues.includes(id)) user.vues.push(id);
}

// ---------- Réglages de la partie libre ----------

const DEFAULT_SETTINGS = { count: 10, random: true, themes: [], level: 1 };
let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('reglages', {}));
function saveSettings() { store.set('reglages', settings); }
function selectedThemes() { return settings.random ? THEMES.map(t => t.id) : settings.themes; }
function poolLibre() {
  const themes = new Set(selectedThemes());
  return questionsActives().filter(q => themes.has(q.theme) && (settings.level === 0 || q.level === settings.level));
}

// Tire des questions en privilégiant celles que ce joueur n'a jamais vues.
// Quand il les a toutes vues, on recommence avec les plus anciennes.
function tirer(pool, count) {
  const vues = new Set(user.vues);
  const nouvelles = shuffle(pool.filter(q => !vues.has(q.id)));
  let choix = nouvelles.slice(0, count);
  if (choix.length < count) {
    const ordre = new Map(user.vues.map((id, i) => [id, i]));
    const anciennes = pool.filter(q => vues.has(q.id)).sort((a, b) => ordre.get(a.id) - ordre.get(b.id));
    const reprises = shuffle(anciennes.slice(0, count - choix.length));
    // Ces questions reviennent : on les remet en fin d'historique.
    const ids = new Set(reprises.map(q => q.id));
    user.vues = user.vues.filter(id => !ids.has(id));
    choix = choix.concat(reprises);
  }
  return choix.map(preparer);
}

function preparer(q) {
  const options = shuffle([q.good, ...q.wrong]);
  return { ...q, options, answer: options.indexOf(q.good) };
}

// ---------- Affichage ----------

const view = document.getElementById('view');
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
const titleEl = document.getElementById('title');
const tabsEl = document.getElementById('tabs');

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

function themeToggle(apres) {
  const dark = document.documentElement.dataset.theme !== 'light';
  return {
    text: dark ? '☀︎' : '☾',
    label: dark ? 'Passer en thème clair' : 'Passer en thème sombre',
    onClick: () => {
      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* ignoré */ }
      apres();
    },
  };
}

function haut() { window.scrollTo(0, 0); }

// ---------- Onglets ----------

const ONGLETS = [
  { id: 'libre', label: 'Partie libre', icone: '🎯', render: () => renderSetup() },
  { id: 'survie', label: 'Survie', icone: '🔥', render: () => renderSurvieAccueil() },
  { id: 'profil', label: 'Profil', icone: '👤', render: () => renderProfil() },
  { id: 'admin', label: 'Admin', icone: '🛠️', render: () => renderAdmin(), admin: true },
];
let ongletActif = 'libre';

function ouvrirOnglet(id) {
  ongletActif = id;
  game = null;
  document.body.classList.remove('playing', 'auth');
  tabsEl.innerHTML = ONGLETS.filter(o => !o.admin || user.admin).map(o =>
    `<button class="tab ${o.id === id ? 'active' : ''}" data-tab="${o.id}"><span class="ti">${o.icone}</span>${o.label}</button>`).join('');
  tabsEl.querySelectorAll('.tab').forEach(t => t.onclick = () => ouvrirOnglet(t.dataset.tab));
  haut();
  ONGLETS.find(o => o.id === id).render();
}

// ---------- Connexion ----------

function renderConnexion() {
  document.body.classList.add('auth');
  document.body.classList.remove('playing');
  setHeader({ title: 'Quiz Culture', right: themeToggle(renderConnexion) });
  const liste = comptes();
  view.innerHTML = `
    <div class="welcome">
      <div class="logo">❓</div>
      <h2>Qui joue ?</h2>
      <p class="muted">Chaque joueur a son compte, son historique de questions et son record.</p>
    </div>
    <div class="section">
      <div class="profils">
        ${liste.map(c => `<button class="profil" data-id="${esc(c.id)}"><span class="avatar">${c.admin ? '🛠️' : esc(c.nom.slice(0, 1).toUpperCase())}</span><span>${esc(c.nom)}</span>${c.admin ? '<span class="tag">admin</span>' : ''}</button>`).join('')}
      </div>
      <button class="secondary" id="creer">➕ Créer un compte</button>
    </div>
    <p class="note">Les comptes sont enregistrés uniquement sur cet appareil.</p>
  `;
  view.querySelectorAll('.profil').forEach(b => b.onclick = () => renderMotDePasse(comptes().find(c => c.id === b.dataset.id)));
  view.querySelector('#creer').onclick = renderCreation;
}

function renderMotDePasse(compte) {
  setHeader({ title: compte.nom, left: { text: '‹', label: 'Retour', onClick: renderConnexion } });
  view.innerHTML = `
    <form class="section form" id="f">
      <label>Mot de passe de ${esc(compte.nom)}
        <input type="password" id="mdp" autocomplete="current-password" required autofocus>
      </label>
      <p class="erreur" id="err" hidden>Mot de passe incorrect.</p>
      <button class="primary" type="submit">Se connecter</button>
    </form>
  `;
  view.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const mdp = view.querySelector('#mdp').value;
    if (await hashMdp(compte.sel, mdp) === compte.hash) connecter(compte);
    else { view.querySelector('#err').hidden = false; view.querySelector('#mdp').select(); }
  };
}

function renderCreation() {
  setHeader({ title: 'Nouveau compte', left: { text: '‹', label: 'Retour', onClick: renderConnexion } });
  view.innerHTML = `
    <form class="section form" id="f">
      <label>Prénom ou pseudo
        <input type="text" id="nom" maxlength="20" autocomplete="nickname" required autofocus>
      </label>
      <label>Mot de passe
        <input type="password" id="mdp" autocomplete="new-password" required minlength="4">
      </label>
      <label>Confirmer le mot de passe
        <input type="password" id="mdp2" autocomplete="new-password" required minlength="4">
      </label>
      <p class="erreur" id="err" hidden></p>
      <button class="primary" type="submit">Créer mon compte</button>
    </form>
  `;
  const err = view.querySelector('#err');
  view.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const nom = view.querySelector('#nom').value.trim();
    const mdp = view.querySelector('#mdp').value;
    const liste = comptes();
    let message = '';
    if (!nom) message = 'Choisissez un prénom ou un pseudo.';
    else if (liste.some(c => c.nom.toLowerCase() === nom.toLowerCase())) message = 'Ce nom est déjà pris sur cet appareil.';
    else if (mdp.length < 4) message = 'Le mot de passe doit faire au moins 4 caractères.';
    else if (mdp !== view.querySelector('#mdp2').value) message = 'Les deux mots de passe ne sont pas identiques.';
    if (message) { err.textContent = message; err.hidden = false; return; }
    const sel = nouveauSel();
    const compte = nouveauProfil('u' + Date.now().toString(36), nom, sel, await hashMdp(sel, mdp));
    sauverComptes([...liste, compte]);
    connecter(compte);
  };
}

// ---------- Partie libre : réglages ----------

function renderSetup() {
  setHeader({ title: 'Partie libre', right: themeToggle(renderSetup) });

  const pool = poolLibre();
  const available = pool.length;
  const vues = new Set(user.vues);
  const nouvelles = pool.filter(q => !vues.has(q.id)).length;
  const max = Math.max(MIN_QUESTIONS, available);
  if (settings.count > max) settings.count = max;
  if (settings.count < MIN_QUESTIONS) settings.count = MIN_QUESTIONS;
  const enough = available >= MIN_QUESTIONS;
  const noTheme = selectedThemes().length === 0;

  let dispo;
  if (noTheme) dispo = '<p class="dispo warn">Choisissez au moins un thème.</p>';
  else if (!enough) dispo = `<p class="dispo warn">Seulement ${available} question${available > 1 ? 's' : ''} pour ce choix : ajoutez un thème ou prenez « Tous niveaux ».</p>`;
  else dispo = `<p class="dispo">${available} questions avec ces réglages, dont ${nouvelles} jamais vue${nouvelles > 1 ? 's' : ''}</p>`;

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
  view.querySelector('#start').onclick = startLibre;
}

// ---------- Moteur de partie (commun aux deux modes) ----------

let game = null;

function startLibre() {
  const questions = tirer(poolLibre(), settings.count);
  if (questions.length < MIN_QUESTIONS) return;
  game = { mode: 'libre', questions, index: 0, answers: [] };
  sauverUser();
  document.body.classList.add('playing');
  haut();
  renderQuestion();
}

function startSurvie() {
  game = { mode: 'survie', questions: [], index: 0, answers: [], posees: new Set() };
  document.body.classList.add('playing');
  ajouterQuestionSurvie();
  haut();
  renderQuestion();
}

// Survie : une question à la fois, tous thèmes et niveaux, jamais deux fois dans la même partie.
function ajouterQuestionSurvie() {
  const pool = questionsActives().filter(q => !game.posees.has(q.id));
  if (!pool.length) return false;
  const [q] = tirer(pool, 1);
  game.posees.add(q.id);
  game.questions.push(q);
  return true;
}

function score() { return game.answers.filter(Boolean).length; }

function quitGame() {
  const enCours = game && (game.mode === 'survie' ? !game.fini : game.answers.length < game.questions.length);
  if (enCours && !confirm(game.mode === 'survie' ? 'Abandonner ? Cette partie ne comptera pas pour ton record.' : 'Abandonner la partie en cours ?')) return;
  sauverUser();
  ouvrirOnglet(ongletActif);
}

function renderQuestion() {
  const q = game.questions[game.index];
  const t = themeById[q.theme];
  const survie = game.mode === 'survie';
  const titre = survie ? `Survie · question ${game.index + 1}` : `Question ${game.index + 1}/${game.questions.length}`;
  setHeader({ title: titre, left: { text: '✕', label: 'Quitter la partie', onClick: quitGame } });

  view.innerHTML = `
    ${survie
      ? `<div class="survie-bar"><span>🔥 ${score()} point${score() > 1 ? 's' : ''}</span><span>🏆 Record : ${user.record}</span></div>`
      : `<div class="progress"><div style="width:${(game.index / game.questions.length) * 100}%"></div></div>`}
    <div class="qmeta">
      <div class="badges"><span class="badge">${t.emoji} ${esc(t.label)}</span><span class="badge">${LEVEL_NAMES[q.level]}</span></div>
      ${survie ? '' : `<span class="score-live">${score()} pt${score() > 1 ? 's' : ''}</span>`}
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
  marquerVue(q.id);
  user.stats.repondues++;
  if (ok) user.stats.bonnes++;
  sauverUser();

  view.querySelectorAll('.answer').forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add('good');
    else if (i === choice) b.classList.add('bad');
    else b.classList.add('dim');
  });
  const live = view.querySelector('.score-live');
  if (live) live.textContent = `${score()} pt${score() > 1 ? 's' : ''}`;

  let fin;
  if (game.mode === 'survie') {
    if (!ok) game.fini = true;
    else if (!ajouterQuestionSurvie()) game.fini = true; // toutes les questions réussies !
    fin = game.fini;
  } else {
    fin = game.index === game.questions.length - 1;
  }

  const fb = view.querySelector('#fb');
  fb.innerHTML = `
    <div class="feedback">
      <div class="verdict ${ok ? 'ok' : 'ko'}">
        ${ok ? '✅ Bonne réponse !' : (game.mode === 'survie' ? '💥 Raté, fin de la partie !' : '❌ Raté !')}
        ${ok ? '' : `<small>La bonne réponse était ${LETTERS[q.answer]} : ${esc(q.good)}</small>`}
      </div>
      <div class="context"><b>📖 Le saviez-vous ?</b>${esc(q.context)}</div>
      <button class="primary" id="next">${fin ? 'Voir mon résultat' : 'Question suivante →'}</button>
    </div>
  `;
  fb.querySelector('#next').onclick = () => {
    if (fin) return game.mode === 'survie' ? renderResultatSurvie() : renderResults();
    game.index++;
    haut();
    renderQuestion();
  };
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Résultats de la partie libre ----------

function resultMessage(pct) {
  if (pct === 100) return ['🏆', 'Sans faute, bravo !'];
  if (pct >= 80) return ['🥇', 'Excellent !'];
  if (pct >= 60) return ['🥈', 'Très bien joué !'];
  if (pct >= 40) return ['🥉', 'Pas mal, continuez !'];
  return ['📚', 'Chaque erreur est une chose apprise !'];
}

function recapHtml() {
  return `
    <div class="section recap">
      <h2>Les questions <small>touchez pour relire</small></h2>
      ${game.questions.slice(0, game.answers.length).map((q, i) => `
        <details>
          <summary><span class="mark">${game.answers[i] ? '✅' : '❌'}</span><span>${esc(q.q)}</span></summary>
          <div class="rep">
            ${game.answers[i] ? '' : `<div class="ko">Votre réponse : ${esc(q.options[q.choice])}</div>`}
            <div class="ok">Bonne réponse : ${esc(q.good)}</div>
          </div>
          <div class="ctx">${esc(q.context)}</div>
        </details>`).join('')}
    </div>`;
}

function renderResults() {
  const total = game.questions.length;
  const pts = score();
  const pct = Math.round((pts / total) * 100);
  const [icon, msg] = resultMessage(pct);
  enregistrerPartie({ mode: 'libre', score: pts, total });
  setHeader({ title: 'Résultat' });
  haut();

  const byTheme = {};
  game.questions.forEach((q, i) => {
    byTheme[q.theme] = byTheme[q.theme] || { ok: 0, n: 0 };
    byTheme[q.theme].n++;
    if (game.answers[i]) byTheme[q.theme].ok++;
  });

  view.innerHTML = `
    <div class="result-hero">
      <div class="trophy">${icon}</div>
      <div class="big">${pts}/${total}</div>
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

    ${recapHtml()}

    <button class="primary" id="again">Rejouer avec les mêmes réglages</button>
    <button class="secondary" id="settings">Changer les réglages</button>
  `;
  view.querySelector('#again').onclick = startLibre;
  view.querySelector('#settings').onclick = () => ouvrirOnglet('libre');
}

// ---------- Survie ----------

function renderSurvieAccueil() {
  setHeader({ title: 'Survie', right: themeToggle(renderSurvieAccueil) });
  const survies = user.parties.filter(p => p.mode === 'survie');
  const moyenne = survies.length ? Math.round(survies.reduce((s, p) => s + p.score, 0) / survies.length * 10) / 10 : 0;
  view.innerHTML = `
    <div class="result-hero">
      <div class="trophy">🔥</div>
      <div class="msg">Mode survie</div>
      <p class="muted">Des questions au hasard, tous thèmes et tous niveaux. Chaque bonne réponse rapporte 1 point. À la première erreur, la partie s'arrête.</p>
    </div>
    <div class="section stats">
      <div><b>${user.record}</b><span>record personnel</span></div>
      <div><b>${survies.length}</b><span>parties jouées</span></div>
      <div><b>${String(moyenne).replace('.', ',')}</b><span>moyenne</span></div>
    </div>
    <button class="primary" id="go">Commencer</button>
  `;
  view.querySelector('#go').onclick = startSurvie;
}

function renderResultatSurvie() {
  const pts = score();
  const ancien = user.record;
  const nouveau = pts > ancien;
  if (nouveau) user.record = pts;
  enregistrerPartie({ mode: 'survie', score: pts });
  setHeader({ title: 'Fin de partie' });
  haut();
  view.innerHTML = `
    <div class="result-hero">
      <div class="trophy">${nouveau ? '🏆' : '🔥'}</div>
      <div class="big">${pts}</div>
      <div class="pct">bonne${pts > 1 ? 's' : ''} réponse${pts > 1 ? 's' : ''} d'affilée</div>
      <div class="msg">${nouveau ? (ancien ? `Nouveau record ! (ancien : ${ancien})` : 'Premier record établi !') : `Record personnel : ${user.record}`}</div>
    </div>
    ${recapHtml()}
    <button class="primary" id="again">Rejouer</button>
    <button class="secondary" id="back">Retour</button>
  `;
  view.querySelector('#again').onclick = startSurvie;
  view.querySelector('#back').onclick = () => ouvrirOnglet('survie');
}

// ---------- Profil ----------

function dateCourte(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function renderProfil() {
  setHeader({ title: user.nom, right: themeToggle(renderProfil) });
  const total = questionsActives().length;
  const vues = user.vues.filter(id => questionById[id] && !estRetiree(id)).length;
  const reussite = user.stats.repondues ? Math.round(user.stats.bonnes / user.stats.repondues * 100) : 0;
  view.innerHTML = `
    <div class="section stats">
      <div><b>${vues}</b><span>questions vues sur ${total}</span></div>
      <div><b>${reussite} %</b><span>de réussite</span></div>
      <div><b>${user.record}</b><span>record survie</span></div>
    </div>
    <div class="section">
      <h2>Dernières parties</h2>
      ${user.parties.length ? `<div class="historique">${user.parties.slice(0, 15).map(p => `
        <div class="hist"><span>${p.mode === 'survie' ? '🔥 Survie' : '🎯 Partie libre'}</span><span class="muted">${dateCourte(p.date)}</span><b>${p.mode === 'survie' ? p.score + ' pt' + (p.score > 1 ? 's' : '') : p.score + '/' + p.total}</b></div>`).join('')}</div>`
        : '<p class="muted">Aucune partie pour l\'instant.</p>'}
    </div>
    <div class="section actions">
      <button class="secondary" id="mdp">🔑 Changer mon mot de passe</button>
      <button class="secondary" id="reset">🔄 Revoir toutes les questions depuis le début</button>
      <button class="secondary" id="logout">🚪 Changer de joueur</button>
      ${user.admin ? '' : '<button class="secondary danger" id="suppr">🗑️ Supprimer mon compte</button>'}
    </div>
  `;
  view.querySelector('#mdp').onclick = () => renderChangerMdp(user, () => ouvrirOnglet('profil'));
  view.querySelector('#reset').onclick = () => {
    if (!confirm('Oublier les questions déjà vues ? Ton record et tes parties sont conservés.')) return;
    user.vues = [];
    sauverUser();
    renderProfil();
  };
  view.querySelector('#logout').onclick = deconnecter;
  const suppr = view.querySelector('#suppr');
  if (suppr) suppr.onclick = () => {
    if (!confirm(`Supprimer définitivement le compte « ${user.nom} » et tout son historique ?`)) return;
    sauverComptes(comptes().filter(c => c.id !== user.id));
    deconnecter();
  };
}

function renderChangerMdp(compte, retour) {
  setHeader({ title: 'Mot de passe', left: { text: '‹', label: 'Retour', onClick: retour } });
  view.innerHTML = `
    <form class="section form" id="f">
      <p class="muted">Nouveau mot de passe pour « ${esc(compte.nom)} ».</p>
      <label>Nouveau mot de passe
        <input type="password" id="mdp" autocomplete="new-password" required minlength="4" autofocus>
      </label>
      <label>Confirmer
        <input type="password" id="mdp2" autocomplete="new-password" required minlength="4">
      </label>
      <p class="erreur" id="err" hidden></p>
      <button class="primary" type="submit">Enregistrer</button>
    </form>
  `;
  view.querySelector('#f').onsubmit = async e => {
    e.preventDefault();
    const mdp = view.querySelector('#mdp').value;
    const err = view.querySelector('#err');
    if (mdp.length < 4) { err.textContent = 'Au moins 4 caractères.'; err.hidden = false; return; }
    if (mdp !== view.querySelector('#mdp2').value) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; err.hidden = false; return; }
    const liste = comptes();
    const cible = liste.find(c => c.id === compte.id);
    cible.sel = nouveauSel();
    cible.hash = await hashMdp(cible.sel, mdp);
    sauverComptes(liste);
    if (user && user.id === cible.id) { user.sel = cible.sel; user.hash = cible.hash; }
    alert('Mot de passe modifié.');
    retour();
  };
}

// ---------- Admin ----------

const filtreAdmin = { theme: '', level: 0, texte: '', retirees: false, limite: 50 };

function renderAdmin() {
  setHeader({ title: 'Administration', right: themeToggle(renderAdmin) });
  const attente = changementsEnAttente();
  const nbRetirees = ALL.filter(q => estRetiree(q.id)).length;
  const f = filtreAdmin;
  const texte = f.texte.toLowerCase();
  const liste = ALL.filter(q =>
    (!f.theme || q.theme === f.theme) &&
    (!f.level || q.level === f.level) &&
    (!f.retirees || estRetiree(q.id)) &&
    (!texte || (q.q + ' ' + q.good).toLowerCase().includes(texte)));

  view.innerHTML = `
    <div class="section stats">
      <div><b>${ALL.length - nbRetirees}</b><span>questions actives</span></div>
      <div><b>${nbRetirees}</b><span>retirées</span></div>
      <div><b>${attente.length}</b><span>à publier</span></div>
    </div>

    ${attente.length ? `
    <div class="section publier">
      <h2>Changements à publier</h2>
      <p class="muted">Ils s'appliquent déjà sur cet appareil. Pour qu'ils s'appliquent à tous les joueurs, copiez la liste et collez-la dans la conversation avec Claude, qui mettra l'appli à jour.</p>
      <ul>${attente.map(([id, retiree]) => `<li>${retiree ? '🚫 Retirer' : '↩️ Rétablir'} : ${esc(questionById[id].q)}</li>`).join('')}</ul>
      <button class="primary" id="copier">📋 Copier la liste pour Claude</button>
      <textarea id="export" readonly hidden></textarea>
    </div>` : ''}

    <div class="section">
      <h2>Questions <small>${liste.length} trouvée${liste.length > 1 ? 's' : ''}</small></h2>
      <div class="filtres">
        <input type="search" id="q" placeholder="Rechercher un mot…" value="${esc(f.texte)}">
        <select id="th"><option value="">Tous les thèmes</option>${THEMES.map(t => `<option value="${t.id}" ${f.theme === t.id ? 'selected' : ''}>${t.emoji} ${esc(t.label)}</option>`).join('')}</select>
        <select id="lv"><option value="0">Tous les niveaux</option>${[1, 2, 3].map(l => `<option value="${l}" ${f.level === l ? 'selected' : ''}>${LEVEL_NAMES[l]}</option>`).join('')}</select>
        <label class="check-line"><input type="checkbox" id="ret" ${f.retirees ? 'checked' : ''}> Seulement les questions retirées</label>
      </div>
      <div class="admin-list">
        ${liste.slice(0, f.limite).map(q => {
          const retiree = estRetiree(q.id);
          return `<details class="admin-item ${retiree ? 'off' : ''}">
            <summary><span class="aq">${esc(q.q)}<small>${themeById[q.theme].emoji} ${LEVEL_NAMES[q.level]} · ✓ ${esc(q.good)}</small></span>
              <button class="mini ${retiree ? 'ok' : 'ko'}" data-toggle="${q.id}">${retiree ? 'Rétablir' : 'Retirer'}</button></summary>
            <div class="ctx"><div class="muted">Autres propositions : ${q.wrong.map(esc).join(' · ')}</div>${esc(q.context)}</div>
          </details>`;
        }).join('')}
      </div>
      ${liste.length > f.limite ? `<button class="secondary" id="plus">Afficher plus (${liste.length - f.limite} restantes)</button>` : ''}
    </div>

    <div class="section">
      <h2>Comptes de cet appareil</h2>
      <div class="historique">
        ${comptes().map(c => `<div class="hist"><span>${c.admin ? '🛠️' : '👤'} ${esc(c.nom)}</span><span class="muted">record ${c.record} · ${c.vues.length} vues</span>
          <span class="row-btns"><button class="mini" data-mdp="${esc(c.id)}">Mot de passe</button>${c.admin ? '' : `<button class="mini ko" data-del="${esc(c.id)}">Supprimer</button>`}</span></div>`).join('')}
      </div>
    </div>
  `;

  const relire = () => { f.limite = 50; renderAdmin(); };
  const champ = view.querySelector('#q');
  let minuteur;
  champ.oninput = () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      f.texte = champ.value;
      relire();
      const nouveau = view.querySelector('#q');
      nouveau.focus();
      nouveau.setSelectionRange(nouveau.value.length, nouveau.value.length);
    }, 300);
  };
  view.querySelector('#th').onchange = e => { f.theme = e.target.value; relire(); };
  view.querySelector('#lv').onchange = e => { f.level = +e.target.value; relire(); };
  view.querySelector('#ret').onchange = e => { f.retirees = e.target.checked; relire(); };
  const plus = view.querySelector('#plus');
  if (plus) plus.onclick = () => { f.limite += 50; renderAdmin(); };

  view.querySelectorAll('[data-toggle]').forEach(b => b.onclick = e => {
    e.preventDefault();
    const id = b.dataset.toggle;
    const c = corrections();
    c[id] = !estRetiree(id);
    if (c[id] === publiees.has(id)) delete c[id]; // retour à l'état publié : plus rien à publier
    store.set('corrections', c);
    const y = window.scrollY;
    renderAdmin();
    window.scrollTo(0, y);
  });

  const copier = view.querySelector('#copier');
  if (copier) copier.onclick = async () => {
    const texteExport = 'Quiz Culture : changements admin à publier\n' +
      attente.map(([id, retiree]) => `${retiree ? 'RETIRER' : 'RETABLIR'} ${id} | ${questionById[id].q}`).join('\n');
    try {
      await navigator.clipboard.writeText(texteExport);
      copier.textContent = '✅ Copié ! Collez-le dans la conversation avec Claude';
    } catch (err) {
      const zone = view.querySelector('#export');
      zone.hidden = false;
      zone.value = texteExport;
      zone.select();
      copier.textContent = 'Sélectionnez le texte ci-dessous et copiez-le';
    }
  };

  view.querySelectorAll('[data-mdp]').forEach(b => b.onclick = () => renderChangerMdp(comptes().find(c => c.id === b.dataset.mdp), () => ouvrirOnglet('admin')));
  view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const c = comptes().find(x => x.id === b.dataset.del);
    if (!confirm(`Supprimer le compte « ${c.nom} » et son historique ?`)) return;
    sauverComptes(comptes().filter(x => x.id !== c.id));
    renderAdmin();
  });
}

// ---------- Démarrage ----------

(async () => {
  await assurerAdmin();
  const session = store.get('session', null);
  const compte = comptes().find(c => c.id === session);
  if (compte) connecter(compte); else renderConnexion();
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
