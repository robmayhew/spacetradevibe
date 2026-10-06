<?php
// Local checks for the leaderboard and party API.
// Usage: php server/tests/harden.php
// Database defaults: localhost / txl_test / txl_test / txl_test.
// Override with TXL_DB_HOST, TXL_DB_NAME, TXL_DB_USER, TXL_DB_PASS.
// Refuses to replace an existing server/api/config.php, and deletes the one it writes.

ini_set('display_errors', 'stderr');

$root = dirname(__DIR__, 2);

if (($argv[1] ?? '') === '--case') {
    define('TXL_API_EMBED', true);
    $args = json_decode((string) getenv('TXL_CASE_ARGS'), true);
    if (!is_array($args)) {
        $args = [];
    }
    $_SERVER['REMOTE_ADDR'] = '198.51.100.8';
    unset($_SERVER['HTTP_CF_CONNECTING_IP']);
    harden_case((string) ($argv[2] ?? ''), $args, $root);
    exit(0);
}

$fail = 0;

function harden_check(string $label, bool $ok, string $detail = ''): void {
    global $fail;
    if ($ok) {
        echo "PASS $label\n";
        return;
    }
    $fail++;
    echo "FAIL $label" . ($detail !== '' ? " $detail" : '') . "\n";
}

function harden_lint(string $root): void {
    $files = glob($root . '/server/api/*.php') ?: [];
    $files[] = __FILE__;
    foreach ($files as $file) {
        if (basename($file) === 'config.php') {
            continue;
        }
        $out = shell_exec(PHP_BINARY . ' -l ' . escapeshellarg($file) . ' 2>&1');
        $text = trim((string) $out);
        harden_check('php -l ' . basename($file), str_contains($text, 'No syntax errors'), $text);
    }
}

function harden_static(string $root): void {
    $request = ['board.php', 'score.php', 'party.php', 'db.php', 'feedback.php'];
    foreach ($request as $name) {
        $text = (string) file_get_contents($root . '/server/api/' . $name);
        harden_check("no ALTER in $name", !str_contains($text, 'ALTER TABLE'));
    }
    $ht = (string) file_get_contents($root . '/server/api/.htaccess');
    harden_check(
        'htaccess public scripts',
        str_contains($ht, 'board') && str_contains($ht, 'score') && str_contains($ht, 'feedback') && str_contains($ht, 'party') && str_contains($ht, 'Require all denied')
    );
    $mig = (string) file_get_contents($root . '/server/migrations.sql');
    harden_check('migration has run_auth', str_contains($mig, 'CREATE TABLE IF NOT EXISTS run_auth'));
    harden_check('migration has rate_buckets', str_contains($mig, 'CREATE TABLE IF NOT EXISTS rate_buckets'));
}

function harden_apply_schema(PDO $pdo, string $path): void {
    $sql = (string) file_get_contents($path);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (explode(';', (string) $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') {
            continue;
        }
        $pdo->exec($stmt);
    }
}

