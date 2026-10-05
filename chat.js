/* ---------- text chat ----------
   Enter talks to everyone, Y to your team only. Online, messages ride along in presence (`chat`, last 5). */
const CHAT = { open:false, team:false, lines:[], last:0, out:[] };
function chatLine(name, color, text, team) {
  CHAT.lines.push({ name, color, text, team, t:performance.now() });
  if (CHAT.lines.length > 30) CHAT.lines.shift();
  renderChat();
}
function renderChat() {
  const box = $('chatLog'), now = performance.now(), show = CHAT.lines.filter(l => CHAT.open || now - l.t < 10000).slice(-7);
  box.replaceChildren(...show.map(l => {
    const d = document.createElement('div'), n = document.createElement('b'), tx = document.createElement('span');
    if (l.team) { const tg = document.createElement('i'); tg.textContent = '[TEAM] '; d.append(tg); }
    n.textContent = l.name + ': '; n.style.color = l.color; tx.textContent = l.text; d.append(n, tx);
    d.style.opacity = CHAT.open ? 1 : clamp((10000 - (now - l.t))/1500, 0, 1);
    return d;
  }));
  box.hidden = !show.length;
}
function openChat(team) {
  if (state !== 'play' || !player) return;
  CHAT.open = true; CHAT.team = team; keys.clear(); mouse.L = mouse.R = false;
  $('chatBar').hidden = false; $('chatTo').textContent = team ? 'TEAM' : 'ALL'; $('chatTo').classList.toggle('team', team);
  $('chatIn').value = ''; $('chatIn').focus(); renderChat();
}
function closeChat() { CHAT.open = false; $('chatBar').hidden = true; $('chatIn').blur(); renderChat(); }
function sendChat() {
  const text = cleanText($('chatIn').value, 120);
  closeChat();
  if (!text || performance.now() - CHAT.last < 300) return;
  CHAT.last = performance.now();
  chatLine(NET.on ? NET.nick || 'You' : 'You', TEAMS[player.team] ? TEAMS[player.team].color : '#ece6da', text, CHAT.team);
  if (NET.on) { NET.chat.push({ q:++NET.seq, t:text, tm:CHAT.team ? 1 : 0 }); if (NET.chat.length > 5) NET.chat.shift(); }
}
function readChatNet(p, pr, e, seen) {
  if (!Array.isArray(pr.chat)) return;
  for (const m of pr.chat.slice(-5)) {
    const q = +(m && m.q) || 0; if (q <= seen.ch) continue; seen.ch = q;
    if (m.tm && e.team !== player.team) continue;
    const text = cleanText(m.t, 120); if (text) { chatLine(e.name, e.color, text, !!m.tm); sfx('click', .35); }
  }
}
