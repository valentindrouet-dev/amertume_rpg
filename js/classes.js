/*
 * Éditeur des talents génériques et des talents de classe (partie MJ / Admin).
 * Le premier groupe rassemble les talents GÉNÉRIQUES (accessibles à tous les
 * aventuriers au niveau requis) ; viennent ensuite les 8 classes.
 * Chaque talent peut être rattaché à un EFFET de la bibliothèque (câblé au
 * moteur de combat) : Action (bleu), Réaction (violet), Passif ou Amélioration.
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
  const KIND_ORDER = ['action', 'reaction', 'passive', 'upgrade'];

  let classes = [];
  let generics = [];

  function effectCatalog() { return Store.talentEffects ? Store.talentEffects() : []; }
  function effectMap() { return Store.talentEffectMap ? Store.talentEffectMap() : {}; }

  // Charge les classes en garantissant la présence des 8 classes officielles
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

  function newTalent() {
    return { id: Store.uid(), name: '', level: 1, usage: 'both', kind: '', effect: '', val: 0, description: '' };
  }

  function classSlug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  // ---- Bibliothèque des effets (panneau de référence pour le MJ) ----
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
      '<p class="hint">Choisissez un effet dans un talent pour le relier au moteur de combat. ' +
        'Les effets avec une variable <b>X</b> sont ajustables par talent. ' +
        '<span class="lib-leg lib-kind-action">Action</span> (bleu, consomme l\'action) · ' +
        '<span class="lib-leg lib-kind-reaction">Réaction</span> (violet, déclenchée) · ' +
        '<span class="lib-leg lib-kind-passive">Passif</span> (automatique) · ' +
        '<span class="lib-leg lib-kind-upgrade">Amélioration</span>.</p>' +
      sections +
    '</details>';
  }

  function render() {
    load();
    const root = $('#classes-root');
    if (!root) return;
    root.innerHTML =
      libraryHTML() +
      '<div class="card">' +
        '<div class="card-head"><h2>Talents</h2></div>' +
        '<p class="hint">Le premier groupe rassemble les <b>talents génériques</b> ' +
          '(accessibles à tous les aventuriers au niveau requis). Viennent ensuite ' +
          'les talents propres à chaque classe. Reliez un talent à un <b>effet</b> ' +
          'pour le rendre actif en combat.</p>' +
        '<div id="class-list"></div>' +
      '</div>';
    renderClasses();
  }

  // Options du sélecteur d'effet, groupées par type
  function effectOptions(cur) {
    const cat = effectCatalog();
    let html = '<option value="">— Aucun (descriptif) —</option>';
    KIND_ORDER.forEach(function (k) {
      const list = cat.filter(function (e) { return e.kind === k; });
      if (!list.length) return;
      html += '<optgroup label="' + esc(KIND_LABEL[k]) + '">' +
        list.map(function (e) {
          return '<option value="' + esc(e.effect) + '"' + (e.effect === cur ? ' selected' : '') + '>' + esc(e.name) + '</option>';
        }).join('') +
      '</optgroup>';
    });
    return html;
  }

  // Carte d'édition d'un talent (générique ou de classe)
  function talentCard(t, scope, ref, i) {
    const usageOpts = USAGE.map(function (u) {
      return '<option value="' + u.value + '"' + (u.value === t.usage ? ' selected' : '') + '>' + esc(u.label) + '</option>';
    }).join('');
    const eff = t.effect ? (effectMap()[t.effect] || null) : null;
    const kind = eff ? eff.kind : (t.kind || '');
    const kindBadge = kind ? '<span class="tl-kind tl-kind-' + kind + '">' + esc(KIND_LABEL[kind] || kind) + '</span>' : '';
    const valHtml = (eff && eff.hasVal)
      ? '<label class="tl-val">' + esc(eff.valLabel || 'X') + ' <input type="number" class="tl-valnum" min="0" max="99" value="' + (t.val || 0) + '" /></label>'
      : '';
    return '<div class="talent-card" data-scope="' + scope + '" data-ref="' + esc(ref) + '" data-i="' + i + '">' +
      '<div class="talent-card-top">' +
        '<input type="text" class="tl-name" value="' + esc(t.name) + '" placeholder="Nom du talent" />' +
        '<label class="tl-lvl">Niv. <input type="number" class="tl-level" min="1" max="7" value="' + (t.level || 1) + '" /></label>' +
        '<select class="tl-usage">' + usageOpts + '</select>' +
        '<button type="button" class="icon-btn tl-del" title="Supprimer">✕</button>' +
      '</div>' +
      '<div class="talent-card-eff">' +
        kindBadge +
        '<select class="tl-effect">' + effectOptions(t.effect || '') + '</select>' +
        valHtml +
      '</div>' +
      '<textarea class="tl-desc" rows="2" placeholder="Description affichée au joueur…">' + esc(t.description || '') + '</textarea>' +
    '</div>';
  }

  function genericsHTML() {
    if (!generics.length) return '<p class="empty" style="padding:.3rem 0">Aucun talent générique.</p>';
    return generics.map(function (t, i) { return talentCard(t, 'generic', 'generic', i); }).join('');
  }

  function classTalentsHTML(c) {
    if (!c.talents.length) return '<p class="empty" style="padding:.3rem 0">Aucun talent.</p>';
    return c.talents.map(function (t, i) { return talentCard(t, 'class', c.name, i); }).join('');
  }

  function renderClasses() {
    const box = $('#class-list');
    if (!box) return;
    let html = '';
    // 1) Groupe générique (en tête)
    html += '<div class="class-card klass-generique" data-scope="generic">' +
      '<div class="class-head">' +
        '<span class="class-name">★ Talents génériques</span>' +
        '<span class="tag">' + generics.length + ' talent(s)</span>' +
        '<button type="button" class="ghost small gen-add">+ Talent</button>' +
      '</div>' +
      '<div class="class-talents">' + genericsHTML() + '</div>' +
    '</div>';
    // 2) Chaque classe
    html += classes.map(function (c) {
      return '<div class="class-card klass-' + classSlug(c.name) + '" data-class="' + esc(c.name) + '">' +
        '<div class="class-head">' +
          '<span class="class-name">' + esc(c.name) + '</span>' +
          '<span class="tag">' + c.talents.length + ' talent(s)</span>' +
          '<button type="button" class="ghost small cl-add" data-class="' + esc(c.name) + '">+ Talent</button>' +
        '</div>' +
        '<div class="class-talents">' + classTalentsHTML(c) + '</div>' +
      '</div>';
    }).join('');
    box.innerHTML = html;
    wire();
  }

  function classByName(name) { return classes.find(function (c) { return c.name === name; }); }

  function wire() {
    const box = $('#class-list');
    // Ajout talent générique
    const genAdd = box.querySelector('.gen-add');
    if (genAdd) genAdd.addEventListener('click', function () {
      generics.push(newTalent()); saveGen(); renderClasses();
    });
    // Ajout talent de classe
    box.querySelectorAll('.cl-add').forEach(function (b) {
      b.addEventListener('click', function () {
        const c = classByName(b.getAttribute('data-class'));
        if (!c) return;
        c.talents.push(newTalent());
        save(); renderClasses();
      });
    });
    // Édition / suppression (génériques + classes)
    box.querySelectorAll('.talent-card').forEach(function (row) {
      const scope = row.getAttribute('data-scope');
      const i = parseInt(row.getAttribute('data-i'), 10);
      let list, persist;
      if (scope === 'generic') {
        list = generics; persist = saveGen;
      } else {
        const c = classByName(row.getAttribute('data-ref'));
        if (!c) return;
        list = c.talents; persist = save;
      }
      const t = list[i];
      if (!t) return;
      row.querySelector('.tl-name').oninput = function () { t.name = this.value; persist(); };
      row.querySelector('.tl-level').oninput = function () { t.level = Math.max(1, Math.min(7, parseInt(this.value, 10) || 1)); persist(); };
      row.querySelector('.tl-usage').onchange = function () { t.usage = this.value; persist(); };
      row.querySelector('.tl-desc').oninput = function () { t.description = this.value; persist(); };
      // Sélection d'un effet : fixe kind + valeur par défaut, et pré-remplit nom/description si vides
      row.querySelector('.tl-effect').onchange = function () {
        const e = effectMap()[this.value] || null;
        t.effect = this.value || '';
        t.kind = e ? e.kind : '';
        t.val = (e && e.hasVal) ? (e.defaultVal || 0) : 0;
        if (e) {
          if (!t.name) t.name = e.name;
          if (!t.description) t.description = e.desc;
          if (t.usage === 'out') t.usage = 'combat';
        }
        persist(); renderClasses();
      };
      const valNum = row.querySelector('.tl-valnum');
      if (valNum) valNum.oninput = function () { t.val = Math.max(0, Math.min(99, parseInt(this.value, 10) || 0)); persist(); };
      row.querySelector('.tl-del').onclick = function () {
        if (t.effect && !confirm('Ce talent possède un effet de combat intégré (' + t.effect + '). Le supprimer ?')) return;
        list.splice(i, 1); persist(); renderClasses();
      };
    });
  }

  function init() { render(); }

  global.Classes = { init: init, render: render };
})(window);
