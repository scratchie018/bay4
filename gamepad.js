/* ---------- controller support (standard gamepad layout: Xbox / PlayStation / most others) ----------
   Left stick move · right stick look · RT slash/fire · LT stab/scope · A jump · B crouch · X car in/out or reload ·
   Y swap weapon (seat in a car) · LB dash (boost in a car) · RB build · D-pad ←/→ pick piece, ↑ inspect, ↓ scores ·
   Start pause · Back scores. Driving: RT gas, LT brake/reverse, left stick steer, A handbrake.
   Menus: A or Start plays, Start pauses / resumes. Rumbles on hits and damage where the controller supports it. */
const GP = { on:false, mv:false, lx:0, ly:0, drive:false, thr:0, hb:false, prev:[], lastHurt:0, lastHit:0, seen:0 };
const gpDead = (x, y, d = .16) => { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const k = Math.min(1, (m - d)/(1 - d))/m; return [x*k, y*k]; };
function gpRumble(strong, weak, ms) { try { const g = gpGet(); g && g.vibrationActuator && g.vibrationActuator.playEffect('dual-rumble', { duration:ms, strongMagnitude:strong, weakMagnitude:weak }); } catch (e) {} }
function gpGet() { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of l) if (g && g.connected && g.buttons.length >= 12) return g; return null; }
addEventListener('gamepadconnected', e => { if (typeof callout === 'function' && state === 'play') callout('CONTROLLER', (e.gamepad.id || '').split('(')[0].trim().slice(0, 30).toUpperCase()); });
function gpPoll(dt) {
  const g = gpGet();
  GP.mv = false; GP.drive = false;
  if (!g) { GP.on = false; return; }
  const b = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > .5)), v = i => g.buttons[i] ? g.buttons[i].value : 0;
  const down = i => b(i) && !GP.prev[i];
  const any = g.buttons.some(x => x.pressed) || g.axes.some(a => Math.abs(a) > .3);
  if (any) { GP.on = true; GP.seen = performance.now(); }
  const p = player, [lx, ly] = gpDead(g.axes[0] || 0, g.axes[1] || 0), [rx, ry] = gpDead(g.axes[2] || 0, g.axes[3] || 0);
  if (state === 'play' && p) {
    const car = p.inCar, driving = car && p.seat === 0;
    if (lx || ly) { GP.mv = true; GP.lx = lx; GP.ly = ly; }
    // look: a curve gives fine aim near the centre and fast turns at full tilt
    if (rx || ry) lookBy(Math.sign(rx)*rx*rx*1250*dt, Math.sign(ry)*ry*ry*850*dt);
    if (driving) {
      GP.drive = true; GP.thr = v(7) - v(6); GP.hb = b(0); GP.lx = lx;
      if (down(4)) carBoost();
    } else {
      if (BLD.on) {
        if (down(7)) placeBuild();
        if (down(6)) BLD.turn++;
        if (down(14) || down(15)) { let n = BLD.type; do n = (n + (down(15) ? 1 : BUILD_TYPES.length - 1)) % BUILD_TYPES.length; while (p.inCar && n < 2); pickBuild(n); }
      } else {
        if (down(7)) { mouse.L = true; if (p.weapon === 'awp') playerFire(); }
        if (!b(7) && GP.prev[7]) mouse.L = false;
        if (down(6)) { if (p.weapon === 'awp') altFire(); else mouse.R = true; }
        if (!b(6) && GP.prev[6]) mouse.R = false;
        if (down(12) && p.weapon === 'knife' && !p.swing && p.inspect <= 0) { p.inspect = 1.6; sfx('draw', .5); }
      }
      if (down(0) && p.alive && !p.inCar) p.wantJump = true;
      if (down(1) && !p.inCar) { if (keys.has('KeyC')) keys.delete('KeyC'); else keys.add('KeyC'); }
      if (down(3)) { if (p.inCar) nextSeat(); else swapTo(p.weapon === 'awp' ? 'knife' : 'awp'); }
      if (down(4)) { const [mx, my] = moveDir(); if (mx || my) dash(p, mx, my); else dash(p, Math.cos(p.ang), Math.sin(p.ang)); }
      if (down(5)) toggleBuild();
    }
    if (down(2)) { if (p.inCar || nearCar(p)) tryCar(); else startReload(); }
    // scoreboard while Back (or D-pad down) is held
    if (down(8) || down(13)) { $('board').hidden = false; renderBoard($('boardT')); }
    if ((GP.prev[8] && !b(8)) || (GP.prev[13] && !b(13))) $('board').hidden = true;
    if (down(9)) pause();
    // rumble: a thump when you get hurt, a tick when you land a hit
    if (hurt > GP.lastHurt + .2) gpRumble(.7, .4, 160); GP.lastHurt = hurt;
    if (hitT > GP.lastHit + .1) gpRumble(.15, .5, 60); GP.lastHit = hitT;
  } else if (state === 'pause') {
    if (down(9) || down(1)) resume();
  } else if (state === 'menu') {
    if (down(9) || down(0)) $('start').click();
  } else if (state === 'end') {
    if (down(9) || down(0)) $('again').click();
  }
  GP.prev = g.buttons.map((x, i) => b(i));
  if (GP.on && performance.now() - GP.seen < 15000) $('aimPrompt').hidden = true;
}
