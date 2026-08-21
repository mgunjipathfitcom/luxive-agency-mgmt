#!/usr/bin/env bash
# 公開用ゲートの実測検証。認証を経ずに中身へ到達できないことを確かめる。
# 使い方: bash test-results/gate-check.sh <BASE_URL> <PASSWORD>
set -u
BASE="${1:-http://localhost:8787}"
PW="${2:-local-test-password}"
JAR="$(mktemp)"
fails=0
# httpsとhttpでCookie名が違う(__Host-はSecure必須のためローカルでは使わない)
case "$BASE" in https://*) COOKIE=__Host-preview_gate;; *) COOKIE=preview_gate_dev;; esac

ok()   { printf '  OK   %s\n' "$1"; }
ng()   { printf '  NG   %s\n' "$1"; fails=$((fails+1)); }

code() { curl -sS -o /dev/null -w '%{http_code}' "$@"; }
body() { curl -sS "$@"; }

echo "== 1. 未認証では中身が一切返らない =="
for p in "/" "/index.html" "/index.html/" "/INDEX.HTML" "/%2e/" "/assets/app.js" "/artifact.html" "/does-not-exist"; do
  c=$(code "$BASE$p")
  if [ "$c" = "401" ] || [ "$c" = "404" ]; then ok "$p -> $c"; else ng "$p -> $c (401か404であるべき)"; fi
done

echo "== 2. 未認証のレスポンス本文にアプリが混ざっていない =="
b=$(body "$BASE/")
for needle in "AGENCY MANAGEMENT SYSTEM" "LUXIVE" "Luxive" "createRoot" "東都ホテル" "localStorage" "リンクスプロモーション"; do
  if printf '%s' "$b" | grep -q "$needle"; then ng "401の本文に「$needle」が漏れている"; else ok "401の本文に「$needle」なし"; fi
done
if printf '%s' "$b" | grep -q "試作版"; then ok "401の本文はゲート画面"; else ng "401の本文がゲート画面でない"; fi
if printf '%s' "$b" | grep -q "モック"; then ng "ゲート画面に「モック」が出ている"; else ok "ゲート画面に「モック」なし"; fi

echo "== 3. HEAD・他メソッド =="
c=$(curl -sS -I -o /dev/null -w '%{http_code}' "$BASE/"); [ "$c" = "401" ] && ok "HEAD / -> 401" || ng "HEAD / -> $c"
c=$(code -X POST "$BASE/");        [ "$c" = "405" ] && ok "POST / -> 405" || ng "POST / -> $c"
c=$(code -X DELETE "$BASE/");      [ "$c" = "405" ] && ok "DELETE / -> 405" || ng "DELETE / -> $c"
c=$(code "$BASE/__gate/login");    [ "$c" = "405" ] && ok "GET /__gate/login -> 405" || ng "GET /__gate/login -> $c"

echo "== 4. セキュリティヘッダ =="
h=$(curl -sS -D - -o /dev/null "$BASE/")
printf '%s' "$h" | grep -qi 'x-robots-tag: *noindex' && ok "X-Robots-Tag: noindex" || ng "X-Robots-Tag が無い"
printf '%s' "$h" | grep -qi 'x-frame-options: *DENY'  && ok "X-Frame-Options: DENY"  || ng "X-Frame-Options が無い"
printf '%s' "$h" | grep -qi 'referrer-policy'         && ok "Referrer-Policy"        || ng "Referrer-Policy が無い"

echo "== 5. robots.txt は認証なしで Disallow を返す =="
body "$BASE/robots.txt" | grep -q 'Disallow: /' && ok "robots.txt -> Disallow: /" || ng "robots.txt が想定と違う"

echo "== 6. 誤ったパスワードは通らない =="
c=$(code -X POST --data-urlencode "password=wrong-one" "$BASE/__gate/login")
[ "$c" = "401" ] || [ "$c" = "429" ] && ok "誤パスワード -> $c" || ng "誤パスワード -> $c"
c=$(code -X POST --data-urlencode "password=" "$BASE/__gate/login")
[ "$c" = "401" ] || [ "$c" = "429" ] && ok "空パスワード -> $c" || ng "空パスワード -> $c"

echo "== 7. 正しいパスワードで入れる(前後の空白・全角も吸収する) =="
rm -f "$JAR"
h=$(curl -sS -D - -o /dev/null -c "$JAR" -X POST --data-urlencode "password=  $PW  " "$BASE/__gate/login")
printf '%s' "$h" | grep -q '303' && ok "空白付きパスワード -> 303" || ng "空白付きパスワード -> $(printf '%s' "$h" | head -1)"
printf '%s' "$h" | grep -qi 'set-cookie' && ok "Cookieが発行される" || ng "Set-Cookieが無い"

echo "== 8. Cookieありで中身が返る =="
c=$(code -b "$JAR" "$BASE/")
[ "$c" = "200" ] && ok "認証後 / -> 200" || ng "認証後 / -> $c"
body -b "$JAR" "$BASE/" | grep -q "AGENCY MANAGEMENT SYSTEM" && ok "アプリ本体が配信される" || ng "アプリ本体が返っていない"
body -b "$JAR" "$BASE/" | grep -q "試作版" && ok "告知バーが入っている" || ng "告知バーが入っていない"
h=$(curl -sS -D - -o /dev/null -b "$JAR" "$BASE/")
printf '%s' "$h" | grep -qi 'x-robots-tag: *noindex' && ok "認証後もX-Robots-Tagが付く" || ng "認証後にX-Robots-Tagが無い"

echo "== 9. Cookieを改ざんすると弾かれる =="
echo "  (Cookie名: $COOKIE)"
TOK=$(grep -o 'v1\.[0-9]*\.[A-Za-z0-9_-]*' "$JAR" | head -1)
if [ -z "$TOK" ]; then ng "Cookieからトークンを取り出せない"; else
  EXP="${TOK%%.*}"; REST="${TOK#*.}"; TS="${REST%%.*}"; SIG="${REST#*.}"
  c=$(code -H "Cookie: $COOKIE=$TOK" "$BASE/")
  [ "$c" = "200" ] && ok "手で組んだ本物のCookie -> 200(この検査が空振りでないことの確認)" || ng "本物のCookieが通らない -> $c(Cookie名が違う可能性)"
  for bad in "v1.$TS.AAAA" "v1.9999999999999.$SIG" "v2.$TS.$SIG" "garbage" "v1.$TS."; do
    c=$(code -H "Cookie: $COOKIE=$bad" "$BASE/")
    [ "$c" = "401" ] && ok "改ざんCookie($(printf '%.24s' "$bad")) -> 401" || ng "改ざんCookie($bad) -> $c"
  done
  unset EXP
fi

echo ""
if [ "$fails" -eq 0 ]; then echo "すべて期待どおり"; else echo "$fails 件が期待と違います"; fi
rm -f "$JAR"
exit "$fails"
