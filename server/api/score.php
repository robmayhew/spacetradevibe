<?php

require __DIR__ . '/db.php';

if (!defined('TXL_API_EMBED')) {
    score_http_main();
}

// Casual forgery checks. The game still runs on the client, so this is not a
// full anti-cheat. A request with no server token is rejected, a copied
// request cannot change a score, and a finished or voided run is not rewritten.
// Caps use the time since the server opened the run, not the clock in the
// payload. Someone who holds the run token can still post inflated numbers
// up to those caps after the server has had the run open that long.

const SCORE_SKEW_MS = 20000;
const SCORE_MIN_DONE_MS = 180000;
const SCORE_PER_MIN = 1200000;
const EARNED_PER_MIN = 1000000;
const KILLS_PER_MIN = 300;
const BOSSES_PER_MIN = 12;
const DEATHS_PER_MIN = 30;
const DELIVERIES_PER_MIN = 6;
const STARTS_PER_HOUR = 30;

function score_http_main(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        json_error(405, 'POST a run.');
    }
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || strlen($raw) > 8192) {
        json_error(413, 'Request is too large.');
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        json_error(400, 'Expected JSON.');
    }
    $pdo = db();
    if (($body['action'] ?? '') === 'start') {
        json_out(score_start($pdo, $body));
    }
    json_out(score_submit($pdo, $body));
}

function score_start(PDO $pdo, array $body): array {
    $runId = score_run_id($body);
    rate_bucket_hit($pdo, 'run-start', client_ip(), 3600, STARTS_PER_HOUR, 'Too many runs from this address. Try again later.');
    $run = score_fetch_run($pdo, $runId, false);
    if ($run && ($run['status'] === 'done' || $run['status'] === 'void')) {
        json_error(409, 'This run is already posted.');
    }
    $token = bin2hex(random_bytes(32));
    $hash = hash('sha256', $token);
    $auth = score_fetch_auth($pdo, $runId, false);
    if ($auth) {
        if (trim((string) ($auth['last_nonce'] ?? '')) !== '') {
            json_error(409, 'This run has already started.');
        }
        $pdo->prepare('UPDATE run_auth SET token_hash = ? WHERE run_id = ?')->execute([$hash, $runId]);
        return ['ok' => true, 'token' => $token];
    }
    try {
        if ($run && !empty($run['created_at'])) {
            $pdo->prepare('INSERT INTO run_auth (run_id, token_hash, started_at) VALUES (?, ?, ?)')
                ->execute([$runId, $hash, $run['created_at']]);
        } else {
            $pdo->prepare('INSERT INTO run_auth (run_id, token_hash, started_at) VALUES (?, ?, NOW())')
                ->execute([$runId, $hash]);
        }
    } catch (PDOException $e) {
        if ((int) ($e->errorInfo[1] ?? 0) !== 1062) {
            throw $e;
        }
        $again = score_fetch_auth($pdo, $runId, false);
        if (!$again || trim((string) ($again['last_nonce'] ?? '')) !== '') {
            json_error(409, 'This run has already started.');
        }
        $pdo->prepare('UPDATE run_auth SET token_hash = ? WHERE run_id = ?')->execute([$hash, $runId]);
    }
    return ['ok' => true, 'token' => $token];
}

