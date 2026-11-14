<h1 align="center">narra-notch</h1>

<p align="center">
  <b>A refined Dynamic-Island-style notch bar for Windows 10 & 11.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v2.2.0-111?style=flat-square" alt="Version 2.2.0" />
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-111?style=flat-square" alt="Windows 10 and 11" />
  <img src="https://img.shields.io/badge/iOS-IPA-111?style=flat-square" alt="iOS Sideload IPA" />
  <img src="https://img.shields.io/badge/Android-APK-111?style=flat-square" alt="Android APK" />
  <img src="https://img.shields.io/badge/license-GPL--3.0-111?style=flat-square" alt="GPL-3.0" />
  <img src="https://img.shields.io/badge/theme-Monochrome%20%7C%20Color-111?style=flat-square" alt="Themes" />
  <img src="https://img.shields.io/badge/i18n-EN%20%7C%20ID-111?style=flat-square" alt="Bilingual" />
</p>

<p align="center">
  <a href="https://github.com/carissadarmafissaleha/narra-notch/releases/latest"><b>Download Installer</b></a>
  &nbsp;·&nbsp;
  <a href="#showcase--gallery"><b>Gallery</b></a>
  &nbsp;·&nbsp;
  <a href="#key-features"><b>Features</b></a>
  &nbsp;·&nbsp;
  <a href="#quick-start--controls"><b>Using it</b></a>
  &nbsp;·&nbsp;
  <a href="#development"><b>Development</b></a>
  &nbsp;·&nbsp;
  <a href="#credits--license"><b>Credits & License</b></a>
</p>

<p align="center">
  <img src="docs/media/04-overview.png" alt="narra-notch Overview Dashboard" width="900" />
</p>

---

A native, lightweight Dynamic Island sitting discreetly at the top of your Windows desktop. It stays out of your way until you need it, expanding seamlessly on hover, click, or hotkey (**Ctrl + Alt + Space**).

Crafted with **custom themes** (pure black Monochrome and vibrant Color theme with adaptive accent hues), crisp Phosphor vector icons, and full **bilingual localization** (English and Bahasa Indonesia).

---

## Showcase & Gallery

### 🏝️ Dynamic Island States (Closed Notch)

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

## Key Features

### 🤖 Coding Agent Companion (Mochi, Antigravity & OpenCode)
Seamless companion for Google DeepMind's Antigravity (`agy`), OpenCode, and AI coding agents:
- **OpenCode Integration**: Install the OpenCode plugin in one click from Settings; the notch and iPhone/PWA then track OpenCode sessions live and relay **Allow / Always / Deny** decisions straight back to the terminal.
- **OpenCode Inside the Notch**: A dedicated **OpenCode** tab mirrors the active session — your prompt, the agent's text, collapsible reasoning and every tool call. Start a **new session**, switch **agent** (Build, Plan, …) or **model**, reply, and stop a running turn without leaving the notch. The OpenCode password stays on the PC; the phone asks the notch.
- **Approvals Without Editing Config**: The plugin adds session-scoped `ask` rules for shell commands and file edits, so you do not have to touch `opencode.json`. Turn it off in Settings → Coding Agent, or keep your own `deny` rules — they still win.
- **Chosen Outfit Survives Restarts**: The Mochi outfit selected on desktop or on the phone is kept in sync, so a desktop restart no longer resets the companion to its default look.
- **Authentic AGY CLI Braille Indicator**: Authentic rotating Braille dots spinner (`⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏`) that rotates during active tasks and stays stationary when idle.
- **Dedicated Interactive Chat Tabs (Desktop Notch & Mobile PWA)**: Clean tab navigation between `[ Overview ]`, `[ Chat ]`, and `[ Diff ]`, giving conversations a distraction-free full-height workspace.
- **One-Click Clear Chat & Improved Drawer**: Instant chat clearing (`Trash` icon) with confirmation and an unclipped full-height chat history drawer.
- **Coucou Mascot & Rich Gestures (`BotEngine`)**:
  - Auto greeting peek-wave (`👋 greet`) upon load.
  - Interactive touch & swipe: tap once for random playful emotes (love, proud, wink), swipe horizontally to somersault roll 360°, swipe up to jump bounce with star particles, swipe down to duck.
  - Full celebratory roll protection: task complete animations finish completely without flickering.
  - Gentle debounced audio chimes: sounds play only on start, edit, bash, and done (`read` sounds silenced).
  - Synchronized wardrobe outfit selection persisting across refreshes and devices.
