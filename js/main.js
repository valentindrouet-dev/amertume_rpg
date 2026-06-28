/*
 * Initialisation, navigation par onglets, export/import de la sauvegarde.
 */
(function () {
  'use strict';
  const $ = function (sel) { return document.querySelector(sel); };

  // Version applicative — incrémentée de +0.01 à chaque nouvelle implémentation.
  const APP_VERSION = 'v2.2.38';
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
    if (target === 'talentadv') safe('talentadv', Combatants.renderTalentsAdv);
    if (target === 'classes') safe('classes', Classes.render);
    if (target === 'tutorial') safe('tutorial.play', Tutorial.renderPlay);
    if (target === 'tutorial-admin') safe('tutorial.admin', Tutorial.renderAdmin);
    if (target === 'armory') {
      if (mode === 'player') safe('armory.player', function () { Inventory.renderPlayer(advId); });
      else safe('armory', Inventory.render);
    }
    if (target === 'talents') safe('talents.play', function () { Session.renderTalents(advId); });
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
  // Formate un horodatage en « 23 juin 2026 à 14:05 »
  function fmtPubDate(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return new Date(ts).toLocaleString(); }
  }

  // Branche le bouton « Copier le lien » sur l'input du lien
  function wireCopyLink(link) {
    const input = document.getElementById('share-link');
    const btn = document.getElementById('share-copy');
    if (!input || !btn) return;
    input.focus(); input.select();
    btn.addEventListener('click', function () {
      const self = this;
      function done() { self.textContent = 'Lien copié ✓'; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done).catch(function () { input.select(); done(); });
      } else { input.select(); try { document.execCommand('copy'); } catch (e) {} done(); }
    });
  }

  // Lance la publication (création ou mise à jour) et affiche le résultat
  function runPublish() {
    const body = $('#share-body');
    body.innerHTML = '<p class="hint">Publication en cours…</p>';
    Share.publish(function (err, id, bundle) {
      if (err) {
        body.innerHTML = '<p class="empty">Échec du partage : ' + esc(err.message) + '</p>' +
          '<p class="hint">Vérifie les règles Firestore (lecture + écriture sur la collection <code>amertume_snapshots</code>).</p>' +
          '<div class="modal-actions"><button type="button" id="share-retry" class="ghost">Réessayer</button></div>';
        const r = document.getElementById('share-retry');
        if (r) r.addEventListener('click', runPublish);
        return;
      }
      const link = Share.shareLink(id);
      body.innerHTML =
        '<p>✅ Version en ligne mise à jour le <strong>' + esc(fmtPubDate(bundle.publishedAt)) + '</strong>.</p>' +
        '<label>Lien à partager<input type="text" id="share-link" readonly value="' + esc(link) + '" /></label>' +
        '<div class="share-stats">Aventures : ' + bundle.adventures.length +
          ' · Monstres : ' + bundle.monsters.length +
          ' · Objets : ' + bundle.items.length +
          ' · Pré-construits : ' + bundle.prebuilts.length + '</div>' +
        '<div class="modal-actions"><button type="button" id="share-copy" class="primary">Copier le lien</button></div>';
      wireCopyLink(link);
    });
  }

  // Affiche l'état courant du partage à l'ouverture (sans republier)
  function doShare() {
    const body = $('#share-body');
    $('#share-modal').hidden = false;
    if (!Share.isReady()) {
      body.innerHTML = '<p class="empty">Partage indisponible : connexion à Firebase impossible.</p>' +
        '<p class="hint">Vérifie ta connexion réseau et que Firestore est activé.</p>';
      return;
    }
    const last = Share.lastPublished();
    if (last) {
      const link = Share.shareLink(last.id);
      body.innerHTML =
        '<p>Une version est déjà en ligne' +
          (last.at ? ', publiée le <strong>' + esc(fmtPubDate(last.at)) + '</strong>' : '') + '.</p>' +
        '<p class="hint">Les modifications faites depuis ne sont visibles qu\'après une nouvelle publication. ' +
          'Le lien reste le même.</p>' +
        '<label>Lien à partager<input type="text" id="share-link" readonly value="' + esc(link) + '" /></label>' +
        '<div class="modal-actions">' +
          '<button type="button" id="share-copy" class="ghost">Copier le lien</button>' +
          '<button type="button" id="share-publish" class="primary">↻ Republier (mettre à jour)</button>' +
        '</div>';
      wireCopyLink(link);
    } else {
      body.innerHTML =
        '<p>Publie ton contenu MJ (aventures, bestiaire, armurerie, pré-construits, classes) pour le rendre accessible aux joueurs via un lien.</p>' +
        '<div class="modal-actions"><button type="button" id="share-publish" class="primary">⤴ Publier</button></div>';
    }
    const pub = document.getElementById('share-publish');
    if (pub) pub.addEventListener('click', runPublish);
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
    safe('tutorial.init', Tutorial.init);
    safe('adventure.init', Adventure.init);
    safe('session.init', Session.init);
    safe('share.init', Share.init);
    safe('dataio.init', DataIO.init);
    safe('shell.init', Shell.init);
    safe('share.wire', setupShare);
    safe('share.load', loadSharedIfAny);
  });
})();
