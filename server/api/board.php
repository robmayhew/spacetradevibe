<?php

require __DIR__ . '/db.php';

$sort = $_GET['sort'] ?? 'score';
$order = $sort === 'time'
    ? 'time_ms ASC, score DESC'
    : 'score DESC, time_ms ASC';

$st = db()->query("SELECT callsign, score, time_ms FROM runs ORDER BY $order LIMIT 20");
$rows = [];
$rank = 1;
foreach ($st as $row) {
    $row['rank'] = $rank++;
    $row['score'] = (int) $row['score'];
    $row['time_ms'] = (int) $row['time_ms'];
    $rows[] = $row;
}

json_out(['rows' => $rows]);
