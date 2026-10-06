// Trailer director: shots on a fixed timeline (seconds). The recorder calls __frame(i) for every frame at 30 fps.
(() => {
  const FPS = 30, G = () => window.__g(), $ = id => document.getElementById(id);
  const cues = window.__cues = [];
  let T = 0;   // trailer time of the current frame
  window.__cue = (name, vol) => { if (window.__vt.on) cues.push({ t:+T.toFixed(3), name, vol:+(+vol || 1).toFixed(2) }); };
  const hud = on => { $('hud').hidden = !on; $('feed').style.display = on ? '' : 'none'; };
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x*x*(3 - 2*x);
  const look = (cam, px, py, pz, tx, ty, tz) => { cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz); cam.fov = 55; cam.updateProjectionMatrix(); };
  function start(map, opts = {}) {
    const g = G();
    for (const k of Object.keys(g.CHEAT)) g.CHEAT[k] = false;
    g.setMap(map); g.setTeams(opts.team || 2, false); g.setCars(opts.cars !== false);
    document.getElementById(opts.awp ? 'm-awp' : 'm-knife').click();
    g.startMatch(); g.setState('play');
    Object.assign(g.CHEAT, { god:true, ...(opts.cheats || {}) }); g.applyCheatVisuals();
    g.keys.clear(); g.mouse.L = g.mouse.R = false;
    return G();
  }
  const park = (e, x, y) => { e.x = x; e.y = y; e.vx = e.vy = 0; };
  const faceTo = (p, x, y) => Math.atan2(y - p.y, x - p.x);
  const turn = (p, a, k) => { let d = a - p.ang; while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI; p.ang += d*k; };

  const SHOTS = [
    { t0:0, t1:3, setup() { window.__cam = c => look(c, 80, 40, 34, 80, 0, 34); hud(false); start('b:highway'); } },
    // aerial over the highway, cars on both carriageways
    { t0:3, t1:8, setup() {
        const g = start('b:highway'); hud(false); g.player.x = 6200; g.player.y = 2600;
        const lanes = [[1100, 680, 0, 950], [500, 868, 0, 1100], [3600, 1400, Math.PI, 900], [4200, 1580, Math.PI, 1000]];
        g.CARS.forEach((c, i) => { const L = lanes[i % lanes.length]; Object.assign(c, { x:L[0], y:L[1], ang:L[2], v:L[3] }); c.cruise = L[3]; });
        for (const e of g.ents) if (!e.isPlayer) park(e, 6300, 2650);
        g.CHEAT.freeze = true;
        window.__cam = c => { const k = this.lt/5; look(c, 14 + k*38, 7 + k*3, 31, 34 + k*38, .5, 17); };
      }, each() { for (const c of G().CARS) c.v = c.cruise; } },
    // first-person karambit in the market square
    { t0:8, t1:14, word:'KARAMBIT', setup() {
        const g = start('b:market', { cheats:{ onehit:true, freeze:true } }); window.__cam = null; hud(true);
        const p = g.player; park(p, 1000, 1360); p.ang = 0; p.pitch = -.05;
        const [a, b] = g.ents.filter(e => !e.isPlayer && e.team !== p.team);
        for (const e of g.ents) if (!e.isPlayer && e !== a && e !== b) park(e, 2600, 2600);
        park(a, 1190, 1310); a.ang = Math.PI; a.prot = 0; park(b, 1240, 1470); b.ang = .1; b.prot = 0;
        this.a = a; this.b = b; this.step = 0;
      }, each() {
        const g = G(), p = g.player, lt = this.lt, { a, b } = this;
        if (lt < 1.4 && a.alive) { turn(p, faceTo(p, a.x, a.y), .3); g.keys.add('KeyW'); if (lt > .45 && this.step === 0) { this.step = 1; g.dash(p, Math.cos(p.ang), Math.sin(p.ang)); } if (Math.hypot(a.x - p.x, a.y - p.y) < 70) g.attack(p, 'slash'); }
        else if (b.alive && lt < 4) { turn(p, faceTo(p, b.x, b.y), .18); if (lt > 1.9) g.keys.add('KeyW'); else g.keys.delete('KeyW'); if (Math.hypot(b.x - p.x, b.y - p.y) < 75) g.attack(p, 'stab'); }
        else { g.keys.delete('KeyW'); if (lt > 4.3 && this.step < 2) { this.step = 2; p.inspect = 1.6; } }
      } },
    // AWP down the highway
    { t0:14, t1:18, word:'AWP', setup() {
        const g = start('b:highway', { awp:true, cheats:{ freeze:true, spread:true } }); window.__cam = null; hud(true);
        const p = g.player; park(p, 800, 1400); p.ang = 0; p.pitch = 0;
        const foe = g.ents.find(e => !e.isPlayer && e.team !== p.team);
        for (const e of g.ents) if (!e.isPlayer && e !== foe) park(e, 6200, 300);
        park(foe, 2200, 1395); foe.ang = Math.PI; foe.prot = 0; this.foe = foe; this.fired = false;
        g.CARS.forEach((c, i) => { c.x = 5000 + i*300; c.y = 300; });
      }, each() {
        const g = G(), p = g.player, lt = this.lt, f = this.foe;
        p.ang = faceTo(p, f.x, f.y); p.pitch = Math.atan2(1.66 - 1.62, Math.hypot(f.x - p.x, f.y - p.y)*g.S);
        if (lt > .5 && lt < .55) p.zoom = 1;
        if (lt > 1.5 && !this.fired) { this.fired = true; g.playerFire(); }
      } },
    // driving: boost, ramp jump, roadkill
    { t0:18, t1:24, word:'CARS', setup() {
        const g = start('b:highway', { cheats:{ freeze:true } }); window.__cam = null; hud(true);
        const p = g.player, car = g.CARS[0];
        Object.assign(car, { x:1300, y:868, ang:0, v:0 });
        g.CARS.slice(1).forEach((c, i) => { c.x = 5200 + i*300; c.y = 1500; });
        park(p, 1300, 800); g.enterCar(p, car, 0);
        g.addBuild({ t:1, x:2700, y:868, rot:0, id:900, mine:true, owner:'me', color:'#e0b25a' });
        const foe = g.ents.find(e => !e.isPlayer && e.team !== p.team);
        for (const e of g.ents) if (!e.isPlayer && e !== foe) park(e, 6200, 300);
        park(foe, 2050, 868); foe.ang = Math.PI; foe.prot = 0;
        this.car = car; this.boosted = false;
      }, each() {
        const g = G(), lt = this.lt;
        if (lt < 3.9) g.keys.add('KeyW'); else { g.keys.delete('KeyW'); g.keys.add('Space'); g.keys.add('KeyS'); }
        if (lt > .25 && !this.boosted) { this.boosted = true; g.carBoost(); }
        window.__cue('engine', Math.abs(this.car.v)/1000);
        (window.__carlog = window.__carlog || []).push([+lt.toFixed(2), this.car.x | 0, this.car.y | 0, +this.car.ang.toFixed(2), this.car.v | 0, +this.car.h.toFixed(2)]);
      } },
    // a car goes up
    { t0:24, t1:28, word:'WRECK', setup() {
        const g = start('b:highway', { cheats:{ freeze:true } }); hud(false);
        const p = g.player; park(p, 300, 300);
        for (const e of g.ents) if (!e.isPlayer) park(e, 6200, 300);
        const car = g.CARS[1]; Object.assign(car, { x:2600, y:780, ang:.35, v:0 }); this.car = car; this.n = 0;
        g.CARS.forEach((c, i) => { if (c !== car) { c.x = 5000 + i*300; c.y = 300; } });
        window.__cam = c => {
          const k = this.lt/4, sh = Math.max(0, 1 - (this.lt - 1.7)*1.4)*(this.lt > 1.7 ? .25 : 0);
          look(c, 2600*g.S - 5.5 + k*1.2 + (Math.random() - .5)*sh, 1.1 + (Math.random() - .5)*sh, 780*g.S + 4.5 - k*.8, 2600*g.S, .8, 780*g.S);
        };
      }, each() {
        const g = G(), lt = this.lt;
        if (lt > .8 && this.n === 0) { this.n = 1; g.carDamage(this.car, 't1', 999, g.player); }
        if (lt > 1.7 && this.n === 1) { this.n = 2; g.carDamage(this.car, 'b', 999, g.player); }
      } },
    // building
    { t0:28, t1:32, word:'BUILD', setup() {
        const g = start('b:highway', { cheats:{ freeze:true } }); window.__cam = null; hud(true);
        const p = g.player; park(p, 2500, 868); p.ang = 0; p.pitch = -.22;
        for (const e of g.ents) if (!e.isPlayer) park(e, 6200, 300);
        g.CARS.forEach((c, i) => { c.x = 5000 + i*300; c.y = 300; });
        g.toggleBuild(true); g.pickBuild(1); this.n = 0;
      }, each() {
        const g = G(), p = g.player, lt = this.lt;
        const plan = [[.35, 1, .05], [1.0, 2, .7], [1.65, 3, -.65], [2.4, 0, -1.25]];
        const st = plan[this.n];
        if (st) { turn(p, st[2], .25); if (lt > st[0]) { g.pickBuild(st[1]); p.ang = st[2]; g.placeBuild(); this.n++; } }
      } },
    // team fight in the market, camera circling
    { t0:32, t1:38, line:'2v2 TO 8v8  ·  FFA DUOS', setup() {
        const g = start('b:market', { team:4 }); hud(false);
        const p = g.player; park(p, 1360, 1460);
        g.ents.filter(e => !e.isPlayer).forEach((e, i) => park(e, e.team === p.team ? 1000 + (i % 3)*40 : 1720 - (i % 4)*40, 1200 + (i*67) % 320));
        window.__cam = c => { const a = .6 + this.lt*.22, R = 13; look(c, 34 + Math.cos(a)*R, 6.5, 34 + Math.sin(a)*R, 34, 1, 34); };
      } },
    // build-your-own and voice
    { t0:38, t1:42, line:'MAKE MAPS IN BLENDER  ·  PROXIMITY VOICE  ·  TEAM RADIO', setup() {
        const g = start('b:frost', { cheats:{ freeze:true } }); hud(false); park(g.player, 60, 60);
        window.__cam = c => { const k = this.lt/4; look(c, 8 + k*40, 2.2 + k*2.5, 46 - k*14, 30 + k*30, 1.5, 24 - k*4); };
      } },
    // end card
    { t0:42, t1:48, setup() {
        const g = start('bay4', { cheats:{ freeze:true } }); hud(false); park(g.player, 60, 60);
        window.__cam = c => { const a = this.lt*.08; look(c, 25 + Math.cos(a)*16, 7, 17.5 + Math.sin(a)*11, 25, 1, 17.5); };
      } },
  ];
  // title cards: [from, to, kind, text]
  const TITLES = [
    [.6, 2.7, 'small', 'SCRATCHIE018 PRESENTS'],
    [5.6, 8.0, 'logo', 'Drift And Bolt'], [6.5, 8.0, 'tag', 'KARAMBITS  ·  AWPS  ·  CARS'],
    [42.4, 48, 'logo', 'Drift And Bolt'], [43.4, 48, 'tag', 'PLAY FREE IN YOUR BROWSER'], [44.2, 48, 'url', 'scratchie018.github.io/bay4'],
  ];
  function overlay(t) {
    const host = $('tt'), parts = [];
    const fade = (a, b, f = .3) => Math.min(ease((t - a)/f), ease((b - t)/f));
    if (t < 3) parts.push(['shade', '', 1]);
    if (t >= 42) parts.push(['shade', '', .55*ease((t - 42)/.6)]);
    if (t > 47.2) parts.push(['shade', '', ease((t - 47.2)/.8)]);
    for (const [a, b, kind, text] of TITLES) if (t >= a && t < b) parts.push([kind, text, fade(a, b, kind === 'logo' ? .5 : .35)]);
    const s = SHOTS.find(s => t >= s.t0 && t < s.t1);
    if (s && s.word && t < s.t0 + 2.2) parts.push(['word', s.word, fade(s.t0 + .15, s.t0 + 2.2, .25)]);
    if (s && s.line) parts.push(['line', s.line, fade(s.t0 + .3, s.t1 - .1, .35)]);
    host.replaceChildren(...parts.map(([k, text, op]) => {
      const d = document.createElement('div'); d.className = k; d.style.opacity = op;
      if (k === 'word') { d.append(text, document.createElement('i')); d.style.transform = `translateX(${(1 - op)*-40}px)`; }
      else d.textContent = text;
      if (k === 'logo') d.style.transform = `translate(-50%,-50%) scale(${1.12 - .12*op})`;
      return d;
    }));
  }
  let cur = null;
  window.__frame = async i => {
    window.__vt.on = true;
    T = i/FPS;
    const s = SHOTS.find(s => T >= s.t0 && T < s.t1) || SHOTS[SHOTS.length - 1];
    if (s !== cur) { cur = s; s.lt = 0; G().keys.clear(); s.setup.call(s); }
    s.lt = T - s.t0;
    if (s.each) s.each.call(s);
    overlay(T);
    window.__vt.step(1000/FPS);
    return 1;
  };
  window.__length = 48;
})();
