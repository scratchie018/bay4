/* ---------- admin site: debug tools, creator tools, admin utilities ----------
   F2 opens the dock. Anything that changes the game world only works offline, in cheats rooms, or once the owner
   key is unlocked; anything that touches other players goes through signed owner commands (Admin tab). */
const ADM = { open:false, tab:'debug', stats:false, viz:{ colliders:false, plats:false, nav:false, spawns:false, bots:false, hitboxes:false }, vizGroup:null, vizKey:'',
  timeScale:1, fps:60, ft:16, log:[], shot:false, hideHud:false };
const admLocal = () => !NET.on || NET.cheatsRoom || !!OWN.priv;
function admLog(kind, text) {
  const d = new Date(); ADM.log.push(`${d.toTimeString().slice(0, 8)}  ${kind.padEnd(6)} ${text}`);
  if (ADM.log.length > 400) ADM.log.shift();
  if (ADM.open && ADM.tab === 'log') admRender();
}
// hook into a few game functions to fill the event log
{ const c0 = callout; callout = (b, s) => { admLog('call', `${b}${s ? ' · ' + s : ''}`); c0(b, s); }; }
{ const f0 = feedPush; feedPush = (a, o, how) => { admLog('kill', `${a.name} → ${o.name} (${how.weapon}${how.hs ? ', headshot' : ''}${how.behind ? ', back' : ''})`); f0(a, o, how); }; }
{ const s0 = setCustomMap; setCustomMap = (md, code) => { admLog('map', `${md.name || 'custom'} · ${Math.round(+md.w || 0)}×${Math.round(+md.d || 0)} m · ${(code.length/1024).toFixed(0)} KB`); return s0(md, code); }; }
{ const o0 = applyOwnerCommand; applyOwnerCommand = (c, mine) => { admLog('owner', `${mine ? 'sent' : 'got'} ${c.k}${c.t ? ' → ' + c.t : ''}${c.m ? ': ' + c.m : ''}`); o0(c, mine); }; }
{ const l0 = chatLine; chatLine = (n, col, t, team) => { admLog('chat', `${team ? '[team] ' : ''}${n}: ${t}`); l0(n, col, t, team); }; }
addEventListener('error', e => admLog('error', `${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));

/* ----- free camera / photo mode / camera paths ----- */
const FC = { on:false, pos:new THREE.Vector3(), yaw:0, pitch:0, keys:new Set(), speed:8, frozen:false, keysOn:true, path:[], play:null, dur:8, rec:false };
function fcStart() {
  if (!admLocal()) { admToast('Free camera works offline, in cheats rooms, or with the owner key unlocked'); return; }
  FC.on = true; FC.pos.copy(camera.position); keys.clear(); mouse.L = mouse.R = false;
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); FC.yaw = e.y; FC.pitch = e.x;
  window.__cam = fcCam; admRender();
}
function fcStop() { FC.on = false; FC.play = null; window.__cam = null; FC.keys.clear(); admRender(); }
function fcCam(cam) {
  if (FC.play) {
    const p = FC.play, k = Math.min(1, (performance.now() - p.t0)/(FC.dur*1000)), P = FC.path, n = P.length - 1;
    const f = k*n, i = Math.min(n - 1, Math.floor(f)), u = f - i, q = j => P[Math.max(0, Math.min(n, j))];
    const cr = (a, b, c, d, t) => .5*((2*b) + (-a + c)*t + (2*a - 5*b + 4*c - d)*t*t + (-a + 3*b - 3*c + d)*t*t*t);
    cam.position.set(...[0, 1, 2].map(ax => cr(q(i - 1).p[ax], q(i).p[ax], q(i + 1).p[ax], q(i + 2).p[ax], u)));
    cam.quaternion.slerpQuaternions(new THREE.Quaternion(...q(i).q), new THREE.Quaternion(...q(i + 1).q), u*u*(3 - 2*u));
    cam.fov = q(i).fov + (q(i + 1).fov - q(i).fov)*u; cam.updateProjectionMatrix();
    if (k >= 1) { FC.play = null; if (FC.rec) { FC.rec = false; if (REC.on) { recToggle(); recUi(); } } admRender(); }
    return;
  }
  const dt = Math.min(.05, (performance.now() - (FC.last || performance.now()))/1000); FC.last = performance.now();
  const f = new THREE.Vector3(-Math.sin(FC.yaw)*Math.cos(FC.pitch), Math.sin(FC.pitch), -Math.cos(FC.yaw)*Math.cos(FC.pitch)), r = new THREE.Vector3(Math.cos(FC.yaw), 0, -Math.sin(FC.yaw));
  const k = FC.keys, sp = FC.speed*(k.has('ShiftLeft') ? 3 : 1)*(k.has('AltLeft') ? .25 : 1)*dt;
  if (k.has('KeyW')) FC.pos.addScaledVector(f, sp); if (k.has('KeyS')) FC.pos.addScaledVector(f, -sp);
  if (k.has('KeyD')) FC.pos.addScaledVector(r, sp); if (k.has('KeyA')) FC.pos.addScaledVector(r, -sp);
  if (k.has('KeyE') || k.has('Space')) FC.pos.y += sp; if (k.has('KeyQ') || k.has('ControlLeft')) FC.pos.y -= sp;
  cam.position.copy(FC.pos); cam.rotation.set(FC.pitch, FC.yaw, 0, 'YXZ'); cam.fov = FC.fov || 60; cam.updateProjectionMatrix();
}
// while flying, the keyboard and mouse drive the camera instead of the player
addEventListener('keydown', e => {
  if (e.code === 'F2') { e.preventDefault(); ADM.open = !ADM.open; admRender(); return; }
  if (e.code === 'F10') { e.preventDefault(); ADM.shot = true; return; }
  if (!FC.on || CHAT.open || e.target.closest && e.target.closest('#adm')) return;
  if (['F8', 'F9', 'Escape'].includes(e.code)) return;
  if (e.code === 'KeyK') addKey();
  else if (e.code === 'KeyP') playPath(false);
  else if (e.code === 'KeyF' && !e.repeat) { FC.frozen = !FC.frozen; ADM.timeScale = FC.frozen ? 0 : 1; admRender(); }
  else FC.keys.add(e.code);
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
addEventListener('keyup', e => { if (FC.on) { FC.keys.delete(e.code); e.stopImmediatePropagation(); } }, true);
addEventListener('wheel', e => { if (FC.on) { FC.fov = clamp((FC.fov || 60) + Math.sign(e.deltaY)*3, 15, 110); } }, { passive:true });
{ const lb = lookBy; lookBy = (dx, dy) => { if (FC.on) { FC.yaw -= dx*.0022*sens; FC.pitch = clamp(FC.pitch - dy*.0022*sens, -1.5, 1.5); return; } lb(dx, dy); }; }
function addKey() {
  FC.path.push({ p:camera.position.toArray().map(v => +v.toFixed(3)), q:camera.quaternion.toArray().map(v => +v.toFixed(5)), fov:camera.fov });
  admToast(`Keyframe ${FC.path.length} added`); admRender();
}
function playPath(record) {
  if (FC.path.length < 2) { admToast('Add at least 2 keyframes (K) first'); return; }
  if (!FC.on) fcStart(); if (!FC.on) return;
  if (record && !REC.on) { recToggle(); recUi(); FC.rec = true; }
  FC.play = { t0:performance.now() }; admRender();
}
const pathKey = () => 'adm-path-' + (currentMap.id || 'bay4');
function savePath() { store.set(pathKey(), JSON.stringify({ path:FC.path, dur:FC.dur })); admToast('Path saved for this map'); }
function loadPath() { try { const j = JSON.parse(store.get(pathKey(), '')); FC.path = j.path || []; FC.dur = j.dur || 8; admToast(`Loaded ${FC.path.length} keyframes`); } catch (e) { admToast('No saved path for this map'); } admRender(); }

/* ----- debug visualisation ----- */
function vizBuild() {
  if (ADM.vizGroup) { scene.remove(ADM.vizGroup); ADM.vizGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const g = ADM.vizGroup = new THREE.Group(); scene.add(g);
  const box = (x0, y0, z0, x1, y1, z1, color) => {
    const b = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(.02, x1 - x0), Math.max(.02, y1 - y0), Math.max(.02, z1 - z0))), new THREE.LineBasicMaterial({ color, depthTest:false, transparent:true, opacity:.8 }));
    b.position.set((x0 + x1)/2, (y0 + y1)/2, (z0 + z1)/2); b.renderOrder = 999; g.add(b);
  };
  if (ADM.viz.colliders) for (const r of RECTS) box(r.x*S, 0, r.y*S, (r.x + r.w)*S, Math.min(r.ht ?? 2.5, 8), (r.y + r.h)*S, r.build ? 0x6fd36f : 0xff4040);
  if (ADM.viz.plats) for (const r of PLATS) box(r.x*S, r.y0 || 0, r.y*S, (r.x + r.w)*S, r.ht ?? 1, (r.y + r.h)*S, 0x5aa0ff);
  if (ADM.viz.spawns) for (const s of SPAWNS) { const x = (s.x ?? s[0])*S, z = (s.y ?? s[1])*S; box(x - .3, s.h || 0, z - .3, x + .3, (s.h || 0) + 2, z + .3, s.team === 1 ? 0x5a9fd6 : s.team === 0 ? 0xe0a040 : 0x6fd36f); }
  if (ADM.viz.nav) {
    if (!NAV) buildNav();
    const pts = [];
    for (let y = 0; y < NAV.ch; y++) for (let x = 0; x < NAV.cw; x++) if (NAV.g[y*NAV.cw + x]) pts.push((x + .5)*NC*S, .05, (y + .5)*NC*S);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color:0xf0a23b, size:.25, depthTest:false })));
  }
  for (const m of carHitMeshes) { m.visible = !!ADM.viz.hitboxes; if (ADM.viz.hitboxes) { m.material.wireframe = true; m.material.color.set(0xff00ff); } }
  ADM.vizKey = vizSig();
}
const vizSig = () => [RECTS.length, PLATS.length, SPAWNS.length, currentMap.id, JSON.stringify(ADM.viz)].join('|');
const botLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color:0xffe14a, depthTest:false })); botLines.renderOrder = 999; scene.add(botLines);
function admFrame(dt) {
  ADM.fps = ADM.fps*.95 + (1/Math.max(dt, 1e-3))*.05;
  const anyViz = Object.values(ADM.viz).some(Boolean);
  if (anyViz && ADM.vizKey !== vizSig()) vizBuild();
  if (!anyViz && ADM.vizGroup) { scene.remove(ADM.vizGroup); ADM.vizGroup = null; ADM.vizKey = ''; for (const m of carHitMeshes) m.visible = false; }
  botLines.visible = ADM.viz.bots;
  if (ADM.viz.bots) {
    const pts = [];
    for (const e of ents) {
      if (e.remote || e.isPlayer || !e.alive) continue;
      if (e.ai.target && e.ai.target.alive) pts.push(e.x*S, 1.6, e.y*S, e.ai.target.x*S, 1.6, e.ai.target.y*S);
      let px = e.x, py = e.y; for (const n of e.ai.path || []) { pts.push(px*S, .15, py*S, n.x*S, .15, n.y*S); px = n.x; py = n.y; }
    }
    botLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }
  for (const id of ['hud', 'feed', 'radar']) { const el = $(id); if (el) el.style.visibility = ADM.hideHud ? 'hidden' : ''; }
  if (ADM.stats) {
    const i = renderer.info.render;
    $('admStats').textContent = [`${ADM.fps.toFixed(0)} fps  ${(dt*1000).toFixed(1)} ms`, `draw calls ${i.calls}  tris ${(i.triangles/1000).toFixed(1)}k`,
      `ents ${ents.length}  cars ${CARS.length}  builds ${BUILT.length}`, `rects ${RECTS.length}  plats ${PLATS.length}  nav ${NAV ? NAV.cw + '×' + NAV.ch : '-'}`,
      `map ${currentMap.name} (${currentMap.id})`, NET.on ? `online ${NET.room && NET.room.voice ? 'relay' : 'peer'}  room ${NET.code}  peers ${ents.filter(e => e.remote).length}` : 'offline',
      `player ${player ? `${(player.x*S).toFixed(1)}, ${(player.y*S).toFixed(1)}  h ${(player.jumpY || 0).toFixed(2)}` : '-'}`, FC.on ? `freecam ${FC.pos.toArray().map(v => v.toFixed(1)).join(', ')}` : ''].filter(Boolean).join('\n');
  }
  $('admStats').hidden = !ADM.stats;
  if (ADM.open && ADM.tab === 'net' && (ADM.netT = (ADM.netT || 0) - dt) <= 0) { ADM.netT = .5; admRender(); }
}
function admShot() {
  if (!ADM.shot) return; ADM.shot = false;
  cv.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = recName('png').replace('.png', '-shot.png'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); admToast('Screenshot saved'); }, 'image/png');
}
function teleportToCrosshair() {
  if (!admLocal()) return admToast('Locked: offline, cheats rooms, or owner only');
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const h = castWorld(camera.position, dir, false);
  if (!h) return admToast('Nothing under the crosshair');
  player.x = clamp(h.point.x/S - dir.x*.6/S, 10, W - 10); player.y = clamp(h.point.z/S - dir.z*.6/S, 10, H - 10); player.jumpY = Math.max(0, groundAt(player.x, player.y, h.point.y + .5)); player.vx = player.vy = 0;
}
function admToast(t) { const el = $('admToast'); el.textContent = t; el.hidden = false; clearTimeout(admToast.t); admToast.t = setTimeout(() => el.hidden = true, 2500); }

/* ----- the dock ----- */
function admRender() {
  const d = $('adm'); d.hidden = !ADM.open; $('admOpen').hidden = ADM.open; if (!ADM.open) return;
  const L = admLocal(), btn = (id, label, on) => `<button type="button" data-a="${id}" class="${on ? 'on' : ''}">${label}</button>`;
  const tabs = ['debug', 'creator', 'admin', 'net', 'log'].map(t => `<button type="button" data-tab="${t}" class="${ADM.tab === t ? 'on' : ''}">${t.toUpperCase()}</button>`).join('');
  let body = '';
  if (ADM.tab === 'debug') body = `
    <h4>OVERLAYS</h4><div class="g">${btn('stats', 'Stats', ADM.stats)}${btn('v-colliders', 'Colliders', ADM.viz.colliders)}${btn('v-plats', 'Floors & tops', ADM.viz.plats)}${btn('v-nav', 'Bot nav grid', ADM.viz.nav)}${btn('v-spawns', 'Spawns', ADM.viz.spawns)}${btn('v-bots', 'Bot targets & paths', ADM.viz.bots)}${btn('v-hitboxes', 'Car hitboxes', ADM.viz.hitboxes)}</div>
    <h4>WORLD ${L ? '' : '<span class="lock">locked online</span>'}</h4>
    <div class="g">${btn('tp', 'Teleport to crosshair')}${btn('heal', 'Heal')}${btn('killbots', 'Kill all bots')}${btn('addbot', 'Add bot')}${btn('god', 'God mode', CHEAT.god)}${btn('freeze', 'Freeze bots', CHEAT.freeze)}${btn('reload', 'Reload map')}</div>
    <label>Time ${ADM.timeScale.toFixed(2)}× <input type="range" min="0" max="2" step=".05" value="${ADM.timeScale}" data-a="time" ${L ? '' : 'disabled'}></label>`;
  if (ADM.tab === 'creator') body = `
    <h4>CAMERA ${L ? '' : '<span class="lock">locked online</span>'}</h4>
    <div class="g">${btn('fc', FC.on ? 'Stop free camera' : 'Free camera', FC.on)}${btn('freeze-world', FC.frozen ? 'Unpause world' : 'Pause world (photo mode)', FC.frozen)}${btn('hud', 'Hide HUD', ADM.hideHud)}${btn('shot', 'Screenshot (F10)')}</div>
    <p class="k">Free camera: WASD move, E/Q up/down, Shift fast, Alt slow, mouse look, wheel zoom, F pause world, K keyframe, P play path.</p>
    <h4>CAMERA PATH · ${FC.path.length} keyframes</h4>
    <div class="g">${btn('key', 'Add keyframe (K)')}${btn('play', 'Play (P)')}${btn('playrec', 'Play & record')}${btn('undo', 'Remove last')}${btn('clear', 'Clear')}${btn('save', 'Save')}${btn('load', 'Load')}</div>
    <label>Duration ${FC.dur}s <input type="range" min="2" max="40" step="1" value="${FC.dur}" data-a="dur"></label>
    <h4>RECORDING</h4>
    <div class="g">${btn('rec', REC.on ? 'Stop recording (F8)' : 'Record (F8)', REC.on)}${btn('q', `Quality ${REC.height}p`)}${btn('rhud', `HUD in clips: ${REC.hud ? 'on' : 'off'}`)}${btn('replay', `Replay buffer: ${REC.replay ? 'on' : 'off'}`, REC.replay)}${btn('rsave', 'Save last 30 s (F9)')}</div>`;
  if (ADM.tab === 'admin') body = `
    <h4>OWNER KEY</h4><p class="k">${!OWNER_KEY ? 'No owner key is set up yet: run owner-setup.py once (ask Claude).' : OWN.priv ? 'Unlocked on this device.' : 'Locked. Unlock it to use player commands.'}</p>
    <div class="g">${btn('owner', OWN.priv ? 'Owner panel' : 'Unlock owner panel')}</div>
    <h4>PLAYERS ${NET.on ? `IN ${NET.code.toUpperCase()}` : '(join a room)'}</h4>
    <div class="plist">${ents.filter(e => e.remote).map(e => `<div class="pl"><b style="color:${e.color}">${escH(e.name)}</b> <span class="k">${e.peer.slice(0, 8)} · team ${e.team}${e.inCar ? ' · in car' : ''}</span><span class="g">${['slay', 'mute', 'bring', 'kick'].map(k => `<button type="button" data-cmd="${k}" data-peer="${e.peer}" ${OWN.priv ? '' : 'disabled'}>${k}</button>`).join('')}</span></div>`).join('') || '<p class="k">Nobody else here.</p>'}</div>
    <h4>ROOM</h4><div class="g">${['end', 'reset'].map(k => `<button type="button" data-cmd="${k}" ${OWN.priv && NET.on ? '' : 'disabled'}>${k === 'end' ? 'End round' : 'Reset scores'}</button>`).join('')}</div>
    <div class="g"><input id="admSay" maxlength="120" placeholder="Announcement"><button type="button" data-cmd="say" ${OWN.priv && NET.on ? '' : 'disabled'}>Announce</button></div>`;
  if (ADM.tab === 'net') {
    const rows = ents.filter(e => e.remote).map(e => `<tr><td style="color:${e.color}">${escH(e.name)}</td><td>${e.team}</td><td>${(e.x*S).toFixed(0)},${(e.y*S).toFixed(0)}</td><td>${e.alive ? 'alive' : 'dead'}</td><td>${e.weapon}</td><td>${e.inCar ? 'car ' + e.seat : ''}</td><td>${e.snaps && e.snaps.length ? Math.round(performance.now() - e.snaps[e.snaps.length - 1].t) + ' ms' : '-'}</td></tr>`).join('');
    body = `<h4>CONNECTION</h4><p class="k">${NET.on ? `Room ${escH(NET.code)} · ${NET.room && NET.room.voice ? 'Cloudflare relay' : 'direct (PeerJS)'} · ${NET.room && NET.room.isHost() ? 'you host' : 'guest'} · my id ${escH(String(NET.myPeer || '').slice(0, 10))}` : 'Offline.'}</p>
      <table><tr><th>name</th><th>team</th><th>pos (m)</th><th></th><th>weapon</th><th></th><th>last update</th></tr>${rows}</table>`;
  }
  if (ADM.tab === 'log') body = `<div class="g">${btn('logclear', 'Clear')}${btn('logcopy', 'Copy')}</div><pre>${escH(ADM.log.slice(-160).join('\n'))}</pre>`;
  d.innerHTML = `<div class="head"><b>ADMIN</b><span class="k">F2 hides</span></div><div class="tabs">${tabs}</div><div class="body">${body}</div>`;
  if (ADM.tab === 'log') { const pre = d.querySelector('pre'); pre.scrollTop = pre.scrollHeight; }
}
document.addEventListener('click', async e => {
  const t = e.target.closest('#adm [data-tab], #adm [data-a], #adm [data-cmd]'); if (!t) return;
  if (t.dataset.tab) { ADM.tab = t.dataset.tab; return admRender(); }
  const a = t.dataset.a, L = admLocal();
  const locked = () => { admToast('Locked: works offline, in cheats rooms, or with the owner key'); };
  if (a === 'stats') ADM.stats = !ADM.stats;
  else if (a && a.startsWith('v-')) { const k = a.slice(2); ADM.viz[k] = !ADM.viz[k]; }
  else if (a === 'tp') teleportToCrosshair();
  else if (['heal', 'killbots', 'addbot', 'god', 'freeze', 'reload'].includes(a)) {
    if (!L) return locked();
    if (a === 'heal' && player) player.hp = 100;
    if (a === 'killbots') for (const b of ents) if (!b.isPlayer && !b.remote && b.alive) { b.prot = 0; damage(player, b, 999, { weapon:player.weapon }); }
    if (a === 'addbot') $('ch-addbot').click();
    if (a === 'god') { CHEAT.god = !CHEAT.god; applyCheatVisuals(); }
    if (a === 'freeze') { CHEAT.freeze = !CHEAT.freeze; applyCheatVisuals(); }
    if (a === 'reload' && currentMap.code) { const c = currentMap.code; currentMap = { id:'', code:'' }; setCustomMap(parseMapCode(c), c); setupBuild(); setupCars(); for (const x of ents) if (!x.remote) spawn(x); }
  }
  else if (a === 'fc') { FC.on ? fcStop() : fcStart(); }
  else if (a === 'freeze-world') { if (!L) return locked(); FC.frozen = !FC.frozen; ADM.timeScale = FC.frozen ? 0 : 1; }
  else if (a === 'hud') ADM.hideHud = !ADM.hideHud;
  else if (a === 'shot') ADM.shot = true;
  else if (a === 'key') addKey();
  else if (a === 'play') playPath(false);
  else if (a === 'playrec') playPath(true);
  else if (a === 'undo') FC.path.pop();
  else if (a === 'clear') FC.path = [];
  else if (a === 'save') savePath();
  else if (a === 'load') loadPath();
  else if (a === 'rec') { recToggle(); recUi(); }
  else if (a === 'q') $('recQBtn').click();
  else if (a === 'rhud') $('recHudBtn').click();
  else if (a === 'replay') $('replayBtn').click();
  else if (a === 'rsave') replaySave();
  else if (a === 'owner') ownerOpen();
  else if (a === 'logclear') ADM.log = [];
  else if (a === 'logcopy') { try { await navigator.clipboard.writeText(ADM.log.join('\n')); admToast('Log copied'); } catch (er) { admToast("Couldn't copy"); } }
  const c = t.dataset.cmd;
  if (c) {
    if (!OWN.priv) return admToast('Unlock the owner key first (Admin tab)');
    if (c === 'say') { const m = cleanText($('admSay').value, 120); if (m) ownerSend('say', { m }); }
    else if (c === 'bring') ownerSend('bring', { t:t.dataset.peer, x:Math.round(player.x), y:Math.round(player.y) });
    else if (c === 'end' || c === 'reset') ownerSend(c);
    else ownerSend(c, { t:t.dataset.peer });
    admToast(`${c} sent`);
  }
  admRender();
});
document.addEventListener('input', e => {
  const t = e.target.closest('#adm [data-a]'); if (!t) return;
  if (t.dataset.a === 'time' && admLocal()) { ADM.timeScale = +t.value; FC.frozen = ADM.timeScale === 0; }
  if (t.dataset.a === 'dur') FC.dur = +t.value;
  const lab = t.closest('label'); if (lab) lab.firstChild.textContent = t.dataset.a === 'time' ? `Time ${(+t.value).toFixed(2)}× ` : `Duration ${t.value}s `;
});
// leaving offline play (joining a normal room) turns off what isn't allowed there
setInterval(() => { if (!admLocal()) { if (FC.on) fcStop(); if (ADM.timeScale !== 1) { ADM.timeScale = 1; FC.frozen = false; } } }, 500);
admLog('info', 'Admin tools loaded. F2 opens the dock.');
