// recorded sound effects: decoded once the audio context exists; until then (or if decoding fails) the synth plays
const SFXB = {};
let sfxLoading = false;
function sfxLoad() {
  if (sfxLoading || !AC) return; sfxLoading = true;
  for (const [k, b64] of Object.entries(SFX_DATA)) {
    try {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      AC.decodeAudioData(u.buffer, buf => { SFXB[k] = buf; }, () => {});
    } catch (e) {}
  }
}
// a little pitch variation so repeated hits and slashes don't sound like a loop (not on the big one-offs)
const SFX_STEADY = new Set(['awp', 'boom', 'bolt', 'draw', 'click']);
function sfxSample(t, vol) {
  const b = SFXB[t]; if (!b) return false;
  const s = AC.createBufferSource(), g = AC.createGain();
  s.buffer = b; if (!SFX_STEADY.has(t)) s.playbackRate.value = .94 + Math.random()*.12;
  g.gain.value = Math.min(1.5, vol); s.connect(g); g.connect(typeof sfxOut === 'function' ? sfxOut() : AC.destination); s.start();   // the claude.ai build has no recorder bus
  return true;
}
