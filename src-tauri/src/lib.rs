pub mod agent;
pub mod agent_chat;
pub mod companion;
mod companion_auth;
pub mod opencode_api;
pub mod ai;
mod audio;
mod clipboard;
mod controls;
pub mod convert;
mod discord;
mod display;
mod documents;
mod drop;
mod fps;
mod hit_test;
mod media;
mod memory;
mod mixer;
mod privacy;
mod settings_store;
pub mod secrets;
mod system;
mod trading;
pub mod usage;
mod vault;
pub mod whatsapp;

use std::sync::Mutex;

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

/// Opens/closes the notch from anywhere. Ctrl+Alt = AltGr on German keyboards;
/// AltGr+Space types nothing, so there's no conflict.
const SHORTCUT_LABEL: &str = "Strg+Alt+Leertaste";

/// For main.rs: elevated "Unlock FPS" call (see fps::fps_unlock).
pub fn fps_elevated_unlock(sid: &str) -> i32 {
    fps::elevated_unlock(sid)
}

/// For main.rs: Antigravity/Agent hook CLI runner.
pub fn agent_run_hook_client(event_type: &str) -> i32 {
    agent::run_hook_client(event_type)
}

pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);

    tauri::Builder::default()
        // A second launch doesn't open a second notch.
        .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        // Updates: signed installers from GitHub, only on click in the settings.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, pressed, event| {
                    if pressed == &shortcut && event.state() == ShortcutState::Pressed {
                        let _ = app.emit("notch://shortcut", ());
                    }
                })
                .build(),
        )
        .manage(hit_test::HitState::default())
        .manage(media::MediaState::default())
        .manage(mixer::MixerState::default())
        .manage(clipboard::ClipboardState::default())
        .manage(FocusState::default())
        .manage(TrayItems::default())
        .manage(audio::AudioState::default())
        .manage(ai::AiState::default())
        .manage(trading::TradingState::default())
        .manage(usage::UsageState::default())
        .manage(system::SystemState::default())
        .manage(display::DisplayState::default())
        .manage(discord::DiscordState::default())
        .manage(vault::VaultState::default())
        .manage(agent::AgentState::default())
        .invoke_handler(tauri::generate_handler![
            hit_test::set_hit_rect,
            hit_test::set_pinned,
            hit_test::set_passthrough,
            media::media_get,
            media::media_control,
            memory::memory_low,
            clipboard::clipboard_list,
            clipboard::clipboard_mode,
            clipboard::clipboard_copy,
            clipboard::clipboard_delete,
            clipboard::clipboard_clear,
            clipboard::clipboard_preview,
            clipboard::clipboard_paste_files,
            keyboard_focus,
            audio::audio_levels,
            ai::ai_chat,
            ai::ai_cancel,
            secrets::secret_set,
            secrets::secret_delete,
            secrets::secret_has,
            trading::trading_fetch,
            usage::usage_fetch,
            system::system_stats,
            convert::convert_probe,
            convert::convert_files,
            convert::reveal_file,
            convert::open_path,
            convert::copy_files,
            convert::file_preview,
            display::display_monitors,
            display::display_apply,
            fps::gaming_fps,
            fps::fps_unlock,
            controls::volume_get,
            controls::volume_set,
            mixer::mixer_list,
            mixer::mixer_set,
            mixer::media_open_source,
            tray_focus,
            tray_mode,
            controls::focus_get,
            controls::focus_set,
            privacy::privacy_state,
            discord::discord_configure,
            discord::discord_action,
            discord::discord_state,
            vault::vault_status,
            vault::vault_setup,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_save_password,
            vault::vault_add_totp,
            vault::vault_delete,
            vault::vault_reveal,
            vault::vault_copy,
            vault::vault_codes,
            vault::vault_options,
            vault::vault_change_pin,
            vault::vault_reset,
            vault::vault_scan,
            vault::vault_hello_supported,
            vault::vault_hello_unlock,
            vault::vault_hello_enable,
            vault::vault_hello_disable,
            set_language,
            set_companion_chat,
            set_companion_opencode_chat,
            set_companion_outfit,
            autostart_get,
            autostart_set,
            whatsapp::open_url,
            whatsapp::whatsapp_open_web,
            whatsapp::whatsapp_close_web,
            whatsapp::whatsapp_web_status,
            agent::agent_get_status,
            agent::agent_get_git_diff,
            agent::agent_respond_approval,
            agent::agent_install_hooks,
            agent::agent_uninstall_hooks,
            agent::agent_is_hook_installed,
            agent::agent_install_opencode_hooks,
            agent::agent_uninstall_opencode_hooks,
            agent::agent_is_opencode_hook_installed,
            agent::agent_set_ask_permissions,
            agent_chat::agent_get_available_models,
            agent_chat::agent_list_conversations,
            agent_chat::agent_get_conversation_messages,
            agent_chat::agent_delete_conversation,
            agent_chat::agent_send_chat,
            agent_chat::agent_save_temp_attachment,
            companion::agent_get_companion_info,
            companion::companion_versions,
            companion_auth::companion_token_status,
            companion_auth::companion_token_create,
            companion_auth::companion_token_clear,
            opencode_api::opencode_status,
            opencode_api::opencode_sessions,
            opencode_api::opencode_session_messages,
            opencode_api::opencode_agents,
            opencode_api::opencode_models,
            opencode_api::opencode_new_session,
            opencode_api::opencode_switch_agent,
            opencode_api::opencode_switch_model,
            opencode_api::opencode_prompt,
            opencode_api::opencode_interrupt,
            settings_store::settings_load,
            settings_store::settings_save,
        ])
        .setup(move |app| {
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "notch")
                .expect("window 'notch' missing");
            let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), config)?;
            #[cfg(windows)]
            {
                let profile = app.path().app_local_data_dir()?.join("EBWebView-v2");
                builder = builder.data_directory(profile);
            }
            // Seed the durable settings copy before the bundle runs. This is what
            // makes an update that replaces the WebView profile look seamless.
            if let Some((raw, modified)) = settings_store::read_settings(app.handle()) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
                    builder = builder.initialization_script(format!(
                        "window.__NOTCH_SETTINGS__={};window.__NOTCH_SETTINGS_SAVED_AT__={};",
                        value, modified
                    ));
                }
            }
            let window = builder.build()?;
            display::place(&window, &app.state::<display::DisplayState>())?;

            #[cfg(windows)]
            if let Ok(hwnd) = window.hwnd() {
                use windows::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongW, SetWindowLongW, GWL_EXSTYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
                };
                unsafe {
                    let ex_style = GetWindowLongW(HWND(hwnd.0 as _), GWL_EXSTYLE);
                    let new_ex_style = (ex_style | WS_EX_TOOLWINDOW.0 as i32) & !(WS_EX_APPWINDOW.0 as i32);
                    SetWindowLongW(HWND(hwnd.0 as _), GWL_EXSTYLE, new_ex_style);
                }
            }

            window.show()?;
            let _ = window.set_skip_taskbar(true);
            // Only after show(): this fails on a window that was never shown.
            window.set_ignore_cursor_events(true)?;
            drop::install(&window);
            hit_test::spawn(app.handle().clone(), window.clone());
            display::spawn(app.handle().clone(), window);
            media::spawn(app.handle().clone());
            clipboard::spawn(app.handle().clone());
            audio::spawn(app.handle().clone(), &app.state::<audio::AudioState>());
            controls::spawn(app.handle().clone());
            agent::start_pipe_server(app.handle().clone());
            // Keep an already installed generated plugin current after updates.
            agent::sync_opencode_plugin();
            companion::start_server(app.handle().clone());

            // If another app owns the shortcut, the notch still runs, just without it.
            let _ = app.global_shortcut().register(shortcut);
            enable_autostart_once(app.handle());
            build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start narra-notch");
}

