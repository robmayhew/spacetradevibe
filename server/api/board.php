<?php

require __DIR__ . '/db.php';

$sort = $_GET['sort'] ?? 'score';
if ($sort === 'time') {
    $order = 'time_ms ASC, score DESC';
    $where = "status = 'done'";
} else {
    $order = 'score DESC, time_ms ASC';
    $where = "status IN ('done', 'lost') OR (status = 'live' AND updated_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE))";
}

$pdo = db();
ensure_runs_board_meta($pdo);

$season = board_season($_GET['season'] ?? 'beta');
$where = "season = " . $pdo->quote($season) . " AND ($where)";

$st = $pdo->query(
    "SELECT callsign, score, time_ms, status, paced, credits, pace, season,
            earned, kills, deaths, deliveries, system_name, ship_rating, visited, deepest
     FROM runs WHERE $where ORDER BY $order LIMIT 20"
);
$rows = [];
$rank = 1;
foreach ($st as $row) {
    $status = (string) ($row['status'] ?? '');
    if ($status === 'live') {
        $status = 'live';
    } elseif ($status === 'lost') {
        $status = 'lost';
    } else {
        $status = 'done';
    }
    $rows[] = [
        'rank' => $rank++,
        'callsign' => $row['callsign'],
        'score' => (int) $row['score'],
        'time_ms' => (int) $row['time_ms'],
        'status' => $status,
        'paced' => ((int) ($row['paced'] ?? 1)) !== 0,
        'credits' => (int) ($row['credits'] ?? 0),
        'pace' => (int) ($row['pace'] ?? 100),
        'season' => $row['season'] ?: 'beta',
        'earned' => (int) ($row['earned'] ?? 0),
        'kills' => (int) ($row['kills'] ?? 0),
        'deaths' => (int) ($row['deaths'] ?? 0),
        'deliveries' => (int) ($row['deliveries'] ?? 0),
        'system' => (string) ($row['system_name'] ?? ''),
        'rating' => (int) ($row['ship_rating'] ?? 0),
        'visited' => (int) ($row['visited'] ?? 0),
        'deepest' => (int) ($row['deepest'] ?? 0),
    ];
}

json_out(['rows' => $rows, 'season' => $season]);
