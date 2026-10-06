/* ---------- recording kit ----------
   F8 starts/stops recording, F9 saves the last 30 seconds (when the replay buffer is on).
   The video is the 3D view with the HUD painted on top (kill feed, callouts, health, ammo, crosshair) and the
   game's sounds; it downloads as MP4 where the browser can record MP4 (Chrome), otherwise WebM. */
const REC = { on:false, mr:null, chunks:[], t0:0, replay:store.get('hr-replay', '0') === '1', rmr:null, rhead:null, rtail:[],
  canvas:null, ctx:null, dest:null, height:+store.get('hr-rec-h', '720') || 720, hud:store.get('hr-rec-hud', '1') !== '0', fps:30, active:false };
function recMime() {
  if (!window.MediaRecorder) return '';
  for (const m of ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
// every game sound goes through one bus so the recorder can listen to it
function sfxOut() {
  if (!AC.__out) { AC.__out = AC.createGain(); AC.__out.connect(AC.destination); }
  return AC.__out;
}
function recStream() {
  if (!REC.canvas) { REC.canvas = document.createElement('canvas'); REC.ctx = REC.canvas.getContext('2d'); }
  const h = REC.height, w = Math.round(h*(cv.width/cv.height || 16/9)/2)*2;
  REC.canvas.width = w; REC.canvas.height = h;
  const s = REC.canvas.captureStream(REC.fps);
  if (!AC) sfx('click', .0001);
  if (AC) { if (!REC.dest) { REC.dest = AC.createMediaStreamDestination(); sfxOut().connect(REC.dest); } for (const t of REC.dest.stream.getAudioTracks()) s.addTrack(t); }
  return s;
}
function recName(ext) { const d = new Date(), p = n => String(n).padStart(2, '0'); return `drift-and-bolt-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`; }
function recSave(chunks, mime) {
  const blob = new Blob(chunks, { type:mime.split(';')[0] }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = recName(mime.includes('mp4') ? 'mp4' : 'webm'); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  recToast(`Saved ${a.download} (${(blob.size/1048576).toFixed(1)} MB) to your downloads`);
}
function recToast(msg) { const el = $('recMsg'); el.textContent = msg; el.hidden = false; clearTimeout(recToast.t); recToast.t = setTimeout(() => el.hidden = true, 3500); }
function recToggle() {
  const mime = recMime();
  if (!mime) { recToast("This browser can't record video"); return; }
  if (REC.on) { REC.on = false; REC.mr.stop(); return; }
  const mr = new MediaRecorder(recStream(), { mimeType:mime, videoBitsPerSecond:REC.height >= 1080 ? 9e6 : 5e6 });
  REC.chunks = []; mr.ondataavailable = e => { if (e.data.size) REC.chunks.push(e.data); };
  mr.onstop = () => recSave(REC.chunks, mime);
  mr.start(1000); REC.mr = mr; REC.on = true; REC.t0 = performance.now();
  recToast('Recording (F8 to stop)');
}
// instant replay: keep the first chunk (the file header) plus the newest 30 seconds
function replayStart() {
  // WebM here: it hands over data every second (Chrome's MP4 recorder doesn't), which the rolling buffer needs
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)); if (!mime || REC.rmr) return;
  const mr = new MediaRecorder(recStream(), { mimeType:mime, videoBitsPerSecond:4e6 });
  REC.rhead = null; REC.rtail = [];
  mr.ondataavailable = e => { if (!e.data.size) return; if (!REC.rhead) REC.rhead = e.data; else { REC.rtail.push(e.data); if (REC.rtail.length > 30) REC.rtail.shift(); } };
  mr.start(1000); REC.rmr = mr; REC.rmime = mime;
}
function replayStop() { if (REC.rmr) { try { REC.rmr.stop(); } catch (e) {} REC.rmr = null; } }
function replaySave() {
  if (!REC.rmr || !REC.rhead) { recToast(REC.replay ? 'Replay is still warming up' : 'Turn on the replay buffer in the pause menu first'); return; }
  REC.rmr.requestData();
  setTimeout(() => recSave([REC.rhead, ...REC.rtail], REC.rmime), 150);
}
// paint the frame we just rendered, plus the HUD, onto the recording canvas
function recFrame() {
  REC.active = REC.on || !!REC.rmr;
  if (!REC.active) return;
  const c = REC.ctx, W = REC.canvas.width, H = REC.canvas.height, k = H/720;
  c.drawImage(cv, 0, 0, W, H);
  if (!REC.hud || state === 'menu') return recMark(c, W, H, k);
  const font = (px, fam = 'body', wt = 700) => { c.font = `${wt} ${Math.round(px*k)}px ${fam === 'display' ? '"Saira Stencil One", Impact, sans-serif' : '"Chakra Petch", sans-serif'}`; };
  const txt = (s, x, y, color = '#ece6da', align = 'left') => { c.textAlign = align; c.lineWidth = 4*k; c.strokeStyle = 'rgba(0,0,0,.65)'; c.strokeText(s, x, y); c.fillStyle = color; c.fillText(s, x, y); };
  if (!$('scope').hidden) { const g = c.createRadialGradient(W/2, H/2, H*.44, W/2, H/2, H*.46); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  if (!$('cross').hidden) { c.strokeStyle = '#ece6da'; c.lineWidth = 2*k; c.beginPath(); for (const [a, b, d, e] of [[-14, 0, -5, 0], [5, 0, 14, 0], [0, -14, 0, -5], [0, 5, 0, 14]]) { c.moveTo(W/2 + a*k, H/2 + b*k); c.lineTo(W/2 + d*k, H/2 + e*k); } c.stroke(); }
  if (!$('hud').hidden) {
    font(34, 'display'); txt($('clock').textContent, W/2, 44*k, '#ece6da', 'center');
    font(13, 'body', 600); txt($('hudSub').textContent, W/2, 66*k, '#c9ccd0', 'center');
    font(48, 'display'); txt('+ ' + $('hpN').textContent, 22*k, H - 30*k);
    font(12); txt($('wName').textContent, W - 22*k, H - 74*k, '#98a2ab', 'right');
    font(38, 'display'); txt($('ammo').textContent.replace(/\s+/g, ' '), W - 22*k, H - 32*k, '#ece6da', 'right');
    const car = $('carHud').textContent.trim(); if (car) { font(12); txt(car.replace(/\s+/g, ' '), W/2, H - 22*k, '#98a2ab', 'center'); }
  }
  // kill feed
  let y = 34*k; font(14);
  for (const el of $('feed').children) {
    const n = el.querySelectorAll('.n'); if (n.length < 2) continue;
    const a = n[0].textContent, b = n[1].textContent, op = +getComputedStyle(el).opacity; if (op < .05) continue;
    c.globalAlpha = op; const wb = c.measureText(b).width;
    txt(b, W - 20*k, y, n[1].style.color || '#ece6da', 'right'); txt('✕', W - 30*k - wb, y, '#f0a23b', 'right'); txt(a, W - 48*k - wb, y, n[0].style.color || '#ece6da', 'right');
    c.globalAlpha = 1; y += 26*k;
  }
  // callout (KILL, HEADSHOT, ROADKILL...)
  const co = $('callout'), op = +getComputedStyle(co).opacity;
  if (op > .02 && co.firstChild) {
    c.globalAlpha = op; font(64, 'display'); txt(co.firstChild.textContent, W/2, H*.3, '#ece6da', 'center');
    const sm = co.querySelector('small'); if (sm) { font(13); txt(sm.textContent, W/2, H*.3 + 26*k, '#f0a23b', 'center'); }
    c.globalAlpha = 1;
  }
  // chat
  let cy = H - 120*k; font(13, 'body', 600);
  for (const el of [...$('chatLog').children].reverse()) { const o = +el.style.opacity || 1; c.globalAlpha = o; txt(el.textContent, 22*k, cy, '#ece6da'); c.globalAlpha = 1; cy -= 20*k; }
  recMark(c, W, H, k);
  if (REC.on) { const s = Math.floor((performance.now() - REC.t0)/1000); $('recInd').textContent = `● REC ${s/60 | 0}:${String(s % 60).padStart(2, '0')}`; }
}
function recMark(c, W, H, k) {
  c.globalAlpha = .55; c.font = `700 ${Math.round(11*k)}px "Chakra Petch", sans-serif`; c.textAlign = 'right'; c.fillStyle = '#ece6da';
  c.fillText('DRIFT AND BOLT · scratchie018.github.io/bay4', W - 14*k, H - 8*k); c.globalAlpha = 1;
}
function recUi() {
  $('recInd').hidden = !REC.on; if (!REC.on) $('recInd').textContent = '● REC';
  $('replayInd').hidden = !(REC.replay && REC.rmr);
  $('recBtn').textContent = REC.on ? 'Stop recording (F8)' : 'Record (F8)';
  $('replayBtn').textContent = `Replay buffer: ${REC.replay ? 'on' : 'off'}`; $('replayBtn').setAttribute('aria-pressed', REC.replay);
  $('recHudBtn').textContent = `HUD in clips: ${REC.hud ? 'on' : 'off'}`;
  $('recQBtn').textContent = `Quality: ${REC.height}p`;
}
