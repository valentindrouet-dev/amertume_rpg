/* Éditeur de cartes d'affrontement (Mode MJ, onglet « Cartes »).
   Une carte = des zones rectangulaires dessinées sur une grille, reliées par
   des passages (portes) ou des barrières. Deux zones non reliées sont séparées
   par un mur implicite : aucun déplacement possible entre elles en combat.
   Les cartes sont réutilisables : Combat Test aujourd'hui, aventures ensuite. */
window.Cartes = (function (global) {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const COLS = 12, ROWS = 8;      // grille par défaut
  const BAR_TYPES = [
    { v: '',                label: '— passage libre —' },
    { v: 'difficile',       label: '⛰ Difficile (test d\'Agilité)' },
    { v: 'instable',        label: '〰 Instable (Agilité 1 sinon Au sol)' },
    { v: 'mur',             label: '🧱 Mur (ni passage ni tir)' },
    { v: 'infranchissable', label: '⛔ Infranchissable (le tir passe)' },
  ];

  let editing = null;   // copie de travail de la carte en édition (null = liste)
  let selZone = -1;     // zone sélectionnée dans l'éditeur
  let linkFrom = -1;    // mode « relier » : première zone cliquée
  let drag = null;      // tracé en cours { x0, y0, x1, y1 }

  function maps() { return Store.loadBattleMaps(); }

  function blankMap() {
    return { id: Store.uid(), name: '', cols: COLS, rows: ROWS, zones: [], links: [] };
  }

  // ---------- Aide géométrie ----------
  function overlaps(r, zones, skipIdx) {
    return zones.some(function (z, i) {
      if (i === skipIdx) return false;
      const o = z; // rectangles en cellules entières
      return r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h;
    });
  }
  function normRect(a, b) {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x: x, y: y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
  }
  function linkAt(a, b) {
    return editing.links.findIndex(function (l) {
      return (l.a === a && l.b === b) || (l.a === b && l.b === a);
    });
  }
  // Point de contact de deux zones (milieu d'arête partagée, sinon milieu des centres)
  function contactPt(za, zb) {
    const ox = [Math.max(za.x, zb.x), Math.min(za.x + za.w, zb.x + zb.w)];
    const oy = [Math.max(za.y, zb.y), Math.min(za.y + za.h, zb.y + zb.h)];
    if (ox[0] < ox[1] && (za.y + za.h === zb.y || zb.y + zb.h === za.y)) {
      return { x: (ox[0] + ox[1]) / 2, y: za.y + za.h === zb.y ? zb.y : za.y };
    }
    if (oy[0] < oy[1] && (za.x + za.w === zb.x || zb.x + zb.w === za.x)) {
      return { x: za.x + za.w === zb.x ? zb.x : za.x, y: (oy[0] + oy[1]) / 2 };
    }
    return { x: (za.x + za.w / 2 + zb.x + zb.w / 2) / 2, y: (za.y + za.h / 2 + zb.y + zb.h / 2) / 2 };
  }

  // ---------- Conversion vers un combat ----------
  // Renvoie { zones (nom + rect + heroStart), layout, zoneLinks } prêts pour buildCombat.
  function mapToConfig(map) {
    return {
      zones: (map.zones || []).map(function (z) {
        return { name: z.name, rect: { x: z.x, y: z.y, w: z.w, h: z.h }, heroStart: !!z.heroStart, monsterRefs: [] };
      }),
      layout: { cols: map.cols || COLS, rows: map.rows || ROWS },
      zoneLinks: (map.links || []).map(function (l) {
        return { a: l.a, b: l.b, barrier: l.barrier || null };
      }),
      heroStartZone: Math.max(0, (map.zones || []).findIndex(function (z) { return z.heroStart; })),
    };
  }

  // ---------- Rendu : liste des cartes ----------
  function render() {
    const root = $('#cartes-root');
    if (!root) return;
    if (editing) { renderEditor(root); return; }
    const list = maps();
    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Cartes d\'affrontement</h2>' +
          '<button id="map-new" class="primary">+ Nouvelle carte</button></div>' +
        '<p class="hint">Dessine des salles de formes et de tailles variées, relie-les par des passages ou des barrières. ' +
          'Deux salles non reliées sont séparées par un mur : on ne circule qu\'en suivant les liens. ' +
          'Tes cartes s\'essaient dans <b>Combat Test</b> (sélecteur « Carte ») — et bientôt dans les aventures.</p>' +
        (list.length
          ? '<div class="map-list">' + list.map(function (m) {
              return '<div class="map-row" data-id="' + m.id + '">' +
                '<div class="map-thumb">' + thumbHtml(m) + '</div>' +
                '<div class="map-row-body"><b>' + esc(m.name || 'Sans titre') + '</b>' +
                  '<span class="hint">' + m.zones.length + ' zone' + (m.zones.length > 1 ? 's' : '') +
                  ' · ' + m.links.length + ' lien' + (m.links.length > 1 ? 's' : '') + '</span></div>' +
                '<div class="map-row-actions">' +
                  '<button class="ghost small" data-edit="' + m.id + '">✏️ Éditer</button>' +
                  '<button class="ghost small" data-dup="' + m.id + '">⧉ Dupliquer</button>' +
                  '<button class="ghost small del-btn" data-del="' + m.id + '">✕</button>' +
                '</div>' +
              '</div>';
            }).join('') + '</div>'
          : '<p class="empty">Aucune carte. Clique sur « + Nouvelle carte ».</p>') +
      '</div>';
    $('#map-new').addEventListener('click', function () {
      editing = blankMap(); selZone = -1; linkFrom = -1; render();
    });
    root.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        const m = maps().find(function (x) { return x.id === b.getAttribute('data-edit'); });
        if (!m) return;
        editing = JSON.parse(JSON.stringify(m)); selZone = -1; linkFrom = -1; render();
      });
    });
    root.querySelectorAll('[data-dup]').forEach(function (b) {
      b.addEventListener('click', function () {
        const all = maps();
        const m = all.find(function (x) { return x.id === b.getAttribute('data-dup'); });
        if (!m) return;
        const copy = JSON.parse(JSON.stringify(m));
        copy.id = Store.uid(); copy.name = (m.name || 'Carte') + ' (copie)';
        all.push(copy); Store.saveBattleMaps(all); render();
      });
    });
    root.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        const m = maps().find(function (x) { return x.id === b.getAttribute('data-del'); });
        if (!m || !confirm('Supprimer la carte « ' + (m.name || 'Sans titre') + ' » ?')) return;
        Store.saveBattleMaps(maps().filter(function (x) { return x.id !== m.id; }));
        render();
      });
    });
  }

  // Vignette miniature (aperçu de la liste)
  function thumbHtml(m) {
    const cols = m.cols || COLS, rows = m.rows || ROWS;
    return '<div class="map-thumb-grid" style="aspect-ratio:' + cols + '/' + rows + '">' +
      (m.zones || []).map(function (z) {
        return '<span style="left:' + (z.x / cols * 100) + '%;top:' + (z.y / rows * 100) + '%;' +
          'width:' + (z.w / cols * 100) + '%;height:' + (z.h / rows * 100) + '%"></span>';
      }).join('') + '</div>';
  }

  // ---------- Rendu : éditeur ----------
  function renderEditor(root) {
    const m = editing;
    const cols = m.cols, rows = m.rows;
    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head">' +
          '<h2>' + (m.name ? esc(m.name) : 'Nouvelle carte') + '</h2>' +
          '<div style="display:flex;gap:.4rem">' +
            '<button id="map-back" class="ghost small">← Retour</button>' +
            '<button id="map-save" class="primary small">💾 Enregistrer</button>' +
          '</div>' +
        '</div>' +
        '<div class="map-edit-bar">' +
          '<label>Nom de la carte <input type="text" id="map-name" value="' + esc(m.name) + '" placeholder="La taverne du Sanglier"></label>' +
          '<span class="hint map-edit-help">✏️ <b>Dessiner</b> : cliquer-glisser sur le vide. ' +
            '<b>Relier</b> : cliquer une salle puis une autre. Cliquer une salle la sélectionne.</span>' +
        '</div>' +
        '<div class="map-board-wrap">' +
          '<div id="map-board" class="map-board" style="aspect-ratio:' + cols + '/' + rows + '">' +
            boardHtml(m) +
          '</div>' +
        '</div>' +
        '<div class="map-panels">' +
          '<div class="map-panel" id="map-zone-panel">' + zonePanelHtml(m) + '</div>' +
          '<div class="map-panel" id="map-links-panel">' + linksPanelHtml(m) + '</div>' +
        '</div>' +
      '</div>';

    $('#map-back').addEventListener('click', function () {
      if (!confirm('Quitter sans enregistrer les modifications non sauvées ?')) return;
      editing = null; render();
    });
    $('#map-name').addEventListener('input', function () { m.name = this.value; });
    $('#map-save').addEventListener('click', saveMap);

    wireBoard(m);
    wireZonePanel(m);
    wireLinksPanel(m);
  }

  function boardHtml(m) {
    const cols = m.cols, rows = m.rows;
    let html = '';
    // Cellules de fond (repères de dessin)
    html += '<div class="map-grid-bg" style="grid-template-columns:repeat(' + cols + ',1fr);grid-template-rows:repeat(' + rows + ',1fr)">';
    for (let i = 0; i < cols * rows; i++) html += '<i></i>';
    html += '</div>';
    // Zones
    m.zones.forEach(function (z, i) {
      html += '<div class="map-zone' + (i === selZone ? ' sel' : '') + (i === linkFrom ? ' link-from' : '') +
        (z.heroStart ? ' hero-start' : '') + '" data-zi="' + i + '"' +
        ' style="left:' + (z.x / cols * 100) + '%;top:' + (z.y / rows * 100) + '%;' +
        'width:' + (z.w / cols * 100) + '%;height:' + (z.h / rows * 100) + '%">' +
        '<span class="map-zone-name">' + esc(z.name || ('Zone ' + (i + 1))) + '</span>' +
        (z.heroStart ? '<span class="map-zone-hero" title="Zone de départ des aventuriers">🛡</span>' : '') +
      '</div>';
    });
    // Liens (portes / barrières)
    m.links.forEach(function (l, li) {
      const za = m.zones[l.a], zb = m.zones[l.b];
      if (!za || !zb) return;
      const p = contactPt(za, zb);
      const t = l.barrier && l.barrier.type;
      html += '<button type="button" class="map-link' + (t ? ' map-link-bar barrier-' + t : '') + '" data-li="' + li + '"' +
        ' title="' + esc((za.name || 'A') + ' ↔ ' + (zb.name || 'B')) + '"' +
        ' style="left:' + (p.x / cols * 100) + '%;top:' + (p.y / rows * 100) + '%">' +
        (t ? '⚠' : '🚪') + '</button>';
    });
    return html;
  }

  function zonePanelHtml(m) {
    if (selZone < 0 || !m.zones[selZone]) {
      return '<div class="map-panel-title">Salle</div>' +
        '<p class="hint">Sélectionne une salle sur le plan, ou dessine-en une nouvelle (cliquer-glisser sur le vide).</p>';
    }
    const z = m.zones[selZone];
    return '<div class="map-panel-title">Salle — ' + esc(z.name || ('Zone ' + (selZone + 1))) + '</div>' +
      '<label>Nom <input type="text" id="mz-name" value="' + esc(z.name || '') + '" placeholder="Grande salle"></label>' +
      '<label class="mz-check"><input type="checkbox" id="mz-hero"' + (z.heroStart ? ' checked' : '') + '> Zone de départ des aventuriers</label>' +
      '<div class="map-panel-actions">' +
        '<button id="mz-link" class="ghost small">' + (linkFrom === selZone ? '✕ Annuler le lien' : '🔗 Relier à…') + '</button>' +
        '<button id="mz-del" class="ghost small del-btn">✕ Supprimer la salle</button>' +
      '</div>' +
      '<p class="hint">Position ' + z.x + ',' + z.y + ' · taille ' + z.w + '×' + z.h + '</p>';
  }

  function linksPanelHtml(m) {
    let html = '<div class="map-panel-title">Liens & barrières</div>';
    if (!m.links.length) return html + '<p class="hint">Aucun lien. Deux salles non reliées sont séparées par un mur infranchissable.</p>';
    html += m.links.map(function (l, li) {
      const za = m.zones[l.a], zb = m.zones[l.b];
      const t = (l.barrier && l.barrier.type) || '';
      return '<div class="map-link-row" data-li="' + li + '">' +
        '<span class="map-link-names">' + esc((za && za.name) || 'A') + ' ↔ ' + esc((zb && zb.name) || 'B') + '</span>' +
        '<select class="ml-type" data-li="' + li + '">' +
          BAR_TYPES.map(function (bt) {
            return '<option value="' + bt.v + '"' + (t === bt.v ? ' selected' : '') + '>' + bt.label + '</option>';
          }).join('') +
        '</select>' +
        (t === 'difficile'
          ? '<select class="ml-diff" data-li="' + li + '">' +
              ['facile', 'moyen', 'difficile'].map(function (d) {
                return '<option value="' + d + '"' + ((l.barrier.diff || 'moyen') === d ? ' selected' : '') + '>Agilité ' + d + '</option>';
              }).join('') + '</select>'
          : '') +
        (t ? '<input type="text" class="ml-name" data-li="' + li + '" value="' + esc(l.barrier.name || '') + '" placeholder="éboulis, herse…">' : '') +
        '<button type="button" class="ghost small del-btn ml-del" data-li="' + li + '" title="Supprimer le lien">✕</button>' +
      '</div>';
    }).join('');
    return html;
  }

  // ---------- Interactions ----------
  function cellFromEvent(board, m, ev) {
    const r = board.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / r.width * m.cols);
    const y = Math.floor((ev.clientY - r.top) / r.height * m.rows);
    return { x: Math.max(0, Math.min(m.cols - 1, x)), y: Math.max(0, Math.min(m.rows - 1, y)) };
  }

  function wireBoard(m) {
    const board = $('#map-board');
    // Clic sur une salle : sélection, ou création de lien si le mode est armé.
    board.querySelectorAll('.map-zone').forEach(function (el) {
      el.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const zi = parseInt(el.getAttribute('data-zi'), 10);
        if (linkFrom >= 0 && linkFrom !== zi) {
          if (linkAt(linkFrom, zi) < 0) m.links.push({ a: linkFrom, b: zi, barrier: null });
          linkFrom = -1; selZone = zi;
          renderEditor($('#cartes-root')); return;
        }
        selZone = (selZone === zi) ? -1 : zi;
        linkFrom = -1;
        renderEditor($('#cartes-root'));
      });
    });
    // Clic sur un lien : le sélectionner dans le panneau (surbrillance simple)
    board.querySelectorAll('.map-link').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const row = document.querySelector('.map-link-row[data-li="' + el.getAttribute('data-li') + '"]');
        if (row) { row.classList.add('flash'); row.scrollIntoView({ block: 'nearest' }); setTimeout(function () { row.classList.remove('flash'); }, 900); }
      });
    });
    // Dessin d'une nouvelle salle : cliquer-glisser sur le vide.
    board.addEventListener('mousedown', function (ev) {
      if (ev.button !== 0) return;
      const c = cellFromEvent(board, m, ev);
      drag = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
      updateGhost(board, m);
      const move = function (e2) {
        const c2 = cellFromEvent(board, m, e2);
        drag.x1 = c2.x; drag.y1 = c2.y;
        updateGhost(board, m);
      };
      const up = function () {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (!drag) return;
        const r = normRect({ x: drag.x0, y: drag.y0 }, { x: drag.x1, y: drag.y1 });
        drag = null;
        const ghost = board.querySelector('.map-ghost');
        if (ghost) ghost.remove();
        if (overlaps(r, m.zones, -1)) return; // chevauchement : on ne crée rien
        m.zones.push({ name: 'Salle ' + (m.zones.length + 1), x: r.x, y: r.y, w: r.w, h: r.h,
          heroStart: m.zones.length === 0 });
        selZone = m.zones.length - 1; linkFrom = -1;
        renderEditor($('#cartes-root'));
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function updateGhost(board, m) {
    let ghost = board.querySelector('.map-ghost');
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.className = 'map-ghost';
      board.appendChild(ghost);
    }
    const r = normRect({ x: drag.x0, y: drag.y0 }, { x: drag.x1, y: drag.y1 });
    ghost.classList.toggle('bad', overlaps(r, m.zones, -1));
    ghost.style.left = (r.x / m.cols * 100) + '%';
    ghost.style.top = (r.y / m.rows * 100) + '%';
    ghost.style.width = (r.w / m.cols * 100) + '%';
    ghost.style.height = (r.h / m.rows * 100) + '%';
  }

  function wireZonePanel(m) {
    const nm = $('#mz-name');
    if (nm) nm.addEventListener('input', function () {
      m.zones[selZone].name = this.value;
      const el = document.querySelector('.map-zone[data-zi="' + selZone + '"] .map-zone-name');
      if (el) el.textContent = this.value || ('Zone ' + (selZone + 1));
    });
    const hs = $('#mz-hero');
    if (hs) hs.addEventListener('change', function () {
      // Une seule zone de départ : la cocher décoche les autres.
      m.zones.forEach(function (z, i) { z.heroStart = hs.checked && i === selZone; });
      if (!hs.checked && m.zones.length) m.zones[0].heroStart = true;
      renderEditor($('#cartes-root'));
    });
    const lk = $('#mz-link');
    if (lk) lk.addEventListener('click', function () {
      linkFrom = (linkFrom === selZone) ? -1 : selZone;
      renderEditor($('#cartes-root'));
    });
    const del = $('#mz-del');
    if (del) del.addEventListener('click', function () {
      const zi = selZone;
      m.zones.splice(zi, 1);
      // Réindexe les liens ; ceux qui touchaient la salle disparaissent.
      m.links = m.links.filter(function (l) { return l.a !== zi && l.b !== zi; })
        .map(function (l) {
          return { a: l.a > zi ? l.a - 1 : l.a, b: l.b > zi ? l.b - 1 : l.b, barrier: l.barrier };
        });
      if (m.zones.length && !m.zones.some(function (z) { return z.heroStart; })) m.zones[0].heroStart = true;
      selZone = -1; linkFrom = -1;
      renderEditor($('#cartes-root'));
    });
  }

  function wireLinksPanel(m) {
    document.querySelectorAll('.ml-type').forEach(function (sel) {
      sel.addEventListener('change', function () {
        const l = m.links[parseInt(sel.getAttribute('data-li'), 10)];
        l.barrier = sel.value ? { type: sel.value, diff: 'moyen', name: (l.barrier && l.barrier.name) || '' } : null;
        renderEditor($('#cartes-root'));
      });
    });
    document.querySelectorAll('.ml-diff').forEach(function (sel) {
      sel.addEventListener('change', function () {
        m.links[parseInt(sel.getAttribute('data-li'), 10)].barrier.diff = sel.value;
      });
    });
    document.querySelectorAll('.ml-name').forEach(function (inp) {
      inp.addEventListener('input', function () {
        m.links[parseInt(inp.getAttribute('data-li'), 10)].barrier.name = inp.value;
      });
    });
    document.querySelectorAll('.ml-del').forEach(function (b) {
      b.addEventListener('click', function () {
        m.links.splice(parseInt(b.getAttribute('data-li'), 10), 1);
        renderEditor($('#cartes-root'));
      });
    });
  }

  function saveMap() {
    const m = editing;
    if (!m.zones.length) { alert('Dessine au moins une salle avant d\'enregistrer.'); return; }
    if (!m.name.trim()) { alert('Donne un nom à ta carte.'); $('#map-name').focus(); return; }
    if (!m.zones.some(function (z) { return z.heroStart; })) m.zones[0].heroStart = true;
    // Garde-fou : signale les salles totalement isolées (murées).
    if (m.zones.length > 1) {
      const linked = {};
      m.links.forEach(function (l) { linked[l.a] = true; linked[l.b] = true; });
      const lone = m.zones.map(function (z, i) { return linked[i] ? null : (z.name || ('Zone ' + (i + 1))); })
        .filter(Boolean);
      if (lone.length && !confirm('Salle(s) sans aucun lien (donc murée(s), inaccessibles en combat) : ' +
        lone.join(', ') + '.\n\nEnregistrer quand même ?')) return;
    }
    const all = maps();
    const i = all.findIndex(function (x) { return x.id === m.id; });
    if (i >= 0) all[i] = m; else all.push(m);
    Store.saveBattleMaps(all);
    editing = null; selZone = -1; linkFrom = -1;
    render();
  }

  return { render: render, mapToConfig: mapToConfig };
})(window);
