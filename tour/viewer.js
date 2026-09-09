/*!
 * RicohTour viewer
 * RICOH THETA / RICOH360 で撮影した全天球(エクイレクタングラー)画像を
 * ブラウザ上で見回せる、依存ライブラリなしの 360° バーチャル内見ビューアー。
 *
 * 使い方(最小):
 *   <link rel="stylesheet" href="viewer.css">
 *   <div data-ricoh-tour="tours/sample.json" style="height:480px"></div>
 *   <script src="viewer.js"></script>
 *
 * JS から:
 *   RicohTour.mount(element, configOrUrl, options).then(viewer => { ... })
 */
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;

  var VERT = [
    'attribute vec2 aPos;',
    'varying vec2 vPos;',
    'void main(){ vPos = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform float uAspect;',
    'uniform float uTanHalf;',
    'uniform mat3 uRot;',
    'varying vec2 vPos;',
    'const float PI = 3.141592653589793;',
    'void main(){',
    '  vec3 d = vec3(vPos.x * uTanHalf, vPos.y * uTanHalf / uAspect, 1.0);',
    '  d = normalize(uRot * d);',
    '  float lon = atan(d.x, d.z);',
    '  float lat = asin(clamp(d.y, -1.0, 1.0));',
    '  vec2 uv = vec2(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);',
    '  gl_FragColor = texture2D(uTex, uv);',
    '}'
  ].join('\n');

  var DEFAULTS = {
    hfov: 90,
    minHfov: 35,
    maxHfov: 120,
    autoRotate: 0,          // deg/sec (0 で無効)
    autoRotateDelay: 3000,  // 操作後に自動回転を再開するまでの ms
    maxTextureSize: 8192,
    showThumbs: true,
    showTitle: true,
    showControls: true,
    showFloorplan: true,
    showHint: true,
    hotspotLabels: true,
    preload: true,
    baseUrl: null
  };

  var ICONS = {
    arrow: '<svg viewBox="0 0 24 24"><path d="M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8L6.4 12.4 5 11z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M11 9h2V7h-2v2zm0 8h2v-6h-2v6zm1-15a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/></svg>',
    zoomIn: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
    zoomOut: '<svg viewBox="0 0 24 24"><path d="M5 11h14v2H5z"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    fullscreenExit: '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>',
    rotate: '<svg viewBox="0 0 24 24"><path d="M12 6V3L8 7l4 4V8a4 4 0 1 1-4 4H6a6 6 0 1 0 6-6z"/></svg>',
    gyro: '<svg viewBox="0 0 24 24"><path d="M17 1H7a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm0 18H7V5h10v14z"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18V3H3zm16 8h-6V5h6v6zM5 5h6v14H5V5zm8 14v-6h6v6h-6z"/></svg>'
  };

  /* ---------- utilities ---------- */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap180(a) { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function isAbsUrl(s) { return /^(https?:|data:|blob:|\/)/i.test(s); }
  function resolveUrl(src, base) {
    if (!src || !base || isAbsUrl(src)) return src;
    try { return new URL(src, base).href; } catch (e) { return src; }
  }
  function dirOf(url) {
    try { var u = new URL(url, location.href); u.search = ''; u.hash = ''; return u.href.replace(/[^\/]*$/, ''); }
    catch (e) { return null; }
  }

  // 回転行列 Ry(yaw) * Rx(pitch) (行優先の 3x3)
  function rotation(yawDeg, pitchDeg) {
    var y = yawDeg * DEG, p = pitchDeg * DEG;
    var cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    return [
      [cy, -sy * sp, sy * cp],
      [0, cp, sp],
      [-sy, -cy * sp, cy * cp]
    ];
  }
  function dirFrom(yawDeg, pitchDeg) {
    var y = yawDeg * DEG, p = pitchDeg * DEG;
    return [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  }

  /* ---------- config ---------- */

  function normalizeConfig(cfg, baseUrl) {
    cfg = cfg || {};
    var out = {};
    for (var k in cfg) out[k] = cfg[k];
    out.title = cfg.title || '';
    out.hfov = cfg.hfov != null ? cfg.hfov : DEFAULTS.hfov;
    out.minHfov = cfg.minHfov != null ? cfg.minHfov : DEFAULTS.minHfov;
    out.maxHfov = cfg.maxHfov != null ? cfg.maxHfov : DEFAULTS.maxHfov;
    out.autoRotate = cfg.autoRotate != null ? +cfg.autoRotate : DEFAULTS.autoRotate;
    out.autoRotateDelay = cfg.autoRotateDelay != null ? +cfg.autoRotateDelay : DEFAULTS.autoRotateDelay;

    var scenes = [];
    if (Array.isArray(cfg.scenes)) {
      scenes = cfg.scenes.slice();
    } else if (cfg.scenes && typeof cfg.scenes === 'object') {
      Object.keys(cfg.scenes).forEach(function (id) {
        var s = Object.assign({}, cfg.scenes[id]);
        if (!s.id) s.id = id;
        scenes.push(s);
      });
    }
    out.scenes = scenes.map(function (s, i) {
      var sc = Object.assign({}, s);
      sc.id = String(sc.id || ('scene' + (i + 1)));
      sc.name = sc.name || sc.title || sc.id;
      sc.src = resolveUrl(sc.src || sc.image || sc.panorama, baseUrl);
      sc.thumb = resolveUrl(sc.thumb || sc.thumbnail, baseUrl) || sc.src;
      sc.yaw = +sc.yaw || 0;
      sc.pitch = +sc.pitch || 0;
      sc.hfov = sc.hfov != null ? +sc.hfov : null;
      sc.hotspots = (sc.hotspots || []).map(function (h) {
        var hs = Object.assign({}, h);
        hs.type = hs.type || (hs.target || hs.sceneId ? 'scene' : 'info');
        hs.target = hs.target || hs.sceneId || null;
        hs.yaw = +hs.yaw || 0;
        hs.pitch = +hs.pitch || 0;
        hs.text = hs.text || '';
        return hs;
      });
      return sc;
    });

    if (cfg.floorplan && (cfg.floorplan.src || cfg.floorplan.image)) {
      out.floorplan = Object.assign({}, cfg.floorplan);
      out.floorplan.src = resolveUrl(cfg.floorplan.src || cfg.floorplan.image, baseUrl);
    } else {
      out.floorplan = null;
    }
    out.defaultScene = cfg.defaultScene || cfg.firstScene || (out.scenes[0] && out.scenes[0].id);
    return out;
  }

  /* ---------- viewer ---------- */

  function Viewer(container, config, options) {
    if (!container) throw new Error('RicohTour: container が指定されていません');
    this.container = container;
    this.opts = Object.assign({}, DEFAULTS, options || {});
    this.config = normalizeConfig(config, this.opts.baseUrl);
    this.listeners = {};
    this.scene = null;
    this.yaw = 0; this.pitch = 0; this.hfov = this.config.hfov;
    this.velYaw = 0; this.velPitch = 0;
    this.autoRotate = this.opts.autoRotate != null && options && options.autoRotate != null ? +this.opts.autoRotate : this.config.autoRotate;
    this.autoRotateEnabled = this.autoRotate !== 0;
    this.lastInteraction = 0;
    this.gyro = { on: false, yaw: 0, pitch: 0, offset: 0, handler: null, ready: false };
    this.pointers = {};
    this.hotspotEls = [];
    this.textureCache = {};
    this.needsRender = true;
    this.destroyed = false;
    this.editMode = false;

    this._buildDom();
    this._initGL();
    this._bindEvents();
    this._buildUi();

    var self = this;
    this._raf = requestAnimationFrame(function tick(t) {
      if (self.destroyed) return;
      self._frame(t);
      self._raf = requestAnimationFrame(tick);
    });

    var first = this.opts.scene || this.config.defaultScene;
    if (first) this.loadScene(first, {
      yaw: this.opts.yaw, pitch: this.opts.pitch, hfov: this.opts.hfov !== DEFAULTS.hfov ? this.opts.hfov : undefined
    });
  }

  Viewer.prototype.on = function (ev, fn) {
    (this.listeners[ev] = this.listeners[ev] || []).push(fn);
    return this;
  };
  Viewer.prototype.off = function (ev, fn) {
    var l = this.listeners[ev]; if (!l) return this;
    this.listeners[ev] = l.filter(function (f) { return f !== fn; });
    return this;
  };
  Viewer.prototype._emit = function (ev, data) {
    var l = this.listeners[ev]; if (!l) return;
    l.slice().forEach(function (f) { try { f(data); } catch (e) { console.error(e); } });
  };

  /* ---- DOM ---- */

  Viewer.prototype._buildDom = function () {
    var c = this.container;
    c.classList.add('rt-viewer');
    c.innerHTML = '';
    c.setAttribute('tabindex', '0');
    this.canvas = el('canvas', 'rt-canvas');
    this.hsLayer = el('div', 'rt-hotspots');
    this.fadeEl = el('div', 'rt-fade');
    this.loadingEl = el('div', 'rt-loading', '<div class="rt-spinner"></div><div class="rt-loading-text">読み込み中…</div>');
    this.hintEl = el('div', 'rt-hint', '<span>ドラッグして見回せます</span>');
    this.errorEl = el('div', 'rt-error');
    this.errorEl.style.display = 'none';
    c.appendChild(this.canvas);
    c.appendChild(this.hsLayer);
    c.appendChild(this.fadeEl);
    c.appendChild(this.loadingEl);
    c.appendChild(this.hintEl);
    c.appendChild(this.errorEl);
    if (!this.opts.showHint) this.hintEl.style.display = 'none';
  };

  Viewer.prototype._buildUi = function () {
    var self = this, c = this.container;
    this.ui = {};

    // 上部: タイトル + コントロール
    var top = el('div', 'rt-top');
    var title = el('div', 'rt-title');
    this.ui.titleMain = el('div', 'rt-title-main');
    this.ui.sceneName = el('div', 'rt-scene-name');
    title.appendChild(this.ui.titleMain);
    title.appendChild(this.ui.sceneName);
    if (!this.opts.showTitle) title.style.display = 'none';
    top.appendChild(title);

    var ctrl = el('div', 'rt-controls');
    function btn(icon, label, cls) {
      var b = el('button', 'rt-btn' + (cls ? ' ' + cls : ''), ICONS[icon]);
      b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
      ctrl.appendChild(b); return b;
    }
    this.ui.gyroBtn = btn('gyro', 'ジャイロ(端末を動かして見回す)', 'rt-btn-gyro');
    this.ui.rotateBtn = btn('rotate', '自動回転', 'rt-btn-rotate');
    this.ui.zoomInBtn = btn('zoomIn', 'ズームイン');
    this.ui.zoomOutBtn = btn('zoomOut', 'ズームアウト');
    this.ui.fsBtn = btn('fullscreen', '全画面表示', 'rt-btn-fs');
    if (!this.opts.showControls) ctrl.style.display = 'none';
    top.appendChild(ctrl);
    c.appendChild(top);

    // ジャイロは対応端末のみ
    var gyroSupported = typeof DeviceOrientationEvent !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0);
    if (!gyroSupported) this.ui.gyroBtn.style.display = 'none';
    this.ui.gyroBtn.addEventListener('click', function () { self.toggleGyro(); });
    this.ui.rotateBtn.addEventListener('click', function () { self.toggleAutoRotate(); });
    this.ui.zoomInBtn.addEventListener('click', function () { self.zoom(-12); self._interacted(); });
    this.ui.zoomOutBtn.addEventListener('click', function () { self.zoom(12); self._interacted(); });
    this.ui.fsBtn.addEventListener('click', function () { self.toggleFullscreen(); });
    this._updateRotateBtn();

    // 下部: 間取り図 + サムネイル
    var bottom = el('div', 'rt-bottom');
    this.ui.plan = el('div', 'rt-plan');
    this.ui.planToggle = el('button', 'rt-btn rt-plan-toggle', ICONS.plan);
    this.ui.planToggle.type = 'button';
    this.ui.planToggle.title = '間取り図';
    this.ui.planToggle.addEventListener('click', function () {
      c.classList.toggle('rt-plan-open');
    });
    this.ui.thumbs = el('div', 'rt-thumbs');
    bottom.appendChild(this.ui.plan);
    bottom.appendChild(this.ui.thumbs);
    c.appendChild(bottom);
    c.appendChild(this.ui.planToggle);

    this._renderTitle();
    this._renderThumbs();
    this._renderPlan();
  };

  Viewer.prototype._renderTitle = function () {
    this.ui.titleMain.textContent = this.config.title || '';
    this.ui.titleMain.style.display = this.config.title ? '' : 'none';
    this.ui.sceneName.textContent = this.scene ? this.scene.name : '';
  };

  Viewer.prototype._renderThumbs = function () {
    var self = this, wrap = this.ui.thumbs;
    wrap.innerHTML = '';
    if (!this.opts.showThumbs || this.config.scenes.length < 2) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    this.config.scenes.forEach(function (s) {
      var b = el('button', 'rt-thumb');
      b.type = 'button';
      b.dataset.scene = s.id;
      var img = el('img');
      img.alt = s.name;
      img.decoding = 'async';
      if (!self.opts.preload) img.loading = 'lazy';
      img.src = s.thumb;
      b.appendChild(img);
      b.appendChild(el('span', 'rt-thumb-name', null)).textContent = s.name;
      b.addEventListener('click', function () { self.loadScene(s.id); });
      wrap.appendChild(b);
    });
    this._updateThumbActive();
  };

  Viewer.prototype._updateThumbActive = function () {
    var id = this.scene && this.scene.id, active = null;
    Array.prototype.forEach.call(this.ui.thumbs.children, function (b) {
      var on = b.dataset.scene === id;
      b.classList.toggle('rt-active', on);
      if (on) active = b;
    });
    if (active && active.scrollIntoView) {
      try { active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { /* noop */ }
    }
  };

  Viewer.prototype._renderPlan = function () {
    var self = this, plan = this.ui.plan, fp = this.config.floorplan;
    plan.innerHTML = '';
    var c = this.container;
    if (!fp || !this.opts.showFloorplan) {
      plan.style.display = 'none';
      this.ui.planToggle.style.display = 'none';
      c.classList.remove('rt-has-plan');
      return;
    }
    plan.style.display = '';
    this.ui.planToggle.style.display = '';
    c.classList.add('rt-has-plan');
    var openByDefault = fp.open != null ? fp.open !== false : (c.clientWidth >= 600);
    c.classList.toggle('rt-plan-open', !!openByDefault);
    var close = el('button', 'rt-plan-close', '&times;');
    close.type = 'button'; close.title = '間取り図を閉じる'; close.setAttribute('aria-label', '間取り図を閉じる');
    close.addEventListener('click', function () { c.classList.remove('rt-plan-open'); });
    plan.appendChild(close);
    var img = el('img', 'rt-plan-img');
    img.src = fp.src; img.alt = '間取り図'; img.draggable = false;
    plan.appendChild(img);
    this.ui.planDots = {};
    this.config.scenes.forEach(function (s) {
      if (!s.plan) return;
      var d = el('button', 'rt-plan-dot');
      d.type = 'button';
      d.title = s.name;
      d.style.left = (s.plan.x * 100) + '%';
      d.style.top = (s.plan.y * 100) + '%';
      d.innerHTML = '<i class="rt-plan-cone"></i><b></b>';
      d.addEventListener('click', function () { self.loadScene(s.id); });
      plan.appendChild(d);
      self.ui.planDots[s.id] = d;
    });
    this._updatePlan();
  };

  Viewer.prototype._updatePlan = function () {
    if (!this.ui.planDots || !this.scene) return;
    var id = this.scene.id, self = this;
    Object.keys(this.ui.planDots).forEach(function (k) {
      var d = self.ui.planDots[k];
      var on = k === id;
      d.classList.toggle('rt-active', on);
      if (on) {
        var north = self.scene.northOffset || 0;
        var rot = self.scene.plan && self.scene.plan.rotation != null ? +self.scene.plan.rotation : 0;
        d.style.setProperty('--rt-heading', (self.yaw + north + rot) + 'deg');
      }
    });
  };

  /* ---- WebGL ---- */

  Viewer.prototype._initGL = function () {
    var gl = this.canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
      || this.canvas.getContext('experimental-webgl');
    if (!gl) {
      this._showError('お使いのブラウザは WebGL に対応していないため、360°画像を表示できません。');
      return;
    }
    this.gl = gl;
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    this.u = {
      aspect: gl.getUniformLocation(prog, 'uAspect'),
      tanHalf: gl.getUniformLocation(prog, 'uTanHalf'),
      rot: gl.getUniformLocation(prog, 'uRot'),
      tex: gl.getUniformLocation(prog, 'uTex')
    };
    gl.uniform1i(this.u.tex, 0);
    this.maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), this.opts.maxTextureSize);
    this.texture = null;
    this._resize();
  };

  Viewer.prototype._resize = function () {
    var c = this.container;
    var w = c.clientWidth || 1, h = c.clientHeight || 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw; this.canvas.height = ch;
      if (this.gl) this.gl.viewport(0, 0, cw, ch);
    }
    this.width = w; this.height = h;
    this.needsRender = true;
  };

  Viewer.prototype._uploadTexture = function (img) {
    var gl = this.gl; if (!gl) return;
    var src = img;
    if (img.width > this.maxTex || img.height > this.maxTex) {
      var scale = this.maxTex / Math.max(img.width, img.height);
      var cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      src = cv;
    }
    if (!this.texture) this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.hasTexture = true;
    this.needsRender = true;
  };

  Viewer.prototype._render = function () {
    var gl = this.gl; if (!gl || !this.hasTexture) return;
    var m = rotation(this.yaw, this.pitch);
    gl.uniform1f(this.u.aspect, this.width / this.height);
    gl.uniform1f(this.u.tanHalf, Math.tan(this.hfov * DEG / 2));
    // column-major
    gl.uniformMatrix3fv(this.u.rot, false, new Float32Array([
      m[0][0], m[1][0], m[2][0],
      m[0][1], m[1][1], m[2][1],
      m[0][2], m[1][2], m[2][2]
    ]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /* ---- projection helpers ---- */

  // 画面座標 (px, コンテナ左上基準) → {yaw, pitch}
  Viewer.prototype.screenToView = function (x, y) {
    var tanHalf = Math.tan(this.hfov * DEG / 2), aspect = this.width / this.height;
    var nx = (x / this.width) * 2 - 1, ny = 1 - (y / this.height) * 2;
    var d = [nx * tanHalf, ny * tanHalf / aspect, 1];
    var m = rotation(this.yaw, this.pitch);
    var w = [
      m[0][0] * d[0] + m[0][1] * d[1] + m[0][2] * d[2],
      m[1][0] * d[0] + m[1][1] * d[1] + m[1][2] * d[2],
      m[2][0] * d[0] + m[2][1] * d[1] + m[2][2] * d[2]
    ];
    var len = Math.hypot(w[0], w[1], w[2]);
    return { yaw: Math.atan2(w[0], w[2]) / DEG, pitch: Math.asin(clamp(w[1] / len, -1, 1)) / DEG };
  };

  // {yaw, pitch} → 画面座標。視野外(背面)なら null
  Viewer.prototype.viewToScreen = function (yaw, pitch) {
    var d = dirFrom(yaw, pitch);
    var m = rotation(this.yaw, this.pitch); // world = m * cam → cam = m^T * world
    var cx = m[0][0] * d[0] + m[1][0] * d[1] + m[2][0] * d[2];
    var cy = m[0][1] * d[0] + m[1][1] * d[1] + m[2][1] * d[2];
    var cz = m[0][2] * d[0] + m[1][2] * d[1] + m[2][2] * d[2];
    if (cz <= 0.02) return null;
    var tanHalf = Math.tan(this.hfov * DEG / 2), aspect = this.width / this.height;
    var nx = cx / (cz * tanHalf), ny = (cy / (cz * tanHalf)) * aspect;
    return { x: (nx + 1) / 2 * this.width, y: (1 - ny) / 2 * this.height, nx: nx, ny: ny };
  };

  /* ---- hotspots ---- */

  Viewer.prototype._buildHotspots = function () {
    var self = this, layer = this.hsLayer;
    layer.innerHTML = '';
    this.hotspotEls = [];
    if (!this.scene) return;
    this.scene.hotspots.forEach(function (h, idx) {
      var isScene = h.type === 'scene';
      var target = isScene ? self.getScene(h.target) : null;
      var e = el('div', 'rt-hs rt-hs-' + (isScene ? 'scene' : 'info'));
      var b = el('button', 'rt-hs-icon', isScene ? ICONS.arrow : ICONS.info);
      b.type = 'button';
      var label = h.text || (target ? target.name : '') || '';
      b.setAttribute('aria-label', label || (isScene ? '移動' : '情報'));
      e.appendChild(b);
      if (self.opts.hotspotLabels && label) {
        var lab = el('div', 'rt-hs-label');
        lab.textContent = label;
        e.appendChild(lab);
      }
      if (!isScene && (h.description || h.text)) {
        var tip = el('div', 'rt-hs-tip');
        if (h.title) tip.appendChild(el('b')).textContent = h.title;
        tip.appendChild(el('span')).textContent = h.description || h.text;
        e.appendChild(tip);
      }
      if (h.rotate != null) b.style.transform = 'rotate(' + h.rotate + 'deg)';
      e.dataset.index = idx;
      var handler = function (ev) {
        ev.stopPropagation();
        self._emit('hotspotclick', { hotspot: h, index: idx, scene: self.scene });
        if (self.editMode) return;
        if (isScene) {
          if (target) self.loadScene(target.id, {
            yaw: h.targetYaw != null ? +h.targetYaw : undefined,
            pitch: h.targetPitch != null ? +h.targetPitch : undefined
          });
        } else if (h.url) {
          window.open(h.url, h.urlTarget || '_blank', 'noopener');
        } else {
          Array.prototype.forEach.call(layer.querySelectorAll('.rt-hs.rt-open'), function (o) { if (o !== e) o.classList.remove('rt-open'); });
          e.classList.toggle('rt-open');
        }
      };
      b.addEventListener('click', handler);
      b.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
      layer.appendChild(e);
      self.hotspotEls.push({ el: e, hs: h });
    });
    this._positionHotspots();
  };

  Viewer.prototype._positionHotspots = function () {
    for (var i = 0; i < this.hotspotEls.length; i++) {
      var item = this.hotspotEls[i];
      var p = this.viewToScreen(item.hs.yaw, item.hs.pitch);
      if (!p || p.x < -80 || p.x > this.width + 80 || p.y < -80 || p.y > this.height + 80) {
        item.el.style.display = 'none';
      } else {
        item.el.style.display = '';
        item.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
        // 縁で見切れるとき、ツールチップの向きを調整
        item.el.classList.toggle('rt-hs-right', p.x > this.width * 0.7);
        item.el.classList.toggle('rt-hs-left', p.x < this.width * 0.3);
        item.el.classList.toggle('rt-hs-low', p.y > this.height * 0.65);
      }
    }
  };

  Viewer.prototype.refreshHotspots = function () { this._buildHotspots(); };

  /* ---- scenes ---- */

  Viewer.prototype.getScene = function (id) {
    for (var i = 0; i < this.config.scenes.length; i++) if (this.config.scenes[i].id === id) return this.config.scenes[i];
    return null;
  };

  Viewer.prototype._loadImage = function (src) {
    var self = this;
    if (this.textureCache[src]) return Promise.resolve(this.textureCache[src]);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var sameOrigin = true;
      try { sameOrigin = new URL(src, location.href).origin === location.origin || /^(blob|data):/.test(src); } catch (e) { /* noop */ }
      if (!sameOrigin) img.crossOrigin = 'anonymous';
      img.onload = function () { self.textureCache[src] = img; resolve(img); };
      img.onerror = function () { reject(new Error('画像を読み込めませんでした: ' + src)); };
      img.src = src;
    });
  };

  Viewer.prototype.loadScene = function (id, view) {
    var self = this;
    var scene = this.getScene(id);
    if (!scene) { console.warn('RicohTour: scene not found:', id); return Promise.resolve(false); }
    view = view || {};
    var token = this._loadToken = (this._loadToken || 0) + 1;
    var prev = this.scene;
    this.loadingEl.classList.add('rt-show');
    if (prev) this.fadeEl.classList.add('rt-show');
    this.container.classList.add('rt-loading-state');
    this._emit('sceneloadstart', { scene: scene });

    return this._loadImage(scene.src).then(function (img) {
      if (token !== self._loadToken || self.destroyed) return false;
      self.scene = scene;
      self._uploadTexture(img);
      self.yaw = view.yaw != null ? +view.yaw : scene.yaw;
      self.pitch = view.pitch != null ? +view.pitch : scene.pitch;
      self.hfov = clamp(view.hfov != null ? +view.hfov : (scene.hfov != null ? scene.hfov : self.hfov), self.config.minHfov, self.config.maxHfov);
      self.velYaw = self.velPitch = 0;
      if (self.gyro.on) self.gyro.offset = self.yaw - self.gyro.yaw;
      self._buildHotspots();
      self._renderTitle();
      self._updateThumbActive();
      self._updatePlan();
      self.errorEl.style.display = 'none';
      self.needsRender = true;
      self._render();
      self.loadingEl.classList.remove('rt-show');
      self.fadeEl.classList.remove('rt-show');
      self.container.classList.remove('rt-loading-state');
      self.container.classList.add('rt-ready');
      if (!prev) self._startHint();
      self.lastInteraction = performance.now();
      self._emit('scenechange', { scene: scene, previous: prev });
      // 次に移動しそうなシーンを先読み
      if (self.opts.preload) {
        scene.hotspots.forEach(function (h) {
          var t = h.type === 'scene' && self.getScene(h.target);
          if (t) self._loadImage(t.src).catch(function () { /* noop */ });
        });
      }
      return true;
    }).catch(function (err) {
      if (token !== self._loadToken) return false;
      self.loadingEl.classList.remove('rt-show');
      self.fadeEl.classList.remove('rt-show');
      self.container.classList.remove('rt-loading-state');
      self._showError(err.message || String(err));
      self._emit('error', err);
      return false;
    });
  };

  Viewer.prototype._showError = function (msg) {
    this.errorEl.textContent = msg;
    this.errorEl.style.display = '';
  };

  Viewer.prototype._startHint = function () {
    var self = this;
    if (!this.opts.showHint) return;
    this.hintEl.classList.add('rt-show');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(function () { self.hintEl.classList.remove('rt-show'); }, 3500);
  };

  Viewer.prototype.setConfig = function (config, baseUrl) {
    this.config = normalizeConfig(config, baseUrl || this.opts.baseUrl);
    var cur = this.scene && this.scene.id;
    this._renderTitle();
    this._renderThumbs();
    this._renderPlan();
    if (cur && this.getScene(cur)) {
      var s = this.getScene(cur);
      if (s.src === this.scene.src) {
        this.scene = s;
        this._buildHotspots();
        this._renderTitle();
        this._updateThumbActive();
        this._updatePlan();
        return Promise.resolve(true);
      }
      return this.loadScene(cur, { yaw: this.yaw, pitch: this.pitch, hfov: this.hfov });
    }
    if (this.config.scenes.length) return this.loadScene(this.config.defaultScene);
    this.scene = null; this.hasTexture = false; this._buildHotspots();
    return Promise.resolve(false);
  };

  /* ---- view API ---- */

  Viewer.prototype.getView = function () { return { yaw: wrap180(this.yaw), pitch: this.pitch, hfov: this.hfov }; };
  Viewer.prototype.setView = function (v) {
    v = v || {};
    if (v.yaw != null) this.yaw = +v.yaw;
    if (v.pitch != null) this.pitch = clamp(+v.pitch, -90, 90);
    if (v.hfov != null) this.hfov = clamp(+v.hfov, this.config.minHfov, this.config.maxHfov);
    this.needsRender = true;
  };
  Viewer.prototype.lookAt = function (yaw, pitch, duration) {
    var self = this;
    duration = duration == null ? 600 : duration;
    var sy = this.yaw, sp = this.pitch;
    var dy = wrap180(yaw - sy), dp = clamp(pitch, -90, 90) - sp;
    var t0 = performance.now();
    this._anim = function (t) {
      var k = clamp((t - t0) / duration, 0, 1);
      var e = 1 - Math.pow(1 - k, 3);
      self.yaw = sy + dy * e; self.pitch = sp + dp * e;
      self.needsRender = true;
      if (k >= 1) self._anim = null;
    };
  };
  Viewer.prototype.zoom = function (delta) {
    this.hfov = clamp(this.hfov + delta, this.config.minHfov, this.config.maxHfov);
    this.needsRender = true;
  };

  Viewer.prototype.toggleAutoRotate = function (on) {
    if (on == null) on = !this.autoRotateEnabled;
    this.autoRotateEnabled = on;
    if (on && !this.autoRotate) this.autoRotate = 2;
    this.lastInteraction = on ? 0 : performance.now();
    this._updateRotateBtn();
    this._emit('autorotate', { enabled: on });
  };
  Viewer.prototype._updateRotateBtn = function () {
    if (this.ui && this.ui.rotateBtn) this.ui.rotateBtn.classList.toggle('rt-on', !!this.autoRotateEnabled);
  };

  Viewer.prototype.toggleFullscreen = function () {
    var c = this.container, d = document;
    var fsEl = d.fullscreenElement || d.webkitFullscreenElement;
    if (fsEl) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      return;
    }
    var req = c.requestFullscreen || c.webkitRequestFullscreen;
    if (req) {
      try { var p = req.call(c); if (p && p.catch) p.catch(function () { /* noop */ }); return; } catch (e) { /* fallthrough */ }
    }
    // iOS Safari の iframe など全画面 API が使えない場合は新しいタブで開く
    if (window.top !== window.self) window.open(location.href, '_blank');
  };

  /* ---- gyro ---- */

  Viewer.prototype.toggleGyro = function () {
    var self = this;
    if (this.gyro.on) { this._stopGyro(); return; }
    var DOE = window.DeviceOrientationEvent;
    if (!DOE) return;
    if (typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(function (state) {
        if (state === 'granted') self._startGyro();
      }).catch(function () { /* denied */ });
    } else {
      this._startGyro();
    }
  };

  Viewer.prototype._startGyro = function () {
    var self = this, g = this.gyro;
    g.ready = false;
    g.handler = function (ev) {
      if (ev.alpha == null || ev.beta == null || ev.gamma == null) return;
      var a = ev.alpha * DEG, b = ev.beta * DEG, c = ev.gamma * DEG;
      var orient = (screen.orientation && screen.orientation.angle != null ? screen.orientation.angle : (window.orientation || 0)) * DEG;
      // three.js DeviceOrientationControls と同じ手順で端末の向きを求める
      var c1 = Math.cos(b / 2), c2 = Math.cos(a / 2), c3 = Math.cos(-c / 2);
      var s1 = Math.sin(b / 2), s2 = Math.sin(a / 2), s3 = Math.sin(-c / 2);
      var q = [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 - s1 * s2 * c3, c1 * c2 * c3 + s1 * s2 * s3];
      q = qmul(q, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
      q = qmul(q, [0, 0, Math.sin(-orient / 2), Math.cos(-orient / 2)]);
      var d = qrot(q, [0, 0, -1]); // three.js 座標 (Y up, -Z 前)
      var mx = d[0], my = d[1], mz = -d[2];
      var yaw = Math.atan2(mx, mz) / DEG, pitch = Math.asin(clamp(my, -1, 1)) / DEG;
      if (!g.ready) { g.ready = true; g.offset = self.yaw - yaw; }
      g.yaw = yaw; g.pitch = pitch;
      self.needsRender = true;
    };
    window.addEventListener('deviceorientation', g.handler, true);
    g.on = true;
    this.autoRotateEnabled = false;
    this._updateRotateBtn();
    this.ui.gyroBtn.classList.add('rt-on');
    this._emit('gyro', { enabled: true });
  };

  Viewer.prototype._stopGyro = function () {
    var g = this.gyro;
    if (g.handler) window.removeEventListener('deviceorientation', g.handler, true);
    g.handler = null; g.on = false; g.ready = false;
    this.ui.gyroBtn.classList.remove('rt-on');
    this._emit('gyro', { enabled: false });
  };

  function qmul(a, b) {
    return [
      a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
      a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
      a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  }
  function qrot(q, v) {
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var ix = w * v[0] + y * v[2] - z * v[1];
    var iy = w * v[1] + z * v[0] - x * v[2];
    var iz = w * v[2] + x * v[1] - y * v[0];
    var iw = -x * v[0] - y * v[1] - z * v[2];
    return [
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x
    ];
  }

  /* ---- events ---- */

  Viewer.prototype._interacted = function () {
    this.lastInteraction = performance.now();
    this._anim = null;
    this.hintEl.classList.remove('rt-show');
  };

  Viewer.prototype._bindEvents = function () {
    var self = this, c = this.container;

    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self._resize(); });
      this._ro.observe(c);
    } else {
      this._onWinResize = function () { self._resize(); };
      window.addEventListener('resize', this._onWinResize);
    }

    var drag = null;
    var pinch = null;
    var moved = false;

    function pointerCount() { return Object.keys(self.pointers).length; }
    function pinchDist() {
      var ids = Object.keys(self.pointers);
      var a = self.pointers[ids[0]], b = self.pointers[ids[1]];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    c.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      if (ev.target.closest && ev.target.closest('.rt-top, .rt-bottom, .rt-plan-toggle, .rt-hs')) return;
      c.focus({ preventScroll: true });
      self.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      try { c.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
      self._interacted();
      moved = false;
      if (pointerCount() === 1) {
        drag = { x: ev.clientX, y: ev.clientY, yaw: self.yaw, pitch: self.pitch, t: performance.now(), lastX: ev.clientX, lastY: ev.clientY, lastT: performance.now(), vx: 0, vy: 0 };
        self.velYaw = self.velPitch = 0;
        c.classList.add('rt-dragging');
      } else if (pointerCount() === 2) {
        pinch = { dist: pinchDist(), hfov: self.hfov };
        drag = null;
      }
      ev.preventDefault();
    });

    c.addEventListener('pointermove', function (ev) {
      var p = self.pointers[ev.pointerId];
      if (!p) return;
      p.x = ev.clientX; p.y = ev.clientY;
      if (pinch && pointerCount() >= 2) {
        var d = pinchDist();
        if (d > 0) {
          self.hfov = clamp(pinch.hfov * (pinch.dist / d), self.config.minHfov, self.config.maxHfov);
          self.needsRender = true;
        }
        return;
      }
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      var degPerPx = self.hfov / self.width;
      if (self.gyro.on) {
        self.gyro.offset -= (ev.clientX - drag.lastX) * degPerPx;
      } else {
        self.yaw = drag.yaw - dx * degPerPx;
        self.pitch = clamp(drag.pitch + dy * degPerPx, -90, 90);
      }
      var now = performance.now(), dt = Math.max(now - drag.lastT, 1);
      drag.vx = (ev.clientX - drag.lastX) / dt; drag.vy = (ev.clientY - drag.lastY) / dt;
      drag.lastX = ev.clientX; drag.lastY = ev.clientY; drag.lastT = now;
      self.needsRender = true;
      self._interacted();
    });

    function endPointer(ev) {
      if (!self.pointers[ev.pointerId]) return;
      delete self.pointers[ev.pointerId];
      try { c.releasePointerCapture(ev.pointerId); } catch (e) { /* noop */ }
      if (pointerCount() === 0) {
        if (drag && !self.gyro.on) {
          var age = performance.now() - drag.lastT;
          if (age < 80 && !self.editMode) {
            var degPerPx = self.hfov / self.width;
            self.velYaw = -drag.vx * degPerPx * 1000; // deg/sec
            self.velPitch = drag.vy * degPerPx * 1000;
          }
        }
        if (!moved && drag) {
          var rect = c.getBoundingClientRect();
          var x = ev.clientX - rect.left, y = ev.clientY - rect.top;
          var v = self.screenToView(x, y);
          Array.prototype.forEach.call(self.hsLayer.querySelectorAll('.rt-hs.rt-open'), function (o) { o.classList.remove('rt-open'); });
          self._emit('click', { x: x, y: y, yaw: wrap180(v.yaw), pitch: v.pitch, originalEvent: ev });
        }
        drag = null; pinch = null;
        c.classList.remove('rt-dragging');
      } else if (pointerCount() === 1) {
        var id = Object.keys(self.pointers)[0], pp = self.pointers[id];
        pinch = null;
        drag = { x: pp.x, y: pp.y, yaw: self.yaw, pitch: self.pitch, t: performance.now(), lastX: pp.x, lastY: pp.y, lastT: performance.now(), vx: 0, vy: 0 };
      }
      self.lastInteraction = performance.now();
    }
    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', endPointer);

    c.addEventListener('wheel', function (ev) {
      if (ev.target.closest && ev.target.closest('.rt-thumbs, .rt-plan')) return;
      ev.preventDefault();
      var delta = ev.deltaMode === 1 ? ev.deltaY * 20 : ev.deltaY;
      self.zoom(clamp(delta, -60, 60) * 0.06);
      self._interacted();
    }, { passive: false });

    c.addEventListener('dblclick', function (ev) {
      if (ev.target.closest && ev.target.closest('.rt-top, .rt-bottom, .rt-hs, .rt-plan-toggle')) return;
      var rect = c.getBoundingClientRect();
      var v = self.screenToView(ev.clientX - rect.left, ev.clientY - rect.top);
      self.lookAt(v.yaw, v.pitch, 500);
      self.hfov = clamp(self.hfov * 0.7, self.config.minHfov, self.config.maxHfov);
      self.needsRender = true;
    });

    c.addEventListener('keydown', function (ev) {
      var step = 5, handled = true;
      switch (ev.key) {
        case 'ArrowLeft': self.yaw -= step; break;
        case 'ArrowRight': self.yaw += step; break;
        case 'ArrowUp': self.pitch = clamp(self.pitch + step, -90, 90); break;
        case 'ArrowDown': self.pitch = clamp(self.pitch - step, -90, 90); break;
        case '+': case '=': self.zoom(-5); break;
        case '-': case '_': self.zoom(5); break;
        default: handled = false;
      }
      if (handled) { ev.preventDefault(); self.needsRender = true; self._interacted(); }
    });

    this._onFsChange = function () {
      var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      c.classList.toggle('rt-fullscreen', on);
      self.ui.fsBtn.innerHTML = on ? ICONS.fullscreenExit : ICONS.fullscreen;
      setTimeout(function () { self._resize(); }, 50);
    };
    document.addEventListener('fullscreenchange', this._onFsChange);
    document.addEventListener('webkitfullscreenchange', this._onFsChange);
  };

  /* ---- frame loop ---- */

  Viewer.prototype._frame = function (t) {
    var dt = this._lastT ? Math.min((t - this._lastT) / 1000, 0.1) : 0;
    this._lastT = t;
    if (!this.scene) return;

    if (this._anim) this._anim(t);

    // 慣性
    if (!this.gyro.on && (Math.abs(this.velYaw) > 0.5 || Math.abs(this.velPitch) > 0.5)) {
      this.yaw += this.velYaw * dt;
      this.pitch = clamp(this.pitch + this.velPitch * dt, -90, 90);
      var damp = Math.pow(0.05, dt);
      this.velYaw *= damp; this.velPitch *= damp;
      this.needsRender = true;
    } else { this.velYaw = this.velPitch = 0; }

    // ジャイロ
    if (this.gyro.on && this.gyro.ready) {
      this.yaw = this.gyro.yaw + this.gyro.offset;
      this.pitch = clamp(this.gyro.pitch, -90, 90);
      this.needsRender = true;
    }

    // 自動回転
    if (this.autoRotateEnabled && this.autoRotate && !this.gyro.on && !this.editMode &&
      Object.keys(this.pointers).length === 0 && !this._anim &&
      t - this.lastInteraction > this.config.autoRotateDelay) {
      this.yaw += this.autoRotate * dt;
      if (Math.abs(this.pitch) > 0.05) this.pitch *= Math.pow(0.3, dt);
      this.needsRender = true;
    }

    if (this.needsRender) {
      this.needsRender = false;
      this._render();
      this._positionHotspots();
      this._updatePlan();
      this._emit('viewchange', this.getView());
    }
  };

  Viewer.prototype.setEditMode = function (on) {
    this.editMode = !!on;
    this.container.classList.toggle('rt-edit', this.editMode);
  };

  Viewer.prototype.destroy = function () {
    this.destroyed = true;
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
    document.removeEventListener('fullscreenchange', this._onFsChange);
    document.removeEventListener('webkitfullscreenchange', this._onFsChange);
    this._stopGyro();
    if (this.gl && this.texture) this.gl.deleteTexture(this.texture);
    this.container.innerHTML = '';
    this.container.classList.remove('rt-viewer', 'rt-ready', 'rt-has-plan', 'rt-plan-open');
  };

  /* ---------- public namespace ---------- */

  function loadConfig(src) {
    if (typeof src !== 'string') return Promise.resolve({ config: src, baseUrl: null });
    return fetch(src, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('設定ファイルを読み込めませんでした (' + r.status + '): ' + src);
      return r.json();
    }).then(function (json) { return { config: json, baseUrl: dirOf(src) }; });
  }

  function mount(container, configOrUrl, options) {
    if (typeof container === 'string') container = document.querySelector(container);
    options = options || {};
    return loadConfig(configOrUrl).then(function (r) {
      var opts = Object.assign({}, options);
      if (!opts.baseUrl) opts.baseUrl = r.baseUrl;
      return new Viewer(container, r.config, opts);
    }).catch(function (err) {
      if (container) {
        container.classList.add('rt-viewer');
        container.innerHTML = '<div class="rt-error">' + (err && err.message ? err.message : err) + '</div>';
      }
      throw err;
    });
  }

  function parseDataOptions(elm) {
    var o = {};
    var d = elm.dataset;
    if (d.scene) o.scene = d.scene;
    if (d.autorotate != null) o.autoRotate = d.autorotate === '' || d.autorotate === 'true' ? 2 : +d.autorotate;
    if (d.yaw) o.yaw = +d.yaw;
    if (d.pitch) o.pitch = +d.pitch;
    if (d.hfov) o.hfov = +d.hfov;
    if (d.ui === 'minimal') { o.showThumbs = false; o.showTitle = false; o.showFloorplan = false; }
    return o;
  }

  function autoInit(root) {
    var nodes = (root || document).querySelectorAll('[data-ricoh-tour]');
    var list = [];
    Array.prototype.forEach.call(nodes, function (n) {
      if (n.__ricohTour) return;
      n.__ricohTour = true;
      list.push(mount(n, n.getAttribute('data-ricoh-tour'), parseDataOptions(n)).then(function (v) { n.__ricohTourViewer = v; return v; }).catch(function () { return null; }));
    });
    return Promise.all(list);
  }

  var RicohTour = {
    Viewer: Viewer,
    mount: mount,
    autoInit: autoInit,
    normalizeConfig: normalizeConfig,
    version: '1.0.0'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RicohTour;
  global.RicohTour = RicohTour;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { autoInit(); });
    else autoInit();
  }
})(typeof window !== 'undefined' ? window : this);
