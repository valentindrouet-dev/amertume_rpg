/*
 * Initialisation, navigation par onglets, export/import de la sauvegarde.
 */
(function () {
  'use strict';
  const $ = function (sel) { return document.querySelector(sel); };

  // Exécute fn en isolant ses erreurs (un module cassé ne doit pas bloquer le reste)
  function safe(label, fn) {
    try { fn(); } catch (e) { console.error('[' + label + ']', e); }
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
        document.querySelectorAll('.tab-panel').forEach(function (p) {
          p.classList.toggle('active', p.id === 'tab-' + target);
        });
        if (target === 'combat') safe('combat', Combat.render);
        if (target === 'heroes') safe('heroes', Combatants.renderHeroes);
        if (target === 'bestiary') safe('bestiary', Combatants.renderMonsters);
        if (target === 'armory') safe('armory', Inventory.render);
      });
    });
  }

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
    safe('tabs', setupTabs);
    safe('backup', setupBackup);
    safe('inventory.init', Inventory.init);
    safe('combatants.init', Combatants.init);
    safe('combat.init', Combat.init);
  });
})();
