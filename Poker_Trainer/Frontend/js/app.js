// // app.js — full preflop → flop → turn → river game flow
// const API_BASE = "http://localhost:3000/api";

// let accessToken     = localStorage.getItem("access_token");
// let sessionId       = null;
// let currentScenario = null;
// let _heroActionCb   = null;
// let _phase          = "idle";

// // Tracks user decisions every street including preflop
// let userActions = { preflop:null, flop:null, turn:null, river:null };

// /* ═══════════════════════════════════════════════════
//    AUTH
// ═══════════════════════════════════════════════════ */
// function requireAuth(){ if(!accessToken) window.location.href="index.html"; }
// function authHeaders(){ return {"Content-Type":"application/json", Authorization:`Bearer ${accessToken}`}; }
// function goMenu()    { window.location.href="menu.html";    }
// function goProfile() { window.location.href="profile.html"; }

// async function login(email, password){
//   showLoading(true);
//   const res  = await fetch(`${API_BASE}/auth/login`, {
//     method:"POST", headers:{"Content-Type":"application/json"},
//     body: JSON.stringify({email, password})
//   });
//   const data = await res.json();
//   showLoading(false);
//   if(!res.ok){ showError(data.error||"Login failed"); return; }
//   accessToken = data.access_token;
//   localStorage.setItem("access_token", accessToken);
//   localStorage.setItem("auth_id", data.user.id);
//   window.location.href = "menu.html";
// }

// function logout(){ localStorage.clear(); window.location.href="index.html"; }

// /* ═══════════════════════════════════════════════════
//    HELPERS
// ═══════════════════════════════════════════════════ */
// function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// // Pauses until a playerAction() / preflopAction() call resolves it
// function waitForHeroAction(){
//   return new Promise(resolve => { _heroActionCb = resolve; });
// }

// /* ═══════════════════════════════════════════════════
//    PHASE MANAGER
//    Phases: idle | preflop | playing | equity | result
// ═══════════════════════════════════════════════════ */
// function setPhase(phase){
//   _phase = phase;

//   // All interactive elements
//   const allActionBtns  = document.querySelectorAll(".action-btn");
//   const preflopBtns    = document.getElementById("preflop-btns");
//   const postflopBtns   = document.getElementById("postflop-btns");
//   const eInput         = document.getElementById("equityInput");
//   const bSubmit        = document.getElementById("btn-submit");
//   const bFinish        = document.getElementById("btn-finish");
//   const bNew           = document.getElementById("btn-new-hand");
//   const hint           = document.getElementById("phase-hint");

//   // Reset everything disabled
//   allActionBtns.forEach(b => b.disabled = true);
//   if(eInput)  eInput.disabled  = true;
//   if(bSubmit) bSubmit.disabled = true;
//   if(bFinish) bFinish.disabled = true;

//   // Clear selection highlight when leaving a playing phase
//   if(phase !== "preflop" && phase !== "playing"){
//     document.querySelectorAll(".btn-selected").forEach(b => b.classList.remove("btn-selected"));
//   }

//   // Show/hide button groups
//   if(preflopBtns)  preflopBtns.classList.toggle("active",  phase === "preflop");
//   if(postflopBtns) postflopBtns.classList.toggle("hidden",  phase === "preflop" || phase === "idle");

//   switch(phase){

//     case "idle":
//       if(hint) hint.textContent = "Press NEW HAND to start";
//       if(bNew) bNew.disabled = false;
//       break;

//     case "preflop":
//       if(hint) hint.textContent = "Preflop — Fold, Call or Raise?";
//       // Enable only preflop buttons
//       document.querySelectorAll(".preflop-btn").forEach(b => b.disabled = false);
//       if(bNew) bNew.disabled = false;
//       break;

//     case "playing":
//       if(hint) hint.textContent = "Your action — bet, check or fold?";
//       // Enable postflop action buttons (row1 bet buttons + row2 fold/check)
//       document.querySelectorAll(".action-btn:not(.preflop-btn)").forEach(b => b.disabled = false);
//       if(bNew) bNew.disabled = false;
//       break;

//     case "equity":
//       if(hint) hint.textContent = "Guess your equity % then submit";
//       if(eInput)  eInput.disabled  = false;
//       if(bSubmit) bSubmit.disabled = false;
//       if(bNew)    bNew.disabled    = false;
//       break;