function score_submit(PDO $pdo, array $body): array {
    $norm = score_normalize($body);
    $pdo->beginTransaction();
    try {
        $auth = score_fetch_auth($pdo, $norm['run_id'], true);
        if (!$auth) {
            score_fail($pdo, 403, 'Unknown run.');
        }
        $given = hash('sha256', $norm['token']);
        $stored = strtolower(trim((string) $auth['token_hash']));
        if (strlen($stored) !== strlen($given) || !hash_equals($stored, $given)) {
            score_fail($pdo, 403, 'Bad run token.');
        }
        $prev = score_fetch_run($pdo, $norm['run_id'], true);
        $hash = score_body_hash($norm);
        $lastNonce = trim((string) ($auth['last_nonce'] ?? ''));
        if ($lastNonce !== '' && strlen($lastNonce) === strlen($norm['nonce']) && hash_equals($lastNonce, $norm['nonce'])) {
            $lastHash = strtolower(trim((string) ($auth['last_hash'] ?? '')));
            if ($lastHash !== '' && strlen($lastHash) === strlen($hash) && hash_equals($lastHash, $hash)) {
                $pdo->commit();
                $score = $prev ? (int) $prev['score'] : $norm['score'];
                $timeMs = $prev ? (int) $prev['time_ms'] : $norm['time_ms'];
                return score_rank_payload($pdo, $score, $timeMs, $norm['season']);
            }
            score_fail($pdo, 409, 'This update was already posted.');
        }
        if ($prev && ($prev['status'] === 'done' || $prev['status'] === 'void')) {
            if (score_same_result($prev, $norm)) {
                $pdo->commit();
                return score_rank_payload($pdo, (int) $prev['score'], (int) $prev['time_ms'], (string) ($prev['season'] ?: $norm['season']));
            }
            score_fail($pdo, 409, 'This run is already posted.');
        }
        $elapsedMs = max(0, (time() - (int) $auth['started_unix']) * 1000);
        score_check_plausible($pdo, $norm, $elapsedMs);
        if ($norm['status'] === 'live' && $prev && $prev['status'] === 'live') {
            $updated = (int) ($prev['updated_unix'] ?? 0);
            if ($updated && (time() - $updated) < 30) {
                $pdo->commit();
                return score_rank_payload($pdo, (int) $prev['score'], (int) $prev['time_ms'], $norm['season']) + ['skipped' => true];
            }
            if ($norm['time_ms'] <= (int) $prev['time_ms']) {
                score_fail($pdo, 400, 'Stale run update.');
            }
        } elseif ($prev && $prev['status'] === 'live' && $norm['time_ms'] < (int) $prev['time_ms']) {
            score_fail($pdo, 400, 'Stale run update.');
        }
        $needRate = $norm['status'] === 'done' || (!$prev && $norm['status'] !== 'void');
        if ($needRate) {
            $ip = client_ip();
            $pdo->prepare('DELETE FROM rate_hits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)')->execute();
            $hit = $pdo->prepare('SELECT COUNT(*) FROM rate_hits WHERE ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)');
            $hit->execute([$ip]);
            if ((int) $hit->fetchColumn() >= 10) {
                score_fail($pdo, 429, 'Too many posts from this address. Try again later.');
            }
            $pdo->prepare('INSERT INTO rate_hits (ip) VALUES (?)')->execute([$ip]);
        }
        score_write_run($pdo, $norm);
        $pdo->prepare('UPDATE run_auth SET last_nonce = ?, last_hash = ? WHERE run_id = ?')
            ->execute([$norm['nonce'], $hash, $norm['run_id']]);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    return score_rank_payload($pdo, $norm['score'], $norm['time_ms'], $norm['season']);
}

function score_fail(PDO $pdo, int $status, string $message): void {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_error($status, $message);
}

function score_run_id(array $body): string {
    $runId = (string) ($body['run_id'] ?? '');
    if (!preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $runId)) {
        json_error(400, 'Invalid run.');
    }
    return $runId;
}

