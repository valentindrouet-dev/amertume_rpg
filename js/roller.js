/*
 * Interface du lanceur de dés.
 * Combine les dés des armes équipées + des dés supplémentaires,
 * puis affiche la résolution détaillée.
 */
(function (global) {
  'use strict';

  const D = AmertumeDice;
  const $ = function (sel) { return document.querySelector(sel); };

  function buildExtraSteppers() {
    Inventory.buildDiceSteppers($('#dice-steppers'), Store.state.extraDice, function () {
      Store.save();
      refresh();
    });
  }

  function refresh() {
    const useEq = $('#use-equipped').checked;
    const eqPool = Inventory.equippedPool();
    const total = useEq ? D.addPools(eqPool, Store.state.extraDice) : Object.assign(D.emptyPool(), Store.state.extraDice);
    const summary = $('#equipped-summary');
    if (useEq && D.poolCount(eqPool)) {
      summary.innerHTML = 'Armes équipées : ' + Inventory.poolBadges(eqPool);
    } else if (useEq) {
      summary.innerHTML = 'Aucune arme équipée.';
    } else {
      summary.innerHTML = '';
    }
    $('#btn-roll').disabled = D.poolCount(total) === 0;
    return total;
  }

  function currentPool() {
    const useEq = $('#use-equipped').checked;
    const eqPool = Inventory.equippedPool();
    return useEq ? D.addPools(eqPool, Store.state.extraDice) : Object.assign(D.emptyPool(), Store.state.extraDice);
  }

  function dieFace(d) {
    const t = D.DICE_TYPES[d.color];
    const classes = ['die-face', 'die-' + d.color];
    if (d.value === 6) classes.push('is-six');
    if (d.value === 1) classes.push('is-one');
    if (d.removed) classes.push('is-removed');
    if (!d.passes && !t.heal) classes.push('is-miss');
    if (d.bonus) classes.push('is-bonus');
    const note = [];
    if (d.bonus) note.push('bonus');
    if (d.note) note.push(d.note);
    const shown = (d.color === 'yellow') ? d.contributed : d.value;
    return '<div class="' + classes.join(' ') + '" title="' + t.label + (d.bonus ? ' (relance critique)' : '') + '">' +
      '<span class="die-face-val">' + shown + '</span>' +
      (note.length ? '<span class="die-face-note">' + note.join(' · ') + '</span>' : '') +
    '</div>';
  }

  function roll() {
    const pool = currentPool();
    if (D.poolCount(pool) === 0) return;
    const res = D.resolve(pool, {
      def: $('#param-def').value,
      damage: $('#param-damage').value,
      turn: $('#param-turn').value,
    });
    renderResult(res);
    pushHistory(res);
  }

  function renderResult(res) {
    const box = $('#roll-result');
    const flags = [];
    if (res.echec) flags.push('<span class="flag flag-echec">ÉCHEC</span>');
    if (res.critique) flags.push('<span class="flag flag-crit">CRITIQUE</span>');

    box.innerHTML =
      (flags.length ? '<div class="flags">' + flags.join('') + '</div>' : '') +
      '<div class="dice-tray">' + res.dice.map(dieFace).join('') + '</div>' +
      '<div class="totals">' +
        '<div class="total dmg"><span>PV infligés</span><strong>' + res.pvLost + '</strong></div>' +
        (res.pvHealed ? '<div class="total heal"><span>Soin</span><strong>' + res.pvHealed + '</strong></div>' : '') +
      '</div>' +
      '<div class="hint">DEF ' + res.def +
        (res.damageBonus ? ' · dégâts attaquant +' + res.damageBonus : '') +
        (res.turnMult > 1 ? ' · Phase ×' + res.turnMult : '') + '</div>';
  }

  function pushHistory(res) {
    const summary = res.echec ? 'Échec' : (res.pvLost + ' PV' + (res.pvHealed ? ' / ' + res.pvHealed + ' soin' : ''));
    Store.state.history.unshift({
      t: Date.now(),
      summary: summary,
      crit: res.critique,
      echec: res.echec,
      dice: res.dice.map(function (d) { return { color: d.color, value: d.value }; }),
    });
    Store.state.history = Store.state.history.slice(0, 12);
    Store.save();
    renderHistory();
  }

  function renderHistory() {
    const box = $('#roll-history');
    if (!Store.state.history.length) {
      box.innerHTML = '<p class="empty">Aucun lancer pour l\'instant.</p>';
      return;
    }
    box.innerHTML = Store.state.history.map(function (h) {
      const time = new Date(h.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const mini = h.dice.map(function (d) {
        return '<span class="mini-die die-' + d.color + '">' + d.value + '</span>';
      }).join('');
      return '<div class="hist-row">' +
        '<span class="hist-time">' + time + '</span>' +
        '<span class="hist-dice">' + mini + '</span>' +
        '<span class="hist-sum' + (h.crit ? ' crit' : '') + (h.echec ? ' echec' : '') + '">' + h.summary + '</span>' +
      '</div>';
    }).join('');
  }

  function init() {
    buildExtraSteppers();
    renderHistory();
    refresh();
    $('#use-equipped').addEventListener('change', refresh);
    $('#btn-roll').addEventListener('click', roll);
    $('#btn-clear-extra').addEventListener('click', function () {
      Store.state.extraDice = D.emptyPool();
      Store.save();
      buildExtraSteppers();
      refresh();
    });
    document.addEventListener('equipment-changed', refresh);
  }

  global.Roller = { init: init, refresh: refresh, renderHistory: renderHistory };
})(window);