//     case "result":
//       if(hint) hint.textContent = "Hand complete!";
//       if(bFinish) bFinish.disabled = false;
//       if(bNew)    bNew.disabled    = false;
//       break;
//   }
// }

// /* ═══════════════════════════════════════════════════
//    START GAME
// ═══════════════════════════════════════════════════ */
// async function startGame(){
//   requireAuth();
//   showLoading(true);
//   setPhase("idle");
//   userActions = { preflop:null, flop:null, turn:null, river:null };

//   // Hide result panel from previous hand
//   const rp = document.getElementById("result-panel");
//   if(rp) rp.style.display = "none";

//   const difficulty = document.getElementById("difficulty")?.value || "Medium";

//   try{
//     const res  = await fetch(`${API_BASE}/game/start`, {
//       method:"POST", headers: authHeaders(),
//       body: JSON.stringify({ difficulty })
//     });
//     const data = await res.json();
//     showLoading(false);
//     if(!res.ok){ showError(data.error||"Failed to start"); return; }

//     sessionId       = data.sessionId;
//     currentScenario = data.scenario;
//     localStorage.setItem("sessionId", sessionId);

//     // ── Step 1: Render table layout + positions ──
//     if(window.SoundEngine){ SoundEngine.play('shuffle'); SoundEngine.startMusic(); }
//     window.renderScenario(currentScenario);

//     // ── Step 1b: Animate card deal (flies cards from deck to all seats incl. hero) ──
//     await new Promise(resolve => {
//       if (typeof window.dealHoleCards === "function") {
//         window.dealHoleCards(currentScenario, resolve);
//       } else {
//         resolve();
//       }
//     });

//     // ── Step 2: PREFLOP DECISION ─────────────────────────────────────────
//     await runPreflopPhase();

//     // If hero folded preflop, skip all streets and go straight to result
//     if(userActions.preflop === "fold"){
//       await sleep(400);
//       setPhase("equity");
//       return;
//     }

//     // ── Step 3: FLOP ──────────────────────────────────────────────────────
//     await sleep(500);
//     await runStreet("flop");
//     // If hero folded on flop, skip turn & river
//     if(userActions.flop === "fold"){ await sleep(350); setPhase("equity"); return; }

//     // ── Step 4: TURN ──────────────────────────────────────────────────────
//     if(currentScenario.turnActions !== "HAND_OVER"){
//       await sleep(450);
//       await runStreet("turn");
//     }
//     // If hero folded on turn, skip river
//     if(userActions.turn === "fold"){ await sleep(350); setPhase("equity"); return; }

//     // ── Step 5: RIVER ─────────────────────────────────────────────────────
//     if(currentScenario.riverActions !== "HAND_OVER"){
//       await sleep(450);
//       await runStreet("river");
//     }

//     // ── Step 6: EQUITY GUESS ──────────────────────────────────────────────
//     await sleep(350);
//     setPhase("equity");

//   }catch(err){
//     showLoading(false);
//     showError(err.message);
//     console.error(err);
//   }
// }

// /* ═══════════════════════════════════════════════════
//    PREFLOP PHASE
//    Shows hole cards + positions. Hero picks Fold/Call/Raise.
//    Correct answer = raise if P1 stayed in, fold if P1 folded.
// ═══════════════════════════════════════════════════ */
// function runPreflopPhase(){
//   return new Promise(resolve => {
//     // Show preflop street label
//     window.updateStreetLabel("PREFLOP");
//     setPhase("preflop");

//     // Store resolve so preflopAction() can call it
//     _heroActionCb = (action) => {
//       userActions.preflop = action;
//       window.showHeroActionBadge(action);
//       setPhase("idle");
//       resolve();
//     };
//   });
// }

// /* ═══════════════════════════════════════════════════
//    PREFLOP ACTION (called by Fold/Call/Raise buttons)
// ═══════════════════════════════════════════════════ */
// function preflopAction(type){
//   if(_phase !== "preflop") return;
//   // Sound
//   if(window.SoundEngine){
//     if(type === "fold")              SoundEngine.play("fold");
//     else if(type === "raise")        SoundEngine.play("raise");
//     else                             SoundEngine.play("chip");
//   }
//   // Highlight selected button
//   document.querySelectorAll(".preflop-btn").forEach(b => b.classList.remove("btn-selected"));
//   const btn = document.querySelector(`.preflop-btn[data-action="${type}"]`);
//   if(btn) btn.classList.add("btn-selected");
//   // Resolve the waiting promise
//   if(_heroActionCb){
//     const cb = _heroActionCb;
//     _heroActionCb = null;
//     cb(type);
//   }
// }

