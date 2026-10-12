<?php
declare(strict_types=1);
/**
 * FUTA World onboarding API (v1). One file router so Cline can read it top to bottom.
 * Contract = docs/API.md. The browser client = public/world/game/onboarding/api.js (same paths, same JSON).
 * Dev run:  php -S localhost:8080 -t api/v1 api/v1/index.php     (uses SQLite file api/data/dev.sqlite)
 * Production: point DSN/Google client id at your own DB/env in api/config.php.
 */
require __DIR__ . '/../src/AvatarValidator.php';
require __DIR__ . '/../src/GoogleVerifier.php';
$cfg = require __DIR__ . '/../config.php';
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
header('Content-Type: application/json; charset=utf-8');

function out(array $d, int $code = 200): never { http_response_code($code); echo json_encode($d + ['ok' => $code < 400], JSON_UNESCAPED_UNICODE); exit; }
function fail(string $m, int $code = 400): never { out(['error' => $m], $code); }

$pdo = new PDO($cfg['dsn'], $cfg['db_user'] ?? null, $cfg['db_pass'] ?? null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
if (str_starts_with($cfg['dsn'], 'sqlite')) $pdo->exec((string)file_get_contents(__DIR__ . '/../sql/schema.sql'));

$path = '/' . trim(preg_replace('#^.*?/api/v1#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)), '/');
$method = $_SERVER['REQUEST_METHOD'];
$body = json_decode((string)file_get_contents('php://input'), true) ?: [];
$validator = new AvatarValidator();

function publicUser(array $u): array {
    return ['id' => (int)$u['id'], 'email' => $u['email'], 'username' => $u['username'], 'dob' => $u['dob'], 'teen' => (bool)$u['is_teen'],
            'avatar' => $u['avatar_json'] ? json_decode($u['avatar_json'], true) : null, 'life' => $u['life_start']];
}
function me(PDO $pdo): ?array { if (empty($_SESSION['uid'])) return null; $s = $pdo->prepare('SELECT * FROM world_users WHERE id=?'); $s->execute([$_SESSION['uid']]); return $s->fetch() ?: null; }
function needMe(PDO $pdo): array { $u = me($pdo); if (!$u) fail('Please sign in again.', 401); return $u; }
function rateLimit(string $key, int $max, int $secs): void { $k = 'rl_' . $key; $now = time(); $_SESSION[$k] = array_values(array_filter($_SESSION[$k] ?? [], fn($t) => $t > $now - $secs)); if (count($_SESSION[$k]) >= $max) fail('Too many tries. Please wait a minute.', 429); $_SESSION[$k][] = $now; }

switch ("$method $path") {
    case 'POST /auth/register': {
        rateLimit('auth', 8, 60);
        $email = strtolower(trim((string)($body['email'] ?? ''))); $pw = (string)($body['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address.');
        if (strlen($pw) < 8) fail('Password needs at least 8 characters.');
        $s = $pdo->prepare('SELECT 1 FROM world_users WHERE email=?'); $s->execute([$email]); if ($s->fetch()) fail('That email already has an account. Try signing in.', 409);
        $pdo->prepare('INSERT INTO world_users(email,password_hash) VALUES(?,?)')->execute([$email, password_hash($pw, PASSWORD_DEFAULT)]);
        session_regenerate_id(true); $_SESSION['uid'] = (int)$pdo->lastInsertId();
        out(['needsVerify' => false]); // TODO(email verification): set true + send a 6-digit code once your mailer is ready (docs/SIGNUP_AND_CHARACTER.md)
    }
    case 'POST /auth/login': {
        rateLimit('auth', 8, 60);
        $s = $pdo->prepare('SELECT * FROM world_users WHERE email=?'); $s->execute([strtolower(trim((string)($body['email'] ?? '')))]); $u = $s->fetch();
        if (!$u || !$u['password_hash'] || !password_verify((string)($body['password'] ?? ''), $u['password_hash'])) fail('Wrong email or password.', 401);
        session_regenerate_id(true); $_SESSION['uid'] = (int)$u['id']; out(['user' => publicUser($u)]);
    }
    case 'POST /auth/google': {
        rateLimit('auth', 8, 60);
        $g = (new GoogleVerifier($cfg['google_client_id']))->verify((string)($body['credential'] ?? ''));
        if (!$g) fail('Google sign-in could not be verified.', 401);
        $s = $pdo->prepare('SELECT * FROM world_users WHERE google_sub=? OR (email=? AND ?=1)'); $s->execute([$g['sub'], $g['email'], $g['email_verified'] ? 1 : 0]); $u = $s->fetch();
        if (!$u) { $pdo->prepare('INSERT INTO world_users(email,google_sub) VALUES(?,?)')->execute([$g['email'], $g['sub']]); $s = $pdo->prepare('SELECT * FROM world_users WHERE id=?'); $s->execute([$pdo->lastInsertId()]); $u = $s->fetch(); }
        elseif (!$u['google_sub']) $pdo->prepare('UPDATE world_users SET google_sub=? WHERE id=?')->execute([$g['sub'], $u['id']]);
        session_regenerate_id(true); $_SESSION['uid'] = (int)$u['id']; out(['user' => publicUser($u)]);
    }
    case 'POST /auth/logout': { $_SESSION = []; session_destroy(); out([]); }
    case 'GET /me': { $u = me($pdo); out(['user' => $u ? publicUser($u) : null]); }
    case 'GET /username/check': {
        $n = strtolower((string)($_GET['u'] ?? ''));
        if (!preg_match('/^[a-z0-9_]{3,20}$/', $n)) out(['available' => false, 'reason' => 'Use 3–20 letters, numbers or _ only.']);
        if (in_array($n, $cfg['reserved_usernames'], true)) out(['available' => false, 'reason' => 'That name is reserved.']);
        $s = $pdo->prepare('SELECT id FROM world_users WHERE username=?'); $s->execute([$n]); $row = $s->fetch();
        $mine = !empty($_SESSION['uid']) && $row && (int)$row['id'] === (int)$_SESSION['uid'];
        out(['available' => !$row || $mine, 'reason' => ($row && !$mine) ? 'That name is taken.' : null]);
    }
    case 'POST /me/profile': {
        $u = needMe($pdo); $n = strtolower(trim((string)($body['username'] ?? ''))); $dob = (string)($body['dob'] ?? '');
        if (!preg_match('/^[a-z0-9_]{3,20}$/', $n) || in_array($n, $cfg['reserved_usernames'], true)) fail('Pick a different username.');
        $d = DateTime::createFromFormat('Y-m-d', $dob); if (!$d || $d->format('Y-m-d') !== $dob) fail('Enter a valid date of birth.');
        $age = $d->diff(new DateTime('today'))->y; if ($age < $cfg['min_age']) fail('You need to be at least ' . $cfg['min_age'] . ' to join.', 403);
        $s = $pdo->prepare('SELECT id FROM world_users WHERE username=? AND id<>?'); $s->execute([$n, $u['id']]); if ($s->fetch()) fail('That name is taken.', 409);
        $pdo->prepare('UPDATE world_users SET username=?, dob=?, is_teen=? WHERE id=?')->execute([$n, $dob, $age < $cfg['adult_age'] ? 1 : 0, $u['id']]);
        out(['user' => publicUser(needMe($pdo))]);
    }
    case 'POST /me/avatar': {
        $u = needMe($pdo); $look = $validator->clean($body['look'] ?? null, false); // false = players can never wear NPC-only uniforms
        $pdo->prepare('UPDATE world_users SET avatar_json=? WHERE id=?')->execute([json_encode($look), $u['id']]); out(['look' => $look]);
    }
    case 'POST /me/life': {
        $u = needMe($pdo); $id = (string)($body['start'] ?? '');
        if (!in_array($id, $cfg['life_starts'], true)) fail('Unknown start.');
        $pdo->prepare('UPDATE world_users SET life_start=? WHERE id=?')->execute([$id, $u['id']]); out(['life' => $id]);
    }
    default: fail('Not found', 404);
}
