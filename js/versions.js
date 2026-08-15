/* Historique des versions — écran Mode MJ.
   Les données sont dans js/versions-data.js (window.VERSIONS), régénérées
   depuis l'historique Git par outils/gen-versions.js. */
window.Versions = (function () {
  'use strict';

  var PAGE = 25;          // versions affichées avant « Voir plus »
  var shown = PAGE;
  var query = '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function list() { return Array.isArray(window.VERSIONS) ? window.VERSIONS : []; }

  // « 2026-08-02 » → « 2 août 2026 »
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function frDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return iso || '';
    return String(Number(m[3])) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
  }

  function matches(v, q) {
    if (!q) return true;
    var hay = (v.v + ' ' + v.title + ' ' + (v.changes || []).join(' ')).toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function cardHtml(v, isCurrent) {
    var h = '<article class="ver-card' + (isCurrent ? ' ver-current' : '') + '">';
    h += '<header class="ver-head">';
    h += '<span class="ver-num">' + esc(v.v) + '</span>';
    if (isCurrent) h += '<span class="ver-badge">version actuelle</span>';
    h += '<span class="ver-date">' + esc(frDate(v.date)) + '</span>';
    h += '</header>';
    if (v.title) h += '<h3 class="ver-title">' + esc(v.title) + '</h3>';
    var ch = (v.changes || []).filter(Boolean);
    if (ch.length) {
      h += '<ul class="ver-list">';
      for (var i = 0; i < ch.length; i++) h += '<li>' + esc(ch[i]) + '</li>';
      h += '</ul>';
    }
    h += '</article>';
    return h;
  }

  function render() {
    var root = document.getElementById('versions-root');
    if (!root) return;
    var all = list();
    var cur = all.length ? all[0].v : '';
    var q = query.trim().toLowerCase();
    var filtered = all.filter(function (v) { return matches(v, q); });
    var visible = filtered.slice(0, shown);

    var h = '<div class="ver-wrap">';
    h += '<div class="ver-top">';
    h += '<h2 class="ver-h1">Historique des versions</h2>';
    h += '<p class="ver-sub">Version actuelle <strong>' + esc(cur) + '</strong>' +
      (all.length && all[0].date ? ' — publiée le ' + esc(frDate(all[0].date)) : '') +
      ' · ' + all.length + ' versions référencées</p>';
    h += '<input type="search" id="ver-search" class="ver-search" placeholder="Rechercher une version, un correctif…" value="' + esc(query) + '">';
    h += '</div>';

    if (!filtered.length) {
      h += '<p class="muted">Aucune version ne correspond à cette recherche.</p>';
    } else {
      h += '<div class="ver-cards">';
      for (var i = 0; i < visible.length; i++) {
        h += cardHtml(visible[i], !q && i === 0 && visible[i].v === cur);
      }
      h += '</div>';
      if (filtered.length > visible.length) {
        h += '<div class="ver-more-wrap"><button type="button" id="ver-more" class="btn">' +
          '▾ Voir les ' + Math.min(PAGE, filtered.length - visible.length) + ' versions précédentes' +
          ' (' + (filtered.length - visible.length) + ' restantes)</button></div>';
      }
    }
    h += '</div>';
    root.innerHTML = h;

    var more = document.getElementById('ver-more');
    if (more) more.addEventListener('click', function () { shown += PAGE; render(); });

    var s = document.getElementById('ver-search');
    if (s) {
      s.addEventListener('input', function () {
        query = s.value; shown = PAGE; render();
        var s2 = document.getElementById('ver-search');
        if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
      });
    }
  }

  return { render: render };
})();