// /* ═══════════════════════════════════════════════════
//    RUN ONE POSTFLOP STREET
//    Returns promise that resolves when ALL actions (including
//    hero decision) for that street are complete.
// ═══════════════════════════════════════════════════ */
// function runStreet(street){
//   if(window.SoundEngine) SoundEngine.play('cardReveal');
//   return new Promise(resolve => {
//     window.dealStreet(
//       street,
//       currentScenario,

//       // onHeroTurn — pauses playback for user to decide
//       async (resumeFn) => {
//         setPhase("playing");
//         const action = await waitForHeroAction();
//         userActions[street] = action;
//         window.showHeroActionBadge(action);
//         setPhase("idle");
//         await sleep(300);
//         resumeFn();   // resume remaining opponent actions
//       },

//       // onComplete — entire street done
//       resolve
//     );
//   });
// }

// /* ═══════════════════════════════════════════════════
//    POSTFLOP PLAYER ACTION (bet/check/fold buttons)
// ═══════════════════════════════════════════════════ */
// function playerAction(type){
//   if(_phase !== "playing") return;
//   // Sound
//   if(window.SoundEngine){
//     if(type === "fold")                           SoundEngine.play("fold");
//     else if(type === "allin")                     SoundEngine.play("allIn");
//     else if(type.startsWith("bet") || type === "raise") SoundEngine.play("chip");
//     else if(type === "check")                        SoundEngine.play("check");
//     else if(type === "call")                         SoundEngine.play("call");
//     else                                          SoundEngine.play("click");
//   }
//   document.querySelectorAll(".action-btn:not(.preflop-btn)")
//     .forEach(b => b.classList.remove("btn-selected"));
//   const btn = document.querySelector(`.action-btn[data-action="${type}"]`);
//   if(btn) btn.classList.add("btn-selected");
//   if(_heroActionCb){
//     const cb = _heroActionCb;
//     _heroActionCb = null;
//     cb(type);
//   }
// }

// /* ═══════════════════════════════════════════════════
//    SUBMIT EQUITY
// ═══════════════════════════════════════════════════ */
// async function submitEquity(){
//   const val = parseFloat(document.getElementById("equityInput")?.value);
//   if(isNaN(val) || val < 0 || val > 100){
//     showToast("Enter a value between 0 and 100", "error");
//     return;
//   }

//   showLoading(true);
//   const sid = sessionId || localStorage.getItem("sessionId");

//   try{
//     // Step 1: score the equity guess
//     const res  = await fetch(`${API_BASE}/game/${sid}/decision`, {
//       method:"POST", headers: authHeaders(),
//       body: JSON.stringify({ userEquity: val })
//     });
//     const equityData = await res.json();
//     showLoading(false);
//     if(!res.ok){ showError(equityData.error); return; }

//     _lastEquityData = equityData;
//     // Step 2: show result panel
//     showResultModal(equityData);
//     setPhase("result");

//     // Step 3: auto-complete (save + get earnings) then show winner overlay
//     await sleep(400);
//     await completeGame(equityData);

//   }catch(err){
//     showLoading(false);
//     showError(err.message);
//   }
// }

// /* ═══════════════════════════════════════════════════
//    RESULT MODAL
//    Shows: preflop grade + per-street action grades + equity score
// ═══════════════════════════════════════════════════ */
// function showResultModal(eq){
//   const panel = document.getElementById("result-panel");
//   if(!panel) return;

//   const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };

//   // ── Equity section ────────────────────────────────────────────
//   set("rp-your-equity",    `${eq.yourEquity}%`);
//   set("rp-correct-equity", `${eq.correctEquity}%`);
//   set("rp-equity-diff",    `Δ ${eq.equityDiff}%`);
//   set("rp-equity-score",   `+${eq.equityScore} pts`);

