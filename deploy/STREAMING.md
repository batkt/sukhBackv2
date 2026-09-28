# Камерын урсгал — MediaMTX руу шилжих

## Юу өөрчлөгдөж байна

**Өмнө:** хөтөч бүр барилгын PC рүү ШУУД WebRTC (P2P) холбогдоно.

```
хөтөч ⇄ (хоёр NAT цоолох) ⇄ барилгын PC ⇄ RTSP ⇄ камер
```

Асуудал: TURN тохируулаагүй тул симметрик NAT-ын ард (гар утасны дата)
холболт **зарчмын хувьд үүсэхгүй**; үзэгч бүр камер руу тусдаа RTSP сесс
нээдэг тул камерын сессийн хязгаар дүүрдэг; доголдол бүрт бүрэн дахин барина.

**Одоо:** барилга камерыг нэг удаа нийтийн сервер рүү түлхэнэ, үзэгчид
тэндээс татна.

```
камер ─RTSP→ барилгын PC (ffmpeg) ─RTSP:8554→ VPS MediaMTX ─WHEP→ бүх үзэгч
```

| | P2P (өмнө) | WHEP (одоо) |
|---|---|---|
| ICE | хоёр NAT цоолох | нийтийн тогтмол IP — үргэлж бүтнэ |
| TURN | заавал | хэрэггүй |
| эхлэх хугацаа | 1.5–15s, давталттай | ~200ms |
| камер руу RTSP | үзэгч бүрт нэг | камер бүрт нэг |
| нэг үзэгч тасрахад | камер руу дахин холбоно | зөвхөн тэр үзэгч |

---

## 1. VPS — MediaMTX

Asset-ийн нэрэнд хувилбар ордог (`mediamtx_v1.x.y_linux_amd64.tar.gz`) тул
хаягийг GitHub API-гаас авна — ингэснээр хувилбар шинэчлэгдэх бүрт засах
шаардлагагүй:

```bash
cd /opt && curl -fsSL "$(curl -fsSL https://api.github.com/repos/bluenviron/mediamtx/releases/latest | grep -oE 'https://[^\"]+_linux_amd64\.tar\.gz' | head -1)" -o mediamtx.tar.gz
```

Задлахын өмнө файл үнэхээр архив мөн эсэхийг шалгана (404 хуудас татагдвал
`tar` нь "not in gzip format" гэж унана):

```bash
cd /opt && file mediamtx.tar.gz && tar xzf mediamtx.tar.gz && mkdir -p /etc/mediamtx && ./mediamtx --version
```

> `uname -m` нь `aarch64` бол дээрх командад `_linux_amd64` → `_linux_arm64v8`
> болгож солино.

`deploy/mediamtx.yml`-ийг серверт хуулаад **`SOLIH_NUUTS_UG`-ийг солино**:

```bash
scp deploy/mediamtx.yml root@amarhome.mn:/etc/mediamtx/mediamtx.yml
```

systemd:

```bash
printf '%s\n' '[Unit]' 'Description=MediaMTX' 'After=network.target' '' '[Service]' 'ExecStart=/opt/mediamtx /etc/mediamtx/mediamtx.yml' 'Restart=always' 'RestartSec=3' 'User=root' '' '[Install]' 'WantedBy=multi-user.target' > /etc/systemd/system/mediamtx.service
```

```bash
systemctl daemon-reload && systemctl enable --now mediamtx && systemctl status mediamtx --no-pager
```

### Гал хамгаалалт

```bash
ufw allow 8554/tcp comment 'MediaMTX publish (barilgaas)' && ufw allow 8189/udp comment 'MediaMTX WebRTC media'
```

`8888` ба `8889` нь **зөвхөн дотооддоо** — nginx дамжуулна, гаднаас нээхгүй.

### nginx (TLS)

`https://amarhome.mn` дээрх хуудас `http://...:8889` рүү хандаж **чадахгүй**
(mixed content). Тиймээс WHEP-ийг ижил домэйнээр гаргана:

```nginx
location /whep/ {
    proxy_pass http://127.0.0.1:8889/;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 300s;
}

location /hls/ {
    proxy_pass http://127.0.0.1:8888/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_buffering off;
}
```

```bash
nginx -t && systemctl reload nginx
```

> Зөвхөн **дохио солилцоо** nginx-ээр дамжина. Медиа нь `8189/udp` руу шууд
> ирдэг тул nginx урсгалын саад болохгүй.

---

## 2. Барилгын PC — publisher

`ffmpeg` шаардлагатай (нэг удаа):

