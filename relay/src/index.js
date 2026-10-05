// Hook & Ring relay: passes game updates between the players in a room over WebSockets.
// One Durable Object per room. Uses the hibernation API so idle rooms cost nothing.
// Messages (JSON):
//   client -> relay  {t:'p', p:{...presence}}            my latest state
//                    {t:'getmap'}                         ask the host for the room's map
//                    {t:'map', to:id, d:{...}}            (host only) a piece of the map for one player
//   relay -> client  {t:'hello', id, host, peers:[{id,p}]}
//                    {t:'p', id, p}  {t:'left', id}  {t:'host', id}
//                    {t:'getmap', from:id}  {t:'map', d:{...}}
const ALLOWED = ['https://scratchie018.github.io', 'http://127.0.0.1', 'http://localhost'];
const MAX_PLAYERS = 20, MAX_MSG = 16384, MAX_RATE = 40;   // messages per second per player

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('Origin') || '';
    if (url.pathname === '/') return new Response('Hook & Ring relay is running.', { headers:{ 'content-type':'text/plain' } });
    const m = url.pathname.match(/^\/room\/([a-z0-9-]{1,80})$/);
    if (!m) return new Response('Not found', { status:404 });
    if (!ALLOWED.some(a => origin === a || origin.startsWith(a + ':'))) return new Response('Not allowed', { status:403 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status:426 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
  },
};

export class Room {
  constructor(state) { this.state = state; this.presence = new Map(); }
  sockets() { return this.state.getWebSockets(); }
  info(ws) { return ws.deserializeAttachment() || {}; }
  hostId(except) {
    let best = null;
    for (const ws of this.sockets()) { if (ws === except) continue; const a = this.info(ws); if (!best || a.joined < best.joined || (a.joined === best.joined && a.id < best.id)) best = a; }
    return best ? best.id : null;
  }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) {} }
  broadcast(msg, except) { const s = JSON.stringify(msg); for (const ws of this.sockets()) if (ws !== except) { try { ws.send(s); } catch (e) {} } }

  async fetch(req) {
    if (this.sockets().length >= MAX_PLAYERS) return new Response('Room is full', { status:429 });
    const [client, server] = Object.values(new WebSocketPair());
    const id = crypto.randomUUID().slice(0, 12);
    server.serializeAttachment({ id, joined:Date.now(), win:0, n:0 });
    this.state.acceptWebSocket(server);
    const peers = [];
    for (const ws of this.sockets()) { const a = this.info(ws); if (a.id !== id) peers.push({ id:a.id, p:this.presence.get(a.id) || null }); }
    this.send(server, { t:'hello', id, host:this.hostId(), peers });
    return new Response(null, { status:101, webSocket:client });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    const a = this.info(ws), now = Date.now();
    // simple flood protection: at most MAX_RATE messages per second
    if (now - a.win > 1000) { a.win = now; a.n = 0; }
    if (++a.n > MAX_RATE) return;
    ws.serializeAttachment(a);
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg.t === 'p' && msg.p && typeof msg.p === 'object') { this.presence.set(a.id, msg.p); this.broadcast({ t:'p', id:a.id, p:msg.p }, ws); }
    else if (msg.t === 'getmap') { const h = this.hostId(); for (const s of this.sockets()) if (this.info(s).id === h && s !== ws) this.send(s, { t:'getmap', from:a.id }); }
    else if (msg.t === 'map' && a.id === this.hostId() && typeof msg.to === 'string') { for (const s of this.sockets()) if (this.info(s).id === msg.to) this.send(s, { t:'map', d:msg.d }); }
  }
  async webSocketClose(ws) { this.left(ws); }
  async webSocketError(ws) { this.left(ws); }
  left(ws) {
    const a = this.info(ws), wasHost = this.hostId() === a.id;
    this.presence.delete(a.id);
    try { ws.close(1000, 'bye'); } catch (e) {}
    this.broadcast({ t:'left', id:a.id }, ws);
    if (wasHost) { const h = this.hostId(ws); if (h) this.broadcast({ t:'host', id:h }, ws); }
  }
}
