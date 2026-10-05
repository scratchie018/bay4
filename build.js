/* ---------- building ----------
   B opens build mode: 1 wall, 2 ramp, 3 spike strip, 4 oil slick; T or the mouse wheel turns it, click places it.
   In a car you can drop spikes and oil behind you. Up to 10 pieces each; an 11th replaces your oldest.
   Walls block people, cars and bullets and can be broken. Ramps can be run up and launch cars.
   Online: everyone shares their own pieces (presence `bd`) and the damage they do to others' (presence `be`). */
const BUILD_TYPES = [
  { k:'wall',   name:'WALL',   w:84, d:14,  ht:2.4,  hp:220, solid:true },
  { k:'ramp',   name:'RAMP',   w:84, d:170, ht:1.7,  hp:160 },
  { k:'spikes', name:'SPIKES', w:84, d:26,  ht:.12,  hp:90 },
  { k:'oil',    name:'OIL',    w:130, d:130, ht:.012, hp:60 },
];
const BUILD_MAX = 10;
let BUILT = [], BASE_RECTS = null, BASE_PLATS = null, buildMeshes = [];
const BLD = { on:false, type:0, turn:0, ghost:null, ghostType:-1, cd:0, seq:0, ok:false, spot:null };
const bmats = {};
const bmat = (c, op = 1) => bmats[c + op] || (bmats[c + op] = new THREE.MeshStandardMaterial({ color:c, roughness:.8, flatShading:true, transparent:op < 1, opacity:op, depthWrite:op >= 1 }));
// footprint in map pixels: pieces face one of four directions; `d` runs along the facing direction
function buildRect(b) {
  const T = BUILD_TYPES[b.t], along = b.rot % 2 === 0, w = along ? T.d : T.w, h = along ? T.w : T.d;
  return { x:b.x - w/2, y:b.y - h/2, w, h };
}
const buildDir = rot => [[1, 0], [0, 1], [-1, 0], [0, -1]][rot & 3];
function rampHeight(b, x, y) {
  const r = buildRect(b), [dx, dy] = buildDir(b.rot), T = BUILD_TYPES[b.t];
  if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return null;
  const t = dx ? (dx > 0 ? (x - r.x)/r.w : (r.x + r.w - x)/r.w) : (dy > 0 ? (y - r.y)/r.h : (r.y + r.h - y)/r.h);
  return T.ht*clamp(t, 0, 1);
}
function buildMesh(b, ghost = false) {
  const T = BUILD_TYPES[b.t], g = new THREE.Group(), tint = new THREE.Color(b.color || '#a07850');
  const wood = bmat('#' + new THREE.Color('#8a6a45').lerp(tint, .25).getHexString());
  if (T.k === 'wall') {
    const m = new THREE.Mesh(new THREE.BoxGeometry(T.d*S, T.ht, T.w*S), wood); m.position.y = T.ht/2; g.add(m);
    for (const y of [.5, 1.2, 1.9]) { const s = new THREE.Mesh(new THREE.BoxGeometry(T.d*S + .02, .07, T.w*S + .02), bmat('#5a442c')); s.position.y = y; g.add(s); }
    const band = new THREE.Mesh(new THREE.BoxGeometry(T.d*S + .03, .12, T.w*S + .03), bmat('#' + tint.getHexString())); band.position.y = T.ht - .12; g.add(band);
  } else if (T.k === 'ramp') {
    // a wedge rising along +x (the facing direction before rotation)
    const L = T.d*S, Wd = T.w*S, H = T.ht, sh = new THREE.Shape(); sh.moveTo(-L/2, 0); sh.lineTo(L/2, 0); sh.lineTo(L/2, H); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth:Wd, bevelEnabled:false }); geo.translate(0, 0, -Wd/2);
    g.add(new THREE.Mesh(geo, wood));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L*1.0, .03, .14), bmat('#' + tint.getHexString())); stripe.position.set(0, H/2 + .02, 0); stripe.rotation.z = Math.atan2(H, L); g.add(stripe);
  } else if (T.k === 'spikes') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(T.d*S, .04, T.w*S), bmat('#2a2c30')); base.position.y = .02; g.add(base);
    const cone = new THREE.ConeGeometry(.05, .12, 4);
    for (let i = 0; i < 12; i++) for (const zz of [-.18, .18]) { const c = new THREE.Mesh(cone, bmat('#b8c0c8')); c.position.set(zz*.9, .1, -T.w*S/2 + .15 + i*(T.w*S - .3)/11); g.add(c); }
  } else {
    const m = new THREE.Mesh(new THREE.CircleGeometry(T.w*S/2, 18), new THREE.MeshStandardMaterial({ color:0x0b0b0d, roughness:.08, metalness:.4, transparent:true, opacity:.85, depthWrite:false }));
    m.rotation.x = -Math.PI/2; m.position.y = .012; g.add(m);
    const sheen = new THREE.Mesh(new THREE.RingGeometry(T.w*S*.18, T.w*S*.3, 18), new THREE.MeshBasicMaterial({ color:0x4a3f7a, transparent:true, opacity:.35, depthWrite:false }));
    sheen.rotation.x = -Math.PI/2; sheen.position.y = .014; g.add(sheen);
  }
  const gy = groundAt(b.x, b.y, .4); g.position.set(b.x*S, gy > 0 ? gy : 0, b.y*S); g.rotation.y = -b.rot*Math.PI/2;
  if (!ghost && (T.k === 'wall' || T.k === 'ramp')) g.traverse(o => { if (o.isMesh) { o.userData = { build:b }; buildMeshes.push(o); } });
  return g;
}
function addBuild(b) {
  b.hp = b.hp ?? BUILD_TYPES[b.t].hp; b.mesh = buildMesh(b); scene.add(b.mesh);
  BUILT.push(b); refreshBuildSolids();
  return b;
}
function removeBuild(b, smash) {
  if (!BUILT.includes(b)) return;
  BUILT = BUILT.filter(x => x !== b);
  if (b.mesh) { scene.remove(b.mesh); buildMeshes = buildMeshes.filter(m => m.userData.build !== b); }
  if (smash) {
    const T = BUILD_TYPES[b.t];
    for (let i = 0; i < 14; i++) fxBox(i % 3 ? '#8a6a45' : '#5a442c', 1, b.x*S + rand(-.8, .8), rand(.2, T.ht), b.y*S + rand(-.8, .8), rand(.12, .3), rand(-3, 3), rand(2, 5), rand(-3, 3), rand(1, 2), 14, 0);
    sfx('thud', clamp(1.2 - Math.hypot(b.x - player.x, b.y - player.y)/1500, .1, .8));
  }
  refreshBuildSolids();
}
function clearBuilds() { for (const b of [...BUILT]) removeBuild(b); BUILT = []; BASE_RECTS = BASE_PLATS = null; }
function setupBuild() { clearBuilds(); BASE_RECTS = RECTS.slice(); BASE_PLATS = PLATS.slice(); BLD.on = false; BLD.seq = 0; showGhost(false); }
// walls join the map's solids so movement, bots, line of sight and cars all respect them
function refreshBuildSolids() {
  if (!BASE_RECTS) return;
  const walls = BUILT.filter(b => BUILD_TYPES[b.t].solid).map(b => ({ ...buildRect(b), ht:BUILD_TYPES[b.t].ht, build:b }));
  RECTS = BASE_RECTS.concat(walls);
  PLATS = BASE_PLATS.concat(walls.map(r => ({ x:r.x, y:r.y, w:r.w, h:r.h, y0:0, ht:r.ht, build:r.build })));
  NAV = null;
}
// damage a piece; online the damage is shared so the owner (and everyone) sees it
function buildDamage(b, dmg, by, fromNet) {
  if (!b || !(dmg > 0) || !BUILT.includes(b)) return;
  if (NET.on && !fromNet && b.owner !== NET.myPeer) { NET.be.push({ q:++NET.seq, o:b.owner, id:b.id, dm:Math.round(dmg) }); if (NET.be.length > 8) NET.be.shift(); }
  b.hp -= dmg;
  if (by === player) hitMark(b.hp <= 0);
  if (b.hp <= 0) removeBuild(b, true);
}
function myBuilds() { return BUILT.filter(b => b.mine); }
// where the selected piece would go: 2.4 m in front of you (behind the car if you're in one), snapped to a 20 px grid
function buildSpot() {
  const p = player, T = BUILD_TYPES[BLD.type];
  let x, y, rot;
  if (p.inCar) {
    const car = p.inCar, back = CAR.len/2 + T.d/2 + 30;
    x = car.x - Math.cos(car.ang)*back; y = car.y - Math.sin(car.ang)*back;
    rot = (Math.round(car.ang/(Math.PI/2)) % 4 + 4) % 4;
  } else {
    const a = p.ang, dist = 96 + T.d/2;
    x = p.x + Math.cos(a)*dist; y = p.y + Math.sin(a)*dist;
    rot = ((Math.round(a/(Math.PI/2)) + BLD.turn) % 4 + 4) % 4;
  }
  x = Math.round(x/20)*20; y = Math.round(y/20)*20;
  const b = { t:BLD.type, x, y, rot }, r = buildRect(b);
  let ok = r.x > 10 && r.y > 10 && r.x + r.w < W - 10 && r.y + r.h < H - 10;
  if (ok && (T.solid || T.k === 'ramp')) {
    if (RECTS.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)) ok = false;
    if (ents.some(e => e.alive && !e.inCar && e.x > r.x - e.r && e.x < r.x + r.w + e.r && e.y > r.y - e.r && e.y < r.y + r.h + e.r)) ok = false;
    if (CARS.some(c => carGap(c, x, y) < Math.max(r.w, r.h)/2)) ok = false;
  }
  if (ok && BUILT.some(o => o.t === b.t && Math.abs(o.x - x) < 10 && Math.abs(o.y - y) < 10)) ok = false;
  return { b, ok };
}
function placeBuild() {
  if (!BLD.on || BLD.cd > 0 || !player.alive) return;
  const { b, ok } = buildSpot();
  if (!ok) { sfx('click', .6); return; }
  const mine = myBuilds();
  if (mine.length >= BUILD_MAX) removeBuild(mine[0]);
  b.id = ++BLD.seq; b.mine = true; b.owner = NET.on ? NET.myPeer : 'me'; b.ownerEnt = player; b.color = TEAM ? TEAMS[player.team].color : (NET.on ? NET.color : '#e0b25a');
  addBuild(b); BLD.cd = .45; sfx('thud', .5);
}
function showGhost(on) {
  if (!on || !BLD.on) { if (BLD.ghost) BLD.ghost.visible = false; return; }
  if (BLD.ghostType !== BLD.type) {
    if (BLD.ghost) scene.remove(BLD.ghost);
    BLD.ghost = buildMesh({ t:BLD.type, x:0, y:0, rot:0, color:'#ffffff' }, true);
    BLD.ghost.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color:0x6fd36f, transparent:true, opacity:.4, depthWrite:false }); o.userData = {}; } });
    scene.add(BLD.ghost); BLD.ghostType = BLD.type;
  }
  const { b, ok } = buildSpot();
  BLD.ghost.visible = true; BLD.ghost.position.set(b.x*S, 0, b.y*S); BLD.ghost.rotation.y = -b.rot*Math.PI/2;
  BLD.ghost.traverse(o => { if (o.isMesh) o.material.color.setHex(ok ? 0x6fd36f : 0xe5484d); });
}
function toggleBuild(on) {
  BLD.on = on ?? !BLD.on;
  if (BLD.on && player.inCar && BLD.type < 2) BLD.type = 2;
  if (BLD.on) { player.zoom = 0; player.swing = null; }
  showGhost(BLD.on); touchKey = '';
}
function pickBuild(i) {
  if (player.inCar && i < 2) return;
  BLD.type = i; BLD.on = true; showGhost(true); touchKey = '';
}
// spikes pop tires and hurt people on foot; oil spins cars out and makes people slide
function updBuild(dt) {
  BLD.cd -= dt;
  if (BLD.on && (!player.alive || (player.inCar && player.seat === 0 && BLD.type < 2))) toggleBuild(false);
  showGhost(BLD.on && player.alive);
  for (const b of BUILT) {
    const T = BUILD_TYPES[b.t]; if (T.k !== 'spikes' && T.k !== 'oil') continue;
    const r = buildRect(b), inside = (x, y, pad = 0) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad;
    for (const car of CARS) {
      if (car.wreck || Math.abs(car.h) > .5 || Math.hypot(car.x - b.x, car.y - b.y) > 260) continue;
      if (T.k === 'oil') { if (inside(car.x, car.y, 20) && Math.abs(car.v) > 60) car.oilT = 1.4; continue; }
      // only the car's own simulator pops its tires (the driver, or me if nobody drives it)
      const local = car.driver ? car.driver === player || !car.driver.remote : !NET.on || car.auth === NET.myPeer;
      if (!local) continue;
      const c = Math.cos(car.ang), s = Math.sin(car.ang);
      [[58, -34], [58, 34], [-56, -34], [-56, 34]].forEach(([u, v], i) => {
        if (car.hp.t[i] > 0 && inside(car.x + c*u - s*v, car.y + s*u + c*v)) carDamage(car, 't' + i, 999, b.ownerEnt || null);
      });
    }
    for (const e of ents) {
      if (!e.alive || e.inCar || e.remote || (e.jumpY || 0) > .3 || !inside(e.x, e.y)) continue;
      if (T.k === 'oil') { e.oilT = .25; continue; }
      if (!b.ownerEnt || b.ownerEnt === e || !enemy(b.ownerEnt, e)) continue;
      if ((e.spikeT || 0) < perfNow) { e.spikeT = perfNow + .8; damage(b.ownerEnt || e, e, 25, { weapon:'knife' }); }
    }
  }
}
// knife swings chip at walls and ramps in front of you
function knifeBuilds(e, type) {
  const reach = SPEC[type].range + 24, x = e.x + Math.cos(e.ang)*reach*.7, y = e.y + Math.sin(e.ang)*reach*.7;
  for (const b of BUILT) {
    const T = BUILD_TYPES[b.t]; if (!T.solid && T.k !== 'ramp') continue;
    const r = buildRect(b);
    if (x > r.x - 18 && x < r.x + r.w + 18 && y > r.y - 18 && y < r.y + r.h + 18) { buildDamage(b, type === 'stab' ? 45 : 30, e); sfx('hit', .5); return true; }
  }
  return false;
}
// online: share my pieces, mirror everyone else's
function buildNetState() { return myBuilds().map(b => [b.id, b.t, Math.round(b.x), Math.round(b.y), b.rot, Math.max(0, Math.round(b.hp))]); }
function readBuildNet(p, pr, e, seen) {
  const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;
  if (Array.isArray(pr.bd)) {
    const want = new Map();
    for (const s of pr.bd.slice(0, BUILD_MAX)) if (Array.isArray(s)) want.set(num(s[0]) | 0, s);
    for (const b of BUILT.filter(b => b.owner === p.peer)) {
      const s = want.get(b.id);
      if (!s) removeBuild(b, b.hp > 0 && b.hp < BUILD_TYPES[b.t].hp);
      else { b.hp = Math.min(b.hp, num(s[5], b.hp)); if (b.hp <= 0) removeBuild(b, true); want.delete(b.id); }
    }
    for (const [id, s] of want) {
      const t = clamp(num(s[1]) | 0, 0, BUILD_TYPES.length - 1), hp = num(s[5], BUILD_TYPES[t].hp);
      if (hp <= 0) continue;
      addBuild({ id, t, x:clamp(num(s[2]), 0, W), y:clamp(num(s[3]), 0, H), rot:num(s[4]) & 3, hp, owner:p.peer, ownerEnt:e, color:e.color });
    }
  }
  if (Array.isArray(pr.be)) for (const h of pr.be.slice(-8)) {
    const q = num(h && h.q) | 0; if (q <= seen.be) continue; seen.be = q;
    const owner = h.o === NET.myPeer ? NET.myPeer : h.o;
    const b = BUILT.find(x => x.owner === owner && x.id === (num(h.id) | 0));
    if (b) buildDamage(b, clamp(num(h.dm), 0, 999), e, true);
  }
}
function dropPeerBuilds(peer) { for (const b of BUILT.filter(b => b.owner === peer)) removeBuild(b); }
function buildHudText() {
  if (!BLD.on) return '';
  const types = BUILD_TYPES.map((T, i) => `<span class="${i === BLD.type ? 'on' : ''}${player.inCar && i < 2 ? ' off' : ''}">${i + 1} ${T.name}</span>`).join('');
  return `<b>BUILD</b> ${types} <span class="n">${myBuilds().length}/${BUILD_MAX}</span>` + (touchMode ? '' : ' <span class="k">click place · T turn · B done</span>');
}
