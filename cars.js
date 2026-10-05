/* ---------- cars ----------
   Drivable cars, simulated in map pixels like everything else (front of the car = its heading).
   Seats: 0 driver (front left), 1 front right, 2 rear left, 3 rear right. Each seat has a door that shields it
   until the door is blown off. Tires (0 FL, 1 FR, 2 RL, 3 RR) go flat and ruin the handling; the engine takes
   the rest and the car explodes at zero, killing whoever is inside.
   Online: whoever drives a car owns its movement and shares it (presence `vs`), damage is shared as events
   (presence `ce`), and the last driver keeps sharing where they left it so late joiners see it parked there. */
const CAR = { len:182, wid:80, maxF:1000, maxR:320, acc:650, brake:1700, coast:320, steer:.6, wb:118, eng:400, tire:60, door:80, respawn:12 };
const PAINTS = ['#c9ced3', '#1e2226', '#2f6b3a', '#a3222c', '#d8b13a', '#2c4f8a'];
const SEATS = [[6, -20], [6, 20], [-36, -20], [-36, 20]];   // car-local px: forward, right
const CAR_PARTS = { b:'body', t0:'front left tire', t1:'front right tire', t2:'rear left tire', t3:'rear right tire', d0:'driver door', d1:'front right door', d2:'rear left door', d3:'rear right door' };
let CARS = [], carsOn = store.get('hr-cars', '1') !== '0';
let carTplP = null, carHitMeshes = [];
const carCam = { yaw:0, pitch:0, t:0 };
let touchHandbrake = false;

