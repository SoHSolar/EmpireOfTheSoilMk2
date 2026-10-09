// =====================================================================
//  Procedural audio: adaptive music, sound effects and ambience.
//  Everything is synthesised live with the Web Audio API - no sound files.
// =====================================================================
'use strict';

const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
};
// Each mood is a small generative score
const MOODS = {
  title:   { bpm: 66,  root: 50, scale: 'dorian',   prog: [0, 5, 3, 0, 0, 6, 4, 0], pad: 1.0, padCut: 900,  pluck: 0.32, pluckOct: 2, bass: 0,   bassRate: 8, drums: null,     shaker: 0,    arp: 0,    marimba: 0 },
  map:     { bpm: 84,  root: 50, scale: 'dorian',   prog: [0, 6, 3, 0, 5, 6, 4, 0], pad: 0.7, padCut: 1300, pluck: 0.5,  pluckOct: 2, bass: 0.6, bassRate: 8, drums: 'soft',   shaker: 0.25, arp: 0.35, marimba: 0 },
  war:     { bpm: 100, root: 50, scale: 'aeolian',  prog: [0, 5, 6, 0, 3, 5, 6, 4], pad: 0.6, padCut: 1000, pluck: 0.4,  pluckOct: 2, bass: 0.9, bassRate: 2, drums: 'war',    shaker: 0.35, arp: 0.2,  marimba: 0 },
  colony:  { bpm: 72,  root: 45, scale: 'dorian',   prog: [0, 3, 4, 0, 5, 3, 6, 0], pad: 0.55, padCut: 650, pluck: 0,    pluckOct: 1, bass: 0.5, bassRate: 8, drums: 'heart',  shaker: 0,    arp: 0,    marimba: 0.6 },
  battle:  { bpm: 128, root: 45, scale: 'phrygian', prog: [0, 1, 0, 6, 0, 1, 5, 6], pad: 0.45, padCut: 1600, pluck: 0.2, pluckOct: 2, bass: 1.0, bassRate: 1, drums: 'battle', shaker: 0.5,  arp: 0,    marimba: 0, stabs: true },
  victory: { bpm: 76,  root: 50, scale: 'lydian',   prog: [0, 4, 3, 0], pad: 0.9, padCut: 1500, pluck: 0.45, pluckOct: 2, bass: 0.4, bassRate: 8, drums: null, shaker: 0, arp: 0.4, marimba: 0 },
  defeat:  { bpm: 52,  root: 45, scale: 'aeolian',  prog: [0, 5, 3, 4], pad: 0.8, padCut: 600,  pluck: 0.15, pluckOct: 1, bass: 0.3, bassRate: 16, drums: null, shaker: 0, arp: 0, marimba: 0 },
};

