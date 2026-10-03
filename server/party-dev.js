const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

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

export function createPartyStore() {
  const rooms = new Map();
  let signalId = 1;

  function prune() {
    const stale = now() - 2 * 60 * 60 * 1000;
    const sigAge = now() - 2 * 60 * 1000;
    for (const [code, room] of rooms) {
      room.signals = room.signals.filter((s) => s.at > sigAge);
      if (room.touched < stale) rooms.delete(code);
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
    if (e) return { role: 'escort', peer: e.id };
    const err = new Error('Bad party token.');
    err.status = 403;
    throw err;
  }

  function publicEscorts(room) {
    return room.escorts.map((e) => ({ id: e.id, callsign: e.callsign }));
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
          signals: [],
          touched: now(),
        });
        return { ok: true, room: c, peer: hostPeer, token: tok, role: 'host', iceServers: ICE };
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
        room.escorts.push({ id: peer, token: tok, callsign });
        return { ok: true, room: c, peer, token: tok, role: 'escort', host: room.hostPeer, iceServers: ICE };
      }
      if (action === 'signal') {
        const room = getRoom(String(body.room || '').toUpperCase());
        const who = auth(room, String(body.token || ''));
        const kind = body.kind;
        if (!['offer', 'answer', 'ice'].includes(kind)) {
          const err = new Error('Invalid signal.');
          err.status = 400;
          throw err;
        }
        const to = String(body.to || '').toUpperCase();
        if (!/^[A-Z0-9]{8}$/.test(to)) {
          const err = new Error('Invalid destination.');
          err.status = 400;
          throw err;
        }
        const json = JSON.stringify(body.payload ?? null);
        if (json.length > 16384) {
          const err = new Error('Signal is too large.');
          err.status = 400;
          throw err;
        }
        room.signals.push({
          id: signalId++,
          from: who.peer,
          to,
          kind,
          payload: body.payload ?? null,
          at: now(),
        });
        return { ok: true };
      }
      if (action === 'poll') {
        const room = getRoom(String(body.room || '').toUpperCase());
        const who = auth(room, String(body.token || ''));
        const since = Number(body.since) || 0;
        const mine = room.signals.filter((s) => s.id > since && s.to === who.peer).slice(0, 40);
        const last = mine.length ? mine[mine.length - 1].id : since;
        return {
          ok: true,
          since: last,
          signals: mine.map(({ id, from, to, kind, payload }) => ({ id, from, to, kind, payload })),
          escorts: publicEscorts(room),
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
      const http = server.httpServer;
      if (http) {
        const others = http.listeners('request').slice();
        http.removeAllListeners('request');
        http.on('request', (req, res) => {
          if (isParty(req)) {
            handleReq(req, res);
            return;
          }
          for (const fn of others) fn.call(http, req, res);
        });
        return;
      }
      server.middlewares.use((req, res, next) => {
        if (!isParty(req)) return next();
        handleReq(req, res);
      });
    },
  };
}