/// Window that was in the foreground before the shortcut opened the notch.
#[derive(Default)]
struct FocusState(Mutex<isize>);

/// Opened via shortcut → take focus (for Esc/typing).
/// Closed → give focus back to the previous app, otherwise typing goes nowhere.
#[tauri::command]
fn keyboard_focus(focus: bool, window: WebviewWindow, state: State<'_, FocusState>) {
    let Ok(own) = window.hwnd() else { return };
    let own = own.0 as isize;
    let foreground = unsafe { GetForegroundWindow() }.0 as isize;
    let mut previous = state.0.lock().unwrap();

    if focus {
        if foreground != own {
            *previous = foreground;
        }
        let _ = window.set_focus();
    } else if foreground == own && *previous != 0 {
        let _ = unsafe { SetForegroundWindow(HWND(*previous as *mut _)) };
        *previous = 0;
    }
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn autostart_set(enabled: bool, app: AppHandle) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())
}

/// Enables autostart on the very first launch; after that the tray check and settings decide.
fn enable_autostart_once(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let marker = dir.join("autostart-initialized");
    if marker.exists() {
        return;
    }
    if app.autolaunch().enable().is_ok() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(marker, "");
    }
}

/// Tray items whose text or check state changes at runtime.
struct Tray {
    open: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    mode_normal: CheckMenuItem<tauri::Wry>,
    mode_line: CheckMenuItem<tauri::Wry>,
    focus: CheckMenuItem<tauri::Wry>,
    autostart: CheckMenuItem<tauri::Wry>,
    restart: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
    _tray_icon: tauri::tray::TrayIcon,
}