const Sound = {
  ctx: null, ok: false, mood: null, nextMood: null, env: null,
  settings: { music: 0.55, sfx: 0.8, amb: 0.5, muted: false },
  recent: {},

  // ---------------- setup ----------------
  init(ctx) {
    if (this.ctx) return;
    try {
      this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { this.ok = false; return; }
    this.ok = true;
    this.loadSettings();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.musicBus = c.createGain(); this.sfxBus = c.createGain(); this.ambBus = c.createGain();
    this.reverb = c.createConvolver(); this.reverb.buffer = this.impulse(2.8, 2.6);
    this.revGain = c.createGain(); this.revGain.gain.value = 1.0;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    for (const b of [this.musicBus, this.sfxBus, this.ambBus]) b.connect(this.master);
    this.musicSend = c.createGain(); this.musicSend.gain.value = 0.6; this.musicSend.connect(this.reverb);
    this.musicBus.connect(this.musicSend);
    this.sfxSend = c.createGain(); this.sfxSend.gain.value = 0.25; this.sfxSend.connect(this.reverb);
    this.sfxBus.connect(this.sfxSend);
    this.noiseBuf = this.makeNoise(2);
    this.applyVolumes();
    this.step = 0; this.bar = 0; this.nextTime = c.currentTime + 0.1;
    this.mood = this.nextMood || 'title';
    this.newMotif();
    this.startAmbience();
    if (!this.timer && typeof setInterval !== 'undefined' && !ctx) this.timer = setInterval(() => this.tick(), 25);
  },
  unlock() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
  },
  loadSettings() { try { const s = JSON.parse(localStorage.getItem('eots_audio') || 'null'); if (s) Object.assign(this.settings, s); } catch (e) { } },
  saveSettings() { try { localStorage.setItem('eots_audio', JSON.stringify(this.settings)); } catch (e) { } },
  applyVolumes() {
    if (!this.ok) return;
    const t = this.ctx.currentTime, m = this.settings.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(m * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 4.0, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx * 3.6, t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.settings.amb * 3.0, t, 0.2);
  },
  set(key, v) { this.settings[key] = v; this.applyVolumes(); this.saveSettings(); },
  toggleMute() { this.set('muted', !this.settings.muted); return this.settings.muted; },

  impulse(dur, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let e = 0;
      for (let i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); e += d[i] * d[i]; }
      const k = 1 / Math.sqrt(e);          // unit-energy impulse so the reverb doesn't swamp the mix
      for (let i = 0; i < n; i++) d[i] *= k;
    }
    return b;
  },
  makeNoise(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  // ---------------- primitives ----------------
  // An oscillator note with an ADSR-ish envelope
  tone(o) {
    if (!this.ok) return;
    const c = this.ctx, t = o.t ?? c.currentTime, dur = o.dur ?? 0.3, vol = o.vol ?? 0.2;
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide), t + (o.glideT ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain(); g.gain.value = 0;
    const a = o.attack ?? 0.005, r = o.release ?? dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (o.sustain) { g.gain.setValueAtTime(vol, t + Math.max(a, dur - r)); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.cut) { const f = c.createBiquadFilter(); f.type = o.ftype || 'lowpass'; f.frequency.value = o.cut; f.frequency.setValueAtTime(o.cut, t); if (o.cutTo) f.frequency.exponentialRampToValueAtTime(o.cutTo, t + dur); f.Q.value = o.q ?? 0.7; node.connect(f); node = f; }
    node.connect(g);
    if (o.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(o.dest || this.sfxBus); }
    else g.connect(o.dest || this.sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  },
  noise(o) {
    if (!this.ok) return;
    const c = this.ctx, t = o.t ?? c.currentTime, dur = o.dur ?? 0.1, vol = o.vol ?? 0.2;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate ?? 1;
    const f = c.createBiquadFilter(); f.type = o.ftype || 'bandpass';
    f.frequency.value = o.freq ?? 1000; f.frequency.setValueAtTime(o.freq ?? 1000, t); if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    if (o.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(o.dest || this.sfxBus); }
    else g.connect(o.dest || this.sfxBus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  },
  // Instruments ----------------------------------------------------------
  pluck(m, t, vol, dest, pan) {      // kalimba-ish
    const f = this.mtof(m);
    this.tone({ freq: f, type: 'sine', t, dur: 1.1, vol, attack: 0.004, dest, pan });
    this.tone({ freq: f * 2.01, type: 'sine', t, dur: 0.25, vol: vol * 0.35, attack: 0.002, dest, pan });
    this.tone({ freq: f * 5.4, type: 'sine', t, dur: 0.06, vol: vol * 0.2, attack: 0.001, dest, pan });
  },
  marimba(m, t, vol, dest) {
    const f = this.mtof(m);
    this.tone({ freq: f, type: 'triangle', t, dur: 0.7, vol, attack: 0.003, dest, cut: 2200, cutTo: 500 });
    this.tone({ freq: f * 4, type: 'sine', t, dur: 0.08, vol: vol * 0.3, attack: 0.001, dest });
  },
  pad(ms, t, dur, vol, cut, dest) {
    for (const m of ms) for (const d of [-8, 7]) {
      this.tone({ freq: this.mtof(m), type: 'sawtooth', detune: d, t, dur, vol: vol, attack: Math.min(1.6, dur * 0.4), release: Math.min(1.6, dur * 0.4), sustain: true, cut, q: 0.5, dest, pan: d < 0 ? -0.3 : 0.3 });
    }
  },
  bassNote(m, t, dur, vol, dest) {
    this.tone({ freq: this.mtof(m), type: 'triangle', t, dur, vol, attack: 0.01, dest, cut: 700 });
    this.tone({ freq: this.mtof(m), type: 'sine', t, dur, vol: vol * 0.6, attack: 0.01, dest });
  },
  kick(t, vol, dest) { this.tone({ freq: 130, glide: 42, glideT: 0.16, type: 'sine', t, dur: 0.32, vol, attack: 0.002, dest }); },
  tom(t, f, vol, dest) {
    this.tone({ freq: f, glide: f * 0.55, glideT: 0.25, type: 'sine', t, dur: 0.35, vol, attack: 0.002, dest });
    this.noise({ t, dur: 0.08, vol: vol * 0.3, freq: f * 3, q: 1.5, dest });
  },
  frameDrum(t, vol, dest) { this.tone({ freq: 95, glide: 70, type: 'sine', t, dur: 0.4, vol, attack: 0.003, dest }); this.noise({ t, dur: 0.12, vol: vol * 0.35, freq: 380, q: 0.8, dest }); },
  shaker(t, vol, dest) { this.noise({ t, dur: 0.05, vol, ftype: 'highpass', freq: 6500, q: 0.5, dest, attack: 0.008 }); },

  // ---------------- music ----------------
  music(mood) {
    if (!MOODS[mood]) return;
    if (!this.ok) { this.nextMood = mood; return; }
    if (mood === this.mood && !this.nextMood) return;
    this.nextMood = mood;
  },
  newMotif() {
    // a short 2-bar melodic idea that repeats with variation, giving the music shape
    const len = 16, notes = [];
    let deg = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < len; i++) {
      const strong = i % 4 === 0;
      if (Math.random() < (strong ? 0.75 : 0.28)) {
        deg += pick(Math.random, [-2, -1, -1, 0, 1, 1, 2, 3, -3]);
        deg = clamp(deg, 0, 11);
        notes.push([i, deg]);
      }
    }
    this.motif = notes;
  },
  degToMidi(M, d, oct = 0) { const sc = SCALES[M.scale]; return M.root + sc[((d % 7) + 7) % 7] + 12 * (Math.floor(d / 7) + oct); },
  tick() {
    if (!this.ok || this.ctx.state !== 'running') { if (this.ok) this.nextTime = this.ctx.currentTime + 0.1; return; }
    const ahead = this.ctx.currentTime + 0.15;
    while (this.nextTime < ahead) { this.scheduleStep(this.nextTime); this.advance(); }
    this.ambienceTick();
  },
  advance() {
    const M = MOODS[this.mood];
    this.nextTime += 60 / M.bpm / 4;
    this.step++;
    if (this.step >= 16) {
      this.step = 0; this.bar++;
      if (this.nextMood && this.nextMood !== this.mood) { this.mood = this.nextMood; this.bar = 0; this.newMotif(); }
      this.nextMood = null;
      if (this.bar % 4 === 0 && Math.random() < 0.6) this.newMotif();
    }
  },
  scheduleStep(t) {
    const M = MOODS[this.mood], s = this.step, bus = this.musicBus;
    const spb = 60 / M.bpm, barDur = spb * 4;
    const chordDeg = M.prog[this.bar % M.prog.length];
    const chord = [0, 2, 4].map(i => this.degToMidi(M, chordDeg + i, 0));
    if (s === 0 && M.pad) this.pad(chord.map(m => m + 12), t, barDur + 0.6, 0.026 * M.pad, M.padCut, bus);
    // bass
    if (M.bass && s % M.bassRate === 0) {
      const alt = M.bassRate <= 2 && s % 8 === 6 ? 7 : 0;
      this.bassNote(chord[0] - 12 + alt, t, Math.min(spb * M.bassRate / 4 * 0.95, 1.6), 0.09 * M.bass, bus);
    }
    // arpeggio
    if (M.arp && s % 2 === 0 && Math.random() < M.arp + 0.3) {
      const n = chord[(s / 2) % 3] + 12 + (s >= 8 ? 12 : 0);
      this.pluck(n, t, 0.035 * M.arp * 2, bus, ((s % 6) - 3) / 4);
    }
    // melody from the motif
    if (M.pluck) {
      const mstep = s + (this.bar % 2) * 0;
      for (const [i, d] of this.motif) if (i === mstep && Math.random() < 0.85) {
        const varied = this.bar % 4 === 3 ? d + (Math.random() < 0.5 ? 1 : -1) : d;
        this.pluck(this.degToMidi(M, chordDeg + varied, M.pluckOct - 1), t, 0.07 * M.pluck * 1.6, bus, 0.15);
      }
    }
    if (M.marimba && (s % 2 === 0) && Math.random() < M.marimba * 0.7) {
      const d = pick(Math.random, [0, 2, 4, 7, 4, 2]);
      this.marimba(this.degToMidi(M, chordDeg + d, 1), t, 0.06 * M.marimba * 1.5, bus);
    }
    if (M.stabs && (s === 0 || s === 10)) this.pad(chord.map(m => m + 12), t, spb * 0.5, 0.02, 2500, bus);
    // percussion
    switch (M.drums) {
      case 'soft': if (s === 0 || s === 10) this.frameDrum(t, 0.05, bus); break;
      case 'heart': if (s === 0 || s === 3) this.kick(t, s === 0 ? 0.16 : 0.1, bus); break;
      case 'war':
        if (s === 0 || s === 8) this.frameDrum(t, 0.1, bus);
        if (s === 6 || s === 14) this.tom(t, 160, 0.1, bus);
        if (s === 12) this.tom(t, 120, 0.13, bus);
        break;
      case 'battle':
        if (s % 4 === 0) this.kick(t, 0.22, bus);
        if (s === 4 || s === 12) this.frameDrum(t, 0.2, bus);
        if (s % 2 === 1 && Math.random() < 0.5) this.tom(t, 200 + (s % 3) * 40, 0.06, bus);
        if (s === 14 || s === 15) this.tom(t, s === 14 ? 170 : 130, 0.12, bus);
        break;
    }
    if (M.shaker && s % 2 === 0) this.shaker(t, (s % 4 === 2 ? 0.025 : 0.012) * M.shaker * 2, bus);
  },

  // ---------------- ambience ----------------
  startAmbience() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    this.windF = c.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.8;
    this.windG = c.createGain(); this.windG.gain.value = 0.0001;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
    const lfoG = c.createGain(); lfoG.gain.value = 180;
    lfo.connect(lfoG); lfoG.connect(this.windF.frequency);
    src.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.ambBus);
    src.start(); lfo.start();
  },
  ambience(env, seasonIdx) {
    this.env = env; this.envSeason = seasonIdx ?? 0;
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const lvl = env === 'surface' ? [0.05, 0.035, 0.07, 0.13][this.envSeason] : env === 'underground' ? 0.09 : 0.0001;
    const cut = env === 'underground' ? 160 : this.envSeason === 3 ? 900 : 480;
    this.windG.gain.setTargetAtTime(lvl, t, 0.8);
    this.windF.frequency.setTargetAtTime(cut, t, 0.8);
  },
  ambienceTick() {
    const now = this.ctx.currentTime;
    if (this.lastAmb && now - this.lastAmb < 0.1) return;
    this.lastAmb = now;
    const bus = this.ambBus, r = Math.random();
    if (this.env === 'surface') {
      const si = this.envSeason;
      if ((si === 0 || si === 1) && r < 0.025) this.bird(now + Math.random() * 0.1);
      if (si === 1 && r > 0.985) this.buzz(now);
      if (si === 2 && r < 0.05) this.cricket(now);
      if (si === 1 && r > 0.95 && r < 0.97) this.cricket(now);
    } else if (this.env === 'underground') {
      if (r < 0.12) this.noise({ t: now, dur: 0.012, vol: 0.05 + Math.random() * 0.04, freq: 2500 + Math.random() * 2500, q: 3, dest: bus, pan: Math.random() * 2 - 1 });
      if (r > 0.993) this.tone({ freq: 1300, glide: 500, glideT: 0.08, type: 'sine', t: now, dur: 0.15, vol: 0.05, dest: bus, pan: Math.random() - 0.5 }); // water drip
    }
  },
  bird(t) {
    const base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 5), pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.07 + Math.random() * 0.05), f = base * (1 + (Math.random() - 0.3) * 0.25);
      this.tone({ freq: f, glide: f * (Math.random() < 0.5 ? 1.35 : 0.75), glideT: 0.06, type: 'sine', t: tt, dur: 0.08, vol: 0.025, dest: this.ambBus, pan });
    }
  },
  cricket(t) {
    const pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < 6; i++) this.tone({ freq: 4700, type: 'sine', t: t + i * 0.035, dur: 0.025, vol: 0.012, dest: this.ambBus, pan });
  },
  buzz(t) {
    this.tone({ freq: 210, type: 'sawtooth', t, dur: 1.4, vol: 0.006, attack: 0.4, sustain: true, release: 0.5, cut: 900, dest: this.ambBus, pan: Math.random() - 0.5, detune: Math.random() * 30 });
  },

  // ---------------- sound effects ----------------
  sfx(name, opts = {}) {
    if (!this.ok || (this.ctx.state !== 'running' && !this.offline)) return;
    const now = this.ctx.currentTime;
    // rate-limit identical sounds so bursts don't pile up
    const gap = { step: 0.06, click: 0.04, crunch: 0.05, clash: 0.07 }[name] ?? 0.03;
    if (this.recent[name] && now - this.recent[name] < gap) return;
    this.recent[name] = now;
    const t = now + 0.005, b = this.sfxBus;
    switch (name) {
      case 'click':
        this.tone({ freq: 1250, glide: 700, glideT: 0.03, type: 'triangle', t, dur: 0.045, vol: 0.3 });
        this.noise({ t, dur: 0.02, vol: 0.04, freq: 3500, q: 2 }); break;
      case 'tab': this.tone({ freq: 700, type: 'sine', t, dur: 0.07, vol: 0.08 }); this.tone({ freq: 1050, type: 'sine', t: t + 0.04, dur: 0.07, vol: 0.06 }); break;
      case 'error': this.tone({ freq: 150, type: 'square', t, dur: 0.09, vol: 0.05, cut: 900 }); this.tone({ freq: 120, type: 'square', t: t + 0.1, dur: 0.12, vol: 0.05, cut: 900 }); break;
      case 'select': this.pluck(72, t, 0.12); this.pluck(79, t + 0.07, 0.1); break;
      case 'dig':
        for (let i = 0; i < 4; i++) this.noise({ t: t + i * 0.11, dur: 0.09, vol: 0.12, freq: 500 + Math.random() * 400, freqTo: 250, q: 1.2, ftype: 'bandpass' });
        this.tone({ freq: 90, glide: 60, type: 'sine', t, dur: 0.2, vol: 0.12 }); break;
      case 'built': [67, 71, 74, 79].forEach((m, i) => this.marimba(m, t + i * 0.09, 0.14)); break;
      case 'research':
        [76, 79, 83, 86, 91].forEach((m, i) => this.tone({ freq: this.mtof(m), type: 'sine', t: t + i * 0.07, dur: 0.6, vol: 0.06 }));
        this.pad([64, 71, 76], t, 1.4, 0.008, 2500, b); break;
      case 'turn':
        this.tone({ freq: 196, type: 'sine', t, dur: 1.6, vol: 0.1 }); this.tone({ freq: 196 * 2.76, type: 'sine', t, dur: 0.8, vol: 0.035 });
        this.tone({ freq: 196 * 5.4, type: 'sine', t, dur: 0.3, vol: 0.015 }); this.noise({ t, dur: 0.05, vol: 0.06, freq: 900 }); break;
      case 'march':
        for (let i = 0; i < 16; i++) this.noise({ t: t + i * 0.035 + Math.random() * 0.02, dur: 0.015, vol: 0.06, freq: 2500 + Math.random() * 2000, q: 3, pan: Math.random() - 0.5 });
        this.frameDrum(t, 0.18, b); this.frameDrum(t + 0.3, 0.13, b); break;
      case 'step': for (let i = 0; i < 3; i++) this.noise({ t: t + i * 0.025, dur: 0.012, vol: 0.03, freq: 3000 + Math.random() * 2000, q: 3 }); break;
      case 'popup': this.tone({ freq: 880, type: 'sine', t, dur: 0.9, vol: 0.06 }); this.tone({ freq: 1320, type: 'sine', t: t + 0.08, dur: 0.8, vol: 0.04 }); break;
      case 'event': this.pluck(69, t, 0.12); this.pluck(74, t + 0.1, 0.1); this.pluck(81, t + 0.2, 0.08); break;
      case 'bad': [62, 61, 57].forEach((m, i) => this.tone({ freq: this.mtof(m), type: 'triangle', t: t + i * 0.16, dur: 0.5, vol: 0.08, cut: 1500 })); break;
      case 'war':
        this.tone({ freq: 110, type: 'sawtooth', t, dur: 1.5, vol: 0.09, attack: 0.15, sustain: true, release: 0.5, cut: 300, cutTo: 1400, q: 2 });
        this.tone({ freq: 165, type: 'sawtooth', t: t + 0.05, dur: 1.4, vol: 0.06, attack: 0.15, sustain: true, release: 0.5, cut: 300, cutTo: 1200, q: 2 });
        this.frameDrum(t, 0.25, b); this.frameDrum(t + 0.45, 0.2, b); this.frameDrum(t + 0.9, 0.25, b); break;
      case 'peace': [62, 66, 69, 74].forEach((m, i) => this.pluck(m, t + i * 0.12, 0.09)); break;
      case 'trade':
        this.tone({ freq: 600, glide: 1400, glideT: 0.12, type: 'sine', t, dur: 0.2, vol: 0.07 });
        this.tone({ freq: 900, glide: 1800, glideT: 0.12, type: 'sine', t: t + 0.12, dur: 0.25, vol: 0.06 }); this.marimba(79, t + 0.25, 0.1); break;
      case 'battle_start':
        this.tone({ freq: 98, type: 'sawtooth', t, dur: 1.6, vol: 0.1, attack: 0.2, sustain: true, release: 0.6, cut: 250, cutTo: 1600, q: 3 });
        this.tone({ freq: 147, type: 'sawtooth', t: t + 0.4, dur: 1.2, vol: 0.07, attack: 0.15, sustain: true, release: 0.5, cut: 300, cutTo: 1600, q: 3 });
        for (let i = 0; i < 8; i++) this.tom(t + 0.8 + i * 0.08, 150 + i * 6, 0.05 + i * 0.012, b); break;
      case 'clash':
        this.noise({ t, dur: 0.12, vol: 0.35, freq: 1600, q: 0.9, pan: opts.pan });
        for (let i = 0; i < 5; i++) this.noise({ t: t + Math.random() * 0.15, dur: 0.015, vol: 0.07, freq: 3500 + Math.random() * 2500, q: 4, pan: (Math.random() - 0.5) * 1.4 });
        this.tom(t, 110, 0.09, b); break;
      case 'crunch': this.noise({ t, dur: 0.035, vol: 0.15, freq: 1200 + Math.random() * 1500, q: 2, pan: opts.pan }); break;
      case 'spray': this.noise({ t, dur: 0.25, vol: 0.05, ftype: 'highpass', freq: 3000, freqTo: 7000, pan: opts.pan, attack: 0.02 }); break;
      case 'victory':
        [[62, 0], [66, 0.18], [69, 0.36], [74, 0.6]].forEach(([m, d]) => {
          this.tone({ freq: this.mtof(m), type: 'sawtooth', t: t + d, dur: d === 0.6 ? 1.6 : 0.3, vol: 0.06, attack: 0.02, cut: 2200, sustain: true, release: 0.3 });
          this.pluck(m + 12, t + d, 0.08);
        });
        this.pad([62, 66, 69, 74], t + 0.6, 2.2, 0.01, 2000, b); this.kick(t + 0.6, 0.2, b); break;
      case 'defeat':
        [[57, 0], [56, 0.45], [53, 0.9], [50, 1.4]].forEach(([m, d]) => this.tone({ freq: this.mtof(m), type: 'triangle', t: t + d, dur: 1.0, vol: 0.09, cut: 900 }));
        this.tom(t + 1.4, 70, 0.2, b); break;
      case 'season': [79, 83, 86].forEach((m, i) => this.tone({ freq: this.mtof(m), type: 'sine', t: t + i * 0.15, dur: 1.4, vol: 0.04 })); break;
      case 'outpost': this.sfx('built'); this.frameDrum(t + 0.3, 0.15, b); break;
      case 'hatch': for (let i = 0; i < 3; i++) this.tone({ freq: 1800 + i * 300, type: 'sine', t: t + i * 0.05, dur: 0.05, vol: 0.03 }); break;
    }
  },
};

