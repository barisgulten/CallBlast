# CallBlast — Mass Calling & Emergency Announcement System

🌐 **Language / Dil:** [Türkçe](./README.md) | **English**

A Dockerized mass notification and emergency voice-broadcasting system integrated with Cisco Unified Communications Manager (CUCM) over a SIP Trunk. Dialing a configured trigger extension on an IP phone — or launching a broadcast from the web admin panel — instructs Asterisk (via ARI) to originate simultaneous calls across target directory groups and play pre-converted audio messages.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Key Features](#key-features)
- [Requirements](#requirements)
- [CUCM Configuration](#cucm-configuration)
- [Quick Start](#quick-start)
- [Environment Variables (`.env`)](#environment-variables-env)
- [Default Credentials](#default-credentials)
- [Usage & Audio Formats](#usage--audio-formats)
- [Call Lifecycle & Timeout Handling](#call-lifecycle--timeout-handling)
- [REST API Summary](#rest-api-summary)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [License](#license)

---

## System Architecture

```text
CUCM ──SIP Trunk (5060 UDP/TCP)──► Asterisk (PJSIP + ARI / Stasis) ◄──► Node.js + Express + SQLite
                                           │                                    │
                                           ├─ Receives trigger call (e.g. 9999) ├─ FFmpeg audio transcoding
                                           ├─ Plays caller confirmation / chime ├─ Timeout & stale blast sweeper
                                           └─ Broadcasts audio to target phones └─ REST API (/api/*) ◄── Nginx + React UI (:8080)
```

| Service / Container | Stack | Exposed Ports | Role |
| :--- | :--- | :--- | :--- |
| `callblast-asterisk` | Alpine Linux + Asterisk (PJSIP & ARI) | `5060/udp`, `5060/tcp`, `127.0.0.1:8088/tcp`, `10000-10050/udp` | CUCM SIP Trunk connectivity, Stasis call app, and media playback |
| `callblast-server` | Node.js 20, Express, `ari-client`, `better-sqlite3`, FFmpeg | `127.0.0.1:3000/tcp` | ARI call orchestration, SQLite database (`/app/data/callblast.db`), FFmpeg conversion |
| `callblast-client` | React 18, Vite, Tailwind CSS 3, Nginx | `8080:80/tcp` | Admin web interface and `/api/` reverse proxy |

---

## Key Features

- **Multi-Trigger Management (`Triggers`):** Map distinct dialed CUCM extensions (e.g., `5551`, `5555`, `9999`) to dedicated recipient audio messages, optional caller confirmation prompts (or an auto-hanging short confirmation chime `beep_confirm`), and target directory groups.
- **Quick Web Blast (`Dashboard`):** Start broadcasts directly from the web UI by choosing an audio file and target group, with live summary stats and recent blast cards.
- **Directory, Contact Groups & Bulk CSV Import (`Directory`):** Manage contacts, group memberships (`Genel`, `Yönetim`, `Güvenlik`, `Teknik Ekip`, or custom groups), active/inactive toggles, and `;`- or `,`-delimited CSV file/paste import with instant preview.
- **Audio Library & In-Browser Playback (`Audio Files`):** Upload WAV, MP3, or OGG files (up to 50 MB); automatically transcode via FFmpeg into five Asterisk formats (`.wav`, `.ulaw`, `.alaw`, `.g722`, `.gsm`); preserve UTF-8 filenames; assign default audio; and preview recordings directly in the browser via JWT-authenticated Blob streaming (`/api/audio/:id/download`).
- **Call Logs & Per-Contact Telemetry (`Logs`):** Expandable call logs showing trigger source, audio played, answered/failed/in-progress counts, per-recipient duration and hangup cause, plus silent automatic refresh while blasts remain active.
- **Modern Accessible Web UI:**
  - **Dark Mode:** Light, Dark, and System theme support (`color-scheme`, zero-FOUC inline initialization).
  - **Multi-Language UI:** Full localization and locale-aware date/number formatting in **Turkish (`tr`)**, **English (`en`)**, and **German (`de`)**.
  - **Collapsible Sidebar:** Desktop sidebar minimizes cleanly to an icon rail (`localStorage`-persisted state, accessible tooltips, reduced-motion support) alongside a responsive mobile drawer.

---

## Requirements

- [Docker](https://docs.docker.com/get-docker/) (20.10+) and [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)
- Access to Cisco Unified Communications Manager (CUCM) administration
- A SIP Trunk routed to the CallBlast Asterisk host on port `5060`

---

## CUCM Configuration

### 1. Create the SIP Trunk

1. Sign in to CUCM Administration.
2. Navigate to **Device > Trunk**, click **Add New**, and choose **SIP Trunk**.
3. Configure the trunk settings:
   - **Device Name:** `CallBlast-Trunk`
   - **Destination Address:** IP address of the server running CallBlast (matching `HOST_IP` in `.env`)
   - **Destination Port:** `5060`
   - **SIP Trunk Security Profile:** `Non Secure SIP Trunk Profile`
   - **SIP Profile:** `Standard SIP Profile`
   - **DTMF Signaling Method:** `RFC 2833`
   - **Media Termination Point Required:** Unchecked (media flows through Asterisk for playback)

### 2. Create a Route Pattern

1. Go to **Call Routing > Route/Hunt > Route Pattern** and click **Add New**.
2. Configure the pattern:
   - **Route Pattern:** `9999` (or a wildcard like `555X` when using multiple triggers)
   - **Gateway/Route List:** Select `CallBlast-Trunk`
   - **Route Option:** `Route this pattern`

### 3. Region & Codec Settings

1. Under **System > Region**, verify **G.722** and **G.711 (ulaw / alaw)** are allowed between the phone and trunk regions.
2. Because the backend pre-generates `.g722` (16 kHz wideband) and `.ulaw` / `.alaw` / `.wav` (8 kHz) on upload, Asterisk plays audio natively without real-time transcoding overhead.

---

## Quick Start

### 1. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and update `CUCM_IP`, `HOST_IP`, `JWT_SECRET`, and credentials for your environment.

> **Note:** On container startup, `asterisk/entrypoint.sh` automatically injects `CUCM_IP` and `HOST_IP` from `.env` into `/etc/asterisk/pjsip.conf`. For advanced SIP adjustments, edit [asterisk/conf/pjsip.conf](./asterisk/conf/pjsip.conf).

### 2. Build and Start Services

```bash
docker compose up -d --build
```

### 3. Follow Logs

```bash
# All containers
docker compose logs -f

# Backend API & ARI service logs
docker compose logs -f server

# Asterisk SIP/Stasis logs
docker compose logs -f asterisk
```

### 4. Open the Admin Panel

Visit [http://localhost:8080](http://localhost:8080) (or `http://<HOST_IP>:8080` from another host on the network).

---

## Environment Variables (`.env`)

| Variable | Description | `.env.example` Default |
| :--- | :--- | :--- |
| `ARI_URL` | Asterisk ARI HTTP URL inside the Docker network | `http://asterisk:8088` |
| `ARI_USERNAME` | ARI username | `callblast` |
| `ARI_PASSWORD` | ARI password | `changeme123` |
| `CUCM_IP` | Cisco Call Manager IP address | `10.0.0.1` |
| `CUCM_PORT` | CUCM SIP Trunk port | `5060` |
| `TRIGGER_NUMBER` | Default dialed trigger extension | `9999` |
| `HOST_IP` | Docker host LAN IP advertised in SIP Contact & SDP toward CUCM | `192.168.1.100` |
| `JWT_SECRET` | Secret key used to sign admin JWT tokens (change in production) | `change-this-to-a-random-string` |
| `ADMIN_USERNAME` | Default web panel username | `admin` |
| `ADMIN_PASSWORD` | Default web panel password | `admin123` |
| `SERVER_PORT` | Backend Express listening port | `3000` |
| `RTP_START` | RTP media port range start | `10000` |
| `RTP_END` | RTP media port range end | `10050` |

---

## Default Credentials

| Component | Username | Password |
| :--- | :--- | :--- |
| Web Admin Panel | `admin` | `admin123` |
| Asterisk ARI | `callblast` | `changeme123` |

> **Security Warning:** Change the admin password in **Settings** (or `.env`), replace `JWT_SECRET`, and update `ARI_PASSWORD` in both `.env` and `asterisk/conf/ari.conf` before deploying to production.

---

## Usage & Audio Formats

1. Log in to the web panel and pick your preferred **Language** (TR / EN / DE) and **Theme** (Light / Dark) from the top bar or Settings.
2. Add or bulk-import recipients in **Directory** and organize them into groups.
3. Upload announcement recordings (`.wav`, `.mp3`, `.ogg`, up to 50 MB) in **Audio Files** and preview them directly in the browser.
4. On every upload, FFmpeg converts the recording into five Asterisk-native formats in the shared `audio-files` Docker volume:
   - `.wav` (16-bit PCM, 8000 Hz, mono)
   - `.ulaw` (raw G.711 μ-law, 8000 Hz, mono)
   - `.alaw` (raw G.711 A-law, 8000 Hz, mono)
   - `.g722` (raw G.722 wideband HD, 16000 Hz, mono)
   - `.gsm` (raw GSM, 8000 Hz, mono)
5. Map CUCM extensions in **Triggers**, then dial a trigger extension from a phone — or use Quick Blast on the **Dashboard**.

---

## Call Lifecycle & Timeout Handling

- **Configured Ring Timeout (`ring_timeout`):** The configurable ring timeout (default `30` seconds in **Settings**) is passed directly as `timeout` to `ARI originate`.
- **Unanswered & Busy Calls:** Because unanswered/rejected ARI calls emit `ChannelDestroyed` without entering Stasis (`StasisEnd`), the blaster listens to both `StasisEnd` and `ChannelDestroyed` and classifies individual call rows as `answered`, `no_answer`, `busy`, or `failed`.
- **Completed vs. Incomplete (`completed` / `incomplete`):**
  - When all targeted calls are answered and played, the blast finishes as **Completed** (`completed`).
  - If any calls go unanswered/fail, or a blast is interrupted by a timeout or container restart, a per-blast watchdog timer and the startup/periodic/on-read stale sweeper (`cleanupStaleBlasts`) close any lingering call records (`no_answer` / `timeout`) and transition the blast to **Incomplete** (`incomplete`).

---

## REST API Summary

All endpoints except `POST /api/auth/login` and `GET /api/health` require `Authorization: Bearer <token>`. The Nginx frontend proxies `/api/` to `server:3000`.

| Domain | Key Endpoints | Purpose |
| :--- | :--- | :--- |
| Auth | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password` | JWT authentication and admin password updates |
| Triggers | `GET /api/triggers`, `POST /api/triggers`, `PUT /api/triggers/:id`, `DELETE /api/triggers/:id` | CRUD for CUCM dialed extension triggers |
| Directory & Groups | `GET/POST /api/numbers`, `POST /api/numbers/import`, `GET/POST/DELETE /api/groups` | Contacts, group filtering, and bulk import |
| Audio | `GET /api/audio`, `POST /api/audio/upload`, `PUT /api/audio/:id/default`, `GET /api/audio/:id/download`, `DELETE /api/audio/:id` | Upload, FFmpeg transcoding, default selection, and authenticated streaming |
| Blast Control | `POST /api/blast/start` (alias `POST /api/blasts`), `GET /api/blast/:blastId/status`, `POST /api/blast/:blastId/stop` | Start, inspect, or stop active blasts |
| Logs & Stats | `GET /api/logs`, `GET /api/logs/:blastId`, `GET /api/logs/stats` (alias `/api/stats`) | Paginated blast history, per-call details, and totals |
| Settings & Health | `GET /api/settings`, `PUT /api/settings`, `GET /api/health` | SIP/call settings and Asterisk ARI health check |

---

## Troubleshooting

### No Audio or SIP Signaling Issues with CUCM

1. Confirm `HOST_IP` in `.env` matches the reachable LAN IP of the Docker host so Asterisk advertises the proper IP in SIP `Contact` and SDP payloads (`asterisk/conf/pjsip.conf` intentionally keeps `local_net = 127.0.0.0/8` for Docker NAT compatibility).
2. Inspect PJSIP endpoints and AOR qualification:
   ```bash
   docker exec callblast-asterisk asterisk -rx "pjsip show endpoints"
   docker exec callblast-asterisk asterisk -rx "pjsip show aors"
   ```

### ARI Connection Failures

```bash
docker exec callblast-asterisk asterisk -rx "ari show status"
curl http://localhost:3000/api/health
```

### Audio Upload or Playback Failures

1. Check generated sound files on the shared Asterisk volume:
   ```bash
   docker exec callblast-asterisk ls -la /var/spool/asterisk/sounds/callblast/
   ```
2. Verify the upload uses a supported extension (`.wav`, `.mp3`, `.ogg`, `.raw`, `.ulaw`, `.alaw`) within the **50 MB** limit enforced by both Nginx and Multer.

### Rebuilding Containers After Changes

```bash
docker compose up -d --build
```

---

## Project Structure

```text
CallBlast/
├── docker-compose.yml              # 3 services (asterisk, server, client) + shared named volumes
├── .env.example                    # Environment template
├── README.md                       # Turkish documentation
├── README.en.md                    # English documentation (this file)
├── asterisk/
│   ├── Dockerfile                  # Alpine 3.19 + Asterisk image
│   ├── entrypoint.sh               # Dynamic CUCM_IP & HOST_IP injection and permissions
│   └── conf/                       # ari.conf, asterisk.conf, extensions.conf, http.conf, pjsip.conf, rtp.conf...
├── server/
│   ├── Dockerfile                  # Node.js 20 Alpine + FFmpeg + SQLite native build deps
│   ├── entrypoint.sh               # Audio volume permission setup & server start
│   └── src/
│       ├── index.js                # Express app entrypoint and ARI startup
│       ├── config.js               # Environment configuration loader
│       ├── db/                     # SQLite database initialization (database.js) & schema.sql
│       ├── middleware/             # JWT authentication middleware (auth.js)
│       ├── routes/                 # auth, audio, blast, groups, logs, numbers, settings, triggers
│       ├── services/               # asterisk.js (ARI) & blaster.js (call & timeout orchestration)
│       └── utils/                  # Winston logger (logger.js)
└── client/
    ├── Dockerfile                  # Multi-stage Vite build + Nginx Alpine
    ├── nginx.conf                  # 50 MB upload limit, /api/ proxy, and SPA fallback
    └── src/
        ├── api/                    # HTTP JSON & Blob request helpers (client.js)
        ├── components/             # Layout, collapsible Sidebar, Modal, ConfirmDialog, StatusBadge, ThemeLanguageControls
        ├── context/                # AuthContext, ThemeContext (light/dark/system), LanguageContext (tr/en/de)
        ├── i18n/                   # 3-language dictionary (translations.js)
        └── pages/                  # Login, Dashboard, Triggers, Numbers, AudioFiles, Logs, Settings
```

---

## License

Developed for internal enterprise use.