#[derive(Default)]
struct TrayItems(Mutex<Option<Tray>>);

/// Open (shortcut right-aligned via tab, like Windows menus), settings, notch mode (normal / line), focus mode, autostart, quit.
fn tray_texts(lang: &str) -> [String; 8] {
    if lang == "en" {
        let keys = SHORTCUT_LABEL.replace("Strg", "Ctrl").replace("Leertaste", "Space");
        [
            format!("Open narra-notch\t{keys}"),
            "Settings …".into(),
            "Mode: Normal".into(),
            "Mode: Line".into(),
            "Focus mode".into(),
            "Start with Windows".into(),
            "Restart narra-notch".into(),
            "Quit narra-notch".into(),
        ]
    } else {
        let keys = SHORTCUT_LABEL.replace("Strg", "Ctrl").replace("Leertaste", "Spasi");
        [
            format!("Buka narra-notch\t{keys}"),
            "Pengaturan …".into(),
            "Mode: Normal".into(),
            "Mode: Garis".into(),
            "Mode Fokus".into(),
            "Mulai bersama Windows".into(),
            "Mulai Ulang (Restart)".into(),
            "Keluar dari narra-notch".into(),
        ]
    }
}

#[tauri::command]
fn set_language(lang: String, state: State<'_, TrayItems>) {
    crate::companion::set_companion_language(&lang);
    if let Some(tray) = state.0.lock().unwrap().as_ref() {
        let [a, b, c, d, e, f, r, g] = tray_texts(&lang);
        let _ = tray.open.set_text(a);
        let _ = tray.settings.set_text(b);
        let _ = tray.mode_normal.set_text(c);
        let _ = tray.mode_line.set_text(d);
        let _ = tray.focus.set_text(e);
        let _ = tray.autostart.set_text(f);
        let _ = tray.restart.set_text(r);
        let _ = tray.quit.set_text(g);
    }
}

#[tauri::command]
fn set_companion_chat(enabled: bool) {
    crate::companion::set_companion_chat_enabled(enabled);
}

#[tauri::command]
fn set_companion_opencode_chat(enabled: bool) {
    crate::companion::set_companion_opencode_chat_enabled(enabled);
}

#[tauri::command]
fn set_companion_outfit(outfit: String) {
    crate::companion::set_companion_outfit(&outfit);
}

/// The frontend owns focus mode; the tray check only mirrors it.
#[tauri::command]
fn tray_focus(on: bool, state: State<'_, TrayItems>) {
    if let Some(tray) = state.0.lock().unwrap().as_ref() {
        let _ = tray.focus.set_checked(on);
    }
}

