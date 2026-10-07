/* ---------- CrazyGames build ----------
   SDK v3: loading/gameplay events, rooms + invites (inviteParams carry the room's settings so friends land in a
   matching match), instant multiplayer, join-room listener, CrazyGames usernames, chat moderation and the
   platform's disableChat / muteAudio settings. Voice chat, custom maps and clip downloads are off in this build. */
const CG = { S:null, on:false, user:null, chatOff:false, joinable:null, roomKey:'', playing:false, userMuted:false };

// --- moderation: a basic profanity filter for chat and names (whole words, plus a few unambiguous stems) ---
const CG_WORDS = new Set(['fuck', 'fucker', 'fucking', 'fck', 'fuk', 'shit', 'shitty', 'bitch', 'bitches', 'cunt', 'dick', 'dickhead', 'cock', 'pussy', 'asshole', 'ass', 'arse', 'bastard',
  'slut', 'whore', 'wanker', 'twat', 'prick', 'nigger', 'nigga', 'niggas', 'faggot', 'fag', 'fags', 'retard', 'retarded', 'tranny', 'kys', 'rape', 'rapist', 'porn', 'penis', 'vagina', 'boobs',
  'tits', 'cum', 'jizz', 'dildo', 'nazi', 'hitler', 'kike', 'spic', 'chink', 'gook', 'wetback', 'coon', 'dyke', 'motherfucker', 'mf', 'stfu', 'gtfo', 'pedo', 'pedophile', 'molest']);
const CG_STEMS = ['fuck', 'nigg', 'fagg', 'cunt', 'motherf', 'shithead', 'bitch', 'whore', 'rapist', 'retard', 'pedophil'];
const cgNorm = w => w.toLowerCase().replace(/[0]/g, 'o').replace(/[1!|]/g, 'i').replace(/[3]/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/[7]/g, 't').replace(/[^a-z]/g, '').replace(/(.)\1{2,}/g, '$1$1');
function cgClean(s) {
  if (!s) return s;
  return String(s).replace(/[^\s]+/g, w => {
    const n = cgNorm(w), n1 = n.replace(/(.)\1+/g, '$1');
    return CG_WORDS.has(n) || CG_WORDS.has(n1) || CG_STEMS.some(b => n1.includes(b) || n.includes(b)) ? '*'.repeat(Math.min(8, w.length)) : w;
  });
}

// --- features this build doesn't have ---
VC.mode = 'off'; voiceStart = async () => {};
recToggle = () => {}; replaySave = () => {}; REC.replay = false;
loadMapFile = async () => {}; savedCustom = null; mapDB.get = async () => null;
if (mapChoice === 'custom') mapChoice = 'bay4';

// --- chat: filtered both ways; hidden entirely when CrazyGames says chat is off ---
{ const l0 = chatLine; chatLine = (n, col, t, team) => { if (CG.chatOff) return; l0(cgClean(n), col, cgClean(t), team); }; }
{ const o0 = openChat; openChat = team => { if (CG.chatOff) return; o0(team); }; }
{ const s0 = sendChat; sendChat = () => { $('chatIn').value = cgClean($('chatIn').value); s0(); }; }
function cgApplySettings(st) {
  CG.chatOff = !!(st && st.disableChat);
  $('chatBtn').hidden = CG.chatOff; if (CG.chatOff) { CHAT.lines = []; renderChat(); if (CHAT.open) closeChat(); }
  muted = !!(st && st.muteAudio) || CG.userMuted;
}
addEventListener('keydown', e => { if (e.code === 'KeyM' && !CHAT.open) CG.userMuted = !CG.userMuted; }, true);
// iOS: wake the audio up from a tap or click
for (const ev of ['touchend', 'click']) addEventListener(ev, () => { if (AC && AC.state !== 'running') AC.resume(); }, { passive:true });

// --- usernames ---
function cgSetUser(u) {
  CG.user = u || null;
  if (u && u.username) {
    NET.nick = cleanText(cgClean(u.username), 14) || NET.nick;
    $('nick').value = NET.nick; $('nick').disabled = true; $('nick').title = 'Your CrazyGames username';
  } else { $('nick').disabled = false; $('nick').title = ''; }
}
$('nick').addEventListener('change', () => { if (!CG.user) { NET.nick = cleanText(cgClean($('nick').value), 14) || NET.nick; $('nick').value = NET.nick; } });

