# Түрээсийн зогсоолын интеграц (АмарСүх тал)

АмарСүх дээрх **"Зочин урих"** нь түрээсийн зогсоолын системд (tureesBack)
бүртгэгдэж, хаалган дээр ажилладаг. Бүрэн техникийн баримт бичиг
(урсгал, API, webhook, хязгаарлалт) нь **tureesBack** repo дээр:

> `tureesBack/docs/ZOCHIN-PARKING-INTEGRATION.md`

## Хаягууд

| Систем | Орчин | Base URL |
|---|---|---|
| АмарСүх (amarhome) | prod | `https://amarhome.mn/api` |
| Түрээс | prod | `https://turees.zevtabs.mn/api` |
| Түрээс | тест | `https://rently.zevtabs.mn/api` |

Түрээс рүү залгах бүх зам `<base>/v1/zochin/*`, түрээсээс ирэх webhook нь
`https://amarhome.mn/api/zochin/zogsool/webhook`.

## АмарСүх талын хураангуй

### Тохиргоо — `tokhirgoo/tureesKalituud.js`

Түлхүүр нь **кодон дотор**, байгууллага тус бүрээр. Env хувьсагч биш.

```javascript
const KALITUUD = {
  "68e4e2bff3ff09acb5705a93": {              // манай baiguullaga._id
    ner: "АмарСүх ХХК",
    tureesServer: "https://turees.zevtabs.mn/api",  // prod (тест: rently.zevtabs.mn/api)
    kalit: "<64 тэмдэгт>",                   // түрээс тал дээрхтэй ИЖИЛ
    webhookSecret: "<64 тэмдэгт>",           // түрээс тал дээрхтэй ИЖИЛ
    idevkhiteiEsekh: true,
  },
};
```

`tureesBack/tokhirgoo/zochinKalituud.js` дахь ижил байгууллагын `kalit` ба
`webhookSecret`-тэй **ЯГ ТААРАХ** ёстой.

Placeholder (`<...>`), 32 тэмдэгтээс багa, эсвэл `idevkhiteiEsekh: false` бол
тухайн байгууллагад интеграц **автоматаар унтарна** — зочин урих функц хэвийн
ажиллаж, түрээс рүү юу ч илгээхгүй.

Deploy хийхгүйгээр солих:

```
TUREES_KALIT_<baiguullagiinId>=<шинэ түлхүүр>
TUREES_WEBHOOK_SECRET_<baiguullagiinId>=<шинэ нууц>
TUREES_SERVER_<baiguullagiinId>=https://rently.zevtabs.mn/api   # тест рүү шилжүүлэх
```

Түлхүүр үүсгэх:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Шинэ файлууд

| Файл | Үүрэг |
|---|---|
| `tokhirgoo/tureesKalituud.js` | Байгууллага тус бүрийн түлхүүр (hardcoded map) |
| `services/tureesParkingService.js` | Түрээсийн `/v1/zochin/*` HTTP клиент |
| `services/zochinTureesSyncService.js` | Урилгыг түрээс рүү синк, эзний гэрээ шийдэх |
| `routes/zochinZogsoolRoute.js` | Webhook хүлээн авагч + харах endpoint |
| `models/zochinZogsooliinTuukh.js` | Түрээсээс ирсэн зочны зогсоолын хөдөлгөөн |

### Шинэ endpoint

| Endpoint | Эрх | Тайлбар |
|---|---|---|
| `POST /zochin/zogsool/webhook` | HMAC | Түрээсээс орох/гарах мэдэгдэл |
| `GET /zochin/zogsool/tuukh` | ажилтан / оршин суугч | Зочны зогсоолын хөдөлгөөн (оршин суугч зөвхөн өөрийнхийг) |
| `GET /zochin/zogsool/urilgiinTuluv/:urilgiinId` | ажилтан / оршин суугч | Урилгын одоогийн байдал (үнэгүй минут гэх мэт) |
| `GET /zochin/zogsool/tureesBaiguullaga` | зөвхөн ажилтан | Түрээсийн байгууллага→барилга→зогсоолын бүтэц (dropdown) |
| `GET /zochin/zogsool/barilgaMap` | зөвхөн ажилтан | Манай барилгууд түрээстэй хэрхэн холбогдсон (**уншина**) |

### Барилгыг түрээстэй холбох

Холбоос нь **түрээс тал дээрх түлхүүрийн тохиргоонд** байна
(`tureesBack/tokhirgoo/zochinKalituud.js` → `barilguud`). Тусдаа бааз, seed
скрипт, нэмэх endpoint **байхгүй** — түлхүүр өгөх нь холбоос үүсгэхтэй адил.

```
1. GET /zochin/zogsool/tureesBaiguullaga   -> түрээсийн org/barilga/zogsool ID-г олно
2. tureesBack/tokhirgoo/zochinKalituud.js дээр barilguud дотор нэмнэ
3. commit + push + pm2 reload tureesBack
4. GET /zochin/zogsool/barilgaMap          -> шалгана
```

`barilguud` дотор байхгүй барилгын зочин урих нь **өмнөх шигээ** — зөвхөн
АмарСүхийн өөрийн хаалга ажиллаж, түрээс рүү юу ч илгээхгүй. Холбогдоогүй
барилгад урилга илгээвэл түрээс тал **403** буцаана.

### Зочин урихад төлбөрийн сонголт нэмэгдсэн

`POST /ezenUrisanMashin` дээр:

```json
{ "urisanMashiniiDugaar": "1234УБА", "tulburiinTurul": "ezen" }
```

- `"zochin"` (default) — зочин зогсоол дээрээ төлнө
- `"ezen"` — уригсан оршин суугчийн нэхэмжлэхэд авлага бичигдэнэ

Хариунд `turees: { buurtgegdsen, tulburiinTurul, message }` нэмэгдэнэ — түрээс
дээр бүртгэгдсэн эсэхийг апп/вэб дээр харуулахад хэрэглэнэ.

### Засварласан

- `index.js` — `express.json({verify})` (webhook-ийн raw body), `zochinZogsoolRoute` mount
- `routes/zochinUrikhRoute.js` — түрээс рүү синк дуудалт нэмсэн; `zochinHadgalya`
  дотор урилгыг `ezenId` (схемд байхгүй) гэж бичдэг байсныг `ezemshigchiinId`
  болгож, `tusBurUneguiMinut`/`barilgiinId`-г бөглөх болгож **засав**
- `models/guilgeeAvlaguud.js` — `source` enum дээр `"zogsool"` нэмсэн

---

_Шинэчлэгдсэн: 2026-08-24_
