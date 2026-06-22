/*
 * Initialisation, navigation par onglets, export/import de la sauvegarde.
 */
(function () {
  'use strict';
  const $ = function (sel) { return document.querySelector(sel); };

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
        document.querySelectorAll('.tab-panel').forEach(function (p) {
          p.classList.toggle('active', p.id === 'tab-' + target);
        });
        if (target === 'roller') Roller.refresh();
        if (target === 'combat') Combat.render();
        if (target === 'heroes') Combatants.renderHeroes();
        if (target === 'bestiary') Combatants.renderMonsters();
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
          Roller.refresh();
          Roller.renderHistory();
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
    setupTabs();
    setupBackup();
    Inventory.init();
    Roller.init();
    Combatants.init();
    Combat.init();
  });
})();
