//! Overview: system volume and Windows focus.
//!
//! - Volume: default output device via `IAudioEndpointVolume` (same as the taskbar slider).
//! - Focus: Windows 11 focus session (`FocusSessionManager`, also turns on Do Not Disturb).
//!   Without that API (older builds), Do Not Disturb is set directly through the WNF state
//!   `WNF_SHEL_QUIETHOURS_ACTIVE_PROFILE_CHANGED`, which is what the toggle in the
//!   notification center does.

use std::ffi::c_void;
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::UI::Shell::FocusSessionManager;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CAPITAL};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Volume {
    /// 0..1
    pub level: f32,
    pub muted: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct BatteryInfo {
    pub level: u8,
    pub charging: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct CapsLockInfo {
    pub active: bool,
}

#[derive(Serialize)]
pub struct Focus {
    active: bool,
    /// "focus" = focus session, "dnd" = only Do Not Disturb available
    kind: &'static str,
}

fn endpoint() -> windows::core::Result<IAudioEndpointVolume> {
    unsafe {
        // Own thread per call (spawn_blocking) → MTA; "already initialized" is fine.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        devices.GetDefaultAudioEndpoint(eRender, eConsole)?.Activate(CLSCTX_ALL, None)
    }
}

fn read_volume() -> windows::core::Result<Volume> {
    let ep = endpoint()?;
    unsafe { Ok(Volume { level: ep.GetMasterVolumeLevelScalar()?, muted: ep.GetMute()?.as_bool() }) }
}

#[tauri::command]
pub async fn volume_get() -> Result<Volume, String> {
    tauri::async_runtime::spawn_blocking(|| read_volume().map_err(|e| e.message()))
        .await
        .map_err(|e| e.to_string())?
}

/// Sets `level` 0..1 and/or `muted`. Raising the volume unmutes, like Windows does.
#[tauri::command]
pub async fn volume_set(level: Option<f32>, muted: Option<bool>) -> Result<Volume, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ep = endpoint().map_err(|e| e.message())?;
        unsafe {
            if let Some(l) = level {
                ep.SetMasterVolumeLevelScalar(l.clamp(0.0, 1.0), std::ptr::null()).map_err(|e| e.message())?;
                if l > 0.0 && muted.is_none() {
                    let _ = ep.SetMute(false, std::ptr::null());
                }
            }
            if let Some(m) = muted {
                ep.SetMute(m, std::ptr::null()).map_err(|e| e.message())?;
            }
        }
        read_volume().map_err(|e| e.message())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Continuous background monitor for system volume, CapsLock, and battery state.
/// Emits `hud://volume`, `hud://capslock`, and `hud://battery` on physical hardware changes.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        let mut current_ep: Option<IAudioEndpointVolume> = None;
        let mut last_ep_check = Instant::now() - Duration::from_secs(10);
        let mut last_vol: Option<Volume> = None;
        let mut last_caps: Option<bool> = None;
        let mut last_battery: Option<BatteryInfo> = None;
        let mut tick: u32 = 0;

        loop {
            thread::sleep(Duration::from_millis(50));
            tick = tick.wrapping_add(1);

            // 1. Audio Endpoint Volume check
            if current_ep.is_none() || last_ep_check.elapsed() > Duration::from_secs(3) {
                last_ep_check = Instant::now();
                current_ep = endpoint().ok();
            }

            if let Some(ref ep) = current_ep {
                let res = unsafe {
                    let level = ep.GetMasterVolumeLevelScalar();
                    let muted = ep.GetMute();
                    match (level, muted) {
                        (Ok(l), Ok(m)) => Ok(Volume { level: l, muted: m.as_bool() }),
                        _ => Err(()),
                    }
                };

                match res {
                    Ok(current) => {
                        if let Some(prev) = last_vol {
                            let diff = (current.level - prev.level).abs();
                            let mute_changed = current.muted != prev.muted;
                            if diff > 0.005 || mute_changed {
                                let _ = app.emit("hud://volume", current);
                            }
                        }
                        last_vol = Some(current);
                    }
                    Err(_) => {
                        current_ep = None;
                    }
                }
            }

            // 2. Global CapsLock state check
            let is_caps_on = unsafe { (GetKeyState(VK_CAPITAL.0 as i32) & 1) != 0 };
            if let Some(prev_caps) = last_caps {
                if is_caps_on != prev_caps {
                    let _ = app.emit("hud://capslock", CapsLockInfo { active: is_caps_on });
                }
            }
            last_caps = Some(is_caps_on);

            // 3. Battery status check (every ~1s, 20 ticks of 50ms)
            if tick % 20 == 0 {
                let mut status = SYSTEM_POWER_STATUS::default();
                let ok = unsafe { GetSystemPowerStatus(&mut status).is_ok() };
                if ok && status.BatteryLifePercent != 255 {
                    let charging = status.ACLineStatus == 1;
                    let level = status.BatteryLifePercent;
                    let info = BatteryInfo { level, charging };

                    if let Some(prev_bat) = last_battery {
                        // Only trigger popup when charger is plugged in or unplugged
                        if prev_bat.charging != info.charging {
                            let _ = app.emit("hud://battery", info);
                        }
                    }
                    last_battery = Some(info);
                }
            }
        }
    });
}

