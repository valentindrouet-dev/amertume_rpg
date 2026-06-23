/*
 * Éditeur des classes et de leurs talents (partie MJ / Admin).
 * Chaque talent de classe se débloque à un niveau donné et s'utilise
 * en combat, hors combat ou les deux.
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
  }
  function save() { Store.saveClasses(classes); }

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
        '<div class="card-head"><h2>Classes & talents</h2></div>' +
        '<p class="hint">Définis les talents de chaque classe : nom, niveau de déblocage, ' +
          'usage et description. Les aventuriers les débloqueront en montant de niveau.</p>' +
        '<div id="class-list"></div>' +
      '</div>';
    renderClasses();
  }

  function renderClasses() {
    const box = $('#class-list');
    if (!box) return;
    box.innerHTML = classes.map(function (c) {
      return '<div class="class-card klass-' + classSlug(c.name) + '" data-class="' + esc(c.name) + '">' +
        '<div class="class-head">' +
          '<span class="class-name">' + esc(c.name) + '</span>' +
          '<span class="tag">' + c.talents.length + ' talent(s)</span>' +
          '<button type="button" class="ghost small cl-add" data-class="' + esc(c.name) + '">+ Talent</button>' +
        '</div>' +
        '<div class="class-talents" id="talents-' + classSlug(c.name) + '">' + talentsHTML(c) + '</div>' +
      '</div>';
    }).join('');
    wire();
  }

  function talentsHTML(c) {
    if (!c.talents.length) return '<p class="empty" style="padding:.3rem 0">Aucun talent.</p>';
    return c.talents.map(function (t, i) {
      const usageOpts = USAGE.map(function (u) {
        return '<option value="' + u.value + '"' + (u.value === t.usage ? ' selected' : '') + '>' + esc(u.label) + '</option>';
      }).join('');
      return '<div class="talent-edit" data-class="' + esc(c.name) + '" data-i="' + i + '">' +
        '<div class="talent-edit-top">' +
          '<input type="text" class="tl-name" value="' + esc(t.name) + '" placeholder="Nom du talent" />' +
          '<label class="tl-lvl">Niv. <input type="number" class="tl-level" min="1" max="7" value="' + (t.level || 1) + '" /></label>' +
          '<select class="tl-usage">' + usageOpts + '</select>' +
          '<button type="button" class="icon-btn tl-del" title="Supprimer">✕</button>' +
        '</div>' +
        '<textarea class="tl-desc" rows="2" placeholder="Effet du talent…">' + esc(t.description || '') + '</textarea>' +
      '</div>';
    }).join('');
  }

  function classByName(name) { return classes.find(function (c) { return c.name === name; }); }

  function wire() {
    const box = $('#class-list');
    box.querySelectorAll('.cl-add').forEach(function (b) {
      b.addEventListener('click', function () {
        const c = classByName(b.getAttribute('data-class'));
        if (!c) return;
        c.talents.push(newTalent());
        save(); renderClasses();
      });
    });
    box.querySelectorAll('.talent-edit').forEach(function (row) {
      const c = classByName(row.getAttribute('data-class'));
      const i = parseInt(row.getAttribute('data-i'), 10);
      if (!c || !c.talents[i]) return;
      const t = c.talents[i];
      row.querySelector('.tl-name').oninput = function () { t.name = this.value; save(); };
      row.querySelector('.tl-level').oninput = function () { t.level = Math.max(1, Math.min(7, parseInt(this.value, 10) || 1)); save(); };
      row.querySelector('.tl-usage').onchange = function () { t.usage = this.value; save(); };
      row.querySelector('.tl-desc').oninput = function () { t.description = this.value; save(); };
      row.querySelector('.tl-del').onclick = function () {
        c.talents.splice(i, 1); save(); renderClasses();
      };
    });
  }

  function init() { render(); }

  global.Classes = { init: init, render: render };
})(window);
