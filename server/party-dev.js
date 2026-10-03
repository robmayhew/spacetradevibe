const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const STALE_MS = 1000;
const DROP_MS = 8000;

function code(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

function token() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
}

function now() {
  return Date.now();
}

function nextColor(escorts) {
  const used = new Set(escorts.map((e) => e.color));
  for (let i = 0; i < 4; i++) if (!used.has(i)) return i;
  return 0;
}

function clampAxis(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

export function createPartyStore() {
  const rooms = new Map();

  function prune() {
    const stale = now() - 2 * 60 * 60 * 1000;
    for (const [c, room] of rooms) {
      if (room.touched < stale) rooms.delete(c);
    }
  }

  function getRoom(c) {
    prune();
    const room = rooms.get(c);
    if (!room) {
      const err = new Error('Room is gone.');
      err.status = 404;
      throw err;
    }
    room.touched = now();
    return room;
  }

  function auth(room, tok) {
    if (room.hostToken === tok) return { role: 'host', peer: room.hostPeer };
    const e = room.escorts.find((x) => x.token === tok);
    if (e) return { role: 'escort', peer: e.id, color: e.color, callsign: e.callsign };
    const err = new Error('Bad party token.');
    err.status = 403;
    throw err;
  }

  function dropSilent(room) {
    const cutoff = now() - DROP_MS;
    const dead = [];
    for (const [peer, live] of room.live) {
      if (live.updated < cutoff) dead.push(peer);
    }
    if (!dead.length) return;
    for (const peer of dead) room.live.delete(peer);
    room.escorts = room.escorts.filter((e) => !dead.includes(e.id));
  }

  return {
    handle(body) {
      prune();
      const action = body?.action;
      if (action === 'create') {
        let c;
        do c = code();
        while (rooms.has(c));
        const hostPeer = code(8);
        const tok = token();
        rooms.set(c, {
          code: c,
          hostToken: tok,
          hostPeer,
          escorts: [],
          live: new Map(),
          touched: now(),
        });
        return { ok: true, room: c, peer: hostPeer, token: tok, role: 'host' };
      }
      if (action === 'join') {
        const c = String(body.room || '').toUpperCase();
        if (!/^[A-Z0-9]{5}$/.test(c)) {
          const err = new Error('Invalid room.');
          err.status = 400;
          throw err;
        }
        const room = getRoom(c);
        if (room.escorts.length >= 4) {
          const err = new Error('This crew is full.');
          err.status = 409;
          throw err;
        }
        let callsign = String(body.callsign || '').trim() || 'ESCORT';
        if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/.test(callsign)) {
          const err = new Error('Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
          err.status = 400;
          throw err;
        }
        const peer = code(8);
        const tok = token();
        const color = nextColor(room.escorts);
        room.escorts.push({ id: peer, token: tok, callsign, color });
        room.live.set(peer, { mx: 0, my: 0, fire: 0, hull: 1, maxHull: 1, mode: 'wait', updated: now() });
        return { ok: true, room: c, peer, token: tok, role: 'escort', host: room.hostPeer, color, callsign };
      }
      if (action === 'input') {
        const room = getRoom(String(body.room || '').toUpperCase());
        const who = auth(room, String(body.token || ''));
        if (who.role !== 'escort') {
          const err = new Error('Only an escort can send the pad.');
          err.status = 403;
          throw err;
        }
        const prev = room.live.get(who.peer) || { hull: 1, maxHull: 1, mode: 'wait' };
        room.live.set(who.peer, {
          ...prev,
          mx: clampAxis(body.mx),
          my: clampAxis(body.my),
          fire: body.fire ? 1 : 0,
          updated: now(),
        });
        return { ok: true };
      }
      if (action === 'vitals') {
        const room = getRoom(String(body.room || '').toUpperCase());
        const who = auth(room, String(body.token || ''));
        if (who.role !== 'host') {
          const err = new Error('Only the host can send vitals.');
          err.status = 403;
          throw err;
        }
        const mode = body.mode === 'travel' ? 'travel' : 'wait';
        const hulls = Array.isArray(body.hulls) ? body.hulls.slice(0, 4) : [];
        const byPeer = new Map();
        for (const row of hulls) {
          const peer = String(row?.peer || '').toUpperCase();
          if (!/^[A-Z0-9]{8}$/.test(peer)) continue;
          let hull = Number(row.hull);
          let maxHull = Number(row.maxHull);
          if (!Number.isFinite(hull) || hull < 0) hull = 0;
          if (!Number.isFinite(maxHull) || maxHull < 1) maxHull = 1;
          byPeer.set(peer, { hull, maxHull });
        }
        for (const e of room.escorts) {
          const prev = room.live.get(e.id) || { mx: 0, my: 0, fire: 0, updated: now() };
          const hull = byPeer.get(e.id);
          room.live.set(e.id, {
            ...prev,
            mode,
            hull: hull ? hull.hull : prev.hull ?? 1,
            maxHull: hull ? hull.maxHull : prev.maxHull ?? 1,
          });
        }
        return { ok: true };
      }
      if (action === 'poll') {
        const room = getRoom(String(body.room || '').toUpperCase());
        const who = auth(room, String(body.token || ''));
        if (who.role === 'host') {
          dropSilent(room);
          const escorts = room.escorts.map((e) => {
            const live = room.live.get(e.id);
            const fresh = live && now() - live.updated <= STALE_MS;
            return {
              id: e.id,
              callsign: e.callsign,
              color: e.color ?? 0,
              mx: fresh ? live.mx : 0,
              my: fresh ? live.my : 0,
              fire: fresh ? live.fire : 0,
              hull: live?.hull ?? 1,
              maxHull: live?.maxHull ?? 1,
            };
          });
          return { ok: true, escorts };
        }
        const live = room.live.get(who.peer);
        return {
          ok: true,
          mode: live?.mode === 'travel' ? 'travel' : 'wait',
          hull: live?.hull ?? 1,
          maxHull: live?.maxHull ?? 1,
          color: who.color ?? 0,
          callsign: who.callsign ?? 'ESCORT',
        };
      }
      if (action === 'leave') {
        const c = String(body.room || '').toUpperCase();
        const room = getRoom(c);
        const who = auth(room, String(body.token || ''));
        if (who.role === 'host') {
          rooms.delete(c);
          return { ok: true };
        }
        room.escorts = room.escorts.filter((e) => e.id !== who.peer);
        room.live.delete(who.peer);
        return { ok: true };
      }
      if (action === 'drop') {
        const room = getRoom(String(body.room || '').toUpperCase());
        const who = auth(room, String(body.token || ''));
        if (who.role !== 'host') {
          const err = new Error('Only the host can drop an escort.');
          err.status = 403;
          throw err;
        }
        const peer = String(body.peer || '').toUpperCase();
        room.escorts = room.escorts.filter((e) => e.id !== peer);
        room.live.delete(peer);
        return { ok: true };
      }
      const err = new Error('Unknown action.');
      err.status = 400;
      throw err;
    },
  };
}

export function partyDevPlugin() {
  const store = createPartyStore();

  function isParty(req) {
    const raw = req.originalUrl || req.url || '';
    let pathname = raw.split('?')[0];
    try {
      pathname = new URL(raw, 'http://party.local').pathname;
    } catch {
      /* keep split path */
    }
    return pathname === '/api/party.php';
  }

  function handleReq(req, res) {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'POST a party action.' }));
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body = raw ? JSON.parse(raw) : {};
        const data = store.handle(body);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      } catch (e) {
        res.statusCode = e.status || 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: e.message || 'Party error.' }));
      }
    });
  }

  return {
    name: 'party-dev-api',
    configureServer(server) {
      const handler = (req, res, next) => {
        if (!isParty(req)) {
          next?.();
          return;
        }
        handleReq(req, res);
      };
      return () => {
        server.middlewares.use(handler);
        const http = server.httpServer;
        if (!http || http.__txlParty) return;
        const others = http.listeners('request').slice();
        if (!others.length) return;
        http.__txlParty = true;
        http.removeAllListeners('request');
        http.on('request', (req, res) => {
          if (isParty(req)) {
            handleReq(req, res);
            return;
          }
          for (const fn of others) fn.call(http, req, res);
        });
      };
    },
  };
}