- **Interactive Tool Approval & Review**: Automatic popup in notch even when Antigravity is minimized. Review critical commands, questions, and plan feedback with instant **`Y`** (Allow), **`N`** (Deny), and **`A`** (Always) shortcuts.
- **Syntax-Colored Code Diff & Stepper**: Live diff inspection with additions, deletions, step tracking (*Read, Edit, Bash, Done*), and relocated command target view.

<table align="center">
  <tr>
    <td align="center"><b>Mascot Overview (Idle)</b></td>
    <td align="center"><b>Active Task & Braille Spinner</b></td>
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

### 📱 Mobile Companion (`CodingAgent` for iOS, Android & PWA)
Control your desktop coding agent remotely from your iPhone or Android phone via local Wi-Fi:
- **Native iOS & Android Apps**: Download `.ipa` (iOS sideload) or `.apk` (Android directly) from the Releases page, or use as a browser PWA.
- **Pairing Code Lock**: Create an 8-character code in Settings and type it once on the phone. Until you create one the server stays open, so an older phone build keeps working.
- **OpenCode Tab on the Phone**: Read the live transcript and start sessions or switch agent/model from the phone too — the OpenCode password never leaves the PC.
- **Remote Tool Approvals with Action Buttons**: Review shell commands, file diffs, and approve or deny execution directly from system notification banners (**Allow**, **Always**, **Deny**) or the interactive Mochi screen.
- **Notification Sounds & Haptics**: Full audio and vibration alerts on both iOS and Android when an agent requires approval or finishes its task.
- **Real-Time Synchronized Outfits**: Mochi's wardrobe updates live across desktop and mobile companion.
- **Dark & Light Mode**: A sun/moon switch in the companion header; the choice is remembered. The Windows notch stays pure black.
- **Dedicated Interactive Chat Tabs**: Clean tab navigation between `[ Overview ]`, `[ Chat ]`, and `[ Diff ]`.
- **Full Touch Gestures & PWA Caching**: Viewport-locked momentum scrolling, real-time Server-Sent Events (SSE), and audio notifications.

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
    <td align="center"><b>Interactive Chat & Models</b></td>
    <td align="center"><b>Live Code Diff</b></td>
    <td align="center"><b>Wardrobe Outfits</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/pwa-04-chat.png" alt="PWA Interactive Chat" width="260" /></td>
    <td><img src="docs/media/pwa-05-diff.png" alt="PWA Live Code Diff" width="260" /></td>
    <td><img src="docs/media/pwa-06-wardrobe.png" alt="PWA Wardrobe Outfits" width="260" /></td>
  </tr>
</table>

---

### 🎵 Now Playing & Live Synchronized Karaoke Lyrics (`lrclib.net`)
- **Universal Player Compatibility**: Real-time media session tracking across Spotify, Apple Music, YouTube Music, and web browsers.
- **Synced Karaoke Stream**: 3-line synced lyrics with active line highlighting and marquee scrolling for long lines.
- **Audio Equalizer**: Real-time visualizer driven by system audio activity.

<p align="center">
  <img src="docs/media/11-now-playing.png" alt="Now Playing Media Player" width="850" />
</p>
<p align="center">
  <img src="docs/media/12-lyrics-karaoke.png" alt="Synchronized Karaoke Lyrics" width="850" />
</p>

---

### 🕌 Prayer Times (Jadwal Sholat — Standar Kemenag RI)
- **Kemenag RI Standard**: Accurate astronomical calculation based on *Hisab Rukyat Kementerian Agama Republik Indonesia (SIHAT / MABIMS)* (`Subuh -20°`, `Isya -18°`, `WIB / WITA / WIT`).
- **Interactive Sun Arc**: Visual trajectory of the sun from Subuh to Isya with active prayer checkpoint indicators.
- **Closed Notch Pill Banner**: Dynamic alert when prayer time enters with 1-click dismiss button.

