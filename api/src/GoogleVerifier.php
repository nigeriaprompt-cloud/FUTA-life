<?php
declare(strict_types=1);
/**
 * Verifies a Google Identity Services ID token ("credential") on the SERVER.
 * Uses Google's tokeninfo endpoint (simple, fine for launch). Later you can switch to local JWT verification with google/apiclient.
 * UNTESTED against real Google (needs your Web client ID) — see docs/SIGNUP_AND_CHARACTER.md "Go-live checklist".
 */
final class GoogleVerifier
{
    public function __construct(private string $clientId) {}

    /** @return array{sub:string,email:string,email_verified:bool,name:string}|null */
    public function verify(string $idToken): ?array
    {
        if ($this->clientId === '' || $idToken === '') return null;
        $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken));
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6]);
        $raw = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        if ($code !== 200 || !$raw) return null;
        $d = json_decode($raw, true);
        if (!is_array($d) || ($d['aud'] ?? '') !== $this->clientId) return null;
        if (!in_array($d['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) return null;
        if ((int)($d['exp'] ?? 0) < time()) return null;
        return ['sub' => (string)$d['sub'], 'email' => strtolower((string)($d['email'] ?? '')), 'email_verified' => ($d['email_verified'] ?? '') === 'true', 'name' => (string)($d['name'] ?? '')];
    }
}