function score_normalize(array $body): array {
    $callsign = trim((string) ($body['callsign'] ?? ''));
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/', $callsign)) {
        json_error(400, 'Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
    }
    $runId = score_run_id($body);
    $token = strtolower(trim((string) ($body['token'] ?? '')));
    if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
        json_error(403, 'Bad run token.');
    }
    $nonce = (string) ($body['nonce'] ?? '');
    if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $nonce)) {
        json_error(400, 'Invalid nonce.');
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
    if ($status === 'done' && $timeMs < SCORE_MIN_DONE_MS) {
        json_error(400, 'Runs under 3 minutes are not posted.');
    }
    $earned = $int('earned', 49999999);
    $kills = $int('kills', 100000);
    $bosses = $int('bosses', 1000);
    $deaths = $int('deaths', 1000);
    $deliveries = $int('deliveries', 10000);
    $seed = isset($body['seed']) && is_numeric($body['seed']) ? (int) $body['seed'] : 0;
    $paced = 1;
    if (array_key_exists('paced', $body)) {
        $rawPace = $body['paced'];
        $paced = ($rawPace === false || $rawPace === 0 || $rawPace === '0' || $rawPace === 'false') ? 0 : 1;
    }
    $credits = 0;
    if (isset($body['credits']) && is_numeric($body['credits'])) {
        $credits = (int) $body['credits'];
        if ($credits < 0 || $credits > 49999999) {
            json_error(400, 'Invalid credits.');
        }
    }
    $pace = 100;
    if (isset($body['pace']) && is_numeric($body['pace'])) {
        $pace = (int) $body['pace'];
        if ($pace < 50 || $pace > 200) {
            json_error(400, 'Invalid pace.');
        }
    }
    if (!array_key_exists('season', $body) || $body['season'] === null || $body['season'] === '') {
        $season = 'beta';
    } else {
        $season = board_season($body['season']);
    }
    $expected = $earned + $kills * 50 + $bosses * 2500 - $deaths * 1000;
    if ($score !== $expected) {
        json_error(400, 'Invalid score.');
    }
    if ($credits > $earned + 500) {
        json_error(400, 'Invalid credits.');
    }
    return [
        'callsign' => $callsign,
        'run_id' => $runId,
        'token' => $token,
        'nonce' => $nonce,
        'score' => $score,
        'status' => $status,
        'time_ms' => $timeMs,
        'earned' => $earned,
        'kills' => $kills,
        'bosses' => $bosses,
        'deaths' => $deaths,
        'deliveries' => $deliveries,
        'seed' => $seed,
        'paced' => $paced,
        'credits' => $credits,
        'pace' => $pace,
        'season' => $season,
    ];
}

function score_allow(int $elapsedMs, int $perMin): int {
    if ($elapsedMs < 0) {
        $elapsedMs = 0;
    }
    return (int) floor($perMin * ($elapsedMs / 60000));
}

function score_check_plausible(PDO $pdo, array $norm, int $elapsedMs): void {
    if ($norm['status'] === 'done' && $elapsedMs + SCORE_SKEW_MS < SCORE_MIN_DONE_MS) {
        score_fail($pdo, 400, 'Runs under 3 minutes are not posted.');
    }
    $tooHigh = 'Score is too high for how long this run has been open.';
    if ($norm['earned'] > score_allow($elapsedMs, EARNED_PER_MIN)) {
        score_fail($pdo, 400, $tooHigh);
    }
    if ($norm['kills'] > score_allow($elapsedMs, KILLS_PER_MIN)) {
        score_fail($pdo, 400, $tooHigh);
    }
    if ($norm['bosses'] > score_allow($elapsedMs, BOSSES_PER_MIN)) {
        score_fail($pdo, 400, $tooHigh);
    }
    if ($norm['deaths'] > score_allow($elapsedMs, DEATHS_PER_MIN)) {
        score_fail($pdo, 400, $tooHigh);
    }
    if ($norm['deliveries'] > score_allow($elapsedMs, DELIVERIES_PER_MIN)) {
        score_fail($pdo, 400, $tooHigh);
    }
    if ($norm['score'] > score_allow($elapsedMs, SCORE_PER_MIN)) {
        score_fail($pdo, 400, $tooHigh);
    }
}

function score_same_result(array $prev, array $norm): bool {
    if ($prev['status'] === 'void' && $norm['status'] === 'void') {
        return true;
    }
    return $prev['status'] === 'done'
        && $norm['status'] === 'done'
        && (int) $prev['score'] === $norm['score']
        && (int) $prev['time_ms'] === $norm['time_ms'];
}

function score_body_hash(array $norm): string {
    $payload = [
        $norm['callsign'],
        $norm['score'],
        $norm['time_ms'],
        $norm['earned'],
        $norm['kills'],
        $norm['bosses'],
        $norm['deaths'],
        $norm['deliveries'],
        $norm['seed'],
        $norm['status'],
        $norm['paced'],
        $norm['credits'],
        $norm['pace'],
        $norm['season'],
        $norm['nonce'],
    ];
    return hash('sha256', json_encode($payload));
}

