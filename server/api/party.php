<?php

require __DIR__ . '/db.php';

if (!defined('TXL_API_EMBED')) {
    party_http_main();
}

function party_http_main(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        json_error(405, 'POST a party action.');
    }
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > 16384) {
        json_error(413, 'Request is too large.');
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        json_error(400, 'Expected JSON.');
    }
    $action = (string) ($body['action'] ?? '');
    $pdo = db();
    party_dispatch($pdo, $action, $body);
}

function party_dispatch(PDO $pdo, string $action, array $body): void {
    switch ($action) {
    case 'create':
        party_rate($pdo, 200);
        json_out(party_create($pdo));
    case 'join':
        party_rate($pdo, 1000);
        json_out(party_join($pdo, $body));
    case 'input':
        json_out(party_input($pdo, $body));
    case 'vitals':
        json_out(party_vitals($pdo, $body));
    case 'poll':
        json_out(party_poll($pdo, $body));
    case 'leave':
        json_out(party_leave($pdo, $body));
    case 'drop':
        json_out(party_drop($pdo, $body));
    case 'signal':
        json_out(party_signal($pdo, $body));
    case 'frame':
        json_out(party_frame($pdo, $body));
    default:
        json_error(400, 'Unknown action.');
    }
}

function party_alphabet(): string {
    return '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
}

function party_code(int $len = 5): string {
    $a = party_alphabet();
    $n = strlen($a) - 1;
    $out = '';
    for ($i = 0; $i < $len; $i++) {
        $out .= $a[random_int(0, $n)];
    }
    return $out;
}

function party_token(): string {
    return bin2hex(random_bytes(16));
}

function party_peer_id(): string {
    return party_code(8);
}

function party_prune(PDO $pdo): void {
    $pdo->exec('DELETE FROM party_signals WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)');
    $stale = $pdo->query("SELECT code FROM party_rooms WHERE touched_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)")->fetchAll(PDO::FETCH_COLUMN);
    if (!$stale) return;
    $in = implode(',', array_fill(0, count($stale), '?'));
    $pdo->prepare("DELETE FROM party_signals WHERE room IN ($in)")->execute($stale);
    $pdo->prepare("DELETE FROM party_live WHERE room IN ($in)")->execute($stale);
    $pdo->prepare("DELETE FROM party_rooms WHERE code IN ($in)")->execute($stale);
}

function party_rate(PDO $pdo, int $max): void {
    $ip = client_ip();
    $pdo->prepare('DELETE FROM rate_hits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)')->execute();
    $hit = $pdo->prepare('SELECT COUNT(*) FROM rate_hits WHERE ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)');
    $hit->execute([$ip]);
    if ((int) $hit->fetchColumn() >= $max) {
        json_error(429, 'Too many party requests from this address. Try again later.');
    }
    $pdo->prepare('INSERT INTO rate_hits (ip) VALUES (?)')->execute([$ip]);
}

// window seconds, max per token, max per IP.
// Host polls at 10 Hz and sends vitals at 5 Hz. An escort sends the pad at about 12 Hz and may poll at 10 Hz.
// A few devices on one address still fit. A flood does not.
function party_action_limits(): array {
    return [
        'input' => [10, 200, 800],
        'poll' => [10, 200, 800],
        'vitals' => [10, 120, 300],
        'frame' => [10, 200, 800],
        'signal' => [60, 400, 800],
        'leave' => [60, 30, 60],
        'drop' => [60, 30, 60],
    ];
}

function party_guard_ip(PDO $pdo, string $action): void {
    party_maybe_prune($pdo);
    $lim = party_action_limits()[$action] ?? null;
    if (!$lim) return;
    rate_bucket_hit($pdo, 'p-' . $action . '-ip', client_ip(), $lim[0], $lim[2], 'Too many party requests. Try again in a moment.');
}

function party_guard_token(PDO $pdo, string $action, string $token): void {
    $lim = party_action_limits()[$action] ?? null;
    if (!$lim || $token === '') return;
    rate_bucket_hit($pdo, 'p-' . $action . '-tk', hash('sha256', $token), $lim[0], $lim[1], 'Too many party requests. Try again in a moment.');
}

