/*
 * Éditeurs du roster de héros et du bestiaire (monstres).
 * Partagent un éditeur d'attaques commun.
 */
(function (global) {
  'use strict';

  const D = AmertumeDice;
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const esc = function (s) { return Inventory.escapeHtml(s); };

  const RANGE_LABEL = { contact: 'Contact', distance: 'Distance' };
  const MENACE_LABEL = { closest: 'Plus proche', pvLow: 'PV bas', pvHigh: 'PV haut', defLow: 'DEF basse' };
  const TYPE_LABEL = { standard: 'Standard', solitaire: 'Solitaire', alpha: 'Alpha', boss: 'Boss' };

  function newAttack() {
    return { name: 'Attaque', dice: D.emptyPool(), range: 'contact',
             targets: 'one', useOwnDamage: true, effects: Store.noStates() };
  }

  // ---- Éditeur d'attaques (réutilisé héros + monstres) ----
  function buildAttacksEditor(container, attacks, onChange) {
    container.innerHTML = '';
    attacks.forEach(function (atk, idx) {
      if (!atk.effects) atk.effects = Store.noStates();
      const row = document.createElement('div');
      row.className = 'attack-row';
      row.innerHTML =
        '<div class="attack-row-top">' +
          '<input type="text" class="atk-name" value="' + esc(atk.name) + '" placeholder="Nom de l\'attaque" />' +
          '<select class="atk-range">' +
            '<option value="contact">Contact</option>' +
            '<option value="distance">Distance</option>' +
          '</select>' +
          '<select class="atk-targets">' +
            '<option value="one">1 cible</option>' +
            '<option value="all">Toutes</option>' +
          '</select>' +
          '<button type="button" class="icon-btn atk-del" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="atk-dice"></div>' +
        '<div class="atk-effects">' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-own"> + Dégâts</label>' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-affaibli"> Affaibli</label>' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-ausol"> Au sol</label>' +
          '<label class="checkbox inline"><input type="checkbox" class="eff-feu"> Feu</label>' +
        '</div>';

      row.querySelector('.atk-range').value = atk.range;
      row.querySelector('.atk-targets').value = atk.targets;
      row.querySelector('.eff-own').checked = atk.useOwnDamage !== false;
      row.querySelector('.eff-affaibli').checked = !!atk.effects.affaibli;
      row.querySelector('.eff-ausol').checked = !!atk.effects.auSol;
      row.querySelector('.eff-feu').checked = !!atk.effects.feu;

      Inventory.buildDiceSteppers(row.querySelector('.atk-dice'), atk.dice, onChange);

      row.querySelector('.atk-name').addEventListener('input', function (e) { atk.name = e.target.value; });
      row.querySelector('.atk-range').addEventListener('change', function (e) { atk.range = e.target.value; });
      row.querySelector('.atk-targets').addEventListener('change', function (e) { atk.targets = e.target.value; });
      row.querySelector('.eff-own').addEventListener('change', function (e) { atk.useOwnDamage = e.target.checked; });
      row.querySelector('.eff-affaibli').addEventListener('change', function (e) { atk.effects.affaibli = e.target.checked; });
      row.querySelector('.eff-ausol').addEventListener('change', function (e) { atk.effects.auSol = e.target.checked; });
      row.querySelector('.eff-feu').addEventListener('change', function (e) { atk.effects.feu = e.target.checked; });
      row.querySelector('.atk-del').addEventListener('click', function () {
        const i = attacks.indexOf(atk);
        if (i >= 0) attacks.splice(i, 1);
        buildAttacksEditor(container, attacks, onChange);
        if (onChange) onChange();
      });

      container.appendChild(row);
    });
    if (!attacks.length) {
      container.innerHTML = '<p class="hint">Aucune attaque. Ajoute-en une.</p>';
    }
  }

  function attacksSummary(attacks) {
    return (attacks || []).map(function (a) {
      return '<span class="atk-badge">' + esc(a.name) + ' ' + Inventory.poolBadges(a.dice) +
        '<span class="hint"> ' + (RANGE_LABEL[a.range] || a.range) +
        (a.targets === 'all' ? ' · toutes' : '') + '</span></span>';
    }).join('');
  }

  // ================= HÉROS =================
  let heroAttacks = [];
  let heroEquipment = { weapons: [], armorId: null, shieldId: null };

  function heroPv(h) { return Math.max(1, (h.vie || 0) * (h.endu || 0) + (h.pvBonus || 0)); }
  function itemById(id) { return Store.state.items.find(function (i) { return i.id === id; }); }

  function heroWeapons(eq) {
    return (eq && eq.weapons || []).map(itemById).filter(function (i) { return i && i.category === 'weapon'; });
  }

  // DEF : l'armure DÉFINIT la DEF (la DEF de base est ignorée si une armure est portée) ; bouclier +def.
  function heroDef(h) {
    const eq = h.equipment || {};
    const armor = eq.armorId ? itemById(eq.armorId) : null;
    const shield = eq.shieldId ? itemById(eq.shieldId) : null;
    let def = (armor && armor.category === 'armor') ? (armor.def || 0) : (h.def || 0);
    if (shield && shield.category === 'armor') def += (shield.def || 0);
    return def;
  }

  // Attaques dérivées des armes équipées (mêlée / distance, dés cumulés)
  function heroDerivedAttacks(eq) {
    const weapons = heroWeapons(eq);
    const groups = { contact: [], distance: [] };
    weapons.forEach(function (w) { (w.ranged ? groups.distance : groups.contact).push(w); });
    const atks = [];
    ['contact', 'distance'].forEach(function (range) {
      const ws = groups[range];
      if (!ws.length) return;
      const pool = D.addPools.apply(null, ws.map(function (w) { return w.dice; }));
      if (!D.poolCount(pool)) return;
      const vicieuse = ws.some(function (w) { return (w.traits || []).indexOf('vicieuse') !== -1; });
      atks.push({
        name: (range === 'contact' ? 'Mêlée' : 'Distance') + ' — ' + ws.map(function (w) { return w.name; }).join(' + '),
        dice: pool, range: range, targets: 'one', useOwnDamage: true,
        effects: Store.noStates(), vicieuse: vicieuse,
      });
    });
    return atks;
  }

  // Attaques utilisées en combat : armes + spéciales (+ secours mains nues)
  function heroCombatAttacks(h) {
    let atks = heroDerivedAttacks(h.equipment).concat(JSON.parse(JSON.stringify(h.attacks || [])));
    if (!atks.length) {
      atks = [{ name: 'Mains nues', dice: Object.assign(D.emptyPool(), { white: 1 }),
        range: 'contact', targets: 'one', useOwnDamage: true, effects: Store.noStates() }];
    }
    return atks;
  }

  function renderHeroes() {
    const list = $('#hero-list');
    const heroes = Store.state.heroes;
    if (!heroes.length) {
      list.innerHTML = '<p class="empty">Aucun héros. Clique sur « + Nouveau héros ».</p>';
      return;
    }
    list.innerHTML = heroes.map(function (h) {
      const eq = h.equipment || {};
      const armor = eq.armorId ? itemById(eq.armorId) : null;
      const shield = eq.shieldId ? itemById(eq.shieldId) : null;
      const gear = [];
      heroWeapons(eq).forEach(function (w) { gear.push(w.name); });
      if (armor) gear.push(armor.name);
      if (shield) gear.push(shield.name);
      return '<div class="roster-card">' +
        '<div class="roster-head"><strong>' + esc(h.name) + '</strong>' +
          (h.rapide ? '<span class="tag">Rapide</span>' : '') +
          '<button class="ghost small" data-edit-hero="' + h.id + '">Éditer</button></div>' +
        '<div class="stat-line">❤ ' + heroPv(h) + ' PV · 🛡 DEF ' + heroDef(h) + ' · ⚔ Dég. ' + h.damage +
          ' <span class="hint">(Vie ' + h.vie + ' × Endu ' + h.endu + (h.pvBonus ? ' +' + h.pvBonus : '') + ')</span></div>' +
        (gear.length ? '<div class="hint">🎒 ' + esc(gear.join(', ')) + '</div>' : '') +
        '<div class="atk-badges">' + attacksSummary(heroCombatAttacks(h)) + '</div>' +
        (h.notes ? '<div class="hint">' + esc(h.notes) + '</div>' : '') +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-edit-hero]').forEach(function (b) {
      b.addEventListener('click', function () { openHeroModal(b.getAttribute('data-edit-hero')); });
    });
  }

  function updateHeroPvPreview() {
    $('#h-pv-preview').textContent = Math.max(1,
      (parseInt($('#h-vie').value, 10) || 0) * (parseInt($('#h-endu').value, 10) || 0) +
      (parseInt($('#h-pvbonus').value, 10) || 0));
  }

  function openHeroModal(id) {
    const isEdit = !!id;
    const h = isEdit ? Store.state.heroes.find(function (x) { return x.id === id; }) : null;
    $('#hero-modal-title').textContent = isEdit ? 'Éditer le héros' : 'Nouveau héros';
    $('#h-id').value = isEdit ? h.id : '';
    $('#h-name').value = isEdit ? h.name : '';
    $('#h-vie').value = isEdit ? h.vie : 4;
    $('#h-endu').value = isEdit ? h.endu : 3;
    $('#h-pvbonus').value = isEdit ? h.pvBonus : 0;
    $('#h-def').value = isEdit ? h.def : 3;
    $('#h-damage').value = isEdit ? h.damage : 2;
    $('#h-rapide').checked = isEdit ? !!h.rapide : false;
    $('#h-notes').value = isEdit ? (h.notes || '') : '';
    heroAttacks = isEdit ? JSON.parse(JSON.stringify(h.attacks || [])) : [];
    buildAttacksEditor($('#h-attacks'), heroAttacks);
    const srcEq = isEdit ? (h.equipment || {}) : {};
    heroEquipment = {
      weapons: (srcEq.weapons || []).slice(),
      armorId: srcEq.armorId || null,
      shieldId: srcEq.shieldId || null,
    };
    buildHeroEquipmentUI();
    $('#btn-delete-hero').hidden = !isEdit;
    updateHeroPvPreview();
    $('#hero-modal').hidden = false;
    $('#h-name').focus();
  }

  // Construit les sélecteurs d'armure/bouclier et la liste d'armes équipables
  function buildHeroEquipmentUI() {
    const items = Store.state.items;
    const bodies = items.filter(function (i) { return i.category === 'armor' && (i.slot || 'body') === 'body'; });
    const shields = items.filter(function (i) { return i.category === 'armor' && i.slot === 'shield'; });
    const weapons = items.filter(function (i) { return i.category === 'weapon'; });

    $('#h-armor').innerHTML = '<option value="">Aucune</option>' + bodies.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.name) + ' (DEF ' + (a.def || 0) + ')</option>';
    }).join('');
    $('#h-armor').value = heroEquipment.armorId || '';

    $('#h-shield').innerHTML = '<option value="">Aucun</option>' + shields.map(function (a) {
      return '<option value="' + a.id + '">' + esc(a.name) + ' (+' + (a.def || 0) + ')</option>';
    }).join('');
    $('#h-shield').value = heroEquipment.shieldId || '';

    const wbox = $('#h-weapons');
    if (!weapons.length) {
      wbox.innerHTML = '<p class="hint">Aucune arme dans l\'inventaire.</p>';
    } else {
      wbox.innerHTML = weapons.map(function (w) {
        const checked = heroEquipment.weapons.indexOf(w.id) !== -1;
        return '<label class="equip-pick-row"><input type="checkbox" data-weapon="' + w.id + '"' +
          (checked ? ' checked' : '') + '> ' + esc(w.name) + ' ' + Inventory.poolBadges(w.dice) +
          '<span class="hint"> ' + (w.hands === 2 ? '2 mains' : '1 main') + (w.ranged ? ' · distance' : '') + '</span></label>';
      }).join('');
      wbox.querySelectorAll('[data-weapon]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          const id = cb.getAttribute('data-weapon');
          const i = heroEquipment.weapons.indexOf(id);
          if (cb.checked && i === -1) heroEquipment.weapons.push(id);
          if (!cb.checked && i >= 0) heroEquipment.weapons.splice(i, 1);
          updateEquipPreview();
        });
      });
    }
    updateEquipPreview();
  }

  function updateEquipPreview() {
    const fake = { def: parseInt($('#h-def').value, 10) || 0, equipment: heroEquipment, attacks: [] };
    const atks = heroDerivedAttacks(heroEquipment);
    const names = atks.map(function (a) {
      return a.name.split(' — ')[0] + ' ' + Inventory.poolBadges(a.dice) + (a.vicieuse ? ' (Vicieuse)' : '');
    });
    $('#h-equip-preview').innerHTML = '🛡 DEF totale : <strong>' + heroDef(fake) + '</strong>' +
      (names.length ? ' · ⚔ ' + names.join(' / ') : ' · aucune arme → mains nues');
  }

  function saveHero(e) {
    e.preventDefault();
    const id = $('#h-id').value || Store.uid();
    const existing = Store.state.heroes.find(function (x) { return x.id === id; });
    const data = {
      id: id, name: $('#h-name').value.trim() || 'Héros',
      vie: parseInt($('#h-vie').value, 10) || 1,
      endu: parseInt($('#h-endu').value, 10) || 1,
      pvBonus: parseInt($('#h-pvbonus').value, 10) || 0,
      def: parseInt($('#h-def').value, 10) || 0,
      damage: parseInt($('#h-damage').value, 10) || 0,
      rapide: $('#h-rapide').checked,
      notes: $('#h-notes').value.trim(),
      attacks: heroAttacks,
      equipment: {
        weapons: heroEquipment.weapons.slice(),
        armorId: $('#h-armor').value || null,
        shieldId: $('#h-shield').value || null,
      },
    };
    if (existing) Object.assign(existing, data);
    else Store.state.heroes.push(data);
    Store.save();
    $('#hero-modal').hidden = true;
    renderHeroes();
  }

  // ================= MONSTRES =================
  let monsterAttacks = [];

  function renderMonsters() {
    const list = $('#monster-list');
    const term = ($('#monster-search').value || '').toLowerCase().trim();
    const type = $('#monster-filter-type').value;
    const monsters = Store.state.monsters.filter(function (m) {
      if (type && m.type !== type) return false;
      if (term && m.name.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
    if (!monsters.length) {
      list.innerHTML = '<p class="empty">Aucun monstre.</p>';
      return;
    }
    list.innerHTML = monsters.map(function (m) {
      return '<div class="roster-card type-' + m.type + '">' +
        '<div class="roster-head"><strong>' + esc(m.name) + '</strong>' +
          '<span class="tag type">' + (TYPE_LABEL[m.type] || m.type) + '</span>' +
          (m.rapide ? '<span class="tag">Rapide</span>' : '') +
          (m.esquive ? '<span class="tag">Esq. 6+</span>' : '') +
          '<button class="ghost small" data-edit-monster="' + m.id + '">Éditer</button></div>' +
        '<div class="stat-line">❤ ' + m.pv + ' PV · 🛡 DEF ' + m.def + ' · ⚔ Dég. ' + m.damage +
          ' · ✦ ' + m.xp + ' XP · 🎯 ' + (MENACE_LABEL[m.menace] || m.menace) + '</div>' +
        '<div class="atk-badges">' + attacksSummary(m.attacks) + '</div>' +
        (m.notes ? '<div class="hint">' + esc(m.notes) + '</div>' : '') +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-edit-monster]').forEach(function (b) {
      b.addEventListener('click', function () { openMonsterModal(b.getAttribute('data-edit-monster')); });
    });
  }

  function openMonsterModal(id) {
    const isEdit = !!id;
    const m = isEdit ? Store.state.monsters.find(function (x) { return x.id === id; }) : null;
    $('#monster-modal-title').textContent = isEdit ? 'Éditer le monstre' : 'Nouveau monstre';
    $('#m-id').value = isEdit ? m.id : '';
    $('#m-name').value = isEdit ? m.name : '';
    $('#m-pv').value = isEdit ? m.pv : 6;
    $('#m-def').value = isEdit ? m.def : 3;
    $('#m-damage').value = isEdit ? m.damage : 2;
    $('#m-xp').value = isEdit ? m.xp : 5;
    $('#m-type').value = isEdit ? m.type : 'standard';
    $('#m-socle').value = isEdit ? m.socle : 'medium';
    $('#m-menace').value = isEdit ? m.menace : 'closest';
    $('#m-esquive').checked = isEdit ? !!m.esquive : false;
    $('#m-rapide').checked = isEdit ? !!m.rapide : false;
    $('#m-notes').value = isEdit ? (m.notes || '') : '';
    monsterAttacks = isEdit ? JSON.parse(JSON.stringify(m.attacks || [])) : [newAttack()];
    buildAttacksEditor($('#m-attacks'), monsterAttacks);
    $('#btn-delete-monster').hidden = !isEdit;
    $('#monster-modal').hidden = false;
    $('#m-name').focus();
  }

  function saveMonster(e) {
    e.preventDefault();
    const id = $('#m-id').value || Store.uid();
    const existing = Store.state.monsters.find(function (x) { return x.id === id; });
    const data = {
      id: id, name: $('#m-name').value.trim() || 'Monstre',
      pv: parseInt($('#m-pv').value, 10) || 1,
      def: parseInt($('#m-def').value, 10) || 0,
      damage: parseInt($('#m-damage').value, 10) || 0,
      xp: parseInt($('#m-xp').value, 10) || 0,
      type: $('#m-type').value,
      socle: $('#m-socle').value,
      menace: $('#m-menace').value,
      esquive: $('#m-esquive').checked,
      rapide: $('#m-rapide').checked,
      notes: $('#m-notes').value.trim(),
      attacks: monsterAttacks,
    };
    if (existing) Object.assign(existing, data);
    else Store.state.monsters.push(data);
    Store.save();
    $('#monster-modal').hidden = true;
    renderMonsters();
  }

  function init() {
    // Héros
    $('#btn-add-hero').addEventListener('click', function () { openHeroModal(null); });
    $('#hero-modal-close').addEventListener('click', function () { $('#hero-modal').hidden = true; });
    $('#hero-modal').addEventListener('click', function (e) { if (e.target.id === 'hero-modal') $('#hero-modal').hidden = true; });
    $('#hero-form').addEventListener('submit', saveHero);
    $('#h-add-attack').addEventListener('click', function () {
      heroAttacks.push(newAttack()); buildAttacksEditor($('#h-attacks'), heroAttacks);
    });
    ['h-vie', 'h-endu', 'h-pvbonus'].forEach(function (idn) {
      $('#' + idn).addEventListener('input', updateHeroPvPreview);
    });
    $('#h-armor').addEventListener('change', function () { heroEquipment.armorId = $('#h-armor').value || null; updateEquipPreview(); });
    $('#h-shield').addEventListener('change', function () { heroEquipment.shieldId = $('#h-shield').value || null; updateEquipPreview(); });
    $('#h-def').addEventListener('input', updateEquipPreview);
    $('#btn-delete-hero').addEventListener('click', function () {
      const id = $('#h-id').value;
      if (id && confirm('Supprimer ce héros ?')) {
        Store.state.heroes = Store.state.heroes.filter(function (x) { return x.id !== id; });
        Store.save(); $('#hero-modal').hidden = true; renderHeroes();
      }
    });

    // Monstres
    $('#btn-add-monster').addEventListener('click', function () { openMonsterModal(null); });
    $('#monster-modal-close').addEventListener('click', function () { $('#monster-modal').hidden = true; });
    $('#monster-modal').addEventListener('click', function (e) { if (e.target.id === 'monster-modal') $('#monster-modal').hidden = true; });
    $('#monster-form').addEventListener('submit', saveMonster);
    $('#m-add-attack').addEventListener('click', function () {
      monsterAttacks.push(newAttack()); buildAttacksEditor($('#m-attacks'), monsterAttacks);
    });
    $('#monster-search').addEventListener('input', renderMonsters);
    $('#monster-filter-type').addEventListener('change', renderMonsters);
    $('#btn-delete-monster').addEventListener('click', function () {
      const id = $('#m-id').value;
      if (id && confirm('Supprimer ce monstre ?')) {
        Store.state.monsters = Store.state.monsters.filter(function (x) { return x.id !== id; });
        Store.save(); $('#monster-modal').hidden = true; renderMonsters();
      }
    });

    renderHeroes();
    renderMonsters();
  }

  global.Combatants = {
    init: init,
    renderHeroes: renderHeroes,
    renderMonsters: renderMonsters,
    heroPv: heroPv,
    heroDef: heroDef,
    heroCombatAttacks: heroCombatAttacks,
    attacksSummary: attacksSummary,
    TYPE_LABEL: TYPE_LABEL,
    MENACE_LABEL: MENACE_LABEL,
    RANGE_LABEL: RANGE_LABEL,
  };
})(window);
