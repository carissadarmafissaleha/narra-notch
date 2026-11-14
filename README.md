<h1 align="center">narra-notch</h1>

<p align="center">
  <b>A refined Dynamic-Island-style notch bar for Windows 10 &amp; 11.</b><br />
  <sub><i>Dynamic Island elegan dan ringan untuk desktop Windows 10 &amp; 11 (Bilingual: English &amp; Bahasa Indonesia).</i></sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v2.2.2-111?style=flat-square" alt="Version 2.2.2" />
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-111?style=flat-square" alt="Windows 10 and 11" />
  <img src="https://img.shields.io/badge/iOS-IPA-111?style=flat-square" alt="iOS Sideload IPA" />
  <img src="https://img.shields.io/badge/Android-APK-111?style=flat-square" alt="Android APK" />
  <img src="https://img.shields.io/badge/license-GPL--3.0-111?style=flat-square" alt="GPL-3.0" />
  <img src="https://img.shields.io/badge/theme-Monochrome%20%7C%20Color-111?style=flat-square" alt="Themes" />
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20ID-111?style=flat-square" alt="Bilingual English & Indonesian" />
</p>

<p align="center">
  <a href="https://github.com/carissadarmafissaleha/narra-notch/releases/latest"><b>Download Installer</b></a>
  &nbsp;·&nbsp;
  <a href="#installation--windows-security"><b>Install &amp; Smart App Control</b></a>
  &nbsp;·&nbsp;
  <a href="#showcase--gallery"><b>Gallery</b></a>
  &nbsp;·&nbsp;
  <a href="#key-features"><b>Features / Fitur</b></a>
  &nbsp;·&nbsp;
  <a href="#quick-start--controls"><b>Quick Start</b></a>
  &nbsp;·&nbsp;
  <a href="#development"><b>Development</b></a>
  &nbsp;·&nbsp;
  <a href="#credits--license"><b>Credits</b></a>
</p>

<p align="center">
  <img src="docs/media/04-overview.png" alt="narra-notch Overview Dashboard" width="900" />
</p>

---

**English:** A native, lightweight Dynamic Island sitting discreetly at the top of your Windows desktop. It stays out of your way until you need it, expanding seamlessly on hover, click, or hotkey (**Ctrl + Alt + Space**). Crafted with **custom themes** (pure black Monochrome and Color theme with adaptive accent hues), crisp Phosphor vector icons, and full **bilingual localization** (English &amp; Bahasa Indonesia).

**Bahasa Indonesia:** Dynamic Island ringan dan native yang terpasang rapi di bagian atas layar Windows. Tetap tersembunyi saat tidak dibutuhkan, lalu mengembang mulus ketika disentuh kursor, diklik, atau dengan shortcut (**Ctrl + Alt + Space**). Hadir dengan **tema kustom** (Monochrome hitam pekat &amp; tema Color dengan aksen warna adaptif), ikon vektor Phosphor yang tajam, serta antarmuka **dwibahasa** (Inggris &amp; Indonesia).

---

## 📦 Installation & Windows Security

> Read this before installing or updating on Windows 10 &amp; 11.<br />
> *Baca panduan ini sebelum memasang atau memperbarui aplikasi di Windows 10 &amp; 11.*

### ⬇️ Download Links / Unduhan