//   const etag = document.getElementById("rp-equity-tag");
//   if(etag){
//     const d = eq.equityDiff;
//     if(d <= 3)       { etag.textContent="GREAT"; etag.className="rp-tag tag-great"; }
//     else if(d <= 8)  { etag.textContent="GOOD";  etag.className="rp-tag tag-good";  }
//     else if(d <= 15) { etag.textContent="OK";    etag.className="rp-tag tag-ok";    }
//     else             { etag.textContent="MISS";  etag.className="rp-tag tag-bad";   }
//   }

//   // ── Action grading ────────────────────────────────────────────
//   let actionScore = 0;
//   let html = "";

//   const norm = t => (t||"").replace(/\d+/g,"").toLowerCase().trim();

//   // Preflop decision — 10 pts if correct
//   const pfUser    = userActions.preflop;
//   const pfCorrect = currentScenario?.preflopCorrectAction;  // "fold" | "raise"
//   if(pfUser && pfCorrect){
//     // call and raise both count as "staying in"
//     const userStayed  = pfUser === "call" || pfUser === "raise";
//     const heroStayed  = pfCorrect === "raise";
//     const pfMatch     = userStayed === heroStayed;
//     if(pfMatch) actionScore += 10;

//     const pfUserLabel    = pfUser.toUpperCase();
//     const pfCorrectLabel = pfCorrect.toUpperCase();
//     html += `
//       <div class="rp-action-row">
//         <span class="rp-street">PREFLOP</span>
//         <span class="rp-decision" style="color:${pfMatch?"#55dd88":"#ff7070"}">
//           You: ${pfUserLabel} ${pfMatch?"✓":"✗"}  Correct: ${pfCorrectLabel}
//         </span>
//       </div>`;
//   }

//   // Postflop streets
//   const streets = [
//     { k:"flop",  c: currentScenario?.correctFlopAction  },
//     { k:"turn",  c: currentScenario?.correctTurnAction  },
//     { k:"river", c: currentScenario?.correctRiverAction },
//   ];

//   streets.forEach(({ k, c }) => {
//     const u = userActions[k];
//     if(!u && !c) return;

//     const cLabel = c ? (c.amount ? `${c.type.toUpperCase()} ${c.amount}%` : c.type.toUpperCase()) : "—";
//     const uLabel = u ? u.replace(/(\d+)/,"$1%").toUpperCase() : "—";
//     const match  = c && u && norm(u) === norm(c.type);
//     if(match) actionScore += 10;

//     html += `
//       <div class="rp-action-row">
//         <span class="rp-street">${k.toUpperCase()}</span>
//         <span class="rp-decision" style="color:${match?"#55dd88":"#ff7070"}">
//           You: ${uLabel} ${match?"✓":"✗"}  Correct: ${cLabel}
//         </span>
//       </div>`;
//   });

//   const actRow = document.getElementById("rp-action-row");
//   if(actRow) actRow.innerHTML = html ||
//     `<span style="color:#888;font-size:11px">No decisions this hand</span>`;

//   // ── Total ─────────────────────────────────────────────────────
//   const total = (eq.equityScore || 0) + actionScore;
//   set("rp-total-score", `${total} pts`);

//   panel.style.display = "flex";
// }

// /* ═══════════════════════════════════════════════════
//    COMPLETE GAME
//    Called automatically after equity submit.
//    equityData passed in so we can factor into win decision.
// ═══════════════════════════════════════════════════ */
// async function completeGame(equityData){
//   const sid = sessionId || localStorage.getItem("sessionId");
//   try{
//     const res  = await fetch(`${API_BASE}/game/${sid}/complete`, {
//       method:"POST", headers: authHeaders()
//     });
//     const data = await res.json();
//     if(!res.ok){ showError(data.error); return; }

//     // Show explanation tip in result panel
//     if(data.explanation){
//       const expEl = document.getElementById("rp-explanation");
//       if(expEl) expEl.textContent = data.explanation;
//     }

//     // Reflect earnings gain on hero stack
//     if(data.earningsGain > 0 && typeof window.applyEarningsGain === "function"){
//       window.applyEarningsGain(data.earningsGain);
//     }

//     // ── Sound ────────────────────────────────────────────────────
//     if(window.SoundEngine){
//       if(data.isCorrect) SoundEngine.play("win");
//       else               SoundEngine.play("lose");
//     }

//     // ── Show winner overlay immediately ──────────────────────────
//     if(typeof showWinnerOverlay === "function"){
//       showWinnerOverlay(data.isCorrect, data.earningsGain ?? 0);
//     }

