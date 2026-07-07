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
        '<span class="die-sq die-' + color + '" title="' + t.label + '"></span>' +
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

  // Puissance relative d'un dé (faible → fort) pour le tri des armes
  const DIE_POWER = { bone: 1, white: 2, pink: 2, green: 3, blue: 3, yellow: 4, red: 5, black: 6 };
  function diceCount(dice) {
    dice = dice || {};
    return D.DICE_ORDER.reduce(function (n, c) { return n + (dice[c] || 0); }, 0);
  }
  function dicePower(dice) {
    dice = dice || {};
    return D.DICE_ORDER.reduce(function (s, c) { return s + (dice[c] || 0) * (DIE_POWER[c] || 2); }, 0);
  }
  // Tri des armes : nombre de dés (croissant), puis puissance des dés (faible en haut), puis alphabétique
  function sortWeapons(list) {
    return list.slice().sort(function (a, b) {
      const c = diceCount(a.dice) - diceCount(b.dice);
      if (c) return c;
      const p = dicePower(a.dice) - dicePower(b.dice);
      if (p) return p;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

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

    renderGrouped(items, true);
  }

  // ---- Inventaire d'une session de jeu : par aventurier, lecture seule ----
  const byId = function (id) { return Store.state.items.find(function (i) { return i.id === id; }); };

  // ----- Équipement (modèle mainG / mainD / armorId / objectId + drapeau 2 mains) -----
  function normEq(h) { return Combatants.normalizeEquip(h.equipment || {}); }
  function isEquipped(e, item) {
    return e.mainG === item.id || e.mainD === item.id || e.armorId === item.id || e.objectId === item.id;
  }
  // Nombre de mains occupées par un emplacement (arme 1/2 mains, ou bouclier)
  function slotHands(id) {
    const it = id ? byId(id) : null;
    if (!it) return 0;
    if (it.category === 'weapon') return Number(it.hands) === 2 ? 2 : 1;
    if (it.category === 'armor' && it.slot === 'shield') return 1;
    return 0;
  }
  // Détecte une arme à deux mains même si le drapeau twoH n'a pas été posé
  // (aventuriers pré-construits / créés via l'éditeur arrivant sans ce drapeau).
  function handsUsed(e) {
    if (e.twoH) return 2;
    const dh = slotHands(e.mainD), gh = slotHands(e.mainG);
    if (dh === 2 || gh === 2) return 2;
    return dh + gh;
  }
  function isHandItem(item) { return item.category === 'weapon' || (item.category === 'armor' && item.slot === 'shield'); }

  function equipItem(h, item) {
    const e = normEq(h);
    if (isHandItem(item)) {
      // Les armes occupent main droite puis main gauche (ou les deux si arme à 2 mains)
      if (Number(item.hands) === 2) {
        if (handsUsed(e) > 0) { alert('Les deux mains de ' + h.name + ' sont occupées.'); return false; }
        e.mainD = item.id; e.mainG = null; e.twoH = true;
      } else {
        if (handsUsed(e) >= 2) { alert('Les deux mains de ' + h.name + ' sont occupées.'); return false; }
        if (!e.mainD && !e.twoH) e.mainD = item.id;
        else if (!e.mainG) e.mainG = item.id;
        else { alert('Les deux mains de ' + h.name + ' sont occupées.'); return false; }
      }
    } else if (item.category === 'armor') {
      e.armorId = item.id;
    } else {
      e.objectId = item.id;
    }
    h.equipment = e; return true;
  }
  // Libère assez de mains pour équiper `item` en déséquipant d'autres objets tenus.
  // Priorité de retrait : Armes avant Armures (boucliers) ; parmi les armes, celle
  // la plus basse dans la liste d'inventaire (mêlée puis distance).
  function ensureHandsFree(h, item, advId) {
    const need = Number(item.hands) === 2 ? 2 : 1;
    // On libère slot par slot : main gauche d'abord (2e arme tenue), puis main droite.
    // Important : on retire UN SEUL exemplaire à la fois — deux armes identiques ne
    // doivent pas être déséquipées d'un coup (seule la 2ᵉ part).
    let guard = 0;
    while (2 - handsUsed(normEq(h)) < need && guard++ < 4) {
      const e = normEq(h);
      const slotId = e.mainG || e.mainD;
      if (!slotId) break;
      const held = byId(slotId);
      if (!held || held.id === item.id) break;
      unequipOneCopy(h, held);
    }
  }

  function unequipItem(h, item) {
    const e = normEq(h);
    if (e.mainD === item.id) { e.mainD = null; e.twoH = false; }
    if (e.mainG === item.id) e.mainG = null;
    if (e.armorId === item.id) e.armorId = null;
    if (e.objectId === item.id) e.objectId = null;
    h.equipment = e;
  }

  // Déséquipe UN SEUL exemplaire d'un objet (important pour les armes en double
  // portant le même id : décocher une copie ne doit pas retirer l'autre).
  function unequipOneCopy(h, item) {
    const e = normEq(h);
    if (isHandItem(item)) {
      // On libère d'abord la main gauche (2e exemplaire), puis la main droite.
      if (e.mainG === item.id) e.mainG = null;
      else if (e.mainD === item.id) { e.mainD = null; e.twoH = false; }
    } else if (item.category === 'armor') {
      if (e.armorId === item.id) e.armorId = null;
    } else {
      if (e.objectId === item.id) e.objectId = null;
    }
    h.equipment = e;
  }
  // Nombre d'exemplaires d'un objet actuellement équipés (slots occupés)
  function equippedCount(e, item) {
    if (isHandItem(item)) {
      return (e.mainD === item.id ? 1 : 0) + (e.mainG === item.id ? 1 : 0);
    }
    if (item.category === 'armor') return e.armorId === item.id ? 1 : 0;
    return e.objectId === item.id ? 1 : 0;
  }

  // Le module de combat est-il réellement actif ? (interdit la modification d'équipement)
  // On s'appuie sur Session pour ne bloquer QUE pendant un combat en cours — jamais
  // sur la page de disposition (avant « Lancer le combat ») ni après la victoire.
  function combatActive() {
    return !!(window.Session && Session.combatModuleActive && Session.combatModuleActive());
  }
  function snapshotEquip(h) {
    const e = normEq(h);
    return [e.mainD || '', e.mainG || '', e.armorId || '', e.objectId || '', e.twoH ? '1' : '0'].join('|');
  }
  // Vrai si la seule différence d'équipement concerne l'objet basculé (aucun autre déséquipé).
  function onlyItemChanged(before, after, itemId) {
    const b = before.split('|'), a = after.split('|');
    for (let i = 0; i < 4; i++) {
      if (b[i] === a[i]) continue;
      if (b[i] !== '' && b[i] !== itemId) return false; // un autre objet a quitté un slot
      if (a[i] !== '' && a[i] !== itemId) return false; // un autre objet a pris un slot
    }
    return true;
  }
  function updateHeroHeader(h) {
    const sep = document.querySelector('#item-list .inv-hero-sep[data-hero="' + h.id + '"] .inv-hands');
    if (sep) sep.textContent = '✋ ' + handsUsed(normEq(h)) + '/2 · 🛡 DEF ' + Combatants.heroDef(h);
  }

  function renderPlayer(advId) {
    const list = $('#item-list');
    if (!list) return;
    let heroes = (window.Combatants && Combatants.adventureHeroes) ? Combatants.adventureHeroes(advId) : [];
    // Seuls les aventuriers engagés dans la partie active s'affichent (max 4).
    const engaged = (window.Session && Session.engagedHeroIds) ? Session.engagedHeroIds() : null;
    if (engaged) heroes = heroes.filter(function (h) { return engaged.indexOf(h.id) >= 0; });
    if (!heroes.length) {
      list.innerHTML = engaged
        ? '<p class="empty">Aucun aventurier engagé dans cette partie.</p>'
        : '<p class="empty">Lance une aventure pour voir l\'inventaire de ton groupe.</p>';
      return;
    }
    const ownedOf = function (heroId) {
      return (window.Session && Session.ownedForHero) ? Session.ownedForHero(advId, heroId) : {};
    };
    const isEquip = function (i) {
      return i.category === 'weapon' || i.category === 'armor' || i.category === 'object' ||
        i.category === 'misc' || i.category === 'ammo';
    };

    // Une seule languette (une copie). `checked` est calculé PAR EXEMPLAIRE.
    // `qtyBadge` (objets cumulables) : pastille de quantité en haut à droite.
    const singleStrip = function (h, i, checked, qtyBadge) {
      return '<label class="inv-strip-row cat-' + i.category + (checked ? ' equipped' : '') + '">' +
        '<input type="checkbox" class="inv-equip-cb" data-hero="' + h.id + '" data-item="' + i.id + '"' + (checked ? ' checked' : '') + '>' +
        '<div class="inv-strip" data-info="' + i.id + '">' + itemStripHtml(i) + '</div>' +
        (qtyBadge > 1 ? '<span class="inv-qty-badge" title="' + qtyBadge + ' exemplaires">' + qtyBadge + '</span>' : '') +
        '<button type="button" class="inv-strip-del" data-hero="' + h.id + '" data-item="' + i.id + '" title="Jeter un exemplaire de cet objet">✕</button>' +
      '</label>';
    };
    // Expansion quantité : armes de contact → N languettes (max 2) ; armures et
    // armes à distance → 1 (dédup) ; OBJETS → 1 languette CUMULÉE avec pastille
    // de quantité (le stock se consomme en combat, exemplaire par exemplaire).
    const stripRows = function (h, e, owned, i) {
      const isObj = i.category === 'object' || i.category === 'misc' || i.category === 'ammo';
      if (isObj) {
        const stock = Number(owned[i.id]) || 1;
        return singleStrip(h, i, equippedCount(e, i) > 0, stock);
      }
      const single = i.category === 'armor' || (i.category === 'weapon' && i.ranged);
      let qty = single ? 1 : (Number(owned[i.id]) || 1);
      if (i.category === 'weapon' && !i.ranged) qty = Math.min(2, qty); // max 2 armes de contact identiques
      const filled = equippedCount(e, i);
      let out = '';
      for (let k = 0; k < qty; k++) out += singleStrip(h, i, k < filled, 0);
      return out;
    };
    const colContent = function (h, e, owned, items) {
      return items.length
        ? items.map(function (i) { return stripRows(h, e, owned, i); }).join('')
        : '<p class="inv-col-empty">—</p>';
    };

    // En-tête de colonnes unique (affiché une seule fois, en dehors de la boucle héros)
    const HEADER =
      '<div class="inv-cols inv-cols-header">' +
        '<div class="inv-col-hdr">Armes de Mêlée</div>' +
        '<div class="inv-col-hdr">Armes à Distance</div>' +
        '<div class="inv-col-hdr">Armures</div>' +
        '<div class="inv-col-hdr">Objets</div>' +
      '</div>';

    let html = HEADER;
    heroes.forEach(function (h) {
      const e = normEq(h);
      const hands = handsUsed(e);
      html += '<div class="inv-hero-sep" data-hero="' + h.id + '">' + escapeHtml(h.name) +
        (h.klass ? ' <span class="hint">' + escapeHtml(h.klass) + '</span>' : '') +
        ' <span class="inv-hands">✋ ' + hands + '/2 · 🛡 DEF ' + Combatants.heroDef(h) + '</span></div>';
      const owned = ownedOf(h.id);
      const mine = Store.state.items.filter(function (i) { return owned[i.id] && isEquip(i); });
      if (!mine.length) { html += '<p class="empty" style="padding:.2rem 0 .6rem">Aucun équipement personnel.</p>'; return; }
      const melee    = mine.filter(function (i) { return i.category === 'weapon' && !i.ranged; });
      const distance = mine.filter(function (i) { return i.category === 'weapon' && i.ranged; });
      const armors   = mine.filter(function (i) { return i.category === 'armor'; });
      const objects  = mine.filter(function (i) { return i.category === 'object' || i.category === 'misc' || i.category === 'ammo'; });
      html += '<div class="inv-cols">' +
        '<div class="inv-col inv-col-melee">'    + colContent(h, e, owned, melee)    + '</div>' +
        '<div class="inv-col inv-col-distance">' + colContent(h, e, owned, distance) + '</div>' +
        '<div class="inv-col inv-col-armor">'    + colContent(h, e, owned, armors)   + '</div>' +
        '<div class="inv-col inv-col-object">'   + colContent(h, e, owned, objects)  + '</div>' +
      '</div>';
    });
    // ---- Or, Trésors et Objets Rares (butin de groupe, sous l'équipement) ----
    const loot = (window.Session && Session.partyLoot) ? Session.partyLoot(advId) : null;
    if (loot) {
      const tStrip = function (t) {
        return '<div class="inv-strip-row cat-' + (t.kind === 'rare' ? 'rare' : 'treasure') + '">' +
          '<div class="inv-strip"><span class="inv-strip-name">' + (t.kind === 'rare' ? '🗝️ ' : '💎 ') + escapeHtml(t.name) + '</span>' +
            '<span class="inv-strip-val inv-strip-eff">' + (t.kind === 'rare' ? 'Objet Rare' : 'Trésor') + '</span></div>' +
          ((t.qty || 1) > 1 ? '<span class="inv-qty-badge" title="' + t.qty + ' exemplaires">' + t.qty + '</span>' : '') +
          '<button type="button" class="inv-treasure-del" data-tid="' + t.id + '" title="Jeter un exemplaire">✕</button>' +
        '</div>';
      };
      html += '<div class="inv-treasure-box">' +
        '<div class="inv-hero-sep inv-treasure-head">💰 Or, Trésors et Objets Rares' +
          '<span class="inv-gold-pill">🪙 ' + (loot.gold || 0) + ' Or</span></div>' +
        (loot.treasures.length
          ? '<div class="inv-treasure-list">' + loot.treasures.map(tStrip).join('') + '</div>'
          : '<p class="empty" style="padding:.2rem 0 .6rem">Aucun trésor pour l\'instant.</p>') +
      '</div>';
    }
    list.innerHTML = html;
    // ✕ d'un trésor : retire un exemplaire (confirmation).
    list.querySelectorAll('.inv-treasure-del').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (!confirm('Jeter un exemplaire de ce trésor ? (définitif)')) return;
        if (window.Session && Session.removeTreasure) Session.removeTreasure(advId, btn.getAttribute('data-tid'));
        renderPlayer(advId);
      });
    });

    list.querySelectorAll('.inv-equip-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        // Pas de modification d'équipement pendant un combat.
        if (combatActive()) {
          alert('Vous ne pouvez pas modifier votre équipement pendant un combat.');
          cb.checked = !cb.checked;
          return;
        }
        const h = Store.state.heroes.find(function (x) { return x.id === cb.getAttribute('data-hero'); });
        const item = byId(cb.getAttribute('data-item'));
        if (!h || !item) return;
        const before = snapshotEquip(h);
        if (cb.checked) {
          if (isHandItem(item)) ensureHandsFree(h, item, advId);
          if (!equipItem(h, item)) { cb.checked = false; return; }
        } else unequipOneCopy(h, item);
        Store.save();
        document.dispatchEvent(new CustomEvent('equipment-changed'));
        const after = snapshotEquip(h);
        // Mise à jour incrémentale (évite que la coche « saute » sur la 1ʳᵉ copie)
        // tant qu'aucun AUTRE objet n'a été déséquipé automatiquement.
        if (onlyItemChanged(before, after, item.id)) {
          const row = cb.closest('.inv-strip-row');
          if (row) row.classList.toggle('equipped', cb.checked);
          updateHeroHeader(h);
        } else {
          renderPlayer(advId);
        }
      });
    });
    // Clic sur le corps de la languette : ouvre la mini-fenêtre (sans (dé)cocher)
    list.querySelectorAll('.inv-strip').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openItemSheet(el.getAttribute('data-info'));
      });
    });
    // ✕ : jeter un exemplaire de l'objet (confirmation).
    list.querySelectorAll('.inv-strip-del').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (combatActive()) { alert('Vous ne pouvez pas modifier votre équipement pendant un combat.'); return; }
        const item = byId(btn.getAttribute('data-item'));
        if (!item) return;
        if (!confirm('Jeter « ' + item.name +' » de cet inventaire ? (définitif)')) return;
        if (window.Session && Session.discardItem) Session.discardItem(advId, btn.getAttribute('data-hero'), item.id);
        document.dispatchEvent(new CustomEvent('equipment-changed'));
        renderPlayer(advId);
      });
    });
  }

  // Moyenne d'un pool de dés (3,5 par dé)
  function avgOf(dice) {
    let s = 0;
    D.DICE_ORDER.forEach(function (c) { s += (dice[c] || 0) * 3.5; });
    return Math.round(s);
  }

  function itemCardHtml(i, canEdit) {
    const isWeapon = i.category === 'weapon';
    const isArmor = i.category === 'armor';
    const isOfficialNote = (i.notes || '').indexOf('Officiel') === 0;
    const traits = (i.traits || []).map(function (t) {
      return '<span class="tag">' + (t === 'jetable' ? 'Jetable' : t === 'vicieuse' ? 'Vicieuse' : t) + '</span>';
    }).join('');
    // Caractéristiques sous les dés (remplace l'ancienne note « Officiel »)
    const subMeta = [];
    if (isWeapon) {
      subMeta.push(Number(i.hands) === 2 ? '2 mains' : '1 main');
      subMeta.push(i.ranged ? 'distance' : 'contact');
      if (i.usesAmmo) subMeta.push('munitions');
      if (i.effects) subMeta.push('⚡ ' + escapeHtml(i.effects));
    }
    return '<div class="roster-card armory-card cat-' + i.category + '">' +
      '<div class="roster-head">' +
        '<span class="roster-name">' + escapeHtml(i.name) + '</span>' +
      '</div>' +
      (isWeapon ? '<div class="armory-line">' + poolBadges(i.dice) + traits + '</div>' +
        (subMeta.length ? '<div class="armory-submeta">' + subMeta.join(' · ') + '</div>' : '') : '') +
      (isArmor ? '<div class="armory-line"><span class="stat-pill">DEF <b>' + (i.def || 0) + '</b></span>' +
        '<span class="stat-pill">' + (i.slot === 'shield' ? 'Bouclier' : 'Corps') + '</span></div>' : '') +
      (i.effects && !isWeapon ? '<div class="roster-notes">⚡ ' + escapeHtml(i.effects) + '</div>' : '') +
      (i.notes && !isOfficialNote ? '<div class="roster-notes">' + escapeHtml(i.notes) + '</div>' : '') +
      (canEdit ? '<button class="card-edit-btn" data-edit="' + i.id + '" title="Éditer">✎</button>' : '') +
    '</div>';
  }

  // Image bouclier DEF (assets/DEF N.png pour N 0-6)
  function defShieldImg(val) {
    val = Number(val) || 0;
    if (val >= 0 && val <= 6) {
      return '<img class="def-img inv-def-img" src="assets/DEF ' + val + '.png" alt="DEF ' + val + '">';
    }
    return '<span class="def-shield">' + val + '</span>';
  }

  // ----- Languette d'inventaire : nom à gauche, valeur à droite -----
  function itemStripHtml(i) {
    let right;
    if (i.category === 'weapon') {
      right = '<span class="inv-strip-val inv-strip-dice">' + poolBadges(i.dice) + '</span>';
    } else if (i.category === 'armor') {
      right = '<span class="inv-strip-val inv-strip-def">' + defShieldImg(i.def || 0) + '</span>';
    } else {
      right = '<span class="inv-strip-val inv-strip-eff">' + (i.effects ? escapeHtml(i.effects) : '—') + '</span>';
    }
    return '<span class="inv-strip-name">' + escapeHtml(i.name) + '</span>' + right;
  }

  // ----- Mini-fenêtre d'objet (lecture seule, design des feuilles de perso) -----
  function itemSheetHtml(i) {
    const isWeapon = i.category === 'weapon';
    const isArmor = i.category === 'armor';
    const isOfficialNote = (i.notes || '').indexOf('Officiel') === 0;
    const traits = (i.traits || []).map(function (t) {
      return '<span class="tag">' + (t === 'jetable' ? 'Jetable' : t === 'vicieuse' ? 'Vicieuse' : t) + '</span>';
    }).join('');
    let html = '<div class="isheet-cat cat-' + i.category + '">' + escapeHtml(CAT_LABEL[i.category] || i.category) + '</div>';
    if (isWeapon) {
      html += '<div class="isheet-line">' + poolBadges(i.dice) +
        ' <span class="isheet-avg">moy. ' + avgOf(i.dice) + '</span></div>';
      const meta = [Number(i.hands) === 2 ? '2 mains' : '1 main', i.ranged ? 'distance' : 'contact'];
      if (i.usesAmmo) meta.push('munitions');
      html += '<div class="isheet-meta">' + meta.join(' · ') + '</div>';
      if (traits) html += '<div class="isheet-line">' + traits + '</div>';
    } else if (isArmor) {
      html += '<div class="isheet-line"><span class="stat-pill">DEF <b>' + (i.def || 0) + '</b></span>' +
        '<span class="stat-pill">' + (i.slot === 'shield' ? 'Bouclier' : 'Corps') + '</span></div>';
    }
    if (i.effects) html += '<div class="isheet-eff">⚡ ' + escapeHtml(i.effects) + '</div>';
    if (i.notes && !isOfficialNote) html += '<div class="roster-notes">' + escapeHtml(i.notes) + '</div>';
    return html;
  }

  function openItemSheet(id) {
    const i = byId(id);
    if (!i) return;
    const modalEl = $('#item-sheet-modal');
    if (!modalEl) return;
    $('#item-sheet-title').textContent = i.name;
    $('#item-sheet-body').innerHTML =
      '<div class="roster-card armory-card cat-' + i.category + ' item-sheet-card">' +
        itemSheetHtml(i) +
      '</div>';
    modalEl.hidden = false;
  }

  function renderGrouped(items, canEdit) {
    const list = $('#item-list');
    list.classList.add('inv-strip-layout');

    // Languette admin : pas de case à cocher, bouton édition à droite
    function adminStrip(i) {
      return '<div class="inv-strip-row cat-' + i.category + '">' +
        '<div class="inv-strip" data-info="' + i.id + '">' + itemStripHtml(i) + '</div>' +
        (canEdit ? '<button class="inv-strip-edit" data-edit="' + i.id + '" title="Éditer">✎</button>' : '') +
      '</div>';
    }
    function colItems(items2) {
      return items2.length ? items2.map(adminStrip).join('') : '<p class="inv-col-empty">—</p>';
    }

    const melee    = sortWeapons(items.filter(function (i) { return i.category === 'weapon' && !i.ranged; }));
    const distance = sortWeapons(items.filter(function (i) { return i.category === 'weapon' && i.ranged; }));
    const armors   = items.filter(function (i) { return i.category === 'armor'; });
    const objects  = items.filter(function (i) {
      return i.category === 'object' || i.category === 'misc' || i.category === 'ammo';
    });

    list.innerHTML =
      '<div class="inv-cols inv-cols-header">' +
        '<div class="inv-col-hdr">Armes de Mêlée</div>' +
        '<div class="inv-col-hdr">Armes à Distance</div>' +
        '<div class="inv-col-hdr">Armures</div>' +
        '<div class="inv-col-hdr">Objets</div>' +
      '</div>' +
      '<div class="inv-cols">' +
        '<div class="inv-col inv-col-melee">'    + colItems(melee)    + '</div>' +
        '<div class="inv-col inv-col-distance">' + colItems(distance) + '</div>' +
        '<div class="inv-col inv-col-armor">'    + colItems(armors)   + '</div>' +
        '<div class="inv-col inv-col-object">'   + colItems(objects)  + '</div>' +
      '</div>';

    list.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { openModal(b.getAttribute('data-edit')); });
    });
    list.querySelectorAll('.inv-strip[data-info]').forEach(function (el) {
      el.addEventListener('click', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        openItemSheet(el.getAttribute('data-info'));
      });
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
    $('#f-obj-effect').value = isEdit ? (item.objEffect || 'none') : 'none';
    $('#f-obj-benefic').value = isEdit ? (item.objBenefic === false ? '0' : '1') : '1';
    $('#f-obj-dice').value = isEdit && typeof item.objDice === 'number' ? item.objDice : 2;
    $('#f-obj-price').value = isEdit ? (item.price || 0) : 0;
    $('#f-obj-summary').value = isEdit ? (item.effects || '') : '';
    // Munition : couleur du dé bonus · Parchemin : effet de talent embarqué.
    $('#f-obj-ammo-color').value = isEdit ? (item.ammoColor || 'white') : 'white';
    fillTalentEffectSelect();
    $('#f-obj-talent').value = isEdit ? (item.parchEffect || '') : '';
    $('#f-obj-talent-val').value = isEdit && typeof item.parchVal === 'number' ? item.parchVal : 0;
    toggleObjEffectFields();
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
    const objFields = $('#object-fields');
    if (objFields) objFields.style.display = (cat === 'object' || cat === 'misc' || cat === 'ammo') ? '' : 'none';
  }

  // Champs conditionnels de l'effet d'objet : « Cible » et « Nombre de dés » ne
  // concernent que le SOIN ; munitions et parchemins ont leurs propres champs.
  function toggleObjEffectFields() {
    const eff = $('#f-obj-effect').value;
    const ammoRow = $('#f-obj-ammo-row');
    const talRow = $('#f-obj-talent-row');
    if (ammoRow) ammoRow.style.display = eff === 'ammo' ? '' : 'none';
    if (talRow) talRow.style.display = eff === 'talent' ? '' : 'none';
    const beneficLbl = $('#f-obj-benefic') && $('#f-obj-benefic').closest('label');
    const diceLbl = $('#f-obj-dice') && $('#f-obj-dice').closest('label');
    if (beneficLbl) beneficLbl.style.display = eff === 'heal' ? '' : 'none';
    if (diceLbl) diceLbl.style.display = eff === 'heal' ? '' : 'none';
  }
  // Suggestion de résumé selon l'effet choisi — proposée UNIQUEMENT si le champ
  // est vide (un résumé effacé par le MJ reste vide, il n'est jamais réimposé).
  function suggestObjSummary() {
    const sum = $('#f-obj-summary');
    if (!sum || sum.value.trim()) return;
    const eff = $('#f-obj-effect').value;
    const AMMO_LABEL = { white: 'blanc', bone: 'os', red: 'rouge', blue: 'bleu', black: 'noir' };
    if (eff === 'heal') {
      const n = Math.max(0, parseInt($('#f-obj-dice').value, 10) || 0);
      if (n > 0) sum.value = 'Soigne ' + ($('#f-obj-benefic').value === '1' ? 'un aventurier' : 'une cible') + ' de ' + n + 'd6 PV.';
    } else if (eff === 'ammo') {
      const c = $('#f-obj-ammo-color').value || 'white';
      sum.value = '+1 dé ' + (AMMO_LABEL[c] || c) + ' à la prochaine attaque avec une Arme à Distance.';
    } else if (eff === 'talent') {
      const key = $('#f-obj-talent').value;
      if (key) {
        const e = (window.Store && Store.talentEffectMap) ? Store.talentEffectMap()[key] : null;
        sum.value = 'Parchemin : ' + (e ? e.name : key) + ' (1 usage).';
      }
    }
  }
  // Options du sélecteur d'effet de talent des parchemins (pool complet).
  function fillTalentEffectSelect() {
    const sel = $('#f-obj-talent');
    if (!sel || sel.options.length > 1) return; // déjà rempli
    const effects = (window.Store && Store.talentEffects) ? Store.talentEffects() : [];
    sel.innerHTML = '<option value="">— Choisir un effet —</option>' + effects.map(function (e) {
      return '<option value="' + e.effect + '">' + escapeHtml(e.name) + '</option>';
    }).join('');
  }

  function saveFromForm(e) {
    e.preventDefault();
    const id = $('#f-id').value || Store.uid();
    const existing = Store.state.items.find(function (i) { return i.id === id; });
    const cat = $('#f-category').value;
    const isArmor = cat === 'armor';
    const isObject = cat === 'object' || cat === 'misc';
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
      price: parseInt(isArmor ? $('#f-armor-price').value : (isObject ? $('#f-obj-price').value : $('#f-price').value), 10) || 0,
      effects: $('#f-effects').value.trim(),
      notes: $('#f-notes').value.trim(),
    };
    if (isArmor) {
      data.def = parseInt($('#f-armor-def').value, 10) || 0;
      data.slot = $('#f-armor-slot').value;
    }
    if (isObject) {
      data.objEffect = $('#f-obj-effect').value;
      data.objBenefic = $('#f-obj-benefic').value === '1';
      data.objDice = Math.max(0, parseInt($('#f-obj-dice').value, 10) || 0);
      data.ammoColor = $('#f-obj-ammo-color').value || 'white';
      data.parchEffect = $('#f-obj-talent').value || '';
      data.parchVal = Math.max(0, parseInt($('#f-obj-talent-val').value, 10) || 0);
      data.consumable = true; // munitions, parchemins et consommables se consomment à l'usage
      // Résumé d'effet : la valeur du champ fait foi, TELLE QUELLE (même vide).
      // La suggestion automatique n'est proposée que dans le formulaire, jamais
      // réimposée à l'enregistrement (un résumé effacé reste effacé).
      data.effects = ($('#f-obj-summary').value || '').trim();
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
    const objEffSel = $('#f-obj-effect');
    if (objEffSel) objEffSel.addEventListener('change', function () { toggleObjEffectFields(); suggestObjSummary(); });
    ['#f-obj-ammo-color', '#f-obj-talent', '#f-obj-dice', '#f-obj-benefic'].forEach(function (sel) {
      const el = $(sel);
      if (el) el.addEventListener('change', suggestObjSummary);
    });
    $('#search').addEventListener('input', renderList);
    $('#filter-cat').addEventListener('change', renderList);
    $('#btn-load-official').addEventListener('click', function () {
      const n = Store.loadOfficial();
      render();
      alert(n ? (n + ' pièce(s) ajoutée(s) depuis le catalogue officiel.') : 'Catalogue officiel déjà présent.');
    });
    // Mini-fenêtre d'objet (lecture seule, mode Joueur)
    const sheet = $('#item-sheet-modal');
    if (sheet) {
      const closeSheet = function () { sheet.hidden = true; };
      const closeBtn = $('#item-sheet-close');
      if (closeBtn) closeBtn.addEventListener('click', closeSheet);
      sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
    }
    render();
  }

  global.Inventory = {
    init: init,
    render: render,
    renderPlayer: renderPlayer,
    openItemSheet: openItemSheet,
    buildDiceSteppers: buildDiceSteppers,
    poolBadges: poolBadges,
    itemStripHtml: itemStripHtml,
    escapeHtml: escapeHtml,
  };
})(window);