// load car.glb once and turn it so its front faces +X, sits on the ground and is 4.55 m long, with pivots for each wheel
function loadCarModel() {
  if (carTplP) return carTplP;
  carTplP = new Promise(res => {
    if (!gltfLoader) { res(null); return; }
    gltfLoader.load('car.glb', g => { try { res(prepCarModel(g.scene || g.scenes[0])); } catch (e) { res(null); } }, undefined, () => res(null));
  });
  return carTplP;
}
function prepCarModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  let front = null;
  root.traverse(o => { if (!front && o.isMesh && o.material && /front.?light/i.test(o.material.name)) front = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()); });
  if (!front) front = c.clone().add(new THREE.Vector3(size.x >= size.z ? 1 : 0, 0, size.x >= size.z ? 0 : 1));
  const yaw = size.x >= size.z ? (front.x > c.x ? 0 : Math.PI) : (front.z > c.z ? Math.PI/2 : -Math.PI/2);
  const k = CAR.len*S/Math.max(size.x, size.z);
  const tpl = new THREE.Group(), turn = new THREE.Group(), lift = new THREE.Group();
  turn.rotation.y = yaw; turn.scale.setScalar(k); lift.position.set(-c.x, -box.min.y, -c.z);
  lift.add(root); turn.add(lift); tpl.add(turn); tpl.updateMatrixWorld(true);
  const wheels = [];
  const found = []; tpl.traverse(o => { if (/wheel$/i.test(o.name) && !o.isMesh) found.push(o); });
  for (const node of found) {
    const wb = new THREE.Box3().setFromObject(node), wc = wb.getCenter(new THREE.Vector3()), r = Math.max(.15, (wb.max.y - wb.min.y)/2);
    const steer = new THREE.Group(), spin = new THREE.Group(); steer.position.copy(wc); steer.add(spin); tpl.add(steer); tpl.updateMatrixWorld(true);
    spin.attach(node);
    const idx = (wc.x > 0 ? 0 : 2) + (wc.z > 0 ? 1 : 0);
    steer.name = 'steer' + idx; spin.name = 'spin' + idx;
    wheels[idx] = { x:wc.x, y:wc.y, z:wc.z, r };
  }
  // fully metallic paint renders black without reflections to show, so keep it mostly diffuse
  tpl.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; const m = o.material; if (m && m.metalness > .3) { m.metalness = .3; m.roughness = Math.max(m.roughness, .35); } } });
  return { g:tpl, wheels };
}
// a plain box car for when car.glb can't be loaded (running from a file, offline)
function boxCarModel() {
  const g = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ color:0xc9ced3, roughness:.4, metalness:.5 }); paint.name = 'CarPaint';
  const dark = new THREE.MeshStandardMaterial({ color:0x111316, roughness:.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, .6, 1.9), paint); body.position.y = .65; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.1, .5, 1.6), dark); cab.position.set(-.3, 1.2, 0); g.add(cab);
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? 1.45 : -1.4, z = i % 2 ? .82 : -.82, steer = new THREE.Group(), spin = new THREE.Group();
    steer.position.set(x, .34, z); steer.name = 'steer' + i; spin.name = 'spin' + i;
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .26, 10), dark); w.rotation.x = Math.PI/2; spin.add(w); steer.add(spin); g.add(steer);
    wheels[i] = { x, y:.34, z, r:.34 };
  }
  return { g, wheels };
}
function seedRand(str) { let h = 1779033703; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return ((h ^= h >>> 16) >>> 0)/4294967296; }; }
// open places to park, the same on every computer for the same map
function carSpots(n) {
  const rnd = seedRand(String(currentMap.id)), step = Math.max(40, Math.round(Math.sqrt(W*H/1500)/20)*20), out = [];
  const blocked = (x, y) => x < 40 || y < 40 || x > W - 40 || y > H - 40 || inRect(x, y, 18) || PLATS.some(r => r.ht > .2 && x > r.x - 18 && x < r.x + r.w + 18 && y > r.y - 18 && y < r.y + r.h + 18);
  const cands = [];
  for (let y = 100; y < H - 100; y += step) for (let x = 100; x < W - 100; x += step) for (const a of [0, Math.PI/2]) {
    if (SPAWNS.some(s => Math.hypot((s.x ?? s[0]) - x, (s.y ?? s[1]) - y) < 150)) continue;
    const c = Math.cos(a), s = Math.sin(a); let ok = true;
    for (let u = -CAR.len/2 - 10; u <= CAR.len/2 + 10 && ok; u += 26) for (let v = -CAR.wid/2 - 10; v <= CAR.wid/2 + 10 && ok; v += 22) if (blocked(x + c*u - s*v, y + s*u + c*v)) ok = false;
    if (ok) cands.push({ x, y, a:a + (rnd() < .5 ? Math.PI : 0) });
  }
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd()*(i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  for (const gap of [520, 320, 200]) for (const c of cands) { if (out.length >= n) break; if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) > gap)) out.push(c); }
  return out.slice(0, n);
}
function clearCars() {
  for (const car of CARS) if (car.mesh) scene.remove(car.mesh);
  CARS = []; carHitMeshes = [];
}
function setupCars() {
  clearCars();
  if (!carsOn) return;
  const n = clamp(Math.round(W*H/1.4e6), 2, 4);
  carSpots(n).forEach((s, i) => {
    const car = { i, x:s.x, y:s.y, ang:s.a, h:0, vh:0, v:0, steer:0, home:{ ...s }, paint:PAINTS[i % PAINTS.length], driver:null, ver:0, auth:null, snaps:[],
      hp:{ eng:CAR.eng, t:[CAR.tire, CAR.tire, CAR.tire, CAR.tire], d:[CAR.door, CAR.door, CAR.door, CAR.door] }, wreck:0, boostT:0, boostCd:0, wheelRot:0, smokeT:0, mesh:null, parts:null };
    car.h = Math.max(0, groundAt(car.x, car.y, 1));
    CARS.push(car);
  });
  loadCarModel().then(tpl => { const m = tpl || boxCarModel(); for (const car of CARS) if (!car.mesh) buildCarMesh(car, m); });
}
function buildCarMesh(car, tpl) {
  const g = new THREE.Group(), body = tpl.g.clone(true); g.add(body);
  const mats = [];
  body.traverse(o => { if (o.isMesh && o.material && /paint/i.test(o.material.name)) { o.material = o.material.clone(); o.material.color.set(car.paint); mats.push(o.material); } });
  const wheels = [0, 1, 2, 3].map(i => ({ steer:body.getObjectByName('steer' + i), spin:body.getObjectByName('spin' + i), base:tpl.wheels[i] }));
  // invisible boxes that bullets and blades hit: the body, each door and each tire
  const hb = (part, w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.visible = false; m.position.set(x, y, z); m.userData = { car, part }; g.add(m); carHitMeshes.push(m); return m; };
  hb('b', 4.4, .55, 1.86, 0, .7, 0);
  hb('d0', 1.1, .7, .1, .35, .68, -.98); hb('d1', 1.1, .7, .1, .35, .68, .98); hb('d2', 1.0, .7, .1, -.8, .68, -.98); hb('d3', 1.0, .7, .1, -.8, .68, .98);
  for (let i = 0; i < 4; i++) { const w = tpl.wheels[i] || { x:i < 2 ? 1.45 : -1.4, y:.34, z:i % 2 ? .85 : -.85, r:.34 }; hb('t' + i, .7, .7, .32, w.x, w.r, w.z); }
  scene.add(g);
  car.mesh = g; car.parts = { mats, wheels };
  if (car.wreck) wreckLook(car, true);
}
const carVel = car => [Math.cos(car.ang)*car.v, Math.sin(car.ang)*car.v];
function seatPos(car, s) { const [u, v] = SEATS[s], c = Math.cos(car.ang), sn = Math.sin(car.ang); return [car.x + c*u - sn*v, car.y + sn*u + c*v]; }
// how far a point is outside the car's box (negative = inside), plus the point in car coordinates
function carLocal(car, x, y) { const dx = x - car.x, dy = y - car.y, c = Math.cos(car.ang), s = Math.sin(car.ang); return [dx*c + dy*s, -dx*s + dy*c]; }
function carGap(car, x, y) { const [u, v] = carLocal(car, x, y); const ox = Math.abs(u) - CAR.len/2, oy = Math.abs(v) - CAR.wid/2; return ox > 0 || oy > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oy, 0)) : Math.max(ox, oy); }
const carAt = (x, y, pad) => CARS.some(car => carGap(car, x, y) < pad);
const shielded = e => !!(e.inCar && !e.inCar.wreck && e.inCar.hp.d[e.seat] > 0);
function seatTaken(car, s) { return ents.some(e => e.inCar === car && e.seat === s && e.alive && !e.gone); }
function nearCar(e) {
  let best = null, bd = 70;
  for (const car of CARS) { if (car.wreck) continue; const d = carGap(car, e.x, e.y); if (d < bd) { bd = d; best = car; } }
  return best;
}
function enterCar(e, car, s) {
  e.inCar = car; e.seat = s; e.swing = null; e.zoom = 0; e.dashT = 0; e.mantle = null; e.inspect = 0; e.wantJump = false;
  if (s === 0) { car.driver = e; if (e.isPlayer) { car.ver++; car.auth = NET.on ? NET.myPeer : 'me'; carCam.yaw = 0; carCam.pitch = 0; } }
  if (e.isPlayer) { if (s > 0) e.ang = car.ang; sfx('door', .6); }
}
function exitCar(e, quiet) {
  const car = e.inCar; if (!car) return;
  if (car.driver === e) car.driver = null;
  const side = SEATS[e.seat][1] < 0 ? -1 : 1, out = CAR.wid/2 + e.r + 8, c = Math.cos(car.ang), s = Math.sin(car.ang);
  const tries = [[SEATS[e.seat][0], side*out], [SEATS[e.seat][0], -side*out], [-CAR.len/2 - e.r - 8, 0], [CAR.len/2 + e.r + 8, 0]];
  let pos = null;
  for (const [u, v] of tries) { const x = car.x + c*u - s*v, y = car.y + s*u + c*v; if (x > e.r + 8 && y > e.r + 8 && x < W - e.r - 8 && y < H - e.r - 8 && !inRect(x, y, e.r)) { pos = [x, y]; break; } }
  if (!pos) pos = seatPos(car, e.seat);
  if (e.isPlayer && e.seat === 0) e.ang = car.ang + carCam.yaw;
  e.x = pos[0]; e.y = pos[1]; [e.vx, e.vy] = carVel(car).map(v => v*.4);
  e.jumpY = Math.max(0, car.h); e.jumpV = 0; e.inCar = null; e.seat = -1;
  if (e.isPlayer && !quiet) sfx('door', .6);
}
function tryCar() {
  const p = player; if (!p || !p.alive || state !== 'play') return;
  if (p.inCar) { exitCar(p); return; }
  const car = nearCar(p); if (!car) return;
  const s = [0, 1, 2, 3].find(i => !seatTaken(car, i));
  if (s === undefined) { callout('CAR FULL', ''); return; }
  enterCar(p, car, s);
}
function nextSeat() {
  const p = player, car = p.inCar; if (!car) return;
  for (let k = 1; k < 4; k++) { const s = (p.seat + k) % 4; if (!seatTaken(car, s)) { const was = p.seat; if (car.driver === p) car.driver = null; p.seat = -1; enterCar(p, car, s); if (was === 0) p.ang = car.ang; return; } }
}
function carBoost() {
  const car = player.inCar; if (!car || car.driver !== player || car.boostCd > 0 || car.wreck) return;
  car.boostT = 2; car.boostCd = 8; sfx('dash', 1); shake = Math.max(shake, 2);
}
function carInputs() {
  let thr = 0, st = 0;
  if (touchMode && Math.hypot(stick.dx, stick.dy) > .15) { thr = clamp(-stick.dy*1.3, -1, 1); st = clamp(stick.dx*1.3, -1, 1); }
  else {
    if (keys.has('KeyW') || keys.has('ArrowUp')) thr++; if (keys.has('KeyS') || keys.has('ArrowDown')) thr--;
    if (keys.has('KeyD') || keys.has('ArrowRight')) st++; if (keys.has('KeyA') || keys.has('ArrowLeft')) st--;
  }
  return { thr, st, hb:keys.has('Space') || touchHandbrake };
}
// arcade handling: speed along the heading, bicycle-model turning, flat tires pull and slow, a hurt engine loses power
function driveCar(car, dt, inp) {
  const flat = car.hp.t.map(h => h <= 0), nflat = flat.filter(Boolean).length;
  let maxF = CAR.maxF*(car.hp.eng < CAR.eng*.35 ? .7 : 1)*(1 - .14*nflat), acc = CAR.acc*(1 - .1*nflat);
  if (car.boostT > 0) { maxF *= 1.45; acc *= 2.2; }
  const v = car.v, sg = Math.sign(v);
  if (inp.thr > 0) car.v += v < 0 ? CAR.brake*inp.thr*dt : acc*inp.thr*dt*(1 - .5*clamp(v/maxF, 0, 1));
  else if (inp.thr < 0) car.v -= v > 0 ? CAR.brake*-inp.thr*dt : acc*.6*-inp.thr*dt;
  else car.v -= sg*Math.min(Math.abs(v), CAR.coast*dt);
  if (inp.hb) car.v -= Math.sign(car.v)*Math.min(Math.abs(car.v), 1100*dt);
  if (car.v > maxF) car.v -= Math.min(car.v - maxF, 900*dt);
  car.v = Math.max(car.v, -CAR.maxR);
  const pull = ((flat[1] ? 1 : 0) + (flat[3] ? 1 : 0) - (flat[0] ? 1 : 0) - (flat[2] ? 1 : 0))*.07;
  const want = inp.st*CAR.steer*(1 - .55*clamp(Math.abs(car.v)/1000, 0, 1)) + pull*clamp(Math.abs(car.v)/300, 0, 1);
  car.steer += (want - car.steer)*Math.min(1, dt*8);
  const before = car.ang;
  car.ang += car.v/CAR.wb*Math.tan(car.steer)*(inp.hb ? 1.5 : 1)*(1 - .12*nflat)*dt;
  moveCar(car, dt);
  return car.ang - before;
}
function coastCar(car, dt) {
  car.v -= Math.sign(car.v)*Math.min(Math.abs(car.v), 900*dt); car.steer *= .9;
  moveCar(car, dt);
}
function moveCar(car, dt) {
  car.x += Math.cos(car.ang)*car.v*dt; car.y += Math.sin(car.ang)*car.v*dt;
  const mine = car.driver ? car.driver.isPlayer || !car.driver.remote : true;
  // walls: three circles along the car
  const c = Math.cos(car.ang), s = Math.sin(car.ang), R = 41;
  let hit = 0, px = 0, py = 0;
  for (const off of [-60, 0, 60]) {
    const cx = car.x + c*off, cy = car.y + s*off;
    for (const r of RECTS) {
      const qx = clamp(cx, r.x, r.x + r.w), qy = clamp(cy, r.y, r.y + r.h), dx = cx - qx, dy = cy - qy, d = Math.hypot(dx, dy);
      if (d >= R) continue;
      let ox, oy;
      if (d === 0) { const l = cx - r.x, ri = r.x + r.w - cx, t = cy - r.y, b = r.y + r.h - cy, m = Math.min(l, ri, t, b); ox = m === l ? -(l + R) : m === ri ? ri + R : 0; oy = m === t ? -(t + R) : m === b ? b + R : 0; }
      else { ox = dx/d*(R - d); oy = dy/d*(R - d); }
      if (Math.abs(ox) > Math.abs(px)) px = ox; if (Math.abs(oy) > Math.abs(py)) py = oy; hit = 1;
    }
    const bx = clamp(cx, R + 8, W - R - 8) - cx, by = clamp(cy, R + 8, H - R - 8) - cy;
    if (bx || by) { if (Math.abs(bx) > Math.abs(px)) px = bx; if (Math.abs(by) > Math.abs(py)) py = by; hit = 1; }
  }
  // other cars
  for (const o of CARS) {
    if (o === car) continue;
    if (Math.hypot(o.x - car.x, o.y - car.y) > CAR.len + 20) continue;
    for (const a of [-60, 0, 60]) for (const b of [-60, 0, 60]) {
      const ax = car.x + c*a, ay = car.y + s*a, bx2 = o.x + Math.cos(o.ang)*b, by2 = o.y + Math.sin(o.ang)*b, dx = ax - bx2, dy = ay - by2, d = Math.hypot(dx, dy);
      if (d >= 2*R || d === 0) continue;
      const push = (2*R - d)/d; if (Math.abs(dx*push) > Math.abs(px)) px = dx*push; if (Math.abs(dy*push) > Math.abs(py)) py = dy*push; hit = 2;
      if (mine && (car.ramT || 0) <= 0) {
        const [ovx, ovy] = carVel(o), [mvx, mvy] = carVel(car), closing = ((mvx - ovx)*-dx + (mvy - ovy)*-dy)/d;
        if (closing > 260) {
          car.ramT = .5; const dmg = (closing - 260)*.12, by = car.driver || player;
          carDamage(o, 'b', dmg, by); if (!o.driver || !o.driver.remote) carDamage(car, 'b', dmg*.6, by);
          o.v *= .5; shake = Math.max(shake, 6); sfx('thud', 1);
        }
      }
    }
  }
  if (hit) {
    const m = Math.hypot(px, py) || 1, into = -(c*px + s*py)/m*Math.sign(car.v), impact = Math.max(0, into)*Math.abs(car.v);
    car.x += px; car.y += py;
    if (impact > 150 && hit === 1) {
      if (mine && (car.ramT || 0) <= 0) { car.ramT = .4; carDamage(car, 'b', (impact - 150)*.04, car.driver || null); if (car.driver === player || player.inCar === car) { shake = Math.max(shake, Math.min(12, impact/80)); sfx('thud', clamp(impact/700, .2, 1)); } }
      car.v = -car.v*.25;
    } else car.v *= .985;
  }
  car.wheelRot += car.v*dt*S/.34;
}
function updCars(dt) {
  const now = performance.now();
  for (const car of CARS) {
    car.boostT -= dt; car.boostCd -= dt; car.ramT = (car.ramT || 0) - dt;
    if (car.wreck) {
      car.wreck -= dt; car.v *= .9;
      if ((car.smokeT -= dt) <= 0) { car.smokeT = .07; carPuff(car, true); }
      if (car.wreck <= 0) respawnCar(car);
      continue;
    }
    const drv = car.driver && car.driver.alive && !car.driver.gone ? car.driver : null;
    if (drv === player) {
      const da = driveCar(car, dt, carInputs());
      if (player.seat > 0) player.ang += da;
    } else if (drv && !drv.remote) driveCar(car, dt, { thr:0, st:0, hb:true });
    else if (car.auth && NET.on && car.auth !== NET.myPeer && car.snaps.length) {
      // someone else drives (or last drove) this car: follow their updates ~110 ms behind
      const rt = now - 110, Sn = car.snaps; let a = Sn[0], b = Sn[Sn.length - 1];
      for (let i = 0; i < Sn.length - 1; i++) if (Sn[i].t <= rt && Sn[i + 1].t >= rt) { a = Sn[i]; b = Sn[i + 1]; break; }
      const k = b.t > a.t ? clamp((rt - a.t)/(b.t - a.t), 0, 1) : 1, before = car.ang;
      car.x = a.x + (b.x - a.x)*k; car.y = a.y + (b.y - a.y)*k; car.ang = a.a + angDiff(b.a, a.a)*k; car.v = a.v + (b.v - a.v)*k; car.steer = b.st || 0;
      car.wheelRot += car.v*dt*S/.34;
      if (player.inCar === car && player.seat > 0) player.ang += angDiff(car.ang, before);
    } else if (Math.abs(car.v) > 1) { const before = car.ang; coastCar(car, dt); if (player.inCar === car && player.seat > 0) player.ang += car.ang - before; }
    // ground: follow ramps and platforms, fall where there is no floor
    const g = groundAt(car.x, car.y, car.h + .5);
    if (g >= car.h - .05) { car.h = g; car.vh = 0; } else { car.vh -= 16*dt; car.h = Math.max(g, car.h + car.vh*dt); }
    const fall = currentMap.data ? clamp(+currentMap.data.fallDepth || 25, 2, 500) : 25;
    if (car.h < -fall) { for (const e of ents) if (e.inCar === car && !e.remote) { exitCar(e, true); fellOut(e); } car.hp.eng = 0; explodeCar(car, null, true); continue; }
    if (car.hp.eng < CAR.eng*.35 && (car.smokeT -= dt) <= 0) { car.smokeT = car.hp.eng < CAR.eng*.15 ? .06 : .14; carPuff(car, car.hp.eng < CAR.eng*.15); }
    if (car.boostT > 0 && Math.random() < .7) carFlame(car);
  }
}
// people in cars sit in their seats (after everyone moved, so remote players' own updates don't pull them out)
function seatOccupants() {
  for (const e of ents) {
    if (!e.inCar) continue;
    if (!CARS.includes(e.inCar) || !e.alive) { e.inCar = null; e.seat = -1; continue; }
    const car = e.inCar; [e.x, e.y] = seatPos(car, e.seat); [e.vx, e.vy] = carVel(car); e.jumpY = car.h;
    if (e.seat === 0 && !e.isPlayer) e.ang = car.ang;
  }
}
// people on foot bump off cars; a fast car I'm driving runs them over
function carContacts(dt) {
  for (const car of CARS) {
    const mine = car.driver === player && !car.wreck, sp = Math.abs(car.v);
    for (const e of ents) {
      if (!e.alive || e.inCar || e.gone) continue;
      if (Math.abs((e.jumpY || 0) - car.h) > 1.3) continue;
      const [u, v] = carLocal(car, e.x, e.y), pu = CAR.len/2 + e.r - Math.abs(u), pv = CAR.wid/2 + e.r - Math.abs(v);
      if (pu <= 0 || pv <= 0) continue;
      if (mine && sp > 280 && enemy(player, e) && e.prot <= 0 && (e.carHitT || 0) < perfNow) {
        e.carHitT = perfNow + .6;
        const dmg = sp >= 560 ? 999 : 30 + (sp - 280)/280*70, how = { weapon:'car' };
        if (e.remote) netHit(player, e, dmg, how); else damage(player, e, dmg, how);
        shake = Math.max(shake, 4); sfx('thud', .8);
      }
      if (e.remote) continue;
      const c = Math.cos(car.ang), s = Math.sin(car.ang);
      if (pu < pv) { const d = Math.sign(u || 1)*pu; e.x += c*d; e.y += s*d; } else { const d = Math.sign(v || 1)*pv; e.x += -s*d; e.y += c*d; }
      if (sp > 120) { const [vx, vy] = carVel(car); e.vx += vx*.6*dt*10; e.vy += vy*.6*dt*10; }
    }
  }
}
// damage a part of a car; `by` is whoever did it. Online, everyone else hears about it through the `ce` events.
function carDamage(car, part, dmg, by, fromNet) {
  if (!car || car.wreck || !(dmg > 0) || !CAR_PARTS[part]) return;
  if (NET.on && !fromNet) { NET.ce.push({ q:++NET.seq, i:car.i, pt:part, dm:Math.round(dmg) }); if (NET.ce.length > 8) NET.ce.shift(); }
  car.lastBy = by || car.lastBy || null;
  const n = +part.slice(1);
  if (part[0] === 't') {
    const was = car.hp.t[n]; car.hp.t[n] -= dmg;
    if (was > 0 && car.hp.t[n] <= 0) { sfx('pop', .8); carChunks(car, part, 6, '#141619'); }
    car.hp.eng -= dmg*.1;
  } else if (part[0] === 'd') {
    const was = car.hp.d[n]; car.hp.d[n] -= dmg;
    if (was > 0 && car.hp.d[n] <= 0) { sfx('door', 1); carDoorOff(car, n); }
    car.hp.eng -= Math.max(0, dmg - Math.max(0, was))*.5 + dmg*.15;
  } else car.hp.eng -= dmg;
  if (by === player) hitMark(car.hp.eng <= 0);
  if (car.hp.eng <= 0) explodeCar(car, car.lastBy);
}
function explodeCar(car, by, quiet) {
  if (car.wreck) return;
  car.wreck = CAR.respawn; car.hp.eng = 0; car.boostT = 0;
  const d = Math.hypot(car.x - player.x, car.y - player.y);
  if (!quiet) { sfx('boom', clamp(1.3 - d/1600, .2, 1)); shake = Math.max(shake, clamp(16 - d/60, 2, 16)); }
  for (let i = 0; i < 26; i++) carChunks(car, 'b', 1, i % 3 ? car.paint : '#f0a23b');
  for (let i = 0; i < 14; i++) carPuff(car, true);
  wreckLook(car, true);
  const killer = by && by.alive !== undefined ? by : null;
  // everyone inside dies; people standing close get hurt (only my own player and bots are mine to damage)
  for (const e of ents) {
    if (e.remote || !e.alive) continue;
    if (e.inCar === car) {
      exitCar(e, true);
      if (killer && killer !== e) kill(killer, e, { weapon:'boom' });
      else wrecked(e);
    } else if (!quiet) {
      const dd = Math.hypot(e.x - car.x, e.y - car.y);
      if (dd < 160 && killer && killer !== e && enemy(killer, e)) damage(killer, e, 25 + 60*(1 - dd/160), { weapon:'boom' });
    }
  }
  if (car.driver && !car.driver.remote) car.driver = null;
}
function wrecked(o) {
  if (!o.alive) return;
  o.alive = false; o.hp = 0; o.respawn = o.isPlayer && cheat('respawn') ? .3 : 2.6; o.deaths++; o.streak = 0; o.swing = null; o.deadT = 0; o.zoom = 0;
  if (o.isPlayer) { $('deathMsg').textContent = 'Your car blew up'; o.killer = null; if (NET.on) NET.died = { q:++NET.seq, by:null, w:'boom' }; }
}
function respawnCar(car) {
  car.wreck = 0; car.ver++; car.auth = null; car.snaps = []; car.driver = null; car.lastBy = null;
  Object.assign(car, { x:car.home.x, y:car.home.y, ang:car.home.a, v:0, steer:0, vh:0, boostT:0, boostCd:0 });
  car.h = Math.max(0, groundAt(car.x, car.y, 1));
  car.hp = { eng:CAR.eng, t:[CAR.tire, CAR.tire, CAR.tire, CAR.tire], d:[CAR.door, CAR.door, CAR.door, CAR.door] };
  for (const e of ents) if (e.inCar === car) exitCar(e, true);
  wreckLook(car, false);
}
function wreckLook(car, on) {
  if (!car.parts) return;
  for (const m of car.parts.mats) m.color.set(on ? '#17181a' : car.paint);
  if (!on && car.doorsOff) { for (const p of car.doorsOff) car.mesh.remove(p); car.doorsOff = []; }
}
/* blocky effects: debris, smoke, fire */
const FX = [], fxGeo = new THREE.BoxGeometry(1, 1, 1), fxMats = {};
const fxMat = (c, op) => fxMats[c + op] || (fxMats[c + op] = new THREE.MeshBasicMaterial({ color:c, transparent:op < 1, opacity:op, depthWrite:op >= 1 }));
function fxBox(color, op, x, y, z, s, vx, vy, vz, life, grav, grow) {
  if (FX.length > 160) { const o = FX.shift(); scene.remove(o.m); }
  const m = new THREE.Mesh(fxGeo, fxMat(color, op)); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.set(rand(0, 3), rand(0, 3), 0);
  scene.add(m); FX.push({ m, vx, vy, vz, life, max:life, grav, grow, s, spin:rand(-6, 6) });
}
function carPuff(car, fire) {
  const c = Math.cos(car.ang), s = Math.sin(car.ang), x = (car.x + c*60)*S, z = (car.y + s*60)*S;
  fxBox(fire ? '#3a3633' : '#6d6a66', .55, x + rand(-.3, .3), car.h + 1.1, z + rand(-.3, .3), rand(.25, .45), rand(-.3, .3), rand(1, 1.8), rand(-.3, .3), rand(1.2, 1.8), 0, 1.4);
  if (fire && Math.random() < .6) fxBox(Math.random() < .5 ? '#f0a23b' : '#e0532b', 1, x + rand(-.4, .4), car.h + .9, z + rand(-.4, .4), rand(.15, .3), 0, rand(1.5, 2.5), 0, rand(.25, .45), 0, -1.5);
}
function carFlame(car) {
  const c = Math.cos(car.ang), s = Math.sin(car.ang), x = (car.x - c*CAR.len/2)*S, z = (car.y - s*CAR.len/2)*S;
  fxBox(Math.random() < .5 ? '#6fb7ff' : '#f0a23b', 1, x + rand(-.15, .15), car.h + .45, z + rand(-.15, .15), rand(.12, .22), -c*3, rand(0, .4), -s*3, .18, 0, -2);
}
function carChunks(car, part, n, color) {
  const c = Math.cos(car.ang), s = Math.sin(car.ang);
  let u = 0, v = 0; if (part[0] === 't') { const i = +part[1]; u = i < 2 ? 58 : -56; v = i % 2 ? 34 : -34; } else if (part[0] === 'd') { const i = +part[1]; u = i < 2 ? 14 : -32; v = i % 2 ? 40 : -40; }
  const x = (car.x + c*u - s*v)*S, z = (car.y + s*u + c*v)*S;
  for (let k = 0; k < n; k++) fxBox(color, 1, x, car.h + rand(.4, 1), z, rand(.1, .3), rand(-4, 4), rand(2, 7), rand(-4, 4), rand(1, 2), 14, 0);
}
function carDoorOff(car, n) {
  carChunks(car, 'd' + n, 8, car.paint);
  if (!car.mesh) return;
  // a door-shaped panel flies off; the seat behind it is now open
  const c = Math.cos(car.ang), s = Math.sin(car.ang), side = n % 2 ? 1 : -1;
  const [x, y] = seatPos(car, n);
  const m = new THREE.Mesh(fxGeo, fxMat(car.paint, 1)); m.scale.set(1.05, .7, .07);
  m.position.set(x*S - s*side*.9, car.h + .7, y*S + c*side*.9); m.rotation.y = -car.ang; scene.add(m);
  FX.push({ m, vx:-s*side*rand(4, 7), vy:rand(3, 5), vz:c*side*rand(4, 7), life:3, max:3, grav:14, grow:0, s:0, spin:rand(-8, 8), keepScale:true });
}
function updFx(dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i]; f.life -= dt;
    if (f.life <= 0) { scene.remove(f.m); FX.splice(i, 1); continue; }
    f.vy -= f.grav*dt; f.m.position.x += f.vx*dt; f.m.position.y += f.vy*dt; f.m.position.z += f.vz*dt;
    if (f.m.position.y < .05 && f.grav) { f.m.position.y = .05; f.vy *= -.3; f.vx *= .6; f.vz *= .6; }
    f.m.rotation.x += f.spin*dt; f.m.rotation.z += f.spin*.7*dt;
    if (!f.keepScale) f.m.scale.setScalar(Math.max(.01, f.s*(1 + f.grow*(1 - f.life/f.max))*(f.grav ? 1 : Math.min(1, f.life/f.max*3))));
  }
}
function syncCars() {
  for (const car of CARS) {
    const g = car.mesh; if (!g) continue;
    // tilt to the ground under the wheels: nose up a ramp, lean on a slope; in the air the nose follows the climb/fall
    const c = Math.cos(car.ang), s = Math.sin(car.ang), probe = (u, v) => groundAt(car.x + c*u - s*v, car.y + s*u + c*v, car.h + .6);
    const under = groundAt(car.x, car.y, car.h + .6);
    let tp = 0, tr = 0, lift = 0;
    if (car.h - under < .2) {
      let fr = probe(72, 0), bk = probe(-72, 0), lf = probe(0, -34), rt = probe(0, 34);
      // a wheel hanging over an edge (top of a ramp) follows the slope instead of the floor far below
      if (fr < under - .3 && bk > -1e3) fr = under + (under - bk); else if (bk < under - .3 && fr > -1e3) bk = under - (fr - under);
      if (lf < under - .3) lf = under; if (rt < under - .3) rt = under;
      if (fr > -1e3 && bk > -1e3) { tp = Math.atan2(fr - bk, 144*S); lift = Math.max(0, (fr + bk)/2 - car.h); }
      if (lf > -1e3 && rt > -1e3) tr = -Math.atan2(rt - lf, 68*S);
    } else tp = clamp(car.vh*.05, -.45, .45);
    car.pitch = (car.pitch || 0) + (clamp(tp, -.6, .6) - (car.pitch || 0))*.25;
    car.roll = (car.roll || 0) + (clamp(tr, -.4, .4) - (car.roll || 0))*.25;
    g.rotation.order = 'YXZ';
    g.position.set(car.x*S, car.h + lift, car.y*S); g.rotation.set(car.roll, -car.ang, car.pitch);
    car.parts.wheels.forEach((w, i) => {
      if (!w.steer) return;
      const flat = car.hp.t[i] <= 0, b = w.base || { y:.34 };
      w.steer.rotation.y = i < 2 ? -car.steer : 0;
      w.steer.position.y = b.y - (flat ? .1 : 0); w.steer.scale.y = flat ? .75 : 1;
      if (w.spin) w.spin.rotation.z = -car.wheelRot;
    });
  }
}
// engine note follows speed, with a little "gear change" saw
let engAudio = null;
function engineSound(on) {
  const car = player && player.inCar;
  if (!on || muted || !car || car.wreck || !car.driver) { if (engAudio) engAudio.g.gain.setTargetAtTime(0, AC.currentTime, .06); return; }
  if (!AC) sfx('click', .001);
  if (!AC) return;
  if (!engAudio) {
    const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o.type = 'sawtooth'; f.type = 'lowpass'; g.gain.value = 0;
    o.connect(f); f.connect(g); g.connect(AC.destination); o.start(); engAudio = { o, f, g };
  }
  const r = clamp(Math.abs(car.v)/CAR.maxF, 0, 1.5), gear = (r*4) % 1, now = AC.currentTime;
  engAudio.o.frequency.setTargetAtTime(34 + r*55 + gear*38, now, .05);
  engAudio.f.frequency.setTargetAtTime(260 + r*700 + (car.boostT > 0 ? 700 : 0), now, .05);
  engAudio.g.gain.setTargetAtTime(car.hp.eng < CAR.eng*.35 ? .045 : .06, now, .1);
}
// online: my cars' state for everyone else, and theirs for me
function carNetState() {
  const out = [];
  for (const car of CARS) if (car.auth === NET.myPeer) out.push([car.i, Math.round(car.x), Math.round(car.y), Math.round(car.ang*100)/100, Math.round(car.v), car.ver,
    Math.max(0, Math.round(car.hp.eng)), car.hp.t.reduce((m, h, i) => m | (h <= 0 ? 1 << i : 0), 0), car.hp.d.reduce((m, h, i) => m | (h <= 0 ? 1 << i : 0), 0), car.wreck ? 1 : 0, Math.round(car.steer*100)/100]);
  return out;
}
function readCarNet(p, pr, e, seen) {
  const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;
  // which seat this player is in
  const vc = Array.isArray(pr.vc) ? pr.vc : null, car = vc ? CARS[vc[0] | 0] : null, seat = vc ? clamp(vc[1] | 0, 0, 3) : -1;
  if (e.inCar && (e.inCar !== car || e.seat !== seat)) { if (e.inCar.driver === e) e.inCar.driver = null; e.inCar = null; e.seat = -1; }
  if (car && e.alive) {
    e.inCar = car; e.seat = seat; if (seat === 0) car.driver = e;
    // two people grabbed the same seat at once: the lower id keeps it
    if (player.inCar === car && player.seat === seat && p.peer < NET.myPeer) { exitCar(player); callout('SEAT TAKEN', ''); }
  }
  // car positions and health from whoever is in charge of each car
  if (Array.isArray(pr.vs)) for (const s of pr.vs.slice(0, 8)) {
    if (!Array.isArray(s)) continue;
    const c = CARS[s[0] | 0]; if (!c) continue;
    const ver = num(s[5]) | 0;
    if (ver < c.ver || (ver === c.ver && c.auth && c.auth !== p.peer && c.auth !== NET.myPeer)) continue;
    if (c.auth === NET.myPeer && ver === c.ver && p.peer > NET.myPeer) continue;
    if (c.driver === player && ver > c.ver) { exitCar(player); callout('SEAT TAKEN', ''); }
    const fresh = ver > c.ver;
    c.ver = ver; c.auth = p.peer;
    c.snaps.push({ t:performance.now(), x:clamp(num(s[1], c.x), 0, W), y:clamp(num(s[2], c.y), 0, H), a:num(s[3], c.ang), v:clamp(num(s[4]), -2000, 2000), st:clamp(num(s[10]), -1, 1) });
    if (c.snaps.length > 12) c.snaps.shift();
    const eng = clamp(num(s[6], CAR.eng), 0, CAR.eng), tm = num(s[7]) | 0, dm = num(s[8]) | 0;
    if (fresh) { c.hp.eng = eng; c.hp.t = c.hp.t.map((h, i) => tm & 1 << i ? 0 : CAR.tire); c.hp.d = c.hp.d.map((h, i) => dm & 1 << i ? 0 : CAR.door); }
    else { c.hp.eng = Math.min(c.hp.eng, eng); c.hp.t = c.hp.t.map((h, i) => tm & 1 << i ? Math.min(h, 0) : h); c.hp.d = c.hp.d.map((h, i) => dm & 1 << i ? Math.min(h, 0) : h); }
    if (s[9] && !c.wreck) explodeCar(c, c.lastBy || null);
  }
  // damage they did to cars
  if (Array.isArray(pr.ce)) for (const h of pr.ce.slice(-8)) {
    const q = num(h && h.q) | 0; if (q <= seen.ce) continue; seen.ce = q;
    const c = CARS[num(h.i) | 0]; if (c && CAR_PARTS[h.pt]) carDamage(c, h.pt, clamp(num(h.dm), 0, 999), e, true);
  }
}
function drawCarsRadar(c) {
  for (const car of CARS) {
    c.save(); c.translate(car.x, car.y); c.rotate(car.ang);
    c.fillStyle = car.wreck ? '#2a2a2a' : car.paint; c.fillRect(-CAR.len/2, -CAR.wid/2, CAR.len, CAR.wid);
    c.strokeStyle = '#000'; c.lineWidth = 6; c.strokeRect(-CAR.len/2, -CAR.wid/2, CAR.len, CAR.wid);
    c.restore();
  }
}
function carHudText() {
  const car = player.inCar;
  if (!car) {
    const near = player.alive && nearCar(player);
    return near ? (touchMode ? 'Tap CAR to get in' : 'Press E to get in') : '';
  }
  const dot = h => `<i class="${h > 0 ? '' : 'gone'}"></i>`;
  const role = player.seat === 0 ? 'DRIVER' : 'PASSENGER';
  return `<b>${role}</b> <span>ENGINE ${Math.max(0, Math.round(car.hp.eng/CAR.eng*100))}%</span> <span>TIRES ${car.hp.t.map(dot).join('')}</span> <span>DOORS ${car.hp.d.map(dot).join('')}</span>`
    + (player.seat === 0 ? ` <span>${car.boostCd > 0 ? 'BOOST ' + Math.ceil(car.boostCd) + 's' : 'BOOST READY'}</span>` : '')
    + (touchMode ? '' : ` <span class="k">E exit · X seat${player.seat === 0 ? ' · Shift boost · Space brake' : ''}</span>`);
}
