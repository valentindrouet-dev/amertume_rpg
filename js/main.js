/*
 * Initialisation, navigation par onglets, export/import de la sauvegarde.
 */
(function () {
  'use strict';
  const $ = function (sel) { return document.querySelector(sel); };

  // Version applicative — incrémentée de +0.01 à chaque nouvelle implémentation.
  const APP_VERSION = 'v2.02';

  // Exécute fn en isolant ses erreurs (un module cassé ne doit pas bloquer le reste)
  function safe(label, fn) {
    try { fn(); } catch (e) { console.error('[' + label + ']', e); }
  }

  // Rendu d'un onglet, sensible au mode courant (Joueur vs MJ/Admin)
  function renderForTab(target) {
    const mode = (window.Shell && Shell.getMode) ? Shell.getMode() : 'admin';
    const advId = (window.Shell && Shell.getAdventureId) ? Shell.getAdventureId() : null;
    if (target === 'combat') safe('combat', Combat.render);
    if (target === 'heroes') safe('heroes', Combatants.renderHeroes);
    if (target === 'bestiary') safe('bestiary', Combatants.renderMonsters);
    if (target === 'armory') safe('armory', Inventory.render);
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

  function setupBackup() {
    $('#btn-export').addEventListener('click', function () {
      const blob = new Blob([JSON.stringify(Store.state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'amertume-sauvegarde.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    $('#btn-import').addEventListener('click', function () { $('#file-import').click(); });
    $('#file-import').addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(reader.result);
          if (!data.items) throw new Error('Fichier invalide');
          Store.replace(data);
          Inventory.render();
          Combatants.renderHeroes();
          Combatants.renderMonsters();
          Combat.render();
          alert('Sauvegarde importée.');
        } catch (err) {
          alert('Import impossible : ' + err.message);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.brand-version').forEach(function (el) { el.textContent = APP_VERSION; });
    safe('tabs', setupTabs);
    safe('backup', setupBackup);
    safe('inventory.init', Inventory.init);
    safe('combatants.init', Combatants.init);
    safe('combat.init', Combat.init);
    safe('adventure.init', Adventure.init);
    safe('session.init', Session.init);
    safe('shell.init', Shell.init);
  });
})();
