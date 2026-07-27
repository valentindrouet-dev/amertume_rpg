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

  function slug(k) { return (k || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
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
  // ---- Sauvegarde COURANTE (persistée) ----
  // La partie sur laquelle on joue est mémorisée hors mémoire vive : un
  // rafraîchissement ou un changement d'onglet reprend EXACTEMENT la même
  // sauvegarde, même si plusieurs parties de la même aventure sont ouvertes.
  const CUR_KEY = 'amertume_current_session_v1';
  function curId() { try { return localStorage.getItem(CUR_KEY) || null; } catch (e) { return null; } }
  function setCurId(id) {
    try { if (id) localStorage.setItem(CUR_KEY, id); else localStorage.removeItem(CUR_KEY); } catch (e) {}
  }
  // Toute désignation de la partie en cours passe par ici (mémoire + persistance).
  function setActive(s) { activeSession = s || null; setCurId(activeSession ? activeSession.id : null); }
  // Partie en cours pour une aventure : d'abord celle explicitement choisie,
  // puis celle en mémoire, et seulement en dernier recours la plus récente.
  function sessionForAdv(advId) {
    const okAdv = function (s) { return s && s.status === 'active' && (!advId || s.adventureId === advId); };
    const id = curId();
    if (id) {
      const byCur = sessions.find(function (s) { return s.id === id && okAdv(s); });
      if (byCur) return byCur;
    }
    if (okAdv(activeSession)) {
      const live = sessions.find(function (s) { return s.id === activeSession.id; });
      if (live && okAdv(live)) return live;
    }
    const list = sessions.filter(okAdv);
    list.sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); });
    return list[0] || null;
  }
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

  // ---------- Donjons (chapitres structurés & aléatoires) ----------
  function chapterMode(ch) { return (ch && (ch.mode === 'dungeon' || ch.mode === 'random')) ? ch.mode : 'linear'; }
  // Salle d'entrée d'un donjon structuré (ch.entryId, sinon la 1re salle).
  function dungeonEntryScene(ch) {
    if (!ch || !ch.scenes.length) return null;
    return ch.scenes.find(function (s) { return s.id === ch.entryId; }) || ch.scenes[0];
  }
  // Ordre d'un donjon aléatoire : Entrée(s) → salles mélangées (Fisher-Yates) → Sortie(s).
  function buildRandomOrder(ch) {
    const entries = [], exits = [], mids = [];
    (ch.scenes || []).forEach(function (s) {
      if (s.isTransition) return; // scènes d'événement de passage : jamais des salles
      const role = s.roomRole || 'normal';
      (role === 'entry' ? entries : role === 'exit' ? exits : mids).push(s.id);
    });
    if (!entries.length && mids.length) entries.push(mids.shift()); // à défaut de balise, la 1re salle sert d'entrée
    for (let i = mids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = mids[i]; mids[i] = mids[j]; mids[j] = t;
    }
    return entries.concat(mids, exits);
  }
  // Ordre tiré au sort pour CETTE partie (généré à l'entrée du chapitre, puis
  // stable jusqu'à la fin de la session — une nouvelle partie retire au sort).
  function ensureRandomOrder(ses, adv, ch) {
    if (!ses.randomOrders) ses.randomOrders = {};
    let order = ses.randomOrders[ch.id];
    if (Array.isArray(order) && order.length) {
      // Purge les salles supprimées par le MJ depuis la génération.
      const filtered = order.filter(function (id) { return ch.scenes.some(function (s) { return s.id === id; }); });
      if (filtered.length) { ses.randomOrders[ch.id] = filtered; return filtered; }
    }
    order = buildRandomOrder(ch);
    ses.randomOrders[ch.id] = order;
    // Événements de passage (donjon aléatoire) : chacun est affecté à UNE
    // transition entre deux salles, tirée au hasard pour cette partie.
    const evs = (Array.isArray(ch.transitionEvents) ? ch.transitionEvents : []).filter(function (e) {
      return e && ch.scenes.some(function (s) { return s.id === e.sceneId; });
    });
    if (evs.length && order.length > 1) {
      const gaps = [];
      for (let g = 0; g < order.length - 1; g++) gaps.push(g);
      for (let i = gaps.length - 1; i > 0; i--) { // mélange des transitions disponibles
        const j = Math.floor(Math.random() * (i + 1));
        const t = gaps[i]; gaps[i] = gaps[j]; gaps[j] = t;
      }
      if (!ses.randomEvents) ses.randomEvents = {};
      const assign = {};
      evs.forEach(function (e, k) { if (k < gaps.length) assign[gaps[k]] = e.sceneId; });
      ses.randomEvents[ch.id] = assign;
    }
    save();
    return order;
  }
  // Première scène du chapitre suivant (sortie de donjon) — null si dernier chapitre.
  function nextChapterEntryId(adv, chapter) {
    const idx = adv.chapters.indexOf(chapter);
    for (let i = idx + 1; i < adv.chapters.length; i++) {
      if (adv.chapters[i].scenes.length) return adv.chapters[i].scenes[0].id;
    }
    return null;
  }
  // À l'ENTRÉE dans un chapitre spécial, corrige la scène d'arrivée : donjon
  // structuré → salle d'entrée ; donjon aléatoire → 1re salle de l'ordre tiré.
  function chapterEntryTarget(ses, adv, chapter, sceneId) {
    const mode = chapterMode(chapter);
    if (mode === 'dungeon') {
      const e = dungeonEntryScene(chapter);
      return e ? e.id : sceneId;
    }
    if (mode === 'random') {
      const order = ensureRandomOrder(ses, adv, chapter);
      return order.length ? order[0] : sceneId;
    }
    return sceneId;
  }
  // À la création d'une session : si le 1er chapitre est un donjon, on démarre
  // sur sa véritable entrée (et non mécaniquement sur la 1re scène de la liste).
  function initChapterEntry(ses, adv) {
    const found = findScene(adv, ses.currentSceneId);
    if (!found) return;
    const target = chapterEntryTarget(ses, adv, found.chapter, ses.currentSceneId);
    if (target !== ses.currentSceneId) {
      ses.currentSceneId = target;
      ses.visitedSceneIds = [target];
    }
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
        activeSession = sessionForAdv(advId) || existing[0];
        setCurId(activeSession.id);
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
    initChapterEntry(ses, adv);  // 1er chapitre en donjon : démarre sur l'entrée / l'ordre tiré
    save();
    setActive(ses);
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
      save(); setActive(null); modal.setAttribute('hidden', '');
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
      if (match) setActive(match);
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
        setActive(sessions.find(function (s) { return s.id === b.getAttribute('data-id'); }));
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

  // ---- « Recharger la Salle » (outil MJ, absent de la version partagée) ----
  // Photographie COMPLÈTE de l'état à l'ENTRÉE de la salle : session entière
  // (XP, or, butin, hauts faits, tests, combats nettoyés, rencontres…) + les
  // fiches des aventuriers engagés (PV, VIE…). Restaurée telle quelle au clic.
  function captureRoomSnapshot(ses) {
    try {
      const clone = JSON.parse(JSON.stringify(ses));
      delete clone.roomSnapshot; delete clone.roomSnapshotScene;
      const heroes = (ses.heroIds || []).map(function (id) {
        return Store.state.heroes.find(function (h) { return h.id === id; });
      }).filter(Boolean);
      ses.roomSnapshot = JSON.stringify({ session: clone, heroes: JSON.parse(JSON.stringify(heroes)) });
      ses.roomSnapshotScene = ses.currentSceneId;
      save();
    } catch (e) { console.error('[session] snapshot de salle', e); }
  }
  // Capture au premier rendu de chaque salle (avant toute interaction) ; les
  // re-rendus de la même salle conservent la photo d'entrée.
  function ensureRoomSnapshot(ses) {
    if (!ses || !ses.currentSceneId) return;
    if (ses.roomSnapshotScene === ses.currentSceneId && ses.roomSnapshot) return;
    captureRoomSnapshot(ses);
  }
  function reloadRoom() {
    const ses = activeSession;
    if (!ses || !ses.roomSnapshot) return;
    let snap;
    try { snap = JSON.parse(ses.roomSnapshot); } catch (e) { return; }
    if (!snap || !snap.session) return;
    const keepSnap = ses.roomSnapshot, keepScene = ses.roomSnapshotScene;
    const restored = snap.session;
    restored.roomSnapshot = keepSnap;
    restored.roomSnapshotScene = keepScene;
    const idx = sessions.findIndex(function (s) { return s.id === ses.id; });
    if (idx >= 0) sessions[idx] = restored;
    setActive(restored);
    // Fiches des aventuriers (PV, VIE, équipement…) restaurées à l'entrée de salle.
    (snap.heroes || []).forEach(function (h) {
      const i = Store.state.heroes.findIndex(function (x) { return x.id === h.id; });
      if (i >= 0) Store.state.heroes[i] = h;
    });
    // Combat de session en cours pour cette partie : annulé (il sera relancé
    // par la salle rechargée s'il y a lieu).
    if (Store.state.sessionCombat && Store.state.sessionCombat.sessionId === restored.id) {
      Store.state.combat = null;
      Store.state.sessionCombat = null;
    }
    // PURGE TOTALE de l'état lié à cette scène, VISITES PRÉCÉDENTES INCLUSES :
    // la salle se rejoue comme à la toute première entrée (tests, chaînes,
    // combat nettoyé, récompenses réclamées, hauts faits, rencontres…).
    const adv = findAdventure(restored.adventureId);
    const found = adv ? findScene(adv, restored.currentSceneId) : null;
    if (found) purgeSceneState(restored, found.scene);
    Store.save(); save();
    // La photo d'entrée est reprise sur cet état purgé : un second rechargement
    // redonne exactement le même résultat.
    captureRoomSnapshot(restored);
    if (global.App) App.renderForTab('session');
  }
  // Efface TOUT ce que la session a mémorisé à propos d'une scène donnée.
  function purgeSceneState(ses, scene) {
    if (!ses || !scene) return;
    if (ses.clearedScenes) delete ses.clearedScenes[scene.id];
    if (ses.claimedRewards) delete ses.claimedRewards[scene.id];
    if (ses.usedRandomEncounters) delete ses.usedRandomEncounters[scene.id];
    if (ses.rewardRolls) delete ses.rewardRolls[scene.id];
    if (ses.forcedCombat && ses.forcedCombat.sceneId === scene.id) delete ses.forcedCombat;
    if (ses.blockCombat && ses.blockCombat.sceneId === scene.id) delete ses.blockCombat;
    if (Array.isArray(ses.deeds)) {
      ses.deeds = ses.deeds.filter(function (d) { return d.sceneId !== scene.id; });
    }
    (scene.blocks || []).forEach(function (b) {
      if (ses.searchTests) delete ses.searchTests[b.id];
      if (ses.randomTestPick) delete ses.randomTestPick[b.id];
      if (ses.playerTestPick) delete ses.playerTestPick[b.id];
      if (ses.rewardRolls) delete ses.rewardRolls[b.id];
      if (ses.groupSkillPick) delete ses.groupSkillPick[b.id];
      // Désignations « meilleur aventurier » (clés bloc|compétence)
      if (ses.bestTestPick) {
        Object.keys(ses.bestTestPick).forEach(function (k) {
          if (k.indexOf(b.id + '|') === 0) delete ses.bestTestPick[k];
        });
      }
    });
  }
  // Le bouton n'existe que côté MJ : jamais dans la version partagée (#pub=…).
  function isMJ() {
    return !(global.Shell && Shell.isPublished && Shell.isPublished());
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

    // Photo d'entrée de salle pour « 🔄 Salle » (avant toute mutation : le haut
    // fait de la scène, enregistré juste dessous, sera lui aussi annulable).
    ensureRoomSnapshot(ses);

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

    // Progression dans les donjons : « Salle x/N » (aléatoire) ou salles visitées (structuré).
    const chMode_ = chapterMode(chapter);
    let roomTag = '';
    if (chMode_ === 'random') {
      const order = ensureRandomOrder(ses, adv, chapter);
      const ri = order.indexOf(scene.id);
      if (ri >= 0) roomTag = '<span class="tag ses-room-tag">Salle ' + (ri + 1) + '/' + order.length + '</span>';
    } else if (chMode_ === 'dungeon') {
      const roomsOnly = chapter.scenes.filter(function (s) { return !s.isTransition; });
      const nVisited = roomsOnly.filter(function (s) { return (ses.visitedSceneIds || []).indexOf(s.id) >= 0; }).length;
      roomTag = '<span class="tag ses-room-tag">🗺️ ' + nVisited + '/' + roomsOnly.length + ' salles</span>';
    }

    root.innerHTML =
      '<div class="ses-bar">' +
        '<div class="ses-bar-left">' +
          '<span class="ses-adv-title">' + esc(adv.title) + '</span>' +
          (chapter.title ? ' <span class="ses-ch-title">— ' + esc(chapter.title) + '</span>' : '') +
        '</div>' +
        '<div class="ses-bar-right">' +
          roomTag +
          '<span class="tag">XP : ' + ses.party.xp + '</span>' +
          (isMJ()
            ? '<button id="ses-reload-room" class="ghost small ses-mj-btn" title="MJ : réinitialise ENTIÈREMENT cette salle — tests, combats, butin, XP, PV, hauts faits reviennent à l\'état d\'entrée">🔄 Salle</button>'
            : '') +
          '<button id="ses-quit" class="ghost small">✕ Quitter</button>' +
        '</div>' +
      '</div>' +
      '<div class="ses-content">' +
        '<div class="ses-scene-card">' +
          (scene.title ? '<h2 class="ses-scene-title">' + esc(scene.title) + '</h2>' : '') +
          sceneContentHtml(scene, ses) +
          '<div id="ses-actions" class="ses-actions"></div>' +
        '</div>' +
        '<div class="ses-side">' +
          '<div class="ses-heroes">' +
            '<h3>Aventuriers</h3>' +
            renderHeroesState(heroes, ses) +
            xpProgressHtml(ses) +
          '</div>' +
          '<div class="ses-deeds">' +
            '<h3>Hauts Faits</h3>' +
            deedsHtml(ses) +
          '</div>' +
          // Mini-carte du donjon structuré : clic → carte entière en fenêtre flottante.
          (chMode_ === 'dungeon'
            ? '<div class="ses-minimap-box"><h3>Carte du donjon</h3>' +
                '<div id="ses-minimap" class="ses-minimap" title="Cliquer pour agrandir la carte">' +
                  dungeonMapHtml(chapter, ses, { cw: 58, ch: 44, bw: 48, bh: 32, pad: 8, titles: false }) +
                '</div>' +
                '<p class="hint ses-minimap-hint">Cliquer pour agrandir</p>' +
              '</div>'
            : '') +
        '</div>' +
      '</div>';

    const reloadBtn = $('#ses-reload-room');
    if (reloadBtn) reloadBtn.addEventListener('click', function () {
      if (confirm('Recharger la salle ?\n\nTout ce qui s\'est passé dans CETTE salle est annulé : tests, combats, butin, XP, PV, hauts faits reviennent à l\'état d\'entrée.')) reloadRoom();
    });
    $('#ses-quit').addEventListener('click', function () {
      setActive(null);
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

    // Blocs de test interactifs, insérés dans le fil du texte de la scène.
    wireTestBlocks(scene, adv, ses);

    // Mini-carte cliquable (donjon structuré).
    const mmap = document.getElementById('ses-minimap');
    if (mmap) mmap.addEventListener('click', function () { openDungeonMapModal(chapter, ses); });

    renderSceneActions(scene, adv, ses, chapter);
    // Animation de révélation des blocs débloqués par le dernier jet.
    applyRevealAnimations();
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
    if (!deeds.length) return '<p class="empty">Aucun Haut Fait pour l\'instant.</p>';
    return '<ul class="deeds-list">' +
      deeds.map(function (d) { return '<li>' + esc(d.text) + '</li>'; }).join('') +
    '</ul>';
  }

  // ---------- Carte du donjon structuré (mini-carte + vue plein écran) ----------
  // Reprend la structure de l'éditeur : salles positionnées sur la grille
  // (mapX/mapY), connecteurs en SVG. Les salles non visitées sont « ??? »,
  // la salle courante est mise en évidence.
  function dungeonMapHtml(chapter, ses, opts) {
    const CW = opts.cw, CH = opts.ch, BW = opts.bw, BH = opts.bh, PAD = opts.pad;
    // Positions : celles de l'éditeur, avec repli automatique pour les salles
    // sans coordonnées (sans rien persister côté joueur).
    const pos = {}; const used = {}; let cursor = 0;
    (chapter.scenes || []).forEach(function (s) {
      if (typeof s.mapX === 'number' && typeof s.mapY === 'number' && s.mapX >= 0 && !used[s.mapX + ',' + s.mapY]) {
        pos[s.id] = [s.mapX, s.mapY]; used[s.mapX + ',' + s.mapY] = true;
      }
    });
    (chapter.scenes || []).forEach(function (s) {
      if (pos[s.id]) return;
      while (used[(cursor % 4) + ',' + Math.floor(cursor / 4)]) cursor++;
      pos[s.id] = [cursor % 4, Math.floor(cursor / 4)];
      used[pos[s.id][0] + ',' + pos[s.id][1]] = true;
    });
    const visited = function (id) { return (ses.visitedSceneIds || []).indexOf(id) >= 0; };
    // Seules les salles DÉJÀ EXPLORÉES apparaissent sur la carte des joueurs —
    // les salles à venir restent totalement invisibles (pas de spoiler). Les
    // scènes d'événement de passage ne sont jamais des salles.
    const shown = (chapter.scenes || []).filter(function (s) { return !s.isTransition && visited(s.id); });
    const maxX = shown.reduce(function (m, s) { return Math.max(m, pos[s.id][0]); }, 0);
    const maxY = shown.reduce(function (m, s) { return Math.max(m, pos[s.id][1]); }, 0);
    const STUB = Math.min(CW, CH) * 0.5; // longueur d'un moignon de connecteur vers l'inconnu
    const W = (maxX + 1) * CW + BW / 3 + PAD * 2 + STUB, H = (maxY + 1) * CH + PAD + STUB;
    const cx = function (id) { return pos[id][0] * CW + PAD + BW / 2; };
    const cy = function (id) { return pos[id][1] * CH + PAD + BH / 2; };
    const revealed = function (l) {
      if (!l.revealTestId) return true;
      const st = ses.searchTests && ses.searchTests[l.revealTestId];
      return !!(st && st.success);
    };
    // Connecteurs pleins : entre deux salles explorées (passage secret non révélé exclu).
    const lines = (chapter.links || []).map(function (l) {
      if (!pos[l.from] || !pos[l.to] || !visited(l.from) || !visited(l.to)) return '';
      if (!revealed(l)) return '';
      return '<line x1="' + cx(l.from) + '" y1="' + cy(l.from) + '" x2="' + cx(l.to) + '" y2="' + cy(l.to) + '" class="mmap-line"></line>';
    }).join('');
    // Moignons : un connecteur d'une salle EXPLORÉE vers une salle ACCESSIBLE mais
    // pas encore découverte — on montre juste la direction (pas la salle cible).
    const stubs = (chapter.links || []).map(function (l) {
      if (!pos[l.from] || !pos[l.to] || !revealed(l)) return '';
      const fromVis = visited(l.from), toVis = visited(l.to);
      if (fromVis === toVis) return ''; // 0 ou 2 explorées → pas un moignon
      const src = fromVis ? l.from : l.to, dst = fromVis ? l.to : l.from;
      const dx = pos[dst][0] - pos[src][0], dy = pos[dst][1] - pos[src][1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const x1 = cx(src), y1 = cy(src);
      const x2 = x1 + (dx / len) * STUB, y2 = y1 + (dy / len) * STUB;
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="mmap-line mmap-line-stub"></line>';
    }).join('');
    const rooms = shown.map(function (s) {
      const isCur = ses.currentSceneId === s.id;
      const isEntry = chapter.entryId === s.id;
      const title = s.title || 'Salle';
      return '<div class="mmap-room' + (isCur ? ' mmap-current' : '') + '" data-scene="' + esc(s.id) + '"' +
        ' style="left:' + (pos[s.id][0] * CW + PAD) + 'px;top:' + (pos[s.id][1] * CH + PAD) + 'px;width:' + BW + 'px;height:' + BH + 'px"' +
        ' title="' + esc(title) + '">' +
        (opts.titles ? '<span class="mmap-room-title">' + (isEntry ? '🚪 ' : '') + esc(title) + '</span>' : (isEntry ? '🚪' : '')) +
      '</div>';
    }).join('');
    return '<div class="mmap-canvas" style="width:' + W + 'px;height:' + H + 'px">' +
      '<svg class="mmap-svg" width="' + W + '" height="' + H + '">' + stubs + lines + '</svg>' + rooms + '</div>';
  }

  // Fenêtre flottante avec la carte entière du donjon.
  function openDungeonMapModal(chapter, ses) {
    let m = document.getElementById('dmap-view-modal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'dmap-view-modal';
      m.className = 'modal';
      document.body.appendChild(m);
    }
    m.innerHTML = '<div class="modal-box" style="max-width:920px">' +
      '<div class="modal-head"><h2>🗺️ ' + esc(chapter.title || 'Carte du donjon') + '</h2>' +
        '<button type="button" id="dmap-view-close" class="icon-btn">✕</button></div>' +
      '<div class="dmap-view-scroll">' +
        dungeonMapHtml(chapter, ses, { cw: 168, ch: 116, bw: 148, bh: 92, pad: 12, titles: true }) +
      '</div>' +
      '<p class="hint">🚪 entrée du donjon · salle encadrée = position actuelle · seules les salles déjà explorées apparaissent.</p>' +
    '</div>';
    m.hidden = false;
    document.getElementById('dmap-view-close').onclick = function () { m.hidden = true; };
    m.onclick = function (ev) { if (ev.target === m) m.hidden = true; };
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
  // Blocs à rendre pour une scène : ses blocs ordonnés, plus — pour la
  // compatibilité — un bloc de test synthétique issu d'un ancien `searchTest`
  // (v2.3.04) tant qu'il n'a pas été migré en bloc par l'éditeur.
  function sceneRenderBlocks(scene) {
    var blocks = Array.isArray(scene.blocks) ? scene.blocks.slice() : [];
    if (scene.searchTest && scene.searchTest.enabled &&
        !blocks.some(function (b) { return b.type === 'test' && b._fromSearch; })) {
      var st = scene.searchTest;
      blocks.push({ id: scene.id, type: 'test', _fromSearch: true, label: st.label, skill: st.skill,
        difficulty: st.difficulty, successText: st.successText, failText: st.failText, xpReward: st.xpReward,
        itemRewards: st.itemRewards || [], deedReward: st.deedReward || '', prepareReward: !!st.prepareReward, winEffect: st.winEffect || null, goldReward: st.goldReward || 0, treasureRewards: st.treasureRewards || [], groupMode: st.groupMode || 'majority', targetSceneId: st.targetSceneId || null, reqSkill: '', reqVal: 0 });
    }
    return blocks;
  }
  // Un bloc conditionnel n'apparaît que si un aventurier engagé possède la
  // compétence requise à la valeur minimale (au démarrage de la scène).
  function blockVisible(block, ses) {
    if (!block || !block.reqSkill) return true;
    var need = block.reqVal || 0;
    return engagedHeroes(ses).some(function (h) {
      var eh = effectiveHero(ses, h);
      return ((eh.skills && eh.skills[block.reqSkill]) || 0) >= need;
    });
  }
  // Blocs révélés par un bloc parent, pour une issue donnée ('success' | 'fail').
  // Nouveau format : chainSuccessIds[] / chainFailIds[] (plusieurs blocs).
  // Ancien format mono-bloc (chainSuccessId / chainFailId) toujours accepté.
  function chainIdsOf(blk, which) {
    if (!blk) return [];
    const arr = which === 'success' ? blk.chainSuccessIds : blk.chainFailIds;
    if (Array.isArray(arr)) return arr.filter(Boolean);
    const one = which === 'success' ? blk.chainSuccessId : blk.chainFailId;
    return one ? [one] : [];
  }
  // Tests ENCHAÎNÉS : un bloc de test référencé par un autre (chainSuccessId /
  // chainFailId) reste masqué tant que le test parent n'a pas produit le
  // résultat déclencheur (ex. rater l'Agilité révèle un test de Force).
  // Un bloc (de N'IMPORTE QUEL type) coché dans un « Bloc révélé si … » reste
  // masqué tant que l'issue correspondante n'est pas survenue.
  function testChainHidden(scene, blk, ses) {
    if (!blk) return false;
    // Un test déjà tenté (résultat enregistré) reste TOUJOURS visible : sinon,
    // valider rétroactivement le parent le ferait disparaître avec ses jets.
    var self = ses && ses.searchTests ? ses.searchTests[blk.id] : null;
    if (self && self.done) return false;
    var blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    var isChained = false, triggered = false;
    blocks.forEach(function (p) {
      if ((p.type !== 'test' && p.type !== 'fight') || p.id === blk.id) return;
      var st = ses && ses.searchTests ? ses.searchTests[p.id] : null;
      if (chainIdsOf(p, 'success').indexOf(blk.id) >= 0) { isChained = true; if (st && st.done && st.success) triggered = true; }
      if (chainIdsOf(p, 'fail').indexOf(blk.id) >= 0) { isChained = true; if (st && st.done && !st.success) triggered = true; }
    });
    return isChained && !triggered;
  }
  // Bloc de COMBAT révélé mais pas encore mené : la salle est en pause — on ne
  // peut ni emprunter une sortie ni jouer les autres tests / actions.
  function fightBlockPending(scene, ses) {
    if (!scene || !ses) return false;
    return (scene.blocks || []).some(function (b) {
      if (b.type !== 'fight') return false;
      if (!blockVisible(b, ses)) return false;
      if (testChainHidden(scene, b, ses)) return false;
      const st = ses.searchTests ? ses.searchTests[b.id] : null;
      return !(st && st.done);
    });
  }
  function sceneContentHtml(scene, ses) {
    var parts = [];
    // Champ hérité : affiché comme narratif si non vide
    if (scene.text && scene.text.trim()) {
      parts.push('<div class="scene-block scene-block-narrative">' + fmtSceneText(scene.text) + '</div>');
    }
    // Blocs ordonnés (texte + test), filtrés par leur condition de compétence.
    const combatCleared = !!(ses && ses.clearedScenes && ses.clearedScenes[scene.id]);
    sceneRenderBlocks(scene).forEach(function (blk) {
      if (ses && !blockVisible(blk, ses)) return;
      // Bloc « Combat » : visible uniquement AVANT le combat de la scène —
      // masqué une fois les adversaires vaincus (ou s'il n'y a pas de combat).
      if (blk.type === 'combat' && (combatCleared || !sceneHasCombat(scene))) return;
      if (blk.type === 'test' || blk.type === 'fight') {
        // Bloc enchaîné non encore révélé par son bloc parent : masqué.
        if (ses && testChainHidden(scene, blk, ses)) return;
        // Emplacement rempli après le rendu par wireTestBlocks (contenu interactif).
        // Test découlant d'un test préalable : léger décalage à droite + flèche.
        var chainedFrom = chainParentOf(scene, blk);
        parts.push('<div class="ses-test-slot' + (chainedFrom ? ' ses-test-chained' : '') + '" data-tb="' + esc(blk.id) + '"></div>');
      } else {
        // Bloc de texte révélé par une chaîne : masqué tant qu'elle ne s'est pas déclenchée.
        if (ses && testChainHidden(scene, blk, ses)) return;
        parts.push('<div class="scene-block scene-block-' + (blk.type || 'narrative') + '" data-tb="' + esc(blk.id || '') + '">' +
          fmtSceneText(blk.content || '') + '</div>');
      }
    });
    return parts.length ? '<div class="ses-scene-blocks">' + parts.join('') + '</div>' : '';
  }
  // Après insertion du HTML : remplit chaque emplacement de test avec son UI
  // (bouton ou résultat), en respectant l'ordre dans le texte de la scène.
  function wireTestBlocks(scene, adv, ses) {
    sceneRenderBlocks(scene).forEach(function (blk) {
      const isFight = blk.type === 'fight';
      if ((blk.type !== 'test' && !isFight) || (ses && !blockVisible(blk, ses))) return;
      if (ses && testChainHidden(scene, blk, ses)) return;
      const slot = document.querySelector('.ses-test-slot[data-tb="' + (window.CSS && CSS.escape ? CSS.escape(blk.id) : blk.id) + '"]');
      if (!slot) return;
      if (isFight) renderFightBlock(slot, blk, scene, adv, ses);
      else renderTestBlock(slot, blk, scene, adv, ses);
    });
    // Combat révélé et pas encore mené : les autres tests / actions de la salle
    // sont gelés jusqu'à son issue.
    if (ses && fightBlockPending(scene, ses)) {
      const fightIds = (scene.blocks || []).filter(function (b) { return b.type === 'fight'; })
        .map(function (b) { return b.id; });
      document.querySelectorAll('.ses-test-slot').forEach(function (slot) {
        if (fightIds.indexOf(slot.getAttribute('data-tb')) >= 0) return;
        slot.classList.add('ses-slot-frozen');
        slot.querySelectorAll('button, select, input, textarea').forEach(function (el) {
          el.disabled = true;
          el.title = 'Un combat est engagé dans cette salle — menez-le d\'abord.';
        });
      });
    }
  }

  function typeLabel(t) {
    const map = { description: 'Description', exploration: 'Exploration', interaction: 'Interaction', combat: 'Combat', reward: 'Récompense',
      danger: 'Danger', repos: 'Repos', commerce: 'Commerce', boss: 'Boss', temps: 'Temps', vide: 'Vide', fin: 'Fin' };
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
      // Aventurier mort (conséquence de scène) : affiché grisé avec ☠.
      if (state.dead) {
        return '<div class="ses-hero-row ses-hero-dead">' +
          '<span class="ses-hero-name' + (h.klass ? ' klass-' + slug(h.klass) : '') + '" data-hero="' + h.id + '" title="Voir la fiche">☠ ' + esc(h.name) + '</span>' +
          '<span class="tag dead">' + heroAgree(h, 'Mort') + '</span>' +
        '</div>';
      }
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
  // Un combat IMPOSÉ par l'issue d'un test est en attente pour cette scène :
  // tant qu'il n'est pas remporté, la scène est verrouillée (pas de sorties).
  function forcedCombatPending(ses, scene) {
    return !!(scene && ses.forcedCombat && ses.forcedCombat.sceneId === scene.id
      && Array.isArray(ses.forcedCombat.zones)
      && ses.forcedCombat.zones.some(function (z) { return (z.monsterRefs || []).some(function (r) { return r.monsterId; }); }));
  }
  // Un test OBLIGATOIRE de la scène n'a pas encore été tenté : la scène est
  // verrouillée (aucune sortie / suite) tant qu'il n'est pas résolu. Les tests
  // enchaînés non révélés et les blocs dont la condition de compétence n'est pas
  // remplie sont ignorés. Un test obligatoire qui déclenche un combat en cas
  // d'échec reste ensuite verrouillé via forcedCombatPending.
  // Un test obligatoire NARRATIF interrompt l'histoire : il bloque TOUTE sortie,
  // demi-tour compris.
  function narrativeTestPending(scene, ses) {
    if (!scene || !ses) return false;
    const blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    return blocks.some(function (blk) {
      if (blk.type !== 'test' || !blk.mandatory || !blk.mandatoryNarrative) return false;
      if (!blockVisible(blk, ses)) return false;
      if (testChainHidden(scene, blk, ses)) return false;
      const st = ses.searchTests && ses.searchTests[blk.id];
      return !(st && st.done);
    });
  }
  function mandatoryTestPending(scene, ses) {
    if (!scene || !ses) return false;
    const blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    return blocks.some(function (blk) {
      if (blk.type !== 'test' || !blk.mandatory) return false;
      if (!blockVisible(blk, ses)) return false;          // condition de compétence non remplie
      if (testChainHidden(scene, blk, ses)) return false; // test enchaîné non encore révélé
      const st = ses.searchTests && ses.searchTests[blk.id];
      return !(st && st.done);                            // pas encore tenté → verrou
    });
  }
  // Déclenche un combat imposé (issue de test) : mémorisé sur la session pour être
  // affiché et lancé, non contournable.
  function triggerForcedCombat(ses, sceneId, cfg) {
    const zones = cfg && Array.isArray(cfg.combatZones) ? cfg.combatZones : null;
    if (!sceneId || !zones || !zones.some(function (z) { return (z.monsterRefs || []).some(function (r) { return r.monsterId; }); })) return false;
    // Déjà armé pour cette scène (appels multiples d'un test de groupe) : on conserve.
    if (ses.forcedCombat && ses.forcedCombat.sceneId === sceneId) return true;
    ses.forcedCombat = { sceneId: sceneId, zones: zones, barriers: (cfg.barriers || {}), failedHeroIds: [] };
    save();
    return true;
  }
  // Une scène donne une récompense si elle accorde de l'XP ou au moins un objet
  function sceneHasReward(scene) {
    return (scene.xpReward && scene.xpReward > 0) || !!scene.prepareReward ||
      (scene.winEffect && scene.winEffect.kind && scene.winEffect.kind !== 'none') ||
      hasTreasureReward(scene) ||
      (Array.isArray(scene.itemRewards) && scene.itemRewards.some(function (r) { return r.itemId; }));
  }
  // ---- Or, Trésors et Objets Rares (butin de groupe, partagé) ----
  function ensureLoot(ses) {
    if (typeof ses.gold !== 'number') ses.gold = 0;
    if (!Array.isArray(ses.treasures)) ses.treasures = [];
  }
  // Ajoute un trésor nommé (kind: 'treasure' | 'rare') — cumul par nom+type.
  function addTreasure(ses, name, qty, kind) {
    ensureLoot(ses);
    const k = kind === 'rare' ? 'rare' : 'treasure';
    const ex = ses.treasures.find(function (t) { return t.name === name && t.kind === k; });
    if (ex) ex.qty = (ex.qty || 1) + qty;
    else ses.treasures.push({ id: Store.uid(), name: name, qty: qty, kind: k });
  }
  // Tire UNE SEULE FOIS les récompenses en dés d'une source (scène ou bloc), et
  // met le résultat en cache sur la session (clé = id de la source). Ainsi les
  // aventuriers voient la valeur RÉELLE (« 11 Or ») — pas la variable (« 3d12 ») —
  // et l'affichage coïncide avec ce qui est effectivement remis.
  function rewardRoll(ses, sourceId, o) {
    if (!ses.rewardRolls) ses.rewardRolls = {};
    if (ses.rewardRolls[sourceId]) return ses.rewardRolls[sourceId];
    const amt = function (v, min) { return Math.max(min, Math.round(Store.rollAmount(v == null ? min : v))); };
    const res = { gold: amt(o.goldReward || 0, 0), tq: [], iq: [] };
    (o.treasureRewards || []).forEach(function (r, i) { res.tq[i] = amt(r ? r.qty : 1, 0); });
    (o.itemRewards || []).forEach(function (r, i) { res.iq[i] = amt(r ? r.qty : 1, 1); });
    ses.rewardRolls[sourceId] = res;
    save();
    return res;
  }
  // Attribue l'Or et les trésors d'une source de récompense (scène ou bloc de test),
  // en utilisant le tirage mis en cache (cf. rewardRoll) pour rester cohérent avec
  // l'affichage.
  function grantTreasures(ses, o, sourceId) {
    if (!o) return;
    const roll = rewardRoll(ses, sourceId, o);
    if (roll.gold > 0) { ensureLoot(ses); ses.gold += roll.gold; }
    (o.treasureRewards || []).forEach(function (r, i) {
      if (!r || !r.name) return;
      const q = roll.tq[i] || 0;
      if (q > 0) addTreasure(ses, r.name, q, r.kind);
    });
    if (roll.gold > 0 || (o.treasureRewards || []).some(function (r) { return r && r.name; })) {
      document.dispatchEvent(new CustomEvent('inventory-new-item'));
    }
  }
  // Objet Rare possédé par le groupe (dans ses.treasures, kind 'rare', qty > 0).
  function ownedRare(ses, name) {
    if (!name || !ses || !Array.isArray(ses.treasures)) return null;
    return ses.treasures.find(function (t) { return t.kind === 'rare' && t.name === name && (t.qty || 0) > 0; }) || null;
  }
  function rewardAmountSet(v) { return Store.isDiceExpr(v) || (Math.round(Number(v) || 0) > 0); }
  function hasTreasureReward(o) {
    return rewardAmountSet(o.goldReward) ||
      (Array.isArray(o.treasureRewards) && o.treasureRewards.some(function (r) { return r && r.name && rewardAmountSet(r.qty == null ? 1 : r.qty); }));
  }
  // HTML des lignes de récompense Or/Trésors (encadré « Butin » doré et festif).
  // `roll` = tirage mis en cache (rewardRoll) : on affiche la valeur RÉELLE tirée
  // (« +11 Or ») plutôt que la variable en dés.
  function treasureRewardHtml(o, roll) {
    if (!hasTreasureReward(o)) return '';
    let rows = '';
    if (rewardAmountSet(o.goldReward)) {
      const goldShow = roll ? roll.gold : Math.round(Number(o.goldReward) || 0);
      rows += '<div class="ses-reward-title ses-loot-gold">🪙 <strong>+' + goldShow + ' Or</strong></div>';
    }
    (o.treasureRewards || []).forEach(function (r, i) {
      if (!r || !r.name || !rewardAmountSet(r.qty == null ? 1 : r.qty)) return;
      const q = roll ? (roll.tq[i] || 0) : (r.qty == null ? 1 : r.qty);
      const qShow = (q > 1) ? ' ×' + esc(String(q)) : '';
      rows += r.kind === 'rare'
        ? '<div class="ses-reward-title ses-loot-rare">🗝️ Objet Rare — <strong>' + esc(r.name) + qShow + '</strong></div>'
        : '<div class="ses-reward-title ses-loot-treasure">💎 Trésor — <strong>' + esc(r.name) + qShow + '</strong></div>';
    });
    return '<div class="ses-reward-block ses-reward-gold">' +
      '<div class="ses-loot-head">✨ Butin !</div>' + rows + '</div>';
  }

  // PRÉPARÉ : marque tous les aventuriers engagés comme Préparés pour le prochain
  // combat (état posé dans pendingStates, appliqué au démarrage du combat).
  function prepareParty(ses) {
    if (!ses.pendingStates) ses.pendingStates = {};
    engagedHeroes(ses).forEach(function (h) {
      const arr = (ses.pendingStates[h.id] = ses.pendingStates[h.id] || []);
      if (arr.indexOf('prepare') < 0) arr.push('prepare');
    });
  }
  // Libellé d'affichage de l'effet de réussite (encadré de récompense).
  const WIN_STATE_LABEL = { blindage: 'Blindage', onde: 'Onde', prepare: 'Préparé' };
  // `scene` (optionnel) : quand l'effet déclenche un combat, l'encadré ne
  // s'affiche que tant que ce combat est EN ATTENTE. Une fois le combat mené,
  // le bloc « Un combat se déclenche ! » disparaît.
  function winEffectHtml(o, scene) {
    const fx = (o && o.winEffect) || (o && o.prepareReward ? { kind: 'prepare' } : null);
    if (!fx || !fx.kind || fx.kind === 'none') return '';
    let inner = '';
    if (fx.kind === 'combat') {
      const ses = activeSession;
      if (scene && ses && !forcedCombatPending(ses, scene)) return '';
      inner = '⚔️ <strong>Un combat se déclenche !</strong>';
    }
    else if (fx.kind === 'prepare') inner = '⚡ Le groupe est <strong>Préparé</strong> pour le prochain combat<br><span class="ses-reward-note">(+1 Action ou +1 Mouvement au 1er Tour)</span>';
    else if (fx.kind === 'pv') inner = '❤️ Soin <strong>+' + esc(String(fx.val == null ? 2 : fx.val)) + ' PV</strong> pour le groupe';
    else if (fx.kind === 'vie') inner = '❤️ Gain <strong>+' + esc(String(fx.val == null ? 2 : fx.val)) + ' VIE</strong> pour le groupe';
    else if (fx.kind === 'state') inner = '🛡️ Groupe gagne <strong>' + esc(WIN_STATE_LABEL[fx.state] || fx.state || 'Blindage') + '</strong> au prochain combat';
    else return '';
    return '<div class="ses-reward-block ses-reward-prepare"><div class="ses-reward-title">' + inner + '</div></div>';
  }
  // Applique l'EFFET DE RÉUSSITE (positif) d'un test ou d'une scène au groupe.
  // Rétro-compat : l'ancien booléen prepareReward vaut winEffect { kind:'prepare' }.
  function applyWinEffect(ses, o) {
    const fx = (o && o.winEffect) || (o && o.prepareReward ? { kind: 'prepare' } : null);
    if (!fx || !fx.kind || fx.kind === 'none') return '';
    if (fx.kind === 'combat') { triggerForcedCombat(ses, ses.currentSceneId, fx.combat); return '⚔️ Un combat se déclenche !'; }
    if (fx.kind === 'prepare') { prepareParty(ses); return 'Le groupe est Préparé pour le prochain combat\n(+1 Action ou +1 Mouvement au 1er Tour).'; }
    const n = Math.max(1, Store.rollAmount(fx.val == null ? 2 : fx.val));
    if (!ses.heroStates) ses.heroStates = {};
    if (fx.kind === 'pv') {
      engagedHeroes(ses).forEach(function (h) {
        const st = ses.heroStates[h.id] || (ses.heroStates[h.id] = { pv: Combatants.heroPv(h) });
        const maxPv = Math.max(1, Combatants.heroPv(effectiveHero(ses, h)));
        st.pv = Math.min(maxPv, (typeof st.pv === 'number' ? st.pv : maxPv) + n);
      });
      return 'Le groupe récupère ' + n + ' PV.';
    }
    if (fx.kind === 'vie') {
      engagedHeroes(ses).forEach(function (h) {
        const st = ses.heroStates[h.id] || (ses.heroStates[h.id] = { pv: Combatants.heroPv(h) });
        st.viePenalty = (st.viePenalty || 0) + n;
      });
      return 'Le groupe gagne ' + n + ' VIE.';
    }
    if (fx.kind === 'state') {
      const key = fx.state || 'blindage';
      if (!ses.pendingStates) ses.pendingStates = {};
      engagedHeroes(ses).forEach(function (h) {
        const arr = (ses.pendingStates[h.id] = ses.pendingStates[h.id] || []);
        if (arr.indexOf(key) < 0) arr.push(key);
      });
      return 'Le groupe gagne « ' + key + ' » au prochain combat.';
    }
    return '';
  }
  function appendSection(box) {
    const d = document.createElement('div');
    box.appendChild(d);
    return d;
  }

  // Le type de scène n'est qu'un libellé : on affiche les fonctions réellement
  // présentes dans la scène (récompense, combat, choix, suite), dans cet ordre.
  // Dans les donjons, les sorties (connecteurs / salle suivante) n'apparaissent
  // qu'une fois la salle « résolue » (pas de combat, ou combat gagné).
  function renderSceneActions(scene, adv, ses, chapter) {
    const box = $('#ses-actions');
    if (!box) return;
    box.innerHTML = '';
    const ch = chapter || (findScene(adv, scene.id) || {}).chapter;
    const mode = chapterMode(ch);
    const cleared = !!(ses.clearedScenes && ses.clearedScenes[scene.id]);
    const hasCombat = sceneHasCombat(scene);

    // Combat IMPOSÉ par un test / une action : l'encadré « Combat imposé » est
    // affiché en tête, mais le reste de la salle reste ACCESSIBLE (tests, actions,
    // récompenses…). Seule la progression vers une autre salle est verrouillée.
    const forcedPending = forcedCombatPending(ses, scene);
    if (forcedPending) renderForcedCombat(box, scene, adv, ses);

    // Récompense « Gagné à l'issue du combat » : masquée tant que le combat de la
    // scène n'est pas remporté (cleared), OU tant qu'un combat déclenché par un
    // test / une action est en attente. Sans combat, le drapeau est ignoré.
    // (forcedCombatPending a déjà court-circuité le rendu plus haut ; clause de
    // sécurité conservée.)
    // Verrou : combat de zone non remporté, combat imposé en attente, OU test
    // obligatoire pas encore résolu (celui-ci peut déclencher le combat).
    const rewardGated = scene.rewardAfterCombat &&
      ((hasCombat && !cleared) || forcedCombatPending(ses, scene) || mandatoryTestPending(scene, ses));
    if (sceneHasReward(scene) && !rewardGated) renderRewardScene(box, scene, adv, ses);
    // Un combat imposé prime : le combat propre à la salle n'est pas proposé
    // tant que celui-ci n'a pas été mené.
    if (hasCombat && !forcedPending && (mode === 'linear' || !cleared)) renderCombatScene(box, scene, adv, ses);
    else if (hasCombat && !forcedPending && cleared && mode !== 'linear') {
      appendSection(box).innerHTML = '<p class="ses-done-note ses-done-combat">⚔ Salle déjà nettoyée — les adversaires ont été vaincus.</p>';
    }
    const resolved = !hasCombat || cleared;
    // Navigation VERROUILLÉE tant que :
    //  • le combat de la scène n'est pas remporté (resolved), OU
    //  • un test OBLIGATOIRE n'a pas été tenté (mandatoryTestPending).
    // Un test obligatoire qui déclenche un combat en cas d'échec passe ensuite le
    // relais à forcedCombatPending (qui a déjà court-circuité l'affichage plus haut).
    // Objectif : impossible d'« Emprunter le passage » / « Continuer » tant que le
    // combat (ou le test qui le déclenche) n'est pas résolu.
    const fightPending = fightBlockPending(scene, ses);
    const navBlocked = !resolved || mandatoryTestPending(scene, ses) || forcedPending || fightPending;
    // (Les tests de compétence sont désormais des blocs rendus dans le fil du
    // texte de la scène — cf. wireTestBlocks.)
    const hasChoices = scene.choices && scene.choices.length;
    if (!navBlocked) {
      if (hasChoices) renderChoicesPlay(box, scene, adv, ses);
      // « Scène suivante (auto) » n'existe pas dans les salles de donjon structuré
      // (la navigation passe par les connecteurs).
      else if (scene.nextSceneId && mode !== 'dungeon') renderNextButton(box, scene, adv, ses);
    }
    // Scène d'ÉVÉNEMENT DE PASSAGE : une fois résolue, on poursuit vers la salle
    // de destination (pas de sorties propres).
    const inTransit = !!(ses.transit && ses.transit.sceneId === scene.id && scene.isTransition);
    if (inTransit) {
      if (!navBlocked) {
        const destId = ses.transit.destId;
        const df = findScene(adv, destId);
        const dest = df ? (df.scene.title || 'Salle') : 'la suite';
        const sec = appendSection(box);
        sec.innerHTML = '<button class="primary" id="ses-transit-next">Continuer vers ' + esc(dest) + ' →</button>';
        sec.querySelector('#ses-transit-next').addEventListener('click', function () {
          navigateTo(ses, adv, destId);
        });
      }
    } else {
      // Joystick de sorties : dans la colonne principale, sous les blocs de la scène.
      // Un test obligatoire NON narratif laisse le demi-tour possible : les sorties
      // s'affichent, mais seules les salles DÉJÀ VISITÉES sont franchissables.
      const backOnly = navBlocked && resolved && !forcedPending && !fightPending && !narrativeTestPending(scene, ses);
      if (mode === 'dungeon' && (!navBlocked || backOnly) && !scene.isTransition) {
        renderDungeonExits(box, ch, scene, adv, ses, backOnly);
      }
      if (mode === 'random' && !navBlocked && !hasChoices && !scene.nextSceneId && !scene.isTransition) renderRandomNext(box, ch, scene, adv, ses);
    }
    // Message explicatif : on indique pourquoi aucune sortie n'est proposée
    // (le combat imposé, lui, a son propre écran et a déjà court-circuité le rendu).
    const backAllowed = navBlocked && resolved && !forcedPending && !fightPending && !narrativeTestPending(scene, ses) && chapterMode(ch) === 'dungeon';
    if (navBlocked && !forcedCombatPending(ses, scene) && scene.type !== 'fin' && !backAllowed) {
      const why = fightPending
        ? '🔒 Un combat est engagé dans cette salle — menez-le avant de continuer.'
        : !resolved
        ? '🔒 Terminez le combat de cette salle avant de continuer.'
        : (narrativeTestPending(scene, ses)
          ? '🔒 Un test obligatoire doit être tenté avant de continuer.'
          : '🔒 Un test obligatoire doit être tenté pour explorer plus loin — vous pouvez faire demi-tour.');
      appendSection(box).innerHTML = '<p class="hint ses-nav-locked">' + why + '</p>';
    }
    if (scene.type === 'fin') renderFinButton(box, scene, adv, ses);
  }

  // Flèche directionnelle (8 directions) entre deux salles, selon leurs
  // positions sur la carte du donjon : salle cible placée sous la salle
  // courante → ⬇, à gauche → ⬅, etc. Repli sur « → » sans coordonnées.
  const DIR_ARROWS = ['➡', '↘', '⬇', '↙', '⬅', '↖', '⬆', '↗'];
  function sceneDirArrow(fromScene, toScene) {
    if (!fromScene || !toScene ||
        typeof fromScene.mapX !== 'number' || typeof fromScene.mapY !== 'number' ||
        typeof toScene.mapX !== 'number' || typeof toScene.mapY !== 'number') return '→';
    const dx = toScene.mapX - fromScene.mapX, dy = toScene.mapY - fromScene.mapY;
    if (!dx && !dy) return '→';
    let idx = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    idx = ((idx % 8) + 8) % 8;
    return DIR_ARROWS[idx];
  }

  // ---- Événements de passage (scènes de transition sur les connecteurs) ----
  // Réinitialise l'état d'une scène d'événement répétable (combat, tests,
  // récompenses) pour qu'elle se rejoue entièrement au prochain passage.
  function resetTransitionScene(ses, eventScene) {
    if (ses.clearedScenes) delete ses.clearedScenes[eventScene.id];
    if (ses.claimedRewards) delete ses.claimedRewards[eventScene.id];
    if (ses.searchTests) {
      (eventScene.blocks || []).forEach(function (b) {
        if (b.type === 'test') delete ses.searchTests[b.id];
      });
    }
  }
  // Petite animation de « rencontre » : secousse de l'écran + flash rouge d'alerte,
  // pour signaler un événement surprenant sur un connecteur.
  function playEncounterFx() {
    try {
      const flash = document.createElement('div');
      flash.className = 'ses-encounter-flash';
      flash.innerHTML = '<div class="ses-encounter-badge">⚠ Événement !</div>';
      document.body.appendChild(flash);
      const main = document.querySelector('#session-root') || document.querySelector('main') || document.body;
      main.classList.add('ses-encounter-shake');
      global.setTimeout(function () { main.classList.remove('ses-encounter-shake'); }, 560);
      global.setTimeout(function () { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 900);
    } catch (e) { /* animation best-effort */ }
  }
  // Tire AU PLUS UNE rencontre du tableau, en UN SEUL jet. Chaque entrée occupe une
  // tranche = sa chance (%) : le % est exactement la probabilité que CETTE rencontre
  // précise survienne à ce passage. « Aucun événement » = le reste (100 − somme des %).
  // Deux rencontres ne peuvent jamais se déclencher en même temps.
  // « UNE FOIS PAR PARTIE » : une rencontre déjà survenue (usedSet) ne se reproduit
  // jamais. Si le jet tombe sur sa tranche, on redirige vers une rencontre ENCORE
  // DISPONIBLE (au hasard, pondérée par sa chance) — la proba globale « qu'il se passe
  // quelque chose » reste donc identique tant qu'il reste des rencontres.
  function pickRandomEncounter(entries, chapter, usedSet) {
    const valid = [];
    (entries || []).forEach(function (e) {
      if (!e || !e.sceneId) return;
      if (!chapter.scenes.some(function (s) { return s.id === e.sceneId; })) return;
      const chance = Math.max(0, Math.min(100, Number(e.chance) || 0));
      if (chance > 0) valid.push({ sceneId: e.sceneId, chance: chance });
    });
    if (!valid.length) return null;
    const used = usedSet || {};
    // 1) Jet additif sur la table COMPLÈTE.
    const roll = Math.random() * 100;
    let acc = 0, hit = null;
    for (let i = 0; i < valid.length; i++) { acc += valid[i].chance; if (roll < acc) { hit = valid[i]; break; } }
    if (!hit) return null;                       // rien ce passage
    if (!used[hit.sceneId]) return hit.sceneId;  // rencontre inédite → on la joue
    // 2) Rencontre déjà vue : redirige vers une rencontre restante (pondérée).
    const remaining = valid.filter(function (e) { return !used[e.sceneId]; });
    if (!remaining.length) return null;          // tout a déjà eu lieu → rien
    const totalRem = remaining.reduce(function (n, e) { return n + e.chance; }, 0);
    let r2 = Math.random() * totalRem, acc2 = 0;
    for (let j = 0; j < remaining.length; j++) { acc2 += remaining[j].chance; if (r2 < acc2) return remaining[j].sceneId; }
    return remaining[remaining.length - 1].sceneId;
  }
  // Déclenche (si nécessaire) l'événement d'un connecteur lors d'un déplacement
  // vers `destId`. Renvoie true si la navigation est déroutée vers la scène
  // d'événement (le « Continuer » de celle-ci mènera ensuite à destination).
  function triggerLinkEvent(ses, adv, chapter, link, destId) {
    if (!link) return false;
    // 1) RENCONTRE ALÉATOIRE (répétable) : si ce connecteur y est sujet, on tire dans
    // le TABLEAU UNIQUE du chapitre (chapter.randomEncounters). Chance par entrée.
    if (link.randomEnabled && Array.isArray(chapter.randomEncounters) && chapter.randomEncounters.length) {
      if (!ses.usedRandomEncounters) ses.usedRandomEncounters = {};
      const hit = pickRandomEncounter(chapter.randomEncounters, chapter, ses.usedRandomEncounters);
      if (hit) {
        const rev = chapter.scenes.find(function (s) { return s.id === hit; });
        if (rev) {
          ses.usedRandomEncounters[hit] = true; // une rencontre ne survient qu'une fois par partie
          resetTransitionScene(ses, rev); // rejouable à chaque rencontre
          ses.transit = { sceneId: rev.id, destId: destId };
          navigateTo(ses, adv, rev.id);
          playEncounterFx();
          return true;
        }
      }
    }
    // 2) Événement de passage DÉTERMINISTE (une fois, ou répétable si eventRepeat).
    if (!link.eventSceneId) return false;
    const evScene = chapter.scenes.find(function (s) { return s.id === link.eventSceneId; });
    if (!evScene) return false;
    if (!ses.linkEventsDone) ses.linkEventsDone = {};
    if (link.eventRepeat) {
      resetTransitionScene(ses, evScene); // rejouable : état remis à neuf à chaque passage
    } else if (ses.linkEventsDone[link.id]) {
      return false; // déjà déclenché une fois
    } else {
      ses.linkEventsDone[link.id] = true;
    }
    ses.transit = { sceneId: evScene.id, destId: destId };
    navigateTo(ses, adv, evScene.id);
    playEncounterFx();
    return true;
  }

  // État d'un connecteur conditionné par un test :
  //  • 'none'   : toujours visible et franchissable ;
  //  • 'hidden' : DISSIMULÉ — invisible tant que son test n'est pas réussi ;
  //  • 'locked' : VERROUILLÉ — visible avec un cadenas, franchissable une fois le
  //               test réussi.
  // Rétro-compat : un ancien connecteur avec revealTestId sans gateMode = dissimulé.
  function linkGate(l, ses) {
    const mode = l.gateMode || (l.revealTestId ? 'hidden' : 'none');
    if (mode === 'none' || !l.revealTestId) return { mode: 'none', unlocked: true };
    const st = ses.searchTests && ses.searchTests[l.revealTestId];
    return { mode: mode, unlocked: !!(st && st.success) };
  }
  // ----- Donjon structuré : sorties & accès de la salle (connecteurs) -----
  // ----- ROSE DES DIRECTIONS (remplace l'ancien bloc « Sorties & accès ») -----
  // Grille FIXE de 3×3 : la salle courante au centre, les 8 directions autour.
  // La forme ne change jamais : une direction sans sortie garde sa case, discrète
  // et non cliquable. Toute la logique de sortie (connecteurs, verrous, passages
  // secrets, événements de passage, demi-tour) est celle de l'ancien bloc.
  const ROSE_CELLS = [
    ['↖', 'NO'], ['⬆', 'N'], ['↗', 'NE'],
    ['⬅', 'O'],  ['',  ''],  ['➡', 'E'],
    ['↙', 'SO'], ['⬇', 'S'], ['↘', 'SE'],
  ];
  // Repositionne la rose sous la COLONNE PRINCIPALE et réserve la place en bas
  // de page pour qu'elle ne recouvre jamais le contenu.
  function placeCompass() {
    const rose = document.getElementById('ses-compass');
    if (!rose) return;
    const root = document.getElementById('session-root');
    const col = document.querySelector('.ses-scene-card');
    const narrow = window.matchMedia('(max-width: 860px)').matches;
    if (col && !narrow) {
      // Même largeur que les BLOCS DE TEXTE de la salle : on se cale sur la
      // boîte de contenu de la carte de scène (padding déduit).
      const r = col.getBoundingClientRect();
      const cs = window.getComputedStyle(col);
      const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
      const bw = parseFloat(cs.borderLeftWidth) || 0;
      // Le cadre de la rose déborde de sa propre marge intérieure, de sorte que
      // la GRILLE et les BOUTONS s'alignent pile sur les blocs de texte.
      const inner = rose.querySelector('.ses-compass-inner');
      const ics = inner ? window.getComputedStyle(inner) : null;
      const inL = ics ? (parseFloat(ics.paddingLeft) || 0) + (parseFloat(ics.borderLeftWidth) || 0) : 0;
      const inR = ics ? (parseFloat(ics.paddingRight) || 0) + (parseFloat(ics.borderRightWidth) || 0) : 0;
      rose.style.left = Math.round(r.left + bw + padL - inL) + 'px';
      rose.style.right = 'auto';
      rose.style.width = Math.round(r.width - bw * 2 - padL - padR + inL + inR) + 'px';
    } else {
      rose.style.left = ''; rose.style.right = ''; rose.style.width = '';
    }
    if (root) root.style.paddingBottom = (rose.offsetHeight + 18) + 'px';
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', placeCompass);
  }
  function renderDungeonExits(box, chapter, scene, adv, ses, backOnly) {
    const links = (chapter && Array.isArray(chapter.links) ? chapter.links : []).filter(function (l) {
      if (l.from !== scene.id && l.to !== scene.id) return false;
      // DISSIMULÉ : invisible tant que son test de révélation n'est pas réussi.
      // VERROUILLÉ : reste affiché (cadenas), même verrou non levé.
      const g = linkGate(l, ses);
      if (g.mode === 'hidden' && !g.unlocked) return false;
      return true;
    });
    const titleOf = function (id) {
      const f = findScene(adv, id);
      return f ? (f.scene.title || 'Salle') : 'Salle';
    };
    const exits = links.map(function (l) {
      const other = l.from === scene.id ? l.to : l.from;
      const f = findScene(adv, other);
      return { l: l, other: other, f: f, arrow: sceneDirArrow(scene, f ? f.scene : null), gate: linkGate(l, ses) };
    });
    function exitBtnHtml(e) {
      const visited = (ses.visitedSceneIds || []).indexOf(e.other) >= 0;
      // VERROUILLÉ non encore ouvert : bouton visible avec un cadenas, non franchissable.
      // backOnly (test obligatoire en attente) : seules les salles déjà visitées
      // restent accessibles — on peut faire demi-tour, pas avancer.
      const lockedByTest = backOnly && !visited;
      const locked = (e.gate.mode === 'locked' && !e.gate.unlocked) || lockedByTest;
      // ⚔️ seulement pour une salle déjà visitée dont le combat n'est pas résolu
      // (pas d'indice sur les salles inconnues).
      const danger = visited && e.f && sceneHasCombat(e.f.scene) && !(ses.clearedScenes && ses.clearedScenes[e.other]);
      const name = visited ? titleOf(e.other) : '???';
      const tip = locked
        ? (lockedByTest
          ? 'Un test obligatoire doit être tenté avant d\'explorer plus loin (le demi-tour reste possible).'
          : 'Verrouillé — réussissez le test de la salle pour l\'ouvrir.')
        : (e.l.label ? e.l.label + ' — ' + name : name);
      return '<button type="button" class="rose-btn ses-exit-btn' + (visited ? ' ses-exit-visited' : '') +
          (locked ? ' ses-exit-locked' : '') + '" data-to="' + esc(e.other) + '"' +
          (locked ? ' disabled' : '') + ' title="' + esc(tip) + '">' +
        '<span class="rose-arrow">' + (locked ? '🔒' : e.arrow) + '</span>' +
        '<span class="rose-name">' + esc(name) + (danger ? ' ⚔️' : '') + '</span>' +
        (e.l.label ? '<span class="rose-lbl">' + esc(e.l.label) + '</span>' : '') +
      '</button>';
    }
    // Répartition des sorties dans les 8 cases directionnelles (le centre est
    // réservé à la salle courante). Plusieurs sorties dans la même direction
    // s'empilent DANS leur case : la grille reste 3×3 quoi qu'il arrive.
    const cells = {};
    exits.forEach(function (e) {
      const k = ROSE_CELLS.some(function (c) { return c[0] === e.arrow; }) ? e.arrow : '➡';
      (cells[k] = cells[k] || []).push(exitBtnHtml(e));
    });
    const gridHtml = ROSE_CELLS.map(function (c, i) {
      if (i === 4) {
        return '<div class="rose-cell rose-center" aria-current="true">' +
          '<span class="rose-center-pin">📍</span>' +
          '<span class="rose-center-name">' + esc(scene.title || 'Salle') + '</span>' +
        '</div>';  // pastille à gauche du nom (mise en ligne par le CSS)
      }
      const btns = cells[c[0]];
      if (!btns || !btns.length) {
        return '<div class="rose-cell rose-empty" aria-hidden="true"><span class="rose-empty-dir">' + c[1] + '</span></div>';
      }
      return '<div class="rose-cell rose-filled">' + btns.join('') + '</div>';
    }).join('');

    // La rose vit HORS du fil de la scène : barre fixe en bas d'écran.
    const root = document.getElementById('session-root');
    if (!root) return;
    let rose = document.getElementById('ses-compass');
    if (!rose) { rose = document.createElement('div'); rose.id = 'ses-compass'; root.appendChild(rose); }
    rose.className = 'ses-compass';
    rose.innerHTML = '<div class="ses-compass-inner">' +
      '<div class="rose-grid">' + gridHtml + '</div>' +
      (exits.length ? '' : '<p class="hint rose-none">Aucune sortie reliée à cette salle.</p>') +
    '</div>';
    placeCompass();

    rose.querySelectorAll('.ses-exit-btn:not([disabled])').forEach(function (b) {
      const to = b.getAttribute('data-to');
      // Survol : la salle de destination se surligne sur la carte latérale.
      b.addEventListener('mouseenter', function () { highlightMapRoom(to, true); });
      b.addEventListener('mouseleave', function () { highlightMapRoom(to, false); });
      b.addEventListener('click', function () {
        highlightMapRoom(to, false);
        if (!Array.isArray(ses.choicesTaken)) ses.choicesTaken = [];
        ses.choicesTaken.push({ sceneId: scene.id, choiceLabel: b.textContent.trim(), targetSceneId: to });
        // Événement de passage sur ce connecteur : il s'intercale avant l'arrivée.
        const link = (chapter.links || []).find(function (l) {
          return (l.from === scene.id && l.to === to) || (l.from === to && l.to === scene.id);
        });
        const arrow = (exits.find(function (e) { return e.other === to; }) || {}).arrow;
        sweepTo(arrow, function () {
          if (triggerLinkEvent(ses, adv, chapter, link, to)) return;
          navigateTo(ses, adv, to); // la nouvelle salle se lit depuis le haut
        });
      });
    });
  }
  // ---- Balayage directionnel entre deux salles ----
  // La salle quittée glisse dans le sens inverse du déplacement, la nouvelle
  // arrive du côté visé. Uniquement des transformations (aucun recalcul de
  // mise en page) et seulement sur le contenu — la rose ne bouge pas.
  const SWEEP_DIR = {
    '⬆': 'n', '⬇': 's', '⬅': 'o', '➡': 'e',
    '↖': 'no', '↗': 'ne', '↙': 'so', '↘': 'se',
  };
  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }
  function sweepTo(arrow, go) {
    const d = SWEEP_DIR[arrow];
    const out = document.querySelector('.ses-content');
    if (!d || !out || reducedMotion()) { go(); scrollPageTop(); return; }
    out.classList.add('ses-sweep-out', 'sweep-' + d);
    // La navigation part de toute façon, même si l'animation n'aboutit pas.
    setTimeout(function () {
      go();
      scrollPageTop();
      const el = document.querySelector('.ses-content');
      if (!el) return;
      el.classList.add('ses-sweep-in', 'sweep-' + d);
      setTimeout(function () { el.classList.remove('ses-sweep-in', 'sweep-' + d); }, 280);
    }, 170);
  }
  // Remonte la page en haut après un déplacement.
  function scrollPageTop() {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
  }
  // Surlignage d'une salle sur la mini-carte (survol d'une sortie de la rose).
  function highlightMapRoom(sceneId, on) {
    document.querySelectorAll('.mmap-room[data-scene="' + (window.CSS && CSS.escape ? CSS.escape(sceneId) : sceneId) + '"]')
      .forEach(function (el) { el.classList.toggle('mmap-hover', !!on); });
  }

  // ----- Donjon aléatoire : enchaînement automatique vers la salle suivante -----
  function renderRandomNext(box, chapter, scene, adv, ses) {
    const order = ensureRandomOrder(ses, adv, chapter);
    const idx = order.indexOf(scene.id);
    const nextId = (idx >= 0 && idx < order.length - 1) ? order[idx + 1] : null;
    const sec = appendSection(box);
    if (nextId) {
      sec.innerHTML = '<button class="primary" id="ses-rand-next">Continuer l\'exploration → ' +
        '<span class="ses-rand-count">(salle ' + (idx + 2) + '/' + order.length + ')</span></button>';
      sec.querySelector('#ses-rand-next').addEventListener('click', function () {
        // RENCONTRE ALÉATOIRE (répétable) : si cette salle y est sujette, on tire dans
        // le TABLEAU UNIQUE du chapitre à chaque passage vers la salle suivante.
        if (scene.randomEnabled && Array.isArray(chapter.randomEncounters) && chapter.randomEncounters.length) {
          if (!ses.usedRandomEncounters) ses.usedRandomEncounters = {};
          const hit = pickRandomEncounter(chapter.randomEncounters, chapter, ses.usedRandomEncounters);
          if (hit) {
            const rev = chapter.scenes.find(function (s) { return s.id === hit; });
            if (rev) {
              ses.usedRandomEncounters[hit] = true; // une rencontre ne survient qu'une fois par partie
              resetTransitionScene(ses, rev);
              ses.transit = { sceneId: rev.id, destId: nextId };
              navigateTo(ses, adv, rev.id);
              playEncounterFx();
              return;
            }
          }
        }
        // Événement de passage affecté à cette transition (une fois par partie).
        const assign = ses.randomEvents && ses.randomEvents[chapter.id];
        const evId = assign && assign[idx];
        if (evId) {
          if (!ses.randomEventsDone) ses.randomEventsDone = {};
          const key = chapter.id + ':' + idx;
          if (!ses.randomEventsDone[key] && chapter.scenes.some(function (s) { return s.id === evId; })) {
            ses.randomEventsDone[key] = true;
            ses.transit = { sceneId: evId, destId: nextId };
            navigateTo(ses, adv, evId);
            playEncounterFx();
            return;
          }
        }
        navigateTo(ses, adv, nextId);
      });
    } else {
      // Dernière salle (Sortie) : on quitte le donjon vers le chapitre suivant.
      const outId = nextChapterEntryId(adv, chapter);
      if (outId) {
        sec.innerHTML = '<button class="primary" id="ses-rand-out">🏁 Sortir du donjon →</button>';
        sec.querySelector('#ses-rand-out').addEventListener('click', function () {
          navigateTo(ses, adv, outId);
        });
      } else if (scene.type !== 'fin') {
        sec.innerHTML = '<p class="hint">🏁 Fin du donjon — dernier chapitre de l\'aventure.</p>';
      }
    }
  }

  // La scène cible d'un choix déclenche-t-elle un combat ? (pour l'emoji ⚔️)
  function choiceLeadsToCombat(adv, targetSceneId) {
    if (!targetSceneId) return false;
    const found = findScene(adv, targetSceneId);
    return !!(found && sceneHasCombat(found.scene));
  }
  function renderChoicesPlay(box, scene, adv, ses) {
    const DIFF = { auto: 'Automatique', facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', tresdifficile: 'Très Difficile', insurmontable: 'Insurmontable', impossible: 'Impossible' };
    const sec = appendSection(box);
    sec.innerHTML = '<div class="ses-choices">' +
      scene.choices.map(function (ch, i) {
        if (ch.skillTest) {
          let helper;
          let bhBtn = null; // aventurier affiché ET utilisé pour le test (cohérence cartouche/bouton)
          if (ch.groupTest) {
            // Test de GROUPE : chaque aventurier vivant est affiché comme cible
            // (vignettes espacées ; la difficulté est portée par le bouton).
            const heroes = aliveEngagedHeroes(ses);
            helper = heroes.length
              ? '<div class="ses-group-pills">' + heroes.map(function (h) {
                  const info = heroTestInfo(ses, h, ch.skill);
                  return '<div class="ses-skill-pill">' +
                    '<span class="ssk-hero">' + esc(h.name) + '</span>' +
                    '<span class="ssk-skill skill-' + slug(ch.skill || '') + '">' + esc(ch.skill || '') + ' ' + (1 + info.bonus) + diceTag(ch.difficulty) + '</span>' +
                    (info.talentSucc ? '<span class="ssk-tal">+' + info.talentSucc + ' réussite' + (info.talentSucc > 1 ? 's' : '') + '</span>' : '') +
                  '</div>';
                }).join('') + '</div>'
              : '<div class="ses-skill-pill ssk-none">Aucun aventurier disponible pour ce test</div>';
          } else {
            const bh = bestHeroForSkill(ses, ch.skill);
            bhBtn = bh;
            const talBonus = bh.talentSucc || 0;
            const dice = 1 + (bh.bonus || 0); // somme des dés lancés = 1 + bonus de compétence
            helper = bh.hero
              ? '<div class="ses-skill-pill">' +
                  '<span class="ssk-hero">' + esc(bh.hero.name) + '</span>' +
                  '<span class="ssk-skill skill-' + slug(ch.skill || '') + '">' + esc(ch.skill || '') + ' ' + dice + diceTag(ch.difficulty) + '</span>' +
                  (talBonus ? '<span class="ssk-tal">+' + talBonus + ' réussite' + (talBonus > 1 ? 's' : '') + '</span>' : '') +
                '</div>'
              : '<div class="ses-skill-pill ssk-none">Aucun aventurier disponible pour ce test</div>';
          }
          // La difficulté est toujours SUR le bouton, à droite de la compétence.
          return '<div class="ses-choice">' +
            '<button class="ses-choice-btn skill-test sktest-' + slug(ch.skill || '') + ' choice-type-' + (ch.choiceType || 'neutre') + (ch.difficulty === 'auto' ? ' ses-noroll' : '') + '" data-ci="' + i + '" data-skill-hero="' + (bhBtn && bhBtn.hero ? esc(bhBtn.hero.id) : '') + '">' +
              (ch.groupTest ? '👥 ' : '') + esc(ch.label) +
              ' <span class="ssk-skill skill-' + slug(ch.skill || '') + '">' + esc(ch.skill || '') + '</span>' +
              ' <span class="ssk-diff ssk-diff-' + (ch.difficulty || 'moyen') + '">' + (DIFF[ch.difficulty] || 'Moyen') + '</span>' +
            '</button>' +
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

  // ----- Blocs de test de compétence (tentés une seule fois, dans le fil du texte) -----
  // Pastille « 🎲 » : uniquement quand un jet de dés a effectivement lieu.
  // Une difficulté « Automatique » (ou un bloc Action) ne lance aucun dé.
  function diceTag(diff, isAction) { return (isAction || diff === 'auto') ? '' : ' 🎲'; }
  const ST_DIFF_LABEL = { auto: 'Automatique', facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', tresdifficile: 'Très Difficile', insurmontable: 'Insurmontable', impossible: 'Impossible' };
  // Normalisation TOLÉRANTE d'un mot pour les blocs Écriture : minuscules, sans
  // accents, sans espaces/ponctuation, sans « s »/« x » final (pluriel simple).
  // Ainsi « Étoiles », « étoiLe » et « Etoile » se ramènent tous à « etoile ».
  function normalizeWord(s) {
    return String(s == null ? '' : s)
      .trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .replace(/[sx]$/, '');
  }
  // Le mot saisi correspond-il à l'un des mots attendus (séparés par , ; ou saut de ligne) ?
  function writeMatches(block, answer) {
    const got = normalizeWord(answer);
    if (!got) return false;
    return String(block.writeAnswers || '').split(/[,;\n]/)
      .map(function (a) { return normalizeWord(a); })
      .filter(Boolean)
      .indexOf(got) >= 0;
  }
  // Variantes jouables d'un bloc : test (compétence principale + alternative) ou
  // Action (1 ou 2 choix, sans jet).
  function testVariants(block) {
    if (block.actionMode) {
      return [{ action: 1, label: block.label }].concat((block.altLabel || '').trim() ? [{ action: 2, label: block.altLabel }] : []);
    }
    const variants = [{ skill: block.skill, difficulty: block.difficulty }];
    if (block.altSkill) variants.push({ skill: block.altSkill, difficulty: block.altDifficulty || block.difficulty });
    return variants;
  }
  // ---- Test de GROUPE à 2 compétences : répartition des aventuriers ----
  // Chaque aventurier est affecté à l'une des deux compétences (défaut : celle
  // où il est le plus fort) ; la bascule ⇄ permet de le changer, y compris
  // entre deux tentatives d'un test retentable.
  function groupSplitInfo(block) {
    if (block.actionMode) return null;
    if (!(block.who === 'group' || block.who === 'concerned')) return null;
    const variants = testVariants(block);
    if (variants.length !== 2 || variants.some(function (v) { return v.action; })) return null;
    return variants;
  }
  function groupAssignmentOf(ses, block, hero, variants) {
    const map = (ses.groupSkillPick && ses.groupSkillPick[block.id]) || {};
    if (map[hero.id] === 0 || map[hero.id] === 1) return map[hero.id];
    const a = heroTestInfo(ses, hero, variants[0].skill);
    const b = heroTestInfo(ses, hero, variants[1].skill);
    return (b.bonus + b.talentSucc) > (a.bonus + a.talentSucc) ? 1 : 0;
  }
  function groupSplitPillsHtml(ses, block, heroes, variants) {
    const cols = [[], []];
    heroes.forEach(function (h) { cols[groupAssignmentOf(ses, block, h, variants)].push(h); });
    function colHtml(vi) {
      const v = variants[vi];
      return '<div class="ses-split-col">' +
        '<div class="ses-split-head"><span class="ssk-skill skill-' + slug(v.skill || '') + '">' + esc(v.skill || '') + '</span>' +
          ' <span class="ssk-diff ssk-diff-' + (v.difficulty || 'moyen') + '">' + (ST_DIFF_LABEL[v.difficulty] || 'Moyen') + '</span></div>' +
        (cols[vi].length ? cols[vi].map(function (h) {
          const info = heroTestInfo(ses, h, v.skill);
          return '<div class="ses-skill-pill ses-split-pill">' +
            '<button type="button" class="ssk-swap" data-hero="' + esc(h.id) + '" title="Basculer ' + esc(h.name) + ' vers « ' + esc(variants[1 - vi].skill || '') + ' »">⇄</button>' +
            '<span class="ssk-hero">' + esc(h.name) + '</span>' +
            '<span class="ssk-skill skill-' + slug(v.skill || '') + '">' + (1 + info.bonus) + diceTag(v.difficulty, block.actionMode) + '</span>' +
            (info.talentSucc ? '<span class="ssk-tal">+' + info.talentSucc + '</span>' : '') +
          '</div>';
        }).join('') : '<div class="hint ses-split-empty">Personne</div>') +
      '</div>';
    }
    return '<div class="ses-split-wrap">' + colHtml(0) + '<div class="ses-split-arrows" aria-hidden="true">⇄</div>' + colHtml(1) + '</div>';
  }
  function wireGroupSplit(slot, ses, block) {
    slot.querySelectorAll('.ssk-swap').forEach(function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        const variants = groupSplitInfo(block);
        const hid = b.getAttribute('data-hero');
        const h = aliveEngagedHeroes(ses).find(function (x) { return x.id === hid; });
        if (!variants || !h) return;
        if (!ses.groupSkillPick) ses.groupSkillPick = {};
        const m = ses.groupSkillPick[block.id] || (ses.groupSkillPick[block.id] = {});
        m[hid] = 1 - groupAssignmentOf(ses, block, h, variants);
        save();
        if (global.App) App.renderForTab('session');
      });
    });
  }
  // Vignette(s) de testeur sous un bouton, pour une compétence donnée.
  function variantHelperFor(ses, block, scene, skill, excludeIds, diff) {
    const dTag = diceTag(diff == null ? block.difficulty : diff, block.actionMode);
    const groupLike = !block.actionMode && (block.who === 'group' || block.who === 'concerned');
    if (groupLike) {
      const heroes = (block.who === 'concerned') ? (concernedHeroes(scene, block, ses) || []) : aliveEngagedHeroes(ses);
      return heroes.length
        ? '<div class="ses-group-pills">' + heroes.map(function (h) {
            const info = heroTestInfo(ses, h, skill);
            return '<div class="ses-skill-pill">' +
              '<span class="ssk-hero">' + esc(h.name) + '</span>' +
              '<span class="ssk-skill skill-' + slug(skill || '') + '">' + esc(skill || '') + ' ' + (1 + info.bonus) + dTag + '</span>' +
              (info.talentSucc ? '<span class="ssk-tal">+' + info.talentSucc + ' réussite' + (info.talentSucc > 1 ? 's' : '') + '</span>' : '') +
            '</div>';
          }).join('') + '</div>'
        : '<div class="ses-skill-pill ssk-none">Aucun aventurier disponible pour ce test</div>';
    }
    const bh = singleTester(ses, block, excludeIds || null, skill);
    const dice = 1 + (bh.bonus || 0);
    const randTag = block.who === 'random' ? '<span class="ssk-rand" title="Aventurier désigné au hasard">au hasard</span>' : '';
    // MEILLEUR AVENTURIER : le désigné est modifiable — la vignette est un menu
    // déroulant (le meilleur est proposé par défaut). Aléatoire / Groupe / Concernés : figé.
    if (block.who !== 'random' && block.who !== 'group' && block.who !== 'concerned') {
      const alive = aliveEngagedHeroes(ses).filter(function (h) {
        return !(Array.isArray(excludeIds) && excludeIds.indexOf(h.id) >= 0);
      });
      if (!bh.hero || !alive.length) return '<div class="ses-skill-pill ssk-none">Aucun aventurier disponible pour ce test</div>';
      stableBestHero(ses, block, skill, excludeIds); // fige le choix par défaut
      return '<div class="ses-skill-pill ssk-player-pick">' +
          '<select class="ssk-pick" data-block="' + esc(block.id) + '" title="Cliquez pour changer d\'aventurier">' +
            alive.map(function (h) {
              return '<option value="' + esc(h.id) + '"' + (h.id === bh.hero.id ? ' selected' : '') + '>' +
                esc(h.name) + '</option>';
            }).join('') +
          '</select>' +
          '<span class="ssk-skill skill-' + slug(skill || '') + '">' + esc(skill || '') + ' ' + dice + dTag + '</span>' +
          (bh.talentSucc ? '<span class="ssk-tal">+' + bh.talentSucc + ' réussite' + (bh.talentSucc > 1 ? 's' : '') + '</span>' : '') +
        '</div>';
    }
    return bh.hero
      ? '<div class="ses-skill-pill">' +
          '<span class="ssk-hero">' + esc(bh.hero.name) + '</span>' + randTag +
          '<span class="ssk-skill skill-' + slug(skill || '') + '">' + esc(skill || '') + ' ' + dice + dTag + '</span>' +
          (bh.talentSucc ? '<span class="ssk-tal">+' + bh.talentSucc + ' réussite' + (bh.talentSucc > 1 ? 's' : '') + '</span>' : '') +
        '</div>'
      : '<div class="ses-skill-pill ssk-none">Aucun aventurier disponible pour ce test</div>';
  }
  // Ligne de boutons de choix (test/actions). Deux rangées : les boutons côte à
  // côte (le « ou » centré à mi-hauteur entre eux), puis les vignettes de testeur
  // alignées dessous. Sur un bouton de test, le libellé occupe la 1re ligne et les
  // cartouches compétence + difficulté sont regroupés sur la 2e ligne.
  function variantButtonsHtml(ses, block, scene, excludeIds) {
    const variants = testVariants(block);
    // GROUPE à 2 compétences : un seul bouton — chaque aventurier teste la
    // compétence de sa colonne (bascule ⇄ pour répartir).
    const splitVars = groupSplitInfo(block);
    if (splitVars) {
      const heroes = (block.who === 'concerned') ? (concernedHeroes(scene, block, ses) || []) : aliveEngagedHeroes(ses);
      return '<div class="ses-tb-variants">' +
        '<div class="ses-tb-btnrow">' +
          '<button class="ses-choice-btn skill-test choice-type-enquete ses-tb-go' +
            (splitVars.every(function (v) { return v.difficulty === 'auto'; }) ? ' ses-noroll' : '') + '" data-vi="0">' +
            '<span class="ssk-btn-label">' + esc(block.label || 'Tenter le test') + '</span>' +
            '<span class="ssk-btn-meta">👥 chacun selon sa colonne</span>' +
          '</button>' +
        '</div>' +
        (heroes.length ? groupSplitPillsHtml(ses, block, heroes, splitVars)
          : '<div class="ses-skill-pill ssk-none">Aucun aventurier disponible pour ce test</div>') +
        rareResolveButtonHtml(ses, block) +
      '</div>';
    }
    const multi = variants.length > 1;
    function btnHtml(v, vi) {
      if (v.action) {
        return '<button class="ses-choice-btn skill-test choice-type-enquete ses-tb-go ses-tb-action" data-vi="' + vi + '">' +
          esc(v.label || 'Agir') + '</button>';
      }
      return '<button class="ses-choice-btn skill-test sktest-' + slug(v.skill || '') + ' choice-type-enquete ses-tb-go' +
          (v.difficulty === 'auto' ? ' ses-noroll' : '') + '" data-vi="' + vi + '">' +
        '<span class="ssk-btn-label">' + esc(block.label || 'Tenter le test') + '</span>' +
        '<span class="ssk-btn-meta">' +
          '<span class="ssk-skill skill-' + slug(v.skill || '') + '">' + esc(v.skill || '') + '</span>' +
          '<span class="ssk-diff ssk-diff-' + (v.difficulty || 'moyen') + '">' + (ST_DIFF_LABEL[v.difficulty] || 'Moyen') + '</span>' +
        '</span>' +
      '</button>';
    }
    const btnRow = '<div class="ses-tb-btnrow">' +
      variants.map(function (v, vi) { return btnHtml(v, vi); }).join(multi ? '<div class="ses-tb-or">ou</div>' : '') +
    '</div>';
    let pillRow = '';
    if (variants.some(function (v) { return !v.action; })) {
      pillRow = '<div class="ses-tb-pillrow">' +
        variants.map(function (v, vi) {
          return '<div class="ses-tb-pillcell">' + (v.action ? '' : variantHelperFor(ses, block, scene, v.skill, excludeIds, v.difficulty)) + '</div>';
        }).join(multi ? '<div class="ses-tb-or ses-tb-or-ghost" aria-hidden="true">ou</div>' : '') +
      '</div>';
    }
    return '<div class="ses-tb-variants' + (multi ? ' ses-tb-multi' : '') + '">' + btnRow + pillRow + rareResolveButtonHtml(ses, block) + '</div>';
  }
  // Bouton « Objet Rare » : si le groupe possède l'Objet Rare configuré sur le bloc,
  // un bouton avec sa vignette permet de réussir le test / l'action automatiquement.
  function rareResolveButtonHtml(ses, block) {
    if (!block.rareKeyName) return '';
    const r = ownedRare(ses, block.rareKeyName);
    if (!r) return '';
    return '<div class="ses-tb-rarewrap">' +
      '<button class="ses-tb-rare" title="Utiliser « ' + esc(block.rareKeyName) + ' » pour réussir automatiquement' + (block.rareConsume ? ' (l\'objet sera consommé)' : '') + '">' +
        '<span class="ses-rare-ico">🗝️</span>' +
        '<span class="ses-rare-body">' +
          '<span class="ses-rare-name">' + esc(block.rareKeyName) + (r.qty > 1 ? ' <span class="ses-rare-qty">×' + r.qty + '</span>' : '') + '</span>' +
          '<span class="ses-rare-act">Réussite automatique' + (block.rareConsume ? ' · consommé' : '') + '</span>' +
        '</span>' +
      '</button></div>';
  }
  // Résout un test / une action grâce à un Objet Rare possédé (réussite garantie,
  // objet éventuellement consommé).
  function resolveTestWithRare(ses, adv, scene, block) {
    const r = ownedRare(ses, block.rareKeyName);
    if (!r) { render(); return; }
    if (block.rareConsume) {
      r.qty = (r.qty || 1) - 1;
      if (r.qty <= 0) ses.treasures = ses.treasures.filter(function (t) { return t !== r; });
      document.dispatchEvent(new CustomEvent('inventory-new-item'));
    }
    runTestBlock(ses, adv, scene, block, null, { rareAuto: true, rareName: block.rareKeyName, skill: block.skill, difficulty: block.difficulty });
  }
  // Câble les boutons de choix d'un bloc. excludeIds : re-test « avec un autre ».
  function wireVariantButtons(slot, ses, adv, scene, block, excludeIds) {
    const variants = testVariants(block);
    slot.querySelectorAll('.ses-tb-go').forEach(function (b) {
      b.addEventListener('click', function () {
        runTestBlock(ses, adv, scene, block, excludeIds || null, variants[parseInt(b.getAttribute('data-vi'), 10) || 0]);
      });
    });
    const rareBtn = slot.querySelector('.ses-tb-rare');
    if (rareBtn) rareBtn.addEventListener('click', function () { resolveTestWithRare(ses, adv, scene, block); });
    // Bascules ⇄ de la répartition d'un test de groupe à 2 compétences.
    wireGroupSplit(slot, ses, block);
    // AU CHOIX DU JOUEUR : mémorise l'aventurier sélectionné et rafraîchit la
    // vignette (dés / réussites de talent recalculés pour l'élu).
    slot.querySelectorAll('.ssk-pick').forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (!ses.playerTestPick) ses.playerTestPick = {};
        ses.playerTestPick[sel.getAttribute('data-block')] = sel.value;
        save();
        if (global.App) App.renderForTab('session');
      });
    });
  }
  // Champ de saisie d'un bloc ÉCRITURE (énigme / mot de passe) : description,
  // consigne, zone de texte + bouton Valider. Tolérance gérée par writeMatches.
  function renderWriteBlock(slot, block, scene, adv, ses) {
    slot.innerHTML = '<div class="ses-searchtest ses-write">' +
      '<div class="ses-st-title">✍️ ' + esc(block.label || 'Écriture') +
        (block.mandatory ? ' <span class="ses-st-mandatory">🔒 Obligatoire</span>' : '') + '</div>' +
      (block.writeDesc && block.writeDesc.trim() ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(block.writeDesc) + '</div>' : '') +
      '<div class="ses-write-consigne">' + esc(block.writeInstruction || 'Écrivez exactement 1 mot') + '</div>' +
      '<div class="ses-write-row">' +
        '<input type="text" class="ses-write-input" placeholder="Votre réponse…" autocomplete="off" />' +
        '<button class="primary ses-write-go">Valider</button>' +
      '</div>' +
    '</div>';
    const input = slot.querySelector('.ses-write-input');
    const go = slot.querySelector('.ses-write-go');
    const submit = function () {
      const val = input ? input.value : '';
      if (!val.trim()) { if (input) input.focus(); return; }
      runTestBlock(ses, adv, scene, block, null, { write: true, answer: val });
    };
    if (go) go.addEventListener('click', submit);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }
  function renderTestBlock(slot, block, scene, adv, ses) {
    if (!ses.searchTests) ses.searchTests = {};
    const state = ses.searchTests[block.id];
    if (!state) {
      if (block.writeMode) { renderWriteBlock(slot, block, scene, adv, ses); return; }
      const isAction = !!block.actionMode;
      slot.innerHTML = '<div class="ses-searchtest">' +
        '<div class="ses-st-title">' + esc(block.label || (isAction ? 'Action' : 'Test de compétence')) +
          (block.mandatory ? ' <span class="ses-st-mandatory">🔒 Obligatoire</span>' : '') +
          (!isAction && block.who === 'group' ? ' <span class="ses-st-group-tag" title="' + esc(groupModeLabel(block.groupMode)) + '">👥 GROUPE</span>' : '') + '</div>' +
        variantButtonsHtml(ses, block, scene, null) +
      '</div>';
      wireVariantButtons(slot, ses, adv, scene, block, null);
      return;
    }
    renderTestBlockResult(slot, block, scene, adv, ses, state);
  }

  // Mode de nouvelle tentative d'un bloc de test (rétro-compat ancien booléen).
  function retryModeOf(block) {
    return block.retryMode || (block.retry ? 'always' : 'none');
  }
  // Test « parent » qui a révélé ce bloc (par une chaîne réussite/échec), avec
  // le sens de la chaîne. Renvoie { block, viaSuccess } ou null.
  function chainParentOf(scene, block) {
    const blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    for (let i = 0; i < blocks.length; i++) {
      const p = blocks[i];
      if ((p.type !== 'test' && p.type !== 'fight') || p.id === block.id) continue;
      if (chainIdsOf(p, 'success').indexOf(block.id) >= 0) return { block: p, viaSuccess: true };
      if (chainIdsOf(p, 'fail').indexOf(block.id) >= 0) return { block: p, viaSuccess: false };
    }
    return null;
  }
  // Aventuriers « concernés » par un test enchaîné : ceux qui ont réussi (chaîne
  // de réussite) ou échoué (chaîne d'échec) le test parent. Renvoie un tableau
  // d'objets héros (vivants), ou null si le parent n'a pas de résultats exploitables.
  function concernedHeroes(scene, block, ses) {
    const par = chainParentOf(scene, block);
    if (!par) return null;
    const st = ses.searchTests && ses.searchTests[par.block.id];
    if (!st || !st.done) return null;
    let ids = [];
    if (st.group && Array.isArray(st.results)) {
      ids = st.results.filter(function (r) { return par.viaSuccess ? r.passed : !r.passed; }).map(function (r) { return r.heroId; });
    } else if (st.heroId) {
      // Test parent individuel : l'unique testeur est concerné si le sens colle.
      if ((par.viaSuccess && st.success) || (!par.viaSuccess && !st.success)) ids = [st.heroId];
    }
    const alive = aliveEngagedHeroes(ses);
    return ids.map(function (id) { return alive.find(function (h) { return h.id === id; }); }).filter(Boolean);
  }

  function runTestBlock(ses, adv, scene, block, excludeIds, variant) {
    if (!ses.searchTests) ses.searchTests = {};
    // Blocs actuellement MASQUÉS (tests enchaînés non révélés) : ceux qui
    // apparaissent après ce jet recevront l'animation de révélation.
    const hiddenBefore = (scene.blocks || []).filter(function (b) {
      return b.type === 'test' && testChainHidden(scene, b, ses);
    }).map(function (b) { return b.id; });
    let state;
    // Compétence/difficulté réellement testées : variante choisie (2e bouton),
    // sinon celle mémorisée (relance), sinon la principale du bloc.
    const prevSt = ses.searchTests[block.id];
    const v = variant || (prevSt && prevSt.variant) || { skill: block.skill, difficulty: block.difficulty };
    const groupLike = !block.actionMode && (block.who === 'group' || block.who === 'concerned');
    if (variant && variant.write) {
      // BLOC ÉCRITURE : la réussite dépend du mot saisi (tolérance : casse, accents,
      // pluriel). Réussite → récompenses ; échec → conséquence d'échec.
      const passed = writeMatches(block, variant.answer);
      state = { done: true, success: passed, claimed: false, write: true, answer: (variant.answer || '').trim() };
      if (passed) {
        const xpGain = Math.max(0, Store.rollAmount(block.xpReward));
        if (xpGain > 0) { ses.party.xp = (ses.party.xp || 0) + xpGain; state.xpGained = xpGain; }
        grantDeedReward(ses, scene, block);
        applyWinEffect(ses, block);
        grantTreasures(ses, block, block.id);
      } else {
        state.fxMsg = applyTestFailEffect(ses, scene, block, aliveEngagedHeroes(ses)[0] || null) || '';
      }
    } else if (variant && variant.rareAuto) {
      // RÉSOLUTION PAR UN OBJET RARE : réussite garantie, sans jet. Applique les
      // récompenses de réussite exactement comme une réussite classique.
      state = { done: true, success: true, claimed: false, rareAuto: true, rareName: variant.rareName || '',
        hero: '', heroId: null, rolls: [], succ: 0, need: 0 };
      if (block.actionMode) state.action = true;
      const xpGain = Math.max(0, Store.rollAmount(block.xpReward));
      if (xpGain > 0) { ses.party.xp = (ses.party.xp || 0) + xpGain; state.xpGained = xpGain; }
      grantDeedReward(ses, scene, block);
      applyWinEffect(ses, block);
      grantTreasures(ses, block, block.id);
    } else if (block.actionMode) {
      // Bloc ACTION : pas de jet — l'Action 1 applique l'issue « réussite »
      // (récompenses, effet, passage), l'Action 2 l'issue « échec » (conséquence).
      const ok = !(v && v.action === 2);
      state = { done: true, success: ok, claimed: false, action: true };
      if (ok) {
        const xpGain = Math.max(0, Store.rollAmount(block.xpReward));
        if (xpGain > 0) { ses.party.xp = (ses.party.xp || 0) + xpGain; state.xpGained = xpGain; }
        grantDeedReward(ses, scene, block);
        applyWinEffect(ses, block);
        grantTreasures(ses, block, block.id);
      } else {
        const h = aliveEngagedHeroes(ses)[0] || null;
        state.fxMsg = applyTestFailEffect(ses, scene, block, h) || '';
      }
    } else if (groupLike) {
      // GROUPE (tous) ou CONCERNÉS (sous-ensemble d'une chaîne) : chacun lance le
      // test ; réussite globale selon le seuil choisi ; les conséquences d'échec
      // s'appliquent INDIVIDUELLEMENT à chaque aventurier qui a raté.
      let heroList = (block.who === 'concerned') ? (concernedHeroes(scene, block, ses) || []) : aliveEngagedHeroes(ses);
      // NOUVELLE TENTATIVE d'un test collectif : les RÉUSSITES précédentes sont
      // ACQUISES (affichées ✓) — seuls les aventuriers ayant échoué relancent.
      const prev = ses.searchTests[block.id];
      let keptResults = [];
      if (prev && prev.group && Array.isArray(prev.results)) {
        keptResults = prev.results.filter(function (r) { return r.passed; });
        const passedIds = keptResults.map(function (r) { return r.heroId; });
        heroList = heroList.filter(function (h) { return passedIds.indexOf(h.id) < 0; });
      }
      // GROUPE à 2 compétences : chaque aventurier lance le test de SA colonne.
      const splitVars = groupSplitInfo(block);
      let gr;
      if (splitVars) {
        const colA = heroList.filter(function (h) { return groupAssignmentOf(ses, block, h, splitVars) === 0; });
        const colB = heroList.filter(function (h) { return groupAssignmentOf(ses, block, h, splitVars) === 1; });
        const grA = runGroupRolls(ses, splitVars[0].skill, splitVars[0].difficulty, colA, block.groupMode);
        const grB = runGroupRolls(ses, splitVars[1].skill, splitVars[1].difficulty, colB, block.groupMode);
        grA.results.forEach(function (r) { r.skill = splitVars[0].skill; });
        grB.results.forEach(function (r) { r.skill = splitVars[1].skill; });
        gr = { results: grA.results.concat(grB.results), need: grA.need };
      } else {
        gr = runGroupRolls(ses, v.skill, v.difficulty, heroList, block.groupMode);
      }
      // Résultats fusionnés (acquis + nouveaux jets) ; verdict sur l'ensemble.
      const merged = keptResults.concat(gr.results);
      const passed = groupVerdict(merged, block.groupMode);
      state = { done: true, success: passed, claimed: false, group: true, results: merged, need: gr.need };
      const msgs = [];
      gr.results.forEach(function (r) {
        if (r.passed) return;
        const h = Store.state.heroes.find(function (x) { return x.id === r.heroId; });
        const m = applyTestFailEffect(ses, scene, block, h);
        if (m) msgs.push(m);
      });
      state.fxMsgs = msgs;
      if (passed) {
        const xpGain = Math.max(0, Store.rollAmount(block.xpReward));
        if (xpGain > 0) { ses.party.xp = (ses.party.xp || 0) + xpGain; state.xpGained = xpGain; }
        grantDeedReward(ses, scene, block);
        applyWinEffect(ses, block);
        grantTreasures(ses, block, block.id);
      }
    } else {
      // Exclusions (mode « avec un autre aventurier ») : les aventuriers ayant
      // déjà tenté ce test ne sont plus candidats.
      const bh = singleTester(ses, block, excludeIds, v.skill);
      const res = rollSkill(bh.bonus);
      const need = diffNeed(v.difficulty);
      const total = res.successes + (bh.talentSucc || 0);
      const passed = total >= need;
      state = { done: true, success: passed, claimed: false, rolls: res.rolls, succ: total, need: need,
        hero: bh.hero ? bh.hero.name : '', heroId: bh.hero ? bh.hero.id : null,
        attempted: (Array.isArray(excludeIds) ? excludeIds.slice() : []).concat(bh.hero ? [bh.hero.id] : []) };
      // XP de récompense : valeur fixe ou tirage de dés (« 1d6 »), résolu ici.
      if (passed) {
        const xpGain = Math.max(0, Store.rollAmount(block.xpReward));
        if (xpGain > 0) { ses.party.xp = (ses.party.xp || 0) + xpGain; state.xpGained = xpGain; }
        grantDeedReward(ses, scene, block);
        applyWinEffect(ses, block);
        grantTreasures(ses, block, block.id);
      }
      // Conséquence de l'échec, appliquée à l'aventurier qui a tenté le test.
      if (!passed) state.fxMsg = applyTestFailEffect(ses, scene, block, bh.hero) || '';
    }
    // COMA sur la conséquence d'échec : les alliés sortent et réaniment le blessé —
    // le test est considéré RÉUSSI automatiquement (récompenses accordées).
    if (comaRescue && state && state.done && !state.success) {
      state.success = true;
      state.comaRescue = true;
      const xpGain = Math.max(0, Store.rollAmount(block.xpReward));
      if (xpGain > 0) { ses.party.xp = (ses.party.xp || 0) + xpGain; state.xpGained = xpGain; }
      grantDeedReward(ses, scene, block);
      applyWinEffect(ses, block);
      grantTreasures(ses, block, block.id);
    }
    comaRescue = null;
    // Variante utilisée (compétence/difficulté) — réutilisée aux relances.
    state.variant = v;
    // Niveau du groupe au moment de la tentative (re-test « montée de niveau »).
    state.levelAt = sessionLevel(ses);
    // Marque l'ENTRÉE de scène où le test a été résolu (affichage compact au retour).
    if (ses.entryId == null) ses.entryId = 1;
    state.entryId = ses.entryId;
    ses.searchTests[block.id] = state;
    // Rattrapage : réussir ce test « valide » rétroactivement le test parent qui
    // l'a révélé (débloque son passage / connecteur secret).
    if (state.success && block.validatesParent) {
      const par = chainParentOf(scene, block);
      if (par && ses.searchTests[par.block.id]) {
        const pst = ses.searchTests[par.block.id];
        // Mémorise l'issue d'origine (souvent un échec) AVANT de débloquer, pour
        // continuer d'afficher le récit d'échec du parent, distinct du rattrapage.
        if (pst.wasFail == null) pst.wasFail = !pst.success;
        pst.success = true;        // débloque le passage / connecteur du parent
        pst.validated = true;      // marque « rattrapé »
        pst.validatedBy = block.label || 'un test enchaîné';
      }
    }
    save();
    // Blocs fraîchement révélés par ce jet (+ le résultat du test lui-même) :
    // marqués pour l'animation de révélation appliquée après le re-rendu.
    justRevealedIds = hiddenBefore.filter(function (id) {
      const b = (scene.blocks || []).find(function (x) { return x.id === id; });
      return b && !testChainHidden(scene, b, ses);
    }).concat([block.id]);
    render();
  }
  // Ids des blocs à animer au prochain rendu de scène (transitoire, non persisté).
  let justRevealedIds = [];
  function applyRevealAnimations() {
    if (!justRevealedIds.length) return;
    justRevealedIds.forEach(function (id) {
      const sel = '[data-tb="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]';
      const el = document.querySelector('.ses-test-slot' + sel + ', .scene-block' + sel);
      if (el) el.classList.add('ses-reveal');
    });
    justRevealedIds = [];
  }

  // Applique la conséquence d'un échec au test (block.failEffect) et renvoie le
  // message à afficher dans l'encadré d'échec.
  const FX_STATE_LABEL = { affaibli: 'Affaibli', auSol: 'Au sol', feu: 'Feu', poison: 'Poison', brise: 'Brisé', faille: 'Faille' };
  // Drapeau posé par la conséquence « perte de PV » quand les dégâts sont létaux :
  // l'aventurier tombe au coma et le test devient une réussite automatique.
  let comaRescue = null;
  const FX_SLOT_LABEL = { mainG: 'main gauche', mainD: 'main droite', randhand: 'main', armor: 'armure', object: 'objet équipé' };
  // Accord selon le genre de l'aventurier (il / elle / on).
  function heroPronoun(h) { return (global.Combatants && Combatants.pronoun) ? Combatants.pronoun(h) : 'il'; }
  function heroAgree(h, w, fem) { return (global.Combatants && Combatants.agree) ? Combatants.agree(h, w, fem) : w; }
  function applyTestFailEffect(ses, scene, block, hero) {
    const fx = block.failEffect;
    if (!fx || !fx.kind || fx.kind === 'none') return '';
    // DÉMARRER UN COMBAT : conséquence collective (indépendante d'un aventurier).
    if (fx.kind === 'combat') {
      const already = ses.forcedCombat && ses.forcedCombat.sceneId === scene.id;
      triggerForcedCombat(ses, scene.id, fx.combat);
      // Mémorise les aventuriers AYANT ÉCHOUÉ (placement de départ dédié possible).
      if (ses.forcedCombat && hero) {
        if (!Array.isArray(ses.forcedCombat.failedHeroIds)) ses.forcedCombat.failedHeroIds = [];
        if (ses.forcedCombat.failedHeroIds.indexOf(hero.id) < 0) { ses.forcedCombat.failedHeroIds.push(hero.id); save(); }
      }
      return already ? '' : '⚔️ Un combat se déclenche !';
    }
    const hid = hero ? hero.id : ((ses.heroIds && ses.heroIds[0]) || null);
    const h = Store.state.heroes.find(function (x) { return x.id === hid; });
    if (!h) return '';
    const name = h.name;
    if (!ses.heroStates) ses.heroStates = {};
    const st = ses.heroStates[hid] || (ses.heroStates[hid] = { pv: Combatants.heroPv(h) });
    // Valeur fixe ou tirage de dés (« 2d6 ») ; le tirage est rappelé dans le message.
    const n = Math.max(1, Store.rollAmount(fx.val == null ? 1 : fx.val));
    const diceNote = Store.isDiceExpr(fx.val) ? ' (' + String(fx.val).trim() + ')' : '';
    switch (fx.kind) {
      case 'pv': {
        const cur = (typeof st.pv === 'number') ? st.pv : Combatants.heroPv(h);
        const after = cur - n;
        if (after >= 1) {
          st.pv = after;
          return name + ' perd ' + n + ' PV' + diceNote + '.';
        }
        // Dégâts LÉTAUX : chute au COMA (perte d'1 VIE). Ses alliés le sortent et
        // le réaniment — le test est réussi AUTOMATIQUEMENT (drapeau comaRescue,
        // lu par runTestBlock). Dernière VIE perdue → éliminé définitivement.
        st.viePenalty = (st.viePenalty || 0) - 1;
        const g = ses.levelGains ? ses.levelGains[hid] : null;
        const vieLeft = (h.vie || 0) + ((g && g.vie) || 0) + (st.viePenalty || 0);
        if (vieLeft <= 0) {
          st.pv = 0;
          st.dead = true;
          comaRescue = { name: name, dead: true };
          return name + ' perd ' + n + ' PV' + diceNote + ', tombe au coma et perd sa DERNIÈRE VIE — ' +
            heroPronoun(h) + ' quitte l\'aventure définitivement. Ses alliés achèvent l\'épreuve à sa place.';
        }
        const maxPv = Math.max(1, Combatants.heroPv(effectiveHero(ses, h)));
        st.pv = Math.max(1, Math.floor(maxPv / 2));
        comaRescue = { name: name, dead: false };
        return name + ' perd ' + n + ' PV' + diceNote + ', tombe au coma et perd 1 VIE (' + vieLeft + ' restante' + (vieLeft > 1 ? 's' : '') + ') — ses alliés ' + (Combatants.genderOf(h) === 'f' ? 'la' : 'le') + ' sortent et ' + (Combatants.genderOf(h) === 'f' ? 'la' : 'le') + ' réaniment (' + st.pv + ' PV).';
      }
      case 'state': {
        const key = fx.state || 'affaibli';
        if (!ses.pendingStates) ses.pendingStates = {};
        (ses.pendingStates[hid] = ses.pendingStates[hid] || []).push(key);
        return name + ' subira l\'état « ' + (FX_STATE_LABEL[key] || key) + ' » au prochain combat.';
      }
      case 'xp': {
        ses.party.xp = Math.max(0, (ses.party.xp || 0) - n);
        return 'Le groupe perd ' + n + ' XP' + diceNote + '.';
      }
      case 'item': {
        const eq = Combatants.normalizeEquip ? Combatants.normalizeEquip(h.equipment || {}) : (h.equipment || {});
        let slotKey = fx.slot || 'randhand';
        if (slotKey === 'randhand') {
          const hands = [eq.mainG ? 'mainG' : null, eq.mainD ? 'mainD' : null].filter(Boolean);
          slotKey = hands.length ? hands[Math.floor(Math.random() * hands.length)] : 'mainD';
        }
        const field = slotKey === 'armor' ? 'armorId' : slotKey === 'object' ? 'objectId' : slotKey;
        const itemId = eq[field];
        if (!itemId) return name + ' n\'avait rien à perdre (' + (FX_SLOT_LABEL[fx.slot] || fx.slot) + ' vide).';
        const it = Store.state.items.find(function (x) { return x.id === itemId; });
        eq[field] = null;
        h.equipment = eq;
        // L'objet quitte aussi l'inventaire personnel de l'aventurier.
        if (ses.heroOwned && ses.heroOwned[hid] && ses.heroOwned[hid][itemId]) {
          const left = (Number(ses.heroOwned[hid][itemId]) || 1) - 1;
          if (left > 0) ses.heroOwned[hid][itemId] = left; else delete ses.heroOwned[hid][itemId];
        }
        Store.save();
        return name + ' perd « ' + (it ? it.name : 'un objet') + ' » (' + (FX_SLOT_LABEL[slotKey] || slotKey) + ').';
      }
      case 'vie': {
        st.viePenalty = (st.viePenalty || 0) - n;
        // Le maximum de PV baisse : les PV courants sont plafonnés dessus.
        const maxPv = Math.max(1, Combatants.heroPv(effectiveHero(ses, h)));
        if (typeof st.pv === 'number') st.pv = Math.max(1, Math.min(st.pv, maxPv));
        return name + ' perd ' + n + ' VIE' + diceNote + '.';
      }
      case 'death': {
        st.pv = 0;
        st.dead = true;
        return '☠ ' + name + ' meurt !';
      }
      case 'deed': {
        const text = (fx.text || '').trim();
        if (!text) return '';
        if (!Array.isArray(ses.deeds)) ses.deeds = [];
        const key = scene.id + '#' + block.id;
        if (!ses.deeds.some(function (d) { return d.sceneId === key; })) {
          ses.deeds.push({ sceneId: key, text: text });
        }
        return name + ' subit un Haut Fait : « ' + text + ' » (ajouté au journal).';
      }
    }
    return '';
  }

  // Enregistre le Haut Fait gagné lors de la réussite d'un test (une seule fois).
  function grantDeedReward(ses, scene, block) {
    const text = (block.deedReward || '').trim();
    if (!text) return;
    if (!Array.isArray(ses.deeds)) ses.deeds = [];
    const key = scene.id + '#' + block.id + '#win';
    if (!ses.deeds.some(function (d) { return d.sceneId === key; })) {
      ses.deeds.push({ sceneId: key, text: text });
    }
  }

  // Attribue les objets d'un bloc de test réussi aux aventuriers désignés.
  function grantTestItems(ses, block) {
    const assign = {};
    document.querySelectorAll('.stp-hero[data-tb="' + block.id + '"]').forEach(function (sel) {
      assign[parseInt(sel.getAttribute('data-idx'), 10)] = sel.value;
    });
    if (!ses.acquiredItems) ses.acquiredItems = {};
    if (!ses.heroOwned) ses.heroOwned = {};
    const fallback = (ses.heroIds && ses.heroIds[0]) || null;
    const roll = rewardRoll(ses, block.id, block);
    (block.itemRewards || []).forEach(function (r, idx) {
      if (!r.itemId) return;
      const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
      if (!it) return;
      const q = roll.iq[idx] || 1;
      it.qty = (it.qty || 0) + q;
      ses.acquiredItems[r.itemId] = (ses.acquiredItems[r.itemId] || 0) + q;
      const rec = assign[idx] || fallback;
      if (rec) addToHeroOwned(ses, rec, r.itemId, q);
    });
    Store.save();
    if ((block.itemRewards || []).some(function (r) { return r.itemId; })) {
      document.dispatchEvent(new CustomEvent('inventory-new-item'));
    }
  }

  // Résultats individuels d'un test de GROUPE (✓/✗ par aventurier).
  function groupResultsHtml(state) {
    if (!state.group || !Array.isArray(state.results)) return '';
    return '<div class="ses-st-groupres">' + state.results.map(function (r) {
      return '<div class="ses-st-gr ' + (r.passed ? 'ok' : 'ko') + '">' + (r.passed ? '✓' : '✗') + ' ' +
        esc(r.name) +
        (r.skill ? ' <span class="ssk-skill skill-' + slug(r.skill) + '">' + esc(r.skill) + '</span>' : '') +
        ' <span class="ses-st-gr-roll">' + r.succ + '/' + r.need + ' · dés : ' + (r.rolls || []).join(', ') + '</span></div>';
    }).join('') + '</div>';
  }
  // Conséquences individuelles (une ligne ⚠ par aventurier ayant échoué).
  function fxMsgsHtml(state) {
    let html = '';
    if (state.fxMsg) html += '<div class="ses-st-fx">⚠ ' + esc(state.fxMsg) + '</div>';
    if (Array.isArray(state.fxMsgs)) state.fxMsgs.forEach(function (m) { html += '<div class="ses-st-fx">⚠ ' + esc(m) + '</div>'; });
    return html;
  }

  function renderTestBlockResult(slot, block, scene, adv, ses, state) {
    const mTag = block.mandatory ? ' <span class="ses-st-mandatory">🔒 Obligatoire</span>' : '';
    const stIcon = block.writeMode ? '✍️ ' : '';
    const stLabel = block.label || (block.writeMode ? 'Écriture' : block.actionMode ? 'Action' : 'Test de compétence');
    // Résultat obtenu lors d'une ENTRÉE ANTÉRIEURE (on est revenu dans la salle) :
    // version COMPACTE — on GARDE le titre, le verdict et le TEXTE narratif, mais on
    // masque les récompenses (XP, objets, Hauts Faits) et les résultats chiffrés.
    // Un test résolu pendant l'entrée courante reste complet (récompenses visibles).
    if (state.entryId != null && ses.entryId != null && state.entryId !== ses.entryId) {
      const ok = !!state.success;
      const rescuedC = state.validated && state.wasFail;
      const verdict = rescuedC
        ? '<span class="ses-st-verdict rescued">↩ Rattrapé</span>'
        : (ok ? '<span class="ses-st-verdict success">Réussite</span>' : '<span class="ses-st-verdict fail">Échec</span>');
      const narr = (rescuedC || !ok)
        ? (block.failText ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(block.failText) + '</div>' : '')
        : (block.successText ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(block.successText) + '</div>' : '');
      // Test échoué revu lors d'un retour dans la salle : si le groupe possède
      // désormais l'Objet Rare qui le résout, on propose quand même de l'utiliser.
      const rareBtnCompact = (!ok && !state.validated) ? rareResolveButtonHtml(ses, block) : '';
      slot.innerHTML = '<div class="ses-searchtest ses-st-done ses-st-compact ' +
        (ok || state.validated ? 'ses-st-success-box' : 'ses-st-fail-box') + '">' +
        '<div class="ses-st-title">' + stIcon + esc(stLabel) + mTag + ' — ' + verdict + '</div>' +
        narr +
        rareBtnCompact +
      '</div>';
      if (rareBtnCompact) {
        const rb = slot.querySelector('.ses-tb-rare');
        if (rb) rb.addEventListener('click', function () { resolveTestWithRare(ses, adv, scene, block); });
      }
      return;
    }
    if (!state.success) {
      // Nouvelle tentative selon le mode du bloc : à volonté, avec un autre
      // aventurier (1× chacun), ou après une montée de niveau du groupe.
      const mode = retryModeOf(block);
      // Test COLLECTIF : la relance conserve les réussites acquises — seuls les
      // aventuriers ayant échoué relancent (fusion des résultats dans runTestBlock).
      const isGroupRes = state.group && Array.isArray(state.results);
      let retryHtml = '';
      let retryAction = null; // 'reset' (efface l'état) | 'other' (exclusions) | 'group' (relance des seuls échoués)
      if (block.writeMode) {
        // Écriture : on peut toujours ressaisir le bon mot.
        retryHtml = '<div class="ses-st-actions"><button class="ghost ses-tb-retry">✍️ Réessayer</button></div>';
        retryAction = 'reset';
      } else if (mode === 'always') {
        const nFail = isGroupRes ? state.results.filter(function (r) { return !r.passed; }).length : 0;
        retryHtml = '<div class="ses-st-actions"><button class="ghost ses-tb-retry">🔁 Retenter le test' +
          (isGroupRes && nFail ? ' (' + nFail + ' aventurier' + (nFail > 1 ? 's' : '') + ' concerné' + (nFail > 1 ? 's' : '') + ')' : '') + '</button></div>';
        retryAction = isGroupRes ? 'group' : 'reset';
      } else if (mode === 'other' && !state.group) {
        const attempted = Array.isArray(state.attempted) ? state.attempted : (state.heroId ? [state.heroId] : []);
        const remaining = aliveEngagedHeroes(ses).filter(function (h) { return attempted.indexOf(h.id) < 0; });
        if (remaining.length) {
          // Test à plusieurs compétences : la relance « avec un autre aventurier »
          // ré-affiche les boutons de choix de compétence (excludeIds = déjà tentés),
          // pour qu'on puisse à nouveau choisir l'une ou l'autre option.
          if (testVariants(block).length > 1) {
            retryHtml = '<div class="hint ses-st-retry-hint">🔁 Retenter avec un autre aventurier (' + remaining.length + ' restant' + (remaining.length > 1 ? 's' : '') + ') :</div>' +
              variantButtonsHtml(ses, block, scene, attempted);
            retryAction = 'other-variants';
          } else {
            retryHtml = '<div class="ses-st-actions"><button class="ghost ses-tb-retry">🔁 Retenter avec un autre aventurier (' + remaining.length + ' restant' + (remaining.length > 1 ? 's' : '') + ')</button></div>';
            retryAction = 'other';
          }
        } else {
          retryHtml = '<div class="hint">Tous les aventuriers ont tenté leur chance.</div>';
        }
      } else if (mode === 'levelup') {
        if (sessionLevel(ses) > (state.levelAt || 1)) {
          retryHtml = '<div class="ses-st-actions"><button class="ghost ses-tb-retry">🔁 Retenter (nouveau niveau atteint)</button></div>';
          retryAction = isGroupRes ? 'group' : 'reset';
        } else {
          retryHtml = '<div class="hint">🔁 Retentable après une montée de niveau du groupe.</div>';
        }
      }
      slot.innerHTML = '<div class="ses-searchtest ses-st-done ses-st-fail-box">' +
        '<div class="ses-st-title">' + stIcon + esc(stLabel) + mTag + (state.group ? ' <span class="ses-st-group-tag">👥 GROUPE</span>' : '') + ' — <span class="ses-st-verdict fail">Échec</span></div>' +
        (block.failText ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(block.failText) + '</div>' : '') +
        groupResultsHtml(state) +
        fxMsgsHtml(state) +
        (state.write ? '<div class="hint ses-st-write-answer">✍️ Réponse saisie : « ' + esc(state.answer || '') + ' »</div>' : '') +
        (state.group || state.action || state.write ? '' : '<div class="hint ses-st-rolls">' + esc(state.hero || 'Le groupe') + ' — ' + (state.succ || 0) + '/' + (state.need || 0) + ' réussite(s) · dés : ' + (state.rolls || []).join(', ') + '</div>') +
        // GROUPE à 2 compétences retentable : les aventuriers en échec peuvent
        // être re-répartis (bascule ⇄) avant de relancer.
        (isGroupRes && retryAction && groupSplitInfo(block)
          ? (function () {
              const failedIds = state.results.filter(function (r) { return !r.passed; }).map(function (r) { return r.heroId; });
              const failedHeroes = aliveEngagedHeroes(ses).filter(function (h) { return failedIds.indexOf(h.id) >= 0; });
              return failedHeroes.length ? groupSplitPillsHtml(ses, block, failedHeroes, groupSplitInfo(block)) : '';
            })()
          : '') +
        retryHtml +
        // OBJET RARE : même APRÈS un échec (et même si le test n'est pas retentable),
        // si le groupe possède désormais l'Objet Rare, il peut l'utiliser pour réussir.
        rareResolveButtonHtml(ses, block) +
      '</div>';
      const failRareBtn = slot.querySelector('.ses-tb-rare');
      if (failRareBtn) failRareBtn.addEventListener('click', function () { resolveTestWithRare(ses, adv, scene, block); });
      // Bascules ⇄ de re-répartition avant une relance de test collectif.
      wireGroupSplit(slot, ses, block);
      if (retryAction === 'other-variants') {
        // Boutons de choix de compétence pour la relance « avec un autre aventurier ».
        const attempted = Array.isArray(state.attempted) ? state.attempted : (state.heroId ? [state.heroId] : []);
        wireVariantButtons(slot, ses, adv, scene, block, attempted);
      }
      const retryBtn = slot.querySelector('.ses-tb-retry');
      if (retryBtn) retryBtn.addEventListener('click', function () {
        if (retryAction === 'other') {
          const attempted = Array.isArray(state.attempted) ? state.attempted : (state.heroId ? [state.heroId] : []);
          runTestBlock(ses, adv, scene, block, attempted);
        } else if (retryAction === 'group') {
          // Relance directe : runTestBlock conserve les réussites précédentes et ne
          // fait relancer que les aventuriers ayant échoué.
          runTestBlock(ses, adv, scene, block);
        } else {
          delete ses.searchTests[block.id];
          save(); render();
        }
      });
      return;
    }
    const heroes = engagedHeroes(ses);
    const lines = (block.itemRewards || []).filter(function (r) { return r.itemId; });
    const needClaim = lines.length && !state.claimed;
    const heroOpts = heroes.map(function (h) { return '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>'; }).join('');
    // Tirage mis en cache : quantités d'objets affichées EN VALEUR (pas en dés).
    const roll = rewardRoll(ses, block.id, block);
    let rewardHtml = '';
    // XP réellement gagnée (valeur tirée si la récompense était en dés).
    const xpShow = (typeof state.xpGained === 'number') ? state.xpGained : (parseInt(block.xpReward, 10) || 0);
    if (xpShow > 0) {
      rewardHtml += '<div class="ses-reward-block ses-reward-xp"><div class="ses-reward-title">✦ Expérience <strong>+' + xpShow + ' XP</strong>' +
        (Store.isDiceExpr(block.xpReward) ? ' <small>(' + esc(String(block.xpReward).trim()) + ')</small>' : '') + '</div></div>';
    }
    if (lines.length) {
      const rows = lines.map(function (r) {
        const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
        const strip = (it && global.Inventory && Inventory.itemStripHtml) ? Inventory.itemStripHtml(it) :
          '<span class="inv-strip-name">' + esc(it ? it.name : '?') + '</span>';
        const realIdx = (block.itemRewards || []).indexOf(r);
        const qtyShow = roll.iq[realIdx] || 1;
        return '<div class="rp-line">' +
          '<div class="inv-strip-row cat-' + (it ? it.category : 'object') + '">' +
            '<div class="inv-strip">' + strip + '</div>' +
            (qtyShow > 1 ? '<span class="rp-qty">×' + qtyShow + '</span>' : '') +
          '</div>' +
          (state.claimed ? '<span class="tag">Récupéré</span>' : (heroes.length ? '<select class="stp-hero" data-tb="' + esc(block.id) + '" data-idx="' + realIdx + '">' + heroOpts + '</select>' : '')) +
        '</div>';
      }).join('');
      rewardHtml += '<div class="ses-reward-block ses-reward-items"><div class="ses-reward-title">🎁 Découverte</div><div class="rp-list">' + rows + '</div></div>';
    }
    if ((block.deedReward || '').trim()) {
      rewardHtml += '<div class="ses-reward-block ses-reward-deed"><div class="ses-reward-title">🏆 Haut Fait <strong>' + esc(block.deedReward.trim()) + '</strong></div></div>';
    }
    rewardHtml += treasureRewardHtml(block, rewardRoll(ses, block.id, block));
    rewardHtml += winEffectHtml(block, scene);
    // Passage débloqué : même bouton que les « Sorties & accès » des donjons.
    // Un combat imposé par ce test verrouille toute sortie : pas de bouton passage.
    let passHtml = '';
    if (block.targetSceneId && !forcedCombatPending(ses, scene)) {
      const tf = findScene(adv, block.targetSceneId);
      const visited = (ses.visitedSceneIds || []).indexOf(block.targetSceneId) >= 0;
      const dest = visited && tf ? (tf.scene.title || 'Salle') : '???';
      // Flèche orientée selon la position de la salle cible sur la carte.
      const arrow = sceneDirArrow(scene, tf ? tf.scene : null);
      passHtml = '<button class="ses-exit-btn ses-exit-visited ses-tb-pass">' +
        '<span class="ses-exit-lbl">🔓 Emprunter le passage</span>' +
        '<span class="ses-exit-to"><span class="ses-exit-dir">' + arrow + '</span> ' + esc(dest) + '</span></button>';
    }
    // Parent « rattrapé » par un test enchaîné : il avait échoué, mais un test
    // ultérieur l'a débloqué. On garde son récit d'échec + un bandeau distinct.
    const rescued = state.validated && state.wasFail;
    const verdict = rescued
      ? '<span class="ses-st-verdict rescued">↩ Rattrapé</span>'
      : '<span class="ses-st-verdict success">Réussite</span>';
    const narrative = rescued
      ? (block.failText ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(block.failText) + '</div>' : '')
      : (block.successText ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(block.successText) + '</div>' : '');
    const rescueBanner = rescued
      ? '<div class="ses-st-rescue">↳ Situation débloquée grâce au test « ' + esc(state.validatedBy || 'enchaîné') + ' ».</div>'
      : '';
    slot.innerHTML = '<div class="ses-searchtest ses-st-done ' + (rescued ? 'ses-st-rescued-box' : 'ses-st-success-box') + '">' +
      '<div class="ses-st-title">' + stIcon + esc(stLabel) + mTag + (state.group ? ' <span class="ses-st-group-tag">👥 GROUPE</span>' : '') + ' — ' + verdict + '</div>' +
      narrative +
      rescueBanner +
      groupResultsHtml(state) +
      fxMsgsHtml(state) +
      // Détail des jets, affiché AUSSI en cas de réussite (test individuel).
      (state.group || state.action || state.rareAuto || state.write ? '' : '<div class="hint ses-st-rolls">' + esc(state.hero || 'Le groupe') + ' — ' + (state.succ || 0) + '/' + (state.need || 0) + ' réussite(s) · dés : ' + (state.rolls || []).join(', ') + '</div>') +
      // Bonne réponse d'un bloc Écriture.
      (state.write ? '<div class="hint ses-st-write-answer">✍️ Réponse : « ' + esc(state.answer || '') + ' » ✔</div>' : '') +
      // Réussite obtenue grâce à un Objet Rare (sans jet).
      (state.rareAuto ? '<div class="hint ses-st-rare-note">🗝️ Réussite obtenue grâce à « ' + esc(state.rareName || 'un Objet Rare') + ' »' + (block.rareConsume ? ' (objet consommé)' : '') + '.</div>' : '') +
      rewardHtml +
      '<div class="ses-st-actions">' +
        (needClaim ? '<button class="primary ses-tb-claim">Récupérer la récompense</button>' : '') +
        passHtml +
      '</div>' +
    '</div>';
    const claimBtn = slot.querySelector('.ses-tb-claim');
    if (claimBtn) claimBtn.addEventListener('click', function () {
      grantTestItems(ses, block); state.claimed = true; save(); render();
    });
    const passBtn = slot.querySelector('.ses-tb-pass');
    if (passBtn) passBtn.addEventListener('click', function () {
      if (needClaim) grantTestItems(ses, block); // récupère d'abord les objets choisis
      state.claimed = true; save();
      navigateTo(ses, adv, block.targetSceneId);
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
      save(); setActive(null); render();
    });
  }

  // ----- Tests de compétence -----
  const SKILL_DIFF = { auto: 0, facile: 1, moyen: 2, difficile: 3, tresdifficile: 4, insurmontable: 5, impossible: 6 };
  // Réussites requises pour une difficulté (0 = Automatique — le « || 2 » naïf
  // transformerait 0 en 2, d'où ce helper).
  function diffNeed(d) { return SKILL_DIFF[d] != null ? SKILL_DIFF[d] : 2; }
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
  function bestHeroForSkill(ses, skill, preferHeroId, excludeIds) {
    let bestEff = -1;
    const cands = [];
    (ses.heroIds || []).forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (!h) return;
      // Un aventurier mort (conséquence de scène) ne participe plus aux tests.
      if (ses.heroStates && ses.heroStates[hid] && ses.heroStates[hid].dead) return;
      // Aventuriers exclus (re-test « avec un autre aventurier » : 1× chacun).
      if (Array.isArray(excludeIds) && excludeIds.indexOf(hid) >= 0) return;
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
  // Meilleur aventurier STABLE par bloc+compétence : en cas d'ex æquo, le tirage
  // n'est fait qu'UNE fois puis mémorisé — sinon chaque re-rendu (ex. changement
  // d'un menu voisin) re-tirerait le désigné des AUTRES tests de la page.
  function stableBestHero(ses, block, skill, excludeIds) {
    if (!ses.bestTestPick) ses.bestTestPick = {};
    const key = block.id + '|' + (skill || '');
    const bh = bestHeroForSkill(ses, skill, ses.bestTestPick[key] || null, excludeIds);
    if (bh.hero && ses.bestTestPick[key] !== bh.hero.id) {
      ses.bestTestPick[key] = bh.hero.id;
      save();
    }
    return bh;
  }
  // Bonus de compétence d'UN aventurier donné (base + gains de niveau + Expertise).
  // Aventurier tiré AU HASARD pour un test « aléatoire », FIGÉ pour ce bloc (ne
  // change pas au re-rendu / changement d'onglet). Re-tiré si l'actuel est exclu.
  function designatedRandomHero(ses, block, excludeIds) {
    if (!ses.randomTestPick) ses.randomTestPick = {};
    const alive = aliveEngagedHeroes(ses).filter(function (h) {
      return !(Array.isArray(excludeIds) && excludeIds.indexOf(h.id) >= 0);
    });
    const hid = ses.randomTestPick[block.id];
    let h = hid ? alive.find(function (x) { return x.id === hid; }) : null;
    if (!h && alive.length) {
      h = alive[Math.floor(Math.random() * alive.length)];
      ses.randomTestPick[block.id] = h.id; save();
    }
    return h || null;
  }
  // Testeur unique d'un bloc (mode « meilleur » ou « aléatoire »). `skillOverride`
  // permet de tester une compétence ALTERNATIVE (2e bouton du bloc).
  function singleTester(ses, block, excludeIds, skillOverride) {
    const skill = skillOverride || block.skill;
    // MEILLEUR AVENTURIER (défaut) : le joueur peut TOUJOURS désigner quelqu'un
    // d'autre via le menu de la vignette (pour ne pas risquer son meilleur
    // élément, par exemple). Le meilleur reste proposé par défaut.
    if (block.who !== 'random' && block.who !== 'group' && block.who !== 'concerned') {
      const pick = ses.playerTestPick && ses.playerTestPick[block.id];
      if (pick) {
        const alive = aliveEngagedHeroes(ses).filter(function (h) {
          return !(Array.isArray(excludeIds) && excludeIds.indexOf(h.id) >= 0);
        });
        const h = alive.find(function (x) { return x.id === pick; });
        if (h) {
          const info = heroTestInfo(ses, h, skill);
          return { hero: h, bonus: info.bonus, talentSucc: info.talentSucc };
        }
      }
      return stableBestHero(ses, block, skill, excludeIds);
    }
    if (block.who === 'random') {
      const h = designatedRandomHero(ses, block, excludeIds);
      if (!h) return { hero: null, bonus: 0, talentSucc: 0 };
      const info = heroTestInfo(ses, h, skill);
      return { hero: h, bonus: info.bonus, talentSucc: info.talentSucc };
    }
    return bestHeroForSkill(ses, skill, null, excludeIds);
  }
  function heroTestInfo(ses, h, skill) {
    const g = ses.levelGains ? ses.levelGains[h.id] : null;
    const sessSkill = (g && g.skills && g.skills[skill]) || 0;
    const v = ((h.skills && h.skills[skill]) || 0) + sessSkill;
    const tal = skillTalentBonus(ses, h.id, skill);
    return { bonus: Math.max(0, v), talentSucc: Math.max(0, tal) };
  }
  // Aventuriers engagés et VIVANTS (les morts ne testent plus).
  function aliveEngagedHeroes(ses) {
    return engagedHeroes(ses).filter(function (h) {
      return !(ses.heroStates && ses.heroStates[h.id] && ses.heroStates[h.id].dead);
    });
  }
  // Test de GROUPE : chaque aventurier d'une liste lance le test. Renvoie les
  // résultats individuels + la réussite globale (majorité : ⌈n/2⌉ réussites).
  // `heroList` par défaut = tous les aventuriers vivants.
  // Libellé explicatif du seuil de réussite collective (info-bulle du tag GROUPE).
  function groupModeLabel(mode) {
    if (mode === 'all') return 'Chaque aventurier lance le test — réussite seulement si TOUS réussissent (unanimité).';
    if (mode === 'one') return 'Chaque aventurier lance le test — réussite si AU MOINS UN réussit.';
    return 'Chaque aventurier lance le test — réussite si la MAJORITÉ réussit.';
  }
  // Verdict collectif sur un ensemble de résultats individuels, selon le seuil :
  // unanimité ('all'), majorité (défaut) ou au moins un ('one').
  function groupVerdict(results, groupMode) {
    const n = results.length;
    if (!n) return false;
    const passedCount = results.filter(function (x) { return x.passed; }).length;
    const mode = groupMode || 'majority';
    const threshold = mode === 'all' ? n : (mode === 'one' ? 1 : Math.ceil(n / 2));
    return passedCount >= threshold;
  }
  function runGroupRolls(ses, skill, difficulty, heroList, groupMode) {
    const need = diffNeed(difficulty);
    const heroes = heroList || aliveEngagedHeroes(ses);
    const results = heroes.map(function (h) {
      const info = heroTestInfo(ses, h, skill);
      const r = rollSkill(info.bonus);
      const total = r.successes + info.talentSucc;
      return { heroId: h.id, name: h.name, succ: total, need: need, rolls: r.rolls, passed: total >= need };
    });
    const passedCount = results.filter(function (x) { return x.passed; }).length;
    return { results: results, need: need, passedCount: passedCount, mode: groupMode || 'majority',
      passed: groupVerdict(results, groupMode) };
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
    const need = diffNeed(diff);
    let passed;
    if (ch.groupTest) {
      // Test de GROUPE : chaque aventurier vivant lance le test ;
      // le groupe réussit si la MAJORITÉ (⌈n/2⌉) réussit.
      const gr = runGroupRolls(ses, skill, diff);
      passed = gr.passed;
      alert('👥 Test de groupe — ' + skill + ' (' + need + ' réussite(s) requise(s) par aventurier) :\n\n' +
        gr.results.map(function (r) {
          return (r.passed ? '✓ ' : '✗ ') + r.name + ' : ' + r.succ + ' réussite(s) — dés : ' + r.rolls.join(', ');
        }).join('\n') +
        '\n\n' + gr.passedCount + '/' + gr.results.length + ' aventurier(s) ont réussi → ' +
        (passed ? 'RÉUSSITE du groupe.' : 'ÉCHEC du groupe.'));
    } else {
      const bh = bestHeroForSkill(ses, skill, preferHeroId);
      const res = rollSkill(bh.bonus);
      const talSucc = bh.talentSucc || 0;
      const totalSucc = res.successes + talSucc;
      passed = totalSucc >= need;
      const who = bh.hero ? bh.hero.name : 'Le groupe';
      alert(who + ' effectue un test de ' + skill + ' : ' + totalSucc + ' réussite(s)' +
        (talSucc > 0 ? ' (' + res.successes + ' aux dés + ' + talSucc + ' Expertise)' : '') +
        ' = ' + (passed ? 'Réussite' : 'Échec') + '.\n\n' +
        (passed ? 'Vous avez réussi le test.' : 'Vous avez échoué le test.') +
        '\n\nDés (' + (1 + bh.bonus) + ' + explosifs) : ' + res.rolls.join(', '));
    }
    const target = passed ? ch.successSceneId : ch.failSceneId;
    ses.choicesTaken.push({ sceneId: scene.id, choiceLabel: ch.label + ' [test ' + skill + (ch.groupTest ? ' 👥' : '') + ']', targetSceneId: target, success: passed });
    navigateTo(ses, adv, target);
  }

  function navigateTo(ses, adv, sceneId) {
    if (!sceneId) return;
    // Récompenses de la scène courante : attribuées automatiquement en la quittant
    // (avant le contrôle de montée de niveau, pour que l'XP gagnée compte).
    grantSceneRewardsFromDOM(ses, adv);
    let found = findScene(adv, sceneId);
    if (!found) return;
    // Entrée dans un chapitre Donjon depuis un AUTRE chapitre : on arrive par la
    // salle d'entrée (structuré) ou la 1re salle de l'ordre tiré (aléatoire).
    const cur = findScene(adv, ses.currentSceneId);
    if (!cur || cur.chapter.id !== found.chapter.id) {
      const corrected = chapterEntryTarget(ses, adv, found.chapter, sceneId);
      if (corrected !== sceneId) {
        sceneId = corrected;
        found = findScene(adv, sceneId);
        if (!found) return;
      }
    }
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
    // Sortie d'un événement de passage : l'état de transit ne survit qu'à la
    // scène d'événement elle-même (toute autre navigation le dissout).
    if (ses.transit && sceneId !== ses.transit.sceneId) ses.transit = null;
    ses.currentChapterId = found.chapter.id;
    ses.currentSceneId = sceneId;
    // Compteur d'ENTRÉES : chaque arrivée dans une scène = un identifiant unique.
    // Un test résolu lors d'une entrée ANTÉRIEURE s'affichera en version compacte ;
    // un test résolu pendant l'entrée COURANTE reste complet (récompenses visibles).
    ses.entryId = (ses.entryId || 0) + 1;
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

      // Contexte des balises dynamiques (<ENDU>, <PV>…) au nouveau niveau.
      const ehLvl = effectiveHero(ses, h);
      const lvlTagCtx = {
        endu: curEndu, damage: curDmg, vie: curVie,
        pv: Combatants.heroPv(ehLvl), niveau: newLevel,
        orbes: 2 + Math.floor((Math.max(1, newLevel) - 1) / 2),
      };
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
            (t.description ? '<div class="tpe-desc" hidden>' + Store.fillTalentTagsHtml(t.description, lvlTagCtx) + '</div>' : '') +
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
  // Résout la fiche d'un adversaire référencé dans une zone : par id, puis, à
  // défaut (id périmé après un partage / import / duplication), par NOM — même
  // règle que le moteur de combat, pour que l'aperçu ne mente jamais sur ce qui
  // sera réellement engagé.
  // Normalisation d'un nom pour la comparaison : minuscules, sans accents, sans
  // ponctuation ni espaces (y compris les espaces insécables d'un copier-coller).
  function normName(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }
  function monsterTplForRef(ref) {
    if (!ref) return null;
    const find = function (pred) {
      return Store.findMonster ? Store.findMonster(pred) : (Store.state.monsters.find(pred) || null);
    };
    let t = ref.monsterId ? find(function (m) { return m.id === ref.monsterId; }) : null;
    if (!t && ref.monName) {
      const nm = normName(ref.monName);
      t = find(function (m) { return normName(m.name) === nm; });
    }
    return t || null;
  }
  // Références d'adversaires d'un jeu de zones, avec le total réellement jouable
  // et la liste de celles qui ne se résolvent pas (fiche supprimée / renommée).
  function zonesFoeInfo(zones) {
    let total = 0; const missing = [];
    (zones || []).forEach(function (z) {
      (z.monsterRefs || []).forEach(function (r) {
        if (!r.monsterId && !r.monName) return;
        const m = monsterTplForRef(r);
        if (m) total += Math.max(1, r.count || 1);
        else missing.push(r.monName || r.monsterId || '?');
      });
    });
    return { total: total, missing: missing };
  }
  function sceneZones(scene) {
    if (Array.isArray(scene.combatZones) && scene.combatZones.length) return scene.combatZones;
    const refs = (scene.monsterRefs || []).filter(function (r) { return r.monsterId; });
    return [
      { name: 'Zone des aventuriers', monsterRefs: [], heroStart: true },
      { name: 'Adversaires', monsterRefs: refs },
    ];
  }

  // Aperçu de la DISPOSITION d'un combat (zones, placement des combattants,
  // barrières) — partagé par le combat de salle et les blocs de combat.
  function combatPreviewHtml(zones, rawBarriers, ses) {
    // Barrières au nouveau format objet « min-max » (avec migration de l'ancien
    // tableau linéaire / du type « obstruante »).
    const barriers = (function () {
      const raw = rawBarriers;
      const out = {};
      if (Array.isArray(raw)) {
        raw.forEach(function (b, i) {
          if (b && b.type && b.type !== 'none') out[i + '-' + (i + 1)] = { type: b.type === 'obstruante' ? 'mur' : b.type, name: b.name || '' };
        });
      } else if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (k) {
          const b = raw[k];
          if (b && b.type && b.type !== 'none') out[k] = { type: b.type === 'obstruante' ? 'mur' : b.type, name: b.name || '' };
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
    // Nom affiché sur la barrière : nom personnalisé du MJ, sinon libellé du type.
    const barName = function (bar) { return (bar && bar.name && bar.name.trim()) ? bar.name.trim() : (B_NAME[bar && bar.type] || ''); };
    const Z_POS = { 1: [[1, 1]], 2: [[1, 1], [1, 3]], 3: [[1, 1], [1, 3], [3, 1]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]] };
    const Z_SEPS = [
      { pair: [0, 1], row: 1, col: 2, dir: 'v' }, { pair: [2, 3], row: 3, col: 2, dir: 'v' },
      { pair: [0, 2], row: 2, col: 1, dir: 'h' }, { pair: [1, 3], row: 2, col: 3, dir: 'h' },
    ];
    const Z_DIAG = [ { pair: [0, 3], dir: 'down-left' }, { pair: [1, 2], dir: 'down-right' } ];
    const nZones = Math.max(1, zones.length);
    const zPos = Z_POS[nZones] || Z_POS[1];
    let zonesHtml = zones.map(function (z, zi) {
      const mons = (z.monsterRefs || []).filter(function (r) { return r.monsterId || r.monName; }).map(function (r) {
        const m = monsterTplForRef(r);
        // Fiche introuvable : on le DIT, au lieu d'afficher un « ? » muet et de
        // lancer ensuite un combat sans adversaire.
        if (!m) {
          return previewChip('⚠ ' + (r.monName || 'Adversaire introuvable'), 'pv-foe pv-foe-missing');
        }
        const t = m.type === 'standard' ? 'sbire' : m.type;
        const n = Math.max(1, r.count || 1);
        let out = '';
        for (let k = 0; k < n; k++) out += previewChip(m.name + (n > 1 ? ' ' + (k + 1) : ''), 'pv-foe ztype-' + t);
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
      // Sens d'extension vers la case centrale : deux barrières perpendiculaires
      // se rejoignent alors en un angle plein, au lieu de se toucher du bout.
      const ext = e.dir === 'v' ? (e.row === 1 ? 'down' : 'up') : (e.col === 1 ? 'right' : 'left');
      zonesHtml += '<div class="zone-sep zone-sep-' + e.dir + ' sep-ext-' + ext + ' barrier-' + bar.type + '"' +
        ' style="grid-row:' + e.row + ';grid-column:' + e.col + ';" title="' + (B_LABEL[bar.type] || '').replace(/^[^ ]+ /, '') + '">' +
        '<span class="zone-sep-lbl">' + esc(barName(bar)) + '</span></div>';
    });
    // Séparateurs diagonaux (paires 1-4 et 2-3) au centre de la grille.
    let zDiagHtml = '';
    Z_DIAG.forEach(function (d) {
      if (d.pair[0] >= nZones || d.pair[1] >= nZones) return;
      const bar = barriers[d.pair[0] + '-' + d.pair[1]];
      if (!bar) return;
      zDiagHtml += '<div class="zone-sep-diag ' + d.dir + ' barrier-' + bar.type + '"' +
        ' title="' + (B_LABEL[bar.type] || '').replace(/^[^ ]+ /, '') + '">' +
        '<span class="zone-sep-lbl">' + esc(barName(bar)) + '</span></div>';
    });
    if (zDiagHtml) zonesHtml += '<div class="zone-sep-diag-wrap" style="grid-row:2;grid-column:2;">' + zDiagHtml + '</div>';
    const gridStyle = nZones <= 1 ? 'grid-template-columns:1fr;'
      : (nZones === 2 ? 'grid-template-columns:1fr auto 1fr;'
        : 'grid-template-columns:1fr auto 1fr;grid-template-rows:1fr auto 1fr;');
    const preview = '<div class="combat-preview zc-' + nZones + '" style="' + gridStyle + '">' + zonesHtml + '</div>';

    return preview;
  }

  function renderCombatScene(box, scene, adv, ses) {
    const preview = combatPreviewHtml(sceneZones(scene), scene.barriers, ses);
    // Donjons : « Passer (victoire) » reste possible sans scène de suite — la salle
    // est alors marquée nettoyée et l'on reste dedans (sorties débloquées).
    const chF = findScene(adv, scene.id);
    const dMode = chapterMode(chF ? chF.chapter : null);
    const sec = appendSection(box);
    sec.innerHTML =
      '<div class="ses-combat-block">' +
        '<p class="hint">Disposition du combat (vous ne pouvez pas changer votre position de départ) :</p>' +
        preview +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem">' +
          '<button class="primary" id="ses-start-combat">⚔ Lancer le combat</button>' +
          ((scene.outcomeSceneId || dMode !== 'linear')
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
      if (dMode !== 'linear') {
        if (!ses.clearedScenes) ses.clearedScenes = {};
        ses.clearedScenes[scene.id] = true;
        save();
      }
      if (scene.outcomeSceneId) navigateTo(ses, adv, scene.outcomeSceneId);
      else render();
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
    // Les aventuriers morts (conséquence de scène) ne participent plus aux combats.
    const fighters = (ses.heroIds || []).filter(function (hid) {
      return !(ses.heroStates && ses.heroStates[hid] && ses.heroStates[hid].dead);
    });
    if (!fighters.length) { alert('Aucun aventurier vivant pour ce combat.'); return; }

    // Synchroniser les PV de session vers les fiches héros (le combat lira h.pv)
    fighters.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h && ses.heroStates[hid] && typeof ses.heroStates[hid].pv === 'number') {
        h.pv = ses.heroStates[hid].pv;
      }
    });
    Store.save();
    // États en attente (conséquences de tests ratés) : transmis au combat qui
    // les applique au démarrage, puis consommés.
    if (ses.pendingStates && Object.keys(ses.pendingStates).length) {
      Store.state.pendingCombatStates = ses.pendingStates;
      ses.pendingStates = null;
      save();
    }

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
    Combat.startInSession(fighters, { combatZones: zones, barriers: scene.barriers || [] }, ctx, '#session-combat-root', ses.levelGains);
  }

  // Combat IMPOSÉ (issue de test) : bloc verrouillant + lancement (aucun « Passer »).
  function renderForcedCombat(box, scene, adv, ses) {
    const zones = (ses.forcedCombat && ses.forcedCombat.zones) || [];
    const foes = [];
    zones.forEach(function (z) {
      (z.monsterRefs || []).forEach(function (r) {
        if (!r.monsterId && !r.monName) return;
        const m = monsterTplForRef(r);
        foes.push((m ? m.name : '⚠ ' + (r.monName || 'introuvable')) + (r.count > 1 ? ' ×' + r.count : ''));
      });
    });
    const sec = appendSection(box);
    sec.innerHTML =
      '<div class="ses-combat-block ses-forced-combat">' +
        '<div class="ses-forced-combat-head">⚔️ Combat imposé</div>' +
        '<p class="hint">Le test déclenche un combat que vous ne pouvez pas éviter.' +
          (foes.length ? ' Adversaires : <b>' + esc(foes.join(', ')) + '</b>.' : '') + '</p>' +
        '<button class="primary" id="ses-start-forced">⚔ Lancer le combat</button>' +
      '</div>';
    sec.querySelector('#ses-start-forced').addEventListener('click', function () { launchForcedCombat(scene, adv, ses); });
  }

  // ---- BLOC DE COMBAT jouable (posé dans le fil de la salle) ----
  // Avant : mise en scène + bouton « Lancer le combat ».
  // Après : verdict (victoire / défaite) et texte de conséquence. L'issue est
  // enregistrée comme celle d'un test (ses.searchTests), ce qui lui donne
  // gratuitement les chaînes « Bloc révélé si victoire / défaite ».
  function renderFightBlock(slot, blk, scene, adv, ses) {
    if (!ses.searchTests) ses.searchTests = {};
    const state = ses.searchTests[blk.id];
    const title = '⚔️ ' + esc(blk.label || 'Combat');
    if (!state || !state.done) {
      const info = zonesFoeInfo((blk.combat && blk.combat.combatZones) || []);
      const nFoes = info.total;
      // Disposition du combat AVANT de le lancer : zones, placement des
      // combattants et barrières — exactement comme pour un combat de salle.
      const zones = (blk.combat && blk.combat.combatZones && blk.combat.combatZones.length)
        ? blk.combat.combatZones
        : [{ name: 'Zone des aventuriers', monsterRefs: [], heroStart: true }, { name: 'Adversaires', monsterRefs: [] }];
      slot.innerHTML = '<div class="ses-searchtest ses-fight ses-combat-block">' +
        '<div class="ses-st-title">' + title + '</div>' +
        (blk.content && blk.content.trim() ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(blk.content) + '</div>' : '') +
        (nFoes || info.missing.length
          ? '<p class="hint">Disposition du combat (vous ne pouvez pas changer votre position de départ) :</p>' +
            combatPreviewHtml(zones, (blk.combat || {}).barriers, ses) : '') +
        (info.missing.length
          ? '<p class="ses-foe-missing">⚠ ' + info.missing.length + ' adversaire' + (info.missing.length > 1 ? 's' : '') +
            ' de ce combat ' + (info.missing.length > 1 ? 'sont introuvables' : 'est introuvable') +
            ' dans le Bestiaire (' + esc(info.missing.join(', ')) + ') — resélectionnez-' +
            (info.missing.length > 1 ? 'les' : 'le') + ' dans l\'éditeur du bloc.</p>' : '') +
        '<button type="button" class="primary ses-fight-go"' + (nFoes ? '' : ' disabled title="Aucun adversaire défini dans ce bloc."') + '>' +
          '⚔ Lancer le combat' + (nFoes ? ' <span class="ses-fight-count">(' + nFoes + ' adversaire' + (nFoes > 1 ? 's' : '') + ')</span>' : '') +
        '</button>' +
      '</div>';
      const go = slot.querySelector('.ses-fight-go');
      if (go && nFoes) go.addEventListener('click', function () { launchBlockCombat(blk, scene, adv, ses); });
      return;
    }
    const ok = !!state.success;
    const txt = ok ? blk.winText : blk.failText;
    slot.innerHTML = '<div class="ses-searchtest ses-st-done ses-fight ' + (ok ? 'ses-st-success-box' : 'ses-st-fail-box') + '">' +
      '<div class="ses-st-title">' + title + ' — ' +
        (ok ? '<span class="ses-st-verdict success">Victoire</span>' : '<span class="ses-st-verdict fail">Défaite</span>') + '</div>' +
      (txt && txt.trim() ? '<div class="scene-block scene-block-narrative">' + fmtSceneText(txt) + '</div>' : '') +
    '</div>';
  }
  // Lance le combat d'un bloc de combat : même moteur que le combat imposé, mais
  // l'issue revient au BLOC (et non à la salle entière).
  function launchBlockCombat(blk, scene, adv, ses) {
    const cfg = blk.combat || {};
    const zones = cfg.combatZones || [];
    const info = zonesFoeInfo(zones);
    if (!info.total) {
      alert(info.missing.length
        ? 'Les adversaires de ce combat sont introuvables dans le Bestiaire (' + info.missing.join(', ') +
          ').\n\nRouvrez le bloc de combat dans l\'éditeur de salle et resélectionnez-les.'
        : 'Aucun adversaire défini pour ce combat.');
      return;
    }
    const fighters = (ses.heroIds || []).filter(function (hid) {
      return !(ses.heroStates && ses.heroStates[hid] && ses.heroStates[hid].dead);
    });
    if (!fighters.length) { alert('Aucun aventurier vivant pour ce combat.'); return; }
    fighters.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h && ses.heroStates[hid] && typeof ses.heroStates[hid].pv === 'number') h.pv = ses.heroStates[hid].pv;
    });
    Store.save();
    if (ses.pendingStates && Object.keys(ses.pendingStates).length) {
      Store.state.pendingCombatStates = ses.pendingStates;
      ses.pendingStates = null;
    }
    // Mémorise le bloc à qui revient l'issue du combat.
    ses.blockCombat = { blockId: blk.id, sceneId: scene.id };
    save();
    const ctx = { sessionId: ses.id, adventureId: adv.id, sceneId: scene.id,
      outcomeSceneId: null, defeatSceneId: null, forced: true };
    const root = $('#session-root');
    root.innerHTML = '<div class="ses-combat-wrap"><div id="session-combat-root"></div></div>';
    ensureLevelData(ses);
    Combat.startInSession(fighters, { combatZones: zones, barriers: cfg.barriers || {} }, ctx, '#session-combat-root', ses.levelGains);
  }

  function launchForcedCombat(scene, adv, ses) {
    const fc = ses.forcedCombat || {};
    const zones = fc.zones || [];
    const monsterCount = zones.reduce(function (n, z) {
      return n + (z.monsterRefs || []).filter(function (r) { return r.monsterId; }).reduce(function (s, r) { return s + (r.count || 1); }, 0);
    }, 0);
    if (!monsterCount) { alert('Aucun monstre défini pour ce combat.'); delete ses.forcedCombat; save(); render(); return; }
    const fighters = (ses.heroIds || []).filter(function (hid) {
      return !(ses.heroStates && ses.heroStates[hid] && ses.heroStates[hid].dead);
    });
    if (!fighters.length) { alert('Aucun aventurier vivant pour ce combat.'); return; }
    fighters.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h && ses.heroStates[hid] && typeof ses.heroStates[hid].pv === 'number') h.pv = ses.heroStates[hid].pv;
    });
    Store.save();
    if (ses.pendingStates && Object.keys(ses.pendingStates).length) {
      Store.state.pendingCombatStates = ses.pendingStates;
      ses.pendingStates = null; save();
    }
    const ctx = { sessionId: ses.id, adventureId: adv.id, sceneId: scene.id,
      outcomeSceneId: null, defeatSceneId: scene.defeatSceneId || null, forced: true };
    // Placement de départ dédié : les aventuriers ayant ÉCHOUÉ le test peuvent
    // commencer dans une zone distincte (« Départ des aventuriers ayant échoué »).
    const failedZi = zones.findIndex(function (z) { return z.heroStartFailed; });
    const normalZi = zones.findIndex(function (z) { return z.heroStart; });
    let heroStartMap = null;
    const failed = (fc.failedHeroIds || []);
    if (failedZi >= 0 && failed.length) {
      heroStartMap = {};
      fighters.forEach(function (hid) {
        heroStartMap[hid] = (failed.indexOf(hid) >= 0) ? failedZi : (normalZi >= 0 ? normalZi : failedZi);
      });
    }
    const root = $('#session-root');
    root.innerHTML = '<div class="ses-combat-wrap"><div id="session-combat-root"></div></div>';
    ensureLevelData(ses);
    Combat.startInSession(fighters, { combatZones: zones, barriers: fc.barriers || {}, heroStartMap: heroStartMap }, ctx, '#session-combat-root', ses.levelGains);
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
      sec.innerHTML = '<p class="ses-done-note ses-done-reward">✦ Récompense déjà récupérée.</p>';
      return;
    }
    const heroOpts = heroes.map(function (h) { return '<option value="' + esc(h.id) + '">' + esc(h.name) + '</option>'; }).join('');
    // Tirage mis en cache : quantités affichées EN VALEUR (pas en dés).
    const roll = rewardRoll(ses, scene.id, scene);
    const rowsHtml = lines.map(function (r) {
      const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
      const strip = (it && global.Inventory && Inventory.itemStripHtml) ? Inventory.itemStripHtml(it) :
        '<span class="inv-strip-name">' + esc(it ? it.name : '?') + '</span>';
      const realIdx = (scene.itemRewards || []).indexOf(r);
      const qtyShow = roll.iq[realIdx] || 1;
      return '<div class="rp-line">' +
        '<div class="inv-strip-row cat-' + (it ? it.category : 'object') + '">' +
          '<div class="inv-strip">' + strip + '</div>' +
          (qtyShow > 1 ? '<span class="rp-qty">×' + qtyShow + '</span>' : '') +
        '</div>' +
        (heroes.length ? '<select class="rp-hero" data-idx="' + realIdx + '">' + heroOpts + '</select>' : '') +
      '</div>';
    }).join('');
    // Deux cases distinctes : XP d'un côté, équipement de l'autre.
    let html = '';
    // Texte d'introduction de la récompense (contexte narratif) — rien si vide.
    if (scene.rewardText && scene.rewardText.trim()) {
      html += '<div class="scene-block scene-block-narrative ses-reward-intro">' + fmtSceneText(scene.rewardText) + '</div>';
    }
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
    html += treasureRewardHtml(scene, rewardRoll(ses, scene.id, scene));
    html += winEffectHtml(scene, scene);
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
    // « Gagné à l'issue du combat » : rien n'est remis tant que le combat n'est pas
    // remporté — qu'il s'agisse du combat de ZONE de la scène OU d'un combat
    // DÉCLENCHÉ par un test / une action (issue de réussite ou d'échec). Un combat
    // imposé (forcedCombat) reste « en attente » tant qu'il n'est pas gagné (une
    // défaite le ré-arme), donc forcedCombatPending suffit à retenir la récompense.
    if (scene.rewardAfterCombat &&
        ((sceneHasCombat(scene) && !(ses.clearedScenes && ses.clearedScenes[scene.id]))
         || forcedCombatPending(ses, scene)
         || mandatoryTestPending(scene, ses))) return;
    const assign = {};
    document.querySelectorAll('#ses-actions .rp-hero').forEach(function (sel) {
      assign[parseInt(sel.getAttribute('data-idx'), 10)] = sel.value;
    });
    const xp = scene.xpReward || 0;
    if (xp > 0) { ses.party.xp = (ses.party.xp || 0) + xp; }
    if (!ses.acquiredItems) ses.acquiredItems = {};
    if (!ses.heroOwned) ses.heroOwned = {};
    const fallback = (ses.heroIds && ses.heroIds[0]) || null;
    const roll = rewardRoll(ses, scene.id, scene);
    (scene.itemRewards || []).forEach(function (r, idx) {
      if (!r.itemId) return;
      const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
      if (!it) return;
      const q = roll.iq[idx] || 1;
      it.qty = (it.qty || 0) + q;
      ses.acquiredItems[r.itemId] = (ses.acquiredItems[r.itemId] || 0) + q;
      const recipient = (assign[idx]) || fallback;
      if (recipient) addToHeroOwned(ses, recipient, r.itemId, q); // armes plafonnées à 2
    });
    applyWinEffect(ses, scene);
    grantTreasures(ses, scene, scene.id);
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
    setActive(ses);
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
    // Combat d'un BLOC DE COMBAT : l'issue revient au bloc (et pas à la salle).
    // On l'enregistre comme un résultat de test, ce qui active ses chaînes
    // « Bloc révélé si victoire / défaite ».
    const bc = ses.blockCombat;
    const isBlockCombat = !!(bc && bc.sceneId === ses.currentSceneId);
    if (isBlockCombat) {
      const won = detail.outcome === 'victory' || detail.outcome === 'minor';
      if (!ses.searchTests) ses.searchTests = {};
      ses.searchTests[bc.blockId] = { done: true, success: won, fight: true };
      delete ses.blockCombat;
      // Les blocs que ce combat révèle s'animent au retour dans la salle.
      const fscene = findScene(adv, bc.sceneId);
      if (fscene) {
        const parent = (fscene.scene.blocks || []).find(function (b) { return b.id === bc.blockId; });
        if (parent) justRevealedIds = chainIdsOf(parent, won ? 'success' : 'fail').slice();
        justRevealedIds.push(bc.blockId);
      }
    }
    // Combat IMPOSÉ par un test : à la victoire il est levé (déverrouille la scène) ;
    // il ne « nettoie » PAS la scène (un éventuel combat propre à la salle demeure).
    const wasForced = !!(ses.forcedCombat && ses.forcedCombat.sceneId === ses.currentSceneId);
    if (wasForced && (detail.outcome === 'victory' || detail.outcome === 'minor')) {
      delete ses.forcedCombat;
    }
    // Victoire : la salle est « nettoyée » (donjons : le combat ne se relance pas
    // lors des visites suivantes, et les sorties de la salle se débloquent).
    if ((detail.outcome === 'victory' || detail.outcome === 'minor') && !wasForced && !isBlockCombat) {
      if (!ses.clearedScenes) ses.clearedScenes = {};
      if (ses.currentSceneId) ses.clearedScenes[ses.currentSceneId] = true;
    }
    // XP du combat attribuée à la session (décorrélée de l'XP du mode Admin)
    if (detail.xp) ses.party.xp = (ses.party.xp || 0) + detail.xp;
    // Or lâché par les adversaires vaincus.
    if (detail.gold > 0) { ensureLoot(ses); ses.gold += Math.round(detail.gold); }
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
    // Défaite sur une scène d'ÉVÉNEMENT DE PASSAGE (rencontre de connecteur) :
    // le combat ne se relance pas — l'aventure se poursuit vers la salle de
    // destination et l'événement est consommé (il ne se rejouera jamais).
    const inTransit = !!(scene && ses.transit && ses.transit.sceneId === scene.id && scene.isTransition);
    if (inTransit && detail.outcome === 'defeat') {
      if (!ses.clearedScenes) ses.clearedScenes = {};
      ses.clearedScenes[scene.id] = true;
      save();
      targetId = scene.defeatSceneId || ses.transit.destId;
    } else if (scene && !wasForced && !isBlockCombat) {
      if (detail.outcome === 'defeat') targetId = scene.defeatSceneId;
      else if (detail.outcome === 'victory' || detail.outcome === 'minor') targetId = scene.outcomeSceneId;
    } else if (scene && wasForced && detail.outcome === 'defeat') {
      // Défaite d'un combat imposé : on suit la scène de défaite si définie, sinon
      // on réaffiche la scène (le combat imposé reste à retenter).
      targetId = scene.defeatSceneId;
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
      setActive(m || null);
    }
    if (forceSetup) {
      setActive(null);
    } else {
      setActive(sessionForAdv(scopeAdventureId));
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
    let ses = sessionForAdv(advId);
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
    sessions.push(ses);
    initChapterEntry(ses, adv);  // 1er chapitre en donjon : démarre sur l'entrée / l'ordre tiré
    save();
    setActive(ses);
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
    setActive(null);
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
              // Nom personnalisable (défaut : « Partie du JJ/MM/AAAA »).
              const label = s.title || ('Partie du ' + date);
              return '<div class="adv-session-row">' +
                '<div class="ses-save-head">' +
                  '<input type="text" class="ses-save-name" data-id="' + s.id + '" value="' + esc(label) + '" ' +
                    'placeholder="Nom de la sauvegarde" title="Renommer cette sauvegarde" />' +
                  '<span class="tag">' + prog + ' scène(s)</span> ' +
                  '<span class="tag">XP : ' + (s.party ? s.party.xp : 0) + '</span>' +
                '</div>' +
                '<div style="display:flex;gap:.4rem;margin-top:.35rem">' +
                  '<button class="primary ses-resume" data-id="' + s.id + '">Reprendre</button>' +
                  '<button class="danger ses-end" data-id="' + s.id + '">Supprimer</button>' +
                '</div>' +
              '</div>';
            }).join('')
          : '<p class="empty">Aucune partie en cours. Lance « Nouvelle partie » pour démarrer.</p>') +
      '</div>';

    document.getElementById('saves-new').onclick = function () { beginNewGame(scopeAdventureId); };
    // Renommage d'une sauvegarde (enregistré à la sortie du champ).
    root.querySelectorAll('.ses-save-name').forEach(function (inp) {
      inp.addEventListener('change', function () {
        const s = sessions.find(function (x) { return x.id === inp.getAttribute('data-id'); });
        if (!s) return;
        s.title = inp.value.trim();
        save();
      });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
    });
    root.querySelectorAll('.ses-resume').forEach(function (b) {
      b.addEventListener('click', function () {
        setActive(sessions.find(function (s) { return s.id === b.getAttribute('data-id'); }));
        if (global.Shell && Shell.showPlayTab) Shell.showPlayTab();
        else render();
      });
    });
    root.querySelectorAll('.ses-end').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Supprimer cette session ? L\'XP des aventuriers sera remise à 0.')) return;
        const id = b.getAttribute('data-id');
        sessions.forEach(function (s) { if (s.id === id) { s.status = 'ended'; if (s.party) s.party.xp = 0; } });
        if (activeSession && activeSession.id === id) setActive(null);
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

  function findActiveSessionFor(advId) { return sessionForAdv(advId); }

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
            const desc = Store.fillTalentTagsHtml(e.t.description || 'Aucune description.', tagCtx);
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
              '<div class="tpe-desc" id="tpe-desc-' + esc(e.id) + '-' + h.id + '" hidden>' + desc + '</div>' +
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
    ownedCount: ownedCount,
    discardItem: discardItem,
    partyLoot: partyLoot,
    removeTreasure: removeTreasure,
    combatModuleActive: combatModuleActive,
    beginInventoryVisit: beginInventoryVisit,
    newInvIds: newInvIds,
  };
  // Retire DÉFINITIVEMENT un exemplaire d'un objet de l'inventaire d'un
  // aventurier (bouton ✕ de l'inventaire Aventure). Déséquipe les copies en
  // trop et décrémente aussi acquiredItems / le stock global.
  function discardItem(advId, heroId, itemId) {
    load();
    const ses = sessionForAdv(advId);
    if (!ses) return false;
    if (activeSession && ses.id === activeSession.id) { /* mute l'instance vivante */ }
    else { setActive(ses); }
    if (!ses.heroOwned) ses.heroOwned = {};
    const owned = ses.heroOwned[heroId] || (ses.heroOwned[heroId] = {});
    const cur = Number(owned[itemId]) || 0;
    if (cur <= 0) return false;
    const left = cur - 1;
    if (left > 0) owned[itemId] = left; else delete owned[itemId];
    // Déséquipe les copies devenues « en trop » sur la fiche du héros.
    const h = Store.state.heroes.find(function (x) { return x.id === heroId; });
    if (h && global.Combatants && Combatants.normalizeEquip) {
      const eq = Combatants.normalizeEquip(h.equipment || {});
      let equippedCount = ['mainG', 'mainD', 'armorId', 'objectId'].reduce(function (n, k) {
        return n + (eq[k] === itemId ? 1 : 0);
      }, 0);
      while (equippedCount > left) {
        if (eq.mainD === itemId) eq.mainD = null;
        else if (eq.mainG === itemId) eq.mainG = null;
        else if (eq.armorId === itemId) eq.armorId = null;
        else if (eq.objectId === itemId) eq.objectId = null;
        equippedCount--;
      }
      h.equipment = eq;
    }
    // Décrémente le stock global et le suivi d'acquisition (cohérence rollback).
    const it = Store.state.items.find(function (x) { return x.id === itemId; });
    if (it) it.qty = Math.max(0, (it.qty || 0) - 1);
    if (ses.acquiredItems && ses.acquiredItems[itemId]) {
      ses.acquiredItems[itemId] = Math.max(0, ses.acquiredItems[itemId] - 1);
    }
    Store.save();
    save();
    return true;
  }
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
    // Max 2 armes de CONTACT identiques ; armes à distance (2 mains) plafonnées à 1.
    if (it && it.category === 'weapon') target = Math.min(it.ranged ? 1 : 2, target);
    ses.heroOwned[hid][itemId] = target;
    // Badge « NEW » : l'objet vient d'arriver — il sera signalé à la prochaine
    // visite de l'onglet Inventaire (une seule fois).
    // Badge « NEW » : on mémorise QUI reçoit QUOI et COMBIEN d'exemplaires, pour
    // ne signaler que les nouveaux exemplaires (et pas ceux déjà possédés, ni les
    // objets identiques appartenant à d'autres aventuriers).
    if (target - cur > 0) {
      if (!ses.invNew) ses.invNew = {};
      const k = hid + '|' + itemId;
      ses.invNew[k] = (Number(ses.invNew[k]) || 0) + (target - cur);
    }
    return target - cur;
  }
  // ---- Badge « NEW » de l'inventaire Joueur ----
  // beginInventoryVisit : appelé à l'OUVERTURE de l'onglet Inventaire. Les objets
  // en attente (invNew) deviennent les badges de CETTE visite (invNewShow), puis
  // la file est vidée : au retour suivant, les badges ont disparu.
  function beginInventoryVisit(advId) {
    load();
    const ses = sessionForAdv(advId);
    if (!ses) return;
    ses.invNewShow = ses.invNew || {};
    ses.invNew = {};
    save();
  }
  // Objets à badger pendant la visite courante de l'inventaire.
  function newInvIds(advId) {
    const ses = sessionForAdv(advId);
    return (ses && ses.invNewShow) || {};
  }
  // Stock restant d'un objet dans l'inventaire personnel d'un aventurier (session active).
  function ownedCount(heroId, itemId) {
    const ses = sessionForAdv(null);
    if (!ses || !ses.heroOwned || !ses.heroOwned[heroId]) return 0;
    return Number(ses.heroOwned[heroId][itemId]) || 0;
  }
  function consumeObject(heroId, itemId) {
    // NE PAS recharger (load() remplacerait `sessions` et détacherait activeSession,
    // faisant perdre la mutation au save()). On mute la session vivante.
    const ses = sessionForAdv(null);
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
  // Butin de groupe (Or + trésors) de la partie active d'une aventure — pour
  // l'affichage du bloc « Or, Trésors et Objets Rares » de l'onglet Inventaire.
  function partyLoot(advId) {
    const ses = (activeSession && activeSession.adventureId === advId) ? activeSession
      : sessionForAdv(advId);
    if (!ses) return null;
    ensureLoot(ses);
    return { gold: ses.gold, treasures: ses.treasures.slice() };
  }
  // Retire UN exemplaire d'un trésor (bouton ✕ du bloc trésors).
  function removeTreasure(advId, tid) {
    const ses = (activeSession && activeSession.adventureId === advId) ? activeSession
      : sessionForAdv(advId);
    if (!ses || !Array.isArray(ses.treasures)) return false;
    const t = ses.treasures.find(function (x) { return x.id === tid; });
    if (!t) return false;
    t.qty = (t.qty || 1) - 1;
    if (t.qty <= 0) ses.treasures = ses.treasures.filter(function (x) { return x.id !== tid; });
    save();
    return true;
  }
})(window);