function harden_reset(PDO $pdo, string $root): void {
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach (['runs', 'rate_hits', 'party_rooms', 'party_signals', 'party_live', 'feedback', 'run_auth', 'rate_buckets'] as $table) {
        $pdo->exec('DROP TABLE IF EXISTS `' . $table . '`');
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    harden_apply_schema($pdo, $root . '/server/schema.sql');
}

function harden_run(string $name, array $args = []): array {
    $env = getenv();
    if (!is_array($env)) {
        $env = [];
    }
    $env['TXL_CASE_ARGS'] = json_encode($args);
    $proc = proc_open(
        [PHP_BINARY, __FILE__, '--case', $name],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        null,
        $env
    );
    if (!is_resource($proc)) {
        return ['code' => 1, 'json' => null, 'stdout' => '', 'stderr' => 'proc_open failed'];
    }
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    $json = json_decode((string) $stdout, true);
    return [
        'code' => $code,
        'json' => is_array($json) ? $json : null,
        'stdout' => (string) $stdout,
        'stderr' => (string) $stderr,
    ];
}

function harden_detail(array $res): string {
    $out = trim($res['stdout']);
    $err = trim($res['stderr']);
    return trim($out . ($err !== '' ? ' stderr=' . $err : ''));
}

function harden_case(string $name, array $args, string $root): void {
    if ($name === 'ip') {
        require $root . '/server/api/db.php';
        $report = [];
        $_SERVER['REMOTE_ADDR'] = '198.51.100.8';
        $_SERVER['HTTP_CF_CONNECTING_IP'] = '203.0.113.9';
        $report['spoof'] = client_ip();
        $_SERVER['REMOTE_ADDR'] = '162.159.32.10';
        $_SERVER['HTTP_CF_CONNECTING_IP'] = '203.0.113.50';
        $report['trust'] = client_ip();
        $_SERVER['REMOTE_ADDR'] = '::ffff:104.16.1.2';
        $_SERVER['HTTP_CF_CONNECTING_IP'] = '198.51.100.20';
        $report['mapped'] = client_ip();
        $_SERVER['REMOTE_ADDR'] = '162.159.32.10';
        $_SERVER['HTTP_CF_CONNECTING_IP'] = '203.0.113.50, 198.51.100.1';
        $report['comma'] = client_ip();
        $_SERVER['REMOTE_ADDR'] = '2001:db8::5';
        $_SERVER['HTTP_CF_CONNECTING_IP'] = '203.0.113.50';
        $report['v6spoof'] = client_ip();
        $_SERVER['REMOTE_ADDR'] = '2606:4700::10';
        $_SERVER['HTTP_CF_CONNECTING_IP'] = '203.0.113.77';
        $report['v6trust'] = client_ip();
        $report['season'] = board_season('Beta');
        echo json_encode($report);
        return;
    }
    if ($name === 'season-array') {
        require $root . '/server/api/db.php';
        board_season(['Beta']);
        echo json_encode(['error' => 'expected rejection']);
        return;
    }
    if (str_starts_with($name, 'score-')) {
        require $root . '/server/api/score.php';
        $pdo = db();
        if ($name === 'score-start') {
            echo json_encode(score_start($pdo, ['run_id' => (string) $args['run_id']]));
            return;
        }
        echo json_encode(score_submit($pdo, $args['body']));
        return;
    }
    require $root . '/server/api/party.php';
    $pdo = db();
    if ($name === 'party-setup') {
        $created = party_create($pdo);
        $joined = party_join($pdo, ['room' => $created['room'], 'callsign' => 'Wren']);
        $input = party_input($pdo, [
            'room' => $created['room'],
            'token' => $joined['token'],
            'mx' => 0.5,
            'my' => -0.25,
            'fire' => 1,
        ]);
        $poll = party_poll($pdo, ['room' => $created['room'], 'token' => $created['token']]);
        $frame = party_frame($pdo, ['room' => $created['room'], 'token' => $created['token'], 'frame' => ['x' => 1]]);
        $signal = party_signal($pdo, [
            'room' => $created['room'],
            'token' => $created['token'],
            'kind' => 'offer',
            'to' => $joined['peer'],
            'payload' => ['sdp' => 'v=0'],
        ]);
        echo json_encode([
            'room' => $created['room'],
            'host_token' => $created['token'],
            'host_peer' => $created['peer'],
            'escort_token' => $joined['token'],
            'escort_peer' => $joined['peer'],
            'input_ok' => !empty($input['ok']),
            'poll_ok' => !empty($poll['ok']),
            'frame_ok' => !empty($frame['ok']),
            'signal_ok' => !empty($signal['ok']),
            'escorts' => count($poll['escorts'] ?? []),
        ]);
        return;
    }
    if ($name === 'party-big-frame') {
        party_frame($pdo, [
            'room' => $args['room'],
            'token' => $args['host_token'],
            'frame' => str_repeat('A', 9000),
        ]);
        echo json_encode(['error' => 'expected rejection']);
        return;
    }
    if ($name === 'party-big-signal') {
        party_signal($pdo, [
            'room' => $args['room'],
            'token' => $args['host_token'],
            'kind' => 'offer',
            'to' => $args['escort_peer'],
            'payload' => str_repeat('B', 9000),
        ]);
        echo json_encode(['error' => 'expected rejection']);
        return;
    }
    if ($name === 'party-flood') {
        $joined = party_join($pdo, ['room' => $args['room'], 'callsign' => 'Flood']);
        $body = [
            'room' => $args['room'],
            'token' => $joined['token'],
            'mx' => 1,
            'my' => 0,
            'fire' => 0,
        ];
        $n = 0;
        for ($i = 0; $i < 200; $i++) {
            party_input($pdo, $body);
            $n++;
        }
        fwrite(STDERR, "accepted=$n\n");
        party_input($pdo, $body);
        fwrite(STDERR, 'accepted=' . ($n + 1) . "\n");
        echo json_encode(['error' => 'limit did not trip']);
        return;
    }
    if ($name === 'party-poll') {
        echo json_encode(party_poll($pdo, ['room' => $args['room'], 'token' => $args['host_token']]));
        return;
    }
    if ($name === 'party-prune') {
        $room = (string) $args['room'];
        $from = (string) $args['host_peer'];
        $to = (string) $args['escort_peer'];
        $before = (int) $pdo->query('SELECT COUNT(*) FROM party_signals')->fetchColumn();
        $pdo->prepare('INSERT INTO party_signals (room, from_peer, to_peer, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 5 MINUTE))')
            ->execute([$room, $from, $to, 'ice', '{}']);
        $pdo->prepare('INSERT INTO party_signals (room, from_peer, to_peer, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, NOW())')
            ->execute([$room, $from, $to, 'answer', '{"ok":1}']);
        party_prune($pdo);
        $after = (int) $pdo->query('SELECT COUNT(*) FROM party_signals')->fetchColumn();
        $old = (int) $pdo->query('SELECT COUNT(*) FROM party_signals WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 MINUTE)')->fetchColumn();
        echo json_encode(['before' => $before, 'after' => $after, 'old' => $old]);
        return;
    }
    fwrite(STDERR, "unknown case $name\n");
    exit(1);
}

function harden_body(string $runId, string $token, string $nonce, array $over = []): array {
    $body = array_merge([
        'callsign' => 'Nym',
        'run_id' => $runId,
        'token' => $token,
        'nonce' => $nonce,
        'status' => 'live',
        'time_ms' => 0,
        'earned' => 0,
        'kills' => 0,
        'bosses' => 0,
        'deaths' => 0,
        'deliveries' => 0,
        'credits' => 60,
        'paced' => 1,
        'pace' => 100,
        'seed' => 1,
        'season' => 'Beta',
    ], $over);
    $body['score'] = (int) $body['earned'] + (int) $body['kills'] * 50 + (int) $body['bosses'] * 2500 - (int) $body['deaths'] * 1000;
    return $body;
}

harden_lint($root);
harden_static($root);

$host = getenv('TXL_DB_HOST') ?: 'localhost';
$name = getenv('TXL_DB_NAME') ?: 'txl_test';
$user = getenv('TXL_DB_USER') ?: 'txl_test';
$pass = getenv('TXL_DB_PASS') ?: 'txl_test';
$cfgPath = $root . '/server/api/config.php';

if (is_file($cfgPath)) {
    fwrite(STDERR, "Refusing to replace existing server/api/config.php\n");
    exit(1);
}

$created = false;
try {
    $cfg = "<?php\nreturn " . var_export([
        'host' => $host,
        'name' => $name,
        'user' => $user,
        'pass' => $pass,
    ], true) . ";\n";
    if (file_put_contents($cfgPath, $cfg) === false) {
        throw new RuntimeException('Could not write config.php');
    }
    $created = true;

    $pdo = new PDO(
        'mysql:host=' . $host . ';dbname=' . $name . ';charset=utf8mb4',
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
    harden_reset($pdo, $root);

    $ip = harden_run('ip');
    $ipj = $ip['json'] ?? [];
    harden_check('spoofed CF-Connecting-IP ignored', ($ipj['spoof'] ?? '') === '198.51.100.8', harden_detail($ip));
    harden_check('Cloudflare edge trusts CF-Connecting-IP', ($ipj['trust'] ?? '') === '203.0.113.50', harden_detail($ip));
    harden_check('mapped Cloudflare address trusts header', ($ipj['mapped'] ?? '') === '198.51.100.20', harden_detail($ip));
    harden_check('comma in CF-Connecting-IP falls back', ($ipj['comma'] ?? '') === '162.159.32.10', harden_detail($ip));
    harden_check('non-Cloudflare IPv6 ignores header', ($ipj['v6spoof'] ?? '') === '2001:db8::5', harden_detail($ip));
    harden_check('Cloudflare IPv6 trusts header', ($ipj['v6trust'] ?? '') === '203.0.113.77', harden_detail($ip));
    harden_check('season Beta lowercases', ($ipj['season'] ?? '') === 'beta', harden_detail($ip));

    $season = harden_run('season-array');
    harden_check('season array rejected', ($season['json']['error'] ?? '') === 'Invalid season.', harden_detail($season));

    $runId = '11111111-1111-4111-8111-111111111111';
    $started = harden_run('score-start', ['run_id' => $runId]);
    $token = (string) ($started['json']['token'] ?? '');
    harden_check('legit start', ($started['json']['ok'] ?? false) === true && preg_match('/^[0-9a-f]{64}$/', $token) === 1, harden_detail($started));

    $liveBody = harden_body($runId, $token, 'nonce-live-1');
    $live = harden_run('score-submit', ['body' => $liveBody]);
    harden_check('legit live zeros', ($live['json']['ok'] ?? false) === true, harden_detail($live));
    $row = $pdo->prepare('SELECT score, status, season, callsign FROM runs WHERE run_id = ?');
    $row->execute([$runId]);
    $stored = $row->fetch() ?: [];
    harden_check('live row stored as beta', ((int) ($stored['score'] ?? -1)) === 0 && ($stored['status'] ?? '') === 'live' && ($stored['season'] ?? '') === 'beta', json_encode($stored));

    $pdo->prepare('UPDATE run_auth SET started_at = DATE_SUB(NOW(), INTERVAL 6 MINUTE) WHERE run_id = ?')->execute([$runId]);
    $doneBody = harden_body($runId, $token, 'nonce-done-1', [
        'status' => 'done',
        'time_ms' => 200000,
        'earned' => 12000,
        'kills' => 4,
        'credits' => 60,
    ]);
    $done = harden_run('score-submit', ['body' => $doneBody]);
    harden_check('legit done after elapsed time', ($done['json']['ok'] ?? false) === true && (int) $doneBody['score'] === 12200, harden_detail($done));
    $row->execute([$runId]);
    $stored = $row->fetch() ?: [];
    harden_check('done score stored', ((int) ($stored['score'] ?? -1)) === 12200 && ($stored['status'] ?? '') === 'done', json_encode($stored));

    $replay = harden_run('score-submit', ['body' => $doneBody]);
    harden_check('identical replay accepted', ($replay['json']['ok'] ?? false) === true, harden_detail($replay));

    $same = $doneBody;
    $same['callsign'] = 'Other';
    $same['nonce'] = 'nonce-done-2';
    $sameRes = harden_run('score-submit', ['body' => $same]);
    $row->execute([$runId]);
    $stored = $row->fetch() ?: [];
    harden_check('same finished result does not rewrite callsign', ($sameRes['json']['ok'] ?? false) === true && ($stored['callsign'] ?? '') === 'Nym', harden_detail($sameRes) . ' ' . json_encode($stored));

    $rewrite = $doneBody;
    $rewrite['nonce'] = 'nonce-done-3';
    $rewrite['earned'] = 20000;
    $rewrite['kills'] = 4;
    $rewrite['score'] = 20000 + 4 * 50;
    $rewriteRes = harden_run('score-submit', ['body' => $rewrite]);
    $row->execute([$runId]);
    $stored = $row->fetch() ?: [];
    harden_check('finished run rewrite rejected', ($rewriteRes['json']['error'] ?? '') === 'This run is already posted.', harden_detail($rewriteRes));
    harden_check('finished score unchanged', ((int) ($stored['score'] ?? -1)) === 12200 && ($stored['callsign'] ?? '') === 'Nym', json_encode($stored));

    $bad = $doneBody;
    $bad['token'] = str_repeat('ab', 32);
    $bad['nonce'] = 'nonce-bad-1';
    $badRes = harden_run('score-submit', ['body' => $bad]);
    harden_check('wrong token rejected', ($badRes['json']['error'] ?? '') === 'Bad run token.', harden_detail($badRes));

    $forged = harden_body('33333333-3333-4333-8333-333333333333', '', 'nonce-forge1', [
        'status' => 'done',
        'time_ms' => 200000,
        'earned' => 49000000,
    ]);
    $forgedRes = harden_run('score-submit', ['body' => $forged]);
    harden_check('curl without token rejected', ($forgedRes['json']['error'] ?? '') === 'Bad run token.', harden_detail($forgedRes));

    $hugeId = '22222222-2222-4222-8222-222222222222';
    $hugeStart = harden_run('score-start', ['run_id' => $hugeId]);
    $hugeToken = (string) ($hugeStart['json']['token'] ?? '');
    $hugeBody = harden_body($hugeId, $hugeToken, 'nonce-huge-1', [
        'status' => 'live',
        'time_ms' => 1,
        'earned' => 49000000,
        'credits' => 0,
    ]);
    $hugeRes = harden_run('score-submit', ['body' => $hugeBody]);
    $count = $pdo->prepare('SELECT COUNT(*) FROM runs WHERE run_id = ?');
    $count->execute([$hugeId]);
    harden_check('immediate near-max score rejected', ($hugeRes['json']['error'] ?? '') === 'Score is too high for how long this run has been open.', harden_detail($hugeRes));
    harden_check('near-max score not stored', (int) $count->fetchColumn() === 0);

    $party = harden_run('party-setup');
    $pj = $party['json'] ?? [];
    harden_check(
        'party create join input poll frame signal',
        !empty($pj['input_ok']) && !empty($pj['poll_ok']) && !empty($pj['frame_ok']) && !empty($pj['signal_ok']) && (int) ($pj['escorts'] ?? 0) === 1,
        harden_detail($party)
    );

    $bigFrame = harden_run('party-big-frame', $pj);
    harden_check('oversized frame rejected', ($bigFrame['json']['error'] ?? '') === 'Frame is too large.', harden_detail($bigFrame));
    $bigSignal = harden_run('party-big-signal', $pj);
    harden_check('oversized signal rejected', ($bigSignal['json']['error'] ?? '') === 'Signal is too large.', harden_detail($bigSignal));

    $flood = harden_run('party-flood', $pj);
    harden_check(
        'party input rate limit',
        ($flood['json']['error'] ?? '') === 'Too many party requests. Try again in a moment.' && str_contains($flood['stderr'], 'accepted=200'),
        harden_detail($flood)
    );
    $poll = harden_run('party-poll', $pj);
    harden_check('host poll still works after input limit', ($poll['json']['ok'] ?? false) === true, harden_detail($poll));

    $prune = harden_run('party-prune', $pj);
    $pr = $prune['json'] ?? [];
    harden_check(
        'old party signals pruned',
        (int) ($pr['old'] ?? 1) === 0 && (int) ($pr['after'] ?? 0) === (int) ($pr['before'] ?? -1) + 1,
        harden_detail($prune)
    );
} catch (Throwable $e) {
    $fail++;
    echo 'FAIL harness ' . $e->getMessage() . "\n";
} finally {
    if ($created && is_file($cfgPath)) {
        unlink($cfgPath);
    }
}

echo $fail === 0 ? "OK\n" : "FAILED $fail\n";
exit($fail === 0 ? 0 : 1);
