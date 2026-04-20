/* ═══════════════════════════════════════════════════════════════════════════
   sounds.js  —  Poker Trainer Complete Audio Engine  v2.0
   100% Web Audio API — zero audio files required.

   Architecture:
     • SFX layer   — short synthesized sound effects
     • Music layer — generative ambient casino soundtrack (looping)
     • State       — persisted to localStorage so music continues across pages
     • Controls    — independent SFX and Music on/off toggles

   Public API:
     SoundEngine.play(name)       — play a named SFX
     SoundEngine.startMusic()     — start ambient music (respects toggle)
     SoundEngine.stopMusic()      — fade out music
     SoundEngine.toggleSfx()      — toggle SFX on/off → returns new state
     SoundEngine.toggleMusic()    — toggle music on/off → returns new state
     SoundEngine.sfxEnabled()     — boolean
     SoundEngine.musicEnabled()   — boolean
     SoundEngine.unlock()         — unlock AudioContext (call on first user gesture)
═══════════════════════════════════════════════════════════════════════════ */

const SoundEngine = (() => {
    "use strict";
  
    /* ── Context ── */
    let ctx         = null;
    let masterSfx   = null;   // gain node for all SFX
    let masterMusic = null;   // gain node for all music
  
    /* ── Persist state across page navigations ── */
    const LS_SFX   = "se_sfx";
    const LS_MUSIC = "se_music";
    let _sfxOn   = localStorage.getItem(LS_SFX)   !== "0";
    let _musicOn = localStorage.getItem(LS_MUSIC) !== "0";
  
    /* ── Music state ── */
    let _musicRunning = false;
    let _musicNodes   = [];     // all currently-playing music nodes, for cleanup
    let _musicTimeouts = [];    // setTimeout IDs for scheduler
  
    /* ═══════════════════════════════════════════════════════════
       AUDIO CONTEXT BOOTSTRAP
    ═══════════════════════════════════════════════════════════ */
    function getCtx() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
  
        masterSfx = ctx.createGain();
        masterSfx.gain.value = 0.55;
        masterSfx.connect(ctx.destination);
  
        masterMusic = ctx.createGain();
        masterMusic.gain.value = 0;             // starts silent, fades in
        masterMusic.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
  
    /* ═══════════════════════════════════════════════════════════
       LOW-LEVEL HELPERS
    ═══════════════════════════════════════════════════════════ */
  
    /** Play an oscillator burst through the SFX bus */
    function osc(type, freq, tStart, dur, peakGain, freqEnd, out) {
      const c = getCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, tStart);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, tStart + dur);
      g.gain.setValueAtTime(0, tStart);
      g.gain.linearRampToValueAtTime(peakGain, tStart + Math.min(0.005, dur * 0.1));
      g.gain.exponentialRampToValueAtTime(0.0001, tStart + dur);
      o.connect(g);
      g.connect(out || masterSfx);
      o.start(tStart);
      o.stop(tStart + dur + 0.01);
      return { osc: o, gain: g };
    }
  
    /** Short noise burst */
    function noise(dur, peakGain, filterFreq, filterType, out) {
      const c    = getCtx();
      const t    = c.currentTime;
      const secs = c.sampleRate * dur;
      const buf  = c.createBuffer(1, secs, c.sampleRate);
      const d    = buf.getChannelData(0);
      for (let i = 0; i < secs; i++) d[i] = Math.random() * 2 - 1;
      const src  = c.createBufferSource();
      src.buffer = buf;
      const bpf  = c.createBiquadFilter();
      bpf.type   = filterType || "bandpass";
      bpf.frequency.value = filterFreq || 2000;
      bpf.Q.value = 0.6;
      const g = c.createGain();
      g.gain.setValueAtTime(peakGain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bpf); bpf.connect(g); g.connect(out || masterSfx);
      src.start(t); src.stop(t + dur);
    }
  
    /* ═══════════════════════════════════════════════════════════
       ALL SOUND EFFECTS
    ═══════════════════════════════════════════════════════════ */
    const sfx = {
  
      /* ── Card sounds ── */
      deal() {
        const c = getCtx(), t = c.currentTime;
        // Paper whoosh — high-pass noise sweeping down
        const secs = Math.ceil(c.sampleRate * 0.13);
        const buf  = c.createBuffer(1, secs, c.sampleRate);
        const d    = buf.getChannelData(0);
        for (let i = 0; i < secs; i++) d[i] = Math.random() * 2 - 1;
        const src  = c.createBufferSource(); src.buffer = buf;
        const hpf  = c.createBiquadFilter(); hpf.type = "highpass";
        hpf.frequency.setValueAtTime(3500, t);
        hpf.frequency.exponentialRampToValueAtTime(700, t + 0.1);
        const g = c.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        src.connect(hpf); hpf.connect(g); g.connect(masterSfx);
        src.start(t); src.stop(t + 0.14);
        osc("sine", 90, t + 0.06, 0.07, 0.1);     // soft landing thud
      },
  
      flip() {
        const c = getCtx(), t = c.currentTime;
        noise(0.055, 0.28, 4800, "bandpass");
        osc("sine", 220, t, 0.04, 0.07);
      },
  
      shuffle() {
        // Burst of 5 quick deal sounds
        [0, 70, 130, 185, 230].forEach(ms =>
          setTimeout(() => sfx.deal(), ms + Math.random() * 25)
        );
      },
  
      /* ── Chip / betting sounds ── */
      chip() {
        const c = getCtx(), t = c.currentTime;
        [0, 0.028].forEach((delay, i) => {
          const freq = 1100 + i * 420 + Math.random() * 200;
          const o = c.createOscillator(); o.type = "sine";
          const g = c.createGain();
          o.frequency.setValueAtTime(freq, t + delay);
          o.frequency.exponentialRampToValueAtTime(freq * 0.65, t + delay + 0.2);
          g.gain.setValueAtTime(0.17, t + delay);
          g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.22);
          o.connect(g); g.connect(masterSfx);
          o.start(t + delay); o.stop(t + delay + 0.24);
        });
        noise(0.025, 0.07, 5500, "highpass");
      },
  
      call() {
        // Two chip clinks
        sfx.chip();
        setTimeout(() => sfx.chip(), 80);
      },
  
      check() {
        // Single soft knock
        const c = getCtx(), t = c.currentTime;
        osc("sine", 280, t,        0.06, 0.14);
        osc("sine", 180, t + 0.02, 0.09, 0.1);
        noise(0.04, 0.08, 900, "lowpass");
      },
  
      raise() {
        // Authoritative thwack + chips cascade
        const c = getCtx(), t = c.currentTime;
        osc("sawtooth", 320, t,        0.04, 0.16);
        osc("sine",     640, t,        0.07, 0.11);
        osc("sine",     160, t + 0.03, 0.12, 0.13);
        noise(0.035, 0.15, 3200, "bandpass");
        [60, 110, 155].forEach(ms => setTimeout(() => sfx.chip(), ms));
      },
  
      allIn() {
        // Dramatic big slam
        const c = getCtx(), t = c.currentTime;
        osc("sawtooth", 180, t,        0.05, 0.22);
        osc("sine",     90,  t,        0.18, 0.28);
        osc("sine",     360, t + 0.05, 0.06, 0.14);
        noise(0.06, 0.22, 1200, "bandpass");
        [0, 45, 85, 120, 150, 175].forEach(ms => setTimeout(() => sfx.chip(), ms));
      },
  
      fold() {
        // Muted thud with descending sigh
        const c = getCtx(), t = c.currentTime;
        osc("sine", 210, t,        0.14, 0.12);
        osc("sine", 140, t + 0.05, 0.2,  0.09, 80);
        noise(0.07, 0.1, 600, "lowpass");
      },
  
      /* ── UI sounds ── */
      click() {
        const c = getCtx(), t = c.currentTime;
        osc("sine", 460, t,        0.035, 0.055);
        osc("sine", 700, t + 0.01, 0.025, 0.04);
      },
  
      navigate() {
        const c = getCtx(), t = c.currentTime;
        osc("sine", 380, t,        0.03, 0.05);
        osc("sine", 560, t + 0.02, 0.03, 0.04);
      },
  
      /* ── Outcome sounds ── */
      win() {
        // Bright ascending arpeggio + coin shower
        const c = getCtx(), t = c.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => {
          const delay = i * 0.11;
          osc("sine",     f,     t + delay,        0.35, 0.18);
          osc("triangle", f * 2, t + delay + 0.01, 0.3,  0.13);
        });
        setTimeout(() => noise(0.2, 0.14, 5000, "highpass"), 400);
      },
  
      lose() {
        // Descending minor phrase
        const c = getCtx(), t = c.currentTime;
        [523, 466, 415, 370].forEach((f, i) => {
          osc("sine",     f, t + i * 0.13, 0.28, 0.11);
          osc("triangle", f, t + i * 0.13, 0.28, 0.05);
        });
      },
  
      potWin() {
        // Chips cascade to winner
        [0, 55, 100, 140, 175].forEach(ms => setTimeout(() => sfx.chip(), ms));
      },
  
      handComplete() {
        // Soft chime resolution
        const c = getCtx(), t = c.currentTime;
        [659, 784, 880].forEach((f, i) => {
          osc("sine", f, t + i * 0.08, 0.25, 0.1);
        });
      },
  
    };
  
    /* ═══════════════════════════════════════════════════════════
       GENERATIVE AMBIENT CASINO MUSIC
       No audio files. Procedurally generated with:
         • Slow chord pads (filtered sawtooth)
         • Walking bass line
         • Rhythmic hi-hat pattern
         • Sparse jazz-ish melodic accents
    ═══════════════════════════════════════════════════════════ */
  
    /* Jazz chord voicings (root, 3rd, 5th, 7th) — all in Hz */
    const CHORDS = [
      [110.0, 138.6, 164.8, 196.0],   // A minor 7
      [98.0,  123.5, 146.8, 185.0],   // G dom 7
      [87.3,  110.0, 130.8, 164.8],   // F maj 7
      [110.0, 130.8, 164.8, 196.0],   // A minor
      [98.0,  116.5, 146.8, 174.6],   // G minor 7
      [73.4,  92.5,  110.0, 138.6],   // D minor 7
    ];
  
    /* Melody notes (pentatonic minor scale on A) */
    const MELODY = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
  
    /* Bass walk (root notes) */
    const BASS = [55, 65.4, 49, 43.7, 55, 43.7, 49, 65.4];
  
    let _chordIdx  = 0;
    let _beatCount = 0;
  
    function scheduleMusicBar(barStart, barDur) {
      if (!_musicRunning) return;
      const c = getCtx();
      const beatDur = barDur / 4;     // 4 beats per bar
  
      /* ── Chord pad ── */
      const chord = CHORDS[_chordIdx % CHORDS.length];
      chord.forEach(freq => {
        const o = c.createOscillator(); o.type = "sawtooth";
        const lpf = c.createBiquadFilter(); lpf.type = "lowpass";
        lpf.frequency.setValueAtTime(400, barStart);
        lpf.frequency.linearRampToValueAtTime(700, barStart + barDur * 0.5);
        lpf.frequency.linearRampToValueAtTime(350, barStart + barDur);
        const g = c.createGain();
        g.gain.setValueAtTime(0, barStart);
        g.gain.linearRampToValueAtTime(0.045, barStart + 0.08);
        g.gain.setValueAtTime(0.045, barStart + barDur - 0.12);
        g.gain.linearRampToValueAtTime(0, barStart + barDur);
        o.frequency.value = freq;
        o.connect(lpf); lpf.connect(g); g.connect(masterMusic);
        o.start(barStart); o.stop(barStart + barDur + 0.05);
        _musicNodes.push(o);
      });
  
      /* ── Walking bass ── */
      for (let beat = 0; beat < 4; beat++) {
        const bStart = barStart + beat * beatDur;
        const bassFreq = BASS[(_chordIdx * 4 + beat) % BASS.length];
        const o = c.createOscillator(); o.type = "sine";
        const g = c.createGain();
        g.gain.setValueAtTime(0,     bStart);
        g.gain.linearRampToValueAtTime(0.13, bStart + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, bStart + beatDur * 0.85);
        o.frequency.value = bassFreq;
        o.connect(g); g.connect(masterMusic);
        o.start(bStart); o.stop(bStart + beatDur);
        _musicNodes.push(o);
      }
  
      /* ── Hi-hat pattern (8th notes) ── */
      for (let i = 0; i < 8; i++) {
        const hatStart = barStart + (i * beatDur / 2);
        const isDown   = (i % 2 === 0);      // downbeat louder
        const hatVol   = isDown ? 0.035 : 0.018;
        const secs     = Math.ceil(c.sampleRate * 0.04);
        const buf      = c.createBuffer(1, secs, c.sampleRate);
        const d        = buf.getChannelData(0);
        for (let s = 0; s < secs; s++) d[s] = Math.random() * 2 - 1;
        const src = c.createBufferSource(); src.buffer = buf;
        const hpf = c.createBiquadFilter(); hpf.type = "highpass"; hpf.frequency.value = 8000;
        const gH  = c.createGain();
        gH.gain.setValueAtTime(hatVol, hatStart);
        gH.gain.exponentialRampToValueAtTime(0.0001, hatStart + 0.04);
        src.connect(hpf); hpf.connect(gH); gH.connect(masterMusic);
        src.start(hatStart); src.stop(hatStart + 0.042);
        _musicNodes.push(src);
      }
  
      /* ── Sparse melody accent (random beat 2 or 4) ── */
      if (Math.random() < 0.55) {
        const accentBeat = Math.random() < 0.5 ? 1 : 3;
        const mStart     = barStart + accentBeat * beatDur;
        const noteFreq   = MELODY[Math.floor(Math.random() * MELODY.length)];
        const mDur       = beatDur * (Math.random() < 0.4 ? 2 : 1);
        const o = c.createOscillator(); o.type = "triangle";
        const vib = c.createOscillator(); vib.type = "sine"; vib.frequency.value = 5.5;
        const vibGain = c.createGain(); vibGain.gain.value = noteFreq * 0.012;
        const g = c.createGain();
        g.gain.setValueAtTime(0,     mStart);
        g.gain.linearRampToValueAtTime(0.055, mStart + 0.04);
        g.gain.setValueAtTime(0.055, mStart + mDur - 0.08);
        g.gain.linearRampToValueAtTime(0,     mStart + mDur);
        o.frequency.value = noteFreq;
        vib.connect(vibGain); vibGain.connect(o.frequency);
        o.connect(g); g.connect(masterMusic);
        o.start(mStart); o.stop(mStart + mDur + 0.05);
        vib.start(mStart); vib.stop(mStart + mDur + 0.05);
        _musicNodes.push(o, vib);
      }
  
      /* ── Advance chord every 2 bars ── */
      _beatCount++;
      if (_beatCount % 2 === 0) _chordIdx++;
  
      /* ── Schedule next bar ── */
      const nextBarStart = barStart + barDur;
      const lag = (nextBarStart - c.currentTime - 0.2) * 1000;
      const tid = setTimeout(() => scheduleMusicBar(nextBarStart, barDur), Math.max(0, lag));
      _musicTimeouts.push(tid);
    }
  
    function startMusic() {
      if (_musicRunning) return;
      if (!_musicOn)     return;
      _musicRunning = true;
  
      const c   = getCtx();
      const bpm = 68;                      // slow, atmospheric
      const barDur = (60 / bpm) * 4;
  
      // Fade master music gain in
      masterMusic.gain.cancelScheduledValues(c.currentTime);
      masterMusic.gain.setValueAtTime(0, c.currentTime);
      masterMusic.gain.linearRampToValueAtTime(0.38, c.currentTime + 2.5);
  
      _beatCount = 0;
      _chordIdx  = 0;
      scheduleMusicBar(c.currentTime + 0.1, barDur);
    }
  
    function stopMusic(fadeDur = 1.5) {
      _musicRunning = false;
      _musicTimeouts.forEach(clearTimeout);
      _musicTimeouts = [];
      if (!ctx) return;
      const t = ctx.currentTime;
      masterMusic.gain.cancelScheduledValues(t);
      masterMusic.gain.setValueAtTime(masterMusic.gain.value, t);
      masterMusic.gain.linearRampToValueAtTime(0, t + fadeDur);
      setTimeout(() => {
        _musicNodes.forEach(n => { try { n.stop(); } catch {} });
        _musicNodes = [];
      }, (fadeDur + 0.2) * 1000);
    }
  
    /* ═══════════════════════════════════════════════════════════
       PUBLIC API
    ═══════════════════════════════════════════════════════════ */
    return {
      play(name) {
        if (!_sfxOn) return;
        try {
          if (sfx[name]) sfx[name]();
        } catch (e) { /* silently ignore */ }
      },
  
      startMusic,
      stopMusic,
  
      toggleSfx() {
        _sfxOn = !_sfxOn;
        localStorage.setItem(LS_SFX, _sfxOn ? "1" : "0");
        return _sfxOn;
      },
  
      toggleMusic() {
        _musicOn = !_musicOn;
        localStorage.setItem(LS_MUSIC, _musicOn ? "1" : "0");
        if (_musicOn) startMusic();
        else          stopMusic();
        return _musicOn;
      },
  
      sfxEnabled()   { return _sfxOn;    },
      musicEnabled() { return _musicOn;  },
  
      /* Call once on first user gesture to satisfy browser autoplay policy */
      unlock() {
        try { getCtx(); } catch {}
      },
  
      /* Legacy single toggle (play.html) */
      toggle() {
        _sfxOn = !_sfxOn;
        localStorage.setItem(LS_SFX, _sfxOn ? "1" : "0");
        return _sfxOn;
      },
      isEnabled() { return _sfxOn; }
    };
  
  })();
  
  /* Unlock AudioContext on first meaningful user interaction */
  ["click", "keydown", "touchstart"].forEach(evt =>
    document.addEventListener(evt, () => SoundEngine.unlock(), { once: true })
  );
  
  window.SoundEngine = SoundEngine;