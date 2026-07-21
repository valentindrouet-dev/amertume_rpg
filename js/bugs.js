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

  // Libellé automatique de la page courante (sert d'intitulé du ticket).
  function currentContext() {
    const parts = [];
    const mode = (global.Shell && Shell.getMode) ? Shell.getMode() : 'admin';
    const modeLbl = mode === 'player' ? 'Joueur' : (mode === 'home' ? 'Accueil' : 'MJ / Admin');
    parts.push(modeLbl);

    // Onglet actif visible
    const activeTab = document.querySelector('.tab.active:not([hidden])');
    if (activeTab && mode !== 'home') parts.push(activeTab.textContent.trim());

    // Aventure en cours (mode Joueur)
    if (mode === 'player' && global.Shell && Shell.getAdventureId && global.Store) {
      try {
        const advId = Shell.getAdventureId();
        const adv = Store.loadAdventures().find(function (a) { return a.id === advId; });
        if (adv) parts.push(adv.title);
      } catch (e) {}
    }

    // Scène courante si le lecteur de session l'expose (mode Joueur uniquement)
    if (mode === 'player') {
      const sesTitle = document.querySelector('#tab-session.active #session-root .ses-scene-title, #tab-session.active #session-root h2');
      if (sesTitle && sesTitle.textContent.trim()) parts.push('« ' + sesTitle.textContent.trim() + ' »');
    }

    // Modale de scène ouverte (éditeur MJ)
    if (mode === 'admin') {
      const smTitle = document.querySelector('#scene-modal:not([hidden]) .modal-title, #scene-modal:not([hidden]) h2');
      if (smTitle && smTitle.textContent.trim()) parts.push('Éditeur : ' + smTitle.textContent.trim());
    }

    return parts.join(' › ');
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

  function openModal() {
    ensureDom();
    $('#bug-context').value = currentContext();
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
    const context = $('#bug-context').value || currentContext();
    const list = loadBugs();
    list.push({
      id: uid(),
      context: context,
      desc: desc,
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
    return '• [' + (b.context || 'Page inconnue') + ']' +
      (b.date ? ' (' + b.date + ')' : '') + ' : ' + (b.desc || '');
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
          '<div style="display:flex; gap:.4rem;">' +
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
    ensureDom();
  }

  global.Bugs = {
    init: init,
    renderAdmin: renderAdmin,
    open: openModal,
    load: loadBugs,
  };
})(window);
