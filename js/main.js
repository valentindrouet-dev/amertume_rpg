/*
 * Initialisation, navigation par onglets, export/import de la sauvegarde.
 */
(function () {
  'use strict';
  const $ = function (sel) { return document.querySelector(sel); };

  // Version applicative — incrémentée de +0.01 à chaque nouvelle implémentation.
  const APP_VERSION = 'v2.23';
  const esc = function (s) { return (window.Inventory ? Inventory.escapeHtml(s) : String(s)); };

  // Exécute fn en isolant ses erreurs (un module cassé ne doit pas bloquer le reste)
  function safe(label, fn) {
    try { fn(); } catch (e) { console.error('[' + label + ']', e); }
  }

  // Rendu d'un onglet, sensible au mode courant (Joueur vs MJ/Admin)
  function renderForTab(target) {
    const mode = (window.Shell && Shell.getMode) ? Shell.getMode() : 'admin';
    const advId = (window.Shell && Shell.getAdventureId) ? Shell.getAdventureId() : null;
    if (target === 'combat') safe('combat', Combat.renderTest);
    if (target === 'heroes') safe('heroes', Combatants.renderHeroes);
    if (target === 'bestiary') safe('bestiary', Combatants.renderMonsters);
    if (target === 'classes') safe('classes', Classes.render);
    if (target === 'armory') {
      if (mode === 'player') safe('armory.player', function () { Inventory.renderPlayer(advId); });
      else safe('armory', Inventory.render);
    }
    if (target === 'adventures') safe('adventures', Adventure.render);
    if (target === 'session') {
      if (mode === 'player') safe('session.play', function () { Session.renderPlay(advId); });
      else safe('session', Session.render);
    }
    if (target === 'saves') safe('saves', function () { Session.renderSaves(advId); });
  }

  // Active un onglet (visible) et son panneau, puis déclenche son rendu
  function selectTab(target) {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === target && !b.hidden);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-' + target);
    });
    renderForTab(target);
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () { selectTab(btn.getAttribute('data-tab')); });
    });
  }

  // Exposé pour la coquille de navigation (Shell)
  window.App = { selectTab: selectTab, renderForTab: renderForTab };

  // ---------- Partage (publication / chargement d'un lien) ----------
  function doShare() {
    const body = $('#share-body');
    $('#share-modal').hidden = false;
    body.innerHTML = '<p class="hint">Publication en cours…</p>';
    Share.publish(function (err, id, bundle) {
      if (err) {
        body.innerHTML = '<p class="empty">Échec du partage : ' + esc(err.message) + '</p>' +
          '<p class="hint">Vérifie les règles Firestore (lecture + écriture sur la collection <code>amertume_snapshots</code>).</p>';
        return;
      }
      const link = Share.shareLink(id);
      body.innerHTML =
        '<p>✅ Contenu publié et accessible aux joueurs.</p>' +
        '<label>Lien à partager<input type="text" id="share-link" readonly value="' + esc(link) + '" /></label>' +
        '<div class="share-stats">Aventures : ' + bundle.adventures.length +
          ' · Monstres : ' + bundle.monsters.length +
          ' · Objets : ' + bundle.items.length +
          ' · Pré-construits : ' + bundle.prebuilts.length + '</div>' +
        '<div class="modal-actions"><button type="button" id="share-copy" class="primary">Copier le lien</button></div>';
      const input = document.getElementById('share-link');
      input.focus(); input.select();
      document.getElementById('share-copy').addEventListener('click', function () {
        const self = this;
        function done() { self.textContent = 'Lien copié ✓'; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(done).catch(function () { input.select(); done(); });
        } else { input.select(); try { document.execCommand('copy'); } catch (e) {} done(); }
      });
    });
  }

  function setupShare() {
    const b = $('#btn-share');
    if (b) b.addEventListener('click', doShare);
    const c = $('#share-close');
    if (c) c.addEventListener('click', function () { $('#share-modal').hidden = true; });
    const m = $('#share-modal');
    if (m) m.addEventListener('click', function (e) { if (e.target.id === 'share-modal') m.hidden = true; });
  }

  // Si l'URL contient #pub=<id>, charge le contenu partagé en mode lecture seule
  function loadSharedIfAny() {
    const id = Share.parsePubId();
    if (!id) return;
    const box = $('#home-adv-list');
    if (box) box.innerHTML = '<p class="empty">Chargement de l\'aventure partagée…</p>';
    Share.load(id, function (err, bundle) {
      if (err) {
        if (box) box.innerHTML = '<p class="empty">Impossible de charger : ' + esc(err.message) + '</p>';
        return;
      }
      Share.applyBundle(bundle);
      Shell.setPublishedMode(true);
      Shell.goHome();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.brand-version').forEach(function (el) { el.textContent = APP_VERSION; });
    safe('tabs', setupTabs);
    safe('inventory.init', Inventory.init);
    safe('combatants.init', Combatants.init);
    safe('combat.init', Combat.init);
    safe('classes.init', Classes.init);
    safe('adventure.init', Adventure.init);
    safe('session.init', Session.init);
    safe('share.init', Share.init);
    safe('dataio.init', DataIO.init);
    safe('shell.init', Shell.init);
    safe('share.wire', setupShare);
    safe('share.load', loadSharedIfAny);
  });
})();
