/* shape colliders: turn a mesh's real surfaces into a handful of boxes (metres), so models, rotated blocks,
   cylinders and wedges collide like they look. Triangles are sampled onto a 25 cm grid; each grid column keeps
   its filled height ranges; neighbouring columns with the same ranges are merged into strips, then rectangles. */
function meshTris(root) {
  root.updateMatrixWorld(true);
  const out = [], v = new THREE.Vector3();
  root.traverse(m => {
    if (!m.isMesh || !m.geometry || m.visible === false || (m.material && m.material.visible === false)) return;
    const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); out.push(v.x, v.y, v.z); }
  });
  return out;
}
function voxelBoxes(tris, cell = .25) {
  for (let tries = 0; tries < 3; tries++, cell *= 2) {
    const cols = new Map(); let samples = 0, tooMany = false;
    for (let t = 0; t + 8 < tris.length && !tooMany; t += 9) {
      const ax = tris[t], ay = tris[t+1], az = tris[t+2], bx = tris[t+3] - ax, by = tris[t+4] - ay, bz = tris[t+5] - az, cx = tris[t+6] - ax, cy = tris[t+7] - ay, cz = tris[t+8] - az;
      const L = Math.max(Math.hypot(bx, by, bz), Math.hypot(cx, cy, cz), Math.hypot(bx - cx, by - cy, bz - cz));
      const n = Math.max(1, Math.ceil(L/(cell*.5)));
      samples += n*n/2; if (samples > 4e6) { tooMany = true; break; }
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i/n, w = j/n, x = ax + bx*u + cx*w, y = ay + by*u + cy*w, z = az + bz*u + cz*w;
        const k = Math.floor(x/cell) + ',' + Math.floor(z/cell);
        let s = cols.get(k); if (!s) cols.set(k, s = new Set());
        s.add(Math.floor(y/cell));
      }
    }
    if (tooMany) continue;
    // column -> its filled height runs, as a string so identical columns can be merged
    const rows = new Map();
    for (const [k, ys] of cols) {
      const [ix, iz] = k.split(',').map(Number), a = [...ys].sort((p, q) => p - q), runs = [];
      for (const y of a) { const r = runs[runs.length - 1]; if (r && y === r[1] + 1) r[1] = y; else runs.push([y, y]); }
      if (!rows.has(iz)) rows.set(iz, []);
      rows.get(iz).push({ ix, key:runs.map(r => r.join('-')).join(';'), runs });
    }
    // strips along x, then stack identical strips along z
    const strips = new Map();   // "ix0,ix1,key" -> list of iz
    for (const [iz, list] of rows) {
      list.sort((p, q) => p.ix - q.ix);
      for (let i = 0; i < list.length;) {
        let j = i; while (j + 1 < list.length && list[j + 1].ix === list[j].ix + 1 && list[j + 1].key === list[i].key) j++;
        const sk = list[i].ix + ',' + list[j].ix + ',' + list[i].key;
        if (!strips.has(sk)) strips.set(sk, { ix0:list[i].ix, ix1:list[j].ix, runs:list[i].runs, zs:[] });
        strips.get(sk).zs.push(iz); i = j + 1;
      }
    }
    const out = [];
    for (const st of strips.values()) {
      st.zs.sort((p, q) => p - q);
      for (let i = 0; i < st.zs.length;) {
        let j = i; while (j + 1 < st.zs.length && st.zs[j + 1] === st.zs[j] + 1) j++;
        for (const [y0, y1] of st.runs) out.push({ x0:st.ix0*cell, x1:(st.ix1 + 1)*cell, z0:st.zs[i]*cell, z1:(st.zs[j] + 1)*cell, y0:y0*cell, y1:(y1 + 1)*cell });
        i = j + 1;
      }
    }
    if (out.length <= 2500 || tries === 2) return out;
  }
  return [];
}
// does this solid need real-shape colliders, or is a plain box exact?
const needsShape = o => o.shape === 'model' || o.shape === 'cyl' || o.shape === 'wedge' || Math.abs(Math.sin(2*(o.rotY || 0))) > 1e-3;