//     // ── Finish & Save button ──────────────────────────────────────
//     const bFinish = document.getElementById("btn-finish");
//     if(bFinish){
//       bFinish.disabled = false;
//       bFinish.onclick = () => { window.location.href = "profile.html"; };
//     }

//     // ── AI Explanation (streaming) ────────────────────────────────
//     streamExplanation();

//     // Auto-redirect after overlay dismisses (4.2s)
//     setTimeout(() => { window.location.href = "profile.html"; }, 4200);

//   }catch(err){
//     showError(err.message);
//   }
// }

// /* ═══════════════════════════════════════════════════
//    AI EXPLANATION — streaming from /api/game/explain
// ═══════════════════════════════════════════════════ */
// async function streamExplanation(){
//   const el = document.getElementById("rp-explanation");
//   if(!el) return;

//   // Show typing indicator immediately
//   el.innerHTML = '<span class="ai-typing"><span></span><span></span><span></span></span> Analysing hand...';
//   el.style.display = "block";

//   try {
//     const res = await fetch(`${API_BASE}/game/explain`, {
//       method: "POST",
//       headers: authHeaders(),
//       body: JSON.stringify({
//         scenario:    currentScenario,
//         userActions: userActions,
//         equityData:  _lastEquityData
//       })
//     });

//     if(!res.ok){ el.textContent = "AI coaching unavailable right now."; return; }

//     const ct = res.headers.get("Content-Type") || "";

//     /* ── SSE streaming path ── */
//     if(ct.includes("text/event-stream")){
//       el.textContent = "";
//       const reader  = res.body.getReader();
//       const decoder = new TextDecoder();
//       let buffer = "";

//       while(true){
//         const { done, value } = await reader.read();
//         if(done) break;
//         buffer += decoder.decode(value, { stream: true });
//         const lines = buffer.split("");
//         buffer = lines.pop();
//         for(const line of lines){
//           if(!line.startsWith("data: ")) continue;
//           const data = line.slice(6).trim();
//           if(data === "[DONE]") break;
//           try{
//             const parsed = JSON.parse(data);
//             if(parsed.token) el.textContent += parsed.token;
//           }catch{}
//         }
//       }
//       return;
//     }

//     /* ── Fallback: plain JSON ── */
//     const data = await res.json();
//     el.textContent = data.explanation || "No explanation available.";

//   } catch(err){
//     console.warn("streamExplanation error:", err);
//     el.textContent = "AI coaching temporarily unavailable.";
//   }
// }

// /* Store last equity data so streamExplanation can access it */
// let _lastEquityData = null;
// /* ═══════════════════════════════════════════════════
//    LEADERBOARD
// ═══════════════════════════════════════════════════ */
// async function loadLeaderboard(){
//   showLoading(true);
//   const res  = await fetch(`${API_BASE}/leaderboards`);
//   const data = await res.json();
//   showLoading(false);
//   if(!res.ok) return;
//   const container = document.getElementById("lbRows");
//   const total     = document.getElementById("totalPlayers");
//   if(!container) return;
//   container.innerHTML = "";
//   if(total) total.innerText = data.length;
//   data.forEach((player, i) => {
//     const row = document.createElement("div");
//     row.className = "lb-row";
//     row.innerHTML = `
//       <div>${i+1}</div>
//       <div class="lb-player"><div>👤</div><div>${player.username}</div></div>
//       <div><span class="rank-pill">${player.rank}</span></div>
//       <div>${player.xp}</div>`;
//     container.appendChild(row);
//   });
// }

// /* ═══════════════════════════════════════════════════
//    UI HELPERS
// ═══════════════════════════════════════════════════ */
// function showLoading(s){
//   const e = document.getElementById("loader");
//   if(e) e.style.display = s ? "block" : "none";
// }

// function showError(msg){ showToast(msg||"An error occurred", "error"); }

// function showToast(msg, type="info"){
//   const e = document.getElementById("toast");
//   if(!e){ alert(msg); return; }
//   e.textContent = msg;
//   e.className   = `toast toast-${type}`;
//   e.style.display = "block";
//   setTimeout(() => { e.style.display = "none"; }, 3500);
// }

// function resetTableUI(){} // handled by game-ui.js