function party_maybe_prune(PDO $pdo): void {
    if (function_exists('apcu_add')) {
        if (!apcu_add('txl_party_prune', 1, 30)) return;
        party_prune($pdo);
        return;
    }
    if (random_int(1, 200) !== 1) return;
    party_prune($pdo);
}

function party_create(PDO $pdo): array {
    party_prune($pdo);
    $hostPeer = party_peer_id();
    $token = party_token();
    for ($i = 0; $i < 8; $i++) {
        $code = party_code();
        try {
            $pdo->prepare('INSERT INTO party_rooms (code, host_token, host_peer, escorts) VALUES (?, ?, ?, ?)')
                ->execute([$code, $token, $hostPeer, '[]']);
            return [
                'ok' => true,
                'room' => $code,
                'peer' => $hostPeer,
                'token' => $token,
                'role' => 'host',
            ];
        } catch (PDOException $e) {
            if ((int) $e->errorInfo[1] !== 1062) throw $e;
        }
    }
    json_error(500, 'Could not open a room.');
}

function room_code($body): string {
    $code = strtoupper(trim((string) ($body['room'] ?? '')));
    if (!preg_match('/^[A-Z0-9]{5}$/', $code)) {
        json_error(400, 'Invalid room.');
    }
    return $code;
}

function load_room(PDO $pdo, string $code, bool $touch = true): array {
    $st = $pdo->prepare('SELECT code, host_token, host_peer, escorts FROM party_rooms WHERE code = ?');
    $st->execute([$code]);
    $row = $st->fetch();
    if (!$row) json_error(404, 'Room is gone.');
    $row['escorts'] = json_decode($row['escorts'] ?: '[]', true);
    if (!is_array($row['escorts'])) $row['escorts'] = [];
    if ($touch) {
        $pdo->prepare('UPDATE party_rooms SET touched_at = NOW() WHERE code = ?')->execute([$code]);
    }
    return $row;
}

function save_escorts(PDO $pdo, string $code, array $escorts): void {
    $pdo->prepare('UPDATE party_rooms SET escorts = ?, touched_at = NOW() WHERE code = ?')
        ->execute([json_encode(array_values($escorts)), $code]);
}

function auth_room(array $room, string $token): array {
    if (hash_equals($room['host_token'], $token)) {
        return ['role' => 'host', 'peer' => $room['host_peer']];
    }
    foreach ($room['escorts'] as $e) {
        if (hash_equals((string) ($e['token'] ?? ''), $token)) {
            return ['role' => 'escort', 'peer' => $e['id'], 'color' => (int) ($e['color'] ?? 0), 'callsign' => (string) ($e['callsign'] ?? 'ESCORT')];
        }
    }
    json_error(403, 'Bad party token.');
}

function next_color(array $escorts): int {
    return count($escorts) % 4;
}

function delete_live(PDO $pdo, string $room, ?string $peer = null): void {
    if ($peer === null) {
        $pdo->prepare('DELETE FROM party_live WHERE room = ?')->execute([$room]);
        return;
    }
    $pdo->prepare('DELETE FROM party_live WHERE room = ? AND peer = ?')->execute([$room, $peer]);
}

function drop_silent_escorts(PDO $pdo, array $room): array {
    $st = $pdo->prepare('SELECT peer FROM party_live WHERE room = ? AND updated_at < DATE_SUB(NOW(), INTERVAL 8 SECOND)');
    $st->execute([$room['code']]);
    $dead = $st->fetchAll(PDO::FETCH_COLUMN);
    if (!$dead) return $room;
    $escorts = array_values(array_filter($room['escorts'], fn($e) => !in_array($e['id'], $dead, true)));
    save_escorts($pdo, $room['code'], $escorts);
    $pdo->prepare('DELETE FROM party_live WHERE room = ? AND updated_at < DATE_SUB(NOW(), INTERVAL 8 SECOND)')->execute([$room['code']]);
    $room['escorts'] = $escorts;
    return $room;
}

