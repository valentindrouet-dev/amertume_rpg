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
    { value: 'exploration',  label: 'Exploration'  },
    { value: 'interaction',  label: 'Interaction'  },
    { value: 'combat',       label: 'Combat'       },
    { value: 'reward',       label: 'Récompense'   },
    { value: 'fin',          label: 'Fin'          },
  ];

  // ---------- Données ----------
  let adventures = [];

  // Modèle vide d'une scène
  function newScene(id) {
    return {
      id: id || Store.uid(),
      type: 'exploration',
      title: '',
      text: '',
      // navigation
      choices: [],        // [{ id, label, targetSceneId }]
      nextSceneId: null,  // pour fin auto sans choix
      // combat
      monsterRefs: [],    // [{ monsterId, count }]
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
        '<div class="adv-title-row">' +
          '<label class="adv-label">Titre de l\'aventure' +
            '<input type="text" id="adv-title" value="' + esc(a.title) + '" />' +
          '</label>' +
        '</div>' +
        '<div id="adv-chapters"></div>' +
        '<button id="adv-add-chapter" class="ghost" style="margin-top:.5rem">+ Chapitre</button>' +
      '</div>';

    $('#adv-back').addEventListener('click', function () { render(); });
    $('#adv-title').addEventListener('input', function () {
      a.title = this.value;
      $('#adv-title-display').textContent = a.title;
      save();
    });
    $('#adv-add-chapter').addEventListener('click', function () {
      a.chapters.push(newChapter());
      save();
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
      return '<div class="adv-chapter" data-ch="' + ch.id + '">' +
        '<div class="adv-ch-head">' +
          '<span class="adv-ch-num">Chapitre ' + (ci + 1) + '</span>' +
          '<input type="text" class="adv-ch-title" data-ch="' + ch.id + '" value="' + esc(ch.title) + '" placeholder="Titre du chapitre" />' +
          '<button class="icon-btn adv-del-ch" data-ch="' + ch.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="adv-scenes" id="scenes-' + ch.id + '">' +
          renderScenesHTML(ch) +
        '</div>' +
        '<button class="ghost small adv-add-scene" data-ch="' + ch.id + '" style="margin:.4rem 0 .8rem">+ Scène</button>' +
      '</div>';
    }).join('');

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
    box.querySelectorAll('.adv-edit-scene').forEach(function (b) {
      b.addEventListener('click', function () {
        openSceneModal(a, b.getAttribute('data-ch'), b.getAttribute('data-scene'));
      });
    });
    box.querySelectorAll('.adv-del-scene').forEach(function (b) {
      b.addEventListener('click', function () {
        const ch = a.chapters.find(function (c) { return c.id === b.getAttribute('data-ch'); });
        if (!ch) return;
        ch.scenes = ch.scenes.filter(function (s) { return s.id !== b.getAttribute('data-scene'); });
        save(); renderChapters(a);
      });
    });
  }

  function renderScenesHTML(ch) {
    if (!ch.scenes.length) return '<p class="empty" style="padding:.3rem 0">Aucune scène.</p>';
    return ch.scenes.map(function (s, si) {
      const typeLabel = (SCENE_TYPES.find(function (t) { return t.value === s.type; }) || {}).label || s.type;
      return '<div class="adv-scene-row">' +
        '<span class="adv-scene-num">' + (si + 1) + '</span>' +
        '<span class="adv-scene-type type-' + s.type + '">' + typeLabel + '</span>' +
        '<span class="adv-scene-title">' + esc(s.title || '(sans titre)') + '</span>' +
        '<button class="ghost small adv-edit-scene" data-ch="' + ch.id + '" data-scene="' + s.id + '">Éditer</button>' +
        '<button class="icon-btn adv-del-scene del-btn" data-ch="' + ch.id + '" data-scene="' + s.id + '">✕</button>' +
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

    // Collect all scenes for target dropdowns
    const allScenes = [];
    adv.chapters.forEach(function (c) {
      c.scenes.forEach(function (s) {
        allScenes.push({ id: s.id, label: (c.title ? c.title + ' / ' : '') + (s.title || s.id.slice(-4)) });
      });
    });

    const modal = document.getElementById('scene-modal');
    modal.removeAttribute('hidden');

    document.getElementById('sm-title').value = scene.title || '';
    document.getElementById('sm-text').value = scene.text || '';
    const typeSelect = document.getElementById('sm-type');
    typeSelect.value = scene.type || 'exploration';

    refreshSceneModalSections(scene, adv, allScenes);

    typeSelect.onchange = function () {
      scene.type = typeSelect.value;
      refreshSceneModalSections(scene, adv, allScenes);
    };
    document.getElementById('sm-title').oninput = function () { scene.title = this.value; };
    document.getElementById('sm-text').oninput = function () { scene.text = this.value; };

    document.getElementById('sm-save').onclick = function () {
      save();
      modal.setAttribute('hidden', '');
      renderChapters(adv);
    };
    document.getElementById('sm-close').onclick = function () {
      modal.setAttribute('hidden', '');
      renderChapters(adv);
    };
  }

  function sceneTargetOptions(allScenes, selectedId) {
    return '<option value="">(aucune)</option>' +
      allScenes.map(function (s) {
        return '<option value="' + s.id + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.label) + '</option>';
      }).join('');
  }

  function refreshSceneModalSections(scene, adv, allScenes) {
    const type = scene.type;
    const monsters = Store.state.monsters;
    const items = Store.state.items;

    // Choix / navigation
    const choicesBox = document.getElementById('sm-choices-section');
    const combatBox = document.getElementById('sm-combat-section');
    const rewardBox = document.getElementById('sm-reward-section');
    const nextBox = document.getElementById('sm-next-section');

    // nextSceneId (exploration, interaction, reward)
    nextBox.style.display = (type === 'combat' || type === 'fin') ? 'none' : '';
    document.getElementById('sm-next').innerHTML = sceneTargetOptions(allScenes, scene.nextSceneId);
    document.getElementById('sm-next').onchange = function () { scene.nextSceneId = this.value || null; };

    // Choices (exploration, interaction)
    choicesBox.style.display = (type === 'exploration' || type === 'interaction') ? '' : 'none';
    renderChoicesEditor(scene, allScenes);

    // Combat
    combatBox.style.display = type === 'combat' ? '' : 'none';
    if (type === 'combat') {
      document.getElementById('sm-outcome').innerHTML = sceneTargetOptions(allScenes, scene.outcomeSceneId);
      document.getElementById('sm-defeat').innerHTML = sceneTargetOptions(allScenes, scene.defeatSceneId);
      document.getElementById('sm-outcome').onchange = function () { scene.outcomeSceneId = this.value || null; };
      document.getElementById('sm-defeat').onchange = function () { scene.defeatSceneId = this.value || null; };
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

  function renderChoicesEditor(scene, allScenes) {
    const box = document.getElementById('sm-choices');
    box.innerHTML = (scene.choices || []).map(function (ch, i) {
      return '<div class="adv-choice-row" data-ci="' + i + '">' +
        '<input type="text" class="ch-label" value="' + esc(ch.label) + '" placeholder="Texte du choix" />' +
        '<select class="ch-target">' + sceneTargetOptions(allScenes, ch.targetSceneId) + '</select>' +
        '<button class="icon-btn ch-del">✕</button>' +
      '</div>';
    }).join('') +
    '<button class="ghost small" id="sm-add-choice">+ Choix</button>';

    box.querySelectorAll('.ch-label').forEach(function (inp, i) {
      inp.oninput = function () { scene.choices[i].label = this.value; };
    });
    box.querySelectorAll('.ch-target').forEach(function (sel, i) {
      sel.onchange = function () { scene.choices[i].targetSceneId = this.value || null; };
    });
    box.querySelectorAll('.ch-del').forEach(function (b, i) {
      b.onclick = function () { scene.choices.splice(i, 1); renderChoicesEditor(scene, allScenes); };
    });
    const addBtn = document.getElementById('sm-add-choice');
    if (addBtn) addBtn.onclick = function () {
      scene.choices.push({ id: Store.uid(), label: '', targetSceneId: null });
      renderChoicesEditor(scene, allScenes);
    };
  }

  function renderMonsterRefs(scene, monsters) {
    const box = document.getElementById('sm-monster-refs');
    box.innerHTML = (scene.monsterRefs || []).map(function (ref, i) {
      const monOpts = monsters.map(function (m) {
        return '<option value="' + m.id + '"' + (m.id === ref.monsterId ? ' selected' : '') + '>' + esc(m.name) + '</option>';
      }).join('');
      return '<div class="adv-ref-row" data-ri="' + i + '">' +
        '<select class="ref-mon"><option value="">(choisir)</option>' + monOpts + '</select>' +
        '<input type="number" class="ref-count" value="' + (ref.count || 1) + '" min="1" style="width:55px" />' +
        '<button class="icon-btn ref-del">✕</button>' +
      '</div>';
    }).join('') +
    '<button class="ghost small" id="sm-add-ref">+ Monstre</button>';

    box.querySelectorAll('.ref-mon').forEach(function (sel, i) {
      sel.onchange = function () { scene.monsterRefs[i].monsterId = this.value; };
    });
    box.querySelectorAll('.ref-count').forEach(function (inp, i) {
      inp.oninput = function () { scene.monsterRefs[i].count = Math.max(1, parseInt(this.value, 10) || 1); };
    });
    box.querySelectorAll('.ref-del').forEach(function (b, i) {
      b.onclick = function () { scene.monsterRefs.splice(i, 1); renderMonsterRefs(scene, Store.state.monsters); };
    });
    const addBtn = document.getElementById('sm-add-ref');
    if (addBtn) addBtn.onclick = function () {
      scene.monsterRefs.push({ monsterId: '', count: 1 });
      renderMonsterRefs(scene, Store.state.monsters);
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
        '<button class="icon-btn ir-del">✕</button>' +
      '</div>';
    }).join('') +
    '<button class="ghost small" id="sm-add-ir">+ Objet</button>';

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