function score_fetch_auth(PDO $pdo, string $runId, bool $lock): array|false {
    $sql = 'SELECT token_hash, last_nonce, last_hash, UNIX_TIMESTAMP(started_at) AS started_unix FROM run_auth WHERE run_id = ?';
    if ($lock) {
        $sql .= ' FOR UPDATE';
    }
    $st = $pdo->prepare($sql);
    $st->execute([$runId]);
    $row = $st->fetch();
    return $row ?: false;
}

function score_fetch_run(PDO $pdo, string $runId, bool $lock): array|false {
    $sql = 'SELECT status, score, time_ms, season, created_at, UNIX_TIMESTAMP(updated_at) AS updated_unix FROM runs WHERE run_id = ?';
    if ($lock) {
        $sql .= ' FOR UPDATE';
    }
    $st = $pdo->prepare($sql);
    $st->execute([$runId]);
    $row = $st->fetch();
    return $row ?: false;
}

function score_write_run(PDO $pdo, array $norm): void {
    $pdo->prepare(
        'INSERT INTO runs (run_id, callsign, score, time_ms, earned, kills, bosses, deaths, deliveries, seed, status, paced, credits, pace, season, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           callsign = IF(status IN (\'done\', \'void\'), callsign, VALUES(callsign)),
           score = IF(status IN (\'done\', \'void\'), score, VALUES(score)),
           time_ms = IF(status IN (\'done\', \'void\'), time_ms, VALUES(time_ms)),
           earned = IF(status IN (\'done\', \'void\'), earned, VALUES(earned)),
           kills = IF(status IN (\'done\', \'void\'), kills, VALUES(kills)),
           bosses = IF(status IN (\'done\', \'void\'), bosses, VALUES(bosses)),
           deaths = IF(status IN (\'done\', \'void\'), deaths, VALUES(deaths)),
           deliveries = IF(status IN (\'done\', \'void\'), deliveries, VALUES(deliveries)),
           seed = IF(status IN (\'done\', \'void\'), seed, VALUES(seed)),
           paced = IF(status IN (\'done\', \'void\'), paced, VALUES(paced)),
           credits = IF(status IN (\'done\', \'void\'), credits, VALUES(credits)),
           pace = IF(status IN (\'done\', \'void\'), pace, VALUES(pace)),
           season = IF(status IN (\'done\', \'void\'), season, VALUES(season)),
           status = IF(status IN (\'done\', \'void\'), status, VALUES(status)),
           updated_at = IF(status IN (\'done\', \'void\'), updated_at, NOW())'
    )->execute([
        $norm['run_id'],
        $norm['callsign'],
        $norm['score'],
        $norm['time_ms'],
        $norm['earned'],
        $norm['kills'],
        $norm['bosses'],
        $norm['deaths'],
        $norm['deliveries'],
        $norm['seed'],
        $norm['status'],
        $norm['paced'],
        $norm['credits'],
        $norm['pace'],
        $norm['season'],
    ]);
}

function score_rank_payload(PDO $pdo, int $score, int $timeMs, string $season): array {
    $ranks = run_ranks($pdo, $score, $timeMs, $season);
    return $ranks;
}

function run_ranks(PDO $pdo, int $score, int $timeMs, string $season = 'beta'): array {
    $rankScore = $pdo->prepare(
        'SELECT COUNT(*) FROM runs
         WHERE season = ?
           AND (status = \'done\' OR (status = \'live\' AND updated_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)))
           AND (score > ? OR (score = ? AND time_ms < ?))'
    );
    $rankScore->execute([$season, $score, $score, $timeMs]);
    $rankTime = $pdo->prepare('SELECT COUNT(*) FROM runs WHERE season = ? AND status = \'done\' AND (time_ms < ? OR (time_ms = ? AND score > ?))');
    $rankTime->execute([$season, $timeMs, $timeMs, $score]);
    return [
        'ok' => true,
        'rank_score' => (int) $rankScore->fetchColumn() + 1,
        'rank_time' => (int) $rankTime->fetchColumn() + 1,
    ];
}
