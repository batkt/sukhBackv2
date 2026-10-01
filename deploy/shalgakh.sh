#!/bin/bash
# VPS-ийн урсгалын төлөвийг НЭГ ФАЙЛД цуглуулна.
#
# Гэмтлийг олохын тулд өмнө нь MediaMTX-ийн journal, runOnDemand скриптийн
# лог, backend-ийн лог гурвыг гараар тулгадаг байсан. Энэ скрипт тэр гурвыг
# цагийн дарааллаар нэг файл болгоно — гаргасан файлыг шууд хуваалцаж болно.
#
#   bash shalgakh.sh [минут]      # үндсэн 15
set -u

MIN="${1:-15}"
# Хоёр дахь аргумент — publisher-ийн нууц үг. Заагаагүй бол тохиргооноос
# уншихыг оролдоно (форматаас хамаарч чадахгүй байж магадгүй).
NUUTS_ARG="${2:-}"
GARALT="/tmp/urgats-shalgalt-$(date +%Y%m%d-%H%M%S).txt"
exec > >(tee "$GARALT") 2>&1

echo "=============================================================="
echo " Урсгалын шалгалт — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo " Хугацаа: сүүлийн $MIN минут"
echo "=============================================================="

echo
echo "-- 1. MediaMTX үйлчилгээ ------------------------------------"
systemctl is-active mediamtx
systemctl show mediamtx -p ActiveEnterTimestamp --value

echo
echo "-- 2. Одоо нийтлэгдэж байгаа замууд ------------------------"
# Нууц үгийг тохиргооноос уншина — скрипт дотор хадгалахгүй.
NUUTS="$NUUTS_ARG"
if [ -z "$NUUTS" ]; then
  # `- user: publisher` мөрийн ДАРАА гарах эхний `pass:`.
  NUUTS=$(awk '/user:[[:space:]]*publisher/{f=1} f && /pass:/{print $2; exit}' /opt/mediamtx/mediamtx.yml 2>/dev/null)
fi
if [ -z "$NUUTS" ]; then
  # Нөөц: `action: publish` эрхтэй хэрэглэгчийн нууц үг.
  NUUTS=$(awk '/pass:/{p=$2} /action:[[:space:]]*publish/{print p; exit}' /opt/mediamtx/mediamtx.yml 2>/dev/null)
fi
NUUTS=$(printf '%s' "${NUUTS:-}" | tr -d '"'"'"'"')
if [ -n "${NUUTS:-}" ]; then
  cat > /tmp/urgats-tuluv.py <<'PYEOF'
import sys, json
try:
    d = json.load(sys.stdin)
except Exception as e:
    print('  API uншигдсангүй:', e)
    raise SystemExit
items = d.get('items', [])
print('  ниит зам: %d' % len(items))
print()
print('  %-50s %-6s %-12s %s' % ('zam', 'belen', 'suvag', 'uzegch'))
for p in sorted(items, key=lambda x: x.get('name', '')):
    tr = ','.join(p.get('tracks') or []) or '-'
    print('  %-50s %-6s %-12s %d' % (
        p.get('name', '')[:50], str(p.get('ready')), tr, len(p.get('readers') or [])))
PYEOF
  curl -s -u "publisher:$NUUTS" http://127.0.0.1:9997/v3/paths/list | python3 /tmp/urgats-tuluv.py
  rm -f /tmp/urgats-tuluv.py
else
  echo "  publisher-ийн нууц үг уншигдсангүй."
  echo "  Хоёр дахь аргументаар дамжуул:  bash deploy/shalgakh.sh $MIN 'НУУЦҮГ'"
  echo "  (нууц үг нь гаралтад бичигдэхгүй)"
fi

echo
echo "-- 3. Нийтлэл ба timeout-ын түүх ---------------------------"
journalctl -u mediamtx --since "$MIN min ago" --no-pager 2>/dev/null | grep -E 'is publishing|command started|timed out|not needed' | tail -80

echo
echo "-- 4. Алдаа, тасалдал, remux -------------------------------"
journalctl -u mediamtx --since "$MIN min ago" --no-pager 2>/dev/null | grep -iE 'error|reset by peer|too big|auth|refused' | tail -40

echo
echo "-- 5. runOnDemand скриптийн лог ----------------------------"
tail -40 /var/log/mediamtx-urgats.log 2>/dev/null || echo "  (лог файл алга)"

echo
echo "-- 6. Backend-ийн urgats мөрүүд ----------------------------"
MUR=$(pm2 logs devSukhBack --lines 400 --nostream 2>/dev/null | grep -i urgats | tail -25)
if [ -n "$MUR" ]; then echo "$MUR"; else echo "  (urgats мөр алга — backend тайван, эсвэл pm2 өөр хэрэглэгчийн дор)"; fi

echo
echo "=============================================================="
echo " Гаралт: $GARALT"
echo "=============================================================="
