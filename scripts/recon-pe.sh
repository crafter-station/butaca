#!/usr/bin/env bash
# Recon de Cineplanet Peru, para correr DESDE UNA CONEXION PERUANA.
#
# Su CDN (Azure Front Door) responde 403 a todo pedido desde Argentina, con curl
# y con navegador. Este script junta lo minimo para escribir el adapter sin
# adivinar nada.
#
# Uso:
#   bash recon-pe.sh
#
# Deja un archivo recon-cineplanet.txt en el directorio actual. Ese archivo es
# lo unico que hay que mandar de vuelta.
#
# NO pide login, NO manda datos a ningun lado, NO toca nada de la maquina.
# Solo lee paginas publicas, igual que abrir el sitio en el navegador.

set -uo pipefail
OUT="recon-cineplanet.txt"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

exec > >(tee "$OUT") 2>&1

echo "=== recon cineplanet ==="
echo "fecha: $(date -u '+%Y-%m-%dT%H:%MZ')"
echo

echo "--- 0. desde que pais sale este pedido ---"
# Solo pais y ciudad: el archivo se comparte, y la IP y el hostname del ISP no
# hacen falta para nada de este recon.
curl -s --max-time 15 "https://ipinfo.io/json" \
  | grep -oE '"(country|city|timezone)": *"[^"]*"' | head -3
echo

echo "--- 1. responde el sitio? ---"
for u in \
  "https://www.cineplanet.com.pe" \
  "https://cineplanet.com.pe" \
  "https://api.cineplanet.com.pe" \
  "https://bff.cineplanet.com.pe"
do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -L -H "User-Agent: $UA" "$u")
  echo "$code  $u"
done
echo

echo "--- 2. stack del sitio ---"
curl -s --max-time 25 -L -H "User-Agent: $UA" "https://www.cineplanet.com.pe" -o /tmp/cp.html \
  -D /tmp/cp-headers.txt
echo "bytes: $(wc -c < /tmp/cp.html 2>/dev/null || echo 0)"
grep -iE "^(server|x-powered-by|x-vercel|x-nextjs|x-azure-ref|cf-ray)" /tmp/cp-headers.txt 2>/dev/null | head -6
echo "pistas de framework:"
grep -oiE "_next/static|__NEXT_DATA__|nuxt|angular|vue|__NUXT__" /tmp/cp.html 2>/dev/null | sort -u | head
echo

echo "--- 3. hosts de API que menciona el html ---"
grep -oE "https://[a-zA-Z0-9._-]+\.(com|pe|net|io)[a-zA-Z0-9/._-]*" /tmp/cp.html 2>/dev/null \
  | grep -viE "google|facebook|doubleclick|gstatic|youtube|hotjar|clarity|tiktok|cloudflare" \
  | sort -u | head -25
echo

echo "--- 4. endpoints candidatos ---"
for p in \
  "/api/cinemas" \
  "/api/movies" \
  "/api/showtimes" \
  "/_next/data" \
  "/sitemap.xml" \
  "/robots.txt"
do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -H "User-Agent: $UA" "https://www.cineplanet.com.pe$p")
  echo "$code  $p"
done
echo

echo "--- 5. robots.txt (que permite el sitio) ---"
curl -s --max-time 15 -H "User-Agent: $UA" "https://www.cineplanet.com.pe/robots.txt" | head -30
echo

echo "=== fin ==="
echo "Mandale el archivo $OUT a Railly."