<p align="center">
  <img src="docs/media/05-prayer-times.png" alt="Prayer Times Sun Arc" width="850" />
</p>

---

### 💧 Water Reminder (Pengingat Hidrasi Harian)
- **Smart Hydration Engine**: Bottle size configuration (500 ml), daily goal (1.5 L – 3.0 L), and waking active hours.
- **15-Minute Micro-Sip Scheduler**: Timely, gentle prompts during active hours to stay hydrated throughout the day.
- **Circular Progress Ring**: Real-time progress display with quick *Minum / Drink* action.

<p align="center">
  <img src="docs/media/06-water-reminder.png" alt="Water Reminder View" width="850" />
</p>

---

### 💬 WhatsApp on Dynamic Island
- **Direct Chat Without Saving Contacts**: Message any international number instantly (`+62`, `+60`, `+65`, `+1`, etc.).
- **Dual Launcher**: Open chats directly in **WhatsApp Desktop** (`whatsapp://`) or in browser WhatsApp Web.
- **0 MB Idle RAM Web Companion**: Mini web view with complete memory release upon closing.

<p align="center">
  <img src="docs/media/07-whatsapp.png" alt="WhatsApp Companion View" width="850" />
</p>

---

### ⏱️ Productivity Suite: Timers, Todos, Notes & Shelf

<table align="center">
  <tr>
    <td align="center"><b>Timer & Stopwatch</b></td>
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
    <td align="center"><b>Unit & Currency Converter</b></td>
    <td align="center"><b>Trading & Crypto Portfolio</b></td>
  </tr>
  <tr>
    <td><img src="docs/media/19-converter.png" alt="Converter" width="420" /></td>
    <td><img src="docs/media/20-trading-portfolio.png" alt="Trading Portfolio" width="420" /></td>
  </tr>
</table>

---

### 📊 System Diagnostics, Hardware HUD & Vault

<table align="center">
  <tr>
    <td align="center"><b>AI Quota & Usage Monitor</b></td>
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
    <td colspan="2" align="center"><b>Password Vault & 2FA Authenticator (Windows Hello)</b></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><img src="docs/media/25-vault-passwords.png" alt="Password Vault & 2FA" width="600" /></td>
  </tr>
</table>

---

### ⚙️ Settings & Customization
Fine-tune notch proportions, theme aesthetics, and tool integrations:
- **Display Settings**: Choose themes (*pure black Monochrome* or *Color with 8 adaptive accent hues*), set notch scale (*80%, 100%, 120%*), and adjust alignment.
- **Tools Manager**: Toggle active utilities on and off on demand.
- **Coding Agent Settings**: Configure Mochi mascot, cursor pupil tracking, seasonal outfits, and audio volume.

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

## Quick Start & Controls

| Action | How |
| --- | --- |
| **Open / Close** | Hover over the notch, click, or press **Ctrl + Alt + Space** |
| **Reset on Close** | Automatically returns to **Overview (Ikhtisar)** whenever closed from Settings |
| **Restart App** | Right-click the system tray icon and select **Mulai Ulang (Restart)** |
| **Notch Mode** | Right-click the system tray icon to switch **Normal** ⇄ **Line** mode |
| **Switch Tabs** | Click the top navigation bar or **scroll mouse wheel** over icons |
| **Move Notch** | Drag horizontally by its header or while closed |
| **Focus Mode** | Click the focus button in header or select from the tray menu |
| **File Parking** | Drag and drop any file onto the notch |
| **Theme & Display** | Choose **Monochrome** or **Color** (8 accents) in Settings → Display |
| **Resize Notch** | Choose **80%**, **100%**, or **120%** scale in Settings → Display |
| **Language** | Switch between **English** and **Bahasa Indonesia** in Settings → General |
| **OpenCode Tab** | Open **Coding Agent → OpenCode** to read the live transcript; type a reply, or press **Stop** while a turn is running |
| **New OpenCode Session** | Click **+** in the OpenCode tab; the new session inherits the current project folder, agent and model |
| **Switch Agent / Model** | Tap the **agent** or **model** chip under the OpenCode header; the model picker has a search box |
| **OpenCode Approvals** | Install the plugin and keep **OpenCode approvals** on in Settings → Coding Agent |
| **Pair a Phone** | Settings → Coding Agent → **Phone pairing code** → **Create code**, then type the 8 characters once on the phone |
| **Phone / PWA** | Copy the companion URL in Settings → Coding Agent, open it on your phone (same Wi-Fi), then enter the pairing code |
| **Mochi Outfit** | Coding Agent → **Wardrobe**; the choice syncs to the phone and survives restarts |

