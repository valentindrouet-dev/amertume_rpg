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

  // Rend chaque dé comme un carré distinct (deux dés = deux carrés, même de même couleur)
  function poolBadges(pool) {
    pool = pool || {};
    const squares = [];
    D.DICE_ORDER.forEach(function (c) {
      const n = pool[c] || 0;
      for (let i = 0; i < n; i++) {
        squares.push('<span class="die-sq die-' + c + '" title="' + D.DICE_TYPES[c].label + '"></span>');
      }
    });
    return squares.length
      ? '<span class="dice-row">' + squares.join('') + '</span>'
      : '<span class="hint">aucun dé</span>';
  }

  const CAT_LABEL = {
    weapon: 'Arme', ammo: 'Munition', armor: 'Armure', object: 'Objet', misc: 'Divers',
  };

  // ---- Liste d'armurerie ----
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
      list.innerHTML = '<p class="empty">Armurerie vide. Clique sur « + Ajouter » ou « Catalogue officiel ».</p>';
      return;
    }

    list.innerHTML = items.map(function (i) {
      const isWeapon = i.category === 'weapon';
      const isArmor = i.category === 'armor';
      const traits = (i.traits || []).map(function (t) {
        return '<span class="tag">' + (t === 'jetable' ? 'Jetable' : t === 'vicieuse' ? 'Vicieuse' : t) + '</span>';
      }).join('');
      return '<div class="roster-card armory-card">' +
        '<div class="roster-head">' +
          '<span class="roster-name">' + escapeHtml(i.name) + '</span>' +
          '<span class="tag type">' + (CAT_LABEL[i.category] || i.category) + '</span>' +
          (typeof i.price === 'number' && i.price ? '<span class="tag">' + i.price + ' po</span>' : '') +
          '<button class="ghost small" data-edit="' + i.id + '">Éditer</button>' +
        '</div>' +
        (isWeapon ? '<div class="armory-line">' + poolBadges(i.dice) +
          '<span class="stat-pill">' + (i.hands === 2 ? '2 mains' : '1 main') + '</span>' +
          (i.ranged ? '<span class="stat-pill">distance</span>' : '<span class="stat-pill">contact</span>') +
          traits + '</div>' : '') +
        (isArmor ? '<div class="armory-line"><span class="stat-pill">🛡 DEF <b>' + (i.def || 0) + '</b></span>' +
          '<span class="stat-pill">' + (i.slot === 'shield' ? 'Bouclier' : 'Corps') + '</span></div>' : '') +
        (i.effects ? '<div class="roster-notes">⚡ ' + escapeHtml(i.effects) + '</div>' : '') +
        (i.notes ? '<div class="roster-notes">' + escapeHtml(i.notes) + '</div>' : '') +
      '</div>';
    }).join('');

    list.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(b.getAttribute('data-edit')); });
    });
  }

  function render() { renderList(); }

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
    if (!confirm('Supprimer cette pièce ?')) return;
    Store.state.items = Store.state.items.filter(function (i) { return i.id !== id; });
    // Retire la pièce de l'équipement de tous les héros
    Store.state.heroes.forEach(function (h) {
      if (!h.equipment) return;
      h.equipment.weapons = (h.equipment.weapons || []).filter(function (w) { return w !== id; });
      if (h.equipment.armorId === id) h.equipment.armorId = null;
      if (h.equipment.shieldId === id) h.equipment.shieldId = null;
    });
    Store.save();
    closeModal();
    render();
    if (window.Combatants) Combatants.renderHeroes();
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
      alert(n ? (n + ' pièce(s) ajoutée(s) depuis le catalogue officiel.') : 'Catalogue officiel déjà présent.');
    });
    render();
  }

  global.Inventory = {
    init: init,
    render: render,
    buildDiceSteppers: buildDiceSteppers,
    poolBadges: poolBadges,
    escapeHtml: escapeHtml,
  };
})(window);