// ── Focus / Do Not Disturb ────────────────────────────────────────────────────

const WNF_QUIET_HOURS: u64 = 0x0D83_063E_A3BF_1C75;

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtQueryWnfStateData(state: *const u64, type_id: *const c_void, scope: *const c_void, stamp: *mut u32, buffer: *mut c_void, size: *mut u32) -> i32;
    fn NtUpdateWnfStateData(state: *const u64, buffer: *const c_void, length: u32, type_id: *const c_void, scope: *const c_void, matching_stamp: u32, check_stamp: u32) -> i32;
}

/// 0 = off, 1 = priority only, 2 = alarms only.
fn dnd_profile() -> Option<u32> {
    let (mut stamp, mut value, mut size) = (0u32, 0u32, 4u32);
    let status = unsafe { NtQueryWnfStateData(&WNF_QUIET_HOURS, std::ptr::null(), std::ptr::null(), &mut stamp, (&mut value as *mut u32).cast(), &mut size) };
    (status >= 0).then_some(if size == 0 { 0 } else { value })
}

fn set_dnd(on: bool) -> Result<(), String> {
    let value: u32 = if on { 1 } else { 0 };
    let status = unsafe { NtUpdateWnfStateData(&WNF_QUIET_HOURS, (&value as *const u32).cast(), 4, std::ptr::null(), std::ptr::null(), 0, 0) };
    if status >= 0 { Ok(()) } else { Err(format!("Nicht stören ließ sich nicht schalten ({status:#x})")) }
}

fn sessions() -> Option<FocusSessionManager> {
    FocusSessionManager::IsSupported().ok().filter(|&s| s).and_then(|_| FocusSessionManager::GetDefault().ok())
}

fn read_focus() -> Focus {
    let dnd = dnd_profile().is_some_and(|p| p != 0);
    match sessions() {
        Some(m) => Focus { active: m.IsFocusActive().unwrap_or(false) || dnd, kind: "focus" },
        None => Focus { active: dnd, kind: "dnd" },
    }
}

#[tauri::command]
pub async fn focus_get() -> Focus {
    tauri::async_runtime::spawn_blocking(read_focus).await.unwrap_or(Focus { active: false, kind: "dnd" })
}

#[tauri::command]
pub async fn focus_set(active: bool) -> Result<Focus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = sessions();
        if active {
            // Prefer a focus session; if that fails, at least Do Not Disturb.
            if manager.as_ref().and_then(|m| m.TryStartFocusSession().ok()).is_none() {
                set_dnd(true)?;
            }
        } else {
            if let Some(m) = &manager {
                let _ = m.DeactivateFocus();
            }
            if dnd_profile().is_some_and(|p| p != 0) {
                set_dnd(false)?;
            }
        }
        Ok(read_focus())
    })
    .await
    .map_err(|e| e.to_string())?
}
