/*
 * Signalement de bugs.
 * Un bouton flottant (présent sur toutes les pages / tous les modes) ouvre une
 * fenêtre : l'intitulé du ticket est pré-rempli automatiquement avec la page
 * courante (mode + onglet + aventure + scène), et un champ libre décrit le bug.
 * Les bugs sont stockés localement et consultables dans le Mode MJ / Admin,
 * où l'on peut les copier (pour partage) et supprimer une fois réglés.
 */
(function (global) {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const BUG_KEY = 'amertume_bugs_v1';

  function loadBugs() {
    try {
      const a = JSON.parse(global.localStorage.getItem(BUG_KEY));
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function saveBugs(list) {
    try { global.localStorage.setItem(BUG_KEY, JSON.stringify(list || [])); } catch (e) {}
  }

  function uid() {
    // Identifiant simple sans dépendre de Date.now (indispo dans certains contextes).
    return 'bug_' + Math.abs((loadBugs().length + 1) * 100003 +
      Math.floor(performance.now ? performance.now() : 0)).toString(36) +
      '_' + (loadBugs().length);
  }

  // ---- Capture des erreurs JS (5 dernières) : jointes à chaque rapport ----
  const jsErrors = [];
  function pushErr(msg) {
    jsErrors.push(String(msg).slice(0, 220));
    if (jsErrors.length > 5) jsErrors.shift();
  }
  function captureErrors() {
    global.addEventListener('error', function (ev) {
      pushErr((ev.message || 'Erreur') +
        (ev.filename ? ' (' + String(ev.filename).split('/').pop() + ':' + ev.lineno + ')' : ''));
    });
    global.addEventListener('unhandledrejection', function (ev) {
      const r = ev.reason;
      pushErr('Promesse rejetée : ' + (r && r.message ? r.message : String(r)));
    });
  }

  // Session active pour une aventure (position du joueur : chapitre + scène).
  function activeSessionFor(advId) {
    try {
      const list = Store.loadSessions ? Store.loadSessions() : [];
      return list.find(function (s) { return s.adventureId === advId && s.status === 'active'; }) || null;
    } catch (e) { return null; }
  }
  // Chapitre + scène correspondant à un id de scène dans une aventure.
  function findScene(adv, sceneId) {
    if (!adv || !sceneId) return null;
    for (let i = 0; i < adv.chapters.length; i++) {
      const ch = adv.chapters[i];
      const sc = (ch.scenes || []).find(function (s) { return s.id === sceneId; });
      if (sc) return { chapter: ch, scene: sc };
    }
    return null;
  }
  // Résumé COMPACT d'un bloc de scène (format technique, destiné au diagnostic).
  function blockSummary(b) {
    if (!b || !b.type) return '';
    if (b.type === 'narrative') return 'narr';
    if (b.type === 'test') {
      if (b.writeMode) return 'écrit(' + (b.answers || b.expected || '?') + ')';
      let s = (b.actionMode ? 'action(' : 'test(') + (b.skill || '?') + ' d' + (b.difficulty != null ? b.difficulty : '?');
      if (b.altSkill) s += '/' + b.altSkill + ' d' + (b.altDifficulty != null ? b.altDifficulty : '?');
      if (b.mandatory) s += ',oblig';
      if (b.winEffect && b.winEffect.kind === 'combat') s += ',réussite→cbt';
      if (b.failEffect && b.failEffect.kind === 'combat') s += ',échec→cbt';
      return s + ')';
    }
    if (b.type === 'combat') return 'cbt';
    if (b.type === 'obstruante') return 'obstr';
    return b.type;
  }
  function monsterName(r) {
    let name = r.monName;
    if (!name && r.monsterId && global.Store && Store.state && Array.isArray(Store.state.monsters)) {
      const m = Store.state.monsters.find(function (x) { return x.id === r.monsterId; });
      if (m) name = m.name;
    }
    const q = (window.Store && Store.refCountLabel) ? Store.refCountLabel(r) : (r.count > 1 ? '×' + r.count : '');
    return (name || r.monsterId || '?') + q;
  }
  // Détail compact d'une scène : id court, type, blocs, zones de combat, sorties.
  function sceneSummary(sc) {
    const bits = ['scène:' + String(sc.id || '').slice(0, 8) +
      ' ' + (sc.type || '?') + (sc.isTransition ? '/transition' : '')];
    const blocks = (sc.blocks || []).map(blockSummary).filter(Boolean);
    if (blocks.length) bits.push('blocs:[' + blocks.join(' · ') + ']');
    if (Array.isArray(sc.combatZones) && sc.combatZones.length) {
      const monsters = [];
      sc.combatZones.forEach(function (z) { (z.monsterRefs || []).forEach(function (r) { monsters.push(monsterName(r)); }); });
      bits.push('cbt:' + sc.combatZones.length + 'z[' + monsters.join(', ') + ']');
    }
    if (Array.isArray(sc.choices) && sc.choices.length) bits.push(sc.choices.length + ' sorties');
    return bits.join(' | ');
  }
  // État compact du combat en cours (module de combat actif).
  function combatSummary() {
    try {
      const c = Store.state && Store.state.combat;
      if (!c || !Array.isArray(c.combatants) || !c.combatants.length) return '';
      const foes = {};
      c.combatants.forEach(function (m) {
        if (m.side === 'monster' && m.status === 'active') foes[m.name] = (foes[m.name] || 0) + 1;
      });
      const foesTxt = Object.keys(foes).map(function (n) { return n + (foes[n] > 1 ? '×' + foes[n] : ''); }).join(', ');
      return '⚔ cbt: tour ' + (c.turn || '?') + '/' + (c.phase || '?') +
        ' ' + (c.zones ? c.zones.length : '?') + 'z' + (foesTxt ? ' actifs:[' + foesTxt + ']' : '');
    } catch (e) { return ''; }
  }
  // Fenêtres flottantes (modales) ouvertes : id + titre + contenu clé.
  function modalSummaries() {
    const out = [];
    document.querySelectorAll('.modal:not([hidden])').forEach(function (m) {
      if (m.id === 'bug-modal') return;
      const h = m.querySelector('h2');
      let s = 'fenêtre:' + (m.id || '?') + (h && h.textContent.trim() ? ' « ' + h.textContent.trim() + ' »' : '');
      // Éditeur de talent : nom + effets sélectionnés (avec leur valeur X).
      if (m.id === 'talent-modal') {
        const nm = m.querySelector('#tl-f-name');
        if (nm && nm.value) s += ' — « ' + nm.value + ' »';
        const effs = [];
        m.querySelectorAll('.tl-eff-row').forEach(function (row) {
          const key = (row.querySelector('.tl-eff-effect') || {}).value;
          if (!key) return;
          const valEl = row.querySelector('.tl-eff-val-wrap');
          const val = (valEl && !valEl.hidden) ? (row.querySelector('.tl-eff-val') || {}).value : '';
          effs.push(key + (val ? '(' + val + ')' : ''));
        });
        if (effs.length) s += ' eff:[' + effs.join(', ') + ']';
      }
      out.push(s);
    });
    return out;
  }

  // Contexte complet : { title (intitulé court), details (lignes de diagnostic) }.
  function currentContext() {
    const parts = [];
    const details = [];
    const mode = (global.Shell && Shell.getMode) ? Shell.getMode() : 'admin';
    const modeLbl = mode === 'player' ? 'Joueur' : (mode === 'home' ? 'Accueil' : 'MJ / Admin');
    parts.push(modeLbl);

    // Onglet actif visible
    const activeTab = document.querySelector('.tab.active:not([hidden])');
    if (activeTab && mode !== 'home') parts.push(activeTab.textContent.trim());

    // Ligne d'ancrage : version + mode + onglet (compact).
    const verEl = document.querySelector('.brand-version');
    details.push((verEl && verEl.textContent ? verEl.textContent.trim() : '?') +
      ' · ' + mode + (activeTab ? ' · ' + activeTab.textContent.trim() : ''));

    // Fenêtres flottantes ouvertes (modales) : dans l'intitulé ET le détail.
    const modals = modalSummaries();
    if (modals.length) {
      const firstTitle = (document.querySelector('.modal:not([hidden]):not(#bug-modal) h2') || {}).textContent;
      if (firstTitle && firstTitle.trim()) parts.push('Fenêtre : ' + firstTitle.trim());
      modals.forEach(function (s) { details.push(s); });
    }

    // Aventure + position exacte (session active : chapitre, scène, contenu)
    if (mode === 'player' && global.Shell && Shell.getAdventureId && global.Store) {
      try {
        const advId = Shell.getAdventureId();
        const adv = Store.loadAdventures().find(function (a) { return a.id === advId; });
        if (adv) {
          parts.push(adv.title);
          const ses = activeSessionFor(advId);
          const pos = ses ? findScene(adv, ses.currentSceneId) : null;
          if (pos) {
            parts.push(pos.chapter.title || 'Chapitre');
            parts.push('« ' + (pos.scene.title || 'Scène') + ' »');
            details.push(sceneSummary(pos.scene) +
              (pos.chapter.mode ? ' | chap:' + pos.chapter.mode : '') +
              (ses && ses.forcedCombat ? ' | combat-forcé-en-attente' : ''));
          } else {
            // Repli : titre affiché par le lecteur
            const sesTitle = document.querySelector('#tab-session.active #session-root .ses-scene-title, #tab-session.active #session-root h2');
            if (sesTitle && sesTitle.textContent.trim()) parts.push('« ' + sesTitle.textContent.trim() + ' »');
          }
        }
      } catch (e) {}
      const cs = combatSummary();
      if (cs) details.push(cs);
    }

    if (mode === 'admin') {
      const cs = combatSummary();
      if (cs) details.push(cs + ' (Combat Test)');
    }

    if (jsErrors.length) details.push('⚠ JS: ' + jsErrors.join(' ; '));

    return { title: parts.join(' › '), details: details.join('\n') };
  }

  // ---------- Modale de signalement ----------
  function ensureDom() {
    if ($('#bug-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'bug-fab';
    fab.type = 'button';
    fab.title = 'Signaler un bug sur cette page';
    fab.setAttribute('aria-label', 'Signaler un bug');
    fab.innerHTML = '🐞';
    document.body.appendChild(fab);

    const modal = document.createElement('div');
    modal.id = 'bug-modal';
    modal.className = 'modal';
    modal.hidden = true;
    modal.innerHTML =
      '<div class="modal-box bug-box">' +
        '<div class="modal-head">' +
          '<h2>🐞 Signaler un bug</h2>' +
          '<button type="button" id="bug-close" class="modal-close" title="Fermer">✕</button>' +
        '</div>' +
        '<div class="modal-body">' +
          '<label class="bug-label">Page concernée (automatique)' +
            '<input type="text" id="bug-context" readonly />' +
          '</label>' +
          '<label class="bug-label">Description du bug' +
            '<textarea id="bug-desc" rows="5" placeholder="Décris ce qui ne va pas…"></textarea>' +
          '</label>' +
          '<details class="bug-tech"><summary>🔬 Données techniques jointes automatiquement</summary>' +
            '<pre id="bug-details"></pre></details>' +
          '<div class="modal-actions">' +
            '<button type="button" id="bug-cancel" class="ghost">Annuler</button>' +
            '<button type="button" id="bug-send" class="primary">Envoyer</button>' +
          '</div>' +
          '<p id="bug-flash" class="bug-flash" hidden>✓ Bug enregistré</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    fab.addEventListener('click', openModal);
    $('#bug-close').addEventListener('click', closeModal);
    $('#bug-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    $('#bug-send').addEventListener('click', submitBug);
  }

  let pendingDetails = '';
  function openModal() {
    ensureDom();
    const ctx = currentContext();
    pendingDetails = ctx.details || '';
    $('#bug-context').value = ctx.title;
    $('#bug-details').textContent = pendingDetails || '(aucune donnée particulière sur cette page)';
    $('#bug-desc').value = '';
    $('#bug-flash').hidden = true;
    $('#bug-modal').hidden = false;
    $('#bug-desc').focus();
  }
  function closeModal() {
    const m = $('#bug-modal');
    if (m) m.hidden = true;
  }

  function submitBug() {
    const desc = ($('#bug-desc').value || '').trim();
    if (!desc) { $('#bug-desc').focus(); return; }
    const context = $('#bug-context').value || currentContext().title;
    const list = loadBugs();
    list.push({
      id: uid(),
      context: context,
      desc: desc,
      details: pendingDetails || '',
      date: (function () { try { return new Date().toLocaleString('fr-FR'); } catch (e) { return ''; } })(),
    });
    saveBugs(list);
    const flash = $('#bug-flash');
    if (flash) flash.hidden = false;
    setTimeout(closeModal, 700);
    // Rafraîchit la liste admin si elle est ouverte
    if ($('#tab-bugs') && $('#tab-bugs').classList.contains('active')) renderAdmin();
  }

  // ---------- Page MJ / Admin : liste des bugs ----------
  function bugLineText(b) {
    let s = '• [' + (b.context || 'Page inconnue') + ']' +
      (b.date ? ' (' + b.date + ')' : '') + ' : ' + (b.desc || '');
    if (b.details) {
      s += '\n' + b.details.split('\n').map(function (l) { return '   ─ ' + l; }).join('\n');
    }
    return s;
  }

  function renderAdmin() {
    const root = $('#bugs-root');
    if (!root) return;
    const list = loadBugs();
    if (!list.length) {
      root.innerHTML =
        '<div class="card">' +
          '<div class="card-head"><h2>🐞 Bugs signalés</h2></div>' +
          '<p class="empty">Aucun bug signalé pour le moment. Utilise le bouton 🐞 en bas à droite ' +
          'sur n\'importe quelle page pour en créer un.</p>' +
        '</div>';
      return;
    }
    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<h2>🐞 Bugs signalés (' + list.length + ')</h2>' +
          '<div style="display:flex; gap:.4rem; flex-wrap:wrap;">' +
            '<button type="button" id="bug-mail-all" class="primary small">✉ Envoyer par e-mail</button>' +
            '<button type="button" id="bug-copy-all" class="ghost small">⧉ Tout copier</button>' +
            '<button type="button" id="bug-clear-all" class="ghost small">🗑 Tout supprimer</button>' +
          '</div>' +
        '</div>' +
        '<ul class="bug-list">' +
          list.map(function (b) {
            return '<li class="bug-item" data-id="' + esc(b.id) + '">' +
              '<div class="bug-item-main">' +
                '<span class="bug-item-context">' + esc(b.context || 'Page inconnue') +
                  (b.date ? ' <span class="bug-item-date">· ' + esc(b.date) + '</span>' : '') +
                '</span>' +
                '<span class="bug-item-desc">' + esc(b.desc || '') + '</span>' +
                (b.details ? '<details class="bug-tech"><summary>🔬 Données techniques</summary><pre>' + esc(b.details) + '</pre></details>' : '') +
              '</div>' +
              '<div class="bug-item-tools">' +
                '<button type="button" class="ghost small bug-copy-one" title="Copier ce bug">⧉</button>' +
                '<button type="button" class="ghost small danger bug-del-one" title="Supprimer (réglé)">🗑</button>' +
              '</div>' +
            '</li>';
          }).join('') +
        '</ul>' +
      '</div>';

    function copyText(text, btn, okLabel) {
      const done = function () { if (btn) { const o = btn.textContent; btn.textContent = okLabel || '✓'; setTimeout(function () { btn.textContent = o; }, 1200); } };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    }
    function fallbackCopy(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      } catch (e) {}
    }

    // Envoi par e-mail (mailto) : ouvre l'application mail du joueur avec le
    // rapport complet pré-rempli — aucun service externe requis. Les liens
    // mailto sont limités en taille : on tronque au besoin en l'indiquant.
    const MAIL_TO = 'valentin.drouet@gmail.com';
    const mailAll = $('#bug-mail-all');
    if (mailAll) mailAll.addEventListener('click', function () {
      const bugs = loadBugs();
      const subject = 'Amertüme — Rapport de bugs (' + bugs.length + ')';
      let body = bugs.map(bugLineText).join('\n\n');
      const maxBody = 1700; // marge sous la limite pratique des liens mailto (~2000)
      if (body.length > maxBody) {
        body = body.slice(0, maxBody) +
          '\n\n… (rapport tronqué : utilisez « ⧉ Tout copier » puis collez dans le mail)';
      }
      global.location.href = 'mailto:' + MAIL_TO +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
    });
    const copyAll = $('#bug-copy-all');
    if (copyAll) copyAll.addEventListener('click', function () {
      copyText(loadBugs().map(bugLineText).join('\n'), copyAll, '✓ Copié');
    });
    const clearAll = $('#bug-clear-all');
    if (clearAll) clearAll.addEventListener('click', function () {
      if (confirm('Supprimer TOUS les bugs signalés ?')) { saveBugs([]); renderAdmin(); }
    });
    root.querySelectorAll('.bug-copy-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const li = btn.closest('.bug-item');
        const b = loadBugs().find(function (x) { return x.id === li.getAttribute('data-id'); });
        if (b) copyText(bugLineText(b), btn, '✓');
      });
    });
    root.querySelectorAll('.bug-del-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const li = btn.closest('.bug-item');
        const id = li.getAttribute('data-id');
        saveBugs(loadBugs().filter(function (x) { return x.id !== id; }));
        renderAdmin();
      });
    });
  }

  function init() {
    captureErrors();
    ensureDom();
  }

  global.Bugs = {
    init: init,
    renderAdmin: renderAdmin,
    open: openModal,
    load: loadBugs,
  };
})(window);
