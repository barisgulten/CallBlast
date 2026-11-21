# CallBlast — Toplu Arama ve Acil Anons Sistemi

🌐 **Dil / Language:** **Türkçe** | [English](./README.en.md)

Cisco Unified Communications Manager (CUCM) ile SIP Trunk üzerinden entegre çalışan, web yönetim paneli veya IP telefonlardan yapılan tetikleme çağrılarıyla önceden tanımlı kişi gruplarına eş zamanlı sesli anons yapabilen Docker tabanlı toplu arama sistemi.

---

## İçindekiler

- [Sistem Mimarisi](#sistem-mimarisi)
- [Temel Özellikler](#temel-özellikler)
- [Gereksinimler](#gereksinimler)
- [CUCM Yapılandırması](#cucm-yapılandırması)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Ortam Değişkenleri (`.env`)](#ortam-değişkenleri-env)
- [Varsayılan Kimlik Bilgileri](#varsayılan-kimlik-bilgileri)
- [Kullanım ve Ses Formatları](#kullanım-ve-ses-formatları)
- [Çağrı Yaşam Döngüsü ve Zaman Aşımı Yönetimi](#çağrı-yaşam-döngüsü-ve-zaman-aşımı-yönetimi)
- [REST API Özeti](#rest-api-özeti)
- [Sorun Giderme](#sorun-giderme)
- [Proje Yapısı](#proje-yapısı)
- [Lisans](#lisans)

---

## Sistem Mimarisi

```text
CUCM ──SIP Trunk (5060 UDP/TCP)──► Asterisk (PJSIP + ARI / Stasis) ◄──► Node.js + Express + SQLite
                                           │                                    │
                                           ├─ Tetik dahili aranır (örn. 9999)    ├─ FFmpeg ses dönüştürme
                                           ├─ Onay anonsu / tonu çalınır        ├─ Arama zaman aşımı & temizlik
                                           └─ Hedef numaralara ses yayınlanır   └─ REST API (/api/*) ◄── Nginx + React UI (:8080)
```

| Servis / Container | Teknoloji | Varsayılan Portlar | Görevi |
| :--- | :--- | :--- | :--- |
| `callblast-asterisk` | Alpine Linux + Asterisk (PJSIP & ARI) | `5060/udp`, `5060/tcp`, `127.0.0.1:8088/tcp`, `10000-10050/udp` | CUCM SIP Trunk iletişimi, Stasis uygulaması ve ses oynatma |
| `callblast-server` | Node.js 20, Express, `ari-client`, `better-sqlite3`, FFmpeg | `127.0.0.1:3000/tcp` | ARI çağrı orkestrasyonu, SQLite veritabanı (`/app/data/callblast.db`), FFmpeg dönüştürme |
| `callblast-client` | React 18, Vite, Tailwind CSS 3, Nginx | `8080:80/tcp` | Yönetim arayüzü ve `/api/` ters vekil (reverse proxy) |

---

## Temel Özellikler

- **Çoklu Tetikleyici Yönetimi (`Triggers`):** CUCM üzerinden aranan farklı dahili numaraları (ör. `5551`, `5555`, `9999`) ayrı duyuru seslerine, arayan kişiye özel onay anonsuna (veya otomatik kapanan kısa onay tonuna `beep_confirm`) ve hedef kişi gruplarına eşleme.
- **Web Üzerinden Hızlı Yayın (`Dashboard`):** Ses kaydı ve hedef grup seçerek panelden anlık toplu arama başlatma; canlı istatistik kartları ve son arama özetleri.
- **Rehber, Grup Yönetimi ve Toplu CSV İçe Aktarım (`Directory`):** Kişileri gruplara ayırma, aktif/pasif yapma, grup ekleme/silme (`Genel`, `Yönetim`, `Güvenlik`, `Teknik Ekip` veya özel gruplar) ve `;` ya da `,` ayraçlı CSV dosyası/metin önizlemeli toplu yükleme.
- **Ses Dosyası Yönetimi ve Tarayıcı İçi Oynatma (`Audio Files`):** WAV, MP3, OGG (50 MB'a kadar) yükleme; sunucuda FFmpeg ile otomatik olarak 5 Asterisk formatına (`.wav`, `.ulaw`, `.alaw`, `.g722`, `.gsm`) dönüştürme; Türkçe/UTF-8 dosya adı desteği, varsayılan ses belirleme ve JWT korumalı akış (`/api/audio/:id/download`) üzerinden panelden ön dinleme.
- **Arama Logları ve Detaylı Takip (`Logs`):** Her toplu aramanın tetikleyen kaynağını, çalınan sesi, cevaplanan/başarısız/devam eden sayılarını ve kişi bazlı çağrı nedenlerini görüntüleme; aktif aramalar sırasında otomatik sessiz yenileme.
- **Modern ve Erişilebilir Arayüz:**
  - **Tema Desteği:** **Açık**, **Koyu** ve **Sistem** tercihi (`color-scheme`, FOUC önleyici başlangıç betiği).
  - **Çoklu Dil Desteği:** **Türkçe (`tr`)**, **English (`en`)** ve **Deutsch (`de`)** tam arayüz ve tarih/sayı biçimlendirme desteği.
  - **Daraltılabilir Sol Menü:** Masaüstü görünümde simge moduna küçültülüp genişletilebilen (`localStorage` kalıcı) ve mobil cihazlarda kayar çekmeceye dönüşen gezinme menüsü.

---

## Gereksinimler

- [Docker](https://docs.docker.com/get-docker/) (20.10+) ve [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)
- Cisco Unified Communications Manager (CUCM) yönetim erişimi
- Asterisk sunucu IP adresine (`5060` portu) yönlendirilmiş bir SIP Trunk

---

## CUCM Yapılandırması

### 1. SIP Trunk Oluşturma

1. CUCM Administration arayüzüne giriş yapın.
2. **Device > Trunk** menüsünden **Add New** ile **SIP Trunk** seçin.
3. Önerilen ayarları yapılandırın:
   - **Device Name:** `CallBlast-Trunk`
   - **Destination Address:** CallBlast barındıran sunucu IP adresi (ör. `.env` içindeki `HOST_IP`)
   - **Destination Port:** `5060`
   - **SIP Trunk Security Profile:** `Non Secure SIP Trunk Profile`
   - **SIP Profile:** `Standard SIP Profile`
   - **DTMF Signaling Method:** `RFC 2833`
   - **Media Termination Point Required:** İşaretlemeyin (medya doğrudan Asterisk üzerinden geçirilir)

### 2. Route Pattern Oluşturma

1. **Call Routing > Route/Hunt > Route Pattern** menüsüne gidin ve **Add New** seçin.
2. Örnek ayarlar:
   - **Route Pattern:** `9999` (veya çoklu tetikleyici için `555X` gibi kalıp)
   - **Gateway/Route List:** `CallBlast-Trunk`
   - **Route Option:** `Route this pattern`

### 3. Bölge ve Codec Ayarları

1. **System > Region** bölümünden ilgili bölgeler arasında **G.722** ve **G.711 (ulaw / alaw)** codec'lerinin açık olduğunu doğrulayın.
2. Ses dosyaları yüklenirken sunucu tarafından `.g722` (16 kHz wideband) ve `.ulaw` / `.alaw` / `.wav` (8 kHz) formatları otomatik üretildiği için transcoding yükü oluşmaz.

---

## Hızlı Başlangıç

### 1. Ortam Dosyasını Oluşturun

```bash
cp .env.example .env
```

`.env` içindeki `CUCM_IP`, `HOST_IP`, `JWT_SECRET` ve şifre alanlarını ortamınıza göre güncelleyin.

> **Not:** `asterisk/entrypoint.sh`, konteyner her başlatıldığında `.env` içindeki `CUCM_IP` ve `HOST_IP` değerlerini `pjsip.conf` dosyasına otomatik uygular. İleri düzey SIP özelleştirmeleri için [asterisk/conf/pjsip.conf](./asterisk/conf/pjsip.conf) dosyasını doğrudan düzenleyebilirsiniz.

### 2. Servisleri Derleyin ve Başlatın

```bash
docker compose up -d --build
```

### 3. Logları İzleyin

```bash
# Tüm servisler
docker compose logs -f

# Sadece Node.js sunucu logları
docker compose logs -f server

# Sadece Asterisk logları
docker compose logs -f asterisk
```

### 4. Web Paneline Erişin

Tarayıcınızda [http://localhost:8080](http://localhost:8080) (veya ağ üzerinden `http://<HOST_IP>:8080`) adresini açın.

---

## Ortam Değişkenleri (`.env`)

| Değişken | Açıklama | `.env.example` Varsayılanı |
| :--- | :--- | :--- |
| `ARI_URL` | Asterisk ARI HTTP adresi (Docker ağında) | `http://asterisk:8088` |
| `ARI_USERNAME` | ARI kullanıcı adı | `callblast` |
| `ARI_PASSWORD` | ARI parolası | `changeme123` |
| `CUCM_IP` | Cisco Call Manager IP adresi | `10.0.0.1` |
| `CUCM_PORT` | CUCM SIP Trunk portu | `5060` |
| `TRIGGER_NUMBER` | Varsayılan tetikleme numarası | `9999` |
| `HOST_IP` | Docker ana makinesinin CUCM'den erişilen IP adresi (SDP & SIP Contact) | `192.168.1.100` |
| `JWT_SECRET` | Web oturum imzalama anahtarı (üretimde mutlaka değiştirin) | `change-this-to-a-random-string` |
| `ADMIN_USERNAME` | Varsayılan yönetici kullanıcı adı | `admin` |
| `ADMIN_PASSWORD` | Varsayılan yönetici parolası | `admin123` |
| `SERVER_PORT` | Backend API portu | `3000` |
| `RTP_START` | RTP medya başlangıç portu | `10000` |
| `RTP_END` | RTP medya bitiş portu | `10050` |

---

## Varsayılan Kimlik Bilgileri

| Bileşen | Kullanıcı Adı | Parola |
| :--- | :--- | :--- |
| Web Yönetim Paneli | `admin` | `admin123` |
| Asterisk ARI | `callblast` | `changeme123` |

> **Güvenlik Uyarısı:** Üretim ortamına geçerken yönetici parolasını **Ayarlar** sayfasından veya `.env` dosyasından, `JWT_SECRET` ve `ARI_PASSWORD` değerlerini ise `.env` ile `asterisk/conf/ari.conf` üzerinden değiştirin.

---

## Kullanım ve Ses Formatları

1. Web paneline giriş yapın ve sağ üstten dilediğiniz **Dil** (TR / EN / DE) ve **Tema** (Açık / Koyu) seçeneğini belirleyin.
2. **Rehber** sayfasından kişileri ekleyin, gruplayın veya CSV ile toplu aktarın.
3. **Ses Dosyaları** sayfasından WAV, MP3 veya OGG formatında anonsunuzu yükleyin (maksimum 50 MB). Yüklenen dosya oynatıcıyla panel içinden doğrudan dinlenebilir.
4. Sunucu her yüklenen dosyadan Asterisk paylaşımlı birimine (`audio-files`) aşağıdaki 5 formatı otomatik üretir:
   - `.wav` (16-bit PCM, 8000 Hz, mono)
   - `.ulaw` (G.711 μ-law, 8000 Hz, mono)
   - `.alaw` (G.711 A-law, 8000 Hz, mono)
   - `.g722` (Wideband HD, 16000 Hz, mono)
   - `.gsm` (GSM, 8000 Hz, mono)
5. **Tetikleyiciler** sayfasından CUCM dahili numaralarını ilgili ses ve hedef gruplara atayın; ardından IP telefondan tetik numarayı arayın veya **Dashboard** üzerinden anlık başlatın.

---

## Çağrı Yaşam Döngüsü ve Zaman Aşımı Yönetimi

- **Çalma Zaman Aşımı (`ring_timeout`):** Ayarlar sayfasında yapılandırılan süre (varsayılan `30` saniye), doğrudan `ARI originate` çağrısına `timeout` olarak aktarılır.
- **Cevapsız ve Meşgul Çağrılar:** Asterisk ARI üzerinde cevaplanmadan kapanan çağrılar `StasisEnd` üretmediğinden sistem hem `StasisEnd` hem de `ChannelDestroyed` olaylarını dinler; çağrı nedenini `no_answer`, `busy` veya `failed` olarak işler.
- **Tamamlandı vs. Tamamlanmadı (`completed` / `incomplete`):**
  - Hedeflenen tüm numaralar cevaplanıp anons dinletildiyse işlem **`Tamamlandı`** (`completed`) olarak işaretlenir.
  - Cevapsız/başarısız çağrılar varsa veya sunucu kesintisi/zaman aşımı nedeniyle çağrılar açık kaldıysa arka plan watchdog ve başlatma/sorgulama süpürücüsü (`cleanupStaleBlasts`) açık çağrıları `no_answer` (`timeout`) durumuna çekip toplu aramayı **`Tamamlanmadı`** (`incomplete`) olarak kapatır.

---

## REST API Özeti

`/api/auth/login` ve `/api/health` dışındaki tüm uç noktalar `Authorization: Bearer <token>` başlığı gerektirir (`client` Nginx konteyneri `/api/` isteklerini `server:3000`'e yönlendirir).

| Alan | Başlıca Uç Noktalar | Açıklama |
| :--- | :--- | :--- |
| Kimlik Doğrulama | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password` | JWT oturum açma ve yönetici şifresi değiştirme |
| Tetikleyiciler | `GET /api/triggers`, `POST /api/triggers`, `PUT /api/triggers/:id`, `DELETE /api/triggers/:id` | CUCM dahili tetikleyici CRUD yönetimi |
| Rehber & Gruplar | `GET/POST /api/numbers`, `POST /api/numbers/import`, `GET/POST/DELETE /api/groups` | Kişi yönetimi, toplu JSON/CSV içe aktarım ve gruplar |
| Ses Dosyaları | `GET /api/audio`, `POST /api/audio/upload`, `PUT /api/audio/:id/default`, `GET /api/audio/:id/download`, `DELETE /api/audio/:id` | Yükleme, FFmpeg dönüştürme ve kimlik doğrulamalı ses akışı |
| Toplu Arama | `POST /api/blast/start` (takma ad: `POST /api/blasts`), `GET /api/blast/:blastId/status`, `POST /api/blast/:blastId/stop` | Web yayını başlatma, durum sorgulama ve durdurma |
| Loglar & İstatistik | `GET /api/logs`, `GET /api/logs/:blastId`, `GET /api/logs/stats` (takma ad: `/api/stats`) | Sayfalı geçmiş, çağrı detayları ve genel istatistikler |
| Ayarlar & Sağlık | `GET /api/settings`, `PUT /api/settings`, `GET /api/health` | CUCM/çağrı ayarları ve ARI bağlantı durumu |

---

## Sorun Giderme

### Asterisk ile CUCM Arasında SIP veya Ses Sorunu Yaşanıyor

1. Docker üzerinde çalışan Windows ortamlarında SIP Contact ve SDP adreslerinin doğru duyurulması için `.env` içindeki `HOST_IP` değerinin makinenin gerçek LAN IP'si olduğunu doğrulayın (`asterisk/conf/pjsip.conf` içindeki `local_net = 127.0.0.0/8` kuralı Docker NAT ağında dış IP'nin reklam edilmesini sağlar).
2. Endpoint ve AOR durumunu kontrol edin:
   ```bash
   docker exec callblast-asterisk asterisk -rx "pjsip show endpoints"
   docker exec callblast-asterisk asterisk -rx "pjsip show aors"
   ```

### ARI Bağlantı Hatası

```bash
docker exec callblast-asterisk asterisk -rx "ari show status"
curl http://localhost:3000/api/health
```

### Ses Dosyası Çalmıyor veya Yüklenmiyor

1. Oluşturulan ses dosyalarını kontrol edin:
   ```bash
   docker exec callblast-asterisk ls -la /var/spool/asterisk/sounds/callblast/
   ```
2. Desteklenen formatlar: `.wav`, `.mp3`, `.ogg`, `.raw`, `.ulaw`, `.alaw` (Nginx ve sunucu yükleme limiti **50 MB**).

### Değişiklik Sonrası Konteynerleri Yeniden Derleme

```bash
docker compose up -d --build
```

---

## Proje Yapısı

```text
CallBlast/
├── docker-compose.yml              # 3 servis (asterisk, server, client) + paylaşımlı volume tanımları
├── .env.example                    # Ortam değişkenleri şablonu
├── README.md                       # Türkçe dokümantasyon (bu dosya)
├── README.en.md                    # İngilizce dokümantasyon
├── asterisk/
│   ├── Dockerfile                  # Alpine 3.19 + Asterisk imajı
│   ├── entrypoint.sh               # CUCM_IP & HOST_IP enjeksiyonu ve izin ayarları
│   └── conf/                       # ari.conf, asterisk.conf, extensions.conf, http.conf, pjsip.conf, rtp.conf...
├── server/
│   ├── Dockerfile                  # Node.js 20 Alpine + FFmpeg + SQLite derleme araçları
│   ├── entrypoint.sh               # Ses dizini izin düzenleme ve sunucu başlatma
│   └── src/
│       ├── index.js                # Express giriş noktası ve ARI bağlantısı
│       ├── config.js               # Ortam yapılandırması
│       ├── db/                     # SQLite bağlantısı (database.js) ve şema (schema.sql)
│       ├── middleware/             # JWT doğrulama (auth.js)
│       ├── routes/                 # auth, audio, blast, groups, logs, numbers, settings, triggers
│       ├── services/               # asterisk.js (ARI) ve blaster.js (çağrı & zaman aşımı orkestrasyonu)
│       └── utils/                  # Winston loglama (logger.js)
└── client/
    ├── Dockerfile                  # Multi-stage Vite build + Nginx Alpine
    ├── nginx.conf                  # 50 MB upload limiti, /api/ proxy ve SPA yönlendirme
    └── src/
        ├── api/                    # İstemci HTTP / Blob yardımcıları (client.js)
        ├── components/             # Layout, daraltılabilir Sidebar, Modal, ConfirmDialog, StatusBadge, ThemeLanguageControls
        ├── context/                # AuthContext, ThemeContext (light/dark/system), LanguageContext (tr/en/de)
        ├── i18n/                   # 3 dilli çeviri sözlüğü (translations.js)
        └── pages/                  # Login, Dashboard, Triggers, Numbers, AudioFiles, Logs, Settings
```

---

## Lisans

Bu proje kurumsal / dahili kullanım için geliştirilmiştir.
