/*
 * Lecteur de sessions Amertume.
 * Gère l'état d'une partie en cours d'une aventure (scène active, PV héros, XP, choix pris).
 */
(function (global) {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const esc = function (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  let sessions = [];
  let activeSession = null;      // session en cours de lecture
  let scopeAdventureId = null;   // aventure courante en mode Joueur (limite l'affichage)
  let forceSetup = false;        // force l'écran de création/sélection du groupe
  let setupSel = {};             // sélection transitoire d'aventuriers { heroId: true }

  function slug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  const KIND_LABELS = { action: 'ACT', reaction: 'REAC', passive: 'PASS', critique: 'CRIT', garde: 'GARD', upgrade: 'AME', mastery: 'MAIT' };
  function KIND_SHORT(k) { return KIND_LABELS[k] || 'TAL'; }

  // Conseil de difficulté selon le nombre d'aventuriers engagés
  function difficultyAdvice(n) {
    if (n <= 0) return '';
    if (n === 1) return '1 aventurier — Très difficile';
    if (n === 2) return '2 aventuriers — Difficile';
    if (n === 3) return '3 aventuriers — Équilibré';
    return '4 aventuriers — Facile';
  }

  // ---------- Persistance ----------
  function load() { sessions = Store.loadSessions(); }
  function save() { Store.saveSessions(sessions); }

  // ---------- Montées de niveau (par session, décorrélées de l'Admin) ----------
  // Garantit la présence des champs de progression sur une session (anciennes
  // sauvegardes incluses).
  function ensureLevelData(ses) {
    if (!ses) return;
    if (typeof ses.levelDone !== 'number') {
      // Une ancienne session : on considère les niveaux déjà atteints comme acquis
      ses.levelDone = Store.levelInfo(ses.party ? ses.party.xp : 0).level;
    }
    if (!ses.levelGains || typeof ses.levelGains !== 'object') ses.levelGains = {};
  }
  function heroGains(ses, hid) {
    if (!ses.levelGains[hid]) {
      // Talents de niveau 1 choisis à la création de l'aventurier
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      const start = (h && Array.isArray(h.startTalents)) ? h.startTalents.slice() : [];
      ses.levelGains[hid] = { endu: 0, damage: 0, talents: start, equipped: start.slice(0, 6) };
    }
    const g = ses.levelGains[hid];
    if (typeof g.endu !== 'number') g.endu = 0;
    if (typeof g.vie !== 'number') g.vie = 0;
    if (typeof g.damage !== 'number') g.damage = 0;
    if (!Array.isArray(g.talents)) g.talents = [];
    // Talents équipés (≤ 6) : par défaut, les 6 premiers débloqués
    if (!Array.isArray(g.equipped)) g.equipped = g.talents.slice(0, 6);
    else g.equipped = g.equipped.filter(function (id) { return g.talents.indexOf(id) >= 0; });
    return g;
  }
  // Liste des talents équipés effectifs d'un aventurier (≤ 6)
  function equippedTalents(g) {
    if (!g) return [];
    const unlocked = Array.isArray(g.talents) ? g.talents : [];
    if (Array.isArray(g.equipped)) return g.equipped.filter(function (id) { return unlocked.indexOf(id) >= 0; }).slice(0, 6);
    return unlocked.slice(0, 6);
  }
  // Niveau courant de la session d'après son XP
  function sessionLevel(ses) { return Store.levelInfo(ses.party ? ses.party.xp : 0).level; }

  // ---------- Recherche ----------
  function findAdventure(id) {
    return Store.loadAdventures().find(function (a) { return a.id === id; }) || null;
  }
  function findScene(adv, sceneId) {
    for (var ci = 0; ci < adv.chapters.length; ci++) {
      var ch = adv.chapters[ci];
      for (var si = 0; si < ch.scenes.length; si++) {
        if (ch.scenes[si].id === sceneId) return { chapter: ch, scene: ch.scenes[si] };
      }
    }
    return null;
  }
  function firstScene(adv) {
    for (var ci = 0; ci < adv.chapters.length; ci++) {
      if (adv.chapters[ci].scenes.length) {
        return { chapter: adv.chapters[ci], scene: adv.chapters[ci].scenes[0] };
      }
    }
    return null;
  }

  // ---------- Démarrer / reprendre ----------
  function startFromAdventure(advId) {
    const adv = findAdventure(advId);
    if (!adv) { alert('Aventure introuvable.'); return; }
    if (!adv.chapters.length || !adv.chapters[0].scenes.length) {
      alert('Cette aventure n\'a pas encore de scène. Ajoutez-en une dans l\'éditeur.'); return;
    }
    // Cherche session ouverte pour cette aventure
    load();
    const existing = sessions.filter(function (s) { return s.adventureId === advId && s.status === 'active'; });
    if (existing.length) {
      if (confirm('Une session est déjà en cours pour cette aventure. Reprendre ?')) {
        activeSession = existing[0];
        switchToSession();
        return;
      }
    }
    // Nouvelle session
    const firstSc = firstScene(adv);
    const heroStates = {};
    Store.state.heroes.forEach(function (h) {
      heroStates[h.id] = { pv: Combatants.heroCurPv(h) };
    });
    const ses = {
      id: Store.uid(),
      adventureId: advId,
      startedAt: Date.now(),
      status: 'active',
      heroIds: [],
      heroStates: heroStates,
      currentChapterId: firstSc.chapter.id,
      currentSceneId: firstSc.scene.id,
      visitedSceneIds: [firstSc.scene.id],
      choicesTaken: [],
      party: { xp: 0 },          // XP de la session, décorrélée de l'XP du mode Admin
      acquiredItems: {},
      levelDone: 1,              // dernier niveau pour lequel les choix ont été faits
      levelGains: {},            // { heroId: { endu, damage, talents:[] } }
    };
    sessions.push(ses);
    save();
    activeSession = ses;
    // Demander quels héros engager
    openHeroPicker(adv);
  }

  function openHeroPicker(adv) {
    // En MJ/Admin, on engage des aventuriers pré-construits.
    const heroes = (global.Combatants && Combatants.prebuiltHeroes) ? Combatants.prebuiltHeroes() : Store.state.heroes;
    const modal = $('#hero-picker-modal');
    const list = $('#hero-picker-list');
    const advice = document.getElementById('hero-picker-advice');
    list.innerHTML = heroes.length
      ? heroes.map(function (h) {
          const pv = Combatants.heroCurPv(h), maxPv = Combatants.heroPv(h);
          const def = Combatants.heroDef(h);
          const dmg = h.damage || 0;
          const skills = h.skills ? Object.keys(h.skills).filter(function (s) { return (h.skills[s] || 0) > 0; })
            .map(function (s) { return s + ' +' + h.skills[s]; }).join(', ') : '';
          return '<label class="setup-row"><input type="checkbox" data-hero="' + h.id + '">' +
            '<span class="setup-name">' + esc(h.name) + (h.klass ? ' <span class="setup-class">' + esc(h.klass) + '</span>' : '') + '</span>' +
            '<span class="stat-pills compact">' +
              '<span class="stat-pill">❤ ' + pv + '/' + maxPv + '</span>' +
              '<span class="stat-pill">🛡 ' + def + '</span>' +
              '<span class="stat-pill">⚔ +' + dmg + '</span>' +
              (skills ? '<span class="stat-pill setup-skills">' + esc(skills) + '</span>' : '') +
            '</span>' +
          '</label>';
        }).join('')
      : '<p class="empty">Aucun aventurier pré-construit. Crée-en dans l\'onglet Aventuriers.</p>';
    function refreshAdvice() {
      const n = list.querySelectorAll('[data-hero]:checked').length;
      if (advice) {
        advice.textContent = difficultyAdvice(n) || 'Sélectionne au moins un aventurier.';
        advice.className = 'diff-advice' + (n >= 1 && n <= 4 ? ' diff-' + n : '');
      }
    }
    list.querySelectorAll('[data-hero]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked && list.querySelectorAll('[data-hero]:checked').length > 4) {
          cb.checked = false; alert('Maximum 4 aventuriers par aventure.');
        }
        refreshAdvice();
      });
    });
    refreshAdvice();
    modal.removeAttribute('hidden');
    document.getElementById('hero-picker-start').onclick = function () {
      const checked = list.querySelectorAll('[data-hero]:checked');
      if (!checked.length) { alert('Sélectionne au moins un aventurier.'); return; }
      activeSession.heroIds = Array.from(checked).map(function (cb) { return cb.getAttribute('data-hero'); });
      activeSession.heroIds.forEach(function (hid) { heroGains(activeSession, hid); });
      modal.setAttribute('hidden', '');
      save();
      switchToSession();
    };
    document.getElementById('hero-picker-cancel').onclick = function () {
      sessions = sessions.filter(function (s) { return s.id !== activeSession.id; });
      save(); activeSession = null; modal.setAttribute('hidden', '');
    };
  }

  function switchToSession() {
    // Basculer sur l'onglet de lecture de scènes (Session en MJ, Aventure en Joueur)
    if (global.App && App.selectTab) { App.selectTab('session'); return; }
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === 'session');
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-session');
    });
    render();
  }

  // ---------- Rendu principal ----------
  function render() {
    load();
    // Réaligne activeSession sur l'instance fraîchement chargée : save() persiste
    // le tableau `sessions`, donc activeSession doit y appartenir pour ne rien perdre.
    if (activeSession) {
      const match = sessions.find(function (s) { return s.id === activeSession.id; });
      if (match) activeSession = match;
    }
    const root = $('#session-root');
    if (!root) return;

    if (activeSession) {
      renderScene(root);
    } else {
      renderSessionList(root);
    }
  }

  function renderSessionList(root) {
    const adventures = Store.loadAdventures();
    const activeSessions = sessions.filter(function (s) { return s.status === 'active'; });
    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Sessions en cours</h2></div>' +
        (activeSessions.length
          ? activeSessions.map(function (s) {
              const adv = adventures.find(function (a) { return a.id === s.adventureId; });
              const advTitle = adv ? adv.title : '(aventure supprimée)';
              const date = new Date(s.startedAt).toLocaleDateString('fr-FR');
              return '<div class="adv-session-row">' +
                '<div><strong>' + esc(advTitle) + '</strong> <span class="tag">' + date + '</span></div>' +
                '<div style="display:flex;gap:.4rem;margin-top:.35rem">' +
                  '<button class="primary ses-resume" data-id="' + s.id + '">Reprendre</button>' +
                  '<button class="danger ses-end" data-id="' + s.id + '">Supprimer</button>' +
                '</div>' +
              '</div>';
            }).join('')
          : '<p class="empty">Aucune session active. Lance une aventure depuis l\'onglet Aventures.</p>') +
      '</div>';

    root.querySelectorAll('.ses-resume').forEach(function (b) {
      b.addEventListener('click', function () {
        activeSession = sessions.find(function (s) { return s.id === b.getAttribute('data-id'); });
        if (activeSession) render();
      });
    });
    root.querySelectorAll('.ses-end').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Supprimer cette session ?')) return;
        sessions.forEach(function (s) { if (s.id === b.getAttribute('data-id')) s.status = 'ended'; });
        save(); render();
      });
    });
  }

  function renderScene(root) {
    const ses = activeSession;
    const adv = findAdventure(ses.adventureId);
    if (!adv) { root.innerHTML = '<p class="empty">Aventure introuvable.</p>'; return; }

    // Montée de niveau en attente : on la déclenche dès que le niveau de la session
    // dépasse le dernier niveau résolu — sans dépendre de pendingNav (qui n'est posé
    // que lors d'une navigation). On reste sur la scène courante après les choix.
    ensureLevelData(ses);
    if ((ses.levelDone || 1) < sessionLevel(ses)) {
      if (!ses.pendingNav) { ses.pendingNav = ses.currentSceneId; save(); }
      renderLevelUp(root, ses, adv, (ses.levelDone || 1) + 1);
      return;
    }

    const found = findScene(adv, ses.currentSceneId);
    if (!found) { root.innerHTML = '<p class="empty">Scène introuvable.</p>'; return; }
    const { chapter, scene } = found;

    // Journal des faits : enregistre le fait de la scène atteinte (une seule fois)
    if (scene.fait && scene.fait.trim()) {
      if (!Array.isArray(ses.deeds)) ses.deeds = [];
      if (!ses.deeds.some(function (d) { return d.sceneId === scene.id; })) {
        ses.deeds.push({ sceneId: scene.id, text: scene.fait.trim() });
        save();
      }
    }

    const heroes = Store.state.heroes.filter(function (h) {
      return !ses.heroIds.length || ses.heroIds.indexOf(h.id) !== -1;
    });

    root.innerHTML =
      '<div class="ses-bar">' +
        '<div class="ses-bar-left">' +
          '<span class="ses-adv-title">' + esc(adv.title) + '</span>' +
          (chapter.title ? ' <span class="ses-ch-title">— ' + esc(chapter.title) + '</span>' : '') +
        '</div>' +
        '<div class="ses-bar-right">' +
          '<span class="tag">XP : ' + ses.party.xp + '</span>' +
          '<button id="ses-quit" class="ghost small">✕ Quitter</button>' +
        '</div>' +
      '</div>' +
      '<div class="ses-content">' +
        '<div class="ses-scene-card">' +
          (scene.title ? '<h2 class="ses-scene-title">' + esc(scene.title) + '</h2>' : '') +
          sceneContentHtml(scene) +
          '<div id="ses-actions" class="ses-actions"></div>' +
        '</div>' +
        '<div class="ses-side">' +
          '<div class="ses-heroes">' +
            '<h3>Aventuriers</h3>' +
            renderHeroesState(heroes, ses) +
            xpProgressHtml(ses) +
          '</div>' +
          '<div class="ses-deeds">' +
            '<h3>Faits accomplis</h3>' +
            deedsHtml(ses) +
          '</div>' +
        '</div>' +
      '</div>';

    $('#ses-quit').addEventListener('click', function () {
      activeSession = null;
      if (global.Shell && Shell.getMode && Shell.getMode() === 'player' && global.App) {
        App.selectTab('saves'); // vue des parties sauvegardées
      } else { render(); }
    });

    // Cliquer le nom d'un aventurier ouvre sa fiche
    root.querySelectorAll('.ses-hero-name[data-hero]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (global.Combatants && Combatants.openHeroSheet) Combatants.openHeroSheet(el.getAttribute('data-hero'));
      });
    });

    renderSceneActions(scene, adv, ses);
  }

  function xpProgressHtml(ses) {
    const info = Store.levelInfo(ses.party ? ses.party.xp : 0);
    const nextTxt = info.next ? ('Niveau ' + info.next.lvl + ' dans ' + info.toNext + ' XP') : 'Niveau max atteint';
    return '<div class="ses-xp">' +
      '<div class="ses-xp-line"><span>Niveau <b>' + info.level + '</b></span><span><b>' + info.xp + '</b> XP</span></div>' +
      '<div class="xp-bar"><div class="xp-fill" style="width:' + info.pct + '%"></div></div>' +
      '<div class="ses-xp-next">' + nextTxt + '</div>' +
    '</div>';
  }

  function deedsHtml(ses) {
    const deeds = ses.deeds || [];
    if (!deeds.length) return '<p class="empty">Aucun fait pour l\'instant.</p>';
    return '<ul class="deeds-list">' +
      deeds.map(function (d) { return '<li>' + esc(d.text) + '</li>'; }).join('') +
    '</ul>';
  }

  // Construit le HTML du contenu textuel d'une scène.
  // 1) Si un ancien champ `text` existe, il est affiché en style narratif.
  // 2) Les blocs typés sont rendus ensuite dans leur propre style.
  // Met en forme un texte de scène : échappe le HTML puis convertit la syntaxe
  // **gras** → <strong> et *italique* → <em>, et les retours à la ligne en <br>.
  function fmtSceneText(raw) {
    var html = esc(raw || '');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return html.replace(/\n/g, '<br>');
  }
  function sceneContentHtml(scene) {
    var parts = [];
    // Champ hérité : affiché comme narratif si non vide
    if (scene.text && scene.text.trim()) {
      parts.push('<div class="scene-block scene-block-narrative">' +
        fmtSceneText(scene.text) + '</div>');
    }
    // Blocs typés
    var blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    blocks.forEach(function (blk) {
      var cls = 'scene-block scene-block-' + (blk.type || 'narrative');
      var content = fmtSceneText(blk.content || '');
      parts.push('<div class="' + cls + '">' + content + '</div>');
    });
    return parts.length
      ? '<div class="ses-scene-blocks">' + parts.join('') + '</div>'
      : '';
  }

  function typeLabel(t) {
    const map = { description: 'Description', exploration: 'Exploration', interaction: 'Interaction', combat: 'Combat', reward: 'Récompense', fin: 'Fin' };
    return map[t] || t;
  }

  // Aventurier « effectif » incluant les gains de montée de niveau de la session
  // (ENDU / Dégâts) et la liste des talents choisis (toujours définie en session,
  // vide si aucun, pour masquer les talents non débloqués).
  function effectiveHero(ses, h) {
    if (!ses) return h;
    const g = ses.levelGains ? ses.levelGains[h.id] : null;
    const state = ses.heroStates ? (ses.heroStates[h.id] || {}) : {};
    const maxVie = (h.vie || 0) + (g ? g.vie || 0 : 0);
    // Compétences = base + points gagnés aux niveaux impairs (g.skills).
    const skills = Object.assign({}, h.skills);
    if (g && g.skills) Object.keys(g.skills).forEach(function (s) { skills[s] = (skills[s] || 0) + (g.skills[s] || 0); });
    return Object.assign({}, h, {
      // VIE courante = VIE max (base + gains) + pénalité de coma (négative)
      vie: Math.max(0, maxVie + (state.viePenalty || 0)),
      // VIE maximale jamais atteinte (sans la pénalité de coma)
      maxVie: maxVie,
      endu: (h.endu || 0) + (g ? g.endu || 0 : 0),
      damage: (h.damage || 0) + (g ? g.damage || 0 : 0),
      skills: skills,
      // chosenTalents = talents ÉQUIPÉS (ce qui est actif en combat / sur la fiche)
      chosenTalents: equippedTalents(g),
    });
  }

  function renderHeroesState(heroes, ses) {
    if (!heroes.length) return '<p class="empty">Aucun héros.</p>';
    return '<div class="ses-hero-list">' + heroes.map(function (h) {
      const eh = effectiveHero(ses, h);
      const state = ses.heroStates[h.id] || {};
      const curPv = typeof state.pv === 'number' ? state.pv : Combatants.heroCurPv(eh);
      const maxPv = Combatants.heroPv(eh);
      const pct = Math.round((curPv / maxPv) * 100);
      return '<div class="ses-hero-row">' +
        '<span class="ses-hero-name' + (h.klass ? ' klass-' + slug(h.klass) : '') + '" data-hero="' + h.id + '" title="Voir la fiche">' + esc(h.name) + '</span>' +
        '<div class="pv-bar" style="flex:1;min-width:80px"><div class="pv-fill" style="width:' + pct + '%"></div>' +
          '<span class="pv-text">' + curPv + '/' + maxPv + '</span></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // Une scène déclenche un combat si l'une de ses zones contient au moins un monstre
  function sceneHasCombat(scene) {
    return sceneZones(scene).some(function (z) {
      return (z.monsterRefs || []).some(function (r) { return r.monsterId; });
    });
  }
  // Une scène donne une récompense si elle accorde de l'XP ou au moins un objet
  function sceneHasReward(scene) {
    return (scene.xpReward && scene.xpReward > 0) ||
      (Array.isArray(scene.itemRewards) && scene.itemRewards.some(function (r) { return r.itemId; }));
  }
  function appendSection(box) {
    const d = document.createElement('div');
    box.appendChild(d);
    return d;
  }

  // Le type de scène n'est qu'un libellé : on affiche les fonctions réellement
  // présentes dans la scène (récompense, combat, choix, suite), dans cet ordre.
  function renderSceneActions(scene, adv, ses) {
    const box = $('#ses-actions');
    if (!box) return;
    box.innerHTML = '';

    if (sceneHasReward(scene)) renderRewardScene(box, scene, adv, ses);
    if (sceneHasCombat(scene)) renderCombatScene(box, scene, adv, ses);
    const hasChoices = scene.choices && scene.choices.length;
    if (hasChoices) renderChoicesPlay(box, scene, adv, ses);
    else if (scene.nextSceneId) renderNextButton(box, scene, adv, ses);
    if (scene.type === 'fin') renderFinButton(box, scene, adv, ses);
  }

  // La scène cible d'un choix déclenche-t-elle un combat ? (pour l'emoji ⚔️)
  function choiceLeadsToCombat(adv, targetSceneId) {
    if (!targetSceneId) return false;
    const found = findScene(adv, targetSceneId);
    return !!(found && sceneHasCombat(found.scene));
  }
  function renderChoicesPlay(box, scene, adv, ses) {
    const DIFF = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };
    const sec = appendSection(box);
    sec.innerHTML = '<div class="ses-choices">' +
      scene.choices.map(function (ch, i) {
        if (ch.skillTest) {
          const bh = bestHeroForSkill(ses, ch.skill);
          const talBonus = bh.talentSucc || 0;
          const dice = 1 + (bh.bonus || 0); // somme des dés lancés = 1 + bonus de compétence
          const helper = bh.hero
            ? '<div class="ses-skill-pill">' +
                '<span class="ssk-hero">' + esc(bh.hero.name) + '</span>' +
                '<span class="ssk-skill skill-' + slug(ch.skill || '') + '">' + esc(ch.skill || '') + ' ' + dice + ' 🎲</span>' +
                (talBonus ? '<span class="ssk-tal">+' + talBonus + ' réussite' + (talBonus > 1 ? 's' : '') + '</span>' : '') +
                '<span class="ssk-diff ssk-diff-' + (ch.difficulty || 'moyen') + '">' + (DIFF[ch.difficulty] || 'Moyen') + '</span>' +
              '</div>'
            : '<div class="ses-skill-pill ssk-none">Aucun aventurier disponible pour ce test</div>';
          return '<div class="ses-choice">' +
            '<button class="ses-choice-btn skill-test choice-type-' + (ch.choiceType || 'neutre') + '" data-ci="' + i + '" data-skill-hero="' + (bh.hero ? esc(bh.hero.id) : '') + '">' +
              esc(ch.label) + ' <span class="ssk-skill skill-' + slug(ch.skill || '') + '">' + esc(ch.skill || '') + '</span></button>' +
            helper +
            (ch.description ? '<div class="ses-choice-desc">' + esc(ch.description) + '</div>' : '') +
          '</div>';
        }
        // Choix menant à un combat : ⚔️ devant le libellé.
        const leadsToCombat = choiceLeadsToCombat(adv, ch.targetSceneId);
        return '<div class="ses-choice">' +
          '<button class="ses-choice-btn choice-type-' + (ch.choiceType || 'neutre') + '" data-target="' + ch.targetSceneId + '">' +
            (leadsToCombat ? '⚔️ ' : '') + esc(ch.label) + '</button>' +
          (ch.description ? '<div class="ses-choice-desc">' + esc(ch.description) + '</div>' : '') +
        '</div>';
      }).join('') +
    '</div>';
    sec.querySelectorAll('.ses-choice-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        const ci = b.getAttribute('data-ci');
        if (ci !== null) { runSkillTest(ses, adv, scene, scene.choices[+ci], b.getAttribute('data-skill-hero')); return; }
        const targetId = b.getAttribute('data-target');
        ses.choicesTaken.push({ sceneId: scene.id, choiceLabel: b.textContent, targetSceneId: targetId });
        navigateTo(ses, adv, targetId);
      });
    });
  }

  function renderNextButton(box, scene, adv, ses) {
    const sec = appendSection(box);
    // Si la scène accorde des récompenses non encore prises, le bouton l'indique.
    const claimed = ses.claimedRewards && ses.claimedRewards[scene.id];
    const nbRewards = (scene.xpReward ? 1 : 0) + (scene.itemRewards || []).filter(function (r) { return r.itemId; }).length;
    let label = 'Continuer →';
    if (sceneHasReward(scene) && !claimed && nbRewards > 0) {
      label = (nbRewards > 1 ? 'Prendre les Récompenses' : 'Prendre la Récompense') + ' et Continuer →';
    }
    sec.innerHTML = '<button class="primary" id="ses-next">' + label + '</button>';
    sec.querySelector('#ses-next').addEventListener('click', function () {
      navigateTo(ses, adv, scene.nextSceneId);
    });
  }

  function renderFinButton(box, scene, adv, ses) {
    const sec = appendSection(box);
    sec.innerHTML = '<div class="ses-fin"><strong>Fin de l\'aventure.</strong>' +
      '<button class="primary" id="ses-fin-btn" style="margin-top:.75rem">Terminer la session</button></div>';
    sec.querySelector('#ses-fin-btn').addEventListener('click', function () {
      ses.status = 'ended'; ses.party.xp = 0;
      save(); activeSession = null; render();
    });
  }

  // ----- Tests de compétence -----
  const SKILL_DIFF = { facile: 1, moyen: 2, difficile: 3 };
  // Réussites bonus accordées par les talents « Expertise » (boost_competence) équipés
  // d'un aventurier pour une compétence donnée.
  function skillTalentBonus(ses, hid, skill) {
    const g = ses.levelGains ? ses.levelGains[hid] : null;
    if (!g) return 0;
    const equipped = equippedTalents(g);
    if (!equipped.length) return 0;
    const all = Store.loadGenericTalents().slice();
    Store.loadClasses().forEach(function (c) { if (Array.isArray(c.talents)) all.push.apply(all, c.talents); });
    let sum = 0;
    equipped.forEach(function (id) {
      const t = all.find(function (x) { return x.id === id; });
      if (!t) return;
      Store.talentEffectList(t).forEach(function (e) {
        if (e.effect === 'boost_competence' && e.choice === skill) sum += (e.val || 0);
      });
    });
    return sum;
  }
  // Aventurier du groupe ayant le meilleur bonus dans la compétence (talents inclus).
  // En cas d'égalité au sommet, un des ex æquo est choisi aléatoirement.
  // preferHeroId : si fourni et toujours ex æquo, on conserve ce choix (cohérence
  // entre le cartouche affiché et le test réellement lancé).
  function bestHeroForSkill(ses, skill, preferHeroId) {
    let bestEff = -1;
    const cands = [];
    (ses.heroIds || []).forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (!h) return;
      const g = ses.levelGains ? ses.levelGains[hid] : null;
      const sessSkill = (g && g.skills && g.skills[skill]) || 0; // points gagnés en montée de niveau
      const v = ((h.skills && h.skills[skill]) || 0) + sessSkill;
      const tal = skillTalentBonus(ses, hid, skill);
      const eff = v + tal;
      cands.push({ hero: h, v: v, tal: tal, eff: eff });
      if (eff > bestEff) bestEff = eff;
    });
    const top = cands.filter(function (c) { return c.eff === bestEff; });
    let pick = preferHeroId ? top.find(function (c) { return c.hero.id === preferHeroId; }) : null;
    if (!pick && top.length) pick = top[Math.floor(Math.random() * top.length)];
    if (!pick) return { hero: null, bonus: 0, talentSucc: 0 };
    return { hero: pick.hero, bonus: Math.max(0, pick.v), talentSucc: Math.max(0, pick.tal) };
  }
  // 1d6 + 1d6 par point de compétence ; réussite = dé à 4+ ; les 6 sont explosifs
  function rollSkill(bonus) {
    let toRoll = 1 + bonus, successes = 0, rolls = [], guard = 0;
    while (toRoll > 0 && guard++ < 60) {
      let next = 0;
      for (let i = 0; i < toRoll; i++) {
        const r = 1 + Math.floor(Math.random() * 6);
        rolls.push(r);
        if (r >= 4) successes++;
        if (r === 6) next++;
      }
      toRoll = next;
    }
    return { successes: successes, rolls: rolls };
  }
  function runSkillTest(ses, adv, scene, ch, preferHeroId) {
    if (!ch) return;
    const skill = ch.skill || 'Force';
    const diff = ch.difficulty || 'moyen';
    const need = SKILL_DIFF[diff] || 2;
    const bh = bestHeroForSkill(ses, skill, preferHeroId);
    const res = rollSkill(bh.bonus);
    const talSucc = bh.talentSucc || 0;
    const totalSucc = res.successes + talSucc;
    const passed = totalSucc >= need;
    const who = bh.hero ? bh.hero.name : 'Le groupe';
    alert(who + ' effectue un test de ' + skill + ' : ' + totalSucc + ' réussite(s)' +
      (talSucc > 0 ? ' (' + res.successes + ' aux dés + ' + talSucc + ' Expertise)' : '') +
      ' = ' + (passed ? 'Réussite' : 'Échec') + '.\n\n' +
      (passed ? 'Vous avez réussi le test.' : 'Vous avez échoué le test.') +
      '\n\nDés (' + (1 + bh.bonus) + ' + explosifs) : ' + res.rolls.join(', '));
    const target = passed ? ch.successSceneId : ch.failSceneId;
    ses.choicesTaken.push({ sceneId: scene.id, choiceLabel: ch.label + ' [test ' + skill + ']', targetSceneId: target, success: passed });
    navigateTo(ses, adv, target);
  }

  function navigateTo(ses, adv, sceneId) {
    if (!sceneId) return;
    // Récompenses de la scène courante : attribuées automatiquement en la quittant
    // (avant le contrôle de montée de niveau, pour que l'XP gagnée compte).
    grantSceneRewardsFromDOM(ses, adv);
    const found = findScene(adv, sceneId);
    if (!found) return;
    // Montée de niveau en attente : on affiche l'écran « Niveau Supérieur ! »
    // AVANT de poursuivre vers la scène suivante (un niveau à la fois).
    ensureLevelData(ses);
    if ((ses.levelDone || 1) < sessionLevel(ses)) {
      ses.pendingNav = sceneId;
      save();
      const root = $('#session-root');
      if (root) renderLevelUp(root, ses, adv, (ses.levelDone || 1) + 1);
      return;
    }
    ses.currentChapterId = found.chapter.id;
    ses.currentSceneId = sceneId;
    if (ses.visitedSceneIds.indexOf(sceneId) === -1) ses.visitedSceneIds.push(sceneId);
    save();
    render();
  }

  // ---------- Écran « Niveau Supérieur ! » ----------
  function engagedHeroes(ses) {
    return (ses.heroIds || []).map(function (hid) {
      return Store.state.heroes.find(function (h) { return h.id === hid; });
    }).filter(Boolean);
  }
  // Talents que l'aventurier peut choisir au nouveau niveau (génériques + sa
  // classe, niveau requis atteint), en excluant ceux déjà acquis.
  function availableTalents(ses, h, newLevel) {
    const taken = heroGains(ses, h.id).talents;
    const gens = Store.loadGenericTalents().filter(function (t) { return !t.hidden && (t.level || 1) <= newLevel; });
    let cls = [];
    try {
      const c = Store.loadClasses().find(function (x) { return x.name === h.klass; });
      if (c && Array.isArray(c.talents)) {
        cls = c.talents.filter(function (t) { return !t.hidden && t.id && (t.level || 1) <= newLevel; });
      }
    } catch (e) {}
    // Arborescence : un talent prérequis doit être déjà acquis pour débloquer celui-ci.
    return gens.concat(cls).filter(function (t) {
      return taken.indexOf(t.id) < 0 && (!t.prereq || taken.indexOf(t.prereq) >= 0);
    });
  }

  const LVL_SKILLS = ['Agilité', 'Force', 'Mysticisme', 'Perception', 'Robustesse', 'Ruse', 'Savoir', 'Technique'];
  function renderLevelUp(root, ses, adv, newLevel) {
    const heroes = engagedHeroes(ses);
    const statSel = {}; // idx -> 'endu'|'damage'|'vie'
    const talSel  = {}; // idx -> talentId
    const skillSel = {}; // idx -> [skill, skill] (2 différentes) ; niveaux impairs uniquement
    const needSkills = (newLevel % 2) === 1; // niveaux impairs (3, 5, 7…)

    function heroBlock(h, idx) {
      // Sépare les talents génériques et de classe pour l'affichage en deux sections.
      const taken = heroGains(ses, h.id).talents;
      // Arborescence : prérequis doit être acquis ; talent non encore pris.
      const okTalent = function (t) {
        return !t.hidden && t.id && (t.level || 1) <= newLevel && taken.indexOf(t.id) < 0 &&
          (!t.prereq || taken.indexOf(t.prereq) >= 0);
      };
      const genTalents = Store.loadGenericTalents().filter(okTalent);
      var clsTalents = [];
      try {
        var cls = Store.loadClasses().find(function (x) { return x.name === h.klass; });
        if (cls && Array.isArray(cls.talents)) {
          clsTalents = cls.talents.filter(okTalent);
        }
      } catch (e) {}

      const g = ses.levelGains ? (ses.levelGains[h.id] || {}) : {};
      const curEndu = (h.endu || 0) + (g.endu || 0);
      const curVie  = (h.vie  || 0) + (g.vie  || 0) + ((ses.heroStates && ses.heroStates[h.id] && ses.heroStates[h.id].viePenalty) || 0);
      const curDmg  = (h.damage || 0) + (g.damage || 0);
      const pvFromEndu2 = 2 * curVie;

      // Lignes de choix de carac dans le même style que la création d'aventurier.
      // cur = valeur actuelle rappelée pour aider au choix.
      function statRow(stat, label, cur, hint) {
        return '<div class="lvl-stat-row hw-stat-row2 hw-stat-row2--' + stat + '" data-idx="' + idx + '" data-stat="' + stat + '">' +
          '<span class="hw-stat-label2">' + label +
            ' <span class="lvl-stat-cur">' + cur + '</span>' +
            ' <small>(' + hint + ')</small></span>' +
          '<span class="lvl-stat-pick-icon">○</span>' +
        '</div>';
      }
      const statHtml =
        statRow('damage', 'DÉGÂTS', curDmg, '+1') +
        statRow('endu', 'ENDURANCE', curEndu, '+2 · +' + pvFromEndu2 + ' PV') +
        statRow('vie', 'VIE', curVie, '+1 · +' + curEndu + ' PV');

      function talentRows(list) {
        return list.map(function (t) {
          return '<div class="lvl-tal-wrap">' +
            '<div class="tpe-row tpe-kind-' + (t.kind || 'none') + '" data-idx="' + idx + '" data-tal="' + esc(t.id) + '">' +
              '<input type="checkbox" class="lvl-tal-cb" aria-label="Sélectionner ' + esc(t.name) + '">' +
              '<span class="tpe-name" title="Voir le descriptif">' + esc(t.name) + '</span>' +
              '<span class="tpe-meta">' +
                '<span class="tl-kind tl-kind-' + (t.kind || 'passive') + '">' + esc(KIND_SHORT(t.kind)) + '</span>' +
                '<span class="tpe-lvl">Niv. ' + (t.level || 1) + '</span>' +
              '</span>' +
            '</div>' +
            (t.description ? '<div class="tpe-desc" hidden>' + esc(t.description) + '</div>' : '') +
          '</div>';
        }).join('');
      }
      const noTalent = '<span class="hint" style="font-size:.8rem">Aucun talent disponible.</span>';
      const talHtml =
        '<div class="lvl-tal-section">' +
          '<div class="lvl-sec-sub">Talents Génériques</div>' +
          (genTalents.length ? talentRows(genTalents) : noTalent) +
        '</div>' +
        '<div class="lvl-tal-section">' +
          '<div class="lvl-sec-sub">Talents de Classe</div>' +
          (clsTalents.length ? talentRows(clsTalents) : noTalent) +
        '</div>';

      // Compétences (niveaux impairs) : +1 dans 2 compétences DIFFÉRENTES.
      let skillHtml = '';
      if (needSkills) {
        const cur = (h.skills || {});
        const gSk = (g.skills || {});
        skillHtml =
          '<div class="lvl-sec-title">Compétences <small>(+1 dans 2 différentes)</small></div>' +
          '<div class="lvl-skill-grid">' +
            LVL_SKILLS.map(function (s) {
              const base = (cur[s] || 0) + (gSk[s] || 0);
              return '<button type="button" class="lvl-skill-chip skill-' + slug(s) + '" data-idx="' + idx + '" data-skill="' + esc(s) + '" data-base="' + base + '">' +
                '<span class="lsk-name">' + esc(s) + '</span>' +
                '<span class="lsk-val">+' + base + '</span></button>';
            }).join('') +
          '</div>';
      }
      return '<div class="lvl-col" data-idx="' + idx + '">' +
        '<div class="lvl-col-head">' +
          '<span class="lvl-hero-name' + (h.klass ? ' klass-' + slug(h.klass) : '') + '">' + esc(h.name) + '</span>' +
          (h.klass ? '<span class="class-badge klass-' + slug(h.klass) + '">' + esc(h.klass) + '</span>' : '') +
        '</div>' +
        '<div class="lvl-sec-title">Caractéristique</div>' +
        '<div class="lvl-stat-choice">' + statHtml + '</div>' +
        skillHtml +
        '<div class="lvl-sec-title">Talent</div>' +
        '<div class="lvl-tal-col">' + talHtml + '</div>' +
      '</div>';
    }

    const cards = heroes.map(function (h, idx) { return heroBlock(h, idx); }).join('');

    root.innerHTML =
      '<div class="card lvlup-card">' +
        '<div class="lvlup-banner">⭐ <span>Niveau Supérieur !</span>' +
          '<span class="lvlup-num">Niveau ' + newLevel + '</span></div>' +
        '<div class="lvlup-heroes lvlup-grid">' + cards + '</div>' +
        '<button class="primary big" id="lvlup-continue" disabled>Continuer →</button>' +
      '</div>';

    const contBtn = root.querySelector('#lvlup-continue');

    function refresh() {
      let ok = true;
      heroes.forEach(function (h, idx) {
        if (!statSel[idx]) ok = false;
        if (availableTalents(ses, h, newLevel).length > 0 && !talSel[idx]) ok = false;
        if (needSkills && (!skillSel[idx] || skillSel[idx].length !== 2)) ok = false;
      });
      contBtn.disabled = !ok;
    }

    root.querySelectorAll('.lvl-stat-row').forEach(function (row) {
      row.addEventListener('click', function () {
        const idx = row.getAttribute('data-idx');
        root.querySelectorAll('.lvl-stat-row[data-idx="' + idx + '"]').forEach(function (b) {
          b.classList.remove('selected');
          const icon = b.querySelector('.lvl-stat-pick-icon');
          if (icon) icon.textContent = '○';
        });
        row.classList.add('selected');
        const icon = row.querySelector('.lvl-stat-pick-icon');
        if (icon) icon.textContent = '✓';
        statSel[idx] = row.getAttribute('data-stat');
        refresh();
      });
    });
    // Compétences (niveaux impairs) : sélection de 2 compétences différentes.
    root.querySelectorAll('.lvl-skill-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const idx = chip.getAttribute('data-idx');
        const sk = chip.getAttribute('data-skill');
        const arr = skillSel[idx] || (skillSel[idx] = []);
        const pos = arr.indexOf(sk);
        if (pos >= 0) { arr.splice(pos, 1); chip.classList.remove('selected'); }
        else if (arr.length < 2) { arr.push(sk); chip.classList.add('selected'); }
        // Le bonus +X passe à +X+1 en vert quand la compétence est sélectionnée.
        const valEl = chip.querySelector('.lsk-val');
        const base = parseInt(chip.getAttribute('data-base'), 10) || 0;
        if (valEl) valEl.textContent = '+' + (chip.classList.contains('selected') ? base + 1 : base);
        refresh();
      });
    });
    root.querySelectorAll('.lvl-tal-wrap').forEach(function (wrap) {
      const row = wrap.querySelector('.tpe-row');
      const desc = wrap.querySelector('.tpe-desc');
      row.addEventListener('click', function (e) {
        if (e.target.classList.contains('lvl-tal-cb')) {
          const idx = row.getAttribute('data-idx');
          root.querySelectorAll('.tpe-row[data-idx="' + idx + '"]').forEach(function (b) {
            b.classList.remove('selected');
            const cb = b.querySelector('.lvl-tal-cb'); if (cb) cb.checked = false;
          });
          row.classList.add('selected');
          e.target.checked = true;
          talSel[idx] = row.getAttribute('data-tal');
          refresh();
        } else {
          if (desc) desc.hidden = !desc.hidden;
        }
      });
    });

    contBtn.addEventListener('click', function () {
      heroes.forEach(function (h, idx) {
        const g = heroGains(ses, h.id);
        const curEndu = (h.endu || 0) + (g.endu || 0);
        const curVie  = (h.vie  || 0) + (g.vie  || 0) + ((ses.heroStates && ses.heroStates[h.id] && ses.heroStates[h.id].viePenalty) || 0);
        if (statSel[idx] === 'endu') {
          g.endu += 2;
          const delta = 2 * curVie;
          if (delta > 0 && ses.heroStates && ses.heroStates[h.id]) {
            ses.heroStates[h.id].pv = (ses.heroStates[h.id].pv || 0) + delta;
          }
        } else if (statSel[idx] === 'vie') {
          if (typeof g.vie !== 'number') g.vie = 0;
          g.vie += 1;
          const delta = curEndu;
          if (delta > 0 && ses.heroStates && ses.heroStates[h.id]) {
            ses.heroStates[h.id].pv = (ses.heroStates[h.id].pv || 0) + delta;
          }
        } else if (statSel[idx] === 'damage') {
          g.damage += 1;
        }
        if (talSel[idx] && g.talents.indexOf(talSel[idx]) < 0) {
          g.talents.push(talSel[idx]);
          // Auto-équipe le nouveau talent s'il reste un emplacement libre (≤ 6)
          if (!Array.isArray(g.equipped)) g.equipped = [];
          if (g.equipped.length < 6 && g.equipped.indexOf(talSel[idx]) < 0) g.equipped.push(talSel[idx]);
        }
        // Compétences (niveaux impairs) : +1 dans 2 compétences différentes.
        if (needSkills && skillSel[idx] && skillSel[idx].length === 2) {
          if (!g.skills) g.skills = {};
          skillSel[idx].forEach(function (s) { g.skills[s] = (g.skills[s] || 0) + 1; });
        }
      });
      ses.levelDone = newLevel;
      const target = ses.pendingNav;
      ses.pendingNav = null;
      save();
      Store.save();
      navigateTo(ses, adv, target);
    });
  }

  // Zones d'une scène de combat (migration de l'ancien format plat si besoin)
  function sceneZones(scene) {
    if (Array.isArray(scene.combatZones) && scene.combatZones.length) return scene.combatZones;
    const refs = (scene.monsterRefs || []).filter(function (r) { return r.monsterId; });
    return [
      { name: 'Zone des aventuriers', monsterRefs: [], heroStart: true },
      { name: 'Adversaires', monsterRefs: refs },
    ];
  }

  function renderCombatScene(box, scene, adv, ses) {
    const zones = sceneZones(scene);
    // Barrières au nouveau format objet « min-max » (avec migration de l'ancien
    // tableau linéaire / du type « obstruante »).
    const barriers = (function () {
      const raw = scene.barriers;
      const out = {};
      if (Array.isArray(raw)) {
        raw.forEach(function (b, i) {
          if (b && b.type && b.type !== 'none') out[i + '-' + (i + 1)] = { type: b.type === 'obstruante' ? 'mur' : b.type };
        });
      } else if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (k) {
          const b = raw[k];
          if (b && b.type && b.type !== 'none') out[k] = { type: b.type === 'obstruante' ? 'mur' : b.type };
        });
      }
      return out;
    })();
    const partyHeroes = engagedHeroes(ses);
    // Vignette compacte d'un combattant (façon module de combat).
    function previewChip(name, cls) {
      const initial = (name || '?').charAt(0).toUpperCase();
      return '<div class="pv-chip ' + cls + '"><span class="pv-chip-av">' + esc(initial) + '</span>' +
        '<span class="pv-chip-name">' + esc(name) + '</span></div>';
    }
    const B_LABEL = { infranchissable: '⛔ Infranchissable', mur: '🧱 Mur', difficile: '⛰ Difficile' };
    const B_NAME = { infranchissable: 'INFRANCHISSABLE', mur: 'MUR', difficile: 'DIFFICILE' };
    const Z_POS = { 1: [[1, 1]], 2: [[1, 1], [1, 3]], 3: [[1, 1], [1, 3], [3, 1]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]] };
    const Z_SEPS = [
      { pair: [0, 1], row: 1, col: 2, dir: 'v' }, { pair: [2, 3], row: 3, col: 2, dir: 'v' },
      { pair: [0, 2], row: 2, col: 1, dir: 'h' }, { pair: [1, 3], row: 2, col: 3, dir: 'h' },
    ];
    const Z_DIAG = [ { pair: [0, 3], dir: 'down-left' }, { pair: [1, 2], dir: 'down-right' } ];
    const nZones = Math.max(1, zones.length);
    const zPos = Z_POS[nZones] || Z_POS[1];
    let zonesHtml = zones.map(function (z, zi) {
      const mons = (z.monsterRefs || []).filter(function (r) { return r.monsterId; }).map(function (r) {
        const m = Store.state.monsters.find(function (x) { return x.id === r.monsterId; });
        const t = m ? (m.type === 'standard' ? 'sbire' : m.type) : 'sbire';
        const n = Math.max(1, r.count || 1);
        let out = '';
        for (let k = 0; k < n; k++) out += previewChip((m ? m.name : '?') + (n > 1 ? ' ' + (k + 1) : ''), 'pv-foe ztype-' + t);
        return out;
      }).join('');
      const heroesHtml = z.heroStart
        ? (partyHeroes.length ? partyHeroes.map(function (h) { return previewChip(h.name, 'pv-hero' + (h.klass ? ' klass-' + slug(h.klass) : '')); }).join('') : '<span class="pz-empty">🛡 Aventuriers</span>')
        : '';
      const body = (heroesHtml + mons) || '<span class="pz-empty">—</span>';
      const p = zPos[zi] || [1, 1];
      return '<div class="preview-zone' + (z.heroStart ? ' hero-start' : '') + '"' +
        ' style="grid-row:' + p[0] + ';grid-column:' + p[1] + ';">' +
        '<div class="pz-name">' + esc(z.name || 'Zone') + '</div>' +
        '<div class="pz-chips">' + body + '</div>' +
      '</div>';
    }).join('');
    Z_SEPS.forEach(function (e) {
      if (e.pair[0] >= nZones || e.pair[1] >= nZones) return;
      const bar = barriers[e.pair[0] + '-' + e.pair[1]];
      if (!bar) return;
      zonesHtml += '<div class="zone-sep zone-sep-' + e.dir + ' barrier-' + bar.type + '"' +
        ' style="grid-row:' + e.row + ';grid-column:' + e.col + ';" title="' + (B_LABEL[bar.type] || '').replace(/^[^ ]+ /, '') + '">' +
        '<span class="zone-sep-lbl">' + (B_NAME[bar.type] || '') + '</span></div>';
    });
    // Séparateurs diagonaux (paires 1-4 et 2-3) au centre de la grille.
    let zDiagHtml = '';
    Z_DIAG.forEach(function (d) {
      if (d.pair[0] >= nZones || d.pair[1] >= nZones) return;
      const bar = barriers[d.pair[0] + '-' + d.pair[1]];
      if (!bar) return;
      zDiagHtml += '<div class="zone-sep-diag ' + d.dir + ' barrier-' + bar.type + '"' +
        ' title="' + (B_LABEL[bar.type] || '').replace(/^[^ ]+ /, '') + '">' +
        '<span class="zone-sep-lbl">' + (B_NAME[bar.type] || '') + '</span></div>';
    });
    if (zDiagHtml) zonesHtml += '<div class="zone-sep-diag-wrap" style="grid-row:2;grid-column:2;">' + zDiagHtml + '</div>';
    const gridStyle = nZones <= 1 ? 'grid-template-columns:1fr;'
      : (nZones === 2 ? 'grid-template-columns:1fr auto 1fr;'
        : 'grid-template-columns:1fr auto 1fr;grid-template-rows:1fr auto 1fr;');
    const preview = '<div class="combat-preview zc-' + nZones + '" style="' + gridStyle + '">' + zonesHtml + '</div>';

    const sec = appendSection(box);
    sec.innerHTML =
      '<div class="ses-combat-block">' +
        '<p class="hint">Disposition du combat (vous ne pouvez pas changer votre position de départ) :</p>' +
        preview +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem">' +
          '<button class="primary" id="ses-start-combat">⚔ Lancer le combat</button>' +
          (scene.outcomeSceneId
            ? '<button class="ghost" id="ses-skip-victory">Passer (victoire)</button>' : '') +
          (scene.defeatSceneId
            ? '<button class="danger" id="ses-skip-defeat">Passer (défaite)</button>' : '') +
        '</div>' +
      '</div>';

    sec.querySelector('#ses-start-combat').addEventListener('click', function () {
      launchSessionCombat(scene, adv, ses);
    });
    const sv = sec.querySelector('#ses-skip-victory');
    if (sv) sv.addEventListener('click', function () {
      if (!confirm('Passer le Combat (victoire) ? Vous ne gagnerez aucune récompense ni XP de ce combat.')) return;
      navigateTo(ses, adv, scene.outcomeSceneId);
    });
    const sd = sec.querySelector('#ses-skip-defeat');
    if (sd) sd.addEventListener('click', function () {
      if (!confirm('Passer le Combat (défaite) ? Vous subirez une défaite.')) return;
      navigateTo(ses, adv, scene.defeatSceneId);
    });
  }

  function launchSessionCombat(scene, adv, ses) {
    // Préparer les données de combat (zones)
    const zones = sceneZones(scene);
    const monsterCount = zones.reduce(function (n, z) {
      return n + (z.monsterRefs || []).filter(function (r) { return r.monsterId; }).reduce(function (s, r) { return s + (r.count || 1); }, 0);
    }, 0);
    if (!monsterCount) { alert('Aucun monstre défini pour ce combat.'); return; }
    if (!ses.heroIds.length) { alert('Aucun héros engagé dans cette aventure.'); return; }

    // Synchroniser les PV de session vers les fiches héros (le combat lira h.pv)
    ses.heroIds.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h && ses.heroStates[hid] && typeof ses.heroStates[hid].pv === 'number') {
        h.pv = ses.heroStates[hid].pv;
      }
    });
    Store.save();

    const ctx = {
      sessionId: ses.id,
      adventureId: adv.id,
      sceneId: scene.id,
      outcomeSceneId: scene.outcomeSceneId,
      defeatSceneId: scene.defeatSceneId,
    };

    // Le combat se déroule DANS le panneau Session, avec les héros de l'aventure.
    const root = $('#session-root');
    root.innerHTML = '<div class="ses-combat-wrap"><div id="session-combat-root"></div></div>';
    ensureLevelData(ses);
    Combat.startInSession(ses.heroIds, { combatZones: zones, barriers: scene.barriers || [] }, ctx, '#session-combat-root', ses.levelGains);
  }

  // Récompense de scène affichée EN LIGNE : XP (auto au Continue) + objets avec une
  // liste de sélection d'aventurier à côté de chacun. L'attribution se fait au Continue.
  function renderRewardScene(box, scene, adv, ses) {
    const xp = scene.xpReward || 0;
    const lines = (scene.itemRewards || []).filter(function (r) { return r.itemId; });
    const heroes = engagedHeroes(ses);
    const sec = appendSection(box);
    if (!ses.claimedRewards) ses.claimedRewards = {};
    const claimed = !!ses.claimedRewards[scene.id];
    if (claimed) {
      sec.innerHTML = '<div class="ses-reward-block"><p class="hint">Récompense déjà récupérée.</p></div>';
      return;
    }
    const heroOpts = heroes.map(function (h) { return '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>'; }).join('');
    const rowsHtml = lines.map(function (r) {
      const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
      const strip = (it && global.Inventory && Inventory.itemStripHtml) ? Inventory.itemStripHtml(it) :
        '<span class="inv-strip-name">' + esc(it ? it.name : '?') + '</span>';
      const realIdx = (scene.itemRewards || []).indexOf(r);
      return '<div class="rp-line">' +
        '<div class="inv-strip-row cat-' + (it ? it.category : 'object') + '">' +
          '<div class="inv-strip">' + strip + '</div>' +
          (r.qty > 1 ? '<span class="rp-qty">×' + r.qty + '</span>' : '') +
        '</div>' +
        (heroes.length ? '<select class="rp-hero" data-idx="' + realIdx + '">' + heroOpts + '</select>' : '') +
      '</div>';
    }).join('');
    // Deux cases distinctes : XP d'un côté, équipement de l'autre.
    let html = '';
    if (xp) {
      html += '<div class="ses-reward-block ses-reward-xp">' +
        '<div class="ses-reward-title">✦ Expérience <strong>+' + xp + ' XP</strong></div>' +
      '</div>';
    }
    if (lines.length) {
      html += '<div class="ses-reward-block ses-reward-items">' +
        '<div class="ses-reward-title">🎁 Équipement</div>' +
        '<div class="rp-list">' + rowsHtml + '</div>' +
        '<p class="hint">Choisis le destinataire de chaque objet ; l\'attribution se fait en cliquant sur « Continuer ».</p>' +
      '</div>';
    }
    sec.innerHTML = html;
  }

  // Applique les récompenses (XP + objets) de la scène en lisant les listes affichées.
  // Appelée automatiquement au moment de quitter la scène (Continuer / choix).
  function grantSceneRewardsFromDOM(ses, adv) {
    if (!ses || !ses.currentSceneId) return;
    const found = findScene(adv, ses.currentSceneId);
    const scene = found ? found.scene : null;
    if (!scene || !sceneHasReward(scene)) return;
    if (ses.claimedRewards && ses.claimedRewards[scene.id]) return;
    const assign = {};
    document.querySelectorAll('#ses-actions .rp-hero').forEach(function (sel) {
      assign[parseInt(sel.getAttribute('data-idx'), 10)] = sel.value;
    });
    const xp = scene.xpReward || 0;
    if (xp > 0) { ses.party.xp = (ses.party.xp || 0) + xp; }
    if (!ses.acquiredItems) ses.acquiredItems = {};
    if (!ses.heroOwned) ses.heroOwned = {};
    const fallback = (ses.heroIds && ses.heroIds[0]) || null;
    (scene.itemRewards || []).forEach(function (r, idx) {
      if (!r.itemId) return;
      const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
      if (!it) return;
      const q = r.qty || 1;
      it.qty = (it.qty || 0) + q;
      ses.acquiredItems[r.itemId] = (ses.acquiredItems[r.itemId] || 0) + q;
      const recipient = (assign[idx]) || fallback;
      if (recipient) addToHeroOwned(ses, recipient, r.itemId, q); // armes plafonnées à 2
    });
    if (!ses.claimedRewards) ses.claimedRewards = {};
    ses.claimedRewards[scene.id] = true;
    Store.save();
    // Signale l'arrivée de nouveaux objets (fait clignoter l'onglet Inventaire).
    if ((scene.itemRewards || []).some(function (r) { return r.itemId; })) {
      document.dispatchEvent(new CustomEvent('inventory-new-item'));
    }
  }

  // Écouter la fin d'un combat déclenché par une session
  // detail = { sessionId, outcome }  (outcome : 'victory' | 'minor' | 'defeat' | null)
  // combat.js a déjà remis Store.state.sessionCombat à null ; on garde le contexte
  // de scène via la session elle-même (currentSceneId).
  window.addEventListener('adventure-combat-end', function (e) {
    const detail = e.detail || {};
    try {
    load();
    const ses = sessions.find(function (s) { return s.id === detail.sessionId; });
    // Session introuvable : on réaffiche tout de même la vue pour ne pas rester
    // bloqué sur l'écran de résumé de combat.
    if (!ses) { render(); return; }
    activeSession = ses;
    const adv = findAdventure(ses.adventureId);
    if (!adv) { render(); return; }

    // Récupérer la scène de combat courante pour connaître les cibles
    const found = findScene(adv, ses.currentSceneId);
    const scene = found ? found.scene : null;

    // Synchroniser les PV des héros engagés depuis l'issue du combat. On FUSIONNE
    // (sans écraser viePenalty/dead posés par le coma pendant le combat).
    ses.heroIds.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h && typeof h.pv === 'number') {
        ses.heroStates[hid] = Object.assign({}, ses.heroStates[hid], { pv: h.pv });
      }
    });
    // XP du combat attribuée à la session (décorrélée de l'XP du mode Admin)
    if (detail.xp) ses.party.xp = (ses.party.xp || 0) + detail.xp;
    // Butin de combat : attribué à l'aventurier qui a achevé l'adversaire (à défaut au premier)
    if (detail.loot && detail.loot.length) {
      if (!ses.acquiredItems) ses.acquiredItems = {};
      if (!ses.heroOwned) ses.heroOwned = {};
      detail.loot.forEach(function (L) {
        ses.acquiredItems[L.itemId] = (ses.acquiredItems[L.itemId] || 0) + L.qty;
        const hid = (L.toHeroId && ses.heroIds.indexOf(L.toHeroId) >= 0) ? L.toHeroId : ses.heroIds[0];
        if (hid) addToHeroOwned(ses, hid, L.itemId, L.qty || 1); // armes plafonnées à 2
      });
      document.dispatchEvent(new CustomEvent('inventory-new-item'));
    }
    save();

    let targetId = null;
    if (scene) {
      if (detail.outcome === 'defeat') targetId = scene.defeatSceneId;
      else if (detail.outcome === 'victory' || detail.outcome === 'minor') targetId = scene.outcomeSceneId;
    }

    // Avance vers la scène de suite si elle existe réellement ; sinon on réaffiche
    // la scène courante (jamais bloqué sur le résumé de combat).
    if (targetId && findScene(adv, targetId)) {
      navigateTo(ses, adv, targetId);
    } else {
      render();
    }
    } catch (err) {
      console.error('[session] fin de combat', err);
      try { render(); } catch (e2) {}
    }
  });

  // ============ MODE JOUEUR : lecture limitée à une aventure ============

  // Onglet « Aventure » : reprend la partie active de l'aventure, sinon présente
  // la création / sélection du groupe d'aventuriers. Rendu dans #session-root.
  function renderPlay(advId) {
    scopeAdventureId = advId || scopeAdventureId;
    load();
    if (activeSession) {
      const m = sessions.find(function (s) { return s.id === activeSession.id; });
      activeSession = m || null;
    }
    if (forceSetup) {
      activeSession = null;
    } else if (!activeSession || activeSession.adventureId !== scopeAdventureId) {
      const existing = sessions.filter(function (s) {
        return s.adventureId === scopeAdventureId && s.status === 'active';
      });
      existing.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
      activeSession = existing.length ? existing[0] : null;
    }
    const root = $('#session-root');
    if (!root) return;
    // Combat de session en cours : on le réaffiche au lieu de la scène (le combat
    // n'est pas interrompu par un passage sur un autre onglet).
    if (activeSession && Store.state.combat && Store.state.sessionCombat &&
        Store.state.sessionCombat.sessionId === activeSession.id) {
      root.innerHTML = '<div class="ses-combat-wrap"><div id="session-combat-root"></div></div>';
      if (global.Combat && Combat.resumeInSession) Combat.resumeInSession('#session-combat-root');
      return;
    }
    if (activeSession) renderScene(root);
    else renderGroupSetup(root, scopeAdventureId);
  }

  // Première étape d'une aventure : créer son groupe puis choisir les engagés.
  function renderGroupSetup(root, advId) {
    forceSetup = false;
    const adv = findAdventure(advId);
    if (!adv) { root.innerHTML = '<p class="empty">Aventure introuvable.</p>'; return; }
    // Pool « Aventuriers » : les aventuriers créés par le joueur pour cette aventure.
    const heroes = Combatants.adventureHeroes(advId);

    // Mêmes cartes que l'onglet Groupe, avec une case à cocher de sélection
    // (les attaques sont masquées via CSS .hero-pick-list .roster-section)
    function cardHtml(h) {
      return '<div class="hero-pick-card-wrap">' +
        '<label class="hero-pick-card' + (setupSel[h.id] ? ' selected' : '') + '">' +
          Combatants.heroCardHtml(h, { selectable: true, checked: !!setupSel[h.id], showAvatar: true, defAsIcon: true, hideRapide: true }) +
        '</label>' +
        '<button type="button" class="ghost small grp-del-btn" data-grp-del="' + h.id + '" title="Supprimer">✕</button>' +
      '</div>';
    }

    // Aucun aventurier créé : inviter à en créer un.
    if (!heroes.length) {
      root.innerHTML =
        '<div class="card">' +
          '<div class="card-head"><h2>Créez votre groupe d\'aventuriers</h2></div>' +
          '<p class="hint">Avant de commencer « ' + esc(adv.title) + ' », créez au moins un aventurier. ' +
            'Vos aventuriers restent disponibles pour rejouer l\'aventure autant de fois que vous le souhaitez.</p>' +
          '<div class="group-create-actions">' +
            '<button class="primary" id="grp-new">+ Nouvel Aventurier</button>' +
          '</div>' +
        '</div>';
      document.getElementById('grp-new').onclick = function () { Combatants.openHeroModal(null); };
      return;
    }
    const customRows = heroes.map(function (h) { return cardHtml(h); }).join('');

    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Votre groupe — ' + esc(adv.title) + '</h2>' +
          '<div style="display:flex;gap:.4rem">' +
            '<button class="primary small" id="grp-new">+ Aventurier</button>' +
          '</div>' +
        '</div>' +
        '<p class="hint">Choisis 1 à 4 aventuriers qui partent à l\'aventure.</p>' +
        '<div class="grp-cat-title">Aventuriers</div>' +
        '<div id="grp-list" class="hero-pick-list">' +
          (customRows || '<p class="empty">Aucun aventurier créé. Clique sur « + Aventurier ».</p>') + '</div>' +
        '<p class="diff-advice" id="grp-advice"></p>' +
        '<div class="roll-actions"><button class="primary big" id="grp-start">▶ Commencer l\'aventure</button></div>' +
      '</div>';

    function refresh() {
      const n = root.querySelectorAll('[data-hero]:checked').length;
      const adv = document.getElementById('grp-advice');
      adv.textContent = difficultyAdvice(n) || 'Sélectionne au moins un aventurier (max 4).';
      adv.className = 'diff-advice' + (n >= 1 && n <= 4 ? ' diff-' + n : '');
      document.getElementById('grp-start').disabled = n < 1 || n > 4;
    }
    root.querySelectorAll('[data-hero]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked && root.querySelectorAll('[data-hero]:checked').length > 4) {
          cb.checked = false; alert('Maximum 4 aventuriers par aventure.');
        }
        setupSel[cb.getAttribute('data-hero')] = cb.checked;
        const lbl = cb.closest('.hero-pick-card');
        if (lbl) lbl.classList.toggle('selected', cb.checked);
        refresh();
      });
    });
    root.querySelectorAll('[data-grp-del]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        const id = b.getAttribute('data-grp-del');
        const h = Store.state.heroes.find(function (x) { return x.id === id; });
        if (!h) return;
        if (!confirm('Supprimer l\'aventurier « ' + h.name + ' » ?')) return;
        Store.state.heroes = Store.state.heroes.filter(function (x) { return x.id !== id; });
        delete setupSel[id];
        Store.save();
        renderGroupSetup(root, advId);
      });
    });
    document.getElementById('grp-new').onclick = function () { Combatants.openHeroModal(null); };
    document.getElementById('grp-start').onclick = function () {
      const ids = Array.from(root.querySelectorAll('[data-hero]:checked')).map(function (cb) { return cb.getAttribute('data-hero'); });
      if (!ids.length || ids.length > 4) return;
      // Résout les modèles pré-construits sélectionnés en clones liés à l'aventure
      const resolved = ids.map(function (id) { return resolveHeroId(advId, id); }).filter(Boolean);
      startSessionWithHeroes(advId, resolved);
    };
    refresh();
  }

  // Résout l'id d'un aventurier sélectionné au lancement : un modèle pré-construit
  // (adventureId null) est cloné dans l'aventure (ou réutilise un clone existant).
  function resolveHeroId(advId, id) {
    const h = Store.state.heroes.find(function (x) { return x.id === id; });
    if (!h) return null;
    if (h.adventureId === advId) return id;        // déjà membre de l'aventure
    if (!h.adventureId) {                            // modèle pré-construit
      const existing = Store.state.heroes.find(function (x) { return x.adventureId === advId && x.prebuiltId === id; });
      if (existing) return existing.id;
      return (Combatants.clonePrebuilt ? Combatants.clonePrebuilt(id, advId) : id) || id;
    }
    return id;
  }

  // Retire de l'inventaire les objets acquis durant les parties d'une aventure
  function rollbackAcquiredItems(advId) {
    let changed = false;
    sessions.forEach(function (s) {
      if (s.adventureId !== advId || !s.acquiredItems) return;
      Object.keys(s.acquiredItems).forEach(function (itemId) {
        const it = Store.state.items.find(function (x) { return x.id === itemId; });
        if (it) it.qty = Math.max(0, (it.qty || 0) - s.acquiredItems[itemId]);
        changed = true;
      });
      s.acquiredItems = {};
    });
    if (changed) Store.save();
  }

  // XP de la partie active (pour l'affichage de la progression côté Joueur)
  function activePartyXp() {
    return (activeSession && activeSession.party) ? (activeSession.party.xp || 0) : 0;
  }
  // Aventurier « effectif » de la partie active (gains de niveau + talents choisis).
  // Sert aux affichages joueur (feuille de perso) pour refléter les choix de niveau.
  function activeEffectiveHero(h) {
    return activeSession ? effectiveHero(activeSession, h) : h;
  }

  // Objets possédés par UN aventurier pour cette aventure : son équipement de
  // DÉPART (figé) + son butin de combat + ce qu'il porte actuellement. Personnel :
  // l'équipement d'un aventurier n'est jamais accessible à un autre.
  // Objets possédés par UN aventurier pour cette aventure (équipement de départ
  // + butin personnel). Tout objet porté est réconcilié dans le set possédé, donc
  // le déséquiper ne le fait jamais disparaître de l'inventaire.
  function ownedForHero(advId, heroId) {
    load();
    let ses = sessions.find(function (s) { return s.adventureId === advId && s.status === 'active'; }) || activeSession;
    const h = Store.state.heroes.find(function (x) { return x.id === heroId; });
    if (!ses) {
      const o = {};
      if (h) Combatants.heroGear(h).forEach(function (it) { o[it.id] = (o[it.id] || 0) + 1; });
      return o;
    }
    if (!ses.heroOwned) ses.heroOwned = {};
    if (!ses.heroOwned[heroId]) {
      ses.heroOwned[heroId] = {};
      if (h) Combatants.heroGear(h).forEach(function (it) { ses.heroOwned[heroId][it.id] = (ses.heroOwned[heroId][it.id] || 0) + 1; });
      delete ses.startGear; delete ses.ownedItems; // purge des anciens sets de groupe
      save();
    }
    // Réconciliation : ce qui est porté est forcément possédé (persisté)
    let changed = false;
    if (h) Combatants.heroGear(h).forEach(function (it) {
      if (!ses.heroOwned[heroId][it.id]) { ses.heroOwned[heroId][it.id] = 1; changed = true; }
    });
    if (changed) save();
    const owned = {};
    Object.keys(ses.heroOwned[heroId]).forEach(function (id) { owned[id] = Number(ses.heroOwned[heroId][id]) || 1; });
    return owned; // { itemId: quantité }
  }

  // Crée une nouvelle partie avec les aventuriers choisis et lance la narration
  function startSessionWithHeroes(advId, heroIds) {
    const adv = findAdventure(advId);
    if (!adv) return;
    const firstSc = firstScene(adv);
    if (!firstSc) { alert('Cette aventure n\'a pas encore de scène.'); return; }
    load();
    // Nouvelle aventure : on retire de l'inventaire les objets acquis lors des parties précédentes
    rollbackAcquiredItems(advId);
    // Aventuriers entièrement soignés (comme un repos long)
    const heroStates = {};
    heroIds.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h) heroStates[hid] = { pv: Combatants.heroPv(h) };
    });
    // Nouvelle partie : chaque aventurier récupère son équipement de BASE (pré-tiré),
    // puis l'inventaire personnel est figé sur cet équipement de départ + butin à venir.
    const heroOwned = {};
    heroIds.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (!h) { heroOwned[hid] = {}; return; }
      if (h.baseEquipment) h.equipment = JSON.parse(JSON.stringify(h.baseEquipment));
      Combatants.ensureStartEquipment(h);
      const set = {};
      Combatants.heroGear(h).forEach(function (it) { set[it.id] = (set[it.id] || 0) + 1; });
      heroOwned[hid] = set;
    });
    Store.save();
    const ses = {
      id: Store.uid(), adventureId: advId, startedAt: Date.now(), status: 'active',
      heroIds: heroIds.slice(), heroStates: heroStates,
      currentChapterId: firstSc.chapter.id, currentSceneId: firstSc.scene.id,
      visitedSceneIds: [firstSc.scene.id], choicesTaken: [],
      party: { xp: 0 },          // XP de la session, décorrélée de l'XP du mode Admin
      acquiredItems: {},
      heroOwned: heroOwned,
      levelDone: 1,              // dernier niveau pour lequel les choix ont été faits
      levelGains: {},            // { heroId: { endu, damage, talents:[] } }
    };
    // Initialise les gains (talents de niveau 1 + équipement par défaut) de chaque engagé
    heroIds.forEach(function (hid) { heroGains(ses, hid); });
    sessions.push(ses); save();
    activeSession = ses;
    setupSel = {};
    // Lancement direct de la première scène (plus d'écran « L'Aventure commence »).
    const root = $('#session-root');
    if (root) renderScene(root);
  }

  // Écran d'introduction affiché juste après « Commencer l'aventure » (style scène).
  function renderAdventureIntro(root, ses, adv) {
    const names = (ses.heroIds || []).map(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      return h ? h.name : null;
    }).filter(Boolean);
    let nameList;
    if (names.length <= 1) nameList = names.join('');
    else nameList = names.slice(0, -1).map(esc).join(', ') + ' et ' + esc(names[names.length - 1]);
    const namesHtml = names.length <= 1 ? esc(nameList) : nameList;
    root.innerHTML =
      '<div class="ses-content">' +
        '<div class="ses-scene-card ses-intro-card">' +
          '<h2 class="ses-scene-title">L\'Aventure commence !</h2>' +
          '<div class="ses-scene-blocks">' +
            '<div class="scene-block scene-block-narrative"><strong>' + namesHtml + '</strong> ' +
              (names.length > 1 ? 'ont' : 'a') + ' rejoint le Groupe !</div>' +
            '<div class="scene-block scene-block-narrative">Vous pouvez retrouver leurs Caractéristiques, ' +
              'leurs Talents et leur Inventaire dans les Onglets dédiés. N\'hésitez pas à consulter ' +
              'l\'Index pour plus d\'informations sur le jeu !</div>' +
            '<div class="scene-block scene-block-narrative">Bon courage en Amertüme !</div>' +
          '</div>' +
          '<div class="ses-actions"><button class="primary big" id="ses-intro-go">▶ Commencer</button></div>' +
        '</div>' +
      '</div>';
    const go = document.getElementById('ses-intro-go');
    if (go) go.addEventListener('click', function () { renderScene(root); });
  }

  // Démarre une nouvelle partie (depuis l'onglet Session) même si une partie est active
  function beginNewGame(advId) {
    scopeAdventureId = advId || scopeAdventureId;
    forceSetup = true;
    activeSession = null;
    setupSel = {};
    if (global.Shell && Shell.showPlayTab) Shell.showPlayTab();
    else { const root = $('#session-root'); if (root) renderPlay(scopeAdventureId); }
  }

  // Onglet « Session » (mode Joueur) : sauvegardes de l'aventure courante.
  function renderSaves(advId) {
    scopeAdventureId = advId || scopeAdventureId;
    load();
    const root = $('#saves-root');
    if (!root) return;
    const adv = findAdventure(scopeAdventureId);
    const active = sessions.filter(function (s) {
      return s.adventureId === scopeAdventureId && s.status === 'active';
    });
    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Sauvegardes — ' + esc(adv ? adv.title : '') + '</h2>' +
          '<button class="primary" id="saves-new">+ Nouvelle partie</button>' +
        '</div>' +
        (active.length
          ? active.map(function (s) {
              const date = new Date(s.startedAt).toLocaleDateString('fr-FR');
              const prog = s.visitedSceneIds ? s.visitedSceneIds.length : 0;
              return '<div class="adv-session-row">' +
                '<div><strong>Partie du ' + date + '</strong> ' +
                  '<span class="tag">' + prog + ' scène(s)</span> ' +
                  '<span class="tag">XP : ' + (s.party ? s.party.xp : 0) + '</span></div>' +
                '<div style="display:flex;gap:.4rem;margin-top:.35rem">' +
                  '<button class="primary ses-resume" data-id="' + s.id + '">Reprendre</button>' +
                  '<button class="danger ses-end" data-id="' + s.id + '">Supprimer</button>' +
                '</div>' +
              '</div>';
            }).join('')
          : '<p class="empty">Aucune partie en cours. Lance « Nouvelle partie » pour démarrer.</p>') +
      '</div>';

    document.getElementById('saves-new').onclick = function () { beginNewGame(scopeAdventureId); };
    root.querySelectorAll('.ses-resume').forEach(function (b) {
      b.addEventListener('click', function () {
        activeSession = sessions.find(function (s) { return s.id === b.getAttribute('data-id'); });
        if (global.Shell && Shell.showPlayTab) Shell.showPlayTab();
        else render();
      });
    });
    root.querySelectorAll('.ses-end').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Supprimer cette session ? L\'XP des aventuriers sera remise à 0.')) return;
        const id = b.getAttribute('data-id');
        sessions.forEach(function (s) { if (s.id === id) { s.status = 'ended'; if (s.party) s.party.xp = 0; } });
        if (activeSession && activeSession.id === id) activeSession = null;
        save(); renderSaves(scopeAdventureId);
      });
    });
  }

  // ============ Onglet « Talents » (mode Joueur) ============
  // Catalogue de TOUS les talents par id (génériques + classes)
  function talentsById() {
    const map = {};
    Store.loadGenericTalents().forEach(function (t) { map[t.id] = t; });
    Store.loadClasses().forEach(function (c) { (c.talents || []).forEach(function (t) { map[t.id] = t; }); });
    return map;
  }
  // Ordre d'affichage : MAÎTRISE / ACTION / RÉACTION / PASSIF / CRITIQUE / GARDE / AMÉLIORATION
  const TAL_KIND_ORDER = { mastery: 0, action: 1, reaction: 2, passive: 3, critique: 4, garde: 5, upgrade: 6 };
  const TAL_KIND_TITLE = { mastery: 'Maîtrise', action: 'Action', reaction: 'Réaction', passive: 'Passif', critique: 'Critique', garde: 'Garde', upgrade: 'Amélioration' };
  function talKindOf(t, effMap) {
    if (!t) return '';
    if (t.kind) return t.kind;
    const list = Store.talentEffectList(t);
    if (list.length && effMap[list[0].effect]) return effMap[list[0].effect].kind;
    return '';
  }
  function talRank(k) { return TAL_KIND_ORDER[k] == null ? 9 : TAL_KIND_ORDER[k]; }

  // Talents débloqués d'un aventurier, triés Action→Maîtrise→Réaction→Passif→Amélioration, puis niveau, puis nom
  function sortedUnlocked(g, byId, effMap) {
    // Talents masqués par le MJ (œil) : retirés de la liste vue par l'aventurier.
    const ids = (Array.isArray(g.talents) ? g.talents.slice() : []).filter(function (id) {
      const t = byId[id]; return !(t && t.hidden);
    });
    const idset = {}; ids.forEach(function (id) { idset[id] = true; });
    // Une version est « dépassée » si une version supérieure (prereq = elle) est aussi débloquée.
    const superseded = {};
    ids.forEach(function (id) {
      const t = byId[id];
      if (t && t.prereq && idset[t.prereq]) superseded[t.prereq] = true;
    });
    // Racine et profondeur d'une chaîne de versions (pour regrouper Hameçonnage / Hameçonnage 2…).
    function chain(t) {
      let cur = t, depth = 0, guard = 0;
      while (cur && cur.prereq && byId[cur.prereq] && guard++ < 20) { cur = byId[cur.prereq]; depth++; }
      return { root: (cur && (cur.name || cur.id)) || (t.name || ''), depth: depth };
    }
    return ids.map(function (id) {
      const t = byId[id] || { id: id, name: '(talent supprimé)', level: 1 };
      const ch = chain(t);
      return { id: id, t: t, kind: talKindOf(t, effMap), superseded: !!superseded[id], root: ch.root, depth: ch.depth };
    }).sort(function (a, b) {
      const r = talRank(a.kind) - talRank(b.kind);
      if (r) return r;
      const rr = a.root.localeCompare(b.root); // même chaîne regroupée
      if (rr) return rr;
      if (a.depth !== b.depth) return a.depth - b.depth; // version précédente avant supérieure
      const l = (a.t.level || 1) - (b.t.level || 1);
      if (l) return l;
      return (a.t.name || '').localeCompare(b.t.name || '');
    });
  }

  function findActiveSessionFor(advId) {
    if (activeSession && activeSession.adventureId === advId && activeSession.status === 'active') return activeSession;
    const existing = sessions.filter(function (s) { return s.adventureId === advId && s.status === 'active'; });
    existing.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
    return existing[0] || null;
  }

  function renderTalents(advId) {
    scopeAdventureId = advId || scopeAdventureId;
    load();
    if (activeSession) {
      const m = sessions.find(function (s) { return s.id === activeSession.id; });
      activeSession = m || activeSession;
    }
    const root = $('#talents-root');
    if (!root) return;
    const adv = findAdventure(scopeAdventureId);
    const ses = findActiveSessionFor(scopeAdventureId);
    if (!ses) {
      root.innerHTML = '<div class="card"><div class="card-head"><h2>Talents</h2></div>' +
        '<p class="empty">Commencez ou reprenez une partie pour gérer les talents équipés de vos aventuriers.</p></div>';
      return;
    }
    const byId = talentsById();
    const effMap = Store.talentEffectMap();
    const heroes = engagedHeroes(ses);
    let changed = false;

    const sections = heroes.map(function (h) {
      const g = heroGains(ses, h.id); changed = true; // seed éventuel
      const list = sortedUnlocked(g, byId, effMap);
      // Une version supérieure rend la/les précédente(s) automatiquement déséquipée(s).
      const supIds = list.filter(function (e) { return e.superseded; }).map(function (e) { return e.id; });
      if (supIds.length && Array.isArray(g.equipped)) {
        const before = g.equipped.length;
        g.equipped = g.equipped.filter(function (id) { return supIds.indexOf(id) < 0; });
        if (g.equipped.length !== before) changed = true;
      }
      const equipped = equippedTalents(g);
      // Contexte des balises dynamiques (<ENDU>, <PV>…) pour cet aventurier.
      const eh = effectiveHero(ses, h);
      const lvl = sessionLevel(ses);
      const tagCtx = {
        endu: eh.endu, damage: eh.damage, vie: eh.vie,
        pv: Combatants.heroPv(eh), niveau: lvl,
        orbes: 2 + Math.floor((Math.max(1, lvl) - 1) / 2),
      };
      let prevKind = null;
      const body = list.length
        ? list.map(function (e) {
            const sup = e.superseded;
            const checked = !sup && equipped.indexOf(e.id) >= 0;
            const desc = Store.fillTalentTags(e.t.description || 'Aucune description.', tagCtx);
            // Séparateur de type (Maîtrise / Action / Réaction / …) entre les groupes.
            let sepHtml = '';
            if (e.kind && e.kind !== prevKind) {
              sepHtml = '<div class="tpe-kind-sep tpe-kind-sep-' + e.kind + '">' + esc(TAL_KIND_TITLE[e.kind] || e.kind) + '</div>';
              prevKind = e.kind;
            }
            // Version dépassée : grisée, décochée et non cochable + flèche d'arborescence.
            const upgradeMark = e.depth > 0 ? '<span class="tpe-upgrade-arrow" title="Évolution de la version précédente">↳</span> ' : '';
            return sepHtml + '<div class="tpe-wrap' + (sup ? ' tpe-superseded' : '') + '">' +
              '<div class="tpe-row tpe-kind-' + (e.kind || 'none') + (checked ? ' selected' : '') + '">' +
                '<input type="checkbox" class="tal-equip-cb" data-hero="' + h.id + '" data-tal="' + esc(e.id) + '"' + (checked ? ' checked' : '') + (sup ? ' disabled' : '') + '>' +
                '<span class="tpe-name" data-info="' + esc(e.id) + '" title="' + (sup ? 'Une version supérieure est débloquée' : 'Voir le descriptif') + '">' + upgradeMark + esc(e.t.name || '(sans nom)') + '</span>' +
                '<span class="tpe-meta" data-info="' + esc(e.id) + '">' +
                  (e.kind ? '<span class="tl-kind tl-kind-' + e.kind + '">' + esc(KIND_SHORT(e.kind)) + '</span>' : '') +
                  '<span class="tpe-lvl">Niv. ' + (e.t.level || 1) + '</span>' +
                '</span>' +
              '</div>' +
              '<div class="tpe-desc" id="tpe-desc-' + esc(e.id) + '-' + h.id + '" hidden>' + esc(desc) + '</div>' +
            '</div>';
          }).join('')
        : '<p class="inv-col-empty">Aucun talent débloqué. Montez de niveau pour en gagner.</p>';
      return '<div class="tal-hero-block">' +
        '<div class="tal-hero-head' + (h.klass ? ' klass-' + slug(h.klass) : '') + '">' +
          '<span class="tal-hero-name' + (h.klass ? ' klass-' + slug(h.klass) : '') + '">' + esc(h.name) + '</span>' +
          (h.klass ? '<span class="tal-hero-class klass-' + slug(h.klass) + '">' + esc(h.klass) + '</span>' : '') +
          '<span class="tal-equip-count' + (equipped.length >= 6 ? ' full' : '') + '">' + equipped.length + '/6 équipés</span>' +
        '</div>' +
        '<div class="tal-col-body">' + body + '</div>' +
      '</div>';
    }).join('');

    if (changed) save();

    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Talents — ' + esc(adv ? adv.title : '') + '</h2></div>' +
        '<p class="hint">Coche jusqu\'à <b>6 talents</b> par aventurier : ce sont eux qui apparaissent dans les emplacements du bandeau de combat. ' +
          'Cocher un 7ᵉ talent décoche automatiquement le plus bas de la liste.</p>' +
        (heroes.length ? '<div class="tal-heroes">' + sections + '</div>'
          : '<p class="empty">Aucun aventurier engagé dans cette partie.</p>') +
      '</div>';

    root.querySelectorAll('.tal-equip-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const hid = cb.getAttribute('data-hero');
        const tid = cb.getAttribute('data-tal');
        toggleEquip(ses, hid, tid, cb.checked, byId, effMap);
        save();
        renderTalents(scopeAdventureId);
      });
    });
    // Clic sur le nom/badge : affiche le descriptif (sans cocher/décocher)
    root.querySelectorAll('[data-info]').forEach(function (el) {
      el.addEventListener('click', function () {
        const wrap = el.closest('.tpe-wrap');
        const desc = wrap ? wrap.querySelector('.tpe-desc') : null;
        if (desc) desc.hidden = !desc.hidden;
      });
    });
  }

  // (Dé)équipe un talent. Au-delà de 6, décoche le talent le plus bas de la liste affichée.
  function toggleEquip(ses, hid, tid, checked, byId, effMap) {
    const g = heroGains(ses, hid);
    if (!Array.isArray(g.equipped)) g.equipped = [];
    if (!checked) {
      g.equipped = g.equipped.filter(function (id) { return id !== tid; });
      return;
    }
    if (g.equipped.indexOf(tid) >= 0) return;
    if (g.equipped.length >= 6) {
      // Retire l'équipé le plus bas dans l'ordre d'affichage
      const order = sortedUnlocked(g, byId, effMap).map(function (e) { return e.id; });
      let lowestId = null, lowestIdx = -1;
      g.equipped.forEach(function (id) {
        const idx = order.indexOf(id);
        if (idx > lowestIdx) { lowestIdx = idx; lowestId = id; }
      });
      if (lowestId != null) g.equipped = g.equipped.filter(function (id) { return id !== lowestId; });
    }
    g.equipped.push(tid);
  }

  function playAdventure(advId) {
    scopeAdventureId = advId;
    renderPlay(advId);
  }

  // Quand le joueur crée/ajoute un aventurier pendant la préparation du groupe,
  // on rafraîchit l'écran de setup s'il est affiché.
  window.addEventListener('heroes-changed', function () {
    if (!(global.Shell && Shell.getMode && Shell.getMode() === 'player')) return;
    if (activeSession) return;
    const panel = document.getElementById('tab-session');
    const root = $('#session-root');
    if (root && panel && panel.classList.contains('active')) {
      renderGroupSetup(root, scopeAdventureId);
    }
  });

  function init() { render(); }

  global.Session = {
    init: init,
    render: render,
    renderPlay: renderPlay,
    renderSaves: renderSaves,
    renderTalents: renderTalents,
    playAdventure: playAdventure,
    beginNewGame: beginNewGame,
    startFromAdventure: startFromAdventure,
    activePartyXp: activePartyXp,
    effectiveHero: activeEffectiveHero,
    ownedForHero: ownedForHero,
    engagedHeroIds: engagedHeroIds,
    consumeObject: consumeObject,
    combatModuleActive: combatModuleActive,
  };
  // Le MODULE de combat de la partie active est-il réellement en cours ? (combat
  // démarré et non terminé). Faux sur les pages d'aventure de type Combat — qui
  // n'affichent que la disposition — tant que « Lancer le combat » n'a pas été cliqué.
  function combatModuleActive() {
    if (!activeSession) return false;
    const c = Store.state.combat;
    const sc = Store.state.sessionCombat;
    return !!(c && !c.finished && !c.outcome && sc && sc.sessionId === activeSession.id);
  }
  // Consomme (retire) 1 exemplaire d'un objet de l'inventaire d'un aventurier de la
  // partie active. Si l'aventurier n'en possède plus, l'objet est déséquipé.
  // Ajoute `q` exemplaires d'un objet à l'inventaire d'un aventurier, en plafonnant
  // les ARMES à 2 exemplaires (un 3e n'est ni affiché ni accordé). Retourne le nb réellement ajouté.
  function addToHeroOwned(ses, hid, itemId, q) {
    if (!ses.heroOwned) ses.heroOwned = {};
    if (!ses.heroOwned[hid]) ses.heroOwned[hid] = {};
    const it = Store.state.items.find(function (x) { return x.id === itemId; });
    const cur = Number(ses.heroOwned[hid][itemId]) || 0;
    let target = cur + q;
    if (it && it.category === 'weapon') target = Math.min(2, target); // max 2 armes identiques
    ses.heroOwned[hid][itemId] = target;
    return target - cur;
  }
  function consumeObject(heroId, itemId) {
    // NE PAS recharger (load() remplacerait `sessions` et détacherait activeSession,
    // faisant perdre la mutation au save()). On mute la session vivante.
    const ses = activeSession || sessions.find(function (s) { return s.status === 'active'; });
    if (!ses) return; // hors session (combat de test) : rien à retirer
    if (!ses.heroOwned) ses.heroOwned = {};
    const owned = ses.heroOwned[heroId] || (ses.heroOwned[heroId] = {});
    const left = (Number(owned[itemId]) || 0) - 1;
    if (left > 0) owned[itemId] = left; else delete owned[itemId];
    // Déséquipe l'objet si l'aventurier n'en a plus.
    if (left <= 0) {
      const h = Store.state.heroes.find(function (x) { return x.id === heroId; });
      if (h && h.equipment && h.equipment.objectId === itemId) { h.equipment.objectId = null; Store.save(); }
    }
    save();
  }
  // Ids des aventuriers engagés dans la partie active (null si aucune partie lancée)
  function engagedHeroIds() {
    return (activeSession && Array.isArray(activeSession.heroIds)) ? activeSession.heroIds.slice() : null;
  }
})(window);
