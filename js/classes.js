/*
 * Éditeur des talents génériques et des talents de classe (partie MJ / Admin).
 * Le premier groupe rassemble les talents GÉNÉRIQUES (accessibles à tous les
 * aventuriers au niveau requis) ; viennent ensuite les 8 classes.
 * Design calqué sur l'armurerie (séparateurs + cartes).
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

  let classes = [];
  let generics = [];

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
    return { id: Store.uid(), name: '', level: 1, usage: 'both', description: '' };
  }

  function classSlug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function render() {
    load();
    const root = $('#classes-root');
    if (!root) return;
    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Talents</h2></div>' +
        '<p class="hint">Le premier groupe rassemble les <b>talents génériques</b> ' +
          '(accessibles à tous les aventuriers au niveau requis). Viennent ensuite ' +
          'les talents propres à chaque classe.</p>' +
        '<div id="class-list"></div>' +
      '</div>';
    renderClasses();
  }

  // Carte d'édition d'un talent (générique ou de classe)
  function talentCard(t, scope, ref, i, locked) {
    const usageOpts = USAGE.map(function (u) {
      return '<option value="' + u.value + '"' + (u.value === t.usage ? ' selected' : '') + '>' + esc(u.label) + '</option>';
    }).join('');
    return '<div class="talent-card' + (locked ? ' talent-locked' : '') + '" data-scope="' + scope + '" data-ref="' + esc(ref) + '" data-i="' + i + '">' +
      '<div class="talent-card-top">' +
        '<input type="text" class="tl-name" value="' + esc(t.name) + '" placeholder="Nom du talent" />' +
        '<label class="tl-lvl">Niv. <input type="number" class="tl-level" min="1" max="7" value="' + (t.level || 1) + '" /></label>' +
        '<select class="tl-usage">' + usageOpts + '</select>' +
        '<button type="button" class="icon-btn tl-del" title="Supprimer">✕</button>' +
      '</div>' +
      (t.effect ? '<div class="talent-effect-tag">⚙ Effet intégré : ' + esc(t.effect) + '</div>' : '') +
      '<textarea class="tl-desc" rows="2" placeholder="Effet du talent…">' + esc(t.description || '') + '</textarea>' +
    '</div>';
  }

  function genericsHTML() {
    if (!generics.length) return '<p class="empty" style="padding:.3rem 0">Aucun talent générique.</p>';
    return generics.map(function (t, i) {
      return talentCard(t, 'generic', 'generic', i, false);
    }).join('');
  }

  function classTalentsHTML(c) {
    if (!c.talents.length) return '<p class="empty" style="padding:.3rem 0">Aucun talent.</p>';
    return c.talents.map(function (t, i) { return talentCard(t, 'class', c.name, i, false); }).join('');
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
      row.querySelector('.tl-del').onclick = function () {
        if (t.effect && !confirm('Ce talent possède un effet de combat intégré (' + t.effect + '). Le supprimer ?')) return;
        list.splice(i, 1); persist(); renderClasses();
      };
    });
  }

  function init() { render(); }

  global.Classes = { init: init, render: render };
})(window);
