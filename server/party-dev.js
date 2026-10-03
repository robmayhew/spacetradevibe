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
          frame: null,
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
      if (action === 'frame') {
        const room = getRoom(String(body.room || '').toUpperCase());
        const who = auth(room, String(body.token || ''));
        if (Object.prototype.hasOwnProperty.call(body, 'frame')) {
          if (who.role !== 'host') {
            const err = new Error('Only the host can send a frame.');
            err.status = 403;
            throw err;
          }
          if (body.frame == null) {
            room.frame = null;
            return { ok: true };
          }
          const json = JSON.stringify(body.frame);
          if (!json || json.length > 24576) {
            const err = new Error('Frame is too large.');
            err.status = 400;
            throw err;
          }
          room.frame = body.frame;
          return { ok: true };
        }
        if (who.role !== 'escort') {
          const err = new Error('Only an escort can read a frame.');
          err.status = 403;
          throw err;
        }
        return { ok: true, frame: room.frame || null, peer: who.peer };
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

function pathnameOf(req) {
  const raw = req.originalUrl || req.url || '';
  let pathname = raw.split('?')[0];
  try {
    pathname = new URL(raw, 'http://party.local').pathname;
  } catch {
    /* keep split path */
  }
  return pathname;
}

function queryOf(req) {
  const raw = req.originalUrl || req.url || '';
  try {
    return new URL(raw, 'http://party.local').searchParams;
  } catch {
    const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
    return new URLSearchParams(q);
  }
}

function jsonErr(res, status, error) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error }));
}

function jsonOk(res, data) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const err = new Error('Expected JSON.');
        err.status = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createBoardStore() {
  const runs = new Map();
  const liveWrite = new Map();

  function intField(body, key, max) {
    if (!(key in body) || !Number.isFinite(Number(body[key]))) {
      const err = new Error(`Invalid ${key}.`);
      err.status = 400;
      throw err;
    }
    const n = Math.trunc(Number(body[key]));
    if (n < 0 || n > max) {
      const err = new Error(`Invalid ${key}.`);
      err.status = 400;
      throw err;
    }
    return n;
  }

  function ranks(score, timeMs, rows) {
    const rankScore = rows.filter((r) => r.score > score || (r.score === score && r.time_ms < timeMs)).length + 1;
    const finished = rows.filter((r) => r.status === 'done');
    const rankTime = finished.filter((r) => r.time_ms < timeMs || (r.time_ms === timeMs && r.score > score)).length + 1;
    return { rank_score: rankScore, rank_time: rankTime };
  }

  function visible(sort) {
    const stale = now() - 15 * 60 * 1000;
    return [...runs.values()].filter((r) => {
      if (r.status === 'live') return sort !== 'time' && r.updated >= stale;
      return true;
    });
  }

  return {
    board(sort) {
      const rows = visible(sort).sort((a, b) =>
        sort === 'time'
          ? a.time_ms - b.time_ms || b.score - a.score
          : b.score - a.score || a.time_ms - b.time_ms,
      );
      return {
        rows: rows.slice(0, 20).map((r, i) => ({
          callsign: r.callsign,
          score: r.score,
          time_ms: r.time_ms,
          status: r.status === 'live' ? 'live' : 'done',
          rank: i + 1,
        })),
      };
    },
    submit(body) {
      const callsign = String(body.callsign || '').trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/.test(callsign)) {
        const err = new Error('Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
        err.status = 400;
        throw err;
      }
      const runId = String(body.run_id || '');
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(runId)) {
        const err = new Error('Invalid run.');
        err.status = 400;
        throw err;
      }
      const score = Math.trunc(Number(body.score ?? 0));
      if (!Number.isInteger(score) || score < -10000000 || score >= 50000000) {
        const err = new Error('Invalid score.');
        err.status = 400;
        throw err;
      }
      const status = body.status === 'live' ? 'live' : 'done';
      const timeMs = intField(body, 'time_ms', 7 * 24 * 60 * 60 * 1000);
      if (status === 'done' && timeMs < 3 * 60 * 1000) {
        const err = new Error('Runs under 3 minutes are not posted.');
        err.status = 400;
        throw err;
      }
      const earned = intField(body, 'earned', 49999999);
      const kills = intField(body, 'kills', 100000);
      const bosses = intField(body, 'bosses', 1000);
      const deaths = intField(body, 'deaths', 1000);
      const deliveries = intField(body, 'deliveries', 10000);
      const seed = Number.isFinite(Number(body.seed)) ? Number(body.seed) : 0;
      const expected = earned + kills * 50 + bosses * 2500 - deaths * 10000;
      if (score !== expected) {
        const err = new Error('Invalid score.');
        err.status = 400;
        throw err;
      }
      const prev = runs.get(runId);
      if (prev?.status === 'done' && status === 'live') {
        const err = new Error('This run has already arrived.');
        err.status = 409;
        throw err;
      }
      if (status === 'live' && prev) {
        const last = liveWrite.get(runId) || 0;
        if (now() - last < 30000) {
          return { ok: true, skipped: true, ...ranks(prev.score, prev.time_ms, [...runs.values()]) };
        }
      }
      const row = {
        run_id: runId,
        callsign,
        score,
        time_ms: timeMs,
        earned,
        kills,
        bosses,
        deaths,
        deliveries,
        seed,
        status: prev?.status === 'done' ? 'done' : status,
        updated: now(),
      };
      runs.set(runId, row);
      if (status === 'live') liveWrite.set(runId, now());
      return { ok: true, ...ranks(score, timeMs, [...runs.values()]) };
    },
  };
}

export function partyDevPlugin() {
  const store = createPartyStore();
  const board = createBoardStore();

  function isParty(req) {
    return pathnameOf(req) === '/api/party.php';
  }

  function isBoard(req) {
    return pathnameOf(req) === '/api/board.php';
  }

  function isScore(req) {
    return pathnameOf(req) === '/api/score.php';
  }

  function isApi(req) {
    return isParty(req) || isBoard(req) || isScore(req);
  }

  function handleParty(req, res) {
    if (req.method !== 'POST') {
      jsonErr(res, 405, 'POST a party action.');
      return;
    }
    readBody(req)
      .then((body) => jsonOk(res, store.handle(body)))
      .catch((e) => jsonErr(res, e.status || 500, e.message || 'Party error.'));
  }

  function handleBoard(req, res) {
    if (req.method !== 'GET') {
      jsonErr(res, 405, 'GET the board.');
      return;
    }
    const sort = queryOf(req).get('sort') === 'time' ? 'time' : 'score';
    jsonOk(res, board.board(sort));
  }

  function handleScore(req, res) {
    if (req.method !== 'POST') {
      jsonErr(res, 405, 'POST a finished run.');
      return;
    }
    readBody(req)
      .then((body) => jsonOk(res, board.submit(body)))
      .catch((e) => jsonErr(res, e.status || 500, e.message || 'Score error.'));
  }

  function handleReq(req, res) {
    if (isParty(req)) handleParty(req, res);
    else if (isBoard(req)) handleBoard(req, res);
    else if (isScore(req)) handleScore(req, res);
  }

  return {
    name: 'party-dev-api',
    configureServer(server) {
      const handler = (req, res, next) => {
        if (!isApi(req)) {
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
          if (isApi(req)) {
            handleReq(req, res);
            return;
          }
          for (const fn of others) fn.call(http, req, res);
        });
      };
    },
  };
}
