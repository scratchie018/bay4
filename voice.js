/* ---------- proximity voice chat (GitHub version, through the relay) ----------
   Mic audio is resampled to 12 kHz, packed 8 bits a sample (mu-law, like a phone line) in 80 ms chunks and sent
   through the relay. Each voice plays from where that player stands: louder up close, panned left/right, silent
   past ~30 m and muffled behind walls. Push to talk on V (or the TALK button), or open mic. */
const VC = { mode:store.get('hr-voice', 'ptt'), vol:+store.get('hr-voice-vol', '1') || 1, ac:null, mic:null, proc:null, src:null, out:null,
  ptt:false, talking:false, level:0, buf:[], peers:new Map(), err:'', seq:0 };
const VRATE = 12000, VCHUNK = 960;   // 80 ms
function muEnc(x) { const s = x < 0 ? 0x80 : 0; let m = Math.min(32635, Math.abs(x)*32767) + 132, e = 7; for (let b = 0x4000; e > 0 && !(m & b); b >>= 1) e--; return ~(s | (e << 4) | ((m >> (e + 3)) & 15)) & 255; }
const MU_DEC = new Float32Array(256);
for (let i = 0; i < 256; i++) { const u = ~i & 255, s = u & 0x80, e = (u >> 4) & 7, m = u & 15; const v = (((m << 3) + 132) << e) - 132; MU_DEC[i] = (s ? -v : v)/32768; }
const voiceOK = () => !!(NET.on && NET.room && NET.room.voice && VC.mode !== 'off');
async function voiceStart() {
  if (VC.mic || VC.mode === 'off' || !NET.room || !NET.room.voice) return;
  try {
    VC.ac = VC.ac || new AudioContext();
    VC.mic = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 } });
    if (!NET.on) { voiceStop(); return; }
    const ac = VC.ac; if (ac.state !== 'running') ac.resume();
    VC.src = ac.createMediaStreamSource(VC.mic);
    VC.proc = ac.createScriptProcessor(2048, 1, 1);
    const ratio = ac.sampleRate/VRATE; let pos = 0;
    VC.proc.onaudioprocess = ev => {
      const d = ev.inputBuffer.getChannelData(0); let pk = 0;
      for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      VC.level = VC.level*.7 + pk*.3;
      const send = VC.mode === 'open' ? VC.level > .02 : VC.ptt;
      VC.talking = send && player && NET.on;
      if (!VC.talking) { VC.buf.length = 0; pos = 0; return; }
      // resample to 12 kHz by averaging each span of input samples
      for (; pos + ratio <= d.length; pos += ratio) { let s = 0, n = 0; for (let j = pos | 0; j < (pos + ratio | 0); j++) { s += d[j]; n++; } VC.buf.push(n ? s/n : 0); }
      pos -= d.length;
      while (VC.buf.length >= VCHUNK) {
        const chunk = VC.buf.splice(0, VCHUNK), bytes = new Uint8Array(VCHUNK);
        for (let i = 0; i < VCHUNK; i++) bytes[i] = muEnc(Math.max(-1, Math.min(1, chunk[i]*1.4)));
        let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        NET.room.voice(btoa(bin));
      }
    };
    const mute = ac.createGain(); mute.gain.value = 0;   // the processor must be connected to run; send it nowhere audible
    VC.src.connect(VC.proc); VC.proc.connect(mute); mute.connect(ac.destination);
    VC.err = '';
  } catch (e) { VC.err = e && e.name === 'NotAllowedError' ? 'Microphone blocked: allow it in the address bar to talk' : 'No microphone found'; VC.mic = null; }
}
function voiceStop() {
  if (VC.proc) { VC.proc.onaudioprocess = null; try { VC.proc.disconnect(); VC.src.disconnect(); } catch (e) {} }
  if (VC.mic) for (const t of VC.mic.getTracks()) t.stop();
  VC.mic = VC.proc = VC.src = null; VC.talking = false; VC.ptt = false;
  for (const p of VC.peers.values()) try { p.out.disconnect(); } catch (e) {}
  VC.peers.clear();
}
function voicePeer(id) {
  let p = VC.peers.get(id);
  if (p) return p;
  const ac = VC.ac || (VC.ac = new AudioContext());
  const lp = ac.createBiquadFilter(), pan = ac.createPanner(), out = ac.createGain();
  lp.type = 'lowpass'; lp.frequency.value = 6000;
  Object.assign(pan, { panningModel:'HRTF', distanceModel:'linear', refDistance:2, maxDistance:30, rolloffFactor:1 });
  out.gain.value = VC.vol;
  lp.connect(pan); pan.connect(out); out.connect(ac.destination);
  p = { lp, pan, out, next:0, heard:0 }; VC.peers.set(id, p);
  return p;
}
function voiceIn(id, b64) {
  if (VC.mode === 'off' || typeof b64 !== 'string' || b64.length > 4000) return;
  const e = remoteFor(id); if (!e) return;
  const p = voicePeer(id), ac = VC.ac; if (ac.state !== 'running') ac.resume();
  let bin; try { bin = atob(b64); } catch (er) { return; }
  const n = bin.length, buf = ac.createBuffer(1, n, VRATE), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = MU_DEC[bin.charCodeAt(i) & 255];
  // a small jitter buffer: start ~120 ms late so packets arriving unevenly still play smoothly
  const now = ac.currentTime;
  if (p.next < now || p.next > now + .5) p.next = now + .12;
  const s = ac.createBufferSource(); s.buffer = buf; s.connect(p.lp); s.start(p.next); p.next += n/VRATE;
  p.heard = performance.now();
}
// every frame: put each voice where its player is, muffle it behind walls
function updVoice() {
  if (!VC.ac || !player) return;
  const L = VC.ac.listener, t = VC.ac.currentTime, f = new THREE.Vector3(); camera.getWorldDirection(f);
  const set = (prm, v) => prm ? prm.setTargetAtTime(v, t, .03) : 0;
  if (L.positionX) { set(L.positionX, camera.position.x); set(L.positionY, camera.position.y); set(L.positionZ, camera.position.z); set(L.forwardX, f.x); set(L.forwardY, f.y); set(L.forwardZ, f.z); set(L.upX, 0); set(L.upY, 1); set(L.upZ, 0); }
  else { L.setPosition(camera.position.x, camera.position.y, camera.position.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
  for (const [id, p] of VC.peers) {
    const e = remoteFor(id); if (!e) { try { p.out.disconnect(); } catch (er) {} VC.peers.delete(id); continue; }
    const x = e.x*S, y = (e.jumpY || 0) + 1.6, z = e.y*S;
    if (p.pan.positionX) { set(p.pan.positionX, x); set(p.pan.positionY, y); set(p.pan.positionZ, z); } else p.pan.setPosition(x, y, z);
    const walled = !los(player, e);
    set(p.lp.frequency, walled ? 900 : 6000); set(p.out.gain, VC.vol*(walled ? .55 : 1));
  }
}
function voiceHudText() {
  if (!NET.on) return '';
  if (!NET.room || !NET.room.voice) return VC.mode === 'off' ? '' : '<span class="k">Voice needs the relay connection</span>';
  if (VC.mode === 'off') return '';
  const now = performance.now(), names = [];
  for (const [id, p] of VC.peers) if (now - p.heard < 350) { const e = remoteFor(id); if (e) names.push(`<span style="color:${e.color}">🔊 ${escH(e.name)}</span>`); }
  const me = VC.err ? `<span class="k">${escH(VC.err)}</span>` : VC.talking ? '<b>🎤 TALKING</b>' : `<span class="k">🎤 ${VC.mode === 'open' ? 'open mic' : touchMode ? 'hold TALK' : 'hold V to talk'}</span>`;
  return [me, ...names].join('');
}