<details>
<summary><b>Cara pakai singkat (Bahasa Indonesia)</b></summary>

- **Buka / tutup notch**: arahkan kursor, klik, atau tekan **Ctrl + Alt + Space**.
- **Pindah tab**: klik ikon di bar atas, atau scroll mouse di atas ikon.
- **Ukuran & tema**: **Pengaturan → Tampilan** (Monokrom/Warna, skala 80/100/120%).
- **Izin OpenCode**: **Pengaturan → Coding Agent** → klik **⚡ Pasang Hooks (1-Klik)** sekali, lalu biarkan **Izin OpenCode** aktif. Sebelum perintah shell atau edit file dijalankan, notch (dan HP bila terhubung) akan meminta konfirmasi: **Allow / Always / Deny** — atau tombol **Y / A / N**. Tidak perlu mengubah `opencode.json`.
- **HP / PWA**: sambungkan HP dan PC ke Wi-Fi yang sama, buka **Pengaturan → Coding Agent → Mobile Companion**, salin URL, lalu buka di Safari/Chrome dan pilih **Add to Home Screen**.
- **Tab OpenCode**: buka **Coding Agent → OpenCode**. Isinya transkrip sesi aktif: pesanmu di kanan, jawaban agent dan reasoning di kiri (klik untuk membuka), plus setiap tool yang dipanggil. Balas dari kotak bawah (**Enter** kirim, **Shift + Enter** baris baru), atau tekan **Hentikan** saat agent masih jalan.
- **Sesi OpenCode baru**: klik **+** di tab OpenCode. Sesi baru ikut folder proyek, agent, dan model sesi yang sedang tampil, jadi tidak perlu pindah ke jendela OpenCode.
- **Ganti agent / model**: klik chip **agent** atau **model** di bawah header tab OpenCode. Model punya kolom pencarian; daftarnya mengikuti model yang aktif di OpenCode.
- **Pairing HP**: **Pengaturan → Coding Agent → Kode pairing HP → Buat**, lalu masukkan 8 karakter itu sekali di HP. Kalau kode salah, HP menampilkan pesan yang jelas. **Kode baru** mengeluarkan semua HP, **Matikan kunci** membuka server lagi. Selama belum ada kode, server tetap terbuka supaya build HP lama masih bisa dipakai.
- **Outfit Mochi**: pilih di **Coding Agent → Wardrobe**. Pilihan tersimpan di desktop dan HP, jadi tidak hilang lagi setelah aplikasi ditutup dan dibuka kembali.
- **Daftar pengaturan panjang**: halaman Pengaturan sekarang lebih besar dan punya scrollbar tipis di sisi kanan. Geser ke bawah untuk melihat sisanya.

</details>

### OpenCode Approvals — How It Works

1. Open **Settings → Coding Agent**.
2. Click **⚡ Install Hooks (1-Click)** once. The plugin updates itself after app updates.
3. Leave **OpenCode approvals** on (default).
4. Use OpenCode normally. Before a shell command or file edit, the notch — and the phone, if connected — shows the request.
5. Choose **Allow** (once), **Always** (for the rest of the session), or **Deny**. In the notch you can also press **Y**, **A**, or **N**.
6. Turn the switch off to return to OpenCode's normal allow-all policy.

The plugin only adds **session-scoped** `ask` rules for `shell` and `edit`. Your `opencode.json` is never modified, an explicit `deny` in your own rules still wins, and when narra-notch is not running the plugin fails fast so OpenCode keeps its usual terminal behaviour.

### OpenCode Inside the Notch

