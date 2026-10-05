/* fighters: a low-poly person built from tapered boxes. Front is +X, right is +Z, feet at y = 0, 1.78 m tall.
   Joints: hips and knees, neck, shoulders and elbows. The weapon arm is modelled hanging down and turned to point forward. */
function taperGeo(bw, bd, tw, td, h, y0 = 0, bx = 0, tx = 0) {
  // bottom rectangle (depth bd along x, width bw along z) at y0, top rectangle at y0 + h; x offsets let it lean
  const b = [[bx - bd/2, -bw/2], [bx + bd/2, -bw/2], [bx + bd/2, bw/2], [bx - bd/2, bw/2]], t = [[tx - td/2, -tw/2], [tx + td/2, -tw/2], [tx + td/2, tw/2], [tx - td/2, tw/2]];
  const B = b.map(([x, z]) => [x, y0, z]), T = t.map(([x, z]) => [x, y0 + h, z]), tri = [];
  const q = (a, c, d, e) => tri.push(a, d, c, a, e, d);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; q(B[i], B[j], T[j], T[i]); }
  q(T[0], T[1], T[2], T[3]); q(B[3], B[2], B[1], B[0]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3)); g.computeVertexNormals(); return g;
}
function gemGeo(r, sx, sy, sz, y) { const g = new THREE.IcosahedronGeometry(r, 1); g.scale(sx, sy, sz); g.translate(0, y, 0); return g; }
const FG = {
  thigh: taperGeo(.15, .17, .17, .19, .45, -.45), shin: taperGeo(.11, .12, .15, .16, .4, -.4),
  boot: taperGeo(.13, .27, .13, .2, .085, -.485, .045, .02), pelvis: taperGeo(.33, .2, .35, .21, .14, .86),
  belt: taperGeo(.345, .215, .345, .215, .035, .985), torso: taperGeo(.34, .2, .44, .25, .44, 1.0, 0, -.01),
  collar: taperGeo(.2, .15, .16, .12, .05, 1.43), neck: taperGeo(.09, .09, .085, .085, .09, 0),
  head: gemGeo(.12, 1, 1.13, .94, .19), hair: taperGeo(.25, .26, .19, .2, .1, .235, -.02, -.03), hairBack: taperGeo(.2, .06, .21, .07, .14, .12, -.11, -.115),
  eye: new THREE.BoxGeometry(.02, .026, .034), nose: taperGeo(.03, .03, .02, .02, .05, .15, .113, .118),
  upper: taperGeo(.1, .1, .12, .12, .29, -.29), fore: taperGeo(.08, .08, .095, .095, .26, -.26), hand: new THREE.BoxGeometry(.1, .1, .09).translate(0, -.05, 0),
};
const FM = {
  skin: new THREE.MeshStandardMaterial({ color:0xc9976f, emissive:0x3a2416, roughness:.7, flatShading:true }),
  pants: new THREE.MeshStandardMaterial({ color:0x2e333b, roughness:.85, flatShading:true }),
  boot: new THREE.MeshStandardMaterial({ color:0x1b1c1f, roughness:.6, flatShading:true }),
  glove: new THREE.MeshStandardMaterial({ color:0x26282c, roughness:.7, flatShading:true }),
  hair: new THREE.MeshStandardMaterial({ color:0x2b1e15, roughness:.9, flatShading:true }),
  eye: new THREE.MeshBasicMaterial({ color:0x0d0e10 }),
};
const HIP_Y = .93;
function buildFighter(e) {
  const g = new THREE.Group(), body = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color:e.color, roughness:.8, flatShading:true });
  const trim = new THREE.MeshStandardMaterial({ color:new THREE.Color(e.color).multiplyScalar(.55), roughness:.8, flatShading:true });
  const hits = [];
  const mesh = (geo, mat, part, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (part) { m.userData = { ent:e, part }; hits.push(m); } parent.add(m); return m; };
  // legs: hip -> thigh, knee -> shin and boot
  const legs = [], knees = [];
  for (const z of [-.095, .095]) {
    const hip = new THREE.Group(); hip.position.set(0, HIP_Y, z);
    mesh(FG.thigh, FM.pants, 'legs', hip);
    const knee = new THREE.Group(); knee.position.y = -.45; hip.add(knee);
    mesh(FG.shin, FM.pants, 'legs', knee); mesh(FG.boot, FM.boot, 'legs', knee);
    g.add(hip); legs.push(hip); knees.push(knee);
  }
  mesh(FG.pelvis, FM.pants, 'body', body); mesh(FG.belt, FM.boot, null, body);
  mesh(FG.torso, cloth, 'body', body); mesh(FG.collar, trim, null, body);
  // head: neck pivot -> neck, head, hair, face
  const headG = new THREE.Group(); headG.position.set(0, 1.45, 0);
  mesh(FG.neck, FM.skin, null, headG); mesh(FG.head, FM.skin, 'head', headG);
  mesh(FG.hair, FM.hair, 'head', headG); mesh(FG.hairBack, FM.hair, 'head', headG);
  for (const z of [-.042, .042]) mesh(FG.eye, FM.eye, null, headG, .117, .2, z);
  mesh(FG.nose, FM.skin, null, headG);
  body.add(headG);
  // an arm: shoulder -> upper arm (sleeve), elbow -> forearm and glove
  const limb = (parent) => {
    mesh(FG.upper, cloth, 'body', parent);
    const elbow = new THREE.Group(); elbow.position.y = -.29; parent.add(elbow);
    mesh(FG.fore, FM.skin, 'body', elbow); mesh(FG.hand, FM.glove, null, elbow, 0, -.26, 0);
    return elbow;
  };
  // weapon arm: upper arm angled down and forward, elbow bent so the hand sits in front of the chest
  const UP = Math.PI/2 - .55, EL = .7;
  const arm = new THREE.Group(); arm.position.set(.02, 1.36, .24);
  const fwd = new THREE.Group(); fwd.rotation.z = UP; arm.add(fwd);
  const elbow = limb(fwd); elbow.rotation.z = EL;
  // the weapon is held in the hand, kept level with the arm group's forward direction
  const grip = new THREE.Group(); grip.position.y = -.31; grip.rotation.z = -(UP + EL); elbow.add(grip);
  if (e.weapon === 'awp') {
    const r = awpModel().g; r.scale.setScalar(.21); r.rotation.y = Math.PI; r.position.set(-.2, .03, -.08); grip.add(r);
  } else {
    const k = karambitModel(e.finish); k.scale.setScalar(.085); k.position.set(.01, 0, 0);
    k.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1))); grip.add(k);
  }
  body.add(arm);
  const off = new THREE.Group(); off.position.set(0, 1.4, -.26); const offElbow = limb(off); body.add(off);
  g.add(body);
  scene.add(g);
  hitMeshes.push(...hits);
  e.mesh = { g, body, legs, knees, arm, off, offElbow, head:headG, cloth, hipY:HIP_Y };
}

