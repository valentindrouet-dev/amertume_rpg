/*
 * Tutoriels (vue Joueur, deux colonnes) et Encyclopédie (édition MJ/Admin).
 * Données persistées via Store.loadTutorials / Store.saveTutorials.
 */
(function (global) {
  'use strict';
  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) { return (global.Inventory ? Inventory.escapeHtml(s) : String(s == null ? '' : s)); };

  let selectedId = null;

  function list() { return Store.loadTutorials(); }

  // Texte brut → HTML sûr (échappé) avec sauts de ligne conservés.
  function formatBody(txt) {
    return esc(txt || '').replace(/\n/g, '<br>');
  }

  // ---------- Vue Joueur : deux colonnes (liste / contenu) ----------
  function renderPlay() {
    const root = $('#tutorial-root');
    if (!root) return;
    const arr = list();
    if (!arr.length) {
      root.innerHTML = '<p class="empty">Aucun tutoriel disponible pour le moment.</p>';
      return;
    }
    if (!selectedId || !arr.some(function (t) { return t.id === selectedId; })) {
      selectedId = arr[0].id;
    }
    const cur = arr.find(function (t) { return t.id === selectedId; });
    root.innerHTML =
      '<div class="tuto-layout">' +
        '<div class="tuto-list">' +
          arr.map(function (t) {
            return '<div class="tuto-item' + (t.id === selectedId ? ' active' : '') + '" data-id="' + t.id + '">' +
              esc(t.title || '(sans titre)') + '</div>';
          }).join('') +
        '</div>' +
        '<div class="tuto-content">' +
          '<h2 class="tuto-content-title">' + esc(cur.title || '') + '</h2>' +
          '<div class="tuto-content-body">' + formatBody(cur.content) + '</div>' +
        '</div>' +
      '</div>';
    root.querySelectorAll('.tuto-item').forEach(function (el) {
      el.addEventListener('click', function () {
        selectedId = el.getAttribute('data-id');
        renderPlay();
      });
    });
  }

  // ---------- Vue MJ/Admin : ajout, duplication, édition ----------
  function renderAdmin() {
    const root = $('#tutorial-admin-root');
    if (!root) return;
    const arr = list();
    if (!arr.length) {
      root.innerHTML = '<p class="empty">Aucune entrée. Ajoutez-en une avec le bouton ci-dessus.</p>';
      return;
    }
    root.innerHTML = arr.map(function (t, i) {
      return '<div class="tuto-edit-card" data-i="' + i + '">' +
        '<div class="tuto-edit-head">' +
          '<input type="text" class="te-title" value="' + esc(t.title) + '" placeholder="Titre du tutoriel" />' +
          '<button type="button" class="ghost small te-dup" title="Dupliquer">⧉ Dupliquer</button>' +
          '<button type="button" class="icon-btn te-del del-btn" title="Supprimer">✕</button>' +
        '</div>' +
        '<textarea class="te-content" rows="7" placeholder="Texte d\'explication du tutoriel…">' + esc(t.content) + '</textarea>' +
      '</div>';
    }).join('');

    function commit() { Store.saveTutorials(arr); }

    root.querySelectorAll('.tuto-edit-card').forEach(function (card) {
      const i = +card.getAttribute('data-i');
      card.querySelector('.te-title').addEventListener('input', function () { arr[i].title = this.value; commit(); });
      card.querySelector('.te-content').addEventListener('input', function () { arr[i].content = this.value; commit(); });
      card.querySelector('.te-dup').addEventListener('click', function () {
        const copy = JSON.parse(JSON.stringify(arr[i]));
        copy.id = 'tut_' + Store.uid();
        copy.title = incrementTitle(arr[i].title || '');
        arr.splice(i + 1, 0, copy);
        commit(); renderAdmin();
      });
      card.querySelector('.te-del').addEventListener('click', function () {
        if (!confirm('Supprimer cette entrée de l\'encyclopédie ?')) return;
        arr.splice(i, 1); commit(); renderAdmin();
      });
    });
  }

  // « Titre » → « Titre 2 », « Titre 2 » → « Titre 3 »
  function incrementTitle(title) {
    const m = title.match(/^(.*?)(\d+)\s*$/);
    if (m) return m[1] + (parseInt(m[2], 10) + 1);
    return (title ? title + ' ' : '') + '2';
  }

  // Contenu de la page États — toujours regénéré au démarrage pour rester à jour.
  var ETATS_ID = 'tut_etats_systeme';
  var ETATS_CONTENT = [
    'AFFAIBLI : Un combattant AFFAIBLI n\'ajoute pas son bonus de Dégâts à ses attaques.',
    '',
    'AU SOL : Un combattant AU SOL ne peut pas attaquer, se déplacer ni utiliser de talent. Il doit utiliser son mouvement pour se relever dans sa zone.',
    '',
    'BLINDAGE : Un combattant avec BLINDAGE ignore la prochaine source de Dégâts, avant de perdre Blindage.',
    '',
    'BRISÉ : Un combattant BRISÉ possède DEF 0.',
    '',
    'FAILLE : Un combattant avec FAILLE ajoute 1 dé ROSE à toutes ses attaques. Les dés qui doublent avec le dé ROSE ne sont pas comptés lors du calcul des Dégâts.',
    '',
    'FEU : Un combattant avec FEU subit 1 dé noir de Dégâts à la fin de chaque tour (même avant de fuir).',
    '',
    'ONDE : Un combattant avec ONDE perd un État négatif, ou ignore le prochain s\'il n\'en possède pas encore.',
    '',
    'POISON X (cumulable) : Un combattant avec POISON X subit X Dégâts avant d\'effectuer une Attaque, un Talent ou un Mouvement.',
  ].join('\n');

  function ensureStatesTutorial() {
    const arr = list();
    const idx = arr.findIndex(function (t) { return t.id === ETATS_ID; });
    if (idx >= 0) {
      arr[idx].title = 'États de Combat'; arr[idx].content = ETATS_CONTENT;
    } else {
      arr.unshift({ id: ETATS_ID, title: 'États de Combat', content: ETATS_CONTENT });
    }
    Store.saveTutorials(arr);
  }

  function addEntry() {
    const arr = list();
    arr.push({ id: 'tut_' + Store.uid(), title: 'Nouveau tutoriel', content: '' });
    Store.saveTutorials(arr);
    renderAdmin();
  }

  function init() {
    ensureStatesTutorial();
    const addBtn = $('#btn-add-tutorial');
    if (addBtn) addBtn.addEventListener('click', addEntry);
  }

  global.Tutorial = {
    init: init,
    renderPlay: renderPlay,
    renderAdmin: renderAdmin,
  };
})(window);
