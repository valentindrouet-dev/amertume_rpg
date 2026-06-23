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
      party: { xp: Store.state.party.xp },
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
          return '<label class="setup-row"><input type="checkbox" data-hero="' + h.id + '">' +
            '<span class="setup-name">' + esc(h.name) + (h.klass ? ' <span class="setup-class">' + esc(h.klass) + '</span>' : '') + '</span>' +
            '<span class="stat-pills compact"><span class="stat-pill">❤ ' + pv + '/' + maxPv + '</span></span>' +
          '</label>';
        }).join('')
      : '<p class="empty">Aucun aventurier pré-construit. Crée-en dans l\'onglet Aventuriers.</p>';
    function refreshAdvice() {
      const n = list.querySelectorAll('[data-hero]:checked').length;
      if (advice) advice.textContent = difficultyAdvice(n) || 'Sélectionne au moins un aventurier.';
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
                  '<button class="danger ses-end" data-id="' + s.id + '">Terminer</button>' +
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
        if (!confirm('Terminer cette session ?')) return;
        sessions.forEach(function (s) { if (s.id === b.getAttribute('data-id')) s.status = 'ended'; });
        save(); render();
      });
    });
  }

  function renderScene(root) {
    const ses = activeSession;
    const adv = findAdventure(ses.adventureId);
    if (!adv) { root.innerHTML = '<p class="empty">Aventure introuvable.</p>'; return; }

    const found = findScene(adv, ses.currentSceneId);
    if (!found) { root.innerHTML = '<p class="empty">Scène introuvable.</p>'; return; }
    const { chapter, scene } = found;

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
          '<div class="ses-scene-type type-' + scene.type + '">' + typeLabel(scene.type) + '</div>' +
          sceneContentHtml(scene) +
          '<div id="ses-actions" class="ses-actions"></div>' +
        '</div>' +
        '<div class="ses-heroes">' +
          '<h3>Héros engagés</h3>' +
          renderHeroesState(heroes, ses) +
        '</div>' +
      '</div>';

    $('#ses-quit').addEventListener('click', function () {
      activeSession = null;
      if (global.Shell && Shell.getMode && Shell.getMode() === 'player' && global.App) {
        App.selectTab('saves'); // vue des parties sauvegardées
      } else { render(); }
    });

    renderSceneActions(scene, adv, ses);
  }

  // Construit le HTML du contenu textuel d'une scène.
  // 1) Si un ancien champ `text` existe, il est affiché en style narratif.
  // 2) Les blocs typés sont rendus ensuite dans leur propre style.
  function sceneContentHtml(scene) {
    var parts = [];
    // Champ hérité : affiché comme narratif si non vide
    if (scene.text && scene.text.trim()) {
      parts.push('<div class="scene-block scene-block-narrative">' +
        esc(scene.text).replace(/\n/g, '<br>') + '</div>');
    }
    // Blocs typés
    var blocks = Array.isArray(scene.blocks) ? scene.blocks : [];
    blocks.forEach(function (blk) {
      var cls = 'scene-block scene-block-' + (blk.type || 'narrative');
      var content = esc(blk.content || '').replace(/\n/g, '<br>');
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

  function renderHeroesState(heroes, ses) {
    if (!heroes.length) return '<p class="empty">Aucun héros.</p>';
    return '<div class="ses-hero-list">' + heroes.map(function (h) {
      const state = ses.heroStates[h.id] || {};
      const curPv = typeof state.pv === 'number' ? state.pv : Combatants.heroCurPv(h);
      const maxPv = Combatants.heroPv(h);
      const pct = Math.round((curPv / maxPv) * 100);
      return '<div class="ses-hero-row">' +
        '<span class="ses-hero-name">' + esc(h.name) + '</span>' +
        '<div class="pv-bar" style="flex:1;min-width:80px"><div class="pv-fill" style="width:' + pct + '%"></div>' +
          '<span class="pv-text">' + curPv + '/' + maxPv + '</span></div>' +
        '<button class="ghost xs ses-hp-minus" data-hero="' + h.id + '" title="-1 PV">−1</button>' +
        '<button class="ghost xs ses-hp-plus" data-hero="' + h.id + '" title="+1 PV">+1</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderSceneActions(scene, adv, ses) {
    const box = $('#ses-actions');
    if (!box) return;
    box.innerHTML = '';

    if (scene.type === 'combat') {
      renderCombatScene(box, scene, adv, ses);
    } else if (scene.type === 'reward') {
      renderRewardScene(box, scene, adv, ses);
    } else if (scene.type === 'fin') {
      box.innerHTML = '<div class="ses-fin"><strong>Fin de l\'aventure.</strong>' +
        '<button class="primary" id="ses-fin-btn" style="margin-top:.75rem">Terminer la session</button></div>';
      document.getElementById('ses-fin-btn').addEventListener('click', function () {
        ses.status = 'ended'; save(); activeSession = null; render();
      });
    } else {
      // exploration / interaction : choix ou avancer
      if (scene.choices && scene.choices.length) {
        box.innerHTML = '<div class="ses-choices">' +
          scene.choices.map(function (ch) {
            return '<div class="ses-choice">' +
              '<button class="ses-choice-btn ghost" data-target="' + ch.targetSceneId + '">' + esc(ch.label) + '</button>' +
              (ch.description ? '<div class="ses-choice-desc">' + esc(ch.description) + '</div>' : '') +
            '</div>';
          }).join('') +
        '</div>';
        box.querySelectorAll('.ses-choice-btn').forEach(function (b) {
          b.addEventListener('click', function () {
            const targetId = b.getAttribute('data-target');
            ses.choicesTaken.push({ sceneId: scene.id, choiceLabel: b.textContent, targetSceneId: targetId });
            navigateTo(ses, adv, targetId);
          });
        });
      } else if (scene.nextSceneId) {
        box.innerHTML = '<button class="primary" id="ses-next">Continuer →</button>';
        document.getElementById('ses-next').addEventListener('click', function () {
          navigateTo(ses, adv, scene.nextSceneId);
        });
      }
    }

    // PV hero buttons (wired after each render)
    const root = $('#session-root');
    if (root) {
      root.querySelectorAll('.ses-hp-minus').forEach(function (b) {
        b.addEventListener('click', function () {
          const hid = b.getAttribute('data-hero');
          const h = Store.state.heroes.find(function (x) { return x.id === hid; });
          if (!h) return;
          if (!ses.heroStates[hid]) ses.heroStates[hid] = { pv: Combatants.heroCurPv(h) };
          ses.heroStates[hid].pv = Math.max(0, ses.heroStates[hid].pv - 1);
          save(); render();
        });
      });
      root.querySelectorAll('.ses-hp-plus').forEach(function (b) {
        b.addEventListener('click', function () {
          const hid = b.getAttribute('data-hero');
          const h = Store.state.heroes.find(function (x) { return x.id === hid; });
          if (!h) return;
          if (!ses.heroStates[hid]) ses.heroStates[hid] = { pv: Combatants.heroCurPv(h) };
          const maxPv = Combatants.heroPv(h);
          ses.heroStates[hid].pv = Math.min(maxPv, ses.heroStates[hid].pv + 1);
          save(); render();
        });
      });
    }
  }

  function navigateTo(ses, adv, sceneId) {
    if (!sceneId) return;
    const found = findScene(adv, sceneId);
    if (!found) return;
    ses.currentChapterId = found.chapter.id;
    ses.currentSceneId = sceneId;
    if (ses.visitedSceneIds.indexOf(sceneId) === -1) ses.visitedSceneIds.push(sceneId);
    save();
    render();
  }

  function renderCombatScene(box, scene, adv, ses) {
    const monsterRefs = (scene.monsterRefs || []).filter(function (r) { return r.monsterId; });
    const monsterNames = monsterRefs.map(function (r) {
      const m = Store.state.monsters.find(function (x) { return x.id === r.monsterId; });
      return (m ? m.name : '?') + (r.count > 1 ? ' ×' + r.count : '');
    }).join(', ');

    box.innerHTML =
      '<div class="ses-combat-block">' +
        '<p>Adversaires : <strong>' + esc(monsterNames || '(aucun défini)') + '</strong></p>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
          '<button class="primary" id="ses-start-combat">⚔ Lancer le combat</button>' +
          (scene.outcomeSceneId
            ? '<button class="ghost" id="ses-skip-victory">Passer (victoire)</button>' : '') +
          (scene.defeatSceneId
            ? '<button class="danger" id="ses-skip-defeat">Passer (défaite)</button>' : '') +
        '</div>' +
      '</div>';

    document.getElementById('ses-start-combat').addEventListener('click', function () {
      launchSessionCombat(scene, adv, ses);
    });
    const sv = document.getElementById('ses-skip-victory');
    if (sv) sv.addEventListener('click', function () {
      navigateTo(ses, adv, scene.outcomeSceneId);
    });
    const sd = document.getElementById('ses-skip-defeat');
    if (sd) sd.addEventListener('click', function () {
      navigateTo(ses, adv, scene.defeatSceneId);
    });
  }

  function launchSessionCombat(scene, adv, ses) {
    // Préparer les données de combat
    const refs = (scene.monsterRefs || []).filter(function (r) { return r.monsterId; });
    if (!refs.length) { alert('Aucun monstre défini pour ce combat.'); return; }
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
    Combat.startInSession(ses.heroIds, refs, ctx, '#session-combat-root');
  }

  function renderRewardScene(box, scene, adv, ses) {
    const xp = scene.xpReward || 0;
    const rewards = (scene.itemRewards || []).filter(function (r) { return r.itemId; }).map(function (r) {
      const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
      return (it ? it.name : '?') + (r.qty > 1 ? ' ×' + r.qty : '');
    });

    box.innerHTML =
      '<div class="ses-reward-block">' +
        (xp ? '<p>✦ <strong>+' + xp + ' XP</strong> à distribuer</p>' : '') +
        (rewards.length ? '<p>Objets : <strong>' + esc(rewards.join(', ')) + '</strong></p>' : '') +
        '<button class="primary" id="ses-claim-reward">Récupérer la récompense</button>' +
      '</div>';

    document.getElementById('ses-claim-reward').addEventListener('click', function () {
      if (xp > 0) {
        Store.state.party.xp = (Store.state.party.xp || 0) + xp;
        ses.party.xp = (ses.party.xp || 0) + xp;
        Store.save();
      }
      // Ajouter les objets à l'inventaire
      (scene.itemRewards || []).forEach(function (r) {
        if (!r.itemId) return;
        const it = Store.state.items.find(function (x) { return x.id === r.itemId; });
        if (it) it.qty = (it.qty || 0) + (r.qty || 1);
      });
      Store.save();
      const nextId = scene.nextSceneId;
      if (nextId) navigateTo(ses, adv, nextId);
      else { box.innerHTML = '<p class="empty">Récompense récupérée. Aucune scène suivante définie.</p>'; }
    });
  }

  // Écouter la fin d'un combat déclenché par une session
  // detail = { sessionId, outcome }  (outcome : 'victory' | 'minor' | 'defeat' | null)
  // combat.js a déjà remis Store.state.sessionCombat à null ; on garde le contexte
  // de scène via la session elle-même (currentSceneId).
  window.addEventListener('adventure-combat-end', function (e) {
    const detail = e.detail;
    load();
    const ses = sessions.find(function (s) { return s.id === detail.sessionId; });
    if (!ses) return;
    activeSession = ses;
    const adv = findAdventure(ses.adventureId);
    if (!adv) return;

    // Récupérer la scène de combat courante pour connaître les cibles
    const found = findScene(adv, ses.currentSceneId);
    const scene = found ? found.scene : null;

    // Synchroniser les PV des héros engagés depuis l'issue du combat
    ses.heroIds.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h && typeof h.pv === 'number') ses.heroStates[hid] = { pv: h.pv };
    });
    save();

    let targetId = null;
    if (scene) {
      if (detail.outcome === 'defeat') targetId = scene.defeatSceneId;
      else if (detail.outcome === 'victory' || detail.outcome === 'minor') targetId = scene.outcomeSceneId;
    }

    if (targetId) {
      navigateTo(ses, adv, targetId);   // avance vers la scène de suite
    } else {
      render();                          // combat quitté sans issue : on réaffiche la scène
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
    if (activeSession) renderScene(root);
    else renderGroupSetup(root, scopeAdventureId);
  }

  // Première étape d'une aventure : créer son groupe puis choisir les engagés.
  function renderGroupSetup(root, advId) {
    forceSetup = false;
    const adv = findAdventure(advId);
    if (!adv) { root.innerHTML = '<p class="empty">Aventure introuvable.</p>'; return; }
    const heroes = Combatants.adventureHeroes(advId);

    // Aucun aventurier : inviter à créer le groupe
    if (!heroes.length) {
      root.innerHTML =
        '<div class="card">' +
          '<div class="card-head"><h2>Créez votre groupe d\'aventuriers</h2></div>' +
          '<p class="hint">Avant de commencer « ' + esc(adv.title) + ' », créez au moins un aventurier. ' +
            'Vos aventuriers restent disponibles pour rejouer l\'aventure autant de fois que vous le souhaitez.</p>' +
          '<div class="group-create-actions">' +
            '<button class="primary" id="grp-new">+ Nouvel Aventurier</button>' +
            '<button class="ghost" id="grp-prebuilt">+ Aventurier Pré-Construit</button>' +
          '</div>' +
        '</div>';
      document.getElementById('grp-new').onclick = function () { Combatants.openHeroModal(null); };
      document.getElementById('grp-prebuilt').onclick = function () { Combatants.openPrebuiltPicker(); };
      return;
    }

    const rows = heroes.map(function (h) {
      const checked = setupSel[h.id] ? ' checked' : '';
      return '<label class="setup-row' + (h.klass ? ' klass-' + slug(h.klass) : '') + '">' +
        '<input type="checkbox" data-hero="' + h.id + '"' + checked + '>' +
        '<span class="setup-name">' + esc(h.name) +
          (h.klass ? ' <span class="setup-class">' + esc(h.klass) + '</span>' : '') + '</span>' +
        '<span class="stat-pills compact"><span class="stat-pill">❤ ' + Combatants.heroPv(h) + '</span>' +
          '<span class="stat-pill">⚔ ' + h.damage + '</span></span>' +
      '</label>';
    }).join('');

    root.innerHTML =
      '<div class="card">' +
        '<div class="card-head"><h2>Votre groupe — ' + esc(adv.title) + '</h2>' +
          '<div style="display:flex;gap:.4rem">' +
            '<button class="ghost small" id="grp-prebuilt">+ Pré-Construit</button>' +
            '<button class="primary small" id="grp-new">+ Aventurier</button>' +
          '</div>' +
        '</div>' +
        '<p class="hint">Choisis 1 à 4 aventuriers qui partent à l\'aventure.</p>' +
        '<div id="grp-list" class="setup-list">' + rows + '</div>' +
        '<p class="diff-advice" id="grp-advice"></p>' +
        '<div class="roll-actions"><button class="primary big" id="grp-start">▶ Commencer l\'aventure</button></div>' +
      '</div>';

    function refresh() {
      const n = root.querySelectorAll('[data-hero]:checked').length;
      document.getElementById('grp-advice').textContent = difficultyAdvice(n) || 'Sélectionne au moins un aventurier (max 4).';
      document.getElementById('grp-start').disabled = n < 1 || n > 4;
    }
    root.querySelectorAll('[data-hero]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked && root.querySelectorAll('[data-hero]:checked').length > 4) {
          cb.checked = false; alert('Maximum 4 aventuriers par aventure.');
        }
        setupSel[cb.getAttribute('data-hero')] = cb.checked;
        refresh();
      });
    });
    document.getElementById('grp-new').onclick = function () { Combatants.openHeroModal(null); };
    document.getElementById('grp-prebuilt').onclick = function () { Combatants.openPrebuiltPicker(); };
    document.getElementById('grp-start').onclick = function () {
      const ids = Array.from(root.querySelectorAll('[data-hero]:checked')).map(function (cb) { return cb.getAttribute('data-hero'); });
      if (!ids.length || ids.length > 4) return;
      startSessionWithHeroes(advId, ids);
    };
    refresh();
  }

  // Crée une nouvelle partie avec les aventuriers choisis et lance la narration
  function startSessionWithHeroes(advId, heroIds) {
    const adv = findAdventure(advId);
    if (!adv) return;
    const firstSc = firstScene(adv);
    if (!firstSc) { alert('Cette aventure n\'a pas encore de scène.'); return; }
    load();
    const heroStates = {};
    heroIds.forEach(function (hid) {
      const h = Store.state.heroes.find(function (x) { return x.id === hid; });
      if (h) heroStates[hid] = { pv: Combatants.heroCurPv(h) };
    });
    const ses = {
      id: Store.uid(), adventureId: advId, startedAt: Date.now(), status: 'active',
      heroIds: heroIds.slice(), heroStates: heroStates,
      currentChapterId: firstSc.chapter.id, currentSceneId: firstSc.scene.id,
      visitedSceneIds: [firstSc.scene.id], choicesTaken: [], party: { xp: Store.state.party.xp },
    };
    sessions.push(ses); save();
    activeSession = ses;
    setupSel = {};
    const root = $('#session-root');
    if (root) renderScene(root);
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
        '<div class="card-head"><h2>Sessions — ' + esc(adv ? adv.title : '') + '</h2>' +
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
                  '<button class="danger ses-end" data-id="' + s.id + '">Terminer</button>' +
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
        if (!confirm('Terminer cette session ?')) return;
        const id = b.getAttribute('data-id');
        sessions.forEach(function (s) { if (s.id === id) s.status = 'ended'; });
        if (activeSession && activeSession.id === id) activeSession = null;
        save(); renderSaves(scopeAdventureId);
      });
    });
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
    playAdventure: playAdventure,
    beginNewGame: beginNewGame,
    startFromAdventure: startFromAdventure,
  };
})(window);
