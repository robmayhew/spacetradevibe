<?php
// Copy to config.php on the Plesk host and fill in the MariaDB credentials.
// Do not commit config.php.

return [
    'host' => 'localhost',
    'name' => 'txl_trader',
    'user' => 'txl_trader',
    'pass' => 'change-me',
    // Optional. Unset uses the Cloudflare ranges published in db.php.
    // 'cloudflare_cidrs' => ['173.245.48.0/20'],
];
