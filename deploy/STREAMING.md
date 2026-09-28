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
