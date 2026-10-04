<?php

require __DIR__ . '/db.php';

$sort = $_GET['sort'] ?? 'score';
if ($sort === 'time') {
    $order = 'time_ms ASC, score DESC';
    $where = "status = 'done'";
} else {
    $order = 'score DESC, time_ms ASC';
    $where = "status = 'done' OR (status = 'live' AND updated_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE))";
}

$pdo = db();
ensure_runs_board($pdo);

$season = board_season($_GET['season'] ?? 'beta');
$where = "season = " . $pdo->quote($season) . " AND ($where)";

$st = $pdo->query("SELECT callsign, score, time_ms, status, paced, credits, pace, season FROM runs WHERE $where ORDER BY $order LIMIT 20");
$rows = [];
$rank = 1;
foreach ($st as $row) {
    $row['rank'] = $rank++;
    $row['score'] = (int) $row['score'];
    $row['time_ms'] = (int) $row['time_ms'];
    $row['status'] = ($row['status'] ?? '') === 'live' ? 'live' : 'done';
    $row['paced'] = ((int) ($row['paced'] ?? 1)) !== 0;
    $row['credits'] = (int) ($row['credits'] ?? 0);
    $row['pace'] = (int) ($row['pace'] ?? 100);
    $row['season'] = $row['season'] ?: 'beta';
    $rows[] = $row;
}

json_out(['rows' => $rows, 'season' => $season]);