1. Open **Coding Agent → OpenCode**. The tab follows the session the plugin reports; if nothing is running it shows the newest session, so it is never empty.
2. Read the transcript: your prompt on the right, the agent's text and collapsible reasoning on the left, and every tool call with its state.
3. Type in the composer and press **Enter** to send (**Shift + Enter** for a new line). Press **Stop** in the header to interrupt a running turn.
4. Press **+** to start a new session. It opens in the same project folder as the session on screen and inherits its agent and model.
5. Tap the **agent** chip to switch between **Build** and **Plan**; tap the **model** chip to choose from the models OpenCode has enabled. Type in the picker to search by name, id, or provider.
6. The same tab exists on the phone. The phone never receives the OpenCode password: it calls the notch, and the notch calls OpenCode.

> The tab reads the same HTTP API as the OpenCode web UI. If the notch says OpenCode is not running, open OpenCode on the PC once and refresh.

### Mobile Companion (iOS, Android & PWA)

1. Connect your phone and PC to the **same Wi-Fi network**.
2. **Download App**:
   - **Android**: Download `narra-notch_<version>_android.apk` directly from the [Releases](https://github.com/carissadarmafissaleha/narra-notch/releases/latest) page and install.
   - **iOS**: Sideload `narra-notch_<version>_ios.ipa` via AltStore/SideStore/Scarlet/TrollStore.
   - **Browser PWA**: On PC go to **Settings → Coding Agent → Mobile Companion**, click **Copy URL**, open in Safari/Chrome on your phone, and select **Add to Home Screen**.
3. **Pair the phone**: in **Settings → Coding Agent → Phone pairing code**, click **Create code** and type the eight characters on the phone. The phone shows an amber **Pairing** badge until it is accepted.
4. The companion connects in real-time to show live agent status, tool steps, git diffs, approvals with action buttons, the OpenCode tab, and Mochi's wardrobe outfits.
5. The Mochi outfit is kept synchronized between desktop and phone automatically.

**If pairing fails:** the badge stays amber and the phone shows *"This phone is not paired with Notch for Windows yet."* Tap the status badge in the phone header, re-enter the eight characters, and press **OK**. **New code** signs every phone out; **Turn off lock** makes the server open again.

---

## Development

Built with **Tauri 2**, **React 19**, **TypeScript**, **Motion**, and **Tailwind CSS 4**. Uses Windows WebView2 for a compact binary without bundling a full browser runtime.

### Prerequisites
- Node.js 22 or newer
- Rust (stable toolchain)
- Visual Studio Build Tools with the *C++ workload* and *Windows 10/11 SDK*

### Commands

```powershell
# Install frontend dependencies
npm install

# Start Vite dev server in browser (includes fake desktop simulator)
npm run dev

# Run desktop Tauri application
npm run tauri dev

# Type check TypeScript codebase
npm run typecheck

# Validate i18n translation coverage (English & Indonesian)
npm run i18n
```

### Building Standalone Binary

```powershell
npx tauri build --no-bundle
# Output executable: src-tauri/target/release/notch.exe
```

---

## Credits & License

Distributed under the [GPL-3.0 License](LICENSE). You may use, study, modify, and share this project under the terms of the GPL-3.0 license.

### Attribution & Sources
- **Coucou**: Mascot character rendering engine (`BotEngine`), sound effects, wardrobe outfits, and coding agent companion concepts ported from [Coucou](https://github.com/louis-cfm/coucou) by Louis CFM ([MIT License](https://github.com/louis-cfm/coucou/blob/main/LICENSE)).
- **Original Base Project**: Forked and customized from [Linux5Real/L4-Windows-NotchBar](https://github.com/Linux5Real/L4-Windows-NotchBar) (GPL-3.0).
- **Notch Proportions**: Derived from [NotchDrop](https://github.com/Lakr233/NotchDrop) (MIT).
- **Lyrics API**: Synchronized lyrics powered by [LRCLIB](https://lrclib.net).
- **Prayer Engine**: Astronomical algorithms powered by [Adhan](https://github.com/batoulapps/adhan-js) with Indonesian Ministry of Religious Affairs (SIHAT/MABIMS) parameters.
- **Icons**: Vector icons by [Phosphor Icons](https://phosphoricons.com).