function party_join(PDO $pdo, array $body): array {
    party_prune($pdo);
    $code = room_code($body);
    $callsign = trim((string) ($body['callsign'] ?? ''));
    if ($callsign === '') $callsign = 'ESCORT';
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/', $callsign)) {
        json_error(400, 'Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
    }
    $pdo->beginTransaction();
    try {
        $st = $pdo->prepare('SELECT code, host_token, host_peer, escorts FROM party_rooms WHERE code = ? FOR UPDATE');
        $st->execute([$code]);
        $row = $st->fetch();
        if (!$row) {
            $pdo->rollBack();
            json_error(404, 'Room is gone.');
        }
        $escorts = json_decode($row['escorts'] ?: '[]', true);
        if (!is_array($escorts)) $escorts = [];
        if (count($escorts) >= 24) {
            $pdo->rollBack();
            json_error(409, 'This crew is full.');
        }
        $peer = party_peer_id();
        $token = party_token();
        $color = next_color($escorts);
        $escorts[] = ['id' => $peer, 'token' => $token, 'callsign' => $callsign, 'color' => $color];
        $pdo->prepare('UPDATE party_rooms SET escorts = ?, touched_at = NOW() WHERE code = ?')
            ->execute([json_encode($escorts), $code]);
        $pdo->prepare('INSERT INTO party_live (peer, room, updated_at) VALUES (?, ?, NOW())')
            ->execute([$peer, $code]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    return [
        'ok' => true,
        'room' => $code,
        'peer' => $peer,
        'token' => $token,
        'role' => 'escort',
        'host' => $row['host_peer'],
        'color' => $color,
        'callsign' => $callsign,
    ];
}

function clamp_axis($v): float {
    if (!is_numeric($v)) return 0.0;
    $n = (float) $v;
    if ($n < -1) return -1.0;
    if ($n > 1) return 1.0;
    return $n;
}

function party_brief_payload($raw): ?array {
    if ($raw === null) return null;
    if (!is_array($raw)) return null;
    $str = static function ($v, int $n): string {
        return substr(trim((string) $v), 0, $n);
    };
    $num = static function ($v): float {
        return is_numeric($v) ? (float) $v : 0.0;
    };
    return [
        'wt' => $str($raw['wt'] ?? '', 48),
        'from' => $str($raw['from'] ?? '', 24),
        'to' => $str($raw['to'] ?? '', 24),
        'wpn' => $str($raw['wpn'] ?? '', 16),
        'capH' => $num($raw['capH'] ?? 0),
        'capM' => $num($raw['capM'] ?? 0),
        'sh' => $num($raw['sh'] ?? 0),
        'sm' => $num($raw['sm'] ?? 0),
        'by' => (int) $num($raw['by'] ?? 0),
        'k' => (int) $num($raw['k'] ?? 0),
        'es' => (int) $num($raw['es'] ?? 0),
        'en' => (int) $num($raw['en'] ?? 0),
    ];
}

function escort_status(array $who, array $row, ?array $brief): array {
    $out = [
        'ok' => true,
        'mode' => ($row['mode'] ?? 'wait') === 'travel' ? 'travel' : 'wait',
        'hull' => isset($row['hull']) ? (float) $row['hull'] : 1,
        'maxHull' => isset($row['max_hull']) ? (float) $row['max_hull'] : 1,
        'color' => (int) ($who['color'] ?? 0),
        'callsign' => $who['callsign'] ?? 'ESCORT',
    ];
    if ($brief && (isset($brief['wt']) || isset($brief['capH']))) $out['brief'] = $brief;
    return $out;
}

function party_input(PDO $pdo, array $body): array {
    party_guard_ip($pdo, 'input');
    $code = room_code($body);
    $token = (string) ($body['token'] ?? '');
    $room = load_room($pdo, $code, false);
    $who = auth_room($room, $token);
    party_guard_token($pdo, 'input', $token);
    if ($who['role'] !== 'escort') json_error(403, 'Only an escort can send the pad.');
    $mx = clamp_axis($body['mx'] ?? 0);
    $my = clamp_axis($body['my'] ?? 0);
    $fire = !empty($body['fire']) ? 1 : 0;
    // DATETIME is second precision, so a held stick repeats the same row in one second.
    // An UPDATE then reports zero rows and a follow-up INSERT hits the primary key.
    $pdo->prepare(
        'INSERT INTO party_live (peer, room, mx, my, fire, updated_at) VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE mx = VALUES(mx), my = VALUES(my), fire = VALUES(fire), updated_at = NOW()'
    )->execute([$who['peer'], $code, $mx, $my, $fire]);
    $live = $pdo->prepare('SELECT hull, max_hull, mode FROM party_live WHERE peer = ? AND room = ?');
    $live->execute([$who['peer'], $code]);
    $row = $live->fetch() ?: [];
    return escort_status($who, $row, party_read_frame($pdo, $code));
}

function party_vitals(PDO $pdo, array $body): array {
    party_guard_ip($pdo, 'vitals');
    $code = room_code($body);
    $token = (string) ($body['token'] ?? '');
    $room = load_room($pdo, $code, false);
    $who = auth_room($room, $token);
    party_guard_token($pdo, 'vitals', $token);
    if ($who['role'] !== 'host') json_error(403, 'Only the host can send vitals.');
    $mode = (string) ($body['mode'] ?? 'wait');
    if ($mode !== 'travel') $mode = 'wait';
    $hulls = $body['hulls'] ?? [];
    if (!is_array($hulls)) $hulls = [];
    $byPeer = [];
    foreach (array_slice($hulls, 0, 24) as $row) {
        if (!is_array($row)) continue;
        $peer = strtoupper(trim((string) ($row['peer'] ?? '')));
        if (!preg_match('/^[A-Z0-9]{8}$/', $peer)) continue;
        $hull = is_numeric($row['hull'] ?? null) ? (float) $row['hull'] : 1;
        $max = is_numeric($row['maxHull'] ?? null) ? (float) $row['maxHull'] : 1;
        if ($hull < 0) $hull = 0;
        if ($max < 1) $max = 1;
        $byPeer[$peer] = [$hull, $max];
    }
    $ids = array_map(fn($e) => $e['id'], $room['escorts']);
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("UPDATE party_live SET mode = ? WHERE room = ? AND peer IN ($in)")
            ->execute([$mode, $code, ...$ids]);
    }
    $st = $pdo->prepare('UPDATE party_live SET hull = ?, max_hull = ?, mode = ? WHERE peer = ? AND room = ?');
    foreach ($byPeer as $peer => [$hull, $max]) {
        $st->execute([$hull, $max, $mode, $peer, $code]);
    }
    if (array_key_exists('brief', $body)) {
        if ($body['brief'] === null) {
            $pdo->prepare('UPDATE party_rooms SET frame = NULL, touched_at = NOW() WHERE code = ?')->execute([$code]);
        } else {
            $payload = party_brief_payload($body['brief']);
            $json = $payload ? json_encode($payload) : 'null';
            if ($json !== false && strlen($json) <= 1500) {
                $pdo->prepare('UPDATE party_rooms SET frame = ?, touched_at = NOW() WHERE code = ?')->execute([$json, $code]);
            }
        }
    }
    return ['ok' => true];
}

function party_poll(PDO $pdo, array $body): array {
    party_guard_ip($pdo, 'poll');
    $code = room_code($body);
    $token = (string) ($body['token'] ?? '');
    $room = load_room($pdo, $code, false);
    $who = auth_room($room, $token);
    party_guard_token($pdo, 'poll', $token);
    if ($who['role'] === 'host') {
        $room = drop_silent_escorts($pdo, $room);
        $liveSt = $pdo->prepare('SELECT peer, mx, my, fire, hull, max_hull, mode, UNIX_TIMESTAMP(updated_at) AS updated_unix FROM party_live WHERE room = ?');
        $liveSt->execute([$code]);
        $live = [];
        while ($row = $liveSt->fetch()) {
            $live[$row['peer']] = $row;
        }
        $escorts = [];
        $now = time();
        foreach ($room['escorts'] as $e) {
            $row = $live[$e['id']] ?? null;
            $fresh = $row && ($now - (int) $row['updated_unix']) <= 1;
            $escorts[] = [
                'id' => $e['id'],
                'callsign' => $e['callsign'],
                'color' => (int) ($e['color'] ?? 0),
                'mx' => $fresh ? (float) $row['mx'] : 0,
                'my' => $fresh ? (float) $row['my'] : 0,
                'fire' => $fresh ? (int) $row['fire'] : 0,
                'hull' => $row ? (float) $row['hull'] : 1,
                'maxHull' => $row ? (float) $row['max_hull'] : 1,
            ];
        }
        return ['ok' => true, 'escorts' => $escorts];
    }
    $st = $pdo->prepare('SELECT hull, max_hull, mode FROM party_live WHERE peer = ? AND room = ?');
    $st->execute([$who['peer'], $code]);
    $row = $st->fetch() ?: [];
    return escort_status($who, $row, party_read_frame($pdo, $code));
}

function party_leave(PDO $pdo, array $body): array {
    party_guard_ip($pdo, 'leave');
    $code = room_code($body);
    $token = (string) ($body['token'] ?? '');
    $room = load_room($pdo, $code, false);
    $who = auth_room($room, $token);
    party_guard_token($pdo, 'leave', $token);
    if ($who['role'] === 'host') {
        $pdo->prepare('DELETE FROM party_signals WHERE room = ?')->execute([$code]);
        delete_live($pdo, $code);
        $pdo->prepare('DELETE FROM party_rooms WHERE code = ?')->execute([$code]);
        return ['ok' => true];
    }
    $escorts = array_values(array_filter($room['escorts'], fn($e) => $e['id'] !== $who['peer']));
    save_escorts($pdo, $code, $escorts);
    delete_live($pdo, $code, $who['peer']);
    return ['ok' => true];
}

function party_drop(PDO $pdo, array $body): array {
    party_guard_ip($pdo, 'drop');
    $code = room_code($body);
    $token = (string) ($body['token'] ?? '');
    $room = load_room($pdo, $code);
    $who = auth_room($room, $token);
    party_guard_token($pdo, 'drop', $token);
    if ($who['role'] !== 'host') json_error(403, 'Only the host can drop an escort.');
    $peer = strtoupper(trim((string) ($body['peer'] ?? '')));
    $escorts = array_values(array_filter($room['escorts'], fn($e) => $e['id'] !== $peer));
    save_escorts($pdo, $code, $escorts);
    delete_live($pdo, $code, $peer);
    return ['ok' => true];
}

function party_frame(PDO $pdo, array $body): array {
    party_guard_ip($pdo, 'frame');
    $code = room_code($body);
    $token = (string) ($body['token'] ?? '');
    $room = load_room($pdo, $code, false);
    $who = auth_room($room, $token);
    party_guard_token($pdo, 'frame', $token);
    if (array_key_exists('frame', $body)) {
        if ($who['role'] !== 'host') json_error(403, 'Only the host can send a frame.');
        if ($body['frame'] === null) {
            $pdo->prepare('UPDATE party_rooms SET frame = NULL, touched_at = NOW() WHERE code = ?')->execute([$code]);
            return ['ok' => true];
        }
        $json = json_encode($body['frame']);
        if ($json === false || strlen($json) > 8192) {
            json_error(400, 'Frame is too large.');
        }
        $pdo->prepare('UPDATE party_rooms SET frame = ?, touched_at = NOW() WHERE code = ?')->execute([$json, $code]);
        return ['ok' => true];
    }
    if ($who['role'] !== 'escort') json_error(403, 'Only an escort can read a frame.');
    return ['ok' => true, 'frame' => party_read_frame($pdo, $code), 'peer' => $who['peer']];
}

function party_read_frame(PDO $pdo, string $code): ?array {
    $st = $pdo->prepare('SELECT frame FROM party_rooms WHERE code = ?');
    $st->execute([$code]);
    $raw = $st->fetchColumn();
    if (!is_string($raw) || $raw === '') return null;
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

function party_signal(PDO $pdo, array $body): array {
    party_guard_ip($pdo, 'signal');
    $code = room_code($body);
    $token = (string) ($body['token'] ?? '');
    $room = load_room($pdo, $code);
    $who = auth_room($room, $token);
    party_guard_token($pdo, 'signal', $token);
    $kind = (string) ($body['kind'] ?? '');
    if (!in_array($kind, ['offer', 'answer', 'ice'], true)) {
        json_error(400, 'Invalid signal.');
    }
    $to = strtoupper(trim((string) ($body['to'] ?? '')));
    if (!preg_match('/^[A-Z0-9]{8}$/', $to)) {
        json_error(400, 'Invalid destination.');
    }
    $payload = $body['payload'] ?? null;
    $json = json_encode($payload);
    if ($json === false || strlen($json) > 8192) {
        json_error(400, 'Signal is too large.');
    }
    $pdo->prepare('INSERT INTO party_signals (room, from_peer, to_peer, kind, payload) VALUES (?, ?, ?, ?, ?)')
        ->execute([$code, $who['peer'], $to, $kind, $json]);
    return ['ok' => true];
}
