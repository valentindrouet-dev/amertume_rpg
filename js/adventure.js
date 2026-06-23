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
  let collapsedChapters = {}; // { chapterId: true } — état enroulé dans l'éditeur

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

  // Modèle vide d'une scène
  function newScene(id) {
    return {
      id: id || Store.uid(),
      type: 'exploration',
      title: '',
      text: '',           // champ hérité — conservé pour compatibilité
      blocks: [],         // [{ id, type, content }]
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
    return { id: Store.uid(), title: '', scenes: [] };
  }

  function newAdventure() {
    return { id: Store.uid(), title: 'Nouvelle aventure', chapters: [] };
  }

  // ---------- Utilitaires d'arborescence / navigation ----------
  function buildAllScenes(adv) {
    const arr = [];
    adv.chapters.forEach(function (c) {
      c.scenes.forEach(function (s) {
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
        if (c.targetSceneId) links.push({ label: '« ' + (c.label || 'choix') + ' »', targetId: c.targetSceneId });
      });
      if (scene.nextSceneId) links.push({ label: 'suite', targetId: scene.nextSceneId });
    } else if (scene.type !== 'fin') {
      if (scene.nextSceneId) links.push({ label: 'suite', targetId: scene.nextSceneId });
    }
    return links;
  }

  // ---------- Persistance ----------
  function load() { adventures = Store.loadAdventures(); }
  function save() { Store.saveAdventures(adventures); }

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
      '</div>';

    renderList();
    $('#adv-new').addEventListener('click', function () {
      const a = newAdventure();
      adventures.push(a);
      save();
      openEditor(a.id);
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
          '<button class="ghost small adv-play" data-id="' + a.id + '">▶ Jouer</button>' +
          '<button class="icon-btn adv-del" data-id="' + a.id + '" title="Supprimer">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    box.querySelectorAll('.adv-edit').forEach(function (b) {
      b.addEventListener('click', function () { openEditor(b.getAttribute('data-id')); });
    });
    box.querySelectorAll('.adv-play').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.Session) Session.startFromAdventure(b.getAttribute('data-id'));
      });
    });
    box.querySelectorAll('.adv-del').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Supprimer cette aventure ?')) return;
        adventures = adventures.filter(function (a) { return a.id !== b.getAttribute('data-id'); });
        save(); renderList();
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
      return '<div class="adv-chapter' + (collapsed ? ' collapsed' : '') + '" data-ch="' + ch.id + '">' +
        '<div class="adv-ch-head">' +
          '<button type="button" class="icon-btn adv-ch-toggle" data-ch="' + ch.id + '" title="' + (collapsed ? 'Dérouler' : 'Enrouler') + '">' + (collapsed ? '▸' : '▾') + '</button>' +
          '<span class="adv-ch-num">Chapitre ' + (ci + 1) + '</span>' +
          '<input type="text" class="adv-ch-title" data-ch="' + ch.id + '" value="' + esc(ch.title) + '" placeholder="Titre du chapitre" />' +
          (collapsed ? '<span class="adv-ch-count">' + ch.scenes.length + ' scène(s)</span>' : '') +
          '<button class="icon-btn adv-del-ch" data-ch="' + ch.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        (collapsed ? '' :
          '<div class="adv-scenes" id="scenes-' + ch.id + '">' + renderScenesHTML(ch, a) + '</div>' +
          '<button class="ghost small adv-add-scene" data-ch="' + ch.id + '" style="margin:.4rem 0 .8rem">+ Scène</button>') +
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
    box.querySelectorAll('.adv-del-scene').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        const ch = a.chapters.find(function (c) { return c.id === b.getAttribute('data-ch'); });
        if (!ch) return;
        if (!confirm('Supprimer cette scène ?')) return;
        ch.scenes = ch.scenes.filter(function (s) { return s.id !== b.getAttribute('data-scene'); });
        save(); renderChapters(a);
      });
    });
  }

  function renderScenesHTML(ch, adv) {
    if (!ch.scenes.length) return '<p class="empty" style="padding:.3rem 0">Aucune scène.</p>';
    const titles = sceneTitleMap(adv);
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
      const last = si === ch.scenes.length - 1;
      return '<div class="adv-scene-item">' +
        '<div class="adv-scene-row" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Cliquer pour éditer">' +
          '<span class="adv-scene-num">' + (si + 1) + '</span>' +
          '<span class="adv-scene-type type-' + s.type + '">' + typeLabel + '</span>' +
          '<span class="adv-scene-title">' + esc(s.title || '(sans titre)') + '</span>' +
          '<span class="adv-scene-tools">' +
            '<button type="button" class="icon-btn sc-up" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Monter"' + (si === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="icon-btn sc-down" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Descendre"' + (last ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="icon-btn adv-del-scene del-btn" data-ch="' + ch.id + '" data-scene="' + s.id + '" title="Supprimer">✕</button>' +
          '</span>' +
        '</div>' +
        tree +
      '</div>';
    }).join('');
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

  function sceneTargetOptions(allScenes, selectedId) {
    return '<option value="">(aucune)</option>' +
      allScenes.map(function (s) {
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
    const type = scene.type;
    const monsters = Store.state.monsters;
    const items = Store.state.items;
    const allScenes = buildAllScenes(adv);

    // Choix / navigation
    const choicesBox = document.getElementById('sm-choices-section');
    const combatBox = document.getElementById('sm-combat-section');
    const rewardBox = document.getElementById('sm-reward-section');
    const nextBox = document.getElementById('sm-next-section');

    // nextSceneId (exploration, interaction, reward)
    nextBox.style.display = (type === 'combat' || type === 'fin') ? 'none' : '';
    document.getElementById('sm-next').innerHTML = sceneTargetOptions(allScenes, scene.nextSceneId);
    document.getElementById('sm-next').onchange = function () {
      if (handleTargetSelect(this.value, scene, adv, function (id) { scene.nextSceneId = id; })) {
        refreshSceneModalSections(scene, adv);
      }
    };

    // Choices (exploration, interaction)
    choicesBox.style.display = (type === 'exploration' || type === 'interaction') ? '' : 'none';
    renderChoicesEditor(scene, adv);

    // Combat
    combatBox.style.display = type === 'combat' ? '' : 'none';
    if (type === 'combat') {
      document.getElementById('sm-outcome').innerHTML = sceneTargetOptions(allScenes, scene.outcomeSceneId);
      document.getElementById('sm-defeat').innerHTML = sceneTargetOptions(allScenes, scene.defeatSceneId);
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
    }

    // Reward
    rewardBox.style.display = type === 'reward' ? '' : 'none';
    if (type === 'reward') {
      document.getElementById('sm-xp').value = scene.xpReward || 0;
      document.getElementById('sm-xp').onchange = function () { scene.xpReward = parseInt(this.value, 10) || 0; };
      renderItemRewards(scene, items);
    }
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
        return '<div class="adv-block-row">' +
          '<div class="adv-block-row-head">' +
            '<select class="block-type-sel">' + typeOpts + '</select>' +
            '<button type="button" class="icon-btn block-up" title="Monter"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="icon-btn block-down" title="Descendre"' + (last ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="icon-btn block-del" title="Supprimer ce bloc">✕</button>' +
          '</div>' +
          '<textarea class="block-content" rows="3">' + esc(blk.content || '') + '</textarea>' +
        '</div>';
      }).join('');
    }
    box.querySelectorAll('.block-type-sel').forEach(function (sel, i) {
      sel.onchange = function () { scene.blocks[i].type = this.value; };
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
    const allScenes = buildAllScenes(adv);
    box.innerHTML = (scene.choices || []).map(function (ch, i) {
      const typeOpts = CHOICE_TYPES.map(function (t) {
        return '<option value="' + t.value + '"' + ((ch.choiceType || 'neutre') === t.value ? ' selected' : '') + '>' + esc(t.label) + '</option>';
      }).join('');
      return '<div class="adv-choice-row" data-ci="' + i + '">' +
        '<div class="adv-choice-main">' +
          '<input type="text" class="ch-label" value="' + esc(ch.label) + '" placeholder="Texte du choix" />' +
          '<select class="ch-type choice-type-' + (ch.choiceType || 'neutre') + '">' + typeOpts + '</select>' +
          '<select class="ch-target">' + sceneTargetOptions(allScenes, ch.targetSceneId) + '</select>' +
          '<button type="button" class="icon-btn ch-del" title="Supprimer ce choix">✕</button>' +
        '</div>' +
        '<input type="text" class="ch-desc" value="' + esc(ch.description || '') + '" ' +
          'placeholder="Description / contexte affiché aux joueurs sous le choix (optionnel)" />' +
      '</div>';
    }).join('') +
    '<button type="button" class="ghost small" id="sm-add-choice">+ Choix</button>';

    box.querySelectorAll('.ch-label').forEach(function (inp, i) {
      inp.oninput = function () { scene.choices[i].label = this.value; };
    });
    box.querySelectorAll('.ch-type').forEach(function (sel, i) {
      sel.onchange = function () {
        scene.choices[i].choiceType = this.value;
        this.className = 'ch-type choice-type-' + this.value;
      };
    });
    box.querySelectorAll('.ch-desc').forEach(function (inp, i) {
      inp.oninput = function () { scene.choices[i].description = this.value; };
    });
    box.querySelectorAll('.ch-target').forEach(function (sel, i) {
      sel.onchange = function () {
        if (handleTargetSelect(this.value, scene, adv, function (id) { scene.choices[i].targetSceneId = id; })) {
          refreshSceneModalSections(scene, adv);
        }
      };
    });
    box.querySelectorAll('.ch-del').forEach(function (b, i) {
      b.onclick = function () { scene.choices.splice(i, 1); renderChoicesEditor(scene, adv); };
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

  function renderMonsterRefs(scene, monsters) {
    ensureZones(scene);
    const box = document.getElementById('sm-monster-refs');
    const zones = scene.combatZones;
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
      return '<div class="adv-zone" data-zi="' + zi + '">' +
        '<div class="adv-zone-head">' +
          '<input type="text" class="zone-name-input" value="' + esc(z.name || ('Zone ' + (zi + 1))) + '" placeholder="Nom de la zone" />' +
          '<label class="zone-start"><input type="radio" name="adv-hero-zone"' + (z.heroStart ? ' checked' : '') + '> Départ des aventuriers</label>' +
          (zones.length > 1 ? '<button type="button" class="icon-btn zone-del" title="Supprimer la zone">✕</button>' : '') +
        '</div>' +
        rows +
        '<button type="button" class="ghost small zone-add-mon">+ Monstre</button>' +
      '</div>';
    }).join('') +
    (zones.length < 4 ? '<button type="button" class="ghost small" id="sm-add-zone">+ Zone</button>' : '');

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

  function renderItemRewards(scene, items) {
    const box = document.getElementById('sm-item-rewards');
    const weapons = items.filter(function (i) { return i.category === 'weapon' || i.category === 'armor' || i.category === 'object' || i.category === 'misc'; });
    box.innerHTML = (scene.itemRewards || []).map(function (ref, i) {
      const opts = weapons.map(function (it) {
        return '<option value="' + it.id + '"' + (it.id === ref.itemId ? ' selected' : '') + '>' + esc(it.name) + '</option>';
      }).join('');
      return '<div class="adv-ref-row">' +
        '<select class="ir-item"><option value="">(choisir)</option>' + opts + '</select>' +
        '<input type="number" class="ir-qty" value="' + (ref.qty || 1) + '" min="1" style="width:55px" />' +
        '<button type="button" class="icon-btn ir-del">✕</button>' +
      '</div>';
    }).join('') +
    '<button type="button" class="ghost small" id="sm-add-ir">+ Objet</button>';

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
      scene.itemRewards.push({ itemId: '', qty: 1 });
      renderItemRewards(scene, Store.state.items);
    };
  }

  function init() { render(); }

  global.Adventure = { init: init, render: render };
})(window);
