/*
 * Gestion de l'inventaire et de l'équipement (armes).
 * Rendu de la liste d'objets, des emplacements d'armes, et de la modale d'édition.
 */
(function (global) {
  'use strict';

  const D = AmertumeDice;
  const $ = function (sel, root) { return (root || document).querySelector(sel); };

  // ---- Helper réutilisable : steppers de dés (+/-) ----
  function buildDiceSteppers(container, pool, onChange) {
    container.innerHTML = '';
    D.DICE_ORDER.forEach(function (color) {
      const t = D.DICE_TYPES[color];
      const wrap = document.createElement('div');
      wrap.className = 'stepper die-' + color;
      wrap.innerHTML =
        '<span class="die-chip" title="' + t.label + '">' + t.emoji + '</span>' +
        '<button type="button" class="step-btn" data-act="dec">−</button>' +
        '<span class="step-val">' + (pool[color] || 0) + '</span>' +
        '<button type="button" class="step-btn" data-act="inc">+</button>';
      const valEl = wrap.querySelector('.step-val');
      wrap.querySelector('[data-act="dec"]').addEventListener('click', function () {
        pool[color] = Math.max(0, (pool[color] || 0) - 1);
        valEl.textContent = pool[color];
        if (onChange) onChange();
      });
      wrap.querySelector('[data-act="inc"]').addEventListener('click', function () {
        pool[color] = (pool[color] || 0) + 1;
        valEl.textContent = pool[color];
        if (onChange) onChange();
      });
      container.appendChild(wrap);
    });
  }

  function poolBadges(pool) {
    const parts = D.DICE_ORDER
      .filter(function (c) { return (pool[c] || 0) > 0; })
      .map(function (c) {
        return '<span class="die-badge die-' + c + '">' + D.DICE_TYPES[c].emoji +
               ' ×' + pool[c] + '</span>';
      });
    return parts.length ? parts.join('') : '<span class="hint">aucun dé</span>';
  }

  const CAT_LABEL = {
    weapon: 'Arme', ammo: 'Munition', armor: 'Armure', object: 'Objet', misc: 'Divers',
  };

  // ---- Équipement ----
  function equippedWeapons() {
    const eq = Store.state.equipped;
    const byId = function (id) { return Store.state.items.find(function (i) { return i.id === id; }); };
    if (eq.twoHand) {
      const w = byId(eq.twoHand);
      return w ? [w] : [];
    }
    return [eq.mainHand, eq.offHand]
      .map(byId)
      .filter(Boolean);
  }

  function equippedPool() {
    return D.addPools.apply(null, equippedWeapons().map(function (w) { return w.dice; }));
  }

  function isEquipped(id) {
    const eq = Store.state.equipped;
    return eq.mainHand === id || eq.offHand === id || eq.twoHand === id;
  }

  function unequip(id) {
    const eq = Store.state.equipped;
    if (eq.mainHand === id) eq.mainHand = null;
    if (eq.offHand === id) eq.offHand = null;
    if (eq.twoHand === id) eq.twoHand = null;
  }

  function equip(item) {
    const eq = Store.state.equipped;
    if (isEquipped(item.id)) { unequip(item.id); }
    else if (item.hands === 2) {
      eq.twoHand = item.id; eq.mainHand = null; eq.offHand = null;
    } else {
      eq.twoHand = null;
      if (!eq.mainHand) eq.mainHand = item.id;
      else if (!eq.offHand) eq.offHand = item.id;
      else eq.mainHand = item.id; // remplace la main principale si les deux sont pris
    }
    Store.save();
    render();
    document.dispatchEvent(new CustomEvent('equipment-changed'));
  }

  function renderEquipSlots() {
    const box = $('#equip-slots');
    const eq = Store.state.equipped;
    const weapons = equippedWeapons();
    if (!weapons.length) {
      box.innerHTML = '<p class="empty">Aucune arme équipée. Clique sur « Équiper » sur une arme de l\'inventaire.</p>';
    } else {
      box.innerHTML = weapons.map(function (w) {
        const tag = eq.twoHand ? '2 mains' : (eq.mainHand === w.id ? 'Main principale' : 'Main secondaire');
        return '<div class="equip-card">' +
          '<div class="equip-card-head"><strong>' + escapeHtml(w.name) + '</strong>' +
          '<span class="tag">' + tag + '</span></div>' +
          '<div class="dice-pool-display">' + poolBadges(w.dice) + '</div>' +
          (w.effects ? '<div class="hint">' + escapeHtml(w.effects) + '</div>' : '') +
          '<button class="ghost small" data-unequip="' + w.id + '">Déséquiper</button>' +
        '</div>';
      }).join('');
      box.querySelectorAll('[data-unequip]').forEach(function (b) {
        b.addEventListener('click', function () {
          unequip(b.getAttribute('data-unequip'));
          Store.save(); render();
          document.dispatchEvent(new CustomEvent('equipment-changed'));
        });
      });
    }
    $('#equip-dice').innerHTML = poolBadges(equippedPool());
  }

  // ---- Liste d'inventaire ----
  function renderList() {
    const list = $('#item-list');
    const term = ($('#search').value || '').toLowerCase().trim();
    const cat = $('#filter-cat').value;
    const items = Store.state.items.filter(function (i) {
      if (cat && i.category !== cat) return false;
      if (term && i.name.toLowerCase().indexOf(term) === -1 &&
          (i.notes || '').toLowerCase().indexOf(term) === -1) return false;
      return true;
    });

    if (!items.length) {
      list.innerHTML = '<p class="empty">Aucun objet. Clique sur « + Ajouter ».</p>';
      return;
    }

    list.innerHTML = items.map(function (i) {
      const equipped = isEquipped(i.id);
      const isWeapon = i.category === 'weapon';
      const isArmor = i.category === 'armor';
      const traits = (i.traits || []).map(function (t) {
        return '<span class="tag">' + (t === 'jetable' ? 'Jetable' : t === 'vicieuse' ? 'Vicieuse' : t) + '</span>';
      }).join('');
      return '<div class="item-row' + (equipped ? ' is-equipped' : '') + '">' +
        '<div class="item-main">' +
          '<div class="item-title">' +
            '<strong>' + escapeHtml(i.name) + '</strong>' +
            '<span class="tag">' + (CAT_LABEL[i.category] || i.category) + '</span>' +
            (i.qty > 1 ? '<span class="tag qty">×' + i.qty + '</span>' : '') +
            (i.consumable ? '<span class="tag consum">conso</span>' : '') +
            (equipped ? '<span class="tag eq">équipée</span>' : '') +
            (typeof i.price === 'number' && i.price ? '<span class="tag">' + i.price + ' po</span>' : '') +
          '</div>' +
          (isWeapon ? '<div class="dice-pool-display">' + poolBadges(i.dice) +
            '<span class="hint"> · ' + (i.hands === 2 ? '2 mains' : '1 main') +
            (i.ranged ? ' · distance' : '') + '</span> ' + traits + '</div>' : '') +
          (isArmor ? '<div class="hint">🛡 DEF ' + (i.def || 0) +
            (i.slot === 'shield' ? ' · Bouclier (+' + (i.def || 0) + ')' : ' · Corps') + '</div>' : '') +
          (i.effects ? '<div class="hint">⚡ ' + escapeHtml(i.effects) + '</div>' : '') +
          (i.notes ? '<div class="hint">' + escapeHtml(i.notes) + '</div>' : '') +
        '</div>' +
        '<div class="item-actions">' +
          (isWeapon ? '<button class="' + (equipped ? 'ghost' : 'primary') + ' small" data-equip="' + i.id + '">' +
            (equipped ? 'Déséquiper' : 'Équiper') + '</button>' : '') +
          '<button class="ghost small" data-edit="' + i.id + '">Éditer</button>' +
        '</div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('[data-equip]').forEach(function (b) {
      b.addEventListener('click', function () {
        const item = Store.state.items.find(function (x) { return x.id === b.getAttribute('data-equip'); });
        if (item) equip(item);
      });
    });
    list.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(b.getAttribute('data-edit')); });
    });
  }

  function render() {
    renderEquipSlots();
    renderList();
  }

  // ---- Modale d'édition ----
  const modal = function () { return $('#item-modal'); };
  let weaponDicePool = D.emptyPool();

  function openModal(id) {
    const isEdit = !!id;
    const item = isEdit ? Store.state.items.find(function (i) { return i.id === id; }) : null;
    $('#modal-title').textContent = isEdit ? 'Éditer l\'objet' : 'Ajouter un objet';
    $('#f-id').value = isEdit ? item.id : '';
    $('#f-name').value = isEdit ? item.name : '';
    $('#f-category').value = isEdit ? item.category : 'weapon';
    $('#f-qty').value = isEdit ? item.qty : 1;
    $('#f-hands').value = isEdit ? String(item.hands || 1) : '1';
    $('#f-ranged').checked = isEdit ? !!item.ranged : false;
    $('#f-uses-ammo').checked = isEdit ? !!item.usesAmmo : false;
    $('#f-consumable').checked = isEdit ? !!item.consumable : false;
    $('#f-effects').value = isEdit ? (item.effects || '') : '';
    $('#f-notes').value = isEdit ? (item.notes || '') : '';
    const traits = isEdit ? (item.traits || []) : [];
    $('#f-trait-jetable').checked = traits.indexOf('jetable') !== -1;
    $('#f-trait-vicieuse').checked = traits.indexOf('vicieuse') !== -1;
    $('#f-price').value = isEdit ? (item.price || 0) : 0;
    $('#f-armor-def').value = isEdit && typeof item.def === 'number' ? item.def : 1;
    $('#f-armor-slot').value = isEdit ? (item.slot || 'body') : 'body';
    $('#f-armor-price').value = isEdit ? (item.price || 0) : 0;
    weaponDicePool = isEdit ? Object.assign(D.emptyPool(), item.dice) : D.emptyPool();
    buildDiceSteppers($('#weapon-dice'), weaponDicePool);
    $('#btn-delete-item').hidden = !isEdit;
    toggleWeaponFields();
    modal().hidden = false;
    $('#f-name').focus();
  }

  function closeModal() { modal().hidden = true; }

  function toggleWeaponFields() {
    const cat = $('#f-category').value;
    $('#weapon-fields').style.display = cat === 'weapon' ? '' : 'none';
    $('#armor-fields').style.display = cat === 'armor' ? '' : 'none';
  }

  function saveFromForm(e) {
    e.preventDefault();
    const id = $('#f-id').value || Store.uid();
    const existing = Store.state.items.find(function (i) { return i.id === id; });
    const cat = $('#f-category').value;
    const isArmor = cat === 'armor';
    const traits = [];
    if ($('#f-trait-jetable').checked) traits.push('jetable');
    if ($('#f-trait-vicieuse').checked) traits.push('vicieuse');
    const data = {
      id: id,
      name: $('#f-name').value.trim() || 'Sans nom',
      category: cat,
      qty: Math.max(1, parseInt($('#f-qty').value, 10) || 1),
      hands: parseInt($('#f-hands').value, 10) || 1,
      ranged: $('#f-ranged').checked,
      usesAmmo: $('#f-uses-ammo').checked,
      consumable: $('#f-consumable').checked,
      dice: Object.assign(D.emptyPool(), weaponDicePool),
      traits: traits,
      price: parseInt(isArmor ? $('#f-armor-price').value : $('#f-price').value, 10) || 0,
      effects: $('#f-effects').value.trim(),
      notes: $('#f-notes').value.trim(),
    };
    if (isArmor) {
      data.def = parseInt($('#f-armor-def').value, 10) || 0;
      data.slot = $('#f-armor-slot').value;
    }
    if (existing) Object.assign(existing, data);
    else Store.state.items.push(data);
    Store.save();
    closeModal();
    render();
    document.dispatchEvent(new CustomEvent('equipment-changed'));
  }

  function deleteCurrent() {
    const id = $('#f-id').value;
    if (!id) return;
    if (!confirm('Supprimer cet objet ?')) return;
    unequip(id);
    Store.state.items = Store.state.items.filter(function (i) { return i.id !== id; });
    Store.save();
    closeModal();
    render();
    document.dispatchEvent(new CustomEvent('equipment-changed'));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    $('#btn-add-item').addEventListener('click', function () { openModal(null); });
    $('#modal-close').addEventListener('click', closeModal);
    $('#item-modal').addEventListener('click', function (e) {
      if (e.target === modal()) closeModal();
    });
    $('#item-form').addEventListener('submit', saveFromForm);
    $('#btn-delete-item').addEventListener('click', deleteCurrent);
    $('#f-category').addEventListener('change', toggleWeaponFields);
    $('#search').addEventListener('input', renderList);
    $('#filter-cat').addEventListener('change', renderList);
    $('#btn-load-official').addEventListener('click', function () {
      const n = Store.loadOfficial();
      render();
      document.dispatchEvent(new CustomEvent('equipment-changed'));
      alert(n ? (n + ' pièce(s) ajoutée(s) depuis le catalogue officiel.') : 'Catalogue officiel déjà présent.');
    });
    render();
  }

  global.Inventory = {
    init: init,
    render: render,
    equippedPool: equippedPool,
    equippedWeapons: equippedWeapons,
    buildDiceSteppers: buildDiceSteppers,
    poolBadges: poolBadges,
    escapeHtml: escapeHtml,
  };
})(window);