```bash
winget install --id Gyan.FFmpeg -e
```

`config.toml`-д хэсэг нэмнэ:

```toml
[publish]
url = "rtsp://publisher:SOLIH_NUUTS_UG@103.236.194.99:8554"
# camera_rtsp_port = 554      # камерын RTSP порт өөр бол
# ffmpeg = "ffmpeg"           # PATH дээр байхгүй бол бүтэн зам
# skip_ips = ["192.168.1.151"]  # тухайн камерыг нийтлэхгүй бол
```

Камер өөр барилгад хамаарах бол тухайн бичлэгтээ нэмнэ (эс бөгөөс
`[server].barilgiinId` хэрэглэнэ):

```toml
[[cameras]]
ip = "192.168.1.110"
password = "admin123"
http_port = 443
gate = "entrance"
barilgiinId = "6a978709d2d69c94c9e97f29"
```

### Бүх барилгын камер — автомат

Worker нь асахдаа `/baiguullaga/:id`-ээс **бүх барилгын** `sohCameruud`-ийг
өөрөө татаж нийтэлдэг. `baiguullagiinId`-г токеноос уншдаг тул тохиргоонд
юу ч бичих шаардлагагүй.

RTSP хаягийг вэб талтай **яг ижил** дүрмээр бүтээнэ (`ip`/`port`/`username`/
`password`/`root`-ийн нөхөх дараалал, хуучин `Admin123` анхдагчийг хоосонд
тооцох) тул зам хоёр талд таарна. Вэб дээр унтраасан камерыг алгасна.

Логд барилгын нэрээр харагдана:

```
PUBLISH | 192-168-1-100-2 (Тайм Таур) → rtsp://***@…/6a9787…/192-168-1-100-2
PUBLISH | автомат хайлт дуусав: 4 барилга, 32 камер
```

> **Хязгаар:** хайлт нь зөвхөн АСААХ үед явагдана. Вэб дээр камер нэмсэн бол
> үйлчилгээг дахин асаана.

Хайлт бүтэхгүй бол (сүлжээ, токен) 5 удаа оролдоод бууж, config.toml-д
бичсэн `[[publish_extra]]` -ууд ажилласаар байна.

### Зөвхөн урсгал нийтлэх камерууд

Вэбийн `/camera` хуудсан дахь СӨХ-ийн ерөнхий хяналтын камерууд нь зогсоолын
ANPR камеруудаас **өөр**. Тэднийг `[[cameras]]`-д хийж БОЛОХГҮЙ — worker
дэмий SDK нэвтрэлт, дугаар сонсогч асааж камерыг ачаалуулна. Тусдаа
жагсаалтад бичнэ (автомат хайлтын НӨӨЦ — ихэвчлэн шаардлагагүй):

```toml
[[publish_extra]]
rtsp = "rtsp://admin:NUUTSUG@192.168.1.60:554/Streaming/Channels/102"

[[publish_extra]]
rtsp = "rtsp://admin:NUUTSUG@192.168.1.61:554/Streaming/Channels/102"
barilgiinId = "6a979aafd2d69c94c9e97f29"   # заагаагүй бол [server]-ийнх
```

Хаягийг вэбийн **Камерын тохиргоо** хэсгээс хуулна — IP, порт, нэвтрэх нэр,
`root` зам. Хоёр тал ижил RTSP хаягаас IP-г салгадаг тул зам автоматаар
таарна.

Дахин барьж, үйлчилгээгээ дахин асаана:

```bash
cargo build --release
```

Асаахад логт гарах ёстой мөр:

```
PUBLISH | 192.168.1.110 → rtsp://***@103.236.194.99:8554/6a9787.../192-168-1-110
PUBLISH | 192.168.1.110 эхэллээ (pid 1234)
```

`ffmpeg` нь `-c:v copy -an` — дахин кодчилохгүй тул CPU бараг тэг, substream
нэг камерт ~0.5–1 Mbps.

---

## 2b. Урсгалыг ҮЗЭГЧЭЭР удирдах (on-demand)

Хэмжилт: нэг обьектын 34 урсгал = **18 Mbps тасралтгүй**. Нэг NVR-ын 8
суваг дөрвөн барилгад бүртгэгдсэн тул дөрөв дахин давхардсан. Шугам дүүрч
саатал минутаар хуримтлагдаж байв. Гэтэл бодит үзэгч зэрэг 1-2 камер хардаг.

Тиймээс автомат олдсон камеруудыг **зөвхөн бүртгээд**, ffmpeg-ийг үзэгч
гарч ирэхэд асаана.

