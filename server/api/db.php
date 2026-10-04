<?php

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $cfgPath = __DIR__ . '/config.php';
    if (!is_file($cfgPath)) {
        json_error(503, 'The board is offline.');
    }
    $cfg = require $cfgPath;
    $dsn = 'mysql:host=' . $cfg['host'] . ';dbname=' . $cfg['name'] . ';charset=utf8mb4';
    try {
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (PDOException $e) {
        json_error(503, 'The board is offline.');
    }
    return $pdo;
}

function json_out(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function json_error(int $status, string $message): void {
    json_out(['error' => $message], $status);
}

function ensure_runs_board(PDO $pdo): void {
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    $alters = [
        'ALTER TABLE runs ADD COLUMN paced TINYINT UNSIGNED NOT NULL DEFAULT 1',
        'ALTER TABLE runs ADD COLUMN credits INT UNSIGNED NOT NULL DEFAULT 0',
        'ALTER TABLE runs ADD COLUMN pace SMALLINT UNSIGNED NOT NULL DEFAULT 100',
        'ALTER TABLE runs ADD COLUMN season VARCHAR(16) NOT NULL DEFAULT \'beta\'',
    ];
    foreach ($alters as $sql) {
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            // column already exists
        }
    }
}

function board_season($raw): string {
    $s = strtolower(preg_replace('/[^a-z0-9-]/', '', (string) $raw));
    if ($s === '' || strlen($s) > 16) {
        return 'beta';
    }
    return $s;
}

function client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}
