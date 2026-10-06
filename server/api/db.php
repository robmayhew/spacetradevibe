<?php

function txl_cfg(): array {
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $cfgPath = __DIR__ . '/config.php';
    if (!is_file($cfgPath)) {
        $cfg = [];
        return $cfg;
    }
    $loaded = require $cfgPath;
    $cfg = is_array($loaded) ? $loaded : [];
    return $cfg;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $cfgPath = __DIR__ . '/config.php';
    if (!is_file($cfgPath)) {
        json_error(503, 'The board is offline.');
    }
    $cfg = txl_cfg();
    if (!isset($cfg['host'], $cfg['name'], $cfg['user'], $cfg['pass'])) {
        json_error(503, 'The board is offline.');
    }
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

function board_season($raw): string {
    if (!is_string($raw)) {
        json_error(400, 'Invalid season.');
    }
    $s = strtolower($raw);
    $s = preg_replace('/[^a-z0-9-]/', '', $s);
    if (!is_string($s) || $s === '' || strlen($s) > 16) {
        return 'beta';
    }
    return $s;
}

function client_ip(): string {
    $remote = ip_normalize((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($remote !== '' && ip_is_cloudflare($remote)) {
        $header = ip_normalize(cf_connecting_ip());
        if ($header !== '') {
            return $header;
        }
    }
    if ($remote !== '') {
        return $remote;
    }
    return '0.0.0.0';
}

// Published Cloudflare ranges as of 2026-10-06.
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
// Optional config key cloudflare_cidrs replaces this list when it is a non-empty array of strings.
function cloudflare_cidrs(): array {
    $cfg = txl_cfg();
    $custom = $cfg['cloudflare_cidrs'] ?? null;
    if (is_array($custom) && $custom) {
        $out = [];
        foreach ($custom as $cidr) {
            if (is_string($cidr) && $cidr !== '') $out[] = $cidr;
        }
        if ($out) return $out;
    }
    return [
        '173.245.48.0/20',
        '103.21.244.0/22',
        '103.22.200.0/22',
        '103.31.4.0/22',
        '141.101.64.0/18',
        '108.162.192.0/18',
        '190.93.240.0/20',
        '188.114.96.0/20',
        '197.234.240.0/22',
        '198.41.128.0/17',
        '162.158.0.0/15',
        '104.16.0.0/13',
        '104.24.0.0/14',
        '172.64.0.0/13',
        '131.0.72.0/22',
        '2400:cb00::/32',
        '2606:4700::/32',
        '2803:f800::/32',
        '2405:b500::/32',
        '2405:8100::/32',
        '2a06:98c0::/29',
        '2c0f:f248::/32',
    ];
}

function cf_connecting_ip(): string {
    $raw = trim((string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? ''));
    if ($raw === '' || str_contains($raw, ',')) return '';
    return $raw;
}

function ip_normalize(string $ip): string {
    $ip = trim($ip);
    if ($ip === '') return '';
    if (str_starts_with(strtolower($ip), '::ffff:')) {
        $v4 = substr($ip, 7);
        if (filter_var($v4, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) return $v4;
    }
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '';
}

function ip_is_cloudflare(string $ip): bool {
    foreach (cloudflare_cidrs() as $cidr) {
        if (ip_in_cidr($ip, $cidr)) return true;
    }
    return false;
}

function ip_in_cidr(string $ip, string $cidr): bool {
    $slash = strpos($cidr, '/');
    if ($slash === false) return false;
    $subnet = substr($cidr, 0, $slash);
    $bits = (int) substr($cidr, $slash + 1);
    $ipBin = @inet_pton($ip);
    $subBin = @inet_pton($subnet);
    if ($ipBin === false || $subBin === false || strlen($ipBin) !== strlen($subBin)) return false;
    $total = strlen($ipBin) * 8;
    if ($bits < 0 || $bits > $total) return false;
    $bytes = intdiv($bits, 8);
    $rem = $bits % 8;
    if ($bytes > 0 && substr($ipBin, 0, $bytes) !== substr($subBin, 0, $bytes)) return false;
    if ($rem === 0) return true;
    $mask = (0xFF << (8 - $rem)) & 0xFF;
    return (ord($ipBin[$bytes]) & $mask) === (ord($subBin[$bytes]) & $mask);
}

function rate_bucket_hit(PDO $pdo, string $scope, string $subject, int $windowSec, int $max, string $message): void {
    if ($windowSec < 1) {
        $windowSec = 1;
    }
    if (strlen($subject) > 64) {
        $subject = substr($subject, 0, 64);
    }
    $bucket = intdiv(time(), $windowSec);
    if (random_int(1, 40) === 1) {
        $pdo->prepare('DELETE FROM rate_buckets WHERE scope = ? AND bucket < ?')->execute([$scope, $bucket - 2]);
    }
    $pdo->prepare(
        'INSERT INTO rate_buckets (scope, subject, bucket, hits) VALUES (?, ?, ?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(hits + 1)'
    )->execute([$scope, $subject, $bucket]);
    $hits = (int) $pdo->query('SELECT LAST_INSERT_ID()')->fetchColumn();
    if ($hits > $max) {
        json_error(429, $message);
    }
}
