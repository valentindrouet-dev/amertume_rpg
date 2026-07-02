/*
 * Éditeur d'aventures Amertume.
 * L'auteur (utilisateur) crée les chapitres, scènes et choix via l'UI.
 * Ce module ne génère aucun contenu narratif.
 */
(function (global) {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  const SCENE_TYPES = [
    { value: 'description',  label: 'Description'  },
    { value: 'exploration',  label: 'Exploration'  },
    { value: 'interaction',  label: 'Interaction'  },
    { value: 'combat',       label: 'Combat'       },
    { value: 'reward',       label: 'Récompense'   },
    { value: 'fin',          label: 'Fin'          },
  ];

  // ---------- Données ----------
  let adventures = [];
  let sagas = [];        // Grandes Aventures : { id, title, adventureIds:[] }
  let homeOrder = [];    // ordre d'accueil : [{ type:'saga'|'adv', id }]
  let collapsedChapters = {}; // { chapterId: true } — état enroulé dans l'éditeur
  const SKILLS = ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'];

  const BLOCK_TYPES = [
    { value: 'narrative', label: 'Narratif (italique)' },
    { value: 'technical', label: 'Technique (normal)'  },
    { value: 'alert',     label: 'Alerte (gras)'       },
    { value: 'tip',       label: 'Conseil (encadré)'   },
  ];

  // Types de choix : couleur dédiée dans l'interface de jeu
  const CHOICE_TYPES = [
    { value: 'neutre',     label: 'Neutre'     },
    { value: 'violence',   label: 'Violence'   },
    { value: 'calme',      label: 'Calme'      },
    { value: 'ruse',       label: 'Ruse'       },
    { value: 'enquete',    label: 'Enquête'    },
    { value: 'discussion', label: 'Discussion' },
  ];

  // Types de chapitres : narratif (liste ordonnée de scènes), donjon structuré
  // (carte de salles reliées par des connecteurs, exploration libre), donjon
  // aléatoire (salles pré-écrites enchaînées dans un ordre tiré au sort).
  const CHAPTER_MODES = [
    { value: 'linear',  label: '📖 Narratif' },
    { value: 'dungeon', label: '🗺️ Donjon structuré' },
    { value: 'random',  label: '🎲 Donjon aléatoire' },
  ];
  function chMode(ch) { return (ch && (ch.mode === 'dungeon' || ch.mode === 'random')) ? ch.mode : 'linear'; }
  // Rôle d'une salle dans un donjon aléatoire (balises d'entrée / de sortie).
  const ROOM_ROLES = [
    { value: 'normal', label: '🎲 Aléatoire' },
    { value: 'entry',  label: '🚪 Entrée'   },
    { value: 'exit',   label: '🏁 Sortie'   },
  ];

  // Modèle vide d'une scène
  function newScene(id) {
    return {
      id: id || Store.uid(),
      type: 'exploration',
      title: '',
      text: '',           // champ hérité — conservé pour compatibilité
      // Toute nouvelle scène démarre avec un bloc narratif déjà prêt à éditer.
      blocks: [{ id: Store.uid(), type: 'narrative', content: '' }],
      fait: '',           // résumé ajouté au journal du joueur à l'arrivée sur la scène
      // navigation
      choices: [],        // [{ id, label, targetSceneId }]
      nextSceneId: null,  // pour fin auto sans choix
      // combat (zones : [{ name, monsterRefs:[{monsterId,count}], heroStart }])
      monsterRefs: [],    // hérité — conservé pour compatibilité
      combatZones: [],
      outcomeSceneId: null,
      defeatSceneId: null,
      // récompense
      xpReward: 0,
      itemRewards: [],    // [{ itemId, qty }]
    };
  }

  function newChapter() {
    // mode : 'linear' | 'dungeon' | 'random' — links/entryId servent aux donjons structurés
    return { id: Store.uid(), title: '', scenes: [], mode: 'linear', links: [], entryId: null };
  }

  function newAdventure() {
    return { id: Store.uid(), title: 'Nouvelle aventure', chapters: [] };
  }

  // ---------- Utilitaires d'arborescence / navigation ----------
  // Scènes proposées comme cible d'un lien : toutes celles du chapitre courant,
  // mais seulement la 1re scène de chaque AUTRE chapitre (sinon la liste explose).
  function buildAllScenes(adv, currentChId) {
    const arr = [];
    adv.chapters.forEach(function (c) {
      const isCurrent = !currentChId || c.id === currentChId;
      c.scenes.forEach(function (s, si) {
        if (!isCurrent && si !== 0) return; // autres chapitres : entrée (1re scène) uniquement
        arr.push({ id: s.id, label: (c.title ? c.title + ' / ' : '') + (s.title || s.id.slice(-4)) });
      });
    });
    return arr;
  }
  function sceneTitleMap(adv) {
    const map = {};
    adv.chapters.forEach(function (c) {
      c.scenes.forEach(function (s) { map[s.id] = s.title || '(sans titre)'; });
    });
    return map;
  }
  function chapterOfScene(adv, sceneId) {
    return adv.chapters.find(function (c) {
      return c.scenes.some(function (s) { return s.id === sceneId; });
    }) || null;
  }
  // Crée une scène liée dans le même chapitre que `fromSceneId` et renvoie son id
  function createLinkedScene(adv, fromSceneId) {
    const ch = chapterOfScene(adv, fromSceneId) || adv.chapters[0];
    if (!ch) return null;
    const ns = newScene();
    ns.title = 'Nouvelle scène';
    ch.scenes.push(ns);
    save();
    return ns.id;
  }
  // « Titre » → « Titre 2 », « Titre 2 » → « Titre 3 »
  function incrementSceneTitle(title) {
    const m = (title || '').match(/^(.*?)(\d+)\s*$/);
    if (m) return m[1] + (parseInt(m[2], 10) + 1);
    return (title ? title + ' ' : '') + '2';
  }

  // Duplique une scène juste après l'originale, avec de nouveaux identifiants
  // (scène, blocs, choix) et un titre incrémenté.
  function duplicateScene(a, chId, sceneId) {
    const ch = a.chapters.find(function (c) { return c.id === chId; });
    if (!ch) return;
    const idx = ch.scenes.findIndex(function (s) { return s.id === sceneId; });
    if (idx < 0) return;
    const copy = JSON.parse(JSON.stringify(ch.scenes[idx]));
    copy.id = Store.uid();
    if (Array.isArray(copy.blocks)) copy.blocks.forEach(function (b) { b.id = Store.uid(); });
    if (Array.isArray(copy.choices)) copy.choices.forEach(function (c) { c.id = Store.uid(); });
    copy.title = incrementSceneTitle(ch.scenes[idx].title);
    ch.scenes.splice(idx + 1, 0, copy);
    save(); renderChapters(a);
  }

  function moveScene(a, chId, sceneId, dir) {
    const ch = a.chapters.find(function (c) { return c.id === chId; });
    if (!ch) return;
    const i = ch.scenes.findIndex(function (s) { return s.id === sceneId; });
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ch.scenes.length) return;
    const tmp = ch.scenes[i]; ch.scenes[i] = ch.scenes[j]; ch.scenes[j] = tmp;
    save(); renderChapters(a);
  }
  // Liens sortants d'une scène (pour la mini-arborescence)
  function sceneLinks(scene) {
    const links = [];
    if (scene.type === 'combat') {
      if (scene.outcomeSceneId) links.push({ label: 'victoire', targetId: scene.outcomeSceneId });
      if (scene.defeatSceneId) links.push({ label: 'défaite', targetId: scene.defeatSceneId });
    } else if (scene.type === 'exploration' || scene.type === 'interaction') {
      (scene.choices || []).forEach(function (c) {
        if (c.skillTest) {
          if (c.successSceneId) links.push({ label: '« ' + (c.label || 'choix') + ' » ✓', targetId: c.successSceneId });
          if (c.failSceneId) links.push({ label: '« ' + (c.label || 'choix') + ' » ✗', targetId: c.failSceneId });
        } else if (c.targetSceneId) {
          links.push({ label: '« ' + (c.label || 'choix') + ' »', targetId: c.targetSceneId });
        }
      });
      if (scene.nextSceneId) links.push({ label: 'suite', targetId: scene.nextSceneId });
    } else if (scene.type !== 'fin') {
      if (scene.nextSceneId) links.push({ label: 'suite', targetId: scene.nextSceneId });
    }
    return links;
  }

  // ---------- Persistance ----------
  function load() { adventures = Store.loadAdventures(); sagas = Store.loadSagas(); homeOrder = Store.loadHomeOrder(); }
  function save() { Store.saveAdventures(adventures); }
  function saveOrg() { Store.saveSagas(sagas); Store.saveHomeOrder(homeOrder); }

  // ---------- Rendu principal ----------
  function render() {
    load();
    const root = $('#adventure-root');
    if (!root) return;

    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Aventures</h2>' +
          '<button id="adv-new" class="primary">+ Nouvelle aventure</button>' +
        '</div>' +
        '<div id="adv-list" class="adv-list"></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-head"><h2>Organisation de l\'accueil</h2>' +
          '<button id="saga-new" class="ghost small">+ Grande Aventure</button>' +
        '</div>' +
        '<p class="hint">Regroupe des aventures en Grandes Aventures (menus déroulants sur l\'accueil) ' +
          'et réordonne l\'affichage. Les aventures hors Grande Aventure restent affichées telles quelles.</p>' +
        '<div id="home-org"></div>' +
      '</div>';

    renderList();
    renderHomeOrg();
    $('#adv-new').addEventListener('click', function () {
      const a = newAdventure();
      adventures.push(a);
      save();
      openEditor(a.id);
    });
    $('#saga-new').addEventListener('click', function () {
      const title = prompt('Nom de la Grande Aventure :');
      if (title === null) return;
      sagas.push({ id: 'saga_' + Store.uid(), title: (title || '').trim() || 'Grande Aventure', adventureIds: [] });
      saveOrg(); renderHomeOrg();
    });
  }

  // ---------- Organisation de l'accueil (Grandes Aventures + ordre) ----------
  function moveEntry(idx, dir) {
    const layout = Store.homeLayout();
    const entries = layout.entries;
    const j = idx + dir;
    if (j < 0 || j >= entries.length) return;
    const tmp = entries[idx]; entries[idx] = entries[j]; entries[j] = tmp;
    homeOrder = entries.map(function (e) { return { type: e.type, id: e.id }; });
    saveOrg(); renderHomeOrg();
  }
  function moveInSaga(saga, idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= saga.adventureIds.length) return;
    const tmp = saga.adventureIds[idx]; saga.adventureIds[idx] = saga.adventureIds[j]; saga.adventureIds[j] = tmp;
    saveOrg(); renderHomeOrg();
  }
  function assignToSaga(advId, sagaId) {
    sagas.forEach(function (s) { s.adventureIds = s.adventureIds.filter(function (id) { return id !== advId; }); });
    if (sagaId) {
      const s = sagas.find(function (x) { return x.id === sagaId; });
      if (s && s.adventureIds.indexOf(advId) === -1) s.adventureIds.push(advId);
    }
    saveOrg(); renderHomeOrg();
  }
  function deleteSaga(sagaId) {
    sagas = sagas.filter(function (s) { return s.id !== sagaId; });
    homeOrder = homeOrder.filter(function (e) { return !(e.type === 'saga' && e.id === sagaId); });
    saveOrg(); renderHomeOrg();
  }

  function renderHomeOrg() {
    const box = $('#home-org');
    if (!box) return;
    const layout = Store.homeLayout();
    const advById = layout.advById;
    if (!layout.adventures.length) {
      box.innerHTML = '<p class="empty">Crée d\'abord des aventures.</p>';
      return;
    }
    // Options de Grande Aventure pour les menus d'affectation.
    function sagaOptions(selId) {
      return '<option value="">— Aucune (autonome) —</option>' +
        sagas.map(function (s) {
          return '<option value="' + s.id + '"' + (s.id === selId ? ' selected' : '') + '>' + esc(s.title || 'Grande Aventure') + '</option>';
        }).join('');
    }
    const n = layout.entries.length;
    box.innerHTML = layout.entries.map(function (e, i) {
      const arrows = '<span class="org-arrows">' +
        '<button class="icon-btn org-up" data-i="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button class="icon-btn org-down" data-i="' + i + '"' + (i === n - 1 ? ' disabled' : '') + '>↓</button></span>';
      if (e.type === 'adv') {
        const a = advById[e.id];
        if (!a) return '';
        return '<div class="org-row org-adv">' + arrows +
          '<span class="org-name">' + esc(a.title) + '</span>' +
          '<label class="org-assign">Dans : <select class="org-saga-sel" data-adv="' + a.id + '">' + sagaOptions('') + '</select></label>' +
        '</div>';
      }
      const saga = layout.sagaById[e.id];
      if (!saga) return '';
      const members = (saga.adventureIds || []).map(function (id) { return advById[id]; }).filter(Boolean);
      const m = members.length;
      const membersHtml = members.map(function (a, k) {
        const idx = saga.adventureIds.indexOf(a.id);
        return '<div class="org-member">' +
          '<span class="org-arrows">' +
            '<button class="icon-btn saga-up" data-saga="' + saga.id + '" data-k="' + idx + '"' + (k === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button class="icon-btn saga-down" data-saga="' + saga.id + '" data-k="' + idx + '"' + (k === m - 1 ? ' disabled' : '') + '>↓</button></span>' +
          '<span class="org-name">' + esc(a.title) + '</span>' +
          '<button class="ghost small saga-remove" data-adv="' + a.id + '">Retirer</button>' +
        '</div>';
      }).join('') || '<p class="hint org-empty">Aucun chapitre. Affecte des aventures via leur menu « Dans ».</p>';
      return '<div class="org-row org-saga">' +
        '<div class="org-saga-head">' + arrows +
          '<span class="org-saga-ic">📚</span>' +
          '<input type="text" class="org-saga-title" data-saga="' + saga.id + '" value="' + esc(saga.title || '') + '" placeholder="Nom de la Grande Aventure" />' +
          '<button class="icon-btn saga-del" data-saga="' + saga.id + '" title="Supprimer la Grande Aventure">✕</button>' +
        '</div>' +
        '<div class="org-members">' + membersHtml + '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.org-up').forEach(function (b) { b.onclick = function () { moveEntry(parseInt(b.getAttribute('data-i'), 10), -1); }; });
    box.querySelectorAll('.org-down').forEach(function (b) { b.onclick = function () { moveEntry(parseInt(b.getAttribute('data-i'), 10), 1); }; });
    box.querySelectorAll('.saga-up').forEach(function (b) { b.onclick = function () { const s = sagas.find(function (x) { return x.id === b.getAttribute('data-saga'); }); if (s) moveInSaga(s, parseInt(b.getAttribute('data-k'), 10), -1); }; });
    box.querySelectorAll('.saga-down').forEach(function (b) { b.onclick = function () { const s = sagas.find(function (x) { return x.id === b.getAttribute('data-saga'); }); if (s) moveInSaga(s, parseInt(b.getAttribute('data-k'), 10), 1); }; });
    box.querySelectorAll('.org-saga-sel').forEach(function (sel) { sel.onchange = function () { assignToSaga(sel.getAttribute('data-adv'), sel.value); }; });
    box.querySelectorAll('.saga-remove').forEach(function (b) { b.onclick = function () { assignToSaga(b.getAttribute('data-adv'), ''); }; });
    box.querySelectorAll('.saga-del').forEach(function (b) { b.onclick = function () { if (confirm('Supprimer cette Grande Aventure ? (Ses aventures redeviennent autonomes.)')) deleteSaga(b.getAttribute('data-saga')); }; });
    box.querySelectorAll('.org-saga-title').forEach(function (inp) {
      inp.onchange = function () { const s = sagas.find(function (x) { return x.id === inp.getAttribute('data-saga'); }); if (s) { s.title = inp.value.trim() || 'Grande Aventure'; saveOrg(); } };
    });
  }

  function renderList() {
    const box = $('#adv-list');
    if (!box) return;
    if (!adventures.length) {
      box.innerHTML = '<p class="empty">Aucune aventure. Crée-en une pour commencer.</p>';
      return;
    }
    box.innerHTML = adventures.map(function (a) {
      const chCount = a.chapters.length;
      const scCount = a.chapters.reduce(function (n, ch) { return n + ch.scenes.length; }, 0);
      return '<div class="adv-card roster-card">' +
        '<div class="roster-head">' +
          '<span class="roster-name">' + esc(a.title) + '</span>' +
          '<span class="tag">' + chCount + ' ch. · ' + scCount + ' sc.</span>' +
          '<button class="ghost small adv-edit" data-id="' + a.id + '">Éditer</button>' +
          '<button class="icon-btn adv-del" data-id="' + a.id + '" title="Supprimer">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.adv-edit').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(b.getAttribute('data-id')); });
    });
    box.querySelectorAll('.adv-del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Supprimer cette aventure ?')) return;
        const id = b.getAttribute('data-id');
        adventures = adventures.filter(function (a) { return a.id !== id; });
        // Nettoie les références dans les Grandes Aventures et l'ordre d'accueil.
        sagas.forEach(function (s) { s.adventureIds = s.adventureIds.filter(function (x) { return x !== id; }); });
        homeOrder = homeOrder.filter(function (e) { return !(e.type === 'adv' && e.id === id); });
        save(); saveOrg(); renderList(); renderHomeOrg();
      });
    });
  }

  // ---------- Éditeur d'aventure ----------
  function openEditor(advId) {
    const a = adventures.find(function (x) { return x.id === advId; });
    if (!a) return;
    const root = $('#adventure-root');
    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<button id="adv-back" class="ghost small">← Liste</button>' +
          '<h2 id="adv-title-display">' + esc(a.title) + '</h2>' +
        '</div>' +
        '<label class="adv-label">Titre de l\'aventure' +
          '<input type="text" id="adv-title" value="' + esc(a.title) + '" />' +
        '</label>' +
        '<div class="adv-meta-grid">' +
          '<label class="adv-label">Mot de passe' +
            '<input type="text" id="adv-password" value="' + esc(a.password || '') + '" placeholder="Aucun" /></label>' +
          '<label class="adv-label">Durée' +
            '<input type="text" id="adv-duration" value="' + esc(a.duration || '') + '" placeholder="ex. 2 h" /></label>' +
          '<label class="adv-label">Difficulté' +
            '<input type="text" id="adv-difficulty" value="' + esc(a.difficulty || '') + '" placeholder="ex. Intermédiaire" /></label>' +
          '<label class="adv-label">Résumé' +
            '<input type="text" id="adv-summary" value="' + esc(a.summary || '') + '" placeholder="Présentation courte (accueil)…" /></label>' +
        '</div>' +
        '<div class="adv-chapters-bar"><h3>Chapitres</h3>' +
          '<button id="adv-toggle-all" class="ghost small">Tout enrouler</button></div>' +
        '<div id="adv-chapters"></div>' +
        '<button id="adv-add-chapter" class="ghost" style="margin-top:.5rem">+ Chapitre</button>' +
      '</div>';

    $('#adv-back').addEventListener('click', function () { render(); });
    $('#adv-title').addEventListener('input', function () {
      a.title = this.value;
      $('#adv-title-display').textContent = a.title;
      save();
    });
    $('#adv-password').addEventListener('input', function () { a.password = this.value; save(); });
    $('#adv-duration').addEventListener('input', function () { a.duration = this.value; save(); });
    $('#adv-difficulty').addEventListener('input', function () { a.difficulty = this.value; save(); });
    $('#adv-summary').addEventListener('input', function () { a.summary = this.value; save(); });
    $('#adv-add-chapter').addEventListener('click', function () {
      a.chapters.push(newChapter());
      save();
      renderChapters(a);
    });
    $('#adv-toggle-all').addEventListener('click', function () {
      const anyOpen = a.chapters.some(function (ch) { return !collapsedChapters[ch.id]; });
      a.chapters.forEach(function (ch) { collapsedChapters[ch.id] = anyOpen; });
      this.textContent = anyOpen ? 'Tout dérouler' : 'Tout enrouler';
      renderChapters(a);
    });
    renderChapters(a);
  }

  function renderChapters(a) {
    const box = $('#adv-chapters');
    if (!box) return;
    if (!a.chapters.length) {
      box.innerHTML = '<p class="empty">Aucun chapitre.</p>';
      return;
    }
    box.innerHTML = a.chapters.map(function (ch, ci) {
      const collapsed = !!collapsedChapters[ch.id];
      const mode = chMode(ch);
      const modeOpts = CHAPTER_MODES.map(function (m) {
        return '<option value="' + m.value + '"' + (m.value === mode ? ' selected' : '') + '>' + m.label + '</option>';
      }).join('');
      // Corps du chapitre selon son type : liste de scènes (narratif / aléatoire)
      // ou carte des salles (donjon structuré, injectée par renderDungeonEditor).
      let body = '';
      if (!collapsed) {
        if (mode === 'dungeon') {
          body = '<div class="adv-dmap" id="dmap-' + ch.id + '"></div>';
        } else {
          body = '<div class="adv-scenes" id="scenes-' + ch.id + '">' + renderScenesHTML(ch, a) + '</div>' +
            (mode === 'random'
              ? '<p class="hint dmap-hint">🎲 L\'ordre des salles est tiré au sort à chaque partie : Entrée(s) d\'abord, salles aléatoires mélangées, Sortie(s) à la fin.</p>'
              : '') +
            '<button class="ghost small adv-add-scene" data-ch="' + ch.id + '" style="margin:.4rem 0 .8rem">' +
              (mode === 'random' ? '+ Salle' : '+ Scène') + '</button>';
        }
      }
      return '<div class="adv-chapter adv-chapter-' + mode + (collapsed ? ' collapsed' : '') + '" data-ch="' + ch.id + '">' +
        '<div class="adv-ch-head">' +
          '<button type="button" class="icon-btn adv-ch-toggle" data-ch="' + ch.id + '" title="' + (collapsed ? 'Dérouler' : 'Enrouler') + '">' + (collapsed ? '▸' : '▾') + '</button>' +
          '<span class="adv-ch-num">Chapitre ' + (ci + 1) + '</span>' +
          '<input type="text" class="adv-ch-title" data-ch="' + ch.id + '" value="' + esc(ch.title) + '" placeholder="Titre du chapitre" />' +
          '<select class="adv-ch-mode" data-ch="' + ch.id + '" title="Type de chapitre">' + modeOpts + '</select>' +
          (collapsed ? '<span class="adv-ch-count">' + ch.scenes.length + ' ' + (mode === 'linear' ? 'scène(s)' : 'salle(s)') + '</span>' : '') +
          '<button class="icon-btn adv-del-ch" data-ch="' + ch.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        body +
      '</div>';
    }).join('');

    box.querySelectorAll('.adv-ch-toggle').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-ch');
        collapsedChapters[id] = !collapsedChapters[id];
        renderChapters(a);
      });
    });
    box.querySelectorAll('.adv-ch-title').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const ch = a.chapters.find(function (c) { return c.id === inp.getAttribute('data-ch'); });
        if (ch) { ch.title = inp.value; save(); }
      });
    });
    // Type de chapitre (Narratif / Donjon structuré / Donjon aléatoire).
    // Changer de type ne détruit rien : scènes, connecteurs et rôles sont conservés.
    box.querySelectorAll('.adv-ch-mode').forEach(function (sel) {
      sel.addEventListener('change', function () {
        const ch = a.chapters.find(function (c) { return c.id === sel.getAttribute('data-ch'); });
        if (ch) { ch.mode = sel.value; save(); renderChapters(a); }
      });
    });
    // Rôle des salles d'un donjon aléatoire (Entrée / Aléatoire / Sortie).
    box.querySelectorAll('.sc-role').forEach(function (sel) {
      sel.addEventListener('click', function (e) { e.stopPropagation(); });
      sel.addEventListener('change', function (e) {
        e.stopPropagation();
        const ch = a.chapters.find(function (c) { return c.id === sel.getAttribute('data-ch'); });
        const s = ch && ch.scenes.find(function (x) { return x.id === sel.getAttribute('data-scene'); });
        if (s) { s.roomRole = sel.value; save(); }
      });
    });
    box.querySelectorAll('.adv-del-ch').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Supprimer ce chapitre et toutes ses scènes ?')) return;
        a.chapters = a.chapters.filter(function (c) { return c.id !== b.getAttribute('data-ch'); });
        save(); renderChapters(a);
      });
    });
    box.querySelectorAll('.adv-add-scene').forEach(function (b) {
      b.addEventListener('click', function () {
        const ch = a.chapters.find(function (c) { return c.id === b.getAttribute('data-ch'); });
        if (!ch) return;
        ch.scenes.push(newScene());
        save(); renderChapters(a);
      });
    });
    // Cliquer sur une scène ouvre l'éditeur
    box.querySelectorAll('.adv-scene-row').forEach(function (row) {
      row.addEventListener('click', function () {
        openSceneModal(a, row.getAttribute('data-ch'), row.getAttribute('data-scene'));
      });
    });
    box.querySelectorAll('.sc-up').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        moveScene(a, b.getAttribute('data-ch'), b.getAttribute('data-scene'), -1);
      });
    });
    box.querySelectorAll('.sc-down').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        moveScene(a, b.getAttribute('data-ch'), b.getAttribute('data-scene'), 1);
      });
    });
    box.querySelectorAll('.sc-dup').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        duplicateScene(a, b.getAttribute('data-ch'), b.getAttribute('data-scene'));
      });
    });
    box.querySelectorAll('.adv-del-scene').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        const ch = a.chapters.find(function (c) { return c.id === b.getAttribute('data-ch'); });
        if (!ch) return;
        if (!confirm('Supprimer cette scène ?')) return;
        const sid = b.getAttribute('data-scene');
        ch.scenes = ch.scenes.filter(function (s) { return s.id !== sid; });
        // Nettoie les connecteurs / l'entrée d'un donjon pointant vers la scène supprimée.
        if (Array.isArray(ch.links)) ch.links = ch.links.filter(function (l) { return l.from !== sid && l.to !== sid; });
        if (ch.entryId === sid) ch.entryId = ch.scenes.length ? ch.scenes[0].id : null;
        save(); renderChapters(a);
      });
    });

    // Cartes des donjons structurés (rendu + câblage spécifiques).
    a.chapters.forEach(function (ch) {
      if (!collapsedChapters[ch.id] && chMode(ch) === 'dungeon') renderDungeonEditor(a, ch);
    });
  }

  function renderScenesHTML(ch, adv) {
    if (!ch.scenes.length) return '<p class="empty" style="padding:.3rem 0">Aucune scène.</p>';
    const titles = sceneTitleMap(adv);
    const isRandom = chMode(ch) === 'random';
    return ch.scenes.map(function (s, si) {
      const typeLabel = (SCENE_TYPES.find(function (t) { return t.value === s.type; }) || {}).label || s.type;
      const links = sceneLinks(s);
      const tree = links.length
        ? '<div class="adv-scene-links">' + links.map(function (l) {
            const t = titles[l.targetId] || '(scène inconnue)';
            return '<div class="adv-scene-link"><span class="link-arrow">↳</span> ' +
              esc(l.label) + ' <span class="link-to">→ ' + esc(t) + '</span></div>';
          }).join('') + '</div>'
        : '';
      // Donjon aléatoire : balise du rôle de la salle (Entrée / Aléatoire / Sortie).
      const roleSel = isRandom
        ? '<select class="sc-role sc-role-' + (s.roomRole || 'normal') + '" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Rôle de la salle dans le donjon aléatoire">' +
            ROOM_ROLES.map(function (r) {
              return '<option value="' + r.value + '"' + ((s.roomRole || 'normal') === r.value ? ' selected' : '') + '>' + r.label + '</option>';
            }).join('') + '</select>'
        : '';
      const last = si === ch.scenes.length - 1;
      return '<div class="adv-scene-item">' +
        '<div class="adv-scene-row" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Cliquer pour éditer">' +
          '<span class="adv-scene-num">' + (si + 1) + '</span>' +
          '<span class="adv-scene-type type-' + s.type + '">' + typeLabel + '</span>' +
          '<span class="adv-scene-title">' + esc(s.title || '(sans titre)') + '</span>' +
          roleSel +
          '<span class="adv-scene-tools">' +
            '<button type="button" class="icon-btn sc-up" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Monter"' + (si === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="icon-btn sc-down" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Descendre"' + (last ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="icon-btn sc-dup" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Dupliquer">⧉</button>' +
            '<button type="button" class="icon-btn adv-del-scene del-btn" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Supprimer">✕</button>' +
          '</span>' +
        '</div>' +
        tree +
      '</div>';
    }).join('');
  }

  // ---------- Éditeur de Donjon Structuré (carte des salles) ----------
  // Les salles (scènes) sont des cartouches positionnés sur une grille
  // (s.mapX / s.mapY), reliés par des connecteurs (ch.links). L'entrée du
  // donjon est ch.entryId. On glisse les cartouches, 🔗 trace un connecteur.
  const DMAP_CELL_W = 186, DMAP_CELL_H = 128, DMAP_BOX_W = 164, DMAP_BOX_H = 100, DMAP_PAD = 12;
  let dmapLinking = null; // { chId, from } — connecteur en cours de traçage

  function ensureDungeonData(ch) {
    if (!Array.isArray(ch.links)) ch.links = [];
    ch.links = ch.links.filter(function (l) {
      return l && l.from !== l.to &&
        ch.scenes.some(function (s) { return s.id === l.from; }) &&
        ch.scenes.some(function (s) { return s.id === l.to; });
    });
    if (!ch.entryId || !ch.scenes.some(function (s) { return s.id === ch.entryId; })) {
      ch.entryId = ch.scenes.length ? ch.scenes[0].id : null;
    }
    // Positionne les salles sans coordonnées (ou en double) sur des cellules libres.
    const used = {};
    ch.scenes.forEach(function (s) {
      const ok = typeof s.mapX === 'number' && typeof s.mapY === 'number' && s.mapX >= 0 && s.mapY >= 0;
      if (ok && !used[s.mapX + ',' + s.mapY]) { used[s.mapX + ',' + s.mapY] = true; }
      else { s.mapX = null; s.mapY = null; }
    });
    let cursor = 0;
    ch.scenes.forEach(function (s) {
      if (typeof s.mapX === 'number' && s.mapX !== null) return;
      while (used[(cursor % 4) + ',' + Math.floor(cursor / 4)]) cursor++;
      s.mapX = cursor % 4; s.mapY = Math.floor(cursor / 4);
      used[s.mapX + ',' + s.mapY] = true;
    });
  }

  // Cellule libre la plus proche de (gx, gy) — recherche en couronnes croissantes.
  function dmapFreeCell(ch, gx, gy, exceptId) {
    const occ = {};
    ch.scenes.forEach(function (s) { if (s.id !== exceptId) occ[s.mapX + ',' + s.mapY] = true; });
    if (!occ[gx + ',' + gy]) return { x: gx, y: gy };
    for (let r = 1; r < 24; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = gx + dx, y = gy + dy;
          if (x < 0 || y < 0 || occ[x + ',' + y]) continue;
          return { x: x, y: y };
        }
      }
    }
    return { x: gx, y: gy };
  }

  function renderDungeonEditor(a, ch) {
    const box = document.getElementById('dmap-' + ch.id);
    if (!box) return;
    ensureDungeonData(ch);
    const byId = {};
    ch.scenes.forEach(function (s) { byId[s.id] = s; });
    const titleOf = function (id) { const s = byId[id]; return s ? (s.title || '(sans titre)') : '?'; };
    const maxX = ch.scenes.reduce(function (m, s) { return Math.max(m, s.mapX || 0); }, 0);
    const maxY = ch.scenes.reduce(function (m, s) { return Math.max(m, s.mapY || 0); }, 0);
    const W = (maxX + 2) * DMAP_CELL_W + DMAP_PAD, H = (maxY + 1) * DMAP_CELL_H + DMAP_BOX_H / 2 + DMAP_PAD;
    const cx = function (s) { return s.mapX * DMAP_CELL_W + DMAP_PAD + DMAP_BOX_W / 2; };
    const cy = function (s) { return s.mapY * DMAP_CELL_H + DMAP_PAD + DMAP_BOX_H / 2; };

    // Connecteurs : traits + étiquette au milieu (couloir, porte, passage secret…).
    const lines = ch.links.map(function (l) {
      const f = byId[l.from], t = byId[l.to];
      if (!f || !t) return '';
      const mx = (cx(f) + cx(t)) / 2, my = (cy(f) + cy(t)) / 2;
      return '<line x1="' + cx(f) + '" y1="' + cy(f) + '" x2="' + cx(t) + '" y2="' + cy(t) + '" class="dmap-line"></line>' +
        (l.label ? '<text x="' + mx + '" y="' + (my - 5) + '" class="dmap-line-lbl" text-anchor="middle">' + esc(l.label) + '</text>' : '');
    }).join('');

    const rooms = ch.scenes.map(function (s) {
      const isEntry = ch.entryId === s.id;
      const typeLabel = (SCENE_TYPES.find(function (t) { return t.value === s.type; }) || {}).label || s.type;
      const nLinks = ch.links.filter(function (l) { return l.from === s.id || l.to === s.id; }).length;
      return '<div class="dmap-room type-' + s.type + (isEntry ? ' dmap-entry' : '') + '" data-scene="' + s.id + '"' +
        ' style="left:' + (s.mapX * DMAP_CELL_W + DMAP_PAD) + 'px;top:' + (s.mapY * DMAP_CELL_H + DMAP_PAD) + 'px">' +
        '<div class="dmap-room-head">' +
          (isEntry ? '<span class="dmap-entry-badge" title="Entrée du donjon">🚪</span>' : '') +
          '<span class="dmap-room-title">' + esc(s.title || '(sans titre)') + '</span>' +
        '</div>' +
        '<span class="adv-scene-type type-' + s.type + '">' + esc(typeLabel) + '</span>' +
        (nLinks ? '<span class="dmap-room-links" title="Connecteurs">' + nLinks + ' ⟷</span>' : '') +
        '<div class="dmap-room-tools">' +
          '<button type="button" class="icon-btn dmap-link-btn" data-scene="' + s.id + '" title="Tracer un connecteur vers une autre salle">🔗</button>' +
          '<button type="button" class="icon-btn dmap-entry-btn" data-scene="' + s.id + '" title="Définir comme entrée du donjon">🚪</button>' +
          '<button type="button" class="icon-btn dmap-del-btn" data-scene="' + s.id + '" title="Supprimer la salle">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const linkRows = ch.links.length ? ch.links.map(function (l, i) {
      return '<div class="dmap-link-row" data-i="' + i + '">' +
        '<span class="dmap-link-ends">' + esc(titleOf(l.from)) + ' ⟷ ' + esc(titleOf(l.to)) + '</span>' +
        '<input type="text" class="dmap-link-label" maxlength="60" placeholder="Description du passage (porte, couloir, escalier, passage secret…)" value="' + esc(l.label || '') + '" />' +
        '<button type="button" class="icon-btn dmap-link-del" title="Supprimer le connecteur">✕</button>' +
      '</div>';
    }).join('') : '<p class="hint">Aucun connecteur. Clique 🔗 sur une salle puis sur la salle d\'arrivée.</p>';

    const linking = dmapLinking && dmapLinking.chId === ch.id;
    box.innerHTML =
      '<p class="hint">Chaque cartouche est une <b>salle</b> (scène). Glisse les cartouches pour dessiner la carte, ' +
        'clique une salle pour l\'éditer, <b>🔗</b> pour tracer un connecteur, <b>🚪</b> pour définir l\'entrée du donjon.</p>' +
      '<div class="dmap-scroll' + (linking ? ' dmap-linking' : '') + '">' +
        '<div class="dmap-canvas" style="width:' + W + 'px;height:' + H + 'px">' +
          '<svg class="dmap-svg" width="' + W + '" height="' + H + '">' + lines + '</svg>' +
          rooms +
        '</div>' +
      '</div>' +
      '<div class="dmap-toolbar">' +
        '<button type="button" class="ghost small dmap-add">+ Salle</button>' +
        (linking ? '<span class="dmap-linkhint">🔗 Clique la salle d\'arrivée du connecteur (clic dans le vide pour annuler)</span>' : '') +
      '</div>' +
      '<div class="dmap-links"><div class="dmap-links-title">Connecteurs (couloirs, portes, passages…)</div>' + linkRows + '</div>';

    // ----- Câblage -----
    const scroll = box.querySelector('.dmap-scroll');
    box.querySelector('.dmap-add').onclick = function () {
      const cell = dmapFreeCell(ch, 0, 0, null);
      const ns = newScene();
      ns.title = 'Nouvelle salle'; ns.mapX = cell.x; ns.mapY = cell.y;
      ch.scenes.push(ns);
      save(); renderChapters(a);
    };
    // Clic dans le vide : annule le traçage en cours.
    scroll.addEventListener('mousedown', function (ev) {
      if (dmapLinking && dmapLinking.chId === ch.id && !ev.target.closest('.dmap-room')) {
        dmapLinking = null; renderDungeonEditor(a, ch);
      }
    });
    box.querySelectorAll('.dmap-link-btn').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        dmapLinking = { chId: ch.id, from: b.getAttribute('data-scene') };
        renderDungeonEditor(a, ch);
      };
    });
    box.querySelectorAll('.dmap-entry-btn').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        ch.entryId = b.getAttribute('data-scene');
        save(); renderDungeonEditor(a, ch);
      };
    });
    box.querySelectorAll('.dmap-del-btn').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        const sid = b.getAttribute('data-scene');
        if (!confirm('Supprimer cette salle (et ses connecteurs) ?')) return;
        ch.scenes = ch.scenes.filter(function (s) { return s.id !== sid; });
        ch.links = ch.links.filter(function (l) { return l.from !== sid && l.to !== sid; });
        if (ch.entryId === sid) ch.entryId = ch.scenes.length ? ch.scenes[0].id : null;
        if (dmapLinking && dmapLinking.from === sid) dmapLinking = null;
        save(); renderChapters(a);
      };
    });
    box.querySelectorAll('.dmap-link-label').forEach(function (inp) {
      inp.oninput = function () {
        const i = +inp.closest('.dmap-link-row').getAttribute('data-i');
        if (ch.links[i]) { ch.links[i].label = inp.value; save(); }
      };
      // À la sortie du champ : rafraîchit l'étiquette sur la carte.
      inp.onchange = function () { renderDungeonEditor(a, ch); };
    });
    box.querySelectorAll('.dmap-link-del').forEach(function (b) {
      b.onclick = function () {
        const i = +b.closest('.dmap-link-row').getAttribute('data-i');
        ch.links.splice(i, 1);
        save(); renderDungeonEditor(a, ch);
      };
    });

    // Glisser-déposer des cartouches (aimantés sur la grille) + clic pour éditer.
    box.querySelectorAll('.dmap-room').forEach(function (el) {
      const sid = el.getAttribute('data-scene');
      el.addEventListener('mousedown', function (ev) {
        if (ev.button !== 0 || ev.target.closest('button')) return;
        const s = byId[sid]; if (!s) return;
        const startX = ev.clientX, startY = ev.clientY;
        const origL = s.mapX * DMAP_CELL_W + DMAP_PAD, origT = s.mapY * DMAP_CELL_H + DMAP_PAD;
        let moved = false;
        function onMove(e2) {
          const dx = e2.clientX - startX, dy = e2.clientY - startY;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 7) return;
          moved = true;
          el.classList.add('dragging');
          el.style.left = Math.max(0, origL + dx) + 'px';
          el.style.top = Math.max(0, origT + dy) + 'px';
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (!moved) return;
          const gx = Math.max(0, Math.round((parseFloat(el.style.left) - DMAP_PAD) / DMAP_CELL_W));
          const gy = Math.max(0, Math.round((parseFloat(el.style.top) - DMAP_PAD) / DMAP_CELL_H));
          const cell = dmapFreeCell(ch, gx, gy, sid);
          s.mapX = cell.x; s.mapY = cell.y;
          save(); renderDungeonEditor(a, ch);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        ev.preventDefault();
      });
      el.addEventListener('click', function (ev) {
        if (ev.target.closest('button')) return;
        if (el.classList.contains('dragging')) { el.classList.remove('dragging'); return; }
        // Traçage en cours : ce clic désigne la salle d'arrivée du connecteur.
        if (dmapLinking && dmapLinking.chId === ch.id) {
          const from = dmapLinking.from;
          dmapLinking = null;
          if (from && from !== sid && !ch.links.some(function (l) {
            return (l.from === from && l.to === sid) || (l.from === sid && l.to === from);
          })) {
            ch.links.push({ id: Store.uid(), from: from, to: sid, label: '' });
            save();
          }
          renderDungeonEditor(a, ch);
          return;
        }
        openSceneModal(a, ch.id, sid);
      });
    });
  }

  // ---------- Modale d'édition de scène ----------
  let sceneModal = null;

  function openSceneModal(adv, chId, sceneId) {
    const ch = adv.chapters.find(function (c) { return c.id === chId; });
    if (!ch) return;
    const scene = ch.scenes.find(function (s) { return s.id === sceneId; });
    if (!scene) return;

    const modal = document.getElementById('scene-modal');
    modal.removeAttribute('hidden');

    document.getElementById('sm-title').value = scene.title || '';
    const typeSelect = document.getElementById('sm-type');
    typeSelect.value = scene.type || 'exploration';

    if (!Array.isArray(scene.blocks)) scene.blocks = [];
    // Migration douce : l'ancien champ `text` devient un bloc narratif éditable.
    if (scene.text && scene.text.trim() && !scene.blocks.length) {
      scene.blocks.push({ id: Store.uid(), type: 'narrative', content: scene.text });
      scene.text = '';
    }
    refreshSceneModalSections(scene, adv);
    renderBlocksEditor(scene);

    typeSelect.onchange = function () {
      scene.type = typeSelect.value;
      refreshSceneModalSections(scene, adv);
    };
    document.getElementById('sm-title').oninput = function () { scene.title = this.value; };
    const faitEl = document.getElementById('sm-fait');
    if (faitEl) { faitEl.value = scene.fait || ''; faitEl.oninput = function () { scene.fait = this.value; }; }
    document.getElementById('sm-add-block').onclick = function () {
      scene.blocks.push({ id: Store.uid(), type: 'narrative', content: '' });
      renderBlocksEditor(scene);
    };

    function closeModal() {
      save();
      modal.setAttribute('hidden', '');
      renderChapters(adv);
    }
    document.getElementById('sm-save').onclick = closeModal;
    document.getElementById('sm-close').onclick = closeModal;
  }

  function sceneTargetOptions(allScenes, selectedId, adv) {
    let opts = allScenes.slice();
    // Un lien déjà posé vers une scène masquée (autre chapitre, scène non-entrée)
    // doit rester sélectionnable, sinon on le perdrait silencieusement.
    if (selectedId && !opts.some(function (s) { return s.id === selectedId; })) {
      const titles = adv ? sceneTitleMap(adv) : {};
      opts = opts.concat([{ id: selectedId, label: (titles[selectedId] || '(scène liée)') }]);
    }
    return '<option value="">(aucune)</option>' +
      opts.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.label) + '</option>';
      }).join('') +
      '<option value="__new__">+ Créer une nouvelle scène…</option>';
  }

  // Gère le choix d'une cible dans un menu déroulant, avec création à la volée.
  // `assign(id)` enregistre la cible choisie ; renvoie true si une nouvelle scène
  // a été créée (l'appelant doit rafraîchir l'éditeur).
  function handleTargetSelect(value, scene, adv, assign) {
    if (value === '__new__') {
      const nid = createLinkedScene(adv, scene.id);
      assign(nid || null);
      save();
      return true;
    }
    assign(value || null);
    return false;
  }

  function refreshSceneModalSections(scene, adv) {
    const monsters = Store.state.monsters;
    const items = Store.state.items;
    const curCh = chapterOfScene(adv, scene.id);
    const allScenes = buildAllScenes(adv, curCh ? curCh.id : null);

    const choicesBox = document.getElementById('sm-choices-section');
    const combatBox = document.getElementById('sm-combat-section');
    const rewardBox = document.getElementById('sm-reward-section');
    const nextBox = document.getElementById('sm-next-section');

    // Le type de scène n'est qu'un libellé pour se repérer dans l'arbre : TOUTES
    // les fonctions (suite, choix, combat, récompense) sont disponibles partout.
    nextBox.style.display = '';
    choicesBox.style.display = '';
    combatBox.style.display = '';
    rewardBox.style.display = '';

    // Scène suivante (auto)
    document.getElementById('sm-next').innerHTML = sceneTargetOptions(allScenes, scene.nextSceneId, adv);
    document.getElementById('sm-next').onchange = function () {
      if (handleTargetSelect(this.value, scene, adv, function (id) { scene.nextSceneId = id; })) {
        refreshSceneModalSections(scene, adv);
      }
    };

    // Choix
    renderChoicesEditor(scene, adv);

    // Combat
    document.getElementById('sm-outcome').innerHTML = sceneTargetOptions(allScenes, scene.outcomeSceneId, adv);
    document.getElementById('sm-defeat').innerHTML = sceneTargetOptions(allScenes, scene.defeatSceneId, adv);
    document.getElementById('sm-outcome').onchange = function () {
      if (handleTargetSelect(this.value, scene, adv, function (id) { scene.outcomeSceneId = id; })) {
        refreshSceneModalSections(scene, adv);
      }
    };
    document.getElementById('sm-defeat').onchange = function () {
      if (handleTargetSelect(this.value, scene, adv, function (id) { scene.defeatSceneId = id; })) {
        refreshSceneModalSections(scene, adv);
      }
    };
    renderMonsterRefs(scene, monsters);

    // Récompense
    document.getElementById('sm-xp').value = scene.xpReward || 0;
    document.getElementById('sm-xp').onchange = function () { scene.xpReward = parseInt(this.value, 10) || 0; };
    renderItemRewards(scene, items);
  }

  function renderBlocksEditor(scene) {
    const box = document.getElementById('sm-blocks');
    if (!box) return;
    if (!scene.blocks.length) {
      box.innerHTML = '<p class="empty" style="margin:.25rem 0 .35rem">Aucun bloc — clique « + Bloc » pour en ajouter.</p>';
    } else {
      box.innerHTML = scene.blocks.map(function (blk, i) {
        const typeOpts = BLOCK_TYPES.map(function (t) {
          return '<option value="' + t.value + '"' + (t.value === blk.type ? ' selected' : '') + '>' + esc(t.label) + '</option>';
        }).join('');
        const last = i === scene.blocks.length - 1;
        // Le fond de la ligne reprend la couleur du type de bloc (repère visuel)
        return '<div class="adv-block-row block-' + (blk.type || 'narrative') + '">' +
          '<div class="adv-block-row-head">' +
            '<select class="block-type-sel">' + typeOpts + '</select>' +
            '<button type="button" class="icon-btn block-up" title="Monter"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="icon-btn block-down" title="Descendre"' + (last ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="icon-btn block-del" title="Supprimer ce bloc">✕</button>' +
          '</div>' +
          '<textarea class="block-content" rows="3" placeholder="Texte du bloc — **gras** et *italique* possibles">' + esc(blk.content || '') + '</textarea>' +
        '</div>';
      }).join('');
    }
    box.querySelectorAll('.block-type-sel').forEach(function (sel, i) {
      sel.onchange = function () {
        scene.blocks[i].type = this.value;
        const row = this.closest('.adv-block-row');
        if (row) row.className = 'adv-block-row block-' + this.value;
      };
    });
    box.querySelectorAll('.block-content').forEach(function (ta, i) {
      ta.oninput = function () { scene.blocks[i].content = this.value; };
    });
    box.querySelectorAll('.block-up').forEach(function (b, i) {
      b.onclick = function () {
        if (i <= 0) return;
        const t = scene.blocks[i - 1]; scene.blocks[i - 1] = scene.blocks[i]; scene.blocks[i] = t;
        renderBlocksEditor(scene);
      };
    });
    box.querySelectorAll('.block-down').forEach(function (b, i) {
      b.onclick = function () {
        if (i >= scene.blocks.length - 1) return;
        const t = scene.blocks[i + 1]; scene.blocks[i + 1] = scene.blocks[i]; scene.blocks[i] = t;
        renderBlocksEditor(scene);
      };
    });
    box.querySelectorAll('.block-del').forEach(function (b, i) {
      b.onclick = function () { scene.blocks.splice(i, 1); renderBlocksEditor(scene); };
    });
  }

  function renderChoicesEditor(scene, adv) {
    const box = document.getElementById('sm-choices');
    const curCh = chapterOfScene(adv, scene.id);
    const allScenes = buildAllScenes(adv, curCh ? curCh.id : null);
    box.innerHTML = (scene.choices || []).map(function (ch, i) {
      const typeOpts = CHOICE_TYPES.map(function (t) {
        return '<option value="' + t.value + '"' + ((ch.choiceType || 'neutre') === t.value ? ' selected' : '') + '>' + esc(t.label) + '</option>';
      }).join('');
      const skillOpts = SKILLS.map(function (s) {
        return '<option value="' + s + '"' + (ch.skill === s ? ' selected' : '') + '>' + s + '</option>';
      }).join('');
      const diffOpts = [['facile', 'Facile (1)'], ['moyen', 'Moyen (2)'], ['difficile', 'Difficile (3)']].map(function (d) {
        return '<option value="' + d[0] + '"' + ((ch.difficulty || 'moyen') === d[0] ? ' selected' : '') + '>' + d[1] + '</option>';
      }).join('');
      return '<div class="adv-choice-row" data-ci="' + i + '">' +
        '<div class="adv-choice-main">' +
          '<input type="text" class="ch-label" value="' + esc(ch.label) + '" placeholder="Texte du choix" />' +
          '<select class="ch-type choice-type-' + (ch.choiceType || 'neutre') + '">' + typeOpts + '</select>' +
          '<label class="ch-istest-lbl"><input type="checkbox" class="ch-istest"' + (ch.skillTest ? ' checked' : '') + '> Test de compétence</label>' +
          '<button type="button" class="icon-btn ch-up" title="Monter"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="icon-btn ch-down" title="Descendre"' + (i === (scene.choices.length - 1) ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="icon-btn ch-del" title="Supprimer ce choix">✕</button>' +
        '</div>' +
        (ch.skillTest
          ? '<div class="adv-choice-test">' +
              '<select class="ch-skill">' + skillOpts + '</select>' +
              '<select class="ch-diff">' + diffOpts + '</select>' +
              '<label class="ch-mini">Réussite →<select class="ch-success">' + sceneTargetOptions(allScenes, ch.successSceneId, adv) + '</select></label>' +
              '<label class="ch-mini">Échec →<select class="ch-fail">' + sceneTargetOptions(allScenes, ch.failSceneId, adv) + '</select></label>' +
            '</div>'
          : '<select class="ch-target">' + sceneTargetOptions(allScenes, ch.targetSceneId, adv) + '</select>') +
        '<input type="text" class="ch-desc" value="' + esc(ch.description || '') + '" ' +
          'placeholder="Description / contexte affiché aux joueurs sous le choix (optionnel)" />' +
      '</div>';
    }).join('') +
    '<button type="button" class="ghost small" id="sm-add-choice">+ Choix</button>';

    // L'index du choix est lu sur la ligne (data-ci) et NON sur l'ordre dans la
    // NodeList — sinon les champs propres aux tests (skill/success/échec) seraient
    // affectés au mauvais choix quand des choix normaux et des tests sont mélangés.
    const ciOf = function (el) { return +el.closest('.adv-choice-row').getAttribute('data-ci'); };
    box.querySelectorAll('.ch-label').forEach(function (inp) {
      inp.oninput = function () { scene.choices[ciOf(this)].label = this.value; };
    });
    box.querySelectorAll('.ch-type').forEach(function (sel) {
      sel.onchange = function () {
        scene.choices[ciOf(this)].choiceType = this.value;
        this.className = 'ch-type choice-type-' + this.value;
      };
    });
    box.querySelectorAll('.ch-istest').forEach(function (cb) {
      cb.onchange = function () {
        const c = scene.choices[ciOf(this)];
        c.skillTest = this.checked;
        if (this.checked && !c.skill) c.skill = SKILLS[0];
        renderChoicesEditor(scene, adv);
      };
    });
    box.querySelectorAll('.ch-skill').forEach(function (sel) {
      sel.onchange = function () { scene.choices[ciOf(this)].skill = this.value; };
    });
    box.querySelectorAll('.ch-diff').forEach(function (sel) {
      sel.onchange = function () { scene.choices[ciOf(this)].difficulty = this.value; };
    });
    box.querySelectorAll('.ch-success').forEach(function (sel) {
      sel.onchange = function () {
        const ci = ciOf(this);
        if (handleTargetSelect(this.value, scene, adv, function (id) { scene.choices[ci].successSceneId = id; })) renderChoicesEditor(scene, adv);
      };
    });
    box.querySelectorAll('.ch-fail').forEach(function (sel) {
      sel.onchange = function () {
        const ci = ciOf(this);
        if (handleTargetSelect(this.value, scene, adv, function (id) { scene.choices[ci].failSceneId = id; })) renderChoicesEditor(scene, adv);
      };
    });
    box.querySelectorAll('.ch-desc').forEach(function (inp) {
      inp.oninput = function () { scene.choices[ciOf(this)].description = this.value; };
    });
    box.querySelectorAll('.ch-target').forEach(function (sel) {
      sel.onchange = function () {
        const ci = ciOf(this);
        if (handleTargetSelect(this.value, scene, adv, function (id) { scene.choices[ci].targetSceneId = id; })) {
          refreshSceneModalSections(scene, adv);
        }
      };
    });
    box.querySelectorAll('.ch-del').forEach(function (b) {
      b.onclick = function () { scene.choices.splice(ciOf(this), 1); renderChoicesEditor(scene, adv); };
    });
    box.querySelectorAll('.ch-up').forEach(function (b) {
      b.onclick = function () {
        const i = ciOf(this);
        if (i > 0) { const c = scene.choices.splice(i, 1)[0]; scene.choices.splice(i - 1, 0, c); renderChoicesEditor(scene, adv); }
      };
    });
    box.querySelectorAll('.ch-down').forEach(function (b) {
      b.onclick = function () {
        const i = ciOf(this);
        if (i < scene.choices.length - 1) { const c = scene.choices.splice(i, 1)[0]; scene.choices.splice(i + 1, 0, c); renderChoicesEditor(scene, adv); }
      };
    });
    const addBtn = document.getElementById('sm-add-choice');
    if (addBtn) addBtn.onclick = function () {
      scene.choices.push({ id: Store.uid(), label: '', targetSceneId: null, description: '', choiceType: 'neutre' });
      renderChoicesEditor(scene, adv);
    };
  }

  // Garantit la présence de zones (migration de l'ancien format monsterRefs plat)
  function ensureZones(scene) {
    if (Array.isArray(scene.combatZones) && scene.combatZones.length) return;
    const refs = (scene.monsterRefs || []).filter(function (r) { return r.monsterId; });
    scene.combatZones = [
      { name: 'Zone des aventuriers', monsterRefs: [], heroStart: true },
      { name: 'Adversaires', heroStart: false,
        monsterRefs: refs.map(function (r) { return { monsterId: r.monsterId, count: r.count || 1 }; }) },
    ];
    save(); // persiste la migration
  }

  // Barrières entre zones : objet clé « min-max » (toutes les paires possibles,
  // ex. 0-3 pour la barrière 1–4 d'une disposition à 4 zones).
  const BARRIER_TYPES = [
    { key: 'none', label: 'Aucune barrière' },
    { key: 'infranchissable', label: 'Infranchissable (tir possible)' },
    { key: 'difficile', label: 'Difficile (test d\'Agilité)' },
    { key: 'mur', label: 'Mur (ni déplacement ni tir)' },
  ];
  function barrierKeyOf(a, b) { const lo = Math.min(a, b), hi = Math.max(a, b); return lo + '-' + hi; }
  function ensureBarriers(scene) {
    const n = (scene.combatZones || []).length;
    // Migration depuis l'ancien tableau linéaire (barriers[i] = zones i / i+1).
    if (Array.isArray(scene.barriers)) {
      const obj = {};
      scene.barriers.forEach(function (b, i) {
        if (b && b.type && b.type !== 'none') {
          obj[i + '-' + (i + 1)] = { type: b.type === 'obstruante' ? 'mur' : b.type, difficulty: b.difficulty || 'moyen' };
        }
      });
      scene.barriers = obj;
    }
    if (!scene.barriers || typeof scene.barriers !== 'object') scene.barriers = {};
    // Renomme obstruante → mur et purge les paires devenues hors limites.
    Object.keys(scene.barriers).forEach(function (k) {
      const parts = k.split('-').map(Number);
      if (parts.length !== 2 || parts[0] >= n || parts[1] >= n || parts[0] < 0) { delete scene.barriers[k]; return; }
      const b = scene.barriers[k];
      if (b && b.type === 'obstruante') b.type = 'mur';
    });
  }
  function renderMonsterRefs(scene, monsters) {
    ensureZones(scene);
    ensureBarriers(scene);
    const box = document.getElementById('sm-monster-refs');
    const zones = scene.combatZones;
    function barrierRowFor(a, b) {
      const key = barrierKeyOf(a, b);
      const bar = scene.barriers[key] || { type: 'none', difficulty: 'moyen' };
      const typeOpts = BARRIER_TYPES.map(function (t) {
        return '<option value="' + t.key + '"' + (bar.type === t.key ? ' selected' : '') + '>' + esc(t.label) + '</option>';
      }).join('');
      const diffOpts = [['facile', 'Facile'], ['moyen', 'Moyen'], ['difficile', 'Difficile']].map(function (d) {
        return '<option value="' + d[0] + '"' + ((bar.difficulty || 'moyen') === d[0] ? ' selected' : '') + '>' + d[1] + '</option>';
      }).join('');
      const named = bar.type && bar.type !== 'none';
      return '<div class="adv-barrier" data-bkey="' + key + '">' +
        '<span class="adv-barrier-lbl">⛓ Zone ' + (Math.min(a, b) + 1) + ' – Zone ' + (Math.max(a, b) + 1) + '</span>' +
        '<select class="barrier-type">' + typeOpts + '</select>' +
        '<select class="barrier-diff"' + (bar.type === 'difficile' ? '' : ' style="display:none"') + '>' + diffOpts + '</select>' +
        '<input type="text" class="barrier-name" maxlength="24" placeholder="Nom (mur, palissade, ravin…)" ' +
          'value="' + esc(bar.name || '') + '"' + (named ? '' : ' style="display:none"') + ' />' +
      '</div>';
    }
    box.innerHTML = zones.map(function (z, zi) {
      const rows = (z.monsterRefs || []).map(function (ref, mi) {
        const monOpts = monsters.map(function (m) {
          return '<option value="' + m.id + '"' + (m.id === ref.monsterId ? ' selected' : '') + '>' + esc(m.name) + '</option>';
        }).join('');
        return '<div class="adv-ref-row" data-zi="' + zi + '" data-mi="' + mi + '">' +
          '<select class="ref-mon"><option value="">(choisir)</option>' + monOpts + '</select>' +
          '<input type="number" class="ref-count" value="' + (ref.count || 1) + '" min="1" style="width:55px" />' +
          '<button type="button" class="icon-btn ref-del">✕</button>' +
        '</div>';
      }).join('');
      const zoneHtml = '<div class="adv-zone" data-zi="' + zi + '">' +
        '<div class="adv-zone-head">' +
          '<input type="text" class="zone-name-input" value="' + esc(z.name || ('Zone ' + (zi + 1))) + '" placeholder="Nom de la zone" />' +
          '<label class="zone-start"><input type="radio" name="adv-hero-zone"' + (z.heroStart ? ' checked' : '') + '> Départ des aventuriers</label>' +
          (zones.length > 1 ? '<button type="button" class="icon-btn zone-del" title="Supprimer la zone">✕</button>' : '') +
        '</div>' +
        rows +
        '<button type="button" class="ghost small zone-add-mon">+ Monstre</button>' +
      '</div>';
      return zoneHtml;
    }).join('') +
    (function () {
      // Toutes les paires de zones (1-2, 1-3, 1-4, 2-3, …) sont configurables.
      if (zones.length < 2) return '';
      let rows = '';
      for (let a = 0; a < zones.length; a++) for (let b = a + 1; b < zones.length; b++) rows += barrierRowFor(a, b);
      return '<div class="adv-barriers-box"><div class="adv-barriers-title">⛓ Barrières entre zones</div>' + rows + '</div>';
    })() +
    (zones.length < 4 ? '<button type="button" class="ghost small" id="sm-add-zone">+ Zone</button>' : '');

    box.querySelectorAll('.adv-barrier').forEach(function (bEl) {
      const key = bEl.getAttribute('data-bkey');
      const typeSel = bEl.querySelector('.barrier-type');
      const diffSel = bEl.querySelector('.barrier-diff');
      const nameInp = bEl.querySelector('.barrier-name');
      typeSel.onchange = function () {
        if (this.value === 'none') { delete scene.barriers[key]; }
        else {
          const prev = scene.barriers[key] || {};
          scene.barriers[key] = { type: this.value, difficulty: prev.difficulty || 'moyen', name: prev.name || '' };
        }
        diffSel.style.display = this.value === 'difficile' ? '' : 'none';
        if (nameInp) nameInp.style.display = (this.value === 'none') ? 'none' : '';
        save();
      };
      diffSel.onchange = function () { if (scene.barriers[key]) { scene.barriers[key].difficulty = this.value; save(); } };
      if (nameInp) nameInp.oninput = function () { if (scene.barriers[key]) { scene.barriers[key].name = this.value; save(); } };
    });

    function refresh() { save(); renderMonsterRefs(scene, Store.state.monsters); }

    box.querySelectorAll('.adv-zone').forEach(function (zEl) {
      const zi = parseInt(zEl.getAttribute('data-zi'), 10);
      const z = zones[zi];
      zEl.querySelector('.zone-name-input').oninput = function () { z.name = this.value; save(); };
      const radio = zEl.querySelector('input[type="radio"]');
      radio.onchange = function () { if (this.checked) { zones.forEach(function (zz, k) { zz.heroStart = (k === zi); }); save(); } };
      const del = zEl.querySelector('.zone-del');
      if (del) del.onclick = function () {
        zones.splice(zi, 1);
        if (!zones.some(function (zz) { return zz.heroStart; }) && zones.length) zones[0].heroStart = true;
        refresh();
      };
      zEl.querySelector('.zone-add-mon').onclick = function () {
        z.monsterRefs.push({ monsterId: '', count: 1 }); refresh();
      };
      zEl.querySelectorAll('.ref-mon').forEach(function (sel, mi) {
        sel.onchange = function () { z.monsterRefs[mi].monsterId = this.value; save(); };
      });
      zEl.querySelectorAll('.ref-count').forEach(function (inp, mi) {
        inp.oninput = function () { z.monsterRefs[mi].count = Math.max(1, parseInt(this.value, 10) || 1); save(); };
      });
      zEl.querySelectorAll('.ref-del').forEach(function (b, mi) {
        b.onclick = function () { z.monsterRefs.splice(mi, 1); refresh(); };
      });
    });
    const addZone = document.getElementById('sm-add-zone');
    if (addZone) addZone.onclick = function () {
      zones.push({ name: 'Zone ' + (zones.length + 1), monsterRefs: [], heroStart: false });
      refresh();
    };
  }

  // Type d'un objet (pour le filtre des récompenses) : arme / arme à distance / armure / objet.
  const REWARD_TYPES = [
    { key: 'weapon', label: 'Arme' },
    { key: 'ranged', label: 'Arme à distance' },
    { key: 'armor',  label: 'Armure' },
    { key: 'object', label: 'Objet' },
  ];
  function itemRewardType(it) {
    if (!it) return 'weapon';
    if (it.category === 'weapon') return it.ranged ? 'ranged' : 'weapon';
    if (it.category === 'armor') return 'armor';
    return 'object';
  }
  function itemsOfType(items, type) {
    return items.filter(function (it) { return itemRewardType(it) === type; });
  }

  function renderItemRewards(scene, items) {
    const box = document.getElementById('sm-item-rewards');
    box.innerHTML = (scene.itemRewards || []).map(function (ref, i) {
      const cur = ref.itemId ? items.find(function (x) { return x.id === ref.itemId; }) : null;
      const type = ref.type || (cur ? itemRewardType(cur) : 'weapon');
      const typeOpts = REWARD_TYPES.map(function (t) {
        return '<option value="' + t.key + '"' + (t.key === type ? ' selected' : '') + '>' + esc(t.label) + '</option>';
      }).join('');
      const itemOpts = itemsOfType(items, type).map(function (it) {
        return '<option value="' + it.id + '"' + (it.id === ref.itemId ? ' selected' : '') + '>' + esc(it.name) + '</option>';
      }).join('');
      return '<div class="adv-ref-row">' +
        '<select class="ir-type">' + typeOpts + '</select>' +
        '<select class="ir-item"><option value="">(choisir)</option>' + itemOpts + '</select>' +
        '<input type="number" class="ir-qty" value="' + (ref.qty || 1) + '" min="1" style="width:55px" />' +
        '<button type="button" class="icon-btn ir-del">✕</button>' +
      '</div>';
    }).join('') +
    '<button type="button" class="ghost small" id="sm-add-ir">+ Objet</button>';

    box.querySelectorAll('.ir-type').forEach(function (sel, i) {
      sel.onchange = function () {
        scene.itemRewards[i].type = this.value;
        scene.itemRewards[i].itemId = ''; // change de type → réinitialise l'objet choisi
        renderItemRewards(scene, Store.state.items);
      };
    });
    box.querySelectorAll('.ir-item').forEach(function (sel, i) {
      sel.onchange = function () { scene.itemRewards[i].itemId = this.value; };
    });
    box.querySelectorAll('.ir-qty').forEach(function (inp, i) {
      inp.oninput = function () { scene.itemRewards[i].qty = Math.max(1, parseInt(this.value, 10) || 1); };
    });
    box.querySelectorAll('.ir-del').forEach(function (b, i) {
      b.onclick = function () { scene.itemRewards.splice(i, 1); renderItemRewards(scene, Store.state.items); };
    });
    const addBtn = document.getElementById('sm-add-ir');
    if (addBtn) addBtn.onclick = function () {
      scene.itemRewards.push({ itemId: '', qty: 1, type: 'weapon' });
      renderItemRewards(scene, Store.state.items);
    };
  }

  function init() { render(); }

  global.Adventure = { init: init, render: render };
})(window);