- **Windows 10 / 11 Installer**: Download `narra-notch_2.2.2_x64-setup.exe` from [GitHub Releases](https://github.com/carissadarmafissaleha/narra-notch/releases/latest) (no admin rights required).
- **Android Companion**: Download `narra-notch_2.2.2_android.apk` from [GitHub Releases](https://github.com/carissadarmafissaleha/narra-notch/releases/latest).
- **iOS Companion**: Sideload `narra-notch_2.2.2_ios.ipa` via AltStore / SideStore / Scarlet / TrollStore.

---

### 🛡️ Why Does Windows SmartScreen or Smart App Control Warn / Block?
### *Kenapa Muncul Peringatan Windows SmartScreen atau Smart App Control?*

| English | Bahasa Indonesia |
| --- | --- |
| **Why it happens:** `narra-notch` is a free, open-source app distributed without a commercial EV/OV **Authenticode Code Signing Certificate** (which requires expensive annual verification). Every binary is compiled transparently from public source via [GitHub Actions](.github/workflows/release.yml) — it is **not** malware. | **Penyebabnya:** `narra-notch` adalah proyek open-source gratis yang belum memakai **sertifikat digital berbayar (Authenticode EV/OV Code Signing)**. Setiap file `.exe` di-build langsung secara terbuka oleh [GitHub Actions](.github/workflows/release.yml) — bukan virus atau malware. |
| **Why newer releases can be stricter:** Freshly compiled binaries have zero download reputation on Microsoft's cloud graph yet, so newly pushed versions (`v2.2.1+`) may be flagged more strictly than older builds that had fewer Windows reputation checks, or block the **in-app auto-updater**. | **Kenapa versi baru bisa lebih ketat diblokir:** Setiap build `.exe` baru dianggap file asing oleh cloud Microsoft karena reputasi unduhannya masih nol. Itu sebabnya installer versi baru atau proses **klik Update langsung di dalam aplikasi** bisa diblokir oleh Windows. |

#### Case 1: Windows Defender SmartScreen (*"Windows protected your PC"*)
- **English**: Click **More info** → click **Run anyway** to start the installer.
- **Bahasa Indonesia**: Klik **Info selengkapnya (More info)** → klik **Tetap jalankan (Run anyway)** untuk melanjutkan instalasi.

#### Case 2: Windows 11 Smart App Control (*"Smart App Control blocked an app that may be unsafe"*)
When Windows 11 **Smart App Control** is active (**On** instead of *Evaluation* or *Off*), Windows blocks **all unsigned `.exe` installers**, including both manual setups and in-app updates (**Settings → General → Updates**).

- **Option A — Build From Source (Recommended if Smart App Control is On)**
  - **EN**: Keep Windows Smart App Control enabled and compile locally on your PC: run `npm install` then `npx tauri build` (see [Development](#development)).
  - **ID**: Agar Smart App Control tetap aktif aman, lakukan build lokal langsung dari source code: jalankan `npm install` lalu `npx tauri build` (lihat bagian [Development](#development)).
- **Option B — Manual Update When In-App Update Is Blocked**
  - **EN**: If clicking **Update** inside the app is blocked or fails to launch, download the latest `*_x64-setup.exe` directly from [Releases](https://github.com/carissadarmafissaleha/narra-notch/releases/latest), right-click the file → **Properties** → check **Unblock** (if shown) → **Apply**, then run it.
  - **ID**: Jika tombol **Update** di dalam aplikasi tidak merespons atau diblokir, unduh installer `*_x64-setup.exe` langsung dari halaman [Releases](https://github.com/carissadarmafissaleha/narra-notch/releases/latest), klik kanan file → **Properties** → centang **Unblock** (bila muncul) → **OK**, lalu jalankan.
- **Option C — About Turning Off Smart App Control**
  - **EN**: You can inspect its mode in **Windows Security → App &amp; browser control → Smart App Control**. Please note Microsoft's rule: once switched to **Off**, Smart App Control **cannot be turned back on** without resetting/reinstalling Windows. Choose Option A (build from source) if you want to keep it enabled.
  - **ID**: Statusnya bisa dicek di **Windows Security → App &amp; browser control → Smart App Control**. Perlu dicatat aturan Windows 11: jika Smart App Control diubah menjadi **Off**, fitur ini **tidak dapat diaktifkan kembali** tanpa reset/instal ulang Windows. Pilih **Opsi A (Build dari Source)** bila ingin tetap mengaktifkannya.

---

## Showcase & Gallery

### 🏝️ Dynamic Island States (Closed Notch / Tampilan Notch Tertutup)

<table align="center">
  <tr>
    <td align="center"><b>Idle State</b></td>
    <td align="center"><b>Media Playing</b></td>
    <td align="center"><b>Live Synced Lyrics</b></td>
    <td align="center"><b>Agent Working (AGY Braille)</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/01-closed-idle.png" alt="Closed Idle Notch" width="210" /></td>
    <td><img src="docs/media/02-closed-media.png" alt="Closed Media Notch" width="210" /></td>
    <td><img src="docs/media/03-closed-lyrics.png" alt="Closed Lyrics Notch" width="210" /></td>
    <td><img src="docs/media/31-closed-agent-working.png" alt="Closed Coding Agent Working Notch" width="210" /></td>
  </tr>
</table>

---

## Key Features / Fitur Utama

### 🤖 Coding Agent Companion (Mochi, Antigravity &amp; OpenCode)

**English:** Seamless companion for Google DeepMind's Antigravity (`agy`), OpenCode, and AI coding agents:
- **OpenCode Integration &amp; Inside the Notch**: Install the OpenCode plugin in one click from Settings. A dedicated **OpenCode** tab mirrors the active session (prompts, collapsible reasoning, tool calls, **Allow / Always / Deny** decisions), lets you start a **new session**, switch **agent** (Build, Plan, …) or **model**, reply, and stop turns — with the OpenCode password staying safely on the PC.
- **Antigravity &amp; OpenCode UI Parity (`v2.2.2`)**: Unified chat layout across both Antigravity and OpenCode tabs with live **Model** and **Effort** selectors detected directly from the desktop runtime (`/api/models`).
- **Approvals Without Editing Config**: Adds session-scoped `ask` rules for shell commands and file edits without touching `opencode.json`.
- **Authentic AGY CLI Braille Indicator**: Rotating Braille dots spinner (`⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏`) during active tasks.
- **Coucou Mascot &amp; Rich Gestures (`BotEngine`)**: Auto greeting wave, interactive touch/swipe emotes (love, proud, wink, 360° roll, bounce), debounced chimes, and synchronized wardrobe outfits persisting across desktop &amp; mobile restarts.
- **Interactive Tool Approval &amp; Live Diff**: Automatic approval popup even when Antigravity is minimized with instant **`Y`** (Allow), **`N`** (Deny), and **`A`** (Always) shortcuts, plus syntax-colored Git diff inspection.

**Bahasa Indonesia:** Pendamping terpadu untuk Google DeepMind Antigravity (`agy`), OpenCode, dan agent coding AI:
- **Integrasi OpenCode di Dalam Notch**: Pasang hooks OpenCode sekali klik dari Pengaturan. Tab **OpenCode** menampilkan transkrip sesi secara live (prompt, reasoning lipat, pemanggilan tool, serta konfirmasi **Allow / Always / Deny**), buat **sesi baru**, ganti **agent** / **model**, balas chat, dan hentikan agent tanpa meninggalkan notch. Password OpenCode tetap aman di PC.
- **Keselarasan Chat Antigravity &amp; OpenCode (`v2.2.2`)**: Antarmuka chat Antigravity kini seragam dengan OpenCode lengkap dengan pemilih **Model** dan **Effort** sesuai model aktif yang terdeteksi (`/api/models`).
- **Approval Tanpa Ubah Config**: Menambahkan aturan `ask` khusus sesi untuk perintah shell &amp; edit file tanpa mengubah `opencode.json`.
- **Indikator Braille AGY CLI**: Spinner Braille berputar (`⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏`) saat agent bekerja aktif.
- **Maskot Mochi &amp; Gestur Interaktif**: Sapaan otomatis saat dimuat, sentuh/swipe untuk emote, lompat &amp; salto 360°, suara halus tanpa spam, serta kostum Wardrobe yang tersinkronisasi antara desktop dan HP.
- **Review Perintah &amp; Live Diff**: Popup persetujuan otomatis lengkap dengan shortcut **`Y`** (Allow), **`N`** (Deny), **`A`** (Always) dan inspeksi Git Diff berwarna.

<table align="center">
  <tr>
    <td align="center"><b>Mascot Overview (Idle)</b></td>
    <td align="center"><b>Active Task &amp; Braille Spinner</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/08-coding-agent-idle.png" alt="Coding Agent Mascot Idle View" width="420" /></td>
    <td><img src="docs/media/29-coding-agent-working.png" alt="Coding Agent Active Task View" width="420" /></td>
  </tr>
  <tr>
    <td align="center"><b>Interactive Command Approval</b></td>
    <td align="center"><b>Live Code Diff View</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/09-coding-agent-approval.png" alt="Coding Agent Approval Review Dialog" width="420" /></td>
    <td><img src="docs/media/10-coding-agent-diff.png" alt="Coding Agent Live Git Diff" width="420" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><b>Mochi Mascot Wardrobe</b></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/media/30-coding-agent-wardrobe.png" alt="Coding Agent Wardrobe Selection" width="600" /></td>
  </tr>
</table>

---

### 📱 Mobile Companion (`CodingAgent` for iOS, Android &amp; PWA)

**English:** Control your desktop coding agent remotely from your iPhone or Android phone over local Wi-Fi:
- **Liquid Glass UI (`glisse`)**: Upgraded in `v2.2.2` with Apple-style Liquid Glass `TabBar` (spring lens refraction), `SegmentedControl`, `Switch` toggles, and glass header buttons.
- **Dynamic Mascot-Synced Inner Gradient**: Clean borderless sheet with a subtle top inner gradient that shifts live with Mochi's state color (idle, working, approval amber, finished green), plus compact `Connected` pill beside the header and **About** info inside Settings.
- **Strict 8-Character Pairing Gate &amp; Instant Sync**: Pairing code protects chat, history, file upload, and `/api/models` endpoints cleanly; launching or resuming the mobile app automatically resyncs state from PC.
- **Remote Approvals, Diffs, OpenCode &amp; Wardrobe**: Approve/deny tool calls from notifications or UI, attach files in chat, and switch Mochi outfits from a compact Settings dropdown.

**Bahasa Indonesia:** Kendalikan coding agent PC dari jarak jauh lewat iPhone atau Android melalui Wi-Fi lokal:
- **Desain Liquid Glass (`glisse`)**: Diperbarui di `v2.2.2` menggunakan `TabBar` Liquid Glass ala iOS dengan animasi *spring* &amp; lensa geser, `SegmentedControl` tema, `Switch`, dan tombol kaca.
- **Inner Gradient Sinkron Maskot**: Area bawah tanpa garis outline kaku, digantikan *inner gradient* yang warnanya berubah otomatis mengikuti status maskot Mochi, lengkap dengan badge `Connected` ringkas di sebelah header serta info versi **About** di bawah Pengaturan.
- **Kunci Pairing 8-Karakter &amp; Sinkron Otomatis**: Semua endpoint chat, riwayat, upload, dan `/api/models` terlindungi kode pairing 8-karakter; membuka atau kembali ke app di HP langsung menyinkronkan status terbaru tanpa perlu mengetik ulang IP.
- **Approval Jarak Jauh, Diff, Chat &amp; Wardrobe**: Setujui/tolak perintah dari notifikasi maupun layar HP, kirim lampiran file di chat, dan pilih kostum Mochi lewat dropdown praktis di Pengaturan.

<table align="center">
  <tr>
    <td align="center"><b>Idle Overview</b></td>
    <td align="center"><b>Active Task Stepper</b></td>
    <td align="center"><b>Approval Dialog</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/pwa-01-idle.png" alt="PWA Idle Overview" width="260" /></td>
    <td><img src="docs/media/pwa-02-working.png" alt="PWA Active Task Stepper" width="260" /></td>
    <td><img src="docs/media/pwa-03-approval.png" alt="PWA Tool Approval Dialog" width="260" /></td>
  </tr>
  <tr>
    <td align="center"><b>Antigravity Chat</b></td>
    <td align="center"><b>OpenCode Sessions</b></td>
    <td align="center"><b>Live Code Diff</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/pwa-04-chat.png" alt="PWA Interactive Chat" width="260" /></td>
    <td><img src="docs/media/pwa-07-opencode.png" alt="PWA OpenCode Session" width="260" /></td>
    <td><img src="docs/media/pwa-05-diff.png" alt="PWA Live Code Diff" width="260" /></td>
  </tr>
  <tr>
    <td colspan="3" align="center"><b>Settings &amp; Wardrobe Outfits</b></td>
  </tr>
  <tr>
    <td colspan="3" align="center"><img src="docs/media/pwa-06-wardrobe.png" alt="PWA Wardrobe Outfits" width="360" /></td>
  </tr>
</table>

---

### 🎵 Now Playing &amp; Live Synchronized Karaoke Lyrics (`lrclib.net`)
- **EN**: Real-time media tracking (Spotify, Apple Music, YouTube Music, browsers), 3-line synced karaoke lyrics, and live audio equalizer.
- **ID**: Pelacakan pemutar media real-time, lirik karaoke 3 baris tersinkronisasi, dan visualizer audio equalizer.

<p align="center">
  <img src="docs/media/11-now-playing.png" alt="Now Playing Media Player" width="850" />
</p>
<p align="center">
  <img src="docs/media/12-lyrics-karaoke.png" alt="Synchronized Karaoke Lyrics" width="850" />
</p>

---

### 🕌 Prayer Times / Jadwal Sholat (Standar Kemenag RI)
- **EN**: Astronomical calculations matching *Kemenag RI (SIHAT / MABIMS)* (`Subuh -20°`, `Isya -18°`, `WIB / WITA / WIT`), interactive sun arc, and closed-notch prayer alerts.
- **ID**: Perhitungan hisab akurat standar *Kementerian Agama RI (SIHAT / MABIMS)*, busur matahari interaktif dari Subuh ke Isya, dan banner pengingat waktu sholat di notch tertutup.

<p align="center">
  <img src="docs/media/05-prayer-times.png" alt="Prayer Times Sun Arc" width="850" />
</p>

---

### 💧 Water Reminder / Pengingat Minum Air
- **EN**: Configurable bottle size (500 ml), daily target (1.5 L – 3.0 L), 15-minute micro-sip scheduler, and circular progress ring.
- **ID**: Atur ukuran botol (500 ml), target harian (1,5 L – 3,0 L), jadwal pengingat tegukan tiap 15 menit pada jam aktif, serta indikator progres melingkar.

<p align="center">
  <img src="docs/media/06-water-reminder.png" alt="Water Reminder View" width="850" />
</p>

---

### 💬 WhatsApp on Dynamic Island
- **EN**: Start direct chats with any international number (`+62`, `+60`, `+65`, `+1`, etc.) without saving contacts, via WhatsApp Desktop or WhatsApp Web (`0 MB` idle RAM).
- **ID**: Kirim pesan langsung ke nomor mana pun tanpa perlu menyimpan kontak lewat WhatsApp Desktop atau WhatsApp Web dengan konsumsi RAM `0 MB` saat idle.

<p align="center">
  <img src="docs/media/07-whatsapp.png" alt="WhatsApp Companion View" width="850" />
</p>

---

### ⏱️ Productivity Suite: Timers, Todos, Notes, Shelf &amp; Tools

<table align="center">
  <tr>
    <td align="center"><b>Timer &amp; Stopwatch</b></td>
    <td align="center"><b>Todo Tasks</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/13-timer-stopwatch.png" alt="Timer Stopwatch" width="420" /></td>
    <td><img src="docs/media/14-todos.png" alt="Todos" width="420" /></td>
  </tr>
  <tr>
    <td align="center"><b>Quick Notes</b></td>
    <td align="center"><b>Clipboard History</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/15-notes.png" alt="Notes" width="420" /></td>
    <td><img src="docs/media/16-clipboard-history.png" alt="Clipboard History" width="420" /></td>
  </tr>
  <tr>
    <td align="center"><b>Drop Shelf (File Parking)</b></td>
    <td align="center"><b>AI Ask / Assistant</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/17-shelf.png" alt="File Parking Shelf" width="420" /></td>
    <td><img src="docs/media/18-ai-ask.png" alt="AI Ask" width="420" /></td>
  </tr>
  <tr>
    <td align="center"><b>Unit &amp; Currency Converter</b></td>
    <td align="center"><b>Trading &amp; Crypto Portfolio</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/19-converter.png" alt="Converter" width="420" /></td>
    <td><img src="docs/media/20-trading-portfolio.png" alt="Trading Portfolio" width="420" /></td>
  </tr>
</table>

---

### 📊 System Diagnostics, Hardware HUD &amp; Vault

<table align="center">
  <tr>
    <td align="center"><b>AI Quota &amp; Usage Monitor</b></td>
    <td align="center"><b>Weather Forecast</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/21-ai-usage.png" alt="AI Quota Usage" width="420" /></td>
    <td><img src="docs/media/22-weather.png" alt="Weather Forecast" width="420" /></td>
  </tr>
  <tr>
    <td align="center"><b>Hardware System HUD</b></td>
    <td align="center"><b>Discord Presence</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/23-hardware-system-hud.png" alt="Hardware HUD" width="420" /></td>
    <td><img src="docs/media/24-discord.png" alt="Discord Presence" width="420" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><b>Password Vault &amp; 2FA Authenticator (Windows Hello)</b></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/media/25-vault-passwords.png" alt="Password Vault & 2FA" width="600" /></td>
  </tr>
</table>

---

### ⚙️ Settings &amp; Customization / Pengaturan &amp; Kustomisasi
- **Display Settings / Tampilan**: Monochrome pure black or Color theme with 8 adaptive accent hues, 80% / 100% / 120% scale, and alignment.
- **Tools Manager / Kelola Alat**: Toggle active utilities on demand.
- **Coding Agent Settings**: Configure Mochi pupil tracking, wardrobe outfits, OpenCode hooks, pairing code, and notification volume.

<table align="center">
  <tr>
    <td align="center"><b>Display Settings</b></td>
    <td align="center"><b>Tools Manager</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/26-settings-display.png" alt="Display Settings" width="420" /></td>
    <td><img src="docs/media/27-settings-tools.png" alt="Tools Settings" width="420" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><b>Coding Agent Settings</b></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/media/28-settings-coding-agent.png" alt="Coding Agent Settings" width="600" /></td>
  </tr>
</table>

---

## Quick Start &amp; Controls / Panduan Cepat

| Action | English | Bahasa Indonesia |
| --- | --- | --- |
| **Open / Close** | Hover over the notch, click, or press **Ctrl + Alt + Space** | Arahkan kursor, klik, atau tekan **Ctrl + Alt + Space** |
| **Reset on Close** | Returns to **Overview** automatically when closed from Settings | Otomatis kembali ke **Ikhtisar** saat ditutup dari Pengaturan |
| **Restart App** | Right-click tray icon → **Restart** | Klik kanan ikon tray → **Mulai Ulang (Restart)** |
| **Notch Mode** | Right-click tray icon → toggle **Normal** ⇄ **Line** | Klik kanan ikon tray → ganti mode **Normal** ⇄ **Line** |
| **Switch Tabs** | Click header bar or scroll mouse wheel over icons | Klik ikon tab atas atau scroll mouse di atas ikon |
| **Move / Resize / Theme** | Drag header horizontally; configure theme &amp; scale in **Settings → Display** | Geser header secara horizontal; atur tema &amp; skala di **Pengaturan → Tampilan** |
| **Language** | Switch **English** / **Bahasa Indonesia** in **Settings → General** | Pilih **English** / **Bahasa Indonesia** di **Pengaturan → Umum** |
| **OpenCode &amp; Approvals** | **Settings → Coding Agent → Install Hooks (1-Click)**, keep **OpenCode approvals** on; approve with **Y / A / N** | **Pengaturan → Coding Agent → Pasang Hooks (1-Klik)**, biarkan **Izin OpenCode** aktif; setujui dengan **Y / A / N** |
| **Pair a Phone** | **Settings → Coding Agent → Phone pairing code → Create code**, enter the 8 characters once on mobile | **Pengaturan → Coding Agent → Kode pairing HP → Buat**, lalu masukkan 8 karakter itu sekali di HP |
| **Mobile Companion / PWA** | Connect to the same Wi-Fi, open the companion URL or install APK/IPA | Hubungkan PC &amp; HP ke Wi-Fi yang sama, buka URL companion di browser HP / pasang APK atau IPA |
| **Mochi Outfit** | Change in **Coding Agent → Wardrobe** or Mobile **Settings → Outfit** (auto-synced) | Pilih di **Coding Agent → Wardrobe** atau **Pengaturan → Outfit** di HP (tersinkronisasi otomatis) |

### OpenCode Approvals &amp; Inside the Notch — Detailed Guide

<details>
<summary><b>English Guide: OpenCode &amp; Mobile Companion Setup</b></summary>

1. **OpenCode Approvals**: Open **Settings → Coding Agent**, click **⚡ Install Hooks (1-Click)** once, and keep **OpenCode approvals** on. The plugin adds session-scoped `ask` rules for `shell` and `edit` without modifying `opencode.json`.
2. **OpenCode Inside the Notch**: Open **Coding Agent → OpenCode** to view the live session transcript, switch between **Build / Plan** agents or detected **Models** (with **Effort** levels), start new sessions (`+`), attach files, reply (**Enter**), or interrupt turns (**Stop**).
3. **Mobile Companion Pairing**: Connect PC and phone to the same Wi-Fi, install `.apk` / `.ipa` or add the web companion URL to Home Screen, then enter the 8-character pairing code generated in **Settings → Coding Agent → Phone pairing code**. If a badge stays amber (`Pairing`), tap the badge in the header to re-enter the code. **New code** signs out all devices; **Turn off lock** reopens LAN access.

</details>

<details>
<summary><b>Panduan Bahasa Indonesia: OpenCode &amp; Pengaturan Companion HP</b></summary>

1. **Izin Perintah OpenCode**: Buka **Pengaturan → Coding Agent**, klik **⚡ Pasang Hooks (1-Klik)** satu kali, lalu biarkan **Izin OpenCode** aktif. Plugin otomatis memasang aturan `ask` per sesi untuk `shell` dan `edit` tanpa mengubah `opencode.json`.
2. **Tab Chat Antigravity &amp; OpenCode**: Buka **Coding Agent → Antigravity / OpenCode** untuk melihat transkrip live, mengganti **Agent** atau **Model &amp; Effort**, membuat sesi baru (`+`), melampirkan file, membalas (**Enter**), atau menghentikan proses (**Stop**).
3. **Pairing Companion HP**: Pastikan HP &amp; PC terhubung ke Wi-Fi yang sama, pasang file `.apk` / `.ipa` atau buka URL companion di Safari/Chrome (**Add to Home Screen**). Buat **Kode pairing HP** (8 karakter) di Pengaturan desktop dan masukkan di layar pairing HP. Bila status badge masih amber, ketuk badge tersebut untuk mengetik ulang kode. Klik **Kode baru** untuk mengeluarkan semua perangkat atau **Matikan kunci** untuk akses terbuka.

</details>

---

## Development / Pengembangan

Built with **Tauri 2**, **React 19**, **TypeScript**, **Motion**, **Glisse**, and **Tailwind CSS 4**. Uses Windows WebView2 for a compact native footprint without bundling Chromium.

### Prerequisites / Prasyarat
- Node.js 22+
- Rust (stable toolchain)
- Visual Studio Build Tools (*C++ workload* + *Windows 10/11 SDK*)

### Commands / Perintah

```powershell
# Install frontend dependencies / Pasang dependensi frontend
npm install

# Start Vite dev server in browser (includes desktop simulator)
npm run dev

# Run desktop Tauri application / Jalankan aplikasi desktop Tauri
npm run tauri dev

# Type check TypeScript codebase
npm run typecheck

# Validate i18n translation coverage (English & Indonesian)
npm run i18n

# Build local standalone installer or executable (bypassing Smart App Control blocks)
npx tauri build
# Output installer: src-tauri/target/release/bundle/nsis/narra-notch_*_x64-setup.exe
# Output binary:    src-tauri/target/release/notch.exe
```

---

## Credits &amp; License

Distributed under the [GPL-3.0 License](LICENSE). You may use, study, modify, and share this project under the terms of the GPL-3.0 license.

### Attribution &amp; Sources
- **Coucou**: Mascot character rendering engine (`BotEngine`), sound effects, wardrobe outfits, and coding agent companion concepts ported from [Coucou](https://github.com/louis-cfm/coucou) by Louis CFM ([MIT License](https://github.com/louis-cfm/coucou/blob/main/LICENSE)).
- **Glisse**: Apple Liquid Glass React UI controls (`TabBar`, `SegmentedControl`, `Switch`, `Button`) from [Glisse](https://github.com/0kzh/glisse) by Kelvin Zhang ([MIT License](https://github.com/0kzh/glisse/blob/main/LICENSE)).
- **Original Base Project**: Forked and customized from [Linux5Real/L4-Windows-NotchBar](https://github.com/Linux5Real/L4-Windows-NotchBar) (GPL-3.0).
- **Notch Proportions**: Derived from [NotchDrop](https://github.com/Lakr233/NotchDrop) (MIT).
- **Lyrics API**: Synchronized lyrics powered by [LRCLIB](https://lrclib.net).
- **Prayer Engine**: Astronomical algorithms powered by [Adhan](https://github.com/batoulapps/adhan-js) with Indonesian Ministry of Religious Affairs (SIHAT/MABIMS) parameters.
- **Icons**: Vector icons by [Phosphor Icons](https://phosphoricons.com).
