<?php

require __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $kind = ($_GET['kind'] ?? 'feature') === 'bug' ? 'bug' : 'feature';
    if ($kind !== 'feature') {
        json_error(403, 'Bug reports are not listed.');
    }
    $pdo = db();
    $st = $pdo->query(
        'SELECT title, body, callsign, game_version AS version, created_at
         FROM feedback
         WHERE kind = \'feature\' AND hidden = 0
         ORDER BY created_at DESC
         LIMIT 50'
    );
    $rows = [];
    foreach ($st->fetchAll() as $row) {
        $rows[] = [
            'title' => (string) $row['title'],
            'body' => (string) $row['body'],
            'callsign' => (string) $row['callsign'],
            'version' => (string) $row['version'],
            'created_at' => (string) $row['created_at'],
        ];
    }
    json_out(['rows' => $rows]);
}

if ($method !== 'POST') {
    json_error(405, 'GET or POST feedback.');
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    json_error(400, 'Expected JSON.');
}

$kind = (($body['kind'] ?? '') === 'bug') ? 'bug' : ((($body['kind'] ?? '') === 'feature') ? 'feature' : '');
if ($kind === '') {
    json_error(400, 'Kind must be bug or feature.');
}

$callsign = trim((string) ($body['callsign'] ?? ''));
if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9 -]{0,14}[A-Za-z0-9]$/', $callsign)) {
    json_error(400, 'Callsign must be 2–16 letters, numbers, spaces, or hyphens.');
}

$title = trim((string) ($body['title'] ?? ''));
$details = trim((string) ($body['body'] ?? ''));
if ($title === '' || strlen($title) > 120) {
    json_error(400, 'Title must be 1–120 characters.');
}
if ($details === '' || strlen($details) > 2000) {
    json_error(400, 'Details must be 1–2000 characters.');
}

$version = trim((string) ($body['version'] ?? ''));
if ($version === '' || strlen($version) > 32 || !preg_match('/^[A-Za-z0-9._+-]+$/', $version)) {
    json_error(400, 'Invalid version.');
}

$userAgent = trim((string) ($body['user_agent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? '')));
if (strlen($userAgent) > 512) {
    $userAgent = substr($userAgent, 0, 512);
}
if ($kind !== 'bug') {
    $userAgent = '';
}

$pdo = db();
$ip = client_ip();
$hit = $pdo->prepare('SELECT COUNT(*) FROM feedback WHERE ip = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)');
$hit->execute([$ip]);
if ((int) $hit->fetchColumn() >= 8) {
    json_error(429, 'Too many reports from this address. Try again later.');
}

$st = $pdo->prepare(
    'INSERT INTO feedback (kind, title, body, callsign, game_version, user_agent, ip, hidden)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
);
$st->execute([$kind, $title, $details, $callsign, $version, $userAgent, $ip]);

json_out(['ok' => true]);