// /* ═══════════════════════════════════════════════════
//    INIT
// ═══════════════════════════════════════════════════ */
// document.addEventListener("DOMContentLoaded", () => {
//   const page = window.location.pathname.split("/").pop() || "index.html";
//   const publicPages = ["index.html", ""];
//   if(!publicPages.includes(page)) requireAuth();
//   if(page === "play.html") setPhase("idle");
// });

const API_BASE = "http://localhost:3000/api";

let accessToken = localStorage.getItem("access_token");
let sessionId = null;
let currentScenario = null;

/* =============================
   AUTH GUARD
============================= */

function requireAuth() {
  if (!accessToken) {
    window.location.href = "index.html";
  }
}

/* =============================
   NAVIGATION
============================= */

function goMenu() { window.location.href = "menu.html"; }
function goTutorial() { window.location.href = "tutorial.html"; }
function goProfile() { window.location.href = "profile.html"; }

/* =============================
   SIGNUP
============================= */
async function signup(email, password) {

  showLoading(true);

  const res = await fetch(`${API_BASE}/signup`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ email, password })
  });

  console.log(`${API_BASE}/signup`);

  const data = await res.json();

  showLoading(false);

  if (!res.ok) {
    showError(data.error || "Signup failed");
    return;
  }

  // Auto-login after successful signup
  login(email, password);
}

/* =============================
   LOGIN
============================= */

async function login(email, password) {

  showLoading(true);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  showLoading(false);

  if (!res.ok) {
    showError(data.error || "Login failed");
    return;
  }

  accessToken = data.access_token;

  localStorage.setItem("access_token", accessToken);
  localStorage.setItem("auth_id", data.user.id);

  window.location.href = "menu.html";
}

/* =============================
   LOGOUT
============================= */

function logout() {
  localStorage.clear();
  window.location.href = "index.html";
}

/* =============================
   RESET PASSWORD
============================= */
async function resetPassword(email) {

  showLoading(true);

  const res = await fetch(`${API_BASE}/pass-reset`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ email })
  });

  const data = await res.json();

  showLoading(false);

  if (!res.ok) {
    showError(data.error || "Login failed");
    return;
  }
}

/* =============================
   UPDATE PASSWORD
============================= */
async function updatePassword(password, email) {
  
  showLoading(true);

  const res = await fetch(`${API_BASE}/new-pass`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, email })
  });

  const data = await res.json();

  showLoading(false);

  if (!res.ok) {
    return { error: data.error || "Failed to reset password" };
  }

  return data;
}

