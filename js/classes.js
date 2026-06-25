/*
 * Éditeur des talents génériques et de classe (partie MJ / Admin).
 * Reprend le design de l'Armurerie : carte d'en-tête, recherche, colonnes à
 * languettes (une colonne par groupe : Génériques + 8 classes), édition par
 * mini-fenêtre. Chaque talent peut être relié à un EFFET de la bibliothèque
 * (Action bleu · Réaction violet · Passif vert · Amélioration ambre).
 */
(function (global) {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  const CLASS_NAMES = ['Apothicaire', 'Artificier', 'Chasseur', 'Destructeur', 'Déviant',
    'Gardien', 'Lamevent', 'Pyromane'];
  const USAGE = [
    { value: 'both',   label: 'Combat & hors combat' },
    { value: 'combat', label: 'En combat' },
    { value: 'out',    label: 'Hors combat' },
  ];
  const KIND_LABEL = { action: 'Action', reaction: 'Réaction', passive: 'Passif', upgrade: 'Amélioration' };
  const KIND_SHORT = { action: 'Action', reaction: 'Réaction', passive: 'Passif', upgrade: 'Amélior.' };
  const KIND_ORDER = ['action', 'reaction', 'passive', 'upgrade'];

  let classes = [];
  let generics = [];
  let term = '';
  let groupFilter = '';

  function effectCatalog() { return Store.talentEffects ? Store.talentEffects() : []; }
  function effectMap() { return Store.talentEffectMap ? Store.talentEffectMap() : {}; }
  function classSlug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function load() {
    const stored = Store.loadClasses();
    const byName = {};
    stored.forEach(function (c) { byName[c.name] = c; });
    classes = CLASS_NAMES.map(function (name) {
      const c = byName[name] || { name: name, talents: [] };
      if (!Array.isArray(c.talents)) c.talents = [];
      return c;
    });
    generics = Store.loadGenericTalents();
  }
  function save() { Store.saveClasses(classes); }
  function saveGen() { Store.saveGenericTalents(generics); }
  function persist() { save(); saveGen(); }

  function newTalent() {
    return { id: Store.uid(), name: '', level: 1, usage: 'both', kind: '', effect: '', val: 0, description: '' };
  }

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
          '<span class="lib-eff-name">' + esc(e.name) + '</span>' +
          (e.hasVal ? '<span class="lib-eff-var">X = ' + esc(e.valLabel || 'valeur') + '</span>' : '') +
          '<span class="lib-eff-desc">' + esc(e.desc) + '</span>' +
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
        '<span class="lib-leg lib-kind-upgrade">Amélioration</span>.</p>' +
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
        '</div>' +
        '<div id="class-list" class="roster-list inv-strip-layout"></div>' +
      '</div>';
    $('#tl-add').addEventListener('click', function () { openTalentModal(null); });
    $('#tl-search').addEventListener('input', function () { term = this.value.toLowerCase().trim(); renderColumns(); });
    $('#tl-groupfilter').addEventListener('change', function () { groupFilter = this.value; renderColumns(); });
    renderColumns();
  }

  function matches(t) {
    if (!term) return true;
    return (t.name || '').toLowerCase().indexOf(term) >= 0 ||
           (t.description || '').toLowerCase().indexOf(term) >= 0;
  }

  // Languette d'un talent (design Armurerie), colorée par type d'effet
  function talentStrip(t, ref) {
    const kind = t.kind || (t.effect && effectMap()[t.effect] ? effectMap()[t.effect].kind : '');
    const right =
      (kind ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_SHORT[kind] || kind) + '</span>' : '<span class="tl-kind tl-kind-none">Descriptif</span>') +
      '<span class="tal-lvl">Niv. ' + (t.level || 1) + '</span>';
    return '<div class="inv-strip-row tal-row tal-kind-' + (kind || 'none') + '">' +
      '<div class="inv-strip tal-strip" data-edit="' + esc(ref) + '" data-tid="' + esc(t.id) + '">' +
        '<span class="inv-strip-name">' + esc(t.name || '(sans nom)') + '</span>' +
        '<span class="inv-strip-val">' + right + '</span>' +
      '</div>' +
      '<button class="inv-strip-edit" data-edit="' + esc(ref) + '" data-tid="' + esc(t.id) + '" title="Éditer">✎</button>' +
    '</div>';
  }

  function renderColumns() {
    const box = $('#class-list');
    if (!box) return;
    const shown = groups().filter(function (g) { return !groupFilter || g.ref === groupFilter; });
    box.innerHTML = '<div class="tal-cols">' + shown.map(function (g) {
      const items = g.list.filter(matches);
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
    box.querySelectorAll('[data-edit]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTalentModal(el.getAttribute('data-tid'), el.getAttribute('data-edit'));
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

  function findTalent(ref, id) {
    const g = groupByRef(ref);
    if (!g) return null;
    return g.list.find(function (t) { return t.id === id; }) || null;
  }

  function syncValAndKind() {
    const eff = effectMap()[$('#tl-f-effect').value] || null;
    const wrap = $('#tl-f-val-wrap');
    if (eff && eff.hasVal) {
      wrap.hidden = false;
      $('#tl-f-val-label').textContent = eff.valLabel || 'Valeur X';
    } else {
      wrap.hidden = true;
    }
    const kind = eff ? eff.kind : '';
    $('#tl-f-kindrow').innerHTML = kind
      ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_LABEL[kind]) + '</span> ' +
        '<span class="hint">Type déterminé par l\'effet choisi.</span>'
      : '<span class="hint">Talent descriptif (aucun effet moteur).</span>';
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
    $('#tl-f-effect').innerHTML = effectOptions(t.effect || '');
    $('#tl-f-val').value = t.val || 0;
    $('#tl-f-desc').value = t.description || '';
    $('#tl-f-delete').hidden = !existing;
    syncValAndKind();
    m.hidden = false;
    $('#tl-f-name').focus();
  }

  function closeTalentModal() { $('#talent-modal').hidden = true; editing = null; }

  function submitTalent(ev) {
    ev.preventDefault();
    const targetRef = $('#tl-f-group').value;
    const eff = effectMap()[$('#tl-f-effect').value] || null;
    const data = {
      id: $('#tl-f-id').value || Store.uid(),
      name: ($('#tl-f-name').value || '').trim() || 'Talent',
      level: Math.max(1, Math.min(7, parseInt($('#tl-f-level').value, 10) || 1)),
      usage: $('#tl-f-usage').value,
      effect: $('#tl-f-effect').value || '',
      kind: eff ? eff.kind : '',
      val: (eff && eff.hasVal) ? Math.max(0, Math.min(99, parseInt($('#tl-f-val').value, 10) || 0)) : 0,
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
    const e = $('#tl-f-effect');
    if (e) e.addEventListener('change', syncValAndKind);
    const m = $('#talent-modal');
    if (m) m.addEventListener('click', function (ev) { if (ev.target.id === 'talent-modal') closeTalentModal(); });
    render();
  }

  global.Classes = { init: init, render: render };
})(window);
