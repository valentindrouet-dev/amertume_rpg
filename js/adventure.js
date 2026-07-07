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
    { value: 'danger',       label: 'Danger'       },
    { value: 'repos',        label: 'Repos'        },
    { value: 'commerce',     label: 'Commerce'     },
    { value: 'boss',         label: 'Boss'         },
    { value: 'temps',        label: 'Temps'        },
    { value: 'vide',         label: 'Vide'         },
    { value: 'fin',          label: 'Fin'          },
  ];

  // ---------- Données ----------
  let adventures = [];
  let sagas = [];        // Grandes Aventures : { id, title, adventureIds:[] }
  let homeOrder = [];    // ordre d'accueil : [{ type:'saga'|'adv', id }]
  let collapsedChapters = {}; // { chapterId: true } — état enroulé dans l'éditeur
  const SKILLS = ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'];
  // Niveaux de difficulté des tests (nombre de réussites requises).
  const DIFF_LEVELS = [['auto', 'Automatique (0)'], ['facile', 'Facile (1)'], ['moyen', 'Moyen (2)'], ['difficile', 'Difficile (3)'], ['tresdifficile', 'Très Difficile (4)'], ['insurmontable', 'Insurmontable (5)'], ['impossible', 'Impossible (6)']];

  const BLOCK_TYPES = [
    { value: 'narrative', label: 'Narratif (italique)' },
    { value: 'technical', label: 'Technique (normal)'  },
    { value: 'alert',     label: 'Alerte (gras)'       },
    { value: 'tip',       label: 'Conseil (encadré)'   },
    // Visible UNIQUEMENT tant que le combat de la scène n'est pas résolu :
    // une fois la salle nettoyée, ce bloc disparaît (utile en donjon).
    { value: 'combat',    label: '⚔ Combat (avant le combat uniquement)' },
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
        if (s.isTransition) return;         // scènes d'événement de passage : hors navigation
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
  // Recense tous les noms d'Objets Rares ajoutés en récompense (kind: 'rare') dans
  // l'aventure — au niveau des scènes ET des blocs de test/action. Sert au champ
  // « Objet Rare » des blocs (résolution automatique d'un test si le groupe le possède).
  function adventureRareNames(adv) {
    const names = [];
    const scan = function (list) {
      (list || []).forEach(function (r) {
        if (r && r.kind === 'rare' && r.name && r.name.trim() && names.indexOf(r.name.trim()) < 0) {
          names.push(r.name.trim());
        }
      });
    };
    (adv.chapters || []).forEach(function (c) {
      (c.scenes || []).forEach(function (s) {
        scan(s.treasureRewards);
        (s.blocks || []).forEach(function (b) { scan(b.treasureRewards); });
      });
    });
    names.sort();
    return names;
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

  // Réordonne les chapitres d'une aventure (dir = -1 monter, +1 descendre).
  function moveChapter(a, chId, dir) {
    const i = a.chapters.findIndex(function (c) { return c.id === chId; });
    const j = i + dir;
    if (i < 0 || j < 0 || j >= a.chapters.length) return;
    const tmp = a.chapters[i]; a.chapters[i] = a.chapters[j]; a.chapters[j] = tmp;
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
    // Passages débloqués par un test de compétence réussi (blocs de test).
    (scene.blocks || []).forEach(function (b) {
      if (b.type === 'test' && b.targetSceneId) links.push({ label: '🔍 test ✓', targetId: b.targetSceneId });
    });
    // Compat. ancien champ searchTest (avant migration en bloc).
    if (scene.searchTest && scene.searchTest.enabled && scene.searchTest.targetSceneId) {
      links.push({ label: '🔍 fouille ✓', targetId: scene.searchTest.targetSceneId });
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
    const n = adventures.length;
    box.innerHTML = adventures.map(function (a, i) {
      const chCount = a.chapters.length;
      const scCount = a.chapters.reduce(function (n, ch) { return n + ch.scenes.length; }, 0);
      return '<div class="adv-card roster-card">' +
        '<div class="roster-head">' +
          '<span class="org-arrows">' +
            '<button class="icon-btn adv-up" data-id="' + a.id + '"' + (i === 0 ? ' disabled' : '') + ' title="Monter">↑</button>' +
            '<button class="icon-btn adv-down" data-id="' + a.id + '"' + (i === n - 1 ? ' disabled' : '') + ' title="Descendre">↓</button>' +
          '</span>' +
          '<span class="roster-name">' + esc(a.title) + '</span>' +
          '<span class="tag">' + chCount + ' ch. · ' + scCount + ' sc.</span>' +
          '<button class="ghost small adv-edit" data-id="' + a.id + '">Éditer</button>' +
          '<button class="ghost small adv-dup" data-id="' + a.id + '" title="Dupliquer cette aventure">⧉ Dupliquer</button>' +
          '<button class="icon-btn adv-del" data-id="' + a.id + '" title="Supprimer">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.adv-edit').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(b.getAttribute('data-id')); });
    });
    box.querySelectorAll('.adv-dup').forEach(function (b) {
      b.addEventListener('click', function () { duplicateAdventure(b.getAttribute('data-id')); });
    });
    box.querySelectorAll('.adv-up').forEach(function (b) {
      b.addEventListener('click', function () { moveAdventure(b.getAttribute('data-id'), -1); });
    });
    box.querySelectorAll('.adv-down').forEach(function (b) {
      b.addEventListener('click', function () { moveAdventure(b.getAttribute('data-id'), 1); });
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

  // Réordonne la liste des aventures éditables (dir = -1 monter, +1 descendre).
  function moveAdventure(id, dir) {
    const i = adventures.findIndex(function (a) { return a.id === id; });
    const j = i + dir;
    if (i < 0 || j < 0 || j >= adventures.length) return;
    const tmp = adventures[i]; adventures[i] = adventures[j]; adventures[j] = tmp;
    save(); renderList();
  }

  // Duplique une aventure entière (nouveaux identifiants pour l'aventure, ses
  // chapitres, scènes, blocs, choix et connecteurs de donjon), insérée juste après.
  function duplicateAdventure(id) {
    const idx = adventures.findIndex(function (a) { return a.id === id; });
    if (idx < 0) return;
    const copy = JSON.parse(JSON.stringify(adventures[idx]));
    copy.id = Store.uid();
    copy.title = incrementSceneTitle(adventures[idx].title || 'Aventure');
    (copy.chapters || []).forEach(function (ch) {
      const map = {};      // ancien id de scène → nouvel id (pour recâbler les liens internes)
      const blockMap = {}; // ancien id de bloc → nouvel id (chaînes de tests, révélation de connecteurs)
      ch.id = Store.uid();
      (ch.scenes || []).forEach(function (s) {
        const nid = Store.uid(); map[s.id] = nid; s.id = nid;
        if (Array.isArray(s.blocks)) {
          // Nouveaux ids de blocs, en préservant les chaînes de tests internes.
          s.blocks.forEach(function (b) { const nb = Store.uid(); blockMap[b.id] = nb; b.id = nb; });
          s.blocks.forEach(function (b) {
            if (b.chainSuccessId && blockMap[b.chainSuccessId]) b.chainSuccessId = blockMap[b.chainSuccessId];
            if (b.chainFailId && blockMap[b.chainFailId]) b.chainFailId = blockMap[b.chainFailId];
          });
        }
        if (Array.isArray(s.choices)) s.choices.forEach(function (c) { c.id = Store.uid(); });
      });
      // Recâble les cibles de navigation (choix, suite, combat) sur les nouveaux ids.
      (ch.scenes || []).forEach(function (s) {
        if (s.nextSceneId && map[s.nextSceneId]) s.nextSceneId = map[s.nextSceneId];
        if (s.outcomeSceneId && map[s.outcomeSceneId]) s.outcomeSceneId = map[s.outcomeSceneId];
        if (s.defeatSceneId && map[s.defeatSceneId]) s.defeatSceneId = map[s.defeatSceneId];
        (s.choices || []).forEach(function (c) {
          if (c.targetSceneId && map[c.targetSceneId]) c.targetSceneId = map[c.targetSceneId];
          if (c.successSceneId && map[c.successSceneId]) c.successSceneId = map[c.successSceneId];
          if (c.failSceneId && map[c.failSceneId]) c.failSceneId = map[c.failSceneId];
        });
        (s.blocks || []).forEach(function (bl) {
          if (bl.type === 'test' && bl.targetSceneId && map[bl.targetSceneId]) bl.targetSceneId = map[bl.targetSceneId];
        });
        if (s.searchTest && s.searchTest.targetSceneId && map[s.searchTest.targetSceneId]) {
          s.searchTest.targetSceneId = map[s.searchTest.targetSceneId];
        }
      });
      // Recâble l'entrée et les connecteurs d'un donjon structuré.
      if (ch.entryId && map[ch.entryId]) ch.entryId = map[ch.entryId];
      if (Array.isArray(ch.links)) ch.links.forEach(function (l) {
        l.id = Store.uid();
        if (map[l.from]) l.from = map[l.from];
        if (map[l.to]) l.to = map[l.to];
        if (l.eventSceneId && map[l.eventSceneId]) l.eventSceneId = map[l.eventSceneId];
        if (l.revealTestId && blockMap[l.revealTestId]) l.revealTestId = blockMap[l.revealTestId];
      });
      // Recâble les événements de passage d'un donjon aléatoire.
      if (Array.isArray(ch.transitionEvents)) ch.transitionEvents.forEach(function (e) {
        e.id = Store.uid();
        if (e.sceneId && map[e.sceneId]) e.sceneId = map[e.sceneId];
      });
    });
    adventures.splice(idx + 1, 0, copy);
    save(); renderList();
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
              ? '<p class="hint dmap-hint">🎲 L\'ordre des salles est tiré au sort à chaque partie : Entrée(s) d\'abord, salles aléatoires mélangées, Sortie(s) à la fin.</p>' +
                '<div class="adv-randev" id="randev-' + ch.id + '"></div>'
              : '') +
            '<button class="ghost small adv-add-scene" data-ch="' + ch.id + '" style="margin:.4rem 0 .8rem">' +
              (mode === 'random' ? '+ Salle' : '+ Scène') + '</button>';
        }
      }
      return '<div class="adv-chapter adv-chapter-' + mode + (collapsed ? ' collapsed' : '') + '" data-ch="' + ch.id + '">' +
        '<div class="adv-ch-head">' +
          '<button type="button" class="icon-btn adv-ch-toggle" data-ch="' + ch.id + '" title="' + (collapsed ? 'Dérouler' : 'Enrouler') + '">' + (collapsed ? '▸' : '▾') + '</button>' +
          '<span class="org-arrows">' +
            '<button type="button" class="icon-btn adv-ch-up" data-ch="' + ch.id + '"' + (ci === 0 ? ' disabled' : '') + ' title="Monter le chapitre">↑</button>' +
            '<button type="button" class="icon-btn adv-ch-down" data-ch="' + ch.id + '"' + (ci === a.chapters.length - 1 ? ' disabled' : '') + ' title="Descendre le chapitre">↓</button>' +
          '</span>' +
          '<span class="adv-ch-num">Chapitre ' + (ci + 1) + '</span>' +
          '<input type="text" class="adv-ch-title" data-ch="' + ch.id + '" value="' + esc(ch.title) + '" placeholder="Titre du chapitre" />' +
          '<select class="adv-ch-mode" data-ch="' + ch.id + '" title="Type de chapitre">' + modeOpts + '</select>' +
          (collapsed ? '<span class="adv-ch-count">' + ch.scenes.length + ' ' + (mode === 'linear' ? 'scène(s)' : 'salle(s)') + '</span>' : '') +
          '<button class="icon-btn adv-del-ch" data-ch="' + ch.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        body +
      '</div>';
    }).join('');

    box.querySelectorAll('.adv-ch-up').forEach(function (b) {
      b.addEventListener('click', function () { moveChapter(a, b.getAttribute('data-ch'), -1); });
    });
    box.querySelectorAll('.adv-ch-down').forEach(function (b) {
      b.addEventListener('click', function () { moveChapter(a, b.getAttribute('data-ch'), 1); });
    });
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
      if (!collapsedChapters[ch.id] && chMode(ch) === 'random') renderRandomEventsEditor(a, ch);
    });
  }

  // ---- Donjon aléatoire : événements de passage (entre les salles) ----
  // Chaque événement est une scène complète (même éditeur), déclenchée UNE fois
  // au cours de la partie, sur une transition tirée au hasard entre deux salles.
  function renderRandomEventsEditor(a, ch) {
    const box = document.getElementById('randev-' + ch.id);
    if (!box) return;
    if (!Array.isArray(ch.transitionEvents)) ch.transitionEvents = [];
    // Purge les entrées orphelines (scène supprimée).
    ch.transitionEvents = ch.transitionEvents.filter(function (e) {
      return e && ch.scenes.some(function (s) { return s.id === e.sceneId; });
    });
    const rows = ch.transitionEvents.length
      ? ch.transitionEvents.map(function (e, i) {
          const s = ch.scenes.find(function (x) { return x.id === e.sceneId; });
          return '<div class="randev-row" data-i="' + i + '">' +
            '<span class="randev-name">⚡ ' + esc(s && s.title ? s.title : '(événement)') + '</span>' +
            '<button type="button" class="ghost small randev-edit">Éditer</button>' +
            '<button type="button" class="icon-btn randev-del" title="Supprimer cet événement">✕</button>' +
          '</div>';
        }).join('')
      : '<p class="hint">Aucun événement de passage.</p>';
    box.innerHTML = '<div class="dmap-links-title">⚡ Événements de passage (entre les salles)</div>' +
      '<p class="hint">Chaque événement (combat, test, texte…) se déclenche <b>une fois par partie</b>, sur une transition entre deux salles tirée au hasard.</p>' +
      rows +
      '<button type="button" class="ghost small randev-add">+ ⚡ Événement de passage</button>';
    box.querySelector('.randev-add').onclick = function () {
      const ns = newScene();
      ns.isTransition = true;
      ns.title = 'Événement de passage';
      ch.scenes.push(ns);
      ch.transitionEvents.push({ id: Store.uid(), sceneId: ns.id });
      save();
      openSceneModal(a, ch.id, ns.id);
    };
    box.querySelectorAll('.randev-edit').forEach(function (b) {
      b.onclick = function () {
        const i = +b.closest('.randev-row').getAttribute('data-i');
        const e = ch.transitionEvents[i];
        if (e) openSceneModal(a, ch.id, e.sceneId);
      };
    });
    box.querySelectorAll('.randev-del').forEach(function (b) {
      b.onclick = function () {
        const i = +b.closest('.randev-row').getAttribute('data-i');
        const e = ch.transitionEvents[i];
        if (!e || !confirm('Supprimer cet événement de passage ?')) return;
        ch.scenes = ch.scenes.filter(function (s) { return s.id !== e.sceneId; });
        ch.transitionEvents.splice(i, 1);
        save(); renderRandomEventsEditor(a, ch);
      };
    });
  }

  function renderScenesHTML(ch, adv) {
    // Les scènes d'événement de passage (connecteurs) ne sont pas des salles :
    // elles s'éditent depuis la liste des connecteurs / événements de passage.
    const rooms = ch.scenes.filter(function (s) { return !s.isTransition; });
    if (!rooms.length) return '<p class="empty" style="padding:.3rem 0">Aucune scène.</p>';
    const titles = sceneTitleMap(adv);
    const isRandom = chMode(ch) === 'random';
    return rooms.map(function (s, si) {
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
      const last = si === rooms.length - 1;
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
    // L'entrée du donjon est forcément une vraie salle (pas un événement de passage).
    const roomsOnly = ch.scenes.filter(function (s) { return !s.isTransition; });
    if (!ch.entryId || !roomsOnly.some(function (s) { return s.id === ch.entryId; })) {
      ch.entryId = roomsOnly.length ? roomsOnly[0].id : null;
    }
    // Positionne les salles sans coordonnées (ou en double) sur des cellules libres.
    // (Les scènes d'événement de passage n'occupent pas de cellule.)
    const used = {};
    roomsOnly.forEach(function (s) {
      const ok = typeof s.mapX === 'number' && typeof s.mapY === 'number' && s.mapX >= 0 && s.mapY >= 0;
      if (ok && !used[s.mapX + ',' + s.mapY]) { used[s.mapX + ',' + s.mapY] = true; }
      else { s.mapX = null; s.mapY = null; }
    });
    let cursor = 0;
    roomsOnly.forEach(function (s) {
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

  // Flèche directionnelle entre deux salles selon leur position sur la carte
  // (8 directions) : si la salle d'arrivée est SOUS celle de départ → ⬇, etc.
  const DIR_ARROWS = ['➡', '↘', '⬇', '↙', '⬅', '↖', '⬆', '↗'];
  function dmapDirArrow(fromScene, toScene) {
    if (!fromScene || !toScene ||
        typeof fromScene.mapX !== 'number' || typeof toScene.mapX !== 'number') return '⟷';
    const dx = toScene.mapX - fromScene.mapX, dy = toScene.mapY - fromScene.mapY;
    if (!dx && !dy) return '⟷';
    let idx = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    idx = ((idx % 8) + 8) % 8;
    return DIR_ARROWS[idx];
  }

  // Nature de l'événement d'un connecteur : 'combat' si sa scène contient des
  // adversaires, 'test' si elle contient des blocs de test, 'event' sinon
  // (texte seul), null si aucun événement. Sert à colorer le trait sur la carte.
  function linkEventKind(ch, l) {
    if (!l || !l.eventSceneId) return null;
    const s = ch.scenes.find(function (x) { return x.id === l.eventSceneId; });
    if (!s) return null;
    const hasCombat = (s.combatZones || []).some(function (z) {
      return (z.monsterRefs || []).some(function (r) { return r.monsterId; });
    });
    if (hasCombat) return 'combat';
    if ((s.blocks || []).some(function (b) { return b.type === 'test'; })) return 'test';
    return 'event';
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
    // Le trait prend la couleur du contenu de l'événement (combat / test /
    // événement) ; sans événement, la couleur habituelle est conservée.
    const lines = ch.links.map(function (l) {
      const f = byId[l.from], t = byId[l.to];
      if (!f || !t) return '';
      const mx = (cx(f) + cx(t)) / 2, my = (cy(f) + cy(t)) / 2;
      const kind = linkEventKind(ch, l);
      return '<line x1="' + cx(f) + '" y1="' + cy(f) + '" x2="' + cx(t) + '" y2="' + cy(t) + '" class="dmap-line' + (kind ? ' dmap-line-' + kind : '') + '"></line>' +
        (l.label ? '<text x="' + mx + '" y="' + (my - 5) + '" class="dmap-line-lbl" text-anchor="middle">' + esc(l.label) + '</text>' : '');
    }).join('');

    const rooms = ch.scenes.filter(function (s) { return !s.isTransition; }).map(function (s) {
      const isEntry = ch.entryId === s.id;
      const typeLabel = (SCENE_TYPES.find(function (t) { return t.value === s.type; }) || {}).label || s.type;
      const nLinks = ch.links.filter(function (l) { return l.from === s.id || l.to === s.id; }).length;
      const isDone = !!s.mapDone;
      return '<div class="dmap-room type-' + s.type + (isEntry ? ' dmap-entry' : '') + (isDone ? ' dmap-done' : '') + '" data-scene="' + s.id + '"' +
        ' style="left:' + (s.mapX * DMAP_CELL_W + DMAP_PAD) + 'px;top:' + (s.mapY * DMAP_CELL_H + DMAP_PAD) + 'px">' +
        '<div class="dmap-room-head">' +
          (isEntry ? '<span class="dmap-entry-badge" title="Entrée du donjon">🚪</span>' : '') +
          (isDone ? '<span class="dmap-done-badge" title="Salle terminée">✅</span>' : '') +
          '<span class="dmap-room-title">' + esc(s.title || '(sans titre)') + '</span>' +
        '</div>' +
        '<span class="adv-scene-type type-' + s.type + '">' + esc(typeLabel) + '</span>' +
        (nLinks ? '<span class="dmap-room-links" title="Connecteurs">' + nLinks + ' ⟷</span>' : '') +
        '<div class="dmap-room-tools">' +
          '<button type="button" class="icon-btn dmap-done-btn' + (isDone ? ' on' : '') + '" data-scene="' + s.id + '" title="' + (isDone ? 'Salle terminée — décocher' : 'Marquer la salle comme terminée') + '">✅</button>' +
          '<button type="button" class="icon-btn dmap-link-btn" data-scene="' + s.id + '" title="Tracer un connecteur vers une autre salle">🔗</button>' +
          '<button type="button" class="icon-btn dmap-entry-btn" data-scene="' + s.id + '" title="Définir comme entrée du donjon">🚪</button>' +
          '<button type="button" class="icon-btn dmap-del-btn" data-scene="' + s.id + '" title="Supprimer la salle">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    const linkRows = ch.links.length ? ch.links.map(function (l, i) {
      // La flèche suit la direction du connecteur sur la carte (salle d'arrivée
      // placée sous la salle de départ → ⬇, à droite → ➡, etc.).
      const arrow = dmapDirArrow(byId[l.from], byId[l.to]);
      // Événement de passage : une scène complète (combat, tests, texte…) qui se
      // déclenche quand les aventuriers empruntent ce connecteur.
      const hasEvent = !!(l.eventSceneId && byId[l.eventSceneId]);
      const kind = linkEventKind(ch, l);
      const kindBadge = kind ? '<span class="dmap-evkind dmap-evkind-' + kind + '">' +
        (kind === 'combat' ? '⚔ Combat' : kind === 'test' ? '🎲 Test' : '⚡ Événement') + '</span>' : '';
      // Les contrôles d'événement sont regroupés dans un bloc insécable pour
      // rester lisibles (plus de chevauchement de la coche et des boutons).
      const eventCtrls = '<span class="dmap-link-ev">' + kindBadge + (hasEvent
        ? '<button type="button" class="ghost small dmap-link-event" title="Éditer la scène d\'événement de ce passage">⚡ Éditer</button>' +
          // Bascule compacte « une fois / à chaque passage » : seule l'icône 🔁,
          // mise en évidence quand elle est active (plus de coche illisible).
          '<button type="button" class="dmap-repeat-toggle' + (l.eventRepeat ? ' on' : '') + '" ' +
            'title="' + (l.eventRepeat ? 'Se déclenche À CHAQUE passage (cliquer : une seule fois)' : 'Se déclenche une seule fois (cliquer : à chaque passage)') + '">🔁</button>' +
          '<button type="button" class="icon-btn dmap-link-event-del" title="Supprimer l\'événement de ce passage">⚡✕</button>'
        : '<button type="button" class="ghost small dmap-link-event" title="Ajouter un événement (combat, test, texte…) déclenché en empruntant ce passage">+ ⚡ Événement</button>') +
      '</span>';
      return '<div class="dmap-link-row" data-i="' + i + '">' +
        '<span class="dmap-link-ends">' + esc(titleOf(l.from)) + ' <span class="dmap-dir">' + arrow + '</span> ' + esc(titleOf(l.to)) +
          (l.revealTestId ? ' <span class="dmap-link-secret" title="Passage secret : visible après la réussite d\'un test">🫥</span>' : '') + '</span>' +
        '<input type="text" class="dmap-link-label" maxlength="60" placeholder="Description du passage (porte, couloir, escalier, passage secret…)" value="' + esc(l.label || '') + '" />' +
        eventCtrls +
        '<button type="button" class="icon-btn dmap-link-del" title="Supprimer le connecteur">✕</button>' +
      '</div>';
    }).join('') : '<p class="hint">Aucun connecteur. Clique 🔗 sur une salle puis sur la salle d\'arrivée.</p>';

    const linking = dmapLinking && dmapLinking.chId === ch.id;
    box.innerHTML =
      '<p class="hint">Chaque cartouche est une <b>salle</b> (scène). Glisse les cartouches pour dessiner la carte, ' +
        'clique une salle pour l\'éditer, <b>🔗</b> pour tracer un connecteur (re-tracer le même = le supprimer), ' +
        '<b>🚪</b> pour définir l\'entrée du donjon.</p>' +
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
    box.querySelectorAll('.dmap-done-btn').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        // Coche « organisation » : sans effet de jeu, juste un repère visuel
        // pour marquer qu'on a terminé de bâtir/nettoyer une salle.
        const sid = b.getAttribute('data-scene');
        const s = ch.scenes.find(function (x) { return x.id === sid; });
        if (s) { s.mapDone = !s.mapDone; save(); renderDungeonEditor(a, ch); }
      };
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
        // Supprime la salle, ses connecteurs ET les scènes d'événement de ces connecteurs.
        const evIds = ch.links.filter(function (l) { return (l.from === sid || l.to === sid) && l.eventSceneId; })
          .map(function (l) { return l.eventSceneId; });
        ch.scenes = ch.scenes.filter(function (s) { return s.id !== sid && evIds.indexOf(s.id) < 0; });
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
        // Supprime aussi la scène d'événement rattachée à ce connecteur.
        const ev = ch.links[i] && ch.links[i].eventSceneId;
        if (ev) ch.scenes = ch.scenes.filter(function (s) { return s.id !== ev; });
        ch.links.splice(i, 1);
        save(); renderDungeonEditor(a, ch);
      };
    });
    // Événement de passage : créer/éditer (même éditeur de scène que partout),
    // basculer « à chaque passage », supprimer.
    box.querySelectorAll('.dmap-link-event').forEach(function (b) {
      b.onclick = function () {
        const i = +b.closest('.dmap-link-row').getAttribute('data-i');
        const l = ch.links[i];
        if (!l) return;
        if (!l.eventSceneId || !ch.scenes.some(function (s) { return s.id === l.eventSceneId; })) {
          const ns = newScene();
          ns.isTransition = true;
          ns.title = 'Passage : ' + titleOf(l.from) + ' ⟷ ' + titleOf(l.to);
          ch.scenes.push(ns);
          l.eventSceneId = ns.id;
          save();
        }
        openSceneModal(a, ch.id, l.eventSceneId);
      };
    });
    box.querySelectorAll('.dmap-repeat-toggle').forEach(function (btn) {
      btn.onclick = function () {
        const i = +btn.closest('.dmap-link-row').getAttribute('data-i');
        if (ch.links[i]) { ch.links[i].eventRepeat = !ch.links[i].eventRepeat; save(); renderDungeonEditor(a, ch); }
      };
    });
    box.querySelectorAll('.dmap-link-event-del').forEach(function (b) {
      b.onclick = function () {
        const i = +b.closest('.dmap-link-row').getAttribute('data-i');
        const l = ch.links[i];
        if (!l || !confirm('Supprimer l\'événement de ce passage ?')) return;
        ch.scenes = ch.scenes.filter(function (s) { return s.id !== l.eventSceneId; });
        l.eventSceneId = null; l.eventRepeat = false;
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
        // Si un connecteur existe déjà entre ces deux salles, il est SUPPRIMÉ
        // (re-tracer un lien = le défaire).
        if (dmapLinking && dmapLinking.chId === ch.id) {
          const from = dmapLinking.from;
          dmapLinking = null;
          if (from && from !== sid) {
            const existing = ch.links.findIndex(function (l) {
              return (l.from === from && l.to === sid) || (l.from === sid && l.to === from);
            });
            if (existing >= 0) ch.links.splice(existing, 1);
            else ch.links.push({ id: Store.uid(), from: from, to: sid, label: '' });
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
  let sceneCombatOpen = false; // section « Zones de combat » dépliée via + ⚔ Combat

  function openSceneModal(adv, chId, sceneId) {
    const ch = adv.chapters.find(function (c) { return c.id === chId; });
    if (!ch) return;
    const scene = ch.scenes.find(function (s) { return s.id === sceneId; });
    if (!scene) return;

    const modal = document.getElementById('scene-modal');
    modal.removeAttribute('hidden');
    sceneCombatOpen = false; // la section combat se replie pour chaque nouvelle scène sans combat

    document.getElementById('sm-title').value = scene.title || '';
    const typeSelect = document.getElementById('sm-type');
    typeSelect.value = scene.type || 'exploration';

    migrateSceneBlocks(scene);
    refreshSceneModalSections(scene, adv);
    renderBlocksEditor(scene, adv);

    typeSelect.onchange = function () {
      scene.type = typeSelect.value;
      refreshSceneModalSections(scene, adv);
    };
    document.getElementById('sm-title').oninput = function () { scene.title = this.value; };
    const faitEl = document.getElementById('sm-fait');
    if (faitEl) { faitEl.value = scene.fait || ''; faitEl.oninput = function () { scene.fait = this.value; }; }
    document.getElementById('sm-add-block').onclick = function () {
      scene.blocks.push({ id: Store.uid(), type: 'narrative', content: '' });
      renderBlocksEditor(scene, adv);
    };
    document.getElementById('sm-add-test').onclick = function () {
      scene.blocks.push(newTestBlock());
      renderBlocksEditor(scene, adv);
    };
    const addAct = document.getElementById('sm-add-action');
    if (addAct) addAct.onclick = function () {
      // Bloc ACTION : un bloc de test SANS jet — la conséquence s'applique au choix.
      const b = newTestBlock();
      b.actionMode = true;
      scene.blocks.push(b);
      renderBlocksEditor(scene, adv);
    };
    const addWrite = document.getElementById('sm-add-write');
    if (addWrite) addWrite.onclick = function () {
      // Bloc ÉCRITURE : un bloc de test dont la réussite dépend d'un mot écrit
      // (énigme / mot de passe). Tolérant (casse, accents, pluriel).
      const b = newTestBlock();
      b.writeMode = true;
      b.writeInstruction = 'Écrivez exactement 1 mot';
      b.writeDesc = '';
      b.writeAnswers = '';
      scene.blocks.push(b);
      renderBlocksEditor(scene, adv);
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
    const combatCollapsed = document.getElementById('sm-combat-collapsed');

    // Le type de scène n'est qu'un libellé pour se repérer dans l'arbre.
    // « Scène suivante (auto) » n'existe pas dans un donjon structuré : la
    // navigation y passe par les CONNECTEURS — le champ y est donc masqué.
    nextBox.style.display = (curCh && curCh.mode === 'dungeon') ? 'none' : '';
    choicesBox.style.display = '';
    rewardBox.style.display = '';
    // Zones de combat : repliées derrière un bouton « + ⚔ Combat » tant que la
    // scène ne contient ni adversaires ni scènes de victoire/défaite. Les
    // combats déjà installés restent affichés (rien n'est perdu).
    const hasCombatContent = (scene.combatZones || []).some(function (z) {
      return (z.monsterRefs || []).some(function (r) { return r.monsterId; });
    }) || !!scene.outcomeSceneId || !!scene.defeatSceneId ||
      (scene.monsterRefs || []).some(function (r) { return r.monsterId; });
    const showCombat = hasCombatContent || sceneCombatOpen;
    combatBox.style.display = showCombat ? '' : 'none';
    if (combatCollapsed) {
      combatCollapsed.hidden = showCombat;
      const addBtn = document.getElementById('sm-add-combat');
      if (addBtn) addBtn.onclick = function () { sceneCombatOpen = true; refreshSceneModalSections(scene, adv); };
    }
    // Combat : plier/déplier (état conservé) + coche « OK » (titre en vert).
    if (showCombat) {
      const cBody = document.getElementById('sm-combat-body');
      const cColl = document.getElementById('sm-combat-collapse');
      const cDone = document.getElementById('sm-combat-done');
      const cHead = combatBox.querySelector('.sm-combat-head');
      if (cBody) cBody.hidden = !!scene.combatCollapsed;
      if (cColl) { cColl.textContent = scene.combatCollapsed ? '▸' : '▾'; cColl.onclick = function () { scene.combatCollapsed = !scene.combatCollapsed; save(); refreshSceneModalSections(scene, adv); }; }
      if (cHead) cHead.classList.toggle('adv-block-done', !!scene.combatDone);
      if (cDone) { cDone.checked = !!scene.combatDone; cDone.onchange = function () { scene.combatDone = this.checked; if (cHead) cHead.classList.toggle('adv-block-done', this.checked); save(); }; }
    }

    // Connecteurs de la salle (chapitre Donjon structuré) : rappel en lecture
    // seule — ce sont eux qui deviennent les « Sorties & accès » en jeu, tandis
    // que « Scène suivante » reste un enchaînement forcé (ex. sortie du donjon).
    const dlBox = document.getElementById('sm-dungeon-links');
    if (dlBox) {
      if (curCh && (curCh.mode === 'dungeon') && Array.isArray(curCh.links)) {
        const titles = sceneTitleMap(adv);
        const mine = curCh.links.filter(function (l) { return l.from === scene.id || l.to === scene.id; });
        // Blocs de test de CETTE salle : candidats pour révéler un passage secret.
        const testBlocks = (scene.blocks || []).filter(function (b) { return b.type === 'test'; });
        dlBox.hidden = false;
        dlBox.innerHTML = '<div class="attacks-head"><h3>Connecteurs de la salle</h3></div>' +
          (mine.length
            ? mine.map(function (l) {
                const otherId = l.from === scene.id ? l.to : l.from;
                const other = curCh.scenes.find(function (s) { return s.id === otherId; });
                // Flèche orientée depuis CETTE salle vers l'autre (direction sur la carte).
                const arrow = dmapDirArrow(scene, other);
                // Accès : Visible (toujours), Dissimulé (invisible tant que le test
                // n'est pas réussi) ou Verrouillé (visible avec un cadenas, franchissable
                // une fois le test réussi). Rétro-compat : revealTestId seul = dissimulé.
                const gateMode = l.gateMode || (l.revealTestId ? 'hidden' : 'none');
                const modeOpts =
                  '<option value="none"' + (gateMode === 'none' ? ' selected' : '') + '>👁 Visible</option>' +
                  '<option value="hidden"' + (gateMode === 'hidden' ? ' selected' : '') + '>🫥 Dissimulé</option>' +
                  '<option value="locked"' + (gateMode === 'locked' ? ' selected' : '') + '>🔒 Verrouillé</option>';
                let revealOpts = '<option value="">— Test qui ouvre —</option>' +
                  testBlocks.map(function (b, k) {
                    return '<option value="' + esc(b.id) + '"' + (l.revealTestId === b.id ? ' selected' : '') + '>' + esc(b.label || ('Test #' + (k + 1))) + '</option>';
                  }).join('');
                if (l.revealTestId && !testBlocks.some(function (b) { return b.id === l.revealTestId; })) {
                  revealOpts += '<option value="' + esc(l.revealTestId) + '" selected>(test d\'une autre salle)</option>';
                }
                const revealHidden = gateMode === 'none' ? ' style="display:none"' : '';
                return '<div class="sm-dl-row"><span class="dmap-dir">' + arrow + '</span> <b>' + esc(titles[otherId] || '(salle)') + '</b>' +
                  (l.label ? ' <span class="sm-dl-lbl">« ' + esc(l.label) + ' »</span>' : '') +
                  ' <select class="sm-dl-mode" data-link="' + esc(l.id) + '" title="Accès du connecteur : visible, dissimulé (invisible tant que le test n\'est pas réussi) ou verrouillé (cadenas visible, ouvert par le test).">' + modeOpts + '</select>' +
                  ' <select class="sm-dl-reveal" data-link="' + esc(l.id) + '"' + revealHidden + ' title="Test de la salle qui révèle / déverrouille ce connecteur.">' + revealOpts + '</select>' +
                '</div>';
              }).join('')
            : '<p class="hint">Aucun connecteur — trace-les avec 🔗 sur la carte du donjon.</p>') +
          '<p class="hint">Les connecteurs sont les <b>Sorties &amp; accès</b> de la salle en jeu ; ils se gèrent sur la carte. ' +
            '<b>🫥 Dissimulé</b> : invisible tant que le test choisi n\'est pas réussi. ' +
            '<b>🔒 Verrouillé</b> : le bouton reste visible avec un cadenas et ne s\'ouvre qu\'une fois le test réussi.</p>';
        dlBox.querySelectorAll('.sm-dl-mode').forEach(function (sel) {
          sel.onchange = function () {
            const l = curCh.links.find(function (x) { return x.id === sel.getAttribute('data-link'); });
            if (!l) return;
            l.gateMode = sel.value;
            if (l.gateMode === 'none') l.revealTestId = null; // plus de verrou → pas de test
            save();
            refreshSceneModalSections(scene, adv);
          };
        });
        dlBox.querySelectorAll('.sm-dl-reveal').forEach(function (sel) {
          sel.onchange = function () {
            const l = curCh.links.find(function (x) { return x.id === sel.getAttribute('data-link'); });
            if (l) { l.revealTestId = sel.value || null; save(); }
          };
        });
      } else {
        dlBox.hidden = true;
        dlBox.innerHTML = '';
      }
    }

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
    const rac = document.getElementById('sm-reward-after-combat');
    if (rac) { rac.checked = !!scene.rewardAfterCombat; rac.onchange = function () { scene.rewardAfterCombat = this.checked; }; }
    const rtx = document.getElementById('sm-reward-text');
    if (rtx) { rtx.value = scene.rewardText || ''; rtx.oninput = function () { scene.rewardText = this.value; }; }
    const winBox = document.getElementById('sm-win-fx');
    if (winBox) {
      winBox.innerHTML = winFxControlsHtml(scene, 'sm-wfx-kind', 'sm-wfx-val', 'sm-wfx-state', '', false);
      const k = winBox.querySelector('.sm-wfx-kind');
      if (k) k.onchange = function () { ensureWinFx(scene).kind = this.value; scene.prepareReward = false; refreshSceneModalSections(scene, adv); };
      const v = winBox.querySelector('.sm-wfx-val');
      if (v) v.onchange = function () { const val = this.value.trim(); ensureWinFx(scene).val = Store.isDiceExpr(val) ? val : Math.max(1, parseInt(val, 10) || 1); };
      const s = winBox.querySelector('.sm-wfx-state');
      if (s) s.onchange = function () { ensureWinFx(scene).state = this.value; };
    }
    renderItemRewards(scene);
    renderTreasureRewards('sm-treasure-rewards', scene);
  }

  // ---- Blocs de contenu : texte typé OU test de compétence, ordonnés ensemble ----
  // Conséquences possibles d'un échec au test (appliquées à l'aventurier testeur).
  const TEST_FAIL_FX = [
    { kind: 'none',  label: '— Aucune —' },
    { kind: 'pv',    label: 'Perte de PV' },
    { kind: 'state', label: 'Subir un état' },
    { kind: 'xp',    label: 'Perte d\'XP' },
    { kind: 'item',  label: 'Perte d\'un objet équipé' },
    { kind: 'vie',   label: 'Perte de VIE' },
    { kind: 'death', label: 'Mort de l\'aventurier' },
    { kind: 'deed',  label: 'Subit un Haut Fait' },
    { kind: 'combat', label: '⚔️ Démarrer un Combat' },
  ];
  const FX_STATES = [['affaibli', 'Affaibli'], ['auSol', 'Au sol'], ['feu', 'Feu'], ['poison', 'Poison'], ['brise', 'Brisé'], ['faille', 'Faille']];
  const FX_SLOTS = [['mainG', 'Main gauche'], ['mainD', 'Main droite'], ['randhand', '1 main aléatoire'], ['armor', 'Armure'], ['object', 'Objet équipé']];
  // Effets POSITIFS accordés en cas de réussite (test ou scène).
  const TEST_WIN_FX = [
    { kind: 'none',    label: '— Aucun —' },
    { kind: 'prepare', label: '⚡ Préparé (+1 Action ou +1 Mouvement, prochain combat)' },
    { kind: 'pv',      label: '❤️ Soin de PV' },
    { kind: 'vie',     label: '❤️ Gain de VIE' },
    { kind: 'state',   label: '🛡️ Gagne un état (prochain combat)' },
    { kind: 'combat',  label: '⚔️ Démarrer un Combat' },
  ];
  const WIN_FX_STATES = [['blindage', 'Blindage'], ['onde', 'Onde']];
  // Config de combat portée par un effet de test (réussite/échec) : zones + barrières.
  function ensureFxCombat(fx) {
    if (!fx.combat || typeof fx.combat !== 'object') fx.combat = { combatZones: [], barriers: {} };
    return fx.combat;
  }
  function ensureWinFx(o) {
    if (!o.winEffect || typeof o.winEffect !== 'object') {
      // Migration : l'ancienne case « Préparé » devient un effet de réussite.
      o.winEffect = { kind: o.prepareReward ? 'prepare' : 'none', val: 2, state: 'blindage' };
    }
    return o.winEffect;
  }
  // Contrôles HTML du menu « Effet en cas de réussite » (partagés test + scène).
  // kindCls / valCls / stateCls : classes CSS pour le câblage des événements.
  function winFxControlsHtml(o, kindCls, valCls, stateCls, dataAttr, allowCombat) {
    const fx = ensureWinFx(o);
    const da = dataAttr || '';
    const list = (allowCombat === false) ? TEST_WIN_FX.filter(function (f) { return f.kind !== 'combat'; }) : TEST_WIN_FX;
    const opts = list.map(function (f) {
      return '<option value="' + f.kind + '"' + (fx.kind === f.kind ? ' selected' : '') + '>' + f.label + '</option>';
    }).join('');
    let fields = '';
    if (fx.kind === 'pv' || fx.kind === 'vie') {
      fields = '<input type="text" class="' + valCls + '" ' + da + ' value="' + esc(fx.val == null ? 2 : fx.val) + '" style="width:70px" placeholder="2 ou 1d6" title="Valeur fixe ou tirage de dés (ex : 3, 1d6, 2d6+1)" />';
    } else if (fx.kind === 'state') {
      fields = '<select class="' + stateCls + '" ' + da + '>' + WIN_FX_STATES.map(function (s) {
        return '<option value="' + s[0] + '"' + (fx.state === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('') + '</select>';
    }
    return '<span class="tb-fx-wrap"><span class="tb-fx-lbl tb-win-lbl">✦ Réussite :</span>' +
      '<select class="' + kindCls + '" ' + da + '>' + opts + '</select>' + fields + '</span>';
  }
  function ensureFailFx(blk) {
    if (!blk.failEffect || typeof blk.failEffect !== 'object') {
      blk.failEffect = { kind: 'none', val: 1, state: 'affaibli', slot: 'randhand', text: '' };
    }
    return blk.failEffect;
  }
  function newTestBlock() {
    return { id: Store.uid(), type: 'test', label: '', skill: 'Perception', difficulty: 'moyen',
      who: 'best',  // 'best' = meilleur aventurier ; 'group' = TOUS les aventuriers testent
      successText: '', failText: '', xpReward: 0, itemRewards: [], targetSceneId: null, reqSkill: '', reqVal: 0,
      retry: false, failEffect: { kind: 'none', val: 1, state: 'affaibli', slot: 'randhand', text: '' } };
  }
  // Migration : ancien `text` → bloc narratif ; ancien `searchTest` (v2.3.04) → bloc de test.
  function migrateSceneBlocks(scene) {
    if (!Array.isArray(scene.blocks)) scene.blocks = [];
    if (scene.text && scene.text.trim()) {
      scene.blocks.unshift({ id: Store.uid(), type: 'narrative', content: scene.text });
      scene.text = '';
    }
    if (scene.searchTest && scene.searchTest.enabled &&
        !scene.blocks.some(function (b) { return b.type === 'test' && b._fromSearch; })) {
      const st = scene.searchTest;
      scene.blocks.push({ id: Store.uid(), type: 'test', _fromSearch: true,
        label: st.label || '', skill: st.skill || 'Perception', difficulty: st.difficulty || 'moyen',
        successText: st.successText || '', failText: st.failText || '', xpReward: st.xpReward || 0,
        itemRewards: Array.isArray(st.itemRewards) ? st.itemRewards : [], targetSceneId: st.targetSceneId || null,
        reqSkill: '', reqVal: 0 });
    }
    if (scene.searchTest) delete scene.searchTest;
  }
  function reqSkillOptions(cur) {
    return '<option value="">— Aucune —</option>' +
      SKILLS.map(function (s) { return '<option value="' + s + '"' + (cur === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
  }

  function renderBlocksEditor(scene, adv) {
    const box = document.getElementById('sm-blocks');
    if (!box) return;
    if (!Array.isArray(scene.blocks)) scene.blocks = [];
    const curCh = chapterOfScene(adv, scene.id);
    const allScenes = buildAllScenes(adv, curCh ? curCh.id : null);
    const diffOptsHtml = function (cur) {
      return DIFF_LEVELS.map(function (d) {
        return '<option value="' + d[0] + '"' + ((cur || 'moyen') === d[0] ? ' selected' : '') + '>' + d[1] + '</option>';
      }).join('');
    };
    if (!scene.blocks.length) {
      box.innerHTML = '<p class="empty" style="margin:.25rem 0 .35rem">Aucun bloc — clique « + Bloc » (texte) ou « + Bloc Test ».</p>';
    } else {
      box.innerHTML = scene.blocks.map(function (blk, i) {
        const last = i === scene.blocks.length - 1;
        const collapsed = !!blk.collapsed;
        const done = !!blk.done;
        // Plier/déplier (état conservé sur le bloc) + coche « OK » (bloc terminé,
        // titre en vert), toujours visibles même replié.
        const collapseBtn = '<button type="button" class="icon-btn block-collapse" data-bi="' + i + '" title="' + (collapsed ? 'Déplier' : 'Replier') + '">' + (collapsed ? '▸' : '▾') + '</button>';
        const okLabel = '<label class="adv-block-ok" title="Marquer ce bloc comme terminé"><input type="checkbox" class="block-done" data-bi="' + i + '"' + (done ? ' checked' : '') + '> OK</label>';
        const tools = okLabel +
          '<button type="button" class="icon-btn block-up" data-bi="' + i + '" title="Monter"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="icon-btn block-down" data-bi="' + i + '" title="Descendre"' + (last ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="icon-btn block-del" data-bi="' + i + '" title="Supprimer ce bloc">✕</button>';
        const bodyOpen = '<div class="adv-block-body"' + (collapsed ? ' hidden' : '') + '>';
        // Condition d'affichage (commune à tous les blocs) : compétence requise / valeur mini.
        const reqHtml = '<div class="adv-block-req">' +
          '<span class="adv-block-req-lbl">👁 N\'afficher que si un aventurier a</span>' +
          '<select class="block-reqskill" data-bi="' + i + '">' + reqSkillOptions(blk.reqSkill || '') + '</select>' +
          '<input type="number" class="block-reqval" data-bi="' + i + '" min="1" value="' + (blk.reqVal || 1) + '"' +
            (blk.reqSkill ? '' : ' style="display:none"') + ' title="Valeur minimale" />' +
          '<span class="adv-block-req-mini"' + (blk.reqSkill ? '' : ' style="display:none"') + '>ou plus</span>' +
        '</div>';
        if (blk.type === 'test') {
          // Bloc ACTION : même bloc, SANS jet de dés — pas de compétence/difficulté/
          // testeur. Le joueur choisit l'Action 1 (issue « réussite ») ou l'Action 2
          // (issue « échec », optionnelle).
          const isAction = !!blk.actionMode;
          const isWrite = !!blk.writeMode;
          return '<div class="adv-block-row adv-block-test' + (isWrite ? ' adv-block-write' : '') + (done ? ' adv-block-done' : '') + (collapsed ? ' collapsed' : '') + '" data-bi="' + i + '">' +
            '<div class="adv-block-row-head">' +
              collapseBtn +
              '<span class="adv-block-test-tag">' + (isWrite
                ? '✍️ Écriture' + (blk.label ? ' · ' + esc(blk.label) : '')
                : isAction
                ? '⚡ Action' + (blk.label ? ' · ' + esc(blk.label) : '')
                : '🔍 Test' + (blk.label ? ' · ' + esc(blk.label) : ' de compétence')) + '</span>' + tools +
            '</div>' +
            bodyOpen +
            '<input type="text" class="tb-label" data-bi="' + i + '" placeholder="' + (isWrite ? 'Intitulé (ex : L\'énigme du gardien)' : isAction ? 'Intitulé de l\'Action 1 (ex : Boire à la fontaine)' : 'Intitulé du bouton (ex : Fouiller la zone)') + '" value="' + esc(blk.label || '') + '" />' +
            // ÉCRITURE : description (énigme), consigne, mot(s) attendu(s).
            (isWrite
              ? '<textarea class="tb-writedesc" data-bi="' + i + '" rows="2" placeholder="Description / énigme présentée aux aventuriers (ex : « Je brille la nuit et guide les marins. Que suis-je ? »)">' + esc(blk.writeDesc || '') + '</textarea>' +
                '<div class="form-row" style="grid-template-columns:1fr 1fr">' +
                  '<label>Consigne <input type="text" class="tb-writeinstruction" data-bi="' + i + '" value="' + esc(blk.writeInstruction || 'Écrivez exactement 1 mot') + '" placeholder="Écrivez exactement 1 mot" /></label>' +
                  '<label title="Séparez plusieurs réponses acceptées par une virgule. Tolérant à la casse, aux accents et au pluriel.">Mot(s) attendu(s) <input type="text" class="tb-writeanswers" data-bi="' + i + '" value="' + esc(blk.writeAnswers || '') + '" placeholder="Étoile, Étoiles" /></label>' +
                '</div>'
              : '') +
            (isAction || isWrite ? '' :
            '<div class="form-row" style="grid-template-columns:1fr 1fr 1fr">' +
              '<label>Compétence <select class="tb-skill" data-bi="' + i + '">' +
                SKILLS.map(function (s) { return '<option value="' + s + '"' + (blk.skill === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
              '<label>Difficulté <select class="tb-diff" data-bi="' + i + '">' + diffOptsHtml(blk.difficulty) + '</select></label>' +
              '<label>Testeur <select class="tb-who" data-bi="' + i + '" title="GROUPE : chaque aventurier lance le test. CONCERNÉS : uniquement les aventuriers ayant réussi/échoué le test qui a révélé celui-ci (test enchaîné).">' +
                '<option value="best"' + ((blk.who || 'best') === 'best' ? ' selected' : '') + '>Meilleur aventurier</option>' +
                '<option value="random"' + (blk.who === 'random' ? ' selected' : '') + '>🎲 Aventurier aléatoire</option>' +
                '<option value="group"' + (blk.who === 'group' ? ' selected' : '') + '>👥 GROUPE (tous)</option>' +
                '<option value="concerned"' + (blk.who === 'concerned' ? ' selected' : '') + '>🎯 Aventuriers concernés (chaîne)</option>' +
              '</select></label>' +
            '</div>') +
            // Compétence ALTERNATIVE : le joueur choisit entre 2 boutons (2 compétences,
            // difficultés indépendantes) — le résultat résout le test dans les 2 cas.
            // Bloc ACTION : une 2e ACTION optionnelle (issue « échec ») à la place.
            (isWrite
              ? '<div class="form-row tb-alt-row" style="grid-template-columns:1fr">' +
                  '<label class="tb-mandatory-lbl" title="Affiche 🔒 Obligatoire en rouge dans le titre."><input type="checkbox" class="tb-mandatory" data-bi="' + i + '"' + (blk.mandatory ? ' checked' : '') + ' /> 🔒 Obligatoire</label>' +
                '</div>'
              : '<div class="form-row tb-alt-row" style="grid-template-columns:1fr 1fr auto">' +
                (isAction
                  ? '<label>Action 2 (optionnelle — applique la « conséquence de l\'échec ») <input type="text" class="tb-altlabel" data-bi="' + i + '" value="' + esc(blk.altLabel || '') + '" placeholder="Ex : Briser la fontaine" /></label>' +
                    '<span></span>'
                  : '<label>Compétence alternative <select class="tb-altskill" data-bi="' + i + '">' +
                      '<option value="">— Aucune —</option>' +
                      SKILLS.map(function (s) { return '<option value="' + s + '"' + (blk.altSkill === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
                    '<label>Difficulté (alternative) <select class="tb-altdiff" data-bi="' + i + '"' + (blk.altSkill ? '' : ' disabled') + '>' + diffOptsHtml(blk.altDifficulty || blk.difficulty) + '</select></label>') +
                '<label class="tb-mandatory-lbl" title="Affiche 🔒 Obligatoire en rouge dans le titre."><input type="checkbox" class="tb-mandatory" data-bi="' + i + '"' + (blk.mandatory ? ' checked' : '') + ' /> 🔒 Obligatoire</label>' +
              '</div>') +
            // Seuil de réussite d'un test collectif (groupe / concernés).
            ((blk.who === 'group' || blk.who === 'concerned')
              ? '<label class="tb-groupmode-lbl">👥 Le test collectif est réussi si <select class="tb-groupmode" data-bi="' + i + '">' +
                  '<option value="all"' + ((blk.groupMode || 'majority') === 'all' ? ' selected' : '') + '>tous les aventuriers réussissent (unanimité)</option>' +
                  '<option value="majority"' + ((blk.groupMode || 'majority') === 'majority' ? ' selected' : '') + '>la majorité réussit</option>' +
                  '<option value="one"' + (blk.groupMode === 'one' ? ' selected' : '') + '>au moins un aventurier réussit</option>' +
                '</select></label>'
              : '') +
            '<textarea class="tb-success" data-bi="' + i + '" rows="2" placeholder="' + (isWrite ? 'Texte de réussite (bonne réponse)' : isAction ? 'Texte affiché après l\'Action 1' : 'Texte de réussite') + '">' + esc(blk.successText || '') + '</textarea>' +
            '<textarea class="tb-fail" data-bi="' + i + '" rows="2" placeholder="' + (isWrite ? 'Texte d\'échec (mauvaise réponse)' : isAction ? 'Texte affiché après l\'Action 2' : 'Texte d\'échec') + '">' + esc(blk.failText || '') + '</textarea>' +
            '<div class="tb-reward-head">Récompense en cas de réussite · Conséquence de l\'échec <small>(valeurs fixes ou en dés : « 3 », « 2d6 », « 1d6+2 »)</small></div>' +
            '<div class="tb-rf-row">' +
              '<label class="tb-xp-lbl">XP <input type="text" class="tb-xp" data-bi="' + i + '" value="' + esc(blk.xpReward == null ? 0 : blk.xpReward) + '" style="width:70px" placeholder="0 ou 1d6" title="XP fixe ou tirage de dés (ex : 5, 1d6, 2d6+1)" /></label>' +
              (function () {
                const fx = ensureFailFx(blk);
                const kindOpts = TEST_FAIL_FX.map(function (f) {
                  return '<option value="' + f.kind + '"' + (fx.kind === f.kind ? ' selected' : '') + '>' + esc(f.label) + '</option>';
                }).join('');
                let fields = '';
                if (fx.kind === 'pv' || fx.kind === 'xp' || fx.kind === 'vie') {
                  fields = '<input type="text" class="tb-fx-val" data-bi="' + i + '" value="' + esc(fx.val == null ? 1 : fx.val) + '" style="width:70px" placeholder="3 ou 2d6" title="Valeur fixe ou tirage de dés (ex : 3, 2d6, 1d6+2)" />';
                } else if (fx.kind === 'state') {
                  fields = '<select class="tb-fx-state" data-bi="' + i + '">' + FX_STATES.map(function (s) {
                    return '<option value="' + s[0] + '"' + (fx.state === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
                  }).join('') + '</select>';
                } else if (fx.kind === 'item') {
                  fields = '<select class="tb-fx-slot" data-bi="' + i + '">' + FX_SLOTS.map(function (s) {
                    return '<option value="' + s[0] + '"' + ((fx.slot || 'randhand') === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
                  }).join('') + '</select>';
                } else if (fx.kind === 'deed') {
                  fields = '<input type="text" class="tb-fx-text" data-bi="' + i + '" placeholder="Texte du Haut Fait subi (journal)" value="' + esc(fx.text || '') + '" />';
                }
                return '<span class="tb-fx-wrap"><span class="tb-fx-lbl">⚠ Échec :</span>' +
                  '<select class="tb-fx-kind" data-bi="' + i + '">' + kindOpts + '</select>' + fields + '</span>';
              })() +
            '</div>' +
            (ensureFailFx(blk).kind === 'combat' ? '<div class="tb-fx-combat" id="tb-failcbt-' + blk.id + '"></div>' : '') +
            '<div id="sm-blk-ir-' + blk.id + '"></div>' +
            '<div class="tb-treasure" id="sm-blk-tr-' + blk.id + '"></div>' +
            '<label class="tb-deed-lbl">🏆 Haut Fait gagné en cas de réussite <input type="text" class="tb-deed" data-bi="' + i + '" value="' + esc(blk.deedReward || '') + '" placeholder="Ex : A vaincu le gardien du seuil (ajouté aux Hauts Faits)" /></label>' +
            '<div class="tb-win-row">' + winFxControlsHtml(blk, 'tb-wfx-kind', 'tb-wfx-val', 'tb-wfx-state', 'data-bi="' + i + '"') + '</div>' +
            (ensureWinFx(blk).kind === 'combat' ? '<div class="tb-fx-combat" id="tb-wincbt-' + blk.id + '"></div>' : '') +
            '<label>Passage débloqué en cas de réussite <select class="tb-target" data-bi="' + i + '">' + sceneTargetOptions(allScenes, blk.targetSceneId, adv) + '</select></label>' +
            // Tests enchaînés : un AUTRE bloc de test de la scène, révélé selon le
            // résultat (ex. rater l'Agilité fait apparaître un test de Force).
            (function () {
              const others = scene.blocks.filter(function (b) { return b.type === 'test' && b.id !== blk.id; });
              if (!others.length) return '';
              const opts = function (cur) {
                return '<option value="">— Aucun —</option>' + others.map(function (b, k) {
                  return '<option value="' + esc(b.id) + '"' + (cur === b.id ? ' selected' : '') + '>' + esc(b.label || ('Test #' + (k + 1))) + '</option>';
                }).join('');
              };
              const succLbl = blk.actionMode ? '🔗 Test révélé si Action 1' : '🔗 Test révélé si réussite';
              const failLbl = blk.actionMode ? '🔗 Test révélé si Action 2' : '🔗 Test révélé si échec';
              return '<div class="form-row tb-chain-row" style="grid-template-columns:1fr 1fr" title="Le test choisi n\'apparaît dans la scène qu\'après ce résultat.">' +
                '<label>' + succLbl + ' <select class="tb-chain-succ" data-bi="' + i + '">' + opts(blk.chainSuccessId) + '</select></label>' +
                '<label>' + failLbl + ' <select class="tb-chain-fail" data-bi="' + i + '">' + opts(blk.chainFailId) + '</select></label>' +
              '</div>';
            })() +
            // Un test enchaîné peut « rattraper » le test qui l'a révélé : le
            // réussir valide rétroactivement le précédent (débloque son accès /
            // connecteur secret).
            (function () {
              const isChild = scene.blocks.some(function (b) { return b.type === 'test' && (b.chainSuccessId === blk.id || b.chainFailId === blk.id); });
              if (!isChild) return '';
              return '<label class="tb-validate-lbl" title="Utile pour un test de rattrapage après un échec : réussir celui-ci valide le test précédent et débloque ce qu\'il conditionnait (passage secret, etc.).">' +
                '<input type="checkbox" class="tb-validate" data-bi="' + i + '"' + (blk.validatesParent ? ' checked' : '') + ' /> ✅ Réussir ce test <b>valide le test précédent</b> (débloque son accès)</label>';
            })() +
            (function () {
              if (isAction || isWrite) return ''; // Action / Écriture : pas de sélecteur de relance ici
              // Mode de nouvelle tentative (rétro-compat : ancien booléen retry → à volonté).
              const rm = blk.retryMode || (blk.retry ? 'always' : 'none');
              const opts = [
                ['none', 'Ne peut pas être retenté'],
                ['always', 'Peut être retenté à volonté'],
                ['other', 'Avec un autre aventurier (1× chacun)'],
                ['levelup', 'Après une montée de niveau du groupe'],
              ].map(function (o) {
                return '<option value="' + o[0] + '"' + (rm === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
              }).join('');
              return '<label class="tb-retry-lbl">🔁 En cas d\'échec : <select class="tb-retrymode" data-bi="' + i + '" ' +
                'title="À volonté : retentable sans limite. Autre aventurier : chaque aventurier vivant tente une fois maximum (tests individuels uniquement). Montée de niveau : le test redevient disponible quand le groupe a gagné un niveau.">' + opts + '</select></label>';
            })() +
            // OBJET RARE : si le groupe possède l'Objet Rare choisi (parmi ceux donnés
            // en récompense dans l'aventure), un bouton apparaît à côté du test pour le
            // réussir automatiquement — éventuellement en consommant l'objet.
            (function () {
              if (isWrite) return ''; // Écriture : pas de résolution par Objet Rare
              const rareNames = adventureRareNames(adv);
              let opts = '<option value="">— Aucun —</option>';
              if (blk.rareKeyName && rareNames.indexOf(blk.rareKeyName) < 0) {
                opts += '<option value="' + esc(blk.rareKeyName) + '" selected>' + esc(blk.rareKeyName) + ' (hors récompenses)</option>';
              }
              opts += rareNames.map(function (n) {
                return '<option value="' + esc(n) + '"' + (blk.rareKeyName === n ? ' selected' : '') + '>' + esc(n) + '</option>';
              }).join('');
              return '<div class="tb-rare-row">' +
                '<label title="Si le groupe possède cet Objet Rare dans son inventaire, un bouton avec sa vignette apparaît à côté du test et permet de le réussir automatiquement.">' +
                  '🗝️ Objet Rare qui résout ' + (isAction ? 'l\'action' : 'le test') + ' ' +
                  '<select class="tb-rarekey" data-bi="' + i + '">' + opts + '</select></label>' +
                '<label class="tb-rareconsume-lbl"' + (blk.rareKeyName ? '' : ' style="display:none"') + ' title="Si coché, l\'Objet Rare est retiré de l\'inventaire du groupe une fois utilisé pour résoudre ce test / cette action.">' +
                  '<input type="checkbox" class="tb-rareconsume" data-bi="' + i + '"' + (blk.rareConsume ? ' checked' : '') + ' /> Consommé à l\'usage</label>' +
              '</div>';
            })() +
            reqHtml +
            '</div>' + // .adv-block-body
          '</div>';
        }
        // Bloc de texte typé
        const typeOpts = BLOCK_TYPES.map(function (t) {
          return '<option value="' + t.value + '"' + (t.value === blk.type ? ' selected' : '') + '>' + esc(t.label) + '</option>';
        }).join('');
        const preview = collapsed && blk.content ? '<span class="adv-block-preview">' + esc(blk.content.replace(/\s+/g, ' ').slice(0, 70)) + '</span>' : '';
        return '<div class="adv-block-row block-' + (blk.type || 'narrative') + (done ? ' adv-block-done' : '') + (collapsed ? ' collapsed' : '') + '" data-bi="' + i + '">' +
          '<div class="adv-block-row-head">' +
            collapseBtn +
            '<select class="block-type-sel" data-bi="' + i + '">' + typeOpts + '</select>' + preview + tools +
          '</div>' +
          bodyOpen +
            '<textarea class="block-content" data-bi="' + i + '" rows="3" placeholder="Texte du bloc — **gras** et *italique* possibles">' + esc(blk.content || '') + '</textarea>' +
            reqHtml +
          '</div>' +
        '</div>';
      }).join('');
    }

    const biOf = function (el) { return +el.getAttribute('data-bi'); };
    // Récompenses-objets des blocs de test (une liste par bloc).
    scene.blocks.forEach(function (blk) {
      if (blk.type === 'test') {
        if (!Array.isArray(blk.itemRewards)) blk.itemRewards = [];
        renderItemRewardsList('sm-blk-ir-' + blk.id, blk.itemRewards, 'sm-blk-addir-' + blk.id);
        renderTreasureRewards('sm-blk-tr-' + blk.id, blk);
      }
    });
    // Blocs de texte
    // Plier/déplier (conservé sur le bloc) + coche OK (bloc terminé).
    box.querySelectorAll('.block-collapse').forEach(function (b) {
      b.onclick = function () {
        const blk = scene.blocks[biOf(this)];
        blk.collapsed = !blk.collapsed;
        save(); renderBlocksEditor(scene, adv);
      };
    });
    box.querySelectorAll('.block-done').forEach(function (cb) {
      cb.onchange = function () {
        scene.blocks[biOf(this)].done = this.checked;
        const row = this.closest('.adv-block-row');
        if (row) row.classList.toggle('adv-block-done', this.checked);
        save();
      };
    });
    box.querySelectorAll('.block-type-sel').forEach(function (sel) {
      sel.onchange = function () {
        scene.blocks[biOf(this)].type = this.value;
        renderBlocksEditor(scene, adv);
      };
    });
    box.querySelectorAll('.block-content').forEach(function (ta) {
      ta.oninput = function () { scene.blocks[biOf(this)].content = this.value; };
    });
    // Blocs de test
    box.querySelectorAll('.tb-label').forEach(function (el) { el.oninput = function () { scene.blocks[biOf(this)].label = this.value; }; });
    box.querySelectorAll('.tb-writedesc').forEach(function (el) { el.oninput = function () { scene.blocks[biOf(this)].writeDesc = this.value; }; });
    box.querySelectorAll('.tb-writeinstruction').forEach(function (el) { el.oninput = function () { scene.blocks[biOf(this)].writeInstruction = this.value; }; });
    box.querySelectorAll('.tb-writeanswers').forEach(function (el) { el.oninput = function () { scene.blocks[biOf(this)].writeAnswers = this.value; }; });
    box.querySelectorAll('.tb-skill').forEach(function (el) { el.onchange = function () { scene.blocks[biOf(this)].skill = this.value; }; });
    box.querySelectorAll('.tb-diff').forEach(function (el) { el.onchange = function () { scene.blocks[biOf(this)].difficulty = this.value; }; });
    box.querySelectorAll('.tb-altskill').forEach(function (el) {
      el.onchange = function () { scene.blocks[biOf(this)].altSkill = this.value; renderBlocksEditor(scene, adv); };
    });
    box.querySelectorAll('.tb-altlabel').forEach(function (el) {
      el.oninput = function () { scene.blocks[biOf(this)].altLabel = this.value; };
    });
    box.querySelectorAll('.tb-altdiff').forEach(function (el) {
      el.onchange = function () { scene.blocks[biOf(this)].altDifficulty = this.value; };
    });
    box.querySelectorAll('.tb-mandatory').forEach(function (el) {
      el.onchange = function () { scene.blocks[biOf(this)].mandatory = this.checked; };
    });
    box.querySelectorAll('.tb-rarekey').forEach(function (el) {
      el.onchange = function () {
        const blk = scene.blocks[biOf(this)];
        blk.rareKeyName = this.value || null;
        if (!blk.rareKeyName) blk.rareConsume = false;
        renderBlocksEditor(scene, adv); // affiche/masque la case « Consommé à l'usage »
      };
    });
    box.querySelectorAll('.tb-rareconsume').forEach(function (el) {
      el.onchange = function () { scene.blocks[biOf(this)].rareConsume = this.checked; };
    });
    box.querySelectorAll('.tb-who').forEach(function (el) { el.onchange = function () { scene.blocks[biOf(this)].who = this.value; renderBlocksEditor(scene, adv); }; });
    box.querySelectorAll('.tb-groupmode').forEach(function (el) { el.onchange = function () { scene.blocks[biOf(this)].groupMode = this.value; }; });
    box.querySelectorAll('.tb-success').forEach(function (el) { el.oninput = function () { scene.blocks[biOf(this)].successText = this.value; }; });
    box.querySelectorAll('.tb-fail').forEach(function (el) { el.oninput = function () { scene.blocks[biOf(this)].failText = this.value; }; });
    // XP : valeur fixe OU notation en dés (« 1d6 », « 2d6+1 ») — stockée brute,
    // résolue au moment du gain.
    box.querySelectorAll('.tb-xp').forEach(function (el) {
      el.onchange = function () {
        const v = this.value.trim();
        scene.blocks[biOf(this)].xpReward = Store.isDiceExpr(v) ? v : Math.max(0, parseInt(v, 10) || 0);
      };
    });
    box.querySelectorAll('.tb-deed').forEach(function (el) {
      el.oninput = function () { scene.blocks[biOf(this)].deedReward = this.value; };
    });
    box.querySelectorAll('.tb-wfx-kind').forEach(function (el) {
      el.onchange = function () {
        const blk = scene.blocks[biOf(this)];
        ensureWinFx(blk).kind = this.value;
        blk.prepareReward = false; // remplacé par le menu d'effet de réussite
        renderBlocksEditor(scene, adv);
      };
    });
    box.querySelectorAll('.tb-wfx-val').forEach(function (el) {
      el.onchange = function () {
        const v = this.value.trim();
        ensureWinFx(scene.blocks[biOf(this)]).val = Store.isDiceExpr(v) ? v : Math.max(1, parseInt(v, 10) || 1);
      };
    });
    box.querySelectorAll('.tb-wfx-state').forEach(function (el) {
      el.onchange = function () { ensureWinFx(scene.blocks[biOf(this)]).state = this.value; };
    });
    // Éditeurs de zones de combat des effets « Démarrer un Combat » (réussite/échec).
    scene.blocks.forEach(function (blk) {
      if (blk.type !== 'test') return;
      if (blk.failEffect && blk.failEffect.kind === 'combat') {
        // Placement de départ double (normal / échoués) réservé à l'échec du test.
        renderCombatEditor(document.getElementById('tb-failcbt-' + blk.id), ensureFxCombat(blk.failEffect), Store.state.monsters, 'failzone-' + blk.id, true);
      }
      if (blk.winEffect && blk.winEffect.kind === 'combat') {
        renderCombatEditor(document.getElementById('tb-wincbt-' + blk.id), ensureFxCombat(blk.winEffect), Store.state.monsters, 'winzone-' + blk.id, false);
      }
    });
    box.querySelectorAll('.tb-target').forEach(function (el) {
      el.onchange = function () {
        const bi = biOf(this);
        if (handleTargetSelect(this.value, scene, adv, function (id) { scene.blocks[bi].targetSceneId = id; })) renderBlocksEditor(scene, adv);
      };
    });
    box.querySelectorAll('.tb-retrymode').forEach(function (el) {
      el.onchange = function () {
        const blk = scene.blocks[biOf(this)];
        blk.retryMode = this.value;
        blk.retry = this.value === 'always'; // rétro-compat de l'ancien booléen
      };
    });
    box.querySelectorAll('.tb-chain-succ').forEach(function (el) {
      el.onchange = function () { scene.blocks[biOf(this)].chainSuccessId = this.value || null; };
    });
    box.querySelectorAll('.tb-chain-fail').forEach(function (el) {
      el.onchange = function () { scene.blocks[biOf(this)].chainFailId = this.value || null; };
    });
    box.querySelectorAll('.tb-validate').forEach(function (el) {
      el.onchange = function () { scene.blocks[biOf(this)].validatesParent = this.checked; };
    });
    // Conséquence de l'échec (menu + champs dynamiques selon le type choisi)
    box.querySelectorAll('.tb-fx-kind').forEach(function (el) {
      el.onchange = function () { ensureFailFx(scene.blocks[biOf(this)]).kind = this.value; renderBlocksEditor(scene, adv); };
    });
    // Valeur de conséquence : fixe OU en dés (« 2d6 ») — stockée brute.
    box.querySelectorAll('.tb-fx-val').forEach(function (el) {
      el.onchange = function () {
        const v = this.value.trim();
        ensureFailFx(scene.blocks[biOf(this)]).val = Store.isDiceExpr(v) ? v : Math.max(1, parseInt(v, 10) || 1);
      };
    });
    box.querySelectorAll('.tb-fx-state').forEach(function (el) {
      el.onchange = function () { ensureFailFx(scene.blocks[biOf(this)]).state = this.value; };
    });
    box.querySelectorAll('.tb-fx-slot').forEach(function (el) {
      el.onchange = function () { ensureFailFx(scene.blocks[biOf(this)]).slot = this.value; };
    });
    box.querySelectorAll('.tb-fx-text').forEach(function (el) {
      el.oninput = function () { ensureFailFx(scene.blocks[biOf(this)]).text = this.value; };
    });
    // Condition (compétence requise) — commune
    box.querySelectorAll('.block-reqskill').forEach(function (sel) {
      sel.onchange = function () {
        const blk = scene.blocks[biOf(this)];
        blk.reqSkill = this.value;
        if (blk.reqSkill && !blk.reqVal) blk.reqVal = 1;
        renderBlocksEditor(scene, adv);
      };
    });
    box.querySelectorAll('.block-reqval').forEach(function (inp) {
      inp.oninput = function () { scene.blocks[biOf(this)].reqVal = Math.max(1, parseInt(this.value, 10) || 1); };
    });
    // Réordonnancement / suppression
    box.querySelectorAll('.block-up').forEach(function (b) {
      b.onclick = function () { const i = biOf(this); if (i <= 0) return; const t = scene.blocks[i - 1]; scene.blocks[i - 1] = scene.blocks[i]; scene.blocks[i] = t; renderBlocksEditor(scene, adv); };
    });
    box.querySelectorAll('.block-down').forEach(function (b) {
      b.onclick = function () { const i = biOf(this); if (i >= scene.blocks.length - 1) return; const t = scene.blocks[i + 1]; scene.blocks[i + 1] = scene.blocks[i]; scene.blocks[i] = t; renderBlocksEditor(scene, adv); };
    });
    box.querySelectorAll('.block-del').forEach(function (b) {
      b.onclick = function () { scene.blocks.splice(biOf(this), 1); renderBlocksEditor(scene, adv); };
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
      const diffOpts = DIFF_LEVELS.map(function (d) {
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
              // Ligne 1 : paramètres du test (compétence / difficulté / groupe)
              '<div class="adv-ct-row">' +
                '<label class="ch-mini">Compétence <select class="ch-skill">' + skillOpts + '</select></label>' +
                '<label class="ch-mini">Difficulté <select class="ch-diff">' + diffOpts + '</select></label>' +
                '<label class="ch-group-lbl" title="Tous les aventuriers lancent le test ; le groupe réussit si la majorité réussit."><input type="checkbox" class="ch-group"' + (ch.groupTest ? ' checked' : '') + '> 👥 Groupe</label>' +
              '</div>' +
              // Ligne 2 : destinations (réussite / échec)
              '<div class="adv-ct-row">' +
                '<label class="ch-mini ch-dest">Réussite → <select class="ch-success">' + sceneTargetOptions(allScenes, ch.successSceneId, adv) + '</select></label>' +
                '<label class="ch-mini ch-dest">Échec → <select class="ch-fail">' + sceneTargetOptions(allScenes, ch.failSceneId, adv) + '</select></label>' +
              '</div>' +
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
    box.querySelectorAll('.ch-group').forEach(function (cb) {
      cb.onchange = function () { scene.choices[ciOf(this)].groupTest = this.checked; };
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
    renderCombatEditor(document.getElementById('sm-monster-refs'), scene, monsters, 'adv-hero-zone');
  }
  // Éditeur de zones de combat RÉUTILISABLE : `box` = conteneur DOM, `scene` =
  // objet portant combatZones/barriers (scène OU effet de test), `radioName` =
  // nom du groupe radio « départ des aventuriers » (unique par éditeur affiché).
  function renderCombatEditor(box, scene, monsters, radioName, dualStart) {
    if (!box) return;
    ensureZones(scene);
    ensureBarriers(scene);
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
        // Backfill du nom tant que l'id résout encore (robustesse future).
        const cur = ref.monsterId ? monsters.find(function (m) { return m.id === ref.monsterId; }) : null;
        if (cur && ref.monName !== cur.name) { ref.monName = cur.name; }
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
          (dualStart
            ? '<label class="zone-start"><input type="checkbox" class="zone-startall"' + (z.heroStart ? ' checked' : '') + '> Départ des aventuriers</label>' +
              '<label class="zone-start"><input type="checkbox" class="zone-startfail"' + (z.heroStartFailed ? ' checked' : '') + '> Départ des aventuriers ayant échoué</label>'
            : '<label class="zone-start"><input type="radio" name="' + radioName + '"' + (z.heroStart ? ' checked' : '') + '> Départ des aventuriers</label>') +
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
    (zones.length < 4 ? '<button type="button" class="ghost small cbt-add-zone">+ Zone</button>' : '');

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

    function refresh() { save(); renderCombatEditor(box, scene, Store.state.monsters, radioName, dualStart); }

    box.querySelectorAll('.adv-zone').forEach(function (zEl) {
      const zi = parseInt(zEl.getAttribute('data-zi'), 10);
      const z = zones[zi];
      zEl.querySelector('.zone-name-input').oninput = function () { z.name = this.value; save(); };
      if (dualStart) {
        // Cases (non exclusives) : « départ des aventuriers » et « départ des échoués ».
        const cbAll = zEl.querySelector('.zone-startall');
        const cbFail = zEl.querySelector('.zone-startfail');
        if (cbAll) cbAll.onchange = function () { z.heroStart = this.checked; save(); };
        if (cbFail) cbFail.onchange = function () { z.heroStartFailed = this.checked; save(); };
      } else {
        const radio = zEl.querySelector('input[type="radio"]');
        if (radio) radio.onchange = function () { if (this.checked) { zones.forEach(function (zz, k) { zz.heroStart = (k === zi); }); save(); } };
      }
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
        sel.onchange = function () {
          const id = this.value;
          z.monsterRefs[mi].monsterId = id;
          // Mémorise AUSSI le nom : rend la référence robuste si l'id de l'adversaire
          // change (partage / import / duplication / recréation) — le combat le
          // retrouvera par son nom à défaut d'id.
          const m = Store.state.monsters.find(function (x) { return x.id === id; });
          z.monsterRefs[mi].monName = m ? m.name : '';
          save();
        };
      });
      zEl.querySelectorAll('.ref-count').forEach(function (inp, mi) {
        inp.oninput = function () { z.monsterRefs[mi].count = Math.max(1, parseInt(this.value, 10) || 1); save(); };
      });
      zEl.querySelectorAll('.ref-del').forEach(function (b, mi) {
        b.onclick = function () { z.monsterRefs.splice(mi, 1); refresh(); };
      });
    });
    const addZone = box.querySelector('.cbt-add-zone');
    if (addZone) addZone.onclick = function () {
      zones.push({ name: 'Zone ' + (zones.length + 1), monsterRefs: [], heroStart: false });
      refresh();
    };
  }

  // Éditeur RÉUTILISABLE de récompenses Or / Trésors / Objets Rares — mute `obj`
  // (scène ou bloc de test) : obj.goldReward (entier) + obj.treasureRewards
  // [{ name, qty, kind: 'treasure'|'rare' }].
  function renderTreasureRewards(boxId, obj) {
    const box = document.getElementById(boxId);
    if (!box) return;
    if (!Array.isArray(obj.treasureRewards)) obj.treasureRewards = [];
    const rows = obj.treasureRewards.map(function (r, i) {
      return '<div class="tr-line" data-i="' + i + '">' +
        '<span class="tr-kind">' + (r.kind === 'rare' ? '🗝️' : '💎') + '</span>' +
        '<input type="text" class="tr-name" value="' + esc(r.name || '') + '" placeholder="' + (r.kind === 'rare' ? 'Nom de l\'Objet Rare (ex : Clé du Dragon)' : 'Nom du Trésor (ex : Saphir)') + '" />' +
        '<label class="tr-qty-lbl">×<input type="text" class="tr-qty" value="' + esc(r.qty == null ? 1 : r.qty) + '" style="width:60px" title="Quantité fixe ou en dés (ex : 2, 1d3, 2d6)" /></label>' +
        '<button type="button" class="icon-btn tr-del">✕</button>' +
      '</div>';
    }).join('');
    box.innerHTML =
      '<div class="tr-row">' +
        '<label class="tr-gold-lbl">🪙 Or <input type="text" class="tr-gold" value="' + esc(obj.goldReward == null ? 0 : obj.goldReward) + '" style="width:80px" title="Quantité fixe ou en dés (ex : 25, 2d6, 3d6+5) — toujours arrondie à l\'entier" /></label>' +
        '<button type="button" class="ghost small tr-add-tre">+ Trésor</button>' +
        '<button type="button" class="ghost small tr-add-rare">+ Objet Rare</button>' +
      '</div>' + rows;
    box.querySelector('.tr-gold').onchange = function () {
      const v = this.value.trim();
      // Valeur fixe (entier) OU notation en dés (« 2d6 », « 1d3+1 ») — stockée brute.
      obj.goldReward = Store.isDiceExpr(v) ? v : Math.max(0, Math.round(parseInt(v, 10) || 0));
      this.value = obj.goldReward;
    };
    box.querySelector('.tr-add-tre').onclick = function () {
      obj.treasureRewards.push({ name: '', qty: 1, kind: 'treasure' });
      renderTreasureRewards(boxId, obj);
    };
    box.querySelector('.tr-add-rare').onclick = function () {
      obj.treasureRewards.push({ name: '', qty: 1, kind: 'rare' });
      renderTreasureRewards(boxId, obj);
    };
    box.querySelectorAll('.tr-line').forEach(function (line) {
      const i = parseInt(line.getAttribute('data-i'), 10);
      line.querySelector('.tr-name').oninput = function () { obj.treasureRewards[i].name = this.value; };
      line.querySelector('.tr-qty').onchange = function () {
        const v = this.value.trim();
        obj.treasureRewards[i].qty = Store.isDiceExpr(v) ? v : Math.max(1, Math.round(parseInt(v, 10) || 1));
        this.value = obj.treasureRewards[i].qty;
      };
      line.querySelector('.tr-del').onclick = function () {
        obj.treasureRewards.splice(i, 1);
        renderTreasureRewards(boxId, obj);
      };
    });
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

  // Éditeur générique d'une liste de récompenses-objets, réutilisable (récompense
  // de scène ET test de fouille). `boxId` = conteneur, `list` = tableau muté sur
  // place, `addId` = id du bouton d'ajout.
  function renderItemRewardsList(boxId, list, addId) {
    const items = Store.state.items;
    const box = document.getElementById(boxId);
    if (!box) return;
    const rerender = function () { renderItemRewardsList(boxId, list, addId); };
    box.innerHTML = (list || []).map(function (ref, i) {
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
        '<input type="text" class="ir-qty' + (Store.isDiceExpr(ref.qty) ? ' ir-qty-dice' : '') + '" value="' + esc(String(ref.qty == null ? 1 : ref.qty)) + '" title="Quantité : valeur fixe ou en dés (ex. « 2d6 »)" placeholder="1 · 2d6" style="width:64px" />' +
        '<button type="button" class="icon-btn ir-del">✕</button>' +
      '</div>';
    }).join('') +
    '<button type="button" class="ghost small" id="' + addId + '">+ Objet</button>';

    box.querySelectorAll('.ir-type').forEach(function (sel, i) {
      sel.onchange = function () { list[i].type = this.value; list[i].itemId = ''; rerender(); };
    });
    box.querySelectorAll('.ir-item').forEach(function (sel, i) {
      sel.onchange = function () { list[i].itemId = this.value; };
    });
    box.querySelectorAll('.ir-qty').forEach(function (inp, i) {
      // Quantité en dés (« 2d6 ») ou fixe : stockée telle quelle, résolue au don.
      inp.oninput = function () {
        const raw = (this.value || '').trim();
        list[i].qty = Store.isDiceExpr(raw) ? raw : Math.max(1, parseInt(raw, 10) || 1);
        this.classList.toggle('ir-qty-dice', Store.isDiceExpr(raw));
      };
    });
    box.querySelectorAll('.ir-del').forEach(function (b, i) {
      b.onclick = function () { list.splice(i, 1); rerender(); };
    });
    const addBtn = document.getElementById(addId);
    if (addBtn) addBtn.onclick = function () { list.push({ itemId: '', qty: 1, type: 'weapon' }); rerender(); };
  }
  function renderItemRewards(scene) {
    if (!Array.isArray(scene.itemRewards)) scene.itemRewards = [];
    renderItemRewardsList('sm-item-rewards', scene.itemRewards, 'sm-add-ir');
  }

  function init() { render(); }

  global.Adventure = { init: init, render: render };
})(window);