// --- rooms and invites ---
const cgParams = () => ({ room:NET.code, md:mode, ty:String(TEAM), du:DUOS ? '1' : '0', vh:carsOn ? '1' : '0', mp:mapChoice.startsWith('b:') || mapChoice === 'bay4' ? mapChoice : 'bay4', cx:NET.cheatsRoom ? '1' : '0' });
function cgRoomUpdate() {
  if (!CG.on) return;
  if (!NET.on) { if (CG.roomKey) { CG.roomKey = ''; CG.joinable = null; try { CG.S.game.leftRoom(); } catch (e) {} } return; }
  const players = ents.filter(e => e.remote).length + 1, joinable = players < 16, key = NET.code + '|' + joinable;
  if (key === CG.roomKey) return;
  CG.roomKey = key;
  const p = cgParams();
  try {
    CG.S.game.updateRoom({ roomId:`${mode}-${DUOS ? 'duo' : 't' + TEAM}-${NET.code}`, isJoinable:joinable, inviteParams:p });
  } catch (e) {}
}
// take on the inviter's settings, then go straight into their room (no menu)
function cgJoin(p) {
  if (!p || !p.room) return;
  if (NET.on) { leaveOnline(); toMenu(); }
  if (p.md === 'awp' || p.md === 'knife') $('m-' + p.md).click();
  const tb = [...$('teamPick').children].find(b => b.dataset.m === (p.du === '1' ? 'duos' : String(clamp(parseInt(p.ty) || 2, 1, 8)))); if (tb) tb.click();
  const cb = [...$('carPick').children].find(b => b.dataset.c === (p.vh === '0' ? '0' : '1')); if (cb) cb.click();
  if (p.mp && (p.mp === 'bay4' || BUILTIN_MAPS.some(m => 'b:' + m.id === p.mp))) { mapChoice = p.mp; syncMapUi(); }
  if ((p.cx === '1') !== NET.cheatsRoom) $('cheatsRoom').click();
  $('roomCode').value = cleanCode(p.room);
  cgWhenReady(() => $('startOnline').click());
}
function cgWhenReady(fn, tries = 0) { if (!$('startOnline').disabled) fn(); else if (tries < 80) setTimeout(() => cgWhenReady(fn, tries + 1), 250); }

async function cgInit() {
  const S = window.CrazyGames && window.CrazyGames.SDK;
  if (!S) return;
  try { await S.init(); } catch (e) { return; }
  if (S.environment === 'disabled') return;
  CG.S = S; CG.on = true;
  try { S.game.loadingStart(); } catch (e) {}
  cgApplySettings(S.game.settings);
  try { S.game.addSettingsChangeListener(cgApplySettings); } catch (e) {}
  try {
    if (S.user.isUserAccountAvailable) {
      cgSetUser(await S.user.getUser());
      S.user.addAuthListener(cgSetUser);
    }
  } catch (e) {}
  try { S.game.addJoinRoomListener(cgJoin); } catch (e) {}
  try { S.game.loadingStop(); } catch (e) {}
  // an invite link, or "instant multiplayer" from the CrazyGames page: straight into a room
  let p = null; try { p = S.game.inviteParams; } catch (e) {}
  if (p && p.room) cgJoin(p);
  else if (S.game.isInstantMultiplayer) { $('roomCode').value = 'cg' + Math.random().toString(36).slice(2, 8); cgWhenReady(() => $('startOnline').click()); }
}
// gameplay start/stop follow the match state; rooms follow online state; a win is a happy time
setInterval(() => {
  if (!CG.on) return;
  const playing = state === 'play' && !document.hidden;
  if (playing !== CG.playing) { CG.playing = playing; try { playing ? CG.S.game.gameplayStart() : CG.S.game.gameplayStop(); } catch (e) {} }
  cgRoomUpdate();
}, 250);
{ const c0 = callout; callout = (b, s) => { c0(b, s); if (CG.on && /WIN/.test(b) && (/^YOU/.test(b) || /YOUR/.test(s || ''))) try { CG.S.game.happytime(); } catch (e) {} }; }
{ const e0 = endMatch; endMatch = why => { e0(why); if (CG.on && /^(You|Your)/.test($('endTitle').textContent)) try { CG.S.game.happytime(); } catch (e) {} }; }
cgInit();
