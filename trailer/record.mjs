// Record the trailer: node record.mjs <outdir> [preview]   (preview = run every frame, save only a few)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const [out = '/var/home/mohammed/Downloads/hr-shot/trailer-frames', preview] = process.argv.slice(2);
fs.mkdirSync(out, { recursive:true });
const FPS = 30, LEN = 48, N = FPS*LEN, keep = preview ? new Set([20, 120, 210, 260, 330, 470, 570, 600, 650, 760, 780, 840, 900, 1050, 1200, 1320, 1420]) : null;
const chrome = spawn('flatpak', ['run', 'com.google.Chrome', '--headless=new', '--remote-debugging-port=9334', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio',
  '--user-data-dir=/var/home/mohammed/Downloads/hr-shot/prof-trailer', 'about:blank'], { stdio:'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch('http://127.0.0.1:9334/json')).json(); if (tabs.find(t => t.type === 'page')) break; } catch (e) {} await sleep(500); }
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id:i, method, params })); });
await cmd('Emulation.setDeviceMetricsOverride', { width:1280, height:720, deviceScaleFactor:1, mobile:false });
await cmd('Page.navigate', { url:'http://127.0.0.1:8811/trailer.html' });
await sleep(6000);
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const r = await cmd('Runtime.evaluate', { expression:`__frame(${i})`, awaitPromise:true, returnByValue:true });
  if (r.result && r.result.exceptionDetails) console.log('frame', i, 'error', JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  if (!keep || keep.has(i)) {
    const s = await cmd('Page.captureScreenshot', { format:'jpeg', quality:90 });
    fs.writeFileSync(`${out}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
  if (i % 150 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - t0)/1000).toFixed(0)} s`);
}
const cues = await cmd('Runtime.evaluate', { expression:'JSON.stringify(window.__cues)', returnByValue:true });
fs.writeFileSync(`${out}/cues.json`, cues.result.result.value);
const cl = await cmd('Runtime.evaluate', { expression:'JSON.stringify(window.__carlog || [])', returnByValue:true }); fs.writeFileSync(`${out}/carlog.json`, cl.result.result.value);
console.log('done in', ((Date.now() - t0)/1000).toFixed(0), 's');
try { const v = await (await fetch('http://127.0.0.1:9334/json/version')).json(); const bw = new WebSocket(v.webSocketDebuggerUrl); await new Promise(r => bw.onopen = r); bw.send(JSON.stringify({ id:1, method:'Browser.close' })); await sleep(800); } catch (e) {}
chrome.kill();
spawnSync('sh', ['-c', "sleep 1; ps -eo pid,args | awk '/prof-trailer/ && !/awk/ {print $1}' | xargs -r kill -9"]);
process.exit(0);
