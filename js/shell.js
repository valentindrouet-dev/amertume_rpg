/*
 * Coquille de navigation Amertume.
 * Gère trois modes : accueil (choix d'aventure), Joueur (limité à une aventure)
 * et MJ/Admin (interface complète). N'altère ni le moteur de combat ni les données.
 */
(function (global) {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  let mode = 'home';            // 'home' | 'player' | 'admin'
  let adventureId = null;       // aventure sélectionnée en mode Joueur
  let publishedMode = false;    // ouvert via un lien partagé (#pub=…) : pas d'accès MJ

  // Quand on arrive via un lien partagé, on masque l'accès au mode MJ/Admin.
  function setPublishedMode(v) {
    publishedMode = !!v;
    const a = $('#home-admin-btn');
    if (a) a.hidden = publishedMode;
    const sub = document.querySelector('.home-sub');
    if (sub && publishedMode) sub.textContent = 'Aventures partagées par votre MJ';
  }

  // ---------- Accueil ----------
  // Carte HTML d'une aventure sur l'accueil (verrouillée ou jouable).
  function advCardHtml(a, unlocked) {
    const chCount = a.chapters.length;
    const scCount = a.chapters.reduce(function (n, ch) { return n + ch.scenes.length; }, 0);
    const locked = a.password && unlocked.indexOf(a.id) === -1;
    const badges = [];
    if (a.duration) badges.push('<span class="home-adv-badge">⏱ ' + esc(a.duration) + '</span>');
    if (a.difficulty) badges.push('<span class="home-adv-badge">📊 ' + esc(a.difficulty) + '</span>');
    if (locked) {
      return '<div class="home-adv-card locked">' +
        '<div class="home-adv-info">' +
          '<div class="home-adv-toprow">' +
            '<span class="home-adv-title">🔒 ' + esc(a.title) + '</span>' +
            '<span class="home-adv-meta">' + chCount + ' ch. · ' + scCount + ' scène(s)</span>' +
            (badges.length ? '<span class="home-adv-badges">' + badges.join('') + '</span>' : '') +
          '</div>' +
          (a.summary ? '<div class="home-adv-scroll"><span class="home-adv-summary">' + esc(a.summary) + '</span></div>' : '') +
        '</div>' +
        '<button class="ghost home-locked" data-id="' + a.id + '">🔒 Verrouillé</button>' +
      '</div>';
    }
    return '<div class="home-adv-card home-play" data-id="' + a.id + '">' +
      '<div class="home-adv-info">' +
        '<div class="home-adv-toprow">' +
          '<span class="home-adv-title">' + esc(a.title) + '</span>' +
          '<span class="home-adv-meta">' + chCount + ' ch. · ' + scCount + ' scène(s)</span>' +
          (badges.length ? '<span class="home-adv-badges">' + badges.join('') + '</span>' : '') +
          '<button class="primary home-play-btn" data-id="' + a.id + '">▶ Jouer</button>' +
        '</div>' +
        (a.summary ? '<div class="home-adv-scroll"><span class="home-adv-summary">' + esc(a.summary) + '</span></div>' : '') +
      '</div>' +
    '</div>';
  }

  function renderHome() {
    const box = $('#home-adv-list');
    if (!box) return;
    const layout = Store.homeLayout();
    if (!layout.adventures.length) {
      box.innerHTML = '<p class="empty">Aucune aventure disponible pour le moment. ' +
        'Crée-en une depuis le Mode MJ / Admin.</p>';
      return;
    }
    const advs = layout.adventures;
    const unlocked = Store.loadUnlocked();
    box.innerHTML = layout.entries.map(function (e) {
      if (e.type === 'adv') {
        const a = layout.advById[e.id];
        return a ? advCardHtml(a, unlocked) : '';
      }
      // Grande Aventure : menu déroulant regroupant ses chapitres.
      const saga = layout.sagaById[e.id];
      if (!saga) return '';
      const chapters = (saga.adventureIds || []).map(function (id) { return layout.advById[id]; }).filter(Boolean);
      if (!chapters.length) return '';
      const totalSc = chapters.reduce(function (n, a) {
        return n + a.chapters.reduce(function (m, ch) { return m + ch.scenes.length; }, 0);
      }, 0);
      return '<details class="home-saga">' +
        '<summary class="home-saga-head">' +
          '<span class="home-saga-caret">▸</span>' +
          '<span class="home-saga-title">📚 ' + esc(saga.title || 'Grande Aventure') + '</span>' +
          '<span class="home-saga-meta">' + chapters.length + ' chapitre' + (chapters.length > 1 ? 's' : '') +
            ' · ' + totalSc + ' scène(s)</span>' +
        '</summary>' +
        '<div class="home-saga-body">' +
          chapters.map(function (a) { return advCardHtml(a, unlocked); }).join('') +
        '</div>' +
      '</details>';
    }).join('');
    box.querySelectorAll('.home-play').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.classList.contains('home-locked')) return;
        enterPlayer(card.getAttribute('data-id'));
      });
    });
    box.querySelectorAll('.home-locked').forEach(function (b) {
      b.addEventListener('click', function () {
        const a = advs.find(function (x) { return x.id === b.getAttribute('data-id'); });
        if (!a) return;
        const pw = prompt('Vous devez terminer le chapitre précédent pour obtenir le Mot de Passe du Chapitre.\n\nEntrez le mot de passe :');
        if (pw === null) return;
        if (pw === a.password) {
          const u = Store.loadUnlocked(); u.push(a.id); Store.saveUnlocked(u);
          renderHome();
        } else {
          alert('Mot de passe incorrect.');
        }
      });
    });
  }

  // ---------- Application du mode (visibilité onglets / chrome) ----------
  function applyMode() {
    document.body.classList.toggle('mode-home', mode === 'home');
    document.body.classList.toggle('mode-player', mode === 'player');
    document.body.classList.toggle('mode-admin', mode === 'admin');

    // Onglets visibles selon le mode
    document.querySelectorAll('.tab').forEach(function (btn) {
      const modes = (btn.getAttribute('data-modes') || '').split(/\s+/);
      btn.hidden = modes.indexOf(mode) === -1;
    });

    // Outils d'administration (export/import) masqués hors admin
    document.querySelectorAll('.admin-only').forEach(function (el) {
      el.hidden = mode !== 'admin';
    });

    // Bandeau de contexte + titre de l'inventaire
    const ctx = $('#mode-context');
    const armoryTitle = $('#armory-title');
    if (mode === 'player') {
      const adv = Store.loadAdventures().find(function (a) { return a.id === adventureId; });
      if (ctx) { ctx.textContent = adv ? adv.title : 'Aventure'; ctx.className = 'mode-context ctx-player'; }
      if (armoryTitle) armoryTitle.textContent = 'Inventaire';
    } else if (mode === 'admin') {
      if (ctx) { ctx.textContent = 'Mode MJ / Admin'; ctx.className = 'mode-context ctx-admin'; }
      if (armoryTitle) armoryTitle.textContent = 'Armurerie';
    } else if (ctx) {
      ctx.textContent = '';
    }
  }

  // ---------- Transitions de mode ----------
  function goHome() {
    mode = 'home';
    adventureId = null;
    applyMode();
    renderHome();
  }

  function enterAdmin() {
    mode = 'admin';
    adventureId = null;
    applyMode();
    if (global.App) App.selectTab('adventures');
  }

  function enterPlayer(advId) {
    const adv = Store.loadAdventures().find(function (a) { return a.id === advId; });
    if (!adv) { alert('Aventure introuvable.'); return; }
    mode = 'player';
    adventureId = advId;
    applyMode();
    // Onglet « Aventure » (lecture de scènes) par défaut.
    // App.selectTab déclenche Session.renderPlay via le rendu sensible au mode.
    if (global.App) App.selectTab('session');
  }

  // Affiche l'onglet « Aventure » du mode Joueur (utilisé par la gestion de session)
  function showPlayTab() {
    if (mode !== 'player') return;
    if (global.App) App.selectTab('session');
  }

  function init() {
    const adminBtn = $('#home-admin-btn');
    if (adminBtn) adminBtn.addEventListener('click', enterAdmin);
    const homeBtn = $('#btn-home');
    if (homeBtn) homeBtn.addEventListener('click', goHome);
    goHome();
  }

  global.Shell = {
    init: init,
    setPublishedMode: setPublishedMode,
    goHome: goHome,
    enterAdmin: enterAdmin,
    enterPlayer: enterPlayer,
    showPlayTab: showPlayTab,
    renderHome: renderHome,
    getMode: function () { return mode; },
    getAdventureId: function () { return adventureId; },
  };
})(window);
