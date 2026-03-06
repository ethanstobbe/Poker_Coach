// game-ui.js — table rendering, preflop display, street-by-street action playback
(() => {
  "use strict";

  const SUIT_SYMBOL = { s:"♠", h:"♥", d:"♦", c:"♣" };
  const RED_SUITS   = new Set(["♥","♦"]);

  let timers = [];
  const later    = (fn,ms) => { const id=setTimeout(fn,ms); timers.push(id); return id; };
  const clearAll = ()      => { timers.forEach(clearTimeout); timers=[]; };
  function noop(){}

  /* ════════════════════════════════════
     CARD HELPERS
  ════════════════════════════════════ */

  function clearCard(el){
    if(!el) return;
    el.textContent="";
    el.removeAttribute("data-rank");
    el.removeAttribute("data-suit");
    el.classList.remove("filled","red","card-back","flip");
  }

  function normalizeCard(raw){
    if(!raw) return null;
    if(typeof raw==="object"){
      let {rank,suit}=raw;
      if(!rank||!suit) return null;
      if(SUIT_SYMBOL[suit]) suit=SUIT_SYMBOL[suit];
      return {rank:String(rank).toUpperCase(), suit};
    }
    const s=String(raw).trim();
    if(s.length<2) return null;
    return {
      rank: s.slice(0,s.length-1).toUpperCase(),
      suit: SUIT_SYMBOL[s.slice(-1).toLowerCase()] || s.slice(-1)
    };
  }

  function renderCard(el,raw){
    if(!el) return;
    const card=normalizeCard(raw);
    if(!card){ clearCard(el); return; }
    // Large center suit symbol only — corners rendered via CSS ::before/::after
    el.textContent = card.suit;
    el.setAttribute("data-rank", card.rank);
    el.setAttribute("data-suit", card.suit);
    el.classList.remove("card-back");
    el.classList.add("filled");
    if(RED_SUITS.has(card.suit)) el.classList.add("red");
    else el.classList.remove("red");
  }

  function renderCardBack(el){
    if(!el) return;
    el.removeAttribute("style");
    el.textContent="";
    el.classList.remove("filled","red");
    el.classList.add("card-back");
  }

  function flipThenRender(el,raw,delay){
    later(()=>{
      if(!el) return;
      if(window.SoundEngine) SoundEngine.play('flip');
      el.classList.add("flip");
      later(()=>{ renderCard(el,raw); el.classList.remove("flip"); }, 120);
    }, delay);
  }

  /* ════════════════════════════════════
     ENSURE OPP CARDS EXIST (seats 2-8)
  ════════════════════════════════════ */

  function ensureOppCards(){
    for(let s=2;s<=8;s++){
      const el=document.getElementById(`p${s}`);
      if(!el) continue;
      let hole=el.querySelector(".opp-hole");
      if(!hole){ hole=document.createElement("div"); hole.className="opp-hole"; el.prepend(hole); }
      while(hole.querySelectorAll(".opp-card").length<2){
        const c=document.createElement("div"); c.className="opp-card"; hole.appendChild(c);
      }
    }
  }

  /* ════════════════════════════════════
     DEAL HOLE CARDS ANIMATION
     Flies card backs from deck to every
     active seat, then hero cards flip face-up.
  ════════════════════════════════════ */

  function getSeatScreenPos(seatId) {
    const el = document.getElementById(seatId === 0 ? "hero" : `p${seatId}`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function getDeckScreenPos() {
    const el = document.getElementById("deck");
    if (!el) return { x: window.innerWidth/2, y: window.innerHeight/2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function flyCard(targetSeatId, delay, isHero, cardData, onLand) {
    later(() => {
      if(window.SoundEngine) SoundEngine.play('deal');
      const deck   = getDeckScreenPos();
      const target = getSeatScreenPos(targetSeatId);
      if (!target) { if (onLand) onLand(); return; }

      const fly = document.createElement("div");
      fly.style.cssText = `
        position:fixed;z-index:200;pointer-events:none;
        width:${isHero ? 38 : 18}px;
        height:${isHero ? 54 : 26}px;
        border-radius:${isHero ? 5 : 3}px;
        background:repeating-linear-gradient(45deg,#1a4c8b,#1a4c8b 3px,#0f2a4d 3px,#0f2a4d 6px);
        border:1.5px solid #2e6fa3;
        box-shadow:0 4px 14px rgba(0,0,0,0.7);
        left:${deck.x - (isHero ? 19 : 9)}px;
        top:${deck.y - (isHero ? 27 : 13)}px;
        transition:left 0.28s cubic-bezier(.22,1,.36,1),
                   top  0.28s cubic-bezier(.22,1,.36,1),
                   transform 0.28s ease,
                   opacity 0.1s ease 0.24s;
        transform:rotate(${Math.random()*10-5}deg);
      `;
      document.body.appendChild(fly);

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const dx = isHero ? 19 : 9;
        const dy = isHero ? 27 : 13;
        fly.style.left = `${target.x - dx}px`;
        fly.style.top  = `${target.y - dy}px`;
        fly.style.transform = "rotate(0deg)";
      }));

      later(() => {
        fly.style.opacity = "0";
        later(() => {
          fly.remove();
          // Hero card reveal: remove card-back, play flip animation, render face
          if (isHero && cardData) {
            const cardEl = document.getElementById(cardData.which === 1 ? "card1" : "card2");
            if (cardEl) {
              // Strip ALL classes so dealHeroCard animation always fires fresh
              cardEl.classList.remove("card-back", "filled", "red", "flip");
              void cardEl.offsetWidth; // force reflow
              if(window.SoundEngine) SoundEngine.play("flip");
              cardEl.classList.add("flip");
              later(() => {
                cardEl.classList.remove("flip");
                void cardEl.offsetWidth; // force reflow before filled
                renderCard(cardEl, cardData.card);
              }, 130);
            }
          }
          if (onLand) onLand();
        }, 120);
      }, 260);
    }, delay);
  }

  // Public: deal 2 cards to every active seat, then hero cards show face-up
  window.dealHoleCards = function(scenario, onComplete) {
    // ── Guarantee hero always has 2 visible cards ──────────────────────────
    // If the scenario has no hero_hand, pick two placeholder cards so the
    // reveal animation always has real data to render face-up.
    const PLACEHOLDER_DECK = [
      {rank:"A",suit:"♠"},{rank:"K",suit:"♥"},{rank:"Q",suit:"♦"},
      {rank:"J",suit:"♣"},{rank:"T",suit:"♠"},{rank:"9",suit:"♥"},
      {rank:"8",suit:"♦"},{rank:"7",suit:"♣"},{rank:"6",suit:"♠"},
      {rank:"5",suit:"♥"},{rank:"4",suit:"♦"},{rank:"3",suit:"♣"},
      {rank:"2",suit:"♠"}
    ];
    function pickPlaceholder(exclude) {
      for (const c of PLACEHOLDER_DECK) {
        if (!exclude || !(exclude.rank===c.rank && exclude.suit===c.suit)) return c;
      }
      return {rank:"A",suit:"♠"};
    }
    if (!scenario.hero || scenario.hero.length < 2) {
      const c1 = (scenario.hero && scenario.hero[0]) ? scenario.hero[0] : pickPlaceholder(null);
      const c2 = (scenario.hero && scenario.hero[1]) ? scenario.hero[1] : pickPlaceholder(c1);
      scenario = Object.assign({}, scenario, { hero: [c1, c2] });
    }

    const activeSeatIds = [0, 2, 3, 4, 5, 6, 7, 8].filter(s => {
      if (s === 0) return true;
      const p = (scenario.players || []).find(p => p.seat === s);
      return p && p.hand && p.hand.length > 0;
    });

    const DEAL_GAP = 90; // ms between each card
    let cardIndex  = 0;

    // Deal card 1 to all active seats, then card 2 (like real poker)
    const order = [...activeSeatIds, ...activeSeatIds]; // 2 passes

    order.forEach((seatId, i) => {
      const cardNum = i < activeSeatIds.length ? 1 : 2; // first pass = card1, second = card2
      const isHero  = seatId === 0;
      const delay   = i * DEAL_GAP;

      flyCard(
        seatId, delay, isHero,
        isHero
          ? { which: cardNum, card: scenario.hero?.[cardNum - 1] }
          : null,
        null
      );
    });

    // After all cards dealt, fire complete callback
    // Also force-render hero cards as a safety fallback in case flyCard reveal was missed
    const totalTime = order.length * DEAL_GAP + 600;
    later(() => {
      const hc1 = document.getElementById("card1");
      const hc2 = document.getElementById("card2");
      // Force-render if card is not showing face-up (card-back OR completely blank)
      const notFilled = el => el && !el.classList.contains("filled");
      if (notFilled(hc1)) {
        hc1.classList.remove("card-back", "flip");
        void hc1.offsetWidth;
        renderCard(hc1, scenario.hero[0]);
      }
      if (notFilled(hc2)) {
        hc2.classList.remove("card-back", "flip");
        void hc2.offsetWidth;
        renderCard(hc2, scenario.hero[1]);
      }
      if (onComplete) onComplete();
    }, totalTime);
  };

  /* ════════════════════════════════════
     POSITION BADGES
  ════════════════════════════════════ */

  // positionMap: { 0:"BTN", 2:"SB", 3:"BB", ... }
  function renderPositions(positionMap){
    if(!positionMap) return;
    Object.entries(positionMap).forEach(([seat, pos]) => {
      const el = document.getElementById(`pos-${seat}`);
      if(el) el.textContent = pos;
    });
  }

  /* ════════════════════════════════════
     OPPONENT STYLES + FOLD MARKERS
  ════════════════════════════════════ */

  function renderOpponentStyles(players){
    if(!Array.isArray(players)) return;
    players.forEach(p => {
      const b = document.getElementById(`act-p${p.seat}`);
      if(!b) return;
      if(!p.hand || p.hand.length===0){
        b.textContent="OUT"; b.className="action-badge fold";
      } else {
        b.textContent=p.style||""; b.className="action-badge";
      }
    });
  }

  function markFoldedPlayers(players){
    if(!Array.isArray(players)) return;
    for(let s=2;s<=8;s++){
      const el=document.getElementById(`p${s}`);
      if(el) el.style.opacity="1";
    }
    players.forEach(p=>{
      if(!p.hand||p.hand.length===0){
        const el=document.getElementById(`p${p.seat}`);
        if(el) el.style.opacity="0.35";
      }
    });
  }

  /* ════════════════════════════════════
     RESET TABLE
  ════════════════════════════════════ */

  function resetTable(){
    clearAll();
    ensureOppCards();

    ["card1","card2","flop1","flop2","flop3","turnCard","riverCard"]
      .forEach(id => clearCard(document.getElementById(id)));

    // Pot display reset handled by initPotAndStacks (preserves tournament stacks)

    updateStreetLabel("HAND");

    for(let i=2;i<=8;i++){
      const b  = document.getElementById(`act-p${i}`);
      if(b){ b.textContent=""; b.className="action-badge"; }
      const el = document.getElementById(`p${i}`);
      if(el) el.style.opacity="1";
      el?.querySelectorAll(".opp-card").forEach(renderCardBack);
    }

    const hb = document.getElementById("act-hero");
    if(hb){ hb.textContent=""; hb.className="action-badge"; }

    clearPlayerBets();
  }

  /* ════════════════════════════════════
     STREET LABEL  (public so app.js can call)
  ════════════════════════════════════ */

  function updateStreetLabel(txt){
    const el = document.getElementById("tb-street");
    if(el) el.textContent = txt;
  }
  window.updateStreetLabel = updateStreetLabel;

  /* ════════════════════════════════════
     PLAYER BET CHIPS
  ════════════════════════════════════ */

  function showPlayerBet(seatNum, label){
    const wrap = document.getElementById(`pbet-${seatNum}`);
    const amt  = document.getElementById(`pbet-amt-${seatNum}`);
    if(!wrap) return;
    if(amt) amt.textContent = label;
    wrap.classList.add("has-bet");
  }

  function clearPlayerBets(){
    document.querySelectorAll(".player-bet")
      .forEach(el => el.classList.remove("has-bet"));
  }

  window.clearPlayerBets = clearPlayerBets;

  /* ════════════════════════════════════
     LIVE POT + STACK TRACKING
  ════════════════════════════════════ */

  let potBB  = 0;
  let stacks = {};

  window.initPotAndStacks = function(scenarioPot, existingStacks) {
    potBB = parseFloat(scenarioPot) || 0;
    // If existingStacks passed (tournament mode), carry them over
    // Otherwise reset everyone to 100 BB (quick play mode)
    if (existingStacks && Object.keys(existingStacks).length > 0) {
      stacks = { ...existingStacks };
    } else {
      stacks = {};
      [0,2,3,4,5,6,7,8].forEach(s => { stacks[s] = 100; });
    }
    renderPot();
    renderAllStacks();
  };

  // Returns current stacks so tournament can persist them
  window.getStacks = function() { return { ...stacks }; };

  // Award pot to winner seat after hand ends
  window.awardPotToWinner = function(winnerSeatId) {
    const won = potBB;
    stacks[winnerSeatId] = (stacks[winnerSeatId] || 0) + won;
    potBB = 0;
    if (window.SoundEngine) SoundEngine.play('potWin');
    flashStack(winnerSeatId, "gaining");
    renderPot();
    renderStack(winnerSeatId);
    return won;
  };

  function renderPot() {
    // Update main pot display
    const el = document.getElementById("pot");
    if(el) el.textContent = potBB.toFixed(1);

    // Sync info-panel + bar-row2
    const infoPot  = document.getElementById("info-pot");
    const infoPot2 = document.getElementById("info-pot2");
    if(infoPot)  infoPot.textContent  = potBB.toFixed(1) + " BB";
    if(infoPot2) infoPot2.textContent = potBB.toFixed(1) + " BB";

    // Spin coin
    const coin = document.getElementById("pot-coin");
    if(coin){
      coin.classList.remove("spinning");
      void coin.offsetWidth;
      coin.classList.add("spinning");
      setTimeout(()=>coin.classList.remove("spinning"), 2400);
    }
    // Pop amount text
    const amt = document.getElementById("pot-amount");
    if(amt){
      amt.classList.remove("popping");
      void amt.offsetWidth;
      amt.classList.add("popping");
      setTimeout(()=>amt.classList.remove("popping"), 400);
    }
  }

  function renderAllStacks() {
    Object.entries(stacks).forEach(([seat, bb]) => {
      const id = seat == 0 ? "stack-hero" : `stack-p${seat}`;
      const el = document.getElementById(id);
      if(el) el.textContent = Number(bb).toFixed(1) + " BB";
    });
  }

  function renderStack(seatId) {
    const id = seatId == 0 ? "stack-hero" : `stack-p${seatId}`;
    const el = document.getElementById(id);
    if(el) el.textContent = (stacks[seatId]||0).toFixed(1) + " BB";
  }

  function flashStack(seatId, cls) {
    const id = seatId == 0 ? "stack-hero" : `stack-p${seatId}`;
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove("losing","gaining");
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(()=>el.classList.remove(cls), 500);
  }

  // lastBetBB tracks the current street's bet size for calls
  let lastBetBB = 2;

  function applyBet(playerNum, amountPct) {
    const seatId  = playerNum === 1 ? 0 : playerNum;
    // Use % of pot if pot > 0, else use flat BB (2BB min)
    const basePot = potBB > 2 ? potBB : 10;
    const betBB   = Math.max(2, basePot * (amountPct / 100));
    lastBetBB = betBB;
    stacks[seatId] = (stacks[seatId] || 100) - betBB;
    potBB += betBB;
    flashStack(seatId, "losing");
    renderPot();
    renderStack(seatId);
  }

  function applyCall(playerNum) {
    const seatId = playerNum === 1 ? 0 : playerNum;
    const callBB = lastBetBB || 2;
    stacks[seatId] = (stacks[seatId] || 100) - callBB;
    potBB += callBB;
    flashStack(seatId, "losing");
    renderPot();
    renderStack(seatId);
  }

  window.applyEarningsGain = function(earningsBB) {
    stacks[0] = (stacks[0] || 100) + earningsBB;
    flashStack(0, "gaining");
    renderStack(0);
  };

  /* ════════════════════════════════════
     ACTION BADGE
  ════════════════════════════════════ */

  function showSeatAction(act){
    const num = parseInt(act.player.replace("P",""));
    const el  = (num===1)
      ? document.getElementById("act-hero")
      : document.getElementById(`act-p${num}`);
    if(!el) return;

    let label="", cls="";
    /* ── Sound for every action (hero + opponent) ── */
    if (window.SoundEngine) {
      switch(act.type){
        case 'fold':  SoundEngine.play('fold');  break;
        case 'check': SoundEngine.play('check'); break;
        case 'call':  SoundEngine.play('call');  break;
        case 'bet':
        case 'raise': SoundEngine.play('raise'); break;
      }
    }
    switch(act.type){
      case "check": label="CHECK";              cls="check"; break;
      case "fold":  label="FOLD";               cls="fold";  break;
      case "call":  label="CALL";               cls="call";  break;
      case "bet":   label=`BET ${act.amount}%`; cls="raise"; break;
      case "raise": label=`RAISE ${act.amount}%`;cls="raise";break;
      default:      label=act.type.toUpperCase();
    }
    el.textContent=label;
    el.className=`action-badge ${cls}`;

    const seatId = (num===1) ? 0 : num;
    if(act.type==="bet" || act.type==="raise"){
      applyBet(num, act.amount || 50);
      showPlayerBet(seatId, `${act.amount||50}%`);
    } else if(act.type==="call"){
      applyCall(num);
      showPlayerBet(seatId, "CALL");
    } else {
      const w=document.getElementById(`pbet-${seatId}`);
      if(w) w.classList.remove("has-bet");
    }

    if(act.type==="fold") animateFold(num);
  }

  function animateFold(num){
    const seat = (num===1)
      ? document.getElementById("hero")
      : document.getElementById(`p${num}`);
    if(!seat) return;
    seat.querySelectorAll(".opp-card").forEach(c=>{
      c.style.transition="all 0.3s ease";
      c.style.transform ="translateY(16px) rotate(12deg)";
      c.style.opacity   ="0.12";
    });
    later(()=>{ seat.style.opacity="0.38"; }, 350);
  }

  /* ════════════════════════════════════
     HAND OVER BANNER
  ════════════════════════════════════ */

  function showHandOver(){
    updateStreetLabel("HAND OVER");
    const pa = document.getElementById("pot-amount");
    if(pa){ pa.style.color="#ff6060"; pa.innerHTML="HAND OVER"; }
  }

  /* ════════════════════════════════════
     ACTION SEQUENCE PLAYER

     Loops tagged action array:
       opponent action  → show badge, wait 1100ms, next
       isHero (first)   → call onHeroTurn(resumeFn), PAUSE
       HAND_OVER        → banner, onComplete
     Always ends with onComplete().
  ════════════════════════════════════ */

  function playActionsInOrder(actions, onHeroTurn, onComplete){
    if(actions==="HAND_OVER"){
      showHandOver();
      later(onComplete||noop, 600);
      return;
    }

    // ── Empty action list: hero STILL gets a decision ──────────────────────
    if(!Array.isArray(actions) || actions.length===0){
      if(onHeroTurn){
        // Give hero the decision; after they act, fire onComplete
        onHeroTurn(() => later(onComplete||noop, 200));
      } else {
        later(onComplete||noop, 150);
      }
      return;
    }

    let i=0, heroSeen=false;

    function next(){
      if(i>=actions.length){
        // All scripted actions done — if hero never had a turn, give one now
        if(!heroSeen && onHeroTurn){
          heroSeen=true;
          onHeroTurn(() => later(onComplete||noop, 400));
        } else {
          later(onComplete||noop, 400);
        }
        return;
      }
      const act=actions[i++];

      if(act.isHero && !heroSeen){
        heroSeen=true;
        if(onHeroTurn){ onHeroTurn(next); return; }
        // No UI handler supplied — auto-play the correct action
        showSeatAction(act);
        later(next, 1100);
        return;
      }

      // Opponent action (or subsequent hero action — show correct move)
      showSeatAction(act);
      later(next, 1100);
    }

    next();
  }

  /* ════════════════════════════════════
     CARD DEALERS PER STREET
  ════════════════════════════════════ */

  function dealFlopCards(scenario, cb){
    clearPlayerBets();
    const f1=document.getElementById("flop1");
    const f2=document.getElementById("flop2");
    const f3=document.getElementById("flop3");
    clearCard(f1); clearCard(f2); clearCard(f3);
    const t0=350, gap=160;
    flipThenRender(f1, scenario.flop?.[0], t0);
    flipThenRender(f2, scenario.flop?.[1], t0+gap);
    flipThenRender(f3, scenario.flop?.[2], t0+gap*2);
    later(()=>{ if(cb) cb(); }, t0+gap*2+280);
  }

  function dealTurnCard(scenario, cb){
    clearPlayerBets();
    const el=document.getElementById("turnCard");
    clearCard(el);
    flipThenRender(el, scenario.turn?.[0], 220);
    later(()=>{ if(cb) cb(); }, 680);
  }

  function dealRiverCard(scenario, cb){
    clearPlayerBets();
    const el=document.getElementById("riverCard");
    clearCard(el);
    flipThenRender(el, scenario.river?.[0], 220);
    later(()=>{ if(cb) cb(); }, 680);
  }

  /* ════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════ */

  /*
    renderScenario(scenario)
    ─────────────────────────
    Resets table. Shows:
      - Hero hole cards
      - Position badges on every seat
      - Opponent styles / fold markers
      - Pot amount
    Does NOT deal the board — app.js calls dealStreet() for that.
    Called at the very start of each hand, before preflop phase.
  */
  window.renderScenario = function(scenario, existingStacks){
    resetTable();

    // Restore pot-amount HTML FIRST so #pot span exists before tracking starts
    const pa = document.getElementById("pot-amount");
    if(pa){
      pa.style.color="";
      pa.innerHTML=`<span id="pot">${scenario.pot ?? 0}</span> BB`;
    }
    // Init pot + stacks — pass existingStacks for tournament (carries over between hands)
    window.initPotAndStacks(scenario.pot ?? 0, existingStacks || {});

    // Hero cards start as card-backs. The flyCard animation will flip
    // them face-up when each card lands — that IS the reveal moment.
    // If dealHoleCards is never called (edge case), reveal them face-up as fallback.
    const hc1 = document.getElementById("card1");
    const hc2 = document.getElementById("card2");
    if(scenario.hero?.[0]) renderCardBack(hc1); else clearCard(hc1);
    if(scenario.hero?.[1]) renderCardBack(hc2); else clearCard(hc2);
    // Mini-cards in the bottom action bar are always visible immediately
    renderCard(document.getElementById("mini-card1"), scenario.hero?.[0]);
    renderCard(document.getElementById("mini-card2"), scenario.hero?.[1]);

    // Position labels on every seat
    renderPositions(scenario.positions);

    // Opponent styles + preflop fold markers
    renderOpponentStyles(scenario.players);
    markFoldedPlayers(scenario.players);
  };

  /*
    dealStreet(street, scenario, onHeroTurn, onComplete)
    ─────────────────────────────────────────────────────
    street     : "flop" | "turn" | "river"
    scenario   : scenario object from /start
    onHeroTurn : fn(resumeFn) — app.js shows buttons, calls resumeFn() when done
    onComplete : fn() — whole street finished
  */
  window.dealStreet = function(street, scenario, onHeroTurn, onComplete){
    const actions = {
      flop:  scenario.flopActions,
      turn:  scenario.turnActions,
      river: scenario.riverActions,
    }[street];

    function afterDeal(){
      updateStreetLabel(street.toUpperCase());
      playActionsInOrder(actions, onHeroTurn, onComplete);
    }

    if     (street==="flop")  dealFlopCards(scenario, afterDeal);
    else if(street==="turn")  dealTurnCard(scenario, afterDeal);
    else if(street==="river") dealRiverCard(scenario, afterDeal);
    else afterDeal();
  };

  /*
    showHeroActionBadge(actionType)
    ────────────────────────────────
    Shows user's chosen action on the hero seat badge + chip pile.
    Works for both preflop (fold/call/raise) and postflop actions.
  */
  window.showHeroActionBadge = function(actionType){
    const badge = document.getElementById("act-hero");
    if(!badge) return;

    const MAP = {
      // Preflop
      fold:   { l:"FOLD",    c:"fold",  chip:null    },
      call:   { l:"CALL",    c:"call",  chip:"CALL"  },
      raise:  { l:"RAISE",   c:"raise", chip:"RAISE" },
      // Postflop
      check:  { l:"CHECK",   c:"check", chip:null    },
      bet33:  { l:"BET 33%", c:"raise", chip:"33%"   },
      bet50:  { l:"BET 50%", c:"raise", chip:"50%"   },
      bet75:  { l:"BET 75%", c:"raise", chip:"75%"   },
      bet100: { l:"BET POT", c:"raise", chip:"POT"   },
      allin:  { l:"ALL IN",  c:"raise", chip:"ALL IN"},
    };

    const { l, c, chip } = MAP[actionType] || { l:actionType.toUpperCase(), c:"", chip:null };
    badge.textContent = l;
    badge.className   = `action-badge ${c}`;

    if(chip) {
      showPlayerBet(0, chip);
      // Apply pot/stack changes for hero bet actions
      if(actionType==="bet33")  applyBet(1, 33);
      else if(actionType==="bet50")  applyBet(1, 50);
      else if(actionType==="bet75")  applyBet(1, 75);
      else if(actionType==="bet100") applyBet(1, 100);
      else if(actionType==="allin")  applyBet(1, 200);
      else if(actionType==="call")   applyCall(1);
      else if(actionType==="raise")  applyBet(1, 50);  // preflop raise
    } else {
      const w=document.getElementById("pbet-0");
      if(w) w.classList.remove("has-bet");
    }
  };

  window.addEventListener("load", () => {
    if(typeof requireAuth === "function") requireAuth();
  });

})();