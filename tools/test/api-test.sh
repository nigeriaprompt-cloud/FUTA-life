#!/usr/bin/env bash
# Smoke test for the PHP API. usage: bash tools/test/api-test.sh   (starts php -S on :8099, runs the flow, stops it)
cd "$(dirname "$0")/../.." || exit 1
rm -f api/data/dev.sqlite; php -S 127.0.0.1:8099 -t api/v1 api/v1/index.php >/dev/null 2>&1 & PID=$!; sleep 1
J=$(mktemp); C="curl -s -b $J -c $J -H Content-Type:application/json"; B=http://127.0.0.1:8099/api/v1
$C -X POST $B/auth/register -d '{"email":"a@b.co","password":"secret123"}'; echo
$C "$B/username/check?u=lagos_ada"; echo
$C -X POST $B/me/profile -d '{"username":"lagos_ada","dob":"2003-05-12"}'; echo
$C -X POST $B/me/avatar -d '{"look":{"body":{"frame":"f","height":9},"skin":99,"hair":{"style":"nope"},"wear":{"top":{"id":"uniform_shirt","c":1},"bottom":{"id":"mini","c":3,"p":"ankara_a"}}}}'; echo
$C -X POST $B/me/life -d '{"start":"creative"}'; echo
$C $B/me | head -c 300; echo
$C -X POST $B/me/profile -d '{"username":"kid","dob":"2020-01-01"}'; echo
kill $PID
