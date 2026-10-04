<?php

require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error(405, 'POST a run.');
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    json_error(400, 'Expected JSON.');
}

$callsign = trim((string) ($body['callsign'] ?? ''));
if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/', $callsign)) {
    json_error(400, 'Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
}

$runId = (string) ($body['run_id'] ?? '');
if (!preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $runId)) {
    json_error(400, 'Invalid run.');
}

$int = function (string $key, int $max) use ($body): int {
    if (!isset($body[$key]) || !is_numeric($body[$key])) {
        json_error(400, "Invalid $key.");
    }
    $n = (int) $body[$key];
    if ($n < 0 || $n > $max) {
        json_error(400, "Invalid $key.");
    }
    return $n;
};

$score = (int) ($body['score'] ?? 0);
if ($score < -10000000 || $score >= 50000000) {
    json_error(400, 'Invalid score.');
}

$rawStatus = (string) ($body['status'] ?? 'done');
if ($rawStatus === 'live') {
    $status = 'live';
} elseif ($rawStatus === 'void') {
    $status = 'void';
} else {
    $status = 'done';
}
$timeMs = $int('time_ms', 7 * 24 * 60 * 60 * 1000);
if ($status === 'done' && $timeMs < 3 * 60 * 1000) {
    json_error(400, 'Runs under 3 minutes are not posted.');
}

$earned = $int('earned', 49999999);
$kills = $int('kills', 100000);
$bosses = $int('bosses', 1000);
$deaths = $int('deaths', 1000);
$deliveries = $int('deliveries', 10000);
$seed = isset($body['seed']) && is_numeric($body['seed']) ? (int) $body['seed'] : 0;

$expected = $earned + $kills * 50 + $bosses * 2500 - $deaths * 1000;
if ($score !== $expected) {
    json_error(400, 'Invalid score.');
}

$pdo = db();
$st = $pdo->prepare('SELECT status, score, time_ms, UNIX_TIMESTAMP(updated_at) AS updated_unix FROM runs WHERE run_id = ?');
$st->execute([$runId]);
$prev = $st->fetch() ?: null;
$prevStatus = $prev['status'] ?? '';

if ($prev && $prevStatus === 'done' && $status === 'live') {
    json_error(409, 'This run has already arrived.');
}

if ($prev && ($prevStatus === 'void' || ($prevStatus === 'done' && $status === 'void'))) {
    json_out(run_ranks($pdo, (int) $prev['score'], (int) $prev['time_ms']));
}

$existingLive = $prev && $prevStatus === 'live';
if ($status === 'live' && $existingLive) {
    $updated = (int) ($prev['updated_unix'] ?? 0);
    if ($updated && (time() - $updated) < 30) {
        json_out(run_ranks($pdo, (int) $prev['score'], (int) $prev['time_ms']));
    }
}

$needRate = $status === 'done' || (!$prev && $status !== 'void');
if ($needRate) {
    $ip = client_ip();
    $pdo->prepare('DELETE FROM rate_hits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)')->execute();
    $hit = $pdo->prepare('SELECT COUNT(*) FROM rate_hits WHERE ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)');
    $hit->execute([$ip]);
    if ((int) $hit->fetchColumn() >= 10) {
        json_error(429, 'Too many posts from this address. Try again later.');
    }
    $pdo->prepare('INSERT INTO rate_hits (ip) VALUES (?)')->execute([$ip]);
}

$pdo->prepare(
    'INSERT INTO runs (run_id, callsign, score, time_ms, earned, kills, bosses, deaths, deliveries, seed, status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       callsign = VALUES(callsign),
       score = VALUES(score),
       time_ms = VALUES(time_ms),
       earned = VALUES(earned),
       kills = VALUES(kills),
       bosses = VALUES(bosses),
       deaths = VALUES(deaths),
       deliveries = VALUES(deliveries),
       seed = VALUES(seed),
       status = CASE
         WHEN status = \'done\' THEN \'done\'
         WHEN status = \'void\' THEN \'void\'
         ELSE VALUES(status)
       END,
       updated_at = NOW()'
)->execute([$runId, $callsign, $score, $timeMs, $earned, $kills, $bosses, $deaths, $deliveries, $seed, $status]);

json_out(run_ranks($pdo, $score, $timeMs));

function run_ranks(PDO $pdo, int $score, int $timeMs): array {
    $rankScore = $pdo->prepare(
        'SELECT COUNT(*) FROM runs
         WHERE (status = \'done\' OR (status = \'live\' AND updated_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)))
           AND (score > ? OR (score = ? AND time_ms < ?))'
    );
    $rankScore->execute([$score, $score, $timeMs]);
    $rankTime = $pdo->prepare('SELECT COUNT(*) FROM runs WHERE status = \'done\' AND (time_ms < ? OR (time_ms = ? AND score > ?))');
    $rankTime->execute([$timeMs, $timeMs, $score]);
    return [
        'ok' => true,
        'rank_score' => (int) $rankScore->fetchColumn() + 1,
        'rank_time' => (int) $rankTime->fetchColumn() + 1,
    ];
}