| урсгал | зан төлөв |
|---|---|
| `[[cameras]]` (хаалганы ANPR) | **байнга** — оператор тасралтгүй хардаг |
| `[[publish_extra]]` (гараар) | **байнга** — ил зааж бичсэн |
| автомат олдсон | **үзэгчээр** |

### Гинж

```
хөтөч/апп WHEP хүсэлт
  → MediaMTX: зам дээр нийтлэгч алга
  → runOnDemand: /opt/mediamtx-urgats.sh $MTX_PATH
  → POST 127.0.0.1:8084/camera/urgats/start
  → socket `gate-room-{barilgiinId}` → барилгын worker
  → ffmpeg асна (~1-3с) → MediaMTX уншигчид өгнө
```

Сүүлийн уншигч гарсны дараа `runOnDemandCloseAfter` (20с) хүлээгээд MediaMTX
скриптийг таслана — `trap` нь `stop` илгээж ffmpeg зогсоно.

### Суулгах

```bash
install -m 755 deploy/mediamtx-urgats.sh /opt/mediamtx-urgats.sh
```

```bash
scp deploy/mediamtx.yml root@amarhome.mn:/etc/mediamtx/mediamtx.yml && systemctl restart mediamtx
```

Backend-д `routes/urgatsRoute.js` нэмэгдсэн — `git pull && pm2 reload devSukhBack`.

> Тэр маршрут нь **зөвхөн loopback**-аас хүлээж авна. Гаднаас хандвал хэн ч
> дурын барилгын урсгалыг асааж шугам дүүргэх боломжтой болно. nginx-ээр
> гаргахгүй.

### Шалгах

```bash
journalctl -u mediamtx -f | grep -i "runOnDemand\|ready"
```

Хөтчөөс камер нээхэд backend-ийн логд `[Urgats] start → …` гарч, worker-ийн
логд `▶️ URGATS аса: …` болон `PUBLISH | … асаалаа` гарна. Хаахад 20 секундын
дараа `⏹️ URGATS зогсоо` гарна.

Нийт зурвасыг хэмжих:

```bash
A=$(curl -s http://127.0.0.1:9997/v3/paths/list | grep -o '"bytesReceived":[0-9]*' | cut -d: -f2 | paste -sd+ | bc); sleep 10; B=$(curl -s http://127.0.0.1:9997/v3/paths/list | grep -o '"bytesReceived":[0-9]*' | cut -d: -f2 | paste -sd+ | bc); echo "$(echo "scale=1; ($B-$A)*8/10/1000000" | bc) Mbps"
```

Хэн ч харахгүй үед зөвхөн хаалганы камерууд (~1 Mbps) үлдэх ёстой.

## 3. Баталгаажуулалт (плеерт хүрэхээс ӨМНӨ)

VPS дээр урсгал ирсэн эсэх:

```bash
curl -s http://127.0.0.1:9997/v3/paths/list | head -40
```

Хөтчөөс шууд үзэх (MediaMTX-ийн өөрийн хуудас):

```
https://amarhome.mn/whep/<barilgiinId>/<192-168-1-110>/
```

Энэ ажиллавал клиентүүдийг шилжүүлэх нь аюулгүй. Ажиллахгүй бол:

| шинж | шалтгаан |
|---|---|
| зам огт байхгүй | ffmpeg VPS хүртэл хүрэхгүй — 8554/tcp хаалттай эсвэл нууц үг буруу |
| зам байгаа ч зураг гарахгүй | 8189/udp хаалттай, эсвэл `webrtcAdditionalHosts` буруу |
| `401` | `authInternalUsers`-ийн нууц үг config.toml-тай таарахгүй |

---

## 4. Клиентүүд (дараагийн алхам)

Урсгал VPS дээр батлагдсаны дараа:

- **Вэб** — `WebRTCVideoPlayer`-ийн дотоодыг WHEP болгоно. ICE хүлээх бүх
  логик устана (сервер нийтийн тул candidate шууд бэлэн).
- **Апп** — `WebRTCPlayer` → аль хэдийн бичигдсэн `HlsPlayer` (WHEP клиент).

WHEP хаягийг хоёр тал ижил дүрмээр бодно:

```
https://amarhome.mn/whep/{barilgiinId}/{камерын-ip-цэгийг-зураасаар}/whep
```

Хаалганы socket bridge (`execute-open`) энэ шилжилтэд **огт хамаагүй** —
хэвээр ажиллана.