// Settings dialog (shared by title screen and in-game menu)
class SoundDialog {
  constructor(onClose) { this.onClose = onClose; }
  draw(ctx) {
    modalBackdrop(ctx);
    const w = 440, h = 330, x = W / 2 - w / 2, y = H / 2 - h / 2;
    panel(ctx, x, y, w, h, { title: 'Sound' });
    const s = Sound.settings;
    let yy = y + 62;
    const row = (label, key, tip) => {
      text(ctx, label, x + 24, yy + 5, { font: `bold 14px ${FONT_BODY}` });
      UI.tip(x + 24, yy, 140, 24, tip);
      button(ctx, x + 170, yy, 30, 26, '-', () => { Sound.set(key, Math.max(0, Math.round((s[key] - 0.1) * 10) / 10)); Sound.sfx('click'); }, { size: 16 });
      bar(ctx, x + 210, yy + 9, 120, 8, s[key], COL.amber);
      button(ctx, x + 340, yy, 30, 26, '+', () => { Sound.set(key, Math.min(1, Math.round((s[key] + 0.1) * 10) / 10)); Sound.sfx('click'); }, { size: 16 });
      text(ctx, `${Math.round(s[key] * 100)}%`, x + w - 20, yy + 6, { font: `12px ${FONT_BODY}`, align: 'right', color: COL.dim });
      yy += 46;
    };
    row('Music', 'music', 'Adaptive soundtrack: calm while you build, tense at war, driving in battle.');
    row('Sound effects', 'sfx', 'Clicks, digging, marching swarms, battles and discoveries.');
    row('Ambience', 'amb', 'Birdsong, crickets and wind on the surface; scuttling and dripping underground.');
    button(ctx, x + 24, yy + 4, 190, 36, s.muted ? 'Unmute all' : 'Mute all', () => { Sound.toggleMute(); }, { active: s.muted });
    text(ctx, 'F9 toggles mute at any time', x + 230, yy + 15, { font: `12px ${FONT_BODY}`, color: COL.dim });
    if (!Sound.ok) text(ctx, 'Audio is not available in this browser.', x + 24, y + h - 92, { font: `12px ${FONT_BODY}`, color: COL.bad });
    button(ctx, x + w - 140, y + h - 54, 120, 38, 'Done', this.onClose, { primary: true });
  }
  onKey(e) { if (e.key === 'Escape') this.onClose(); }
}
