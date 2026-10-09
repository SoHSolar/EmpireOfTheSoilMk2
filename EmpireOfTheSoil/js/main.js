// =====================================================================
//  Application shell: canvas scaling, input, scene manager, saves
// =====================================================================
'use strict';

const App = {
  canvas: null, ctx: null, scale: 1, ox: 0, oy: 0, dpr: 1,
  scene: null, st: null, terrain: null, time: 0, toasts: [],

  init() {
    this.touch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 1 && 'ontouchend' in document);
    this.isElectron = /Electron/i.test(navigator.userAgent);
    this.canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    GL3D.init();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const c = this.canvas;
    const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left - this.ox) / this.scale, (e.clientY - r.top - this.oy) / this.scale]; };
    // ---- mouse ----
    const mouseDown = e => {
      [UI.mx, UI.my] = pos(e);
      this.lastTouch = false;
      if (e.button === 0) UI.down = true;
      this.scene?.onMouseDown?.(UI.mx, UI.my, e.button, e);
    };
    const mouseUp = e => {
      const [x, y] = pos(e);
      if (e.button === 0) {
        UI.down = false;
        const handledDrag = this.scene?.onMouseUp?.(x, y, 0, e);
        if (!handledDrag) {
          const used = UI.click(x, y, false);
          if (!used) this.scene?.onClick?.(x, y, e);
        }
      } else if (e.button === 2) {
        const dragged = this.scene?.onMouseUp?.(x, y, 2, e);
        if (!dragged) {
          const used = UI.click(x, y, true);
          if (!used) this.scene?.onRightClick?.(x, y, e);
        }
      } else this.scene?.onMouseUp?.(x, y, e.button, e);
    };
    // ---- touch: tap, drag, long-press for tooltips, pinch to zoom, twist to rotate ----
    const touches = new Map();
    let press = null, gest = null;
    const twoInfo = () => {
      const [a, b] = [...touches.values()];
      return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
    };
    const touchDown = e => {
      const p = pos(e);
      touches.set(e.pointerId, p);
      this.lastTouch = true;
      try { c.setPointerCapture(e.pointerId); } catch (err) { }
      if (touches.size === 1) {
        press = { id: e.pointerId, x: p[0], y: p[1], moved: false, long: false, cancel: false };
        [UI.mx, UI.my] = p; UI.down = true;
        this.scene?.onMouseDown?.(p[0], p[1], 0, e);
        this.scene?.onMouseMove?.(p[0], p[1], e);
        const pr = press;
        setTimeout(() => { if (press === pr && !pr.moved && !pr.cancel) pr.long = true; }, 480);
      } else if (touches.size === 2) {
        if (press) { press.cancel = true; UI.down = false; const pr = press; this.scene?.onMouseUp?.(pr.x, pr.y, 0, e); if (this.scene) this.scene.drag = null; }
        gest = twoInfo(); gest.zoomAcc = 0;
      }
    };
    const touchMove = e => {
      if (!touches.has(e.pointerId)) return;
      const p = pos(e);
      touches.set(e.pointerId, p);
      if (touches.size === 1 && press && !press.cancel) {
        if (Math.hypot(p[0] - press.x, p[1] - press.y) > 9) press.moved = true;
        [UI.mx, UI.my] = p;
        this.scene?.onMouseMove?.(p[0], p[1], e);
      } else if (touches.size >= 2 && gest) {
        const g = twoInfo(), sc = this.scene;
        const ratio = g.d / Math.max(1, gest.d);
        let da = g.ang - gest.ang; if (da > Math.PI) da -= 6.283; if (da < -Math.PI) da += 6.283;
        if (sc?.onPinch) sc.onPinch(ratio, g.cx, g.cy);
        else if (sc?.onWheel) {
          gest.zoomAcc += Math.log(ratio);
          while (gest.zoomAcc > 0.15) { sc.onWheel(g.cx, g.cy, -1); gest.zoomAcc -= 0.15; }
          while (gest.zoomAcc < -0.15) { sc.onWheel(g.cx, g.cy, 1); gest.zoomAcc += 0.15; }
        }
        sc?.onTwist?.(da);
        sc?.onTwoFingerPan?.(g.cx - gest.cx, g.cy - gest.cy);
        Object.assign(gest, { d: g.d, ang: g.ang, cx: g.cx, cy: g.cy });
      }
    };
    const touchUp = e => {
      if (!touches.has(e.pointerId)) return;
      const p = pos(e);
      touches.delete(e.pointerId);
      if (press && press.id === e.pointerId) {
        const pr = press; press = null;
        UI.down = false;
        if (!pr.cancel) {
          const dragged = this.scene?.onMouseUp?.(p[0], p[1], 0, e);
          if (!dragged && !pr.moved && !pr.long && e.type !== 'pointercancel') {
            const used = UI.click(p[0], p[1], false);
            if (!used) this.scene?.onClick?.(p[0], p[1], e);
          }
        }
        UI.mx = -1; UI.my = -1;     // no hover on touchscreens once the finger lifts
      }
      if (touches.size < 2) gest = null;
      if (!touches.size) { press = null; UI.mx = -1; UI.my = -1; }
    };
    c.addEventListener('pointerdown', e => {
      Sound.unlock();
      if (e.pointerType === 'mouse') mouseDown(e); else { e.preventDefault(); touchDown(e); }
    });
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') { [UI.mx, UI.my] = pos(e); this.scene?.onMouseMove?.(UI.mx, UI.my, e); }
      else touchMove(e);
    });
    window.addEventListener('pointerup', e => { Sound.unlock(); if (e.pointerType === 'mouse') mouseUp(e); else touchUp(e); });
    window.addEventListener('pointercancel', e => { if (e.pointerType !== 'mouse') touchUp(e); });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => { e.preventDefault(); this.scene?.onWheel?.(UI.mx, UI.my, e.deltaY); }, { passive: false });
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'touchmove']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', e => {
      Sound.unlock();
      if (document.activeElement === this.textEl) return;
      if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); return; }
      if (e.key === 'F9') { e.preventDefault(); this.toast(Sound.toggleMute() ? 'Sound muted (F9)' : 'Sound on (F9)'); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
      this.keys[e.key.toLowerCase()] = true;
      this.scene?.onKey?.(e);
    });
    window.addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { this.keys = {}; UI.down = false; });
    Sound.init();
    this.setScene(new TitleScene());
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.time += dt; UI.time = this.time;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  keys: {},
  resize() {
    const dpr = window.devicePixelRatio || 1, ww = window.innerWidth, wh = window.innerHeight;
    this.canvas.width = Math.round(ww * dpr); this.canvas.height = Math.round(wh * dpr);
    this.canvas.style.width = ww + 'px'; this.canvas.style.height = wh + 'px';
    this.scale = Math.min(ww / W, wh / H);
    this.ox = (ww - W * this.scale) / 2; this.oy = (wh - H * this.scale) / 2;
    this.dpr = dpr;
    GL3D.resize(ww, wh, dpr);
  },
  toggleFullscreen() {
    try {
      const el = document.documentElement;
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch (e) { }
  },
  // On-screen keyboard text entry (works on iPad and desktop)
  editText(value, onChange, onDone, maxLen = 22) {
    let el = this.textEl;
    if (!el) {
      el = this.textEl = document.createElement('input');
      el.type = 'text'; el.autocomplete = 'off'; el.spellcheck = false;
      el.setAttribute('autocapitalize', 'words');
      el.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;font-size:16px;border:0;padding:0;z-index:0;';
      document.body.appendChild(el);
    }
    el.maxLength = maxLen; el.value = value;
    el.oninput = () => onChange(el.value);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); el.blur(); } };
    el.onblur = () => onDone();
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { }
  },
  stopEditText() { if (this.textEl && document.activeElement === this.textEl) this.textEl.blur(); },
  frame(dt) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.scene.uses3D) { ctx.fillStyle = '#0b0705'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    GL3D.beginFrame();
    ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, this.ox * this.dpr, this.oy * this.dpr);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    UI.begin();
    try {
      this.scene.update?.(dt);
      this.scene.draw(ctx, dt);
    } catch (err) {
      console.error(err);
      UI.modal = false;
      ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, this.ox * this.dpr, this.oy * this.dpr);
      text(ctx, 'Error: ' + err.message, 20, 20, { color: '#f66' });
    }
    UI.modal = false;
    this.drawToasts(ctx, dt);
    UI.drawTips(ctx);
    ctx.restore();
    if (this.touch && window.innerHeight > window.innerWidth * 1.05) this.drawRotateHint(ctx);
    GL3D.endFrame();
    const cur = UI.cursorAt(UI.mx, UI.my);
    this.canvas.style.cursor = cur || this.scene.cursor || 'default';
  },
  drawRotateHint(ctx) {
    const c = this.canvas, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const ww = window.innerWidth, wh = window.innerHeight;
    ctx.fillStyle = 'rgba(8,5,3,0.82)'; ctx.fillRect(0, wh * 0.72, ww, wh * 0.28);
    ctx.save(); ctx.translate(ww / 2, wh * 0.79); ctx.rotate(-Math.PI / 2 * (0.5 + 0.5 * Math.sin(this.time * 2)));
    ctx.strokeStyle = COL.gold; ctx.lineWidth = 3; roundRect(ctx, -22, -32, 44, 64, 6); ctx.stroke(); ctx.restore();
    text(ctx, 'Turn your iPad sideways for the best view', ww / 2, wh * 0.86, { font: `bold 18px ${FONT_BODY}`, align: 'center', color: COL.gold });
  },
  setScene(s) { this.scene?.leave?.(); this.scene = s; s.enter?.(); },
  toast(msg, color = COL.gold) { if (color === COL.bad) Sound.sfx('error'); this.toasts.push({ msg, color, t: 0 }); if (this.toasts.length > 4) this.toasts.shift(); },
  drawToasts(ctx, dt) {
    let y = 90;
    for (const t of this.toasts) {
      t.t += dt;
      const a = t.t < 0.2 ? t.t / 0.2 : t.t > 3.2 ? Math.max(0, 1 - (t.t - 3.2) / 0.5) : 1;
      ctx.globalAlpha = a;
      ctx.font = `bold 15px ${FONT_BODY}`;
      const w = ctx.measureText(t.msg).width + 30;
      roundRect(ctx, W / 2 - w / 2, y, w, 30, 15);
      ctx.fillStyle = 'rgba(20,13,8,0.92)'; ctx.fill(); ctx.strokeStyle = t.color; ctx.stroke();
      text(ctx, t.msg, W / 2, y + 15, { font: `bold 15px ${FONT_BODY}`, align: 'center', base: 'middle', color: t.color });
      ctx.globalAlpha = 1;
      y += 36;
    }
    this.toasts = this.toasts.filter(t => t.t < 3.7);
  },

  // ---------------- game lifecycle ----------------
  startGame(st) {
    this.st = st;
    this.terrain = new TerrainRenderer(st);
    if (this.mapScene && this.mapScene.v3) this.mapScene.v3.dispose();
    this.mapScene = GL3D.active ? new MapScene3D() : new MapScene();
    this.setScene(this.mapScene);
  },
  toMap() { this.setScene(this.mapScene); },

  // ---------------- saves ----------------
  saveKey(slot) { return 'eots_save_' + slot; },
  listSaves() {
    const out = [];
    for (const slot of ['auto', '1', '2', '3', '4', '5']) {
      try {
        const meta = localStorage.getItem(this.saveKey(slot) + '_meta');
        out.push({ slot, meta: meta ? JSON.parse(meta) : null });
      } catch (e) { out.push({ slot, meta: null }); }
    }
    return out;
  },
  save(slot) {
    try {
      const st = this.st, p = playerCol(st);
      localStorage.setItem(this.saveKey(slot), serialize(st));
      localStorage.setItem(this.saveKey(slot) + '_meta', JSON.stringify({ name: p.name, species: p.species, turn: st.turn, date: dateStr(st.turn), size: MAP_SIZES[st.sizeKey].name, saved: new Date().toLocaleString() }));
      return true;
    } catch (e) { console.error(e); return false; }
  },
  load(slot) {
    try {
      const s = localStorage.getItem(this.saveKey(slot));
      if (!s) return false;
      this.startGame(deserialize(s));
      return true;
    } catch (e) { console.error(e); return false; }
  },
  exportSave() {
    const blob = new Blob([serialize(this.st)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `empire-of-the-soil-${playerCol(this.st).name.replace(/\W+/g, '_')}-turn${this.st.turn}.antsave`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importSave() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.antsave,.json';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { this.startGame(deserialize(r.result)); this.toast('Save imported'); } catch (e) { this.toast('Could not read that save file', COL.bad); } };
      r.readAsText(f);
    };
    inp.click();
  },
  quit() { try { window.close(); } catch (e) { } },
};

window.addEventListener('load', () => {
  App.init();
  // offline / Home Screen support when served from a website (not the desktop app or local files)
  try {
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !App.isElectron && window.top === window.self)
      navigator.serviceWorker.register('sw.js').catch(() => { });
  } catch (e) { }
});
