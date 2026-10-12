<?php
// Config for the onboarding API. Cline: put secrets in environment variables, not in git.
return [
    'dsn' => getenv('FUTA_DSN') ?: 'sqlite:' . __DIR__ . '/data/dev.sqlite',   // production e.g. 'mysql:host=localhost;dbname=yoursite;charset=utf8mb4'
    'db_user' => getenv('FUTA_DB_USER') ?: null,
    'db_pass' => getenv('FUTA_DB_PASS') ?: null,
    'google_client_id' => getenv('FUTA_GOOGLE_CLIENT_ID') ?: '',               // same Web client ID as public/world/game/onboarding/config.js
    'min_age' => 13, 'adult_age' => 18,
    'reserved_usernames' => ['admin', 'futa', 'support', 'moderator', 'staff', 'security', 'system'],
    'life_starts' => ['fresh', 'hustler', 'creative'],                         // keep in sync with onboarding/life-start.json
];