/* =============================
   HEADER HELPER
============================= */

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`
  };
}

/* =============================
   START GAME
============================= */

async function startGame() {

  requireAuth();

  console.log("Starting game...");

  showLoading(true);

  const difficulty =
    document.getElementById("difficulty")?.value || "Medium";

  console.log("Difficulty:", difficulty);

  const res = await fetch(`${API_BASE}/game/start`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ difficulty })
  });

  console.log("Response status:", res.status);

  const data = await res.json();

  console.log("Response JSON:", data);

  showLoading(false);

  if (!res.ok) {
    showError(data.error);
    return;
  }

  sessionId = data.sessionId;
  currentScenario = data.scenario;

  localStorage.setItem("sessionId", sessionId);

  console.log("SCENARIO RECEIVED:", currentScenario);

  dealScenario(currentScenario);

}

/* =============================
   CARD DEAL ANIMATION
============================= */

function dealScenario(scenario) {

  console.log("dealScenario called:", scenario);

  if (!window.renderScenario) {
    console.error("renderScenario missing");
    return;
  }

  try {

    resetTableUI();

    console.log("Calling renderScenario");

    window.renderScenario(scenario);
    console.log("Render finished");

    simulateOpponentActions(scenario);

  } catch (err) {

    console.error("dealScenario crash:", err);

  }

}

/* =============================
   RESET TABLE
============================= */

function resetTableUI() {

  console.log("Resetting table UI");

  const boardCards = document.querySelectorAll(".board-card");
  const holeCards = document.querySelectorAll(".hole-card");
  const actions = document.querySelectorAll(".opp-action");

  if (boardCards.length) {
    boardCards.forEach(c => c.classList.remove("filled","red"));
  }

  if (holeCards.length) {
    holeCards.forEach(c => c.classList.remove("filled","red"));
  }

  if (actions.length) {
    actions.forEach(a => a.textContent = "");
  }

}

/* =============================
   OPPONENT AI ACTIONS
============================= */

function simulateOpponentActions(s) {

  if (!s.players) return;

  const getDisplaySeat = typeof window.getDisplaySeatId === "function" ? window.getDisplaySeatId : (n) => n;

  s.players.forEach(p => {

    if (!p.hand || p.hand.length === 0) return;

    const displaySeat = getDisplaySeat(p.seat);
    if (displaySeat === 0) return;

    const badge = document.getElementById(`act-p${displaySeat}`);

    if (!badge) return;

    const action = pickActionFromStyle(p.style);

    setTimeout(() => {

      badge.textContent = action.toUpperCase();
      badge.className = `action-badge ${action}`;

      if (action === "fold") {
        foldSeat(displaySeat);
      }

    }, 300 + (displaySeat * 120));

  });

}

/* =============================
   STYLE DECISION ENGINE
============================= */

function pickActionFromStyle(style) {

  const r = Math.random();

  switch(style) {

    case "NIT":
      return r < 0.7 ? "fold" : "call";

    case "TAG":
      return r < 0.3 ? "raise" : "call";

    case "LAG":
      return r < 0.6 ? "raise" : "call";

    case "PASSIVE":
      return r < 0.8 ? "call" : "check";

    default:
      return r < 0.5 ? "call" : "fold";
  }
}

/* =============================
   FOLD ANIMATION
============================= */

function foldSeat(displaySeat) {

  const seat = document.getElementById(`p${displaySeat}`);

  if (!seat) return;

  const cards = seat.querySelectorAll(".opp-card");

  cards.forEach(c => {

    c.style.transition = "all 0.3s ease";
    c.style.transform = "translateY(20px) rotate(15deg)";
    c.style.opacity = "0.2";

  });
}

/* =============================
   SUBMIT EQUITY
============================= */

async function submitEquity() {

  showLoading(true);

  const equity =
    parseFloat(document.getElementById("equityInput").value);

  const sessionId = localStorage.getItem("sessionId");

  const res = await fetch(`${API_BASE}/game/${sessionId}/decision`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ userEquity: equity })
  });

  const data = await res.json();

  showLoading(false);

  if (!res.ok) {
    showError(data.error);
    return;
  }

  const result = document.getElementById("result");

  if (result) {
    result.innerText =
      `Correct: ${data.correctEquity} | Score: ${data.score}`;
  }
}

/* =============================
   COMPLETE GAME
============================= */

async function completeGame() {

  showLoading(true);

  const sessionId = localStorage.getItem("sessionId");

  const res = await fetch(`${API_BASE}/game/${sessionId}/complete`, {
    method: "POST",
    headers: authHeaders()
  });

  const data = await res.json();

  showLoading(false);

  if (!res.ok) {
    showError(data.error);
    return;
  }

  alert(`XP +${data.xpGain} | Earnings +${data.earningsGain}`);

  window.location.href = "profile.html";
}

/* =============================
   LEADERBOARD
============================= */

/* ═══════════════════════════════════════════════════
   LOAD PROFILE  (called by profile.html)
═══════════════════════════════════════════════════ */
async function loadProfile() {
  try {
    const res  = await fetch(`${API_BASE}/users/me`, { headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { showError(data.error || "Failed to load profile"); return null; }
    return data;
  } catch (err) {
    showError(err.message);
    return null;
  }
}

async function loadLeaderboard() {

  showLoading(true);

  const res = await fetch(`${API_BASE}/leaderboards`);
  const data = await res.json();

  showLoading(false);

  if (!res.ok) return;

  const container = document.getElementById("lbRows");
  const total = document.getElementById("totalPlayers");

  if (!container) return;

  container.innerHTML = "";

  if (total) total.innerText = data.length;

  data.forEach((player, i) => {

    const row = document.createElement("div");

    row.className = "lb-row";

    row.innerHTML = `
      <div>${i+1}</div>
      <div class="lb-player">
        <div>👤</div>
        <div>${player.username}</div>
      </div>
      <div>
        <span class="rank-pill">${player.rank}</span>
      </div>
      <div>${player.xp}</div>
    `;

    container.appendChild(row);

  });

}

/* =============================
   UI HELPERS
============================= */

function showLoading(state) {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = state ? "block" : "none";
}

function showError(message) {
  alert(message);
}