/// The frontend owns notch mode (normal vs line); the tray checks mirror it.
#[tauri::command]
fn tray_mode(mode: String, state: State<'_, TrayItems>) {
    if let Some(tray) = state.0.lock().unwrap().as_ref() {
        let is_normal = mode != "line";
        let _ = tray.mode_normal.set_checked(is_normal);
        let _ = tray.mode_line.set_checked(!is_normal);
    }
}

/// Dark tray menu to match the notch instead of the light default.
/// uxtheme only exports this by ordinal: SetPreferredAppMode = 135, FlushMenuThemes = 136
/// (Windows 10 1903+). If missing, the menu just stays light.
fn dark_menus() {
    use windows::core::{w, PCSTR};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    const FORCE_DARK: i32 = 2;
    unsafe {
        let Ok(uxtheme) = LoadLibraryW(w!("uxtheme.dll")) else { return };
        if let Some(f) = GetProcAddress(uxtheme, PCSTR(135 as *const u8)) {
            let set_preferred_app_mode: extern "system" fn(i32) -> i32 = std::mem::transmute(f);
            set_preferred_app_mode(FORCE_DARK);
        }
        if let Some(f) = GetProcAddress(uxtheme, PCSTR(136 as *const u8)) {
            let flush_menu_themes: extern "system" fn() = std::mem::transmute(f);
            flush_menu_themes();
        }
    }
}

/// Without a taskbar entry, the tray is where you open, configure and quit.
/// Left click opens the notch, right click shows the menu.
fn build_tray(app: &App) -> tauri::Result<()> {
    dark_menus();
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let [open_text, settings_text, normal_text, line_text, focus_text, autostart_text, restart_text, quit_text] = tray_texts("id");
    let open = MenuItem::with_id(app, "open", open_text, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", settings_text, true, None::<&str>)?;
    let mode_normal = CheckMenuItem::with_id(app, "mode_normal", normal_text, true, true, None::<&str>)?;
    let mode_line = CheckMenuItem::with_id(app, "mode_line", line_text, true, false, None::<&str>)?;
    let focus = CheckMenuItem::with_id(app, "focus", focus_text, true, false, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(app, "autostart", autostart_text, true, enabled, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", restart_text, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)?;
    let autostart_item = autostart.clone();
    let focus_item = focus.clone();
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &mode_normal,
            &mode_line,
            &PredefinedMenuItem::separator(app)?,
            &focus,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            &restart,
            &quit,
        ],
    )?;
    let tray_icon = TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("narra-notch")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = tray.app_handle().emit("notch://open", None::<&str>);
            }
        })
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => {
                let _ = app.emit("notch://open", None::<&str>);
            }
            "settings" => {
                let _ = app.emit("notch://open", Some("settings"));
            }
            "mode_normal" => {
                let _ = app.emit("notch://mode-set", "notch");
            }
            "mode_line" => {
                let _ = app.emit("notch://mode-set", "line");
            }
            "restart" => {
                app.restart();
            }
            "quit" => app.exit(0),
            "focus" => {
                // The click already toggled the check; the frontend applies it and mirrors it back.
                let on = focus_item.is_checked().unwrap_or(false);
                let _ = app.emit("notch://focus-set", on);
            }
            "autostart" => {
                // The check item toggles itself on click; read the new state.
                let on = autostart_item.is_checked().unwrap_or(false);
                let manager = app.autolaunch();
                let _ = if on { manager.enable() } else { manager.disable() };
            }
            _ => {}
        })
        .build(app)?;

    *app.state::<TrayItems>().0.lock().unwrap() = Some(Tray {
        open: open.clone(),
        settings: settings.clone(),
        mode_normal: mode_normal.clone(),
        mode_line: mode_line.clone(),
        focus: focus.clone(),
        autostart: autostart.clone(),
        restart: restart.clone(),
        quit: quit.clone(),
        _tray_icon: tray_icon,
    });
    Ok(())
}
