(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = getComputedStyle(document.documentElement);
  var PHOS = (css.getPropertyValue('--phos') || '#35f48a').trim();
  var PHOS_RGB = '53,244,138';

  /* ------------------------------------------------------------------
     Background field: faint grid, data packets travelling along it,
     and a brighter grid revealed around the cursor.
  ------------------------------------------------------------------ */
  var field = (function () {
    var cv = document.getElementById('field');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1, GRID = 56;
    var mouse = { x: -999, y: -999 };
    var packets = [];
    var raf = 0;
    var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

    function spawn() {
      var cols = Math.ceil(W / GRID), rows = Math.ceil(H / GRID);
      return {
        gx: Math.floor(Math.random() * cols), gy: Math.floor(Math.random() * rows),
        dir: Math.floor(Math.random() * 4), p: Math.random(),
        speed: 0.006 + Math.random() * 0.01, len: 24 + Math.random() * 40
      };
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = reduceMotion ? 0 : Math.max(6, Math.min(18, Math.floor(W / 90)));
      packets = [];
      for (var i = 0; i < count; i++) packets.push(spawn());
      draw();
    }

    function gridPath() {
      ctx.beginPath();
      for (var x = 0; x <= W; x += GRID) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
      for (var y = 0; y <= H; y += GRID) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.045)';
      gridPath(); ctx.stroke();

      if (mouse.x > -500) {
        ctx.save();
        ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 190, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.17)';
        gridPath(); ctx.stroke();
        ctx.restore();
      }

      for (var i = 0; i < packets.length; i++) {
        var k = packets[i], d = DIRS[k.dir];
        var hx = (k.gx + d[0] * k.p) * GRID + 0.5, hy = (k.gy + d[1] * k.p) * GRID + 0.5;
        var tx = hx - d[0] * k.len, ty = hy - d[1] * k.len;
        var g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, 'rgba(' + PHOS_RGB + ',0)');
        g.addColorStop(1, 'rgba(' + PHOS_RGB + ',0.4)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = 'rgba(' + PHOS_RGB + ',0.7)'; ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
      }
    }

    function step() {
      for (var i = 0; i < packets.length; i++) {
        var k = packets[i];
        k.p += k.speed;
        if (k.p >= 1) {
          var d = DIRS[k.dir];
          k.gx += d[0]; k.gy += d[1]; k.p = 0;
          if (Math.random() < 0.28) {
            var turn = Math.random() < 0.5 ? 1 : 3;
            k.dir = (k.dir + turn) % 4;
          }
          if (k.gx < -2 || k.gy < -2 || k.gx * GRID > W + 100 || k.gy * GRID > H + 100) packets[i] = spawn();
        }
      }
    }

    function loop() {
      step(); draw();
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && !reduceMotion) raf = requestAnimationFrame(loop); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (reduceMotion) draw();
    }, { passive: true });
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    resize(); start();
  })();

  /* ------------------------------------------------------------------
     Hero eye: an optical sensor that powers on after the boot log
     and tracks the cursor.
  ------------------------------------------------------------------ */
  var eye = (function () {
    var cv = document.getElementById('eye');
    if (!cv) return { powerOn: function () {} };
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, dpr = 1, raf = 0, visible = true;
    var open = reduceMotion ? 1 : 0, openTarget = reduceMotion ? 1 : 0;
    var look = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
    var lastMove = -1e9, lastT = performance.now(), clock = 0;
    var blink = { next: 3000, t: -1 };

    function resize() {
      var r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(0);
    }

    window.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var d = Math.hypot(dx, dy) || 1;
      var reach = Math.min(1, d / (Math.max(window.innerWidth, window.innerHeight) * 0.3));
      tgt.x = dx / d * reach; tgt.y = dy / d * reach;
      lastMove = performance.now();
    }, { passive: true });

    function polar(r, a) { return [Math.cos(a) * r, Math.sin(a) * r]; }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      var s = Math.min(W, H) / 2, cx = W / 2, cy = H / 2;
      if (s < 10) return;
      var o = Math.max(0, open * (blink.t >= 0 ? Math.abs(1 - Math.sin(Math.min(1, blink.t / 220) * Math.PI)) : 1));

      ctx.save();
      ctx.translate(cx, cy);

      // faint crosshair
      ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.10)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();

      // outer tick ring
      var rot = t * 0.00005 * 360 * Math.PI / 180;
      for (var i = 0; i < 72; i++) {
        var a = i * Math.PI * 2 / 72 + rot, major = i % 6 === 0;
        var p1 = polar(s * 0.98, a), p2 = polar(s * (0.98 - (major ? 0.07 : 0.035)), a);
        ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',' + (major ? 0.7 : 0.28) + ')';
        ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
      }

      // dashed ring, counter-rotating
      ctx.save(); ctx.rotate(-t * 0.00012);
      ctx.setLineDash([6, 10]); ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.32)';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();

      // arc segments
      ctx.save(); ctx.rotate(t * 0.0003); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.8)'; ctx.lineWidth = 2;
      for (var j = 0; j < 3; j++) {
        ctx.beginPath(); ctx.arc(0, 0, s * 0.77, j * 2.094, j * 2.094 + 1.1); ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 1;

      // housing
      var hg = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 0.66);
      hg.addColorStop(0, '#0f2016'); hg.addColorStop(1, '#050906');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(0, 0, s * 0.66, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.55)';
      ctx.beginPath(); ctx.arc(0, 0, s * 0.66, 0, Math.PI * 2); ctx.stroke();

      // scan sweep inside housing
      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, s * 0.66, 0, Math.PI * 2); ctx.clip();
      var sw = t * 0.0009;
      ctx.fillStyle = 'rgba(' + PHOS_RGB + ',0.07)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.66, sw - 0.7, sw); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.35)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sw) * s * 0.66, Math.sin(sw) * s * 0.66); ctx.stroke();
      ctx.restore();

      // iris blades, centred on the look offset
      var ox = look.x * s * 0.09, oy = look.y * s * 0.09;
      ctx.save(); ctx.translate(ox, oy);
      var rOut = s * 0.52, rIn = s * (0.04 + 0.25 * o), twist = (1 - o) * 0.95, n = 12;
      for (var b = 0; b < n; b++) {
        var ba = b * Math.PI * 2 / n + twist;
        var q = [polar(rIn, ba), polar(rOut, ba + 0.34), polar(rOut, ba + 0.62), polar(rIn * 0.85, ba + 0.3)];
        ctx.fillStyle = 'rgba(' + PHOS_RGB + ',' + (b % 2 ? 0.05 : 0.10) + ')';
        ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.55)';
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
        for (var m = 1; m < 4; m++) ctx.lineTo(q[m][0], q[m][1]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // pupil
      var pr = Math.max(1, rIn * 0.62);
      ctx.shadowColor = PHOS; ctx.shadowBlur = 26 * o + 2;
      ctx.fillStyle = PHOS;
      ctx.beginPath(); ctx.arc(0, 0, pr, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(230,255,240,0.9)';
      ctx.beginPath(); ctx.arc(-pr * 0.32, -pr * 0.32, Math.max(0.6, pr * 0.2), 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.restore();

      // corner brackets and readouts
      ctx.strokeStyle = 'rgba(' + PHOS_RGB + ',0.7)'; ctx.lineWidth = 2;
      var L = 16, pad = 2;
      [[pad, pad, 1, 1], [W - pad, pad, -1, 1], [pad, H - pad, 1, -1], [W - pad, H - pad, -1, -1]].forEach(function (c) {
        ctx.beginPath(); ctx.moveTo(c[0] + c[2] * L, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * L); ctx.stroke();
      });
      ctx.fillStyle = 'rgba(134,160,143,0.95)';
      ctx.font = '500 ' + Math.max(9, Math.round(W / 42)) + 'px "Martian Mono", ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.fillText('lock ' + look.x.toFixed(2) + ' ' + look.y.toFixed(2), 14, 14);
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText('iris ' + Math.round(o * 100) + '%', W - 14, H - 14);
      ctx.textAlign = 'left';
    }

    function frame(now) {
      var dt = Math.min(64, now - lastT); lastT = now; clock += dt;
      open += (openTarget - open) * (1 - Math.pow(0.012, dt / 1000));
      if (now - lastMove > 4500) {
        tgt.x = Math.sin(clock * 0.0004) * 0.7; tgt.y = Math.cos(clock * 0.00031) * 0.5;
      }
      var k = 1 - Math.pow(0.002, dt / 1000);
      look.x += (tgt.x - look.x) * k; look.y += (tgt.y - look.y) * k;
      if (blink.t >= 0) { blink.t += dt; if (blink.t > 220) { blink.t = -1; blink.next = clock + 2800 + Math.random() * 3600; } }
      else if (open > 0.95 && clock > blink.next) blink.t = 0;
      draw(clock);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (!raf && visible && !reduceMotion) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(cv);
    }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    window.addEventListener('resize', resize);
    resize(); start();
    return { powerOn: function () { openTarget = 1; if (reduceMotion) draw(0); } };
  })();

  /* ------------------------------------------------------------------
     Boot sequence: one orchestrated moment on load.
  ------------------------------------------------------------------ */
  (function () {
    var boot = document.getElementById('boot');
    var h1 = document.getElementById('name');
    if (!boot || !h1) return;
    var lines = [
      '> boot unit.mohamed-fathy',
      '> load modules: retrieval, agents, tool use',
      '> status: open to projects'
    ];
    var full = h1.textContent;
    if (reduceMotion) { boot.textContent = lines.join('\n'); eye.powerOn(); return; }
    h1.textContent = '';
    h1.classList.add('typing');
    var li = 0, ci = 0;
    function typeLine() {
      if (li >= lines.length) { typeName(); return; }
      var line = lines[li];
      if (ci <= line.length) {
        boot.textContent = lines.slice(0, li).join('\n') + (li ? '\n' : '') + line.slice(0, ci);
        ci++; setTimeout(typeLine, 16);
      } else { li++; ci = 0; setTimeout(typeLine, 120); }
    }
    var ni = 0;
    function typeName() {
      eye.powerOn();
      if (ni <= full.length) { h1.textContent = full.slice(0, ni++); setTimeout(typeName, 55); }
      else { h1.classList.remove('typing'); }
    }
    setTimeout(typeLine, 250);
  })();

  /* ------------------------------------------------------------------
     Rail readouts and active section
  ------------------------------------------------------------------ */
  (function () {
    var clockEl = document.getElementById('clock');
    var pctEl = document.getElementById('scrollpct');
    function tick() {
      try {
        clockEl.textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date());
      } catch (e) { clockEl.textContent = '--:--'; }
    }
    tick(); setInterval(tick, 20000);

    var pending = false;
    function onScroll() {
      if (pending) return; pending = true;
      requestAnimationFrame(function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        pctEl.textContent = (max > 0 ? Math.round(window.scrollY / max * 100) : 0) + '%';
        pending = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

    var links = {};
    document.querySelectorAll('[data-nav]').forEach(function (a) { links[a.getAttribute('data-nav')] = a; });
    function setActive(id) {
      Object.keys(links).forEach(function (k) {
        if (k === id) links[k].setAttribute('aria-current', 'true'); else links[k].removeAttribute('aria-current');
      });
    }
    setActive('top');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
      }, { rootMargin: '-40% 0px -55% 0px' });
      ['top', 'profile', 'projects', 'contact'].forEach(function (id) {
        var el = document.getElementById(id); if (el) io.observe(el);
      });
    }
  })();

  /* ------------------------------------------------------------------
     Screenshot lens and full-size viewer
  ------------------------------------------------------------------ */
  (function () {
    var dlg = document.getElementById('viewer');
    var dImg = document.getElementById('viewer-img');
    var closeBtn = document.getElementById('viewer-close');
    var ZOOM = 2.2;

    function openViewer(src, alt) {
      dImg.src = src; dImg.alt = alt || '';
      if (dlg.showModal) dlg.showModal(); else window.open(src, '_blank', 'noopener');
    }
    if (closeBtn) closeBtn.addEventListener('click', function () { dlg.close(); });
    if (dlg) dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

    document.querySelectorAll('.viewport.shot').forEach(function (vp) {
      var img = vp.querySelector('img'), lens = vp.querySelector('.lens');
      vp.addEventListener('click', function () { openViewer(vp.getAttribute('data-full') || img.currentSrc, vp.getAttribute('data-alt')); });
      vp.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = img.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        var half = lens.offsetWidth / 2;
        lens.style.backgroundImage = 'url("' + img.currentSrc + '")';
        lens.style.backgroundSize = (r.width * ZOOM) + 'px ' + (r.height * ZOOM) + 'px';
        lens.style.backgroundPosition = (-(x * ZOOM - half)) + 'px ' + (-(y * ZOOM - half)) + 'px';
        var vr = vp.getBoundingClientRect();
        lens.style.transform = 'translate(' + (e.clientX - vr.left - half) + 'px,' + (e.clientY - vr.top - half) + 'px)';
        vp.classList.add('scanning');
      });
      vp.addEventListener('pointerleave', function () { vp.classList.remove('scanning'); });
    });
  })();

  /* ------------------------------------------------------------------
     Demo video controls
  ------------------------------------------------------------------ */
  Array.prototype.forEach.call(document.querySelectorAll('[data-player]'), function (wrap) {
    var v = wrap.querySelector('video');
    if (!v) return;
    var big = wrap.querySelector('.big-play');
    var tog = wrap.querySelector('.v-toggle');
    var seek = wrap.querySelector('.v-seek');
    var time = wrap.querySelector('.v-time');
    var mute = wrap.querySelector('.v-mute');
    var full = wrap.querySelector('.v-full');
    var seeking = false;
    v.muted = true;

    function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    function sync() {
      tog.textContent = v.paused ? 'Play' : 'Pause';
      tog.setAttribute('aria-label', v.paused ? 'Play' : 'Pause');
      wrap.classList.toggle('playing', !v.paused);
      wrap.classList.toggle('paused', v.paused && wrap.classList.contains('started'));
    }
    function play() {
      wrap.classList.add('started');
      var p = v.play(); if (p && p.catch) p.catch(function () { sync(); });
    }
    function toggle() { v.paused ? play() : v.pause(); }

    big.addEventListener('click', play);
    tog.addEventListener('click', toggle);
    v.addEventListener('click', toggle);
    v.addEventListener('play', sync); v.addEventListener('pause', sync); v.addEventListener('ended', sync);
    v.addEventListener('timeupdate', function () {
      if (!seeking && v.duration) seek.value = Math.round(v.currentTime / v.duration * 1000);
      time.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
    });
    v.addEventListener('loadedmetadata', function () { time.textContent = '0:00 / ' + fmt(v.duration); });
    seek.addEventListener('input', function () { seeking = true; if (v.duration) v.currentTime = seek.value / 1000 * v.duration; });
    seek.addEventListener('change', function () { seeking = false; });
    if (mute) mute.addEventListener('click', function () {
      v.muted = !v.muted;
      mute.textContent = v.muted ? 'Sound off' : 'Sound on';
      mute.setAttribute('aria-label', v.muted ? 'Unmute' : 'Mute');
    });
    full.addEventListener('click', function () {
      if (wrap.requestFullscreen) { var fp = wrap.requestFullscreen(); if (fp && fp.catch) fp.catch(function () {}); }
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    });
    sync();
  });

  /* ------------------------------------------------------------------
     Contact form: posts to /api/contact, which forwards to Zapier.
  ------------------------------------------------------------------ */
  (function () {
    var form = document.getElementById('contact-form');
    if (!form) return;
    var statusEl = document.getElementById('f-status');
    var btn = document.getElementById('f-submit');
    var loadedAt = Date.now();
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function setStatus(kind, html) { statusEl.className = 'form-status ' + (kind || ''); statusEl.innerHTML = html || ''; }
    function mark(input, bad, msg) {
      var f = input.closest('.field'); f.classList.toggle('invalid', bad);
      var e = f.querySelector('.err'); if (e) e.textContent = bad ? msg : '';
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
    }
    function validate() {
      var n = form.elements.name, em = form.elements.email, m = form.elements.message, ok = true, first = null;
      var bad;
      bad = !n.value.trim(); mark(n, bad, 'Enter your name.'); if (bad) { ok = false; first = first || n; }
      bad = !EMAIL.test(em.value.trim()); mark(em, bad, 'Enter an email address I can reply to.'); if (bad) { ok = false; first = first || em; }
      bad = m.value.trim().length < 10; mark(m, bad, 'Write at least a sentence about the project.'); if (bad) { ok = false; first = first || m; }
      if (first) first.focus();
      return ok;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      setStatus('', '');
      if (!validate()) return;
      var payload = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        message: form.elements.message.value.trim(),
        company: form.elements.company.value,
        elapsed: Date.now() - loadedAt
      };
      btn.disabled = true; btn.textContent = 'Sending';
      setStatus('', 'Sending your message.');

      fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok || !body.ok) throw new Error(body.error || ('http_' + res.status));
          setStatus('ok', 'Message sent. I will reply to ' + payload.email.replace(/[<>&]/g, '') + '.');
          form.reset(); loadedAt = Date.now();
        });
      }).catch(function () {
        setStatus('bad', 'The message did not send. Try again, or email <a href="mailto:mofaty24@gmail.com">mofaty24@gmail.com</a> directly.');
      }).then(function () {
        btn.disabled = false; btn.textContent = 'Send message';
      });
    });
  })();
})();
