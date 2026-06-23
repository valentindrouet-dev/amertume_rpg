/*
 * Import / Export des données sous forme de tableaux CSV
 * (ouvrables et éditables dans Excel / Google Sheets / Word).
 * Catégories : aventures, monstres, inventaire (objets), aventuriers.
 * Les champs très imbriqués (attaques, talents, chapitres, équipement) sont
 * stockés dans une cellule au format JSON pour rester sans perte.
 */
(function (global) {
  'use strict';

  const D = AmertumeDice;
  const SKILLS = ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'];

  // ---------- CSV bas niveau ----------
  // Délimiteur point-virgule : Excel (locale FR) découpe alors directement en
  // colonnes lisibles. L'import détecte automatiquement « ; » ou « , ».
  const DELIM = ';';
  function csvCell(v) {
    v = (v === null || v === undefined) ? '' : String(v);
    return /[";,\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCSV(headers, rows) {
    const lines = [headers.join(DELIM)];
    rows.forEach(function (r) { lines.push(headers.map(function (h) { return csvCell(r[h]); }).join(DELIM)); });
    return lines.join('\r\n');
  }
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstLine = text.split('\n')[0] || '';
    const delim = firstLine.indexOf(';') >= 0 ? ';' : ',';
    const rows = []; let cur = []; let field = ''; let inQ = false; let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === delim) { cur.push(field); field = ''; i++; continue; }
      if (ch === '\n') { cur.push(field); field = ''; rows.push(cur); cur = []; i++; continue; }
      field += ch; i++;
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    if (!rows.length) return [];
    const headers = rows.shift().map(function (h) { return h.trim(); });
    return rows.filter(function (r) { return r.some(function (c) { return c !== ''; }); })
      .map(function (r) { const o = {}; headers.forEach(function (h, idx) { o[h] = r[idx] !== undefined ? r[idx] : ''; }); return o; });
  }
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Encodeurs de champs ----------
  function bEnc(b) { return b ? 'oui' : 'non'; }
  function bDec(s) { return /^(oui|true|1)$/i.test(String(s || '').trim()); }
  function nDec(s, d) { const n = parseInt(s, 10); return isNaN(n) ? (d || 0) : n; }
  function diceEnc(d) {
    const p = [];
    D.DICE_ORDER.forEach(function (c) { if (d && d[c]) p.push(c + ':' + d[c]); });
    return p.join(';');
  }
  function diceDec(s) {
    const o = D.emptyPool();
    String(s || '').split(';').forEach(function (t) {
      const kv = t.split(':'); if (kv[0] && D.DICE_TYPES[kv[0]]) o[kv[0]] = nDec(kv[1], 0);
    });
    return o;
  }
  function skillsEnc(sk) {
    const p = [];
    SKILLS.forEach(function (s) { if (sk && sk[s]) p.push(s + ':' + sk[s]); });
    return p.join(';');
  }
  function skillsDec(s) {
    const o = {}; SKILLS.forEach(function (k) { o[k] = 0; });
    String(s || '').split(';').forEach(function (t) {
      const kv = t.split(':'); if (kv[0] && o.hasOwnProperty(kv[0].trim())) o[kv[0].trim()] = nDec(kv[1], 0);
    });
    return o;
  }
  function jEnc(v) { try { return JSON.stringify(v || []); } catch (e) { return ''; } }
  function jDec(s, fallback) { try { const v = JSON.parse(s); return v; } catch (e) { return fallback; } }

  // ---------- Définition des catégories ----------
  const CATS = {
    items: {
      file: 'amertume-inventaire.csv',
      headers: ['id', 'name', 'category', 'qty', 'hands', 'ranged', 'def', 'slot', 'price', 'traits', 'dice', 'effects', 'notes'],
      get: function () { return Store.state.items; },
      toRow: function (i) {
        return {
          id: i.id, name: i.name, category: i.category, qty: i.qty || 1,
          hands: i.hands || 1, ranged: bEnc(i.ranged), def: (typeof i.def === 'number' ? i.def : ''),
          slot: i.slot || '', price: i.price || 0, traits: (i.traits || []).join(';'),
          dice: diceEnc(i.dice), effects: i.effects || '', notes: i.notes || '',
        };
      },
      fromRow: function (r, prev) {
        const it = prev || {};
        it.id = r.id || it.id || Store.uid();
        it.name = r.name || it.name || 'Sans nom';
        it.category = r.category || it.category || 'misc';
        it.qty = nDec(r.qty, 1); it.hands = nDec(r.hands, 1); it.ranged = bDec(r.ranged);
        it.usesAmmo = it.usesAmmo || false; it.consumable = it.consumable || false;
        if (r.def !== '') it.def = nDec(r.def, 0);
        if (r.slot) it.slot = r.slot;
        it.price = nDec(r.price, 0);
        it.traits = r.traits ? r.traits.split(';').filter(Boolean) : [];
        it.dice = diceDec(r.dice);
        it.effects = r.effects || ''; it.notes = r.notes || '';
        return it;
      },
      save: function (arr) { Store.state.items = arr; Store.save(); },
      render: function () { if (global.Inventory) Inventory.render(); },
    },
    monsters: {
      file: 'amertume-monstres.csv',
      headers: ['id', 'name', 'type', 'socle', 'family', 'pv', 'def', 'damage', 'xp', 'menace', 'esquive', 'rapide', 'attacks', 'talents', 'notes'],
      get: function () { return Store.state.monsters; },
      toRow: function (m) {
        return {
          id: m.id, name: m.name, type: m.type, socle: m.socle || 'medium', family: m.family || '',
          pv: m.pv, def: m.def, damage: m.damage, xp: m.xp, menace: m.menace || 'closest',
          esquive: bEnc(m.esquive), rapide: bEnc(m.rapide),
          attacks: jEnc(m.attacks), talents: jEnc(m.talents), notes: m.notes || '',
        };
      },
      fromRow: function (r, prev) {
        const m = prev || {};
        m.id = r.id || m.id || Store.uid();
        m.name = r.name || m.name || 'Monstre';
        m.type = r.type || m.type || 'standard'; m.socle = r.socle || m.socle || 'medium';
        m.family = r.family || ''; m.pv = nDec(r.pv, 1); m.def = nDec(r.def, 0);
        m.damage = nDec(r.damage, 0); m.xp = nDec(r.xp, 0); m.menace = r.menace || 'closest';
        m.esquive = bDec(r.esquive); m.rapide = bDec(r.rapide);
        m.attacks = jDec(r.attacks, m.attacks || []); m.talents = jDec(r.talents, m.talents || []);
        m.notes = r.notes || '';
        return m;
      },
      save: function (arr) { Store.state.monsters = arr; Store.save(); },
      render: function () { if (global.Combatants) Combatants.renderMonsters(); },
    },
    heroes: {
      file: 'amertume-aventuriers.csv',
      headers: ['id', 'name', 'klass', 'vie', 'endu', 'pvBonus', 'damage', 'rapide', 'adventureId', 'skills', 'equipment', 'attacks', 'notes'],
      get: function () { return Store.state.heroes; },
      toRow: function (h) {
        return {
          id: h.id, name: h.name, klass: h.klass || '', vie: h.vie, endu: h.endu,
          pvBonus: h.pvBonus || 0, damage: h.damage, rapide: bEnc(h.rapide),
          adventureId: h.adventureId || '', skills: skillsEnc(h.skills),
          equipment: jEnc(h.equipment || {}), attacks: jEnc(h.attacks || []), notes: h.notes || '',
        };
      },
      fromRow: function (r, prev) {
        const h = prev || {};
        h.id = r.id || h.id || Store.uid();
        h.name = r.name || h.name || 'Aventurier';
        h.klass = r.klass || ''; h.vie = nDec(r.vie, 1); h.endu = nDec(r.endu, 1);
        h.pvBonus = nDec(r.pvBonus, 0); h.damage = nDec(r.damage, 0); h.rapide = bDec(r.rapide);
        h.adventureId = r.adventureId || null;
        h.skills = skillsDec(r.skills);
        h.equipment = jDec(r.equipment, h.equipment || { mainG: null, mainD: null, armorId: null, objectId: null });
        h.attacks = jDec(r.attacks, h.attacks || []);
        h.notes = r.notes || '';
        return h;
      },
      save: function (arr) { Store.state.heroes = arr; Store.save(); },
      render: function () { if (global.Combatants) Combatants.renderHeroes(); },
    },
    adventures: {
      file: 'amertume-aventures.csv',
      headers: ['id', 'title', 'password', 'chapters'],
      get: function () { return Store.loadAdventures(); },
      toRow: function (a) {
        return { id: a.id, title: a.title, password: a.password || '', chapters: jEnc(a.chapters || []) };
      },
      fromRow: function (r, prev) {
        const a = prev || {};
        a.id = r.id || a.id || Store.uid();
        a.title = r.title || a.title || 'Aventure';
        a.password = r.password || '';
        a.chapters = jDec(r.chapters, a.chapters || []);
        return a;
      },
      save: function (arr) { Store.saveAdventures(arr); },
      render: function () { if (global.Adventure) Adventure.render(); },
    },
  };

  // ---------- Export / Import ----------
  function exportCat(cat) {
    const c = CATS[cat]; if (!c) return;
    const rows = c.get().map(c.toRow);
    download(c.file, toCSV(c.headers, rows));
  }

  function importCat(cat, text) {
    const c = CATS[cat]; if (!c) return;
    const incoming = parseCSV(text);
    if (!incoming.length) { alert('Fichier vide ou illisible.'); return; }
    const list = c.get().slice();
    const byId = {};
    list.forEach(function (x, idx) { byId[x.id] = idx; });
    let added = 0, updated = 0;
    incoming.forEach(function (r) {
      if (r.id && byId[r.id] !== undefined) {
        list[byId[r.id]] = c.fromRow(r, Object.assign({}, list[byId[r.id]]));
        updated++;
      } else {
        const obj = c.fromRow(r, null);
        byId[obj.id] = list.length; list.push(obj); added++;
      }
    });
    c.save(list);
    c.render();
    alert('Import terminé : ' + added + ' ajouté(s), ' + updated + ' mis à jour.');
  }

  let pendingCat = null;
  function init() {
    document.querySelectorAll('[data-export]').forEach(function (b) {
      b.addEventListener('click', function () { exportCat(b.getAttribute('data-export')); });
    });
    document.querySelectorAll('[data-import]').forEach(function (b) {
      b.addEventListener('click', function () { pendingCat = b.getAttribute('data-import'); const f = document.getElementById('io-file'); if (f) { f.value = ''; f.click(); } });
    });
    const file = document.getElementById('io-file');
    if (file) file.addEventListener('change', function (e) {
      const f = e.target.files[0]; if (!f || !pendingCat) return;
      const reader = new FileReader();
      reader.onload = function () { try { importCat(pendingCat, reader.result); } catch (err) { alert('Import impossible : ' + err.message); } };
      reader.readAsText(f);
    });
  }

  global.DataIO = { init: init, exportCat: exportCat, importCat: importCat };
})(window);
