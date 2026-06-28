/*
 * Éditeur des talents génériques et de classe (partie MJ / Admin).
 * Reprend le design de l'Armurerie : carte d'en-tête, recherche, colonnes à
 * languettes (une colonne par groupe : Génériques + 8 classes), édition par
 * mini-fenêtre. Chaque talent peut être relié à un EFFET de la bibliothèque
 * (Action bleu · Réaction violet · Passif vert · Amélioration ambre).
 */
(function (global) {
  'use strict';

  const D = (typeof AmertumeDice !== 'undefined') ? AmertumeDice : null;
  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // Toutes les classes connues (données préservées même pour les classes cachées)
  const CLASS_NAMES_ALL = ['Apothicaire', 'Artificier', 'Chasseur', 'Destructeur', 'Déviant',
    'Gardien', 'Lamevent', 'Pyromane'];
  // Classes actuellement affichées (sync avec PLAYABLE_CLASSES dans combatants.js)
  const CLASS_NAMES = ['Destructeur', 'Gardien', 'Lamevent', 'Pyromane'];
  const USAGE = [
    { value: 'both',   label: 'Combat & hors combat' },
    { value: 'combat', label: 'En combat' },
    { value: 'out',    label: 'Hors combat' },
  ];
  const KIND_LABEL = { action: 'Action', reaction: 'Réaction', passive: 'Passif', upgrade: 'Amélioration', mastery: 'Maîtrise' };
  const KIND_SHORT = { action: 'ACT', reaction: 'REAC', passive: 'PASS', upgrade: 'AME', mastery: 'MAIT' };
  const KIND_ORDER = ['action', 'reaction', 'passive', 'upgrade', 'mastery'];
  // Libellés lisibles des valeurs de choix (les états internes → noms affichés).
  const CHOICE_LABELS = { feu: 'Feu', auSol: 'Au sol', affaibli: 'Affaibli' };

  let classes = [];
  let generics = [];
  let term = '';
  let groupFilter = '';

  function effectCatalog() { return Store.talentEffects ? Store.talentEffects() : []; }
  function effectMap() { return Store.talentEffectMap ? Store.talentEffectMap() : {}; }
  function classSlug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  let hiddenClasses = []; // classes non-jouables chargées mais non affichées
  function load() {
    const stored = Store.loadClasses();
    const byName = {};
    stored.forEach(function (c) { byName[c.name] = c; });
    classes = CLASS_NAMES.map(function (name) {
      const c = byName[name] || { name: name, talents: [] };
      if (!Array.isArray(c.talents)) c.talents = [];
      return c;
    });
    // Préserver les données des classes cachées pour ne pas les perdre lors d'un save()
    hiddenClasses = CLASS_NAMES_ALL.filter(function (n) { return CLASS_NAMES.indexOf(n) < 0; })
      .map(function (name) { return byName[name] || { name: name, talents: [] }; });
    generics = Store.loadGenericTalents();
  }
  // Sauvegarde les classes affichées + les classes cachées (données préservées)
  function save() { Store.saveClasses(classes.concat(hiddenClasses)); }
  function saveGen() { Store.saveGenericTalents(generics); }
  function persist() { save(); saveGen(); }

  function newTalent() {
    // Par défaut « En combat » : c'est de loin le cas le plus fréquent.
    return { id: Store.uid(), name: '', level: 1, usage: 'combat', kind: '', effects: [], description: '' };
  }

  // Type effectif d'un talent (depuis son effet si le kind n'est pas stocké)
  function talentKind(t) {
    return t.kind || (t.effect && effectMap()[t.effect] ? effectMap()[t.effect].kind : '');
  }
  // Tri des talents : par Niveau, puis par Type (KIND_ORDER), puis alphabétique.
  let sortMode = 'level'; // 'level' | 'name'
  function sortTalents(list) {
    return list.slice().sort(function (a, b) {
      if (sortMode === 'name') return (a.name || '').localeCompare(b.name || '');
      const lvl = (a.level || 1) - (b.level || 1);
      if (lvl) return lvl;
      const ka = KIND_ORDER.indexOf(talentKind(a)); const kb = KIND_ORDER.indexOf(talentKind(b));
      const ra = ka < 0 ? 99 : ka; const rb = kb < 0 ? 99 : kb;
      if (ra !== rb) return ra - rb;
      return (a.name || '').localeCompare(b.name || '');
    });
  }
  function emptyPool() { return D ? D.emptyPool() : { black: 0, red: 0, blue: 0, green: 0, yellow: 0, white: 0, bone: 0 }; }

  // Liste des groupes (Génériques + chaque classe), avec leur tableau de talents
  function groups() {
    const g = [{ key: 'generic', ref: 'generic', name: '★ Génériques', slug: 'generique', list: generics }];
    classes.forEach(function (c) {
      g.push({ key: 'class', ref: c.name, name: c.name, slug: classSlug(c.name), list: c.talents });
    });
    return g;
  }
  function groupByRef(ref) { return groups().find(function (g) { return g.ref === ref; }) || null; }

  // ---- Bibliothèque des effets (panneau de référence repliable) ----
  function libraryHTML() {
    const cat = effectCatalog();
    const byKind = {};
    cat.forEach(function (e) { (byKind[e.kind] = byKind[e.kind] || []).push(e); });
    const sections = KIND_ORDER.filter(function (k) { return byKind[k]; }).map(function (k) {
      const rows = byKind[k].map(function (e) {
        return '<div class="lib-row">' +
          '<span class="lib-eff-desc">' + esc(e.desc) + '</span>' +
          (e.hasVal ? '<span class="lib-eff-var">X = ' + esc(e.valLabel || 'valeur') + '</span>' : '') +
        '</div>';
      }).join('');
      return '<div class="lib-kind lib-kind-' + k + '">' +
        '<div class="lib-kind-head">' + esc(KIND_LABEL[k]) + '</div>' + rows + '</div>';
    }).join('');
    return '<details class="card lib-card">' +
      '<summary><b>📖 Bibliothèque des effets</b> — ' + cat.length + ' effets câblés au moteur</summary>' +
      '<p class="hint">Reliez un talent à un effet pour le rendre actif en combat. ' +
        '<span class="lib-leg lib-kind-action">Action</span> · ' +
        '<span class="lib-leg lib-kind-reaction">Réaction</span> · ' +
        '<span class="lib-leg lib-kind-passive">Passif</span> · ' +
        '<span class="lib-leg lib-kind-upgrade">Amélioration</span> · ' +
        '<span class="lib-leg lib-kind-mastery">Maîtrise</span>.</p>' +
      sections +
    '</details>';
  }

  function render() {
    load();
    const root = $('#classes-root');
    if (!root) return;
    const groupOpts = '<option value="">Tous les groupes</option>' +
      groups().map(function (g) {
        return '<option value="' + esc(g.ref) + '"' + (g.ref === groupFilter ? ' selected' : '') + '>' +
          esc(g.name.replace('★ ', '')) + '</option>';
      }).join('');
    root.innerHTML =
      libraryHTML() +
      '<div class="card">' +
        '<div class="card-head">' +
          '<h2>Talents</h2>' +
          '<div style="display:flex; gap:.4rem;">' +
            '<button id="tl-add" class="primary">+ Ajouter</button>' +
          '</div>' +
        '</div>' +
        '<p class="hint">Catalogue des talents d\'aventuriers. Le premier groupe rassemble les ' +
          '<b>talents génériques</b> (accessibles à tous au niveau requis) ; viennent ensuite ' +
          'les talents propres à chaque classe.</p>' +
        '<div class="filters">' +
          '<input id="tl-search" type="search" placeholder="Rechercher…" value="' + esc(term) + '" />' +
          '<select id="tl-groupfilter">' + groupOpts + '</select>' +
          '<select id="tl-sort">' +
            '<option value="level"' + (sortMode === 'level' ? ' selected' : '') + '>Tri : niveau</option>' +
            '<option value="name"' + (sortMode === 'name' ? ' selected' : '') + '>Tri : nom</option>' +
          '</select>' +
        '</div>' +
        '<div id="class-list" class="roster-list inv-strip-layout"></div>' +
      '</div>';
    $('#tl-add').addEventListener('click', function () { openTalentModal(null); });
    $('#tl-search').addEventListener('input', function () { term = this.value.toLowerCase().trim(); renderColumns(); });
    $('#tl-groupfilter').addEventListener('change', function () { groupFilter = this.value; renderColumns(); });
    $('#tl-sort').addEventListener('change', function () { sortMode = this.value; renderColumns(); });
    renderColumns();
  }

  function matches(t) {
    if (!term) return true;
    return (t.name || '').toLowerCase().indexOf(term) >= 0 ||
           (t.description || '').toLowerCase().indexOf(term) >= 0;
  }

  // Languette d'un talent (design Armurerie), colorée par type d'effet
  // Nom d'un talent (tous groupes) à partir de son id.
  function talentNameById(id) {
    if (!id) return '';
    let found = '';
    groups().forEach(function (g) {
      (g.list || []).forEach(function (t) { if (t.id === id) found = t.name || ''; });
    });
    return found;
  }
  function talentStrip(t, ref) {
    const kind = t.kind || (t.effect && effectMap()[t.effect] ? effectMap()[t.effect].kind : '');
    const right =
      (kind ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_SHORT[kind] || kind) + '</span>' : '<span class="tl-kind tl-kind-none">Descriptif</span>') +
      '<span class="tal-lvl">Niv. ' + (t.level || 1) + '</span>';
    const prereqName = t.prereq ? talentNameById(t.prereq) : '';
    const prereqChip = prereqName ? '<span class="tal-prereq" title="Nécessite : ' + esc(prereqName) + '">↳ ' + esc(prereqName) + '</span>' : '';
    return '<div class="tal-row-wrap">' +
      '<div class="inv-strip-row tal-row tal-kind-' + (kind || 'none') + '">' +
        '<div class="inv-strip tal-strip" data-desc-toggle="1" title="Voir le descriptif">' +
          '<span class="inv-strip-name">' + esc(t.name || '(sans nom)') + '</span>' +
          '<span class="inv-strip-val">' + prereqChip + right + '</span>' +
        '</div>' +
        '<button class="inv-strip-edit" data-edit="' + esc(ref) + '" data-tid="' + esc(t.id) + '" title="Éditer">✎</button>' +
      '</div>' +
      (t.description ? '<div class="tal-strip-desc" hidden>' + esc(t.description) + '</div>' : '') +
    '</div>';
  }

  function renderColumns() {
    const box = $('#class-list');
    if (!box) return;
    const shown = groups().filter(function (g) { return !groupFilter || g.ref === groupFilter; });
    box.innerHTML = '<div class="tal-cols">' + shown.map(function (g) {
      const items = sortTalents(g.list.filter(matches));
      const strips = items.length
        ? items.map(function (t) { return talentStrip(t, g.ref); }).join('')
        : '<p class="inv-col-empty">—</p>';
      return '<div class="tal-col">' +
        '<div class="tal-col-hdr klass-' + g.slug + '">' +
          '<span class="tal-col-name">' + esc(g.name) + '</span>' +
          '<span class="tag">' + g.list.length + '</span>' +
          '<button class="ghost small tl-col-add" data-ref="' + esc(g.ref) + '">+</button>' +
        '</div>' +
        '<div class="tal-col-body">' + strips + '</div>' +
      '</div>';
    }).join('') + '</div>';

    box.querySelectorAll('.tl-col-add').forEach(function (b) {
      b.addEventListener('click', function () { openTalentModal(null, b.getAttribute('data-ref')); });
    });
    // Le crayon ouvre l'éditeur ; le corps de la languette déroule le descriptif.
    box.querySelectorAll('.inv-strip-edit[data-edit]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTalentModal(el.getAttribute('data-tid'), el.getAttribute('data-edit'));
      });
    });
    box.querySelectorAll('.tal-strip[data-desc-toggle]').forEach(function (el) {
      el.addEventListener('click', function () {
        const wrap = el.closest('.tal-row-wrap');
        const desc = wrap ? wrap.querySelector('.tal-strip-desc') : null;
        if (desc) desc.hidden = !desc.hidden;
      });
    });
  }

  // ---- Mini-fenêtre d'édition d'un talent ----
  let editing = null; // { ref, id } du talent en cours d'édition (null = création)

  function effectOptions(cur) {
    const cat = effectCatalog();
    let html = '<option value="">— Aucun (descriptif) —</option>';
    KIND_ORDER.forEach(function (k) {
      const list = cat.filter(function (e) { return e.kind === k; });
      if (!list.length) return;
      html += '<optgroup label="' + esc(KIND_LABEL[k]) + '">' +
        list.map(function (e) {
          return '<option value="' + esc(e.effect) + '" title="' + esc(e.name) + '"' + (e.effect === cur ? ' selected' : '') + '>' + esc(e.desc) + '</option>';
        }).join('') +
      '</optgroup>';
    });
    return html;
  }
  function groupOptions(cur) {
    return groups().map(function (g) {
      return '<option value="' + esc(g.ref) + '"' + (g.ref === cur ? ' selected' : '') + '>' +
        esc(g.name.replace('★ ', '')) + '</option>';
    }).join('');
  }

  // Options de prérequis : tous les talents (génériques + classes), sauf celui édité.
  // Regroupés par groupe pour s'y retrouver. `cur` = id prérequis sélectionné.
  function prereqOptions(selfId, cur) {
    let html = '<option value="">— Aucun —</option>';
    groups().forEach(function (g) {
      const list = (g.list || []).filter(function (t) { return t.id && t.id !== selfId; });
      if (!list.length) return;
      html += '<optgroup label="' + esc(g.name.replace('★ ', '')) + '">' +
        list.map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (t.id === cur ? ' selected' : '') + '>' + esc(t.name || '(sans nom)') + '</option>';
        }).join('') +
      '</optgroup>';
    });
    return html;
  }

  function findTalent(ref, id) {
    const g = groupByRef(ref);
    if (!g) return null;
    return g.list.find(function (t) { return t.id === id; }) || null;
  }

  // ---- Lignes d'effet (multi-effets, chacune avec ses paramètres) ----
  // Met à jour les champs conditionnels (X, portée, dés) d'une ligne selon l'effet choisi.
  function syncEffectRow(row) {
    const eff = effectMap()[row.querySelector('.tl-eff-effect').value] || null;
    const valWrap = row.querySelector('.tl-eff-val-wrap');
    const rangeWrap = row.querySelector('.tl-eff-range-wrap');
    const diceWrap = row.querySelector('.tl-eff-dice-wrap');
    // Portée des cibles (Nombre X / Toute la zone / Tout le combat) pour les effets multi-cibles.
    const scopeWrap = row.querySelector('.tl-eff-scope-wrap');
    const scopeSel = scopeWrap ? scopeWrap.querySelector('.tl-eff-scope') : null;
    const hasScope = !!(eff && eff.hasScope);
    if (scopeWrap) { scopeWrap.hidden = !hasScope; if (hasScope && scopeSel) scopeSel.value = row._scope || 'count'; }
    const scopeVal = scopeSel ? scopeSel.value : 'count';
    // X masqué si la portée vise tout (zone / combat).
    valWrap.hidden = !(eff && eff.hasVal) || (hasScope && scopeVal !== 'count');
    if (eff && eff.hasVal) row.querySelector('.tl-eff-val-label').textContent = eff.valLabel || 'Valeur X';
    rangeWrap.hidden = !(eff && eff.hasRange);
    diceWrap.hidden = !(eff && eff.hasDice);
    // Choix paramétrable (compétence, état infligé…) : peuple et affiche le select.
    const choiceWrap = row.querySelector('.tl-eff-choice-wrap');
    if (choiceWrap) {
      const hasChoice = !!(eff && eff.hasChoice);
      choiceWrap.hidden = !hasChoice;
      if (hasChoice) {
        const sel = choiceWrap.querySelector('.tl-eff-choice');
        const prev = row._choice || sel.value || '';
        row.querySelector('.tl-eff-choice-label').textContent = eff.choiceLabel || 'Choix';
        sel.innerHTML = (eff.choices || []).map(function (ch) {
          return '<option value="' + esc(ch) + '"' + (ch === prev ? ' selected' : '') + '>' + esc(CHOICE_LABELS[ch] || ch) + '</option>';
        }).join('');
      }
    }
    const kind = eff ? eff.kind : '';
    row.querySelector('.tl-eff-kind').innerHTML = kind
      ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_LABEL[kind]) + '</span>'
      : '<span class="hint">Descriptif</span>';
  }

  function addEffectRow(e) {
    e = e || {};
    const list = $('#tl-f-effects');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'tl-eff-row';
    row.innerHTML =
      '<div class="tl-eff-top">' +
        '<select class="tl-eff-effect">' + effectOptions(e.effect || '') + '</select>' +
        '<button type="button" class="tl-eff-del" title="Retirer cet effet">✕</button>' +
      '</div>' +
      '<div class="tl-eff-params">' +
        '<span class="tl-eff-kind"></span>' +
        '<label class="tl-eff-val-wrap" hidden><span class="tl-eff-val-label">Valeur X</span>' +
          '<input type="number" class="tl-eff-val" min="0" max="99" value="' + (e.val || 0) + '" /></label>' +
        '<label class="tl-eff-range-wrap" hidden>Portée ' +
          '<select class="tl-eff-range">' +
            '<option value="contact"' + (e.range === 'contact' ? ' selected' : '') + '>Au contact</option>' +
            '<option value="distance"' + (e.range === 'distance' ? ' selected' : '') + '>À distance</option>' +
          '</select></label>' +
        '<div class="tl-eff-dice-wrap" hidden><span class="tl-eff-dice-label">Dés de dégâts</span>' +
          '<div class="tl-eff-dice dice-steppers"></div></div>' +
        '<label class="tl-eff-choice-wrap" hidden><span class="tl-eff-choice-label">Choix</span>' +
          '<select class="tl-eff-choice"></select></label>' +
        '<label class="tl-eff-scope-wrap" hidden>Cibles ' +
          '<select class="tl-eff-scope">' +
            '<option value="count">Nombre X</option>' +
            '<option value="zone">Toute la zone</option>' +
            '<option value="all">Tout le combat</option>' +
          '</select></label>' +
      '</div>';
    list.appendChild(row);
    // Choix mémorisé (compétence, état…) pour réafficher la sélection à l'édition.
    row._choice = e.choice || '';
    row._scope = e.scope || 'count';
    // Pool de dés propre à la ligne (référence mutée par les steppers)
    row._pool = Object.assign(emptyPool(), e.dice || {});
    if (Inventory && Inventory.buildDiceSteppers) {
      Inventory.buildDiceSteppers(row.querySelector('.tl-eff-dice'), row._pool);
    }
    row.querySelector('.tl-eff-effect').addEventListener('change', function () { syncEffectRow(row); });
    row.querySelector('.tl-eff-del').addEventListener('click', function () { row.remove(); });
    const choiceSel = row.querySelector('.tl-eff-choice');
    if (choiceSel) choiceSel.addEventListener('change', function () { row._choice = choiceSel.value; });
    const scopeSel2 = row.querySelector('.tl-eff-scope');
    if (scopeSel2) scopeSel2.addEventListener('change', function () { row._scope = scopeSel2.value; syncEffectRow(row); });
    syncEffectRow(row);
    return row;
  }

  function openTalentModal(id, ref) {
    const m = $('#talent-modal');
    if (!m) return;
    const existing = (id && ref) ? findTalent(ref, id) : null;
    editing = existing ? { ref: ref, id: id } : null;
    const t = existing || newTalent();

    $('#talent-modal-title').textContent = existing ? 'Éditer le talent' : 'Ajouter un talent';
    $('#tl-f-id').value = t.id;
    $('#tl-f-name').value = t.name || '';
    $('#tl-f-group').innerHTML = groupOptions(ref || 'generic');
    $('#tl-f-level').value = t.level || 1;
    $('#tl-f-usage').value = t.usage || 'both';
    const prereqSel = $('#tl-f-prereq');
    if (prereqSel) prereqSel.innerHTML = prereqOptions(t.id, t.prereq || '');
    $('#tl-f-desc').value = t.description || '';
    $('#tl-f-delete').hidden = !existing;
    // Reconstruit les lignes d'effet à partir du talent (multi-effets ou ancien mono-effet)
    $('#tl-f-effects').innerHTML = '';
    const effs = Store.talentEffectList(t);
    effs.forEach(function (e) { addEffectRow(e); });
    if (!effs.length) addEffectRow({});
    m.hidden = false;
    $('#tl-f-name').focus();
  }

  function closeTalentModal() { $('#talent-modal').hidden = true; editing = null; }

  function submitTalent(ev) {
    ev.preventDefault();
    const targetRef = $('#tl-f-group').value;
    const cat = effectMap();
    // Collecte les lignes d'effet (dans l'ordre affiché)
    const effects = [];
    $('#tl-f-effects').querySelectorAll('.tl-eff-row').forEach(function (row) {
      const key = row.querySelector('.tl-eff-effect').value;
      if (!key) return;
      const meta = cat[key] || {};
      const e = { effect: key };
      if (meta.hasVal) e.val = Math.max(0, Math.min(99, parseInt(row.querySelector('.tl-eff-val').value, 10) || 0));
      if (meta.hasRange) e.range = row.querySelector('.tl-eff-range').value || 'contact';
      if (meta.hasDice) e.dice = Object.assign(emptyPool(), row._pool || {});
      if (meta.hasChoice) {
        const cs = row.querySelector('.tl-eff-choice');
        e.choice = (cs && cs.value) || (meta.choices && meta.choices[0]) || '';
      }
      if (meta.hasScope) {
        const ss = row.querySelector('.tl-eff-scope');
        e.scope = (ss && ss.value) || 'count';
      }
      effects.push(e);
    });
    const first = effects[0] || null;
    const firstMeta = first ? (cat[first.effect] || {}) : null;
    const data = {
      id: $('#tl-f-id').value || Store.uid(),
      name: ($('#tl-f-name').value || '').trim() || 'Talent',
      level: Math.max(1, Math.min(7, parseInt($('#tl-f-level').value, 10) || 1)),
      usage: $('#tl-f-usage').value,
      effects: effects,
      // Champs « représentatifs » conservés pour la rétro-compat (affichage, coloration)
      effect: first ? first.effect : '',
      kind: firstMeta ? firstMeta.kind : '',
      val: (first && typeof first.val === 'number') ? first.val : 0,
      prereq: (($('#tl-f-prereq') && $('#tl-f-prereq').value) || '') || null,
      description: ($('#tl-f-desc').value || '').trim(),
    };
    // Retire l'ancienne occurrence (changement de groupe possible)
    if (editing) {
      const og = groupByRef(editing.ref);
      if (og) { const idx = og.list.findIndex(function (x) { return x.id === editing.id; }); if (idx >= 0) og.list.splice(idx, 1); }
    }
    const dest = groupByRef(targetRef);
    if (dest) dest.list.push(data);
    persist();
    closeTalentModal();
    render();
  }

  function deleteTalent() {
    if (!editing) { closeTalentModal(); return; }
    const g = groupByRef(editing.ref);
    if (g) {
      const t = g.list.find(function (x) { return x.id === editing.id; });
      if (t && t.effect && !confirm('Ce talent possède un effet de combat intégré (' + t.effect + '). Le supprimer ?')) return;
      const idx = g.list.findIndex(function (x) { return x.id === editing.id; });
      if (idx >= 0) g.list.splice(idx, 1);
    }
    persist();
    closeTalentModal();
    render();
  }

  function init() {
    const f = $('#talent-form');
    if (f) f.addEventListener('submit', submitTalent);
    const c = $('#talent-modal-close');
    if (c) c.addEventListener('click', closeTalentModal);
    const d = $('#tl-f-delete');
    if (d) d.addEventListener('click', deleteTalent);
    const ae = $('#tl-f-addeffect');
    if (ae) ae.addEventListener('click', function () { addEffectRow({}); });
    const m = $('#talent-modal');
    if (m) m.addEventListener('click', function (ev) { if (ev.target.id === 'talent-modal') closeTalentModal(); });
    render();
  }

  global.Classes = { init: init, render: render };
})(window);
