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
  const CLASSES = ['Apothicaire', 'Artificier', 'Chasseur', 'Destructeur', 'Déviant',
    'Gardien', 'Lamevent', 'Pyromane'];
  const SKILLS = ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'];
  function emptySkills() { const o = {}; SKILLS.forEach(function (s) { o[s] = 0; }); return o; }
  function mergeSkills(src) {
    const o = emptySkills();
    if (src) SKILLS.forEach(function (s) { if (typeof src[s] === 'number') o[s] = src[s]; });
    return o;
  }
  // Retire le préfixe « Mêlée — » / « Distance — » des attaques dérivées d'armes
  function cleanAttackName(name) { return (name || '').replace(/^(Mêlée|Distance) — /, ''); }

  function newAttack() {
    return { name: 'Attaque', dice: D.emptyPool(), range: 'contact',
             targets: 'one', useOwnDamage: true, effects: Store.noStates(),
             uses: 0, freeAction: false };
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
        '</div>' +
        '<div class="atk-effects atk-usage">' +
          '<label class="checkbox inline" title="0 = illimité">Utilisations / combat <input type="number" class="atk-uses-in" min="0" style="width:60px"></label>' +
          '<label class="checkbox inline"><input type="checkbox" class="atk-free"> Ne consomme pas l\'action</label>' +
        '</div>';

      row.querySelector('.atk-range').value = atk.range;
      row.querySelector('.atk-targets').value = atk.targets;
      row.querySelector('.eff-own').checked = atk.useOwnDamage !== false;
      row.querySelector('.eff-affaibli').checked = !!atk.effects.affaibli;
      row.querySelector('.eff-ausol').checked = !!atk.effects.auSol;
      row.querySelector('.eff-feu').checked = !!atk.effects.feu;
      row.querySelector('.atk-uses-in').value = atk.uses || 0;
      row.querySelector('.atk-free').checked = !!atk.freeAction;

      Inventory.buildDiceSteppers(row.querySelector('.atk-dice'), atk.dice, onChange);

      row.querySelector('.atk-name').addEventListener('input', function (e) { atk.name = e.target.value; });
      row.querySelector('.atk-range').addEventListener('change', function (e) { atk.range = e.target.value; });
      row.querySelector('.atk-targets').addEventListener('change', function (e) { atk.targets = e.target.value; });
      row.querySelector('.eff-own').addEventListener('change', function (e) { atk.useOwnDamage = e.target.checked; });
      row.querySelector('.eff-affaibli').addEventListener('change', function (e) { atk.effects.affaibli = e.target.checked; });
      row.querySelector('.eff-ausol').addEventListener('change', function (e) { atk.effects.auSol = e.target.checked; });
      row.querySelector('.eff-feu').addEventListener('change', function (e) { atk.effects.feu = e.target.checked; });
      row.querySelector('.atk-uses-in').addEventListener('input', function (e) { atk.uses = Math.max(0, parseInt(e.target.value, 10) || 0); });
      row.querySelector('.atk-free').addEventListener('change', function (e) { atk.freeAction = e.target.checked; });
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
    if (!attacks || !attacks.length) return '<span class="hint">—</span>';
    return attacks.map(function (a) {
      const meta = [RANGE_LABEL[a.range] || a.range];
      if (a.targets === 'all') meta.push('toutes cibles');
      if (a.uses > 0) meta.push(a.uses + '×/combat');
      if (a.freeAction) meta.push('gratuite');
      return '<div class="atk-badge">' +
        '<div class="atk-badge-line">' +
          '<span class="atk-badge-name">' + esc(cleanAttackName(a.name)) + '</span>' +
          Inventory.poolBadges(a.dice) +
        '</div>' +
        '<span class="atk-badge-meta">' + meta.join(' · ') + '</span>' +
      '</div>';
    }).join('');
  }

  // ================= AVENTURIERS =================
  let heroAttacks = [];
  let heroEquipment = { weapons: [], armorId: null, shieldId: null };
  let heroSkills = emptySkills();

  // Compétences > 0 affichées sur la fiche (hors édition)
  function skillsSummary(skills) {
    if (!skills) return '';
    const badges = SKILLS.filter(function (s) { return (skills[s] || 0) > 0; })
      .map(function (s) { return '<span class="skill-badge">' + s + ' <b>+' + skills[s] + '</b></span>'; });
    if (!badges.length) return '';
    return '<div class="roster-section"><div class="roster-label">Compétences</div>' +
      '<div class="skill-badges">' + badges.join('') + '</div></div>';
  }

  // Éditeur de compétences (steppers, base 0)
  function buildSkillsEditor(container, skills) {
    container.innerHTML = SKILLS.map(function (s) {
      return '<div class="skill-edit-row">' +
        '<span class="skill-edit-name">' + s + '</span>' +
        '<div class="skill-stepper">' +
          '<button type="button" class="step-btn sk-minus" data-skill="' + s + '">−</button>' +
          '<span class="skill-val" data-skill="' + s + '">' + (skills[s] || 0) + '</span>' +
          '<button type="button" class="step-btn sk-plus" data-skill="' + s + '">+</button>' +
        '</div>' +
      '</div>';
    }).join('');
    function setVal(s) { container.querySelector('.skill-val[data-skill="' + s + '"]').textContent = skills[s] || 0; }
    container.querySelectorAll('.sk-plus').forEach(function (b) {
      b.onclick = function () { const s = b.getAttribute('data-skill'); skills[s] = (skills[s] || 0) + 1; setVal(s); };
    });
    container.querySelectorAll('.sk-minus').forEach(function (b) {
      b.onclick = function () { const s = b.getAttribute('data-skill'); skills[s] = Math.max(0, (skills[s] || 0) - 1); setVal(s); };
    });
  }

  // Bonus de PV conféré par la classe
  const CLASS_PV = {
    'Déviant': 10, 'Apothicaire': 12, 'Artificier': 14, 'Chasseur': 16,
    'Destructeur': 16, 'Gardien': 18, 'Lamevent': 14, 'Pyromane': 10,
  };
  function classPv(h) { return CLASS_PV[h.klass] || 0; }
  function heroPv(h) { return Math.max(1, (h.vie || 0) * (h.endu || 0) + (h.pvBonus || 0) + classPv(h)); }
  // PV courants persistants (null/absent = pleins)
  function heroCurPv(h) {
    const m = heroPv(h);
    return (typeof h.pv === 'number') ? Math.max(0, Math.min(m, h.pv)) : m;
  }
  // Repos court : Endu × 🟩 (somme de dés). Repos long : tout au max.
  function heroRestShort() {
    const lines = [];
    Store.state.heroes.forEach(function (h) {
      const m = heroPv(h), cur = heroCurPv(h), n = Math.max(1, h.endu || 1);
      let heal = 0; const rolls = [];
      for (let i = 0; i < n; i++) { const v = 1 + Math.floor(Math.random() * 6); rolls.push(v); heal += v; }
      h.pv = Math.min(m, cur + heal);
      lines.push(h.name + ' : +' + (h.pv - cur) + ' PV (' + rolls.join('+') + ' = ' + heal + ')');
    });
    Store.save();
    return lines;
  }
  function heroRestLong() {
    Store.state.heroes.forEach(function (h) { h.pv = heroPv(h); });
    Store.save();
  }
  function itemById(id) { return Store.state.items.find(function (i) { return i.id === id; }); }

  function heroWeapons(eq) {
    return (eq && eq.weapons || []).map(itemById).filter(function (i) { return i && i.category === 'weapon'; });
  }

  // DEF : uniquement l'armure (+ bouclier). Il n'y a pas de DEF de base.
  function heroDef(h) {
    const eq = h.equipment || {};
    const armor = eq.armorId ? itemById(eq.armorId) : null;
    const shield = eq.shieldId ? itemById(eq.shieldId) : null;
    let def = (armor && armor.category === 'armor') ? (armor.def || 0) : 0;
    if (shield && shield.category === 'armor') def += (shield.def || 0);
    return def;
  }

  // Slug CSS pour la couleur pastel de classe (retire les accents)
  function classSlug(k) {
    return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
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

  // ---- Progression du groupe (XP / niveaux) ----
  function renderProgress() {
    const root = $('#progress-root');
    if (!root) return;
    const info = Store.levelInfo(Store.state.party.xp);
    const nextTxt = info.next
      ? 'Niveau ' + info.next.lvl + ' dans <b>' + info.toNext + '</b> XP'
      : 'Niveau max atteint';
    root.innerHTML =
      '<div class="progress-card">' +
        '<div class="progress-top">' +
          '<div class="level-badge"><span class="lvl-num">' + info.level + '</span><span class="lvl-lbl">Niveau</span></div>' +
          '<div class="progress-info">' +
            '<div class="pi-line"><span>✦ <b>' + info.xp + '</b> XP partagée</span>' +
              '<span class="points-pill">' + info.points + ' pts de talent</span></div>' +
            '<div class="xp-bar"><div class="xp-fill" style="width:' + info.pct + '%"></div></div>' +
            '<div class="pi-line" style="margin-top:.4rem;color:var(--muted)"><span>' + nextTxt + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="progress-actions">' +
          '<div class="level-control">' +
            '<button class="ghost lvl-btn" data-lvl="-1">− Niveau</button>' +
            '<select id="level-select" class="level-select">' +
              [1, 2, 3, 4, 5, 6, 7].map(function (n) {
                return '<option value="' + n + '"' + (n === info.level ? ' selected' : '') + '>Niveau ' + n + '</option>';
              }).join('') +
            '</select>' +
            '<button class="ghost lvl-btn" data-lvl="1">Niveau +</button>' +
          '</div>' +
          '<span class="prog-sep"></span>' +
          '<span class="hint">XP :</span>' +
          '<button class="ghost small" data-xp="-10">−10</button>' +
          '<button class="ghost small" data-xp="-1">−1</button>' +
          '<button class="ghost small" data-xp="1">+1</button>' +
          '<button class="ghost small" data-xp="10">+10</button>' +
          '<button class="ghost small" data-xp="50">+50</button>' +
          '<button class="ghost small" id="xp-reset">Réinitialiser</button>' +
        '</div>' +
      '</div>';
    const lsel = $('#level-select');
    if (lsel) lsel.addEventListener('change', function () { setLevel(parseInt(lsel.value, 10)); });
    root.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.addEventListener('click', function () {
        setLevel(Store.levelInfo(Store.state.party.xp).level + parseInt(b.getAttribute('data-lvl'), 10));
      });
    });
    root.querySelectorAll('[data-xp]').forEach(function (b) {
      b.addEventListener('click', function () {
        Store.state.party.xp = Math.max(0, (Store.state.party.xp || 0) + parseInt(b.getAttribute('data-xp'), 10));
        Store.save(); renderProgress();
      });
    });
    const rst = $('#xp-reset');
    if (rst) rst.addEventListener('click', function () {
      if (confirm('Réinitialiser l\'XP du groupe à 0 ?')) { Store.state.party.xp = 0; Store.save(); renderProgress(); }
    });
  }

  function setLevel(lvl) {
    Store.state.party.xp = Store.xpForLevel(lvl);
    Store.save(); renderProgress();
  }

  // ---- Portée des aventuriers (Joueur = liés à l'aventure, Admin = pré-construits) ----
  function scope() {
    const mode = (global.Shell && Shell.getMode) ? Shell.getMode() : 'admin';
    const advId = (global.Shell && Shell.getAdventureId) ? Shell.getAdventureId() : null;
    return { mode: mode, advId: advId };
  }
  function adventureHeroes(advId) {
    return Store.state.heroes.filter(function (h) { return h.adventureId === advId; });
  }
  function prebuiltHeroes() {
    return Store.state.heroes.filter(function (h) { return !h.adventureId; });
  }
  function scopedHeroes() {
    const s = scope();
    return s.mode === 'player' ? adventureHeroes(s.advId) : prebuiltHeroes();
  }

  function renderHeroes() {
    renderProgress();
    const s = scope();
    const titleEl = $('#heroes-title');
    if (titleEl) titleEl.textContent = s.mode === 'player' ? 'Vos aventuriers' : 'Aventuriers pré-construits';
    const hintEl = $('#heroes-hint');
    if (hintEl) hintEl.textContent = s.mode === 'player'
      ? 'Crée autant d\'aventuriers que tu veux. Ils restent disponibles pour rejouer l\'aventure.'
      : 'Aventuriers modèles, réutilisables par les joueurs via « + Aventurier Pré-Construit ».';
    const preBtn = $('#btn-add-prebuilt');
    if (preBtn) preBtn.hidden = s.mode !== 'player';
    const list = $('#hero-list');
    const heroes = scopedHeroes();
    if (!heroes.length) {
      list.innerHTML = '<p class="empty">Aucun aventurier. Clique sur « + Nouvel Aventurier ».</p>';
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
      return '<div class="roster-card hero-card' + (h.klass ? ' klass-' + classSlug(h.klass) : '') + '">' +
        '<div class="roster-head hero-head">' +
          '<span class="roster-name">' + esc(h.name) + '</span>' +
          (h.klass ? '<span class="class-badge klass-' + classSlug(h.klass) + '">' + esc(h.klass) + '</span>' : '') +
          (h.rapide ? '<span class="tag">Rapide</span>' : '') +
          '<button class="ghost small" data-edit-hero="' + h.id + '">Éditer</button>' +
        '</div>' +
        '<div class="hero-stat-row">' +
          '<div class="hero-stat"><span class="hs-label">Points de Vie</span><span class="hs-val">' + heroCurPv(h) + ' / ' + heroPv(h) + '</span></div>' +
          '<div class="hero-stat"><span class="hs-label">Défense</span><span class="hs-val">' + heroDef(h) + '</span></div>' +
          '<div class="hero-stat"><span class="hs-label">Dégâts</span><span class="hs-val">' + h.damage + '</span></div>' +
        '</div>' +
        skillsSummary(h.skills) +
        '<div class="roster-section">' +
          '<div class="roster-label">Équipement</div>' +
          '<div class="roster-gear">' + (gear.length ? esc(gear.join(' · ')) : '<span class="hint">aucun</span>') + '</div>' +
        '</div>' +
        '<div class="roster-section">' +
          '<div class="roster-label">Attaques</div>' +
          '<div class="atk-badges">' + attacksSummary(heroCombatAttacks(h)) + '</div>' +
        '</div>' +
        (h.notes ? '<div class="roster-notes">' + esc(h.notes) + '</div>' : '') +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-edit-hero]').forEach(function (b) {
      b.addEventListener('click', function () { openHeroModal(b.getAttribute('data-edit-hero')); });
    });
  }

  function updateHeroPvPreview() {
    const cBonus = CLASS_PV[$('#h-class').value] || 0;
    $('#h-pv-preview').textContent = Math.max(1,
      (parseInt($('#h-vie').value, 10) || 0) * (parseInt($('#h-endu').value, 10) || 0) +
      (parseInt($('#h-pvbonus').value, 10) || 0) + cBonus);
  }

  function openHeroModal(id) {
    const isEdit = !!id;
    const h = isEdit ? Store.state.heroes.find(function (x) { return x.id === id; }) : null;
    $('#hero-modal-title').textContent = isEdit ? 'Éditer l\'aventurier' : 'Nouvel aventurier';
    $('#h-id').value = isEdit ? h.id : '';
    $('#h-name').value = isEdit ? h.name : '';
    $('#h-class').innerHTML = '<option value="">—</option>' +
      CLASSES.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    $('#h-class').value = isEdit ? (h.klass || '') : '';
    $('#h-vie').value = isEdit ? h.vie : 4;
    $('#h-endu').value = isEdit ? h.endu : 3;
    $('#h-pvbonus').value = isEdit ? h.pvBonus : 0;
    $('#h-damage').value = isEdit ? h.damage : 2;
    $('#h-rapide').checked = isEdit ? !!h.rapide : false;
    $('#h-notes').value = isEdit ? (h.notes || '') : '';
    heroAttacks = isEdit ? JSON.parse(JSON.stringify(h.attacks || [])) : [];
    buildAttacksEditor($('#h-attacks'), heroAttacks);
    heroSkills = isEdit ? mergeSkills(h.skills) : emptySkills();
    buildSkillsEditor($('#h-skills'), heroSkills);
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

  // Sélecteur unique (armure / bouclier) sous forme de boutons-bascule
  function renderEquipSingle(box, list, selectedId, defPrefix, noneLabel, onSel) {
    box.innerHTML = '<button type="button" class="equip-btn' + (!selectedId ? ' on' : '') + '" data-id="">' +
        noneLabel + '</button>' +
      list.map(function (a) {
        return '<button type="button" class="equip-btn' + (a.id === selectedId ? ' on' : '') + '" data-id="' + a.id + '">' +
          '<span class="equip-btn-name">' + esc(a.name) + '</span>' +
          '<span class="equip-btn-meta">' + defPrefix + ' ' + (a.def || 0) + '</span>' +
        '</button>';
      }).join('');
    box.querySelectorAll('.equip-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        box.querySelectorAll('.equip-btn').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onSel(b.getAttribute('data-id') || null);
      });
    });
  }

  // Construit les sélecteurs d'armure/bouclier (boutons) et la liste d'armes
  function buildHeroEquipmentUI() {
    const items = Store.state.items;
    const bodies = items.filter(function (i) { return i.category === 'armor' && (i.slot || 'body') === 'body'; });
    const shields = items.filter(function (i) { return i.category === 'armor' && i.slot === 'shield'; });
    const weapons = items.filter(function (i) { return i.category === 'weapon'; });

    renderEquipSingle($('#h-armor'), bodies, heroEquipment.armorId, 'DEF', 'Aucune armure',
      function (id) { heroEquipment.armorId = id; updateEquipPreview(); });
    renderEquipSingle($('#h-shield'), shields, heroEquipment.shieldId, '+', 'Aucun bouclier',
      function (id) { heroEquipment.shieldId = id; updateEquipPreview(); });

    const wbox = $('#h-weapons');
    if (!weapons.length) {
      wbox.innerHTML = '<p class="hint">Aucune arme dans l\'inventaire.</p>';
    } else {
      wbox.innerHTML = weapons.map(function (w) {
        const on = heroEquipment.weapons.indexOf(w.id) !== -1;
        return '<button type="button" class="equip-btn' + (on ? ' on' : '') + '" data-weapon="' + w.id + '">' +
          '<span class="equip-btn-name">' + esc(w.name) + '</span> ' + Inventory.poolBadges(w.dice) +
          '<span class="equip-btn-meta">' + (w.hands === 2 ? '2 mains' : '1 main') + (w.ranged ? ' · distance' : '') + '</span>' +
        '</button>';
      }).join('');
      wbox.querySelectorAll('[data-weapon]').forEach(function (b) {
        b.addEventListener('click', function () {
          const id = b.getAttribute('data-weapon');
          const i = heroEquipment.weapons.indexOf(id);
          if (i === -1) heroEquipment.weapons.push(id); else heroEquipment.weapons.splice(i, 1);
          b.classList.toggle('on');
          updateEquipPreview();
        });
      });
    }
    updateEquipPreview();
  }

  function updateEquipPreview() {
    const fake = { equipment: heroEquipment, attacks: [] };
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
    const s = scope();
    const data = {
      id: id, name: $('#h-name').value.trim() || 'Aventurier',
      klass: $('#h-class').value,
      vie: parseInt($('#h-vie').value, 10) || 1,
      endu: parseInt($('#h-endu').value, 10) || 1,
      pvBonus: parseInt($('#h-pvbonus').value, 10) || 0,
      damage: parseInt($('#h-damage').value, 10) || 0,
      rapide: $('#h-rapide').checked,
      notes: $('#h-notes').value.trim(),
      attacks: heroAttacks,
      skills: mergeSkills(heroSkills),
      equipment: {
        weapons: heroEquipment.weapons.slice(),
        armorId: heroEquipment.armorId || null,
        shieldId: heroEquipment.shieldId || null,
      },
      // Pré-construit (Admin) → adventureId null ; Joueur → lié à l'aventure courante.
      adventureId: existing ? (existing.adventureId || null) : (s.mode === 'player' ? s.advId : null),
    };
    if (existing) Object.assign(existing, data);
    else Store.state.heroes.push(data);
    Store.save();
    $('#hero-modal').hidden = true;
    renderHeroes();
    global.dispatchEvent(new CustomEvent('heroes-changed'));
  }

  // Copie un aventurier pré-construit dans le groupe d'une aventure
  function clonePrebuilt(prebuiltId, advId) {
    const src = Store.state.heroes.find(function (h) { return h.id === prebuiltId; });
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = Store.uid();
    copy.adventureId = advId;
    delete copy.pv; // PV au maximum
    Store.state.heroes.push(copy);
    Store.save();
    renderHeroes();
    global.dispatchEvent(new CustomEvent('heroes-changed'));
  }

  function openPrebuiltPicker() {
    const s = scope();
    const list = prebuiltHeroes();
    const box = $('#prebuilt-list');
    box.innerHTML = list.length
      ? list.map(function (h) {
          return '<div class="setup-row">' +
            '<span class="setup-name">' + esc(h.name) +
              (h.klass ? ' <span class="setup-class">' + esc(h.klass) + '</span>' : '') + '</span>' +
            '<span class="stat-pills compact"><span class="stat-pill">❤ ' + heroPv(h) + '</span>' +
              '<span class="stat-pill">⚔ ' + h.damage + '</span></span>' +
            '<button type="button" class="primary small pb-pick" data-id="' + h.id + '">Ajouter</button>' +
          '</div>';
        }).join('')
      : '<p class="empty">Aucun aventurier pré-construit. Le MJ peut en créer en mode Admin.</p>';
    $('#prebuilt-modal').hidden = false;
    box.querySelectorAll('.pb-pick').forEach(function (b) {
      b.addEventListener('click', function () {
        clonePrebuilt(b.getAttribute('data-id'), s.advId);
        $('#prebuilt-modal').hidden = true;
      });
    });
  }

  // ================= MONSTRES =================
  let monsterAttacks = [];
  let monsterTalents = [];

  const TYPE_RANK = { standard: 0, alpha: 1, solitaire: 2, boss: 3 };

  // Talents structurés disponibles
  const TALENT_DEFS = [
    { id: 'flee_on_big_hit',    label: 'Fuite si X+ dégâts en un coup', paramKey: 'threshold', paramLabel: 'Seuil', defaultVal: 10 },
    { id: 'ally_contact_bonus', label: '+X dégâts par allié au contact', paramKey: 'bonus',     paramLabel: 'Bonus/allié', defaultVal: 1  },
  ];

  function newTalent() {
    return { trigger: 'flee_on_big_hit', threshold: 10, bonus: 1 };
  }

  function buildTalentsEditor(container, talents) {
    container.innerHTML = '';
    if (!talents.length) {
      container.innerHTML = '<p class="hint">Aucun talent.</p>';
      return;
    }
    talents.forEach(function (t, idx) {
      if (!t.trigger) t.trigger = TALENT_DEFS[0].id;
      const row = document.createElement('div');
      row.className = 'talent-row';
      row.innerHTML =
        '<select class="tl-trigger">' +
          TALENT_DEFS.map(function (d) {
            return '<option value="' + d.id + '"' + (t.trigger === d.id ? ' selected' : '') + '>' + esc(d.label) + '</option>';
          }).join('') +
        '</select>' +
        '<span class="tl-param-label"></span>' +
        '<input type="number" class="tl-param" min="1" style="width:60px">' +
        '<button type="button" class="icon-btn tl-del" title="Supprimer">✕</button>';

      const selEl  = row.querySelector('.tl-trigger');
      const lblEl  = row.querySelector('.tl-param-label');
      const paramIn = row.querySelector('.tl-param');

      function syncParam() {
        const def = TALENT_DEFS.find(function (d) { return d.id === t.trigger; }) || TALENT_DEFS[0];
        lblEl.textContent = def.paramLabel + ' ';
        paramIn.value = (t[def.paramKey] !== undefined) ? t[def.paramKey] : def.defaultVal;
      }
      syncParam();

      selEl.addEventListener('change', function () {
        t.trigger = selEl.value;
        const def = TALENT_DEFS.find(function (d) { return d.id === t.trigger; }) || TALENT_DEFS[0];
        if (t[def.paramKey] === undefined) t[def.paramKey] = def.defaultVal;
        syncParam();
      });
      paramIn.addEventListener('input', function () {
        const def = TALENT_DEFS.find(function (d) { return d.id === t.trigger; }) || TALENT_DEFS[0];
        t[def.paramKey] = Math.max(1, parseInt(paramIn.value, 10) || 1);
      });
      row.querySelector('.tl-del').addEventListener('click', function () {
        talents.splice(idx, 1);
        buildTalentsEditor(container, talents);
      });
      container.appendChild(row);
    });
  }

  function talentsSummary(talents) {
    if (!talents || !talents.length) return '';
    return talents.map(function (t) {
      const def = TALENT_DEFS.find(function (d) { return d.id === t.trigger; });
      if (!def) return '';
      const val = (t[def.paramKey] !== undefined) ? t[def.paramKey] : def.defaultVal;
      return '<span class="talent-badge">' + esc(def.label.replace('X', val)) + '</span>';
    }).join('');
  }

  function renderMonsters() {
    const list = $('#monster-list');
    refreshFamilyControls();
    const term = ($('#monster-search').value || '').toLowerCase().trim();
    const type = $('#monster-filter-type').value;
    const family = ($('#monster-filter-family') || {}).value || '';
    const sort = ($('#monster-sort') || {}).value || 'danger';
    const monsters = Store.state.monsters.filter(function (m) {
      if (type && m.type !== type) return false;
      if (family && (m.family || '') !== family) return false;
      if (term && m.name.toLowerCase().indexOf(term) === -1) return false;
      return true;
    });
    monsters.sort(function (a, b) {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'type') return (TYPE_RANK[b.type] || 0) - (TYPE_RANK[a.type] || 0) || a.name.localeCompare(b.name);
      if (sort === 'family') return (a.family || '~').localeCompare(b.family || '~') || a.name.localeCompare(b.name);
      return (b.xp || 0) - (a.xp || 0); // danger : par XP décroissante
    });
    if (!monsters.length) {
      list.innerHTML = '<p class="empty">Aucun monstre.</p>';
      return;
    }
    list.innerHTML = monsters.map(function (m) {
      return '<div class="roster-card type-' + m.type + '">' +
        '<div class="roster-head">' +
          '<span class="roster-name">' + esc(m.name) + '</span>' +
          '<span class="tag type">' + (TYPE_LABEL[m.type] || m.type) + '</span>' +
          (m.family ? '<span class="tag">' + esc(m.family) + '</span>' : '') +
          (m.rapide ? '<span class="tag">Rapide</span>' : '') +
          (m.esquive ? '<span class="tag">Esq. 6+</span>' : '') +
          '<button class="ghost small" data-edit-monster="' + m.id + '">Éditer</button>' +
          '<button class="ghost small del-btn" data-del-monster="' + m.id + '" title="Supprimer">✕</button>' +
        '</div>' +
        '<div class="stat-pills">' +
          '<span class="stat-pill">❤ <b>' + m.pv + '</b></span>' +
          '<span class="stat-pill">🛡 <b>' + m.def + '</b></span>' +
          '<span class="stat-pill">⚔ <b>' + m.damage + '</b></span>' +
          '<span class="stat-pill">✦ <b>' + m.xp + '</b> XP</span>' +
          '<span class="stat-pill">🎯 ' + (MENACE_LABEL[m.menace] || m.menace) + '</span>' +
        '</div>' +
        '<div class="roster-section">' +
          '<div class="roster-label">Attaques</div>' +
          '<div class="atk-badges">' + attacksSummary(m.attacks) + '</div>' +
        '</div>' +
        (m.talents && m.talents.length ? '<div class="roster-section"><div class="roster-label">Talents</div><div class="talent-badges">' + talentsSummary(m.talents) + '</div></div>' : '') +
        (m.notes ? '<div class="roster-notes">' + esc(m.notes) + '</div>' : '') +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-edit-monster]').forEach(function (b) {
      b.addEventListener('click', function () { openMonsterModal(b.getAttribute('data-edit-monster')); });
    });
    list.querySelectorAll('[data-del-monster]').forEach(function (b) {
      b.addEventListener('click', function () {
        const id = b.getAttribute('data-del-monster');
        const m = Store.state.monsters.find(function (x) { return x.id === id; });
        if (m && confirm('Supprimer « ' + m.name + ' » du bestiaire ?')) {
          Store.state.monsters = Store.state.monsters.filter(function (x) { return x.id !== id; });
          Store.save(); renderMonsters();
        }
      });
    });
  }

  // Met à jour la liste des familles (filtre + datalist) selon le bestiaire
  function refreshFamilyControls() {
    const families = [];
    Store.state.monsters.forEach(function (m) {
      if (m.family && families.indexOf(m.family) === -1) families.push(m.family);
    });
    families.sort();
    const sel = $('#monster-filter-family');
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = '<option value="">Toutes familles</option>' +
        families.map(function (f) { return '<option value="' + esc(f) + '">' + esc(f) + '</option>'; }).join('');
      sel.value = cur;
    }
    const dl = $('#family-list');
    if (dl) dl.innerHTML = families.map(function (f) { return '<option value="' + esc(f) + '">'; }).join('');
  }

  function openMonsterModal(id) {
    const isEdit = !!id;
    const m = isEdit ? Store.state.monsters.find(function (x) { return x.id === id; }) : null;
    $('#monster-modal-title').textContent = isEdit ? 'Éditer le monstre' : 'Nouveau monstre';
    $('#m-id').value = isEdit ? m.id : '';
    $('#m-name').value = isEdit ? m.name : '';
    $('#m-family').value = isEdit ? (m.family || '') : '';
    refreshFamilyControls();
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
    monsterTalents = isEdit ? JSON.parse(JSON.stringify(m.talents || [])) : [];
    buildTalentsEditor($('#m-talents'), monsterTalents);
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
      family: $('#m-family').value.trim(),
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
      talents: monsterTalents,
    };
    if (existing) Object.assign(existing, data);
    else Store.state.monsters.push(data);
    Store.save();
    $('#monster-modal').hidden = true;
    renderMonsters();
  }

  function init() {
    // Aventuriers
    $('#btn-add-hero').addEventListener('click', function () { openHeroModal(null); });
    $('#btn-add-prebuilt').addEventListener('click', function () { openPrebuiltPicker(); });
    $('#prebuilt-close').addEventListener('click', function () { $('#prebuilt-modal').hidden = true; });
    $('#prebuilt-modal').addEventListener('click', function (e) { if (e.target.id === 'prebuilt-modal') $('#prebuilt-modal').hidden = true; });
    $('#hero-modal-close').addEventListener('click', function () { $('#hero-modal').hidden = true; });
    $('#hero-modal').addEventListener('click', function (e) { if (e.target.id === 'hero-modal') $('#hero-modal').hidden = true; });
    $('#hero-form').addEventListener('submit', saveHero);
    $('#h-add-attack').addEventListener('click', function () {
      heroAttacks.push(newAttack()); buildAttacksEditor($('#h-attacks'), heroAttacks);
    });
    ['h-vie', 'h-endu', 'h-pvbonus'].forEach(function (idn) {
      $('#' + idn).addEventListener('input', updateHeroPvPreview);
    });
    $('#h-class').addEventListener('change', updateHeroPvPreview);
    $('#btn-delete-hero').addEventListener('click', function () {
      const id = $('#h-id').value;
      if (id && confirm('Supprimer cet aventurier ?')) {
        Store.state.heroes = Store.state.heroes.filter(function (x) { return x.id !== id; });
        Store.save(); $('#hero-modal').hidden = true; renderHeroes();
        global.dispatchEvent(new CustomEvent('heroes-changed'));
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
    $('#m-add-talent').addEventListener('click', function () {
      monsterTalents.push(newTalent()); buildTalentsEditor($('#m-talents'), monsterTalents);
    });
    $('#monster-search').addEventListener('input', renderMonsters);
    $('#monster-filter-type').addEventListener('change', renderMonsters);
    $('#monster-filter-family').addEventListener('change', renderMonsters);
    $('#monster-sort').addEventListener('change', renderMonsters);
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
    renderProgress: renderProgress,
    openHeroModal: openHeroModal,
    openPrebuiltPicker: openPrebuiltPicker,
    adventureHeroes: adventureHeroes,
    prebuiltHeroes: prebuiltHeroes,
    heroPv: heroPv,
    heroCurPv: heroCurPv,
    heroRestShort: heroRestShort,
    heroRestLong: heroRestLong,
    heroDef: heroDef,
    heroCombatAttacks: heroCombatAttacks,
    attacksSummary: attacksSummary,
    TYPE_LABEL: TYPE_LABEL,
    MENACE_LABEL: MENACE_LABEL,
    RANGE_LABEL: RANGE_LABEL,
  };
})(window);
