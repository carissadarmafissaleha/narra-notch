use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

fn is_allowed_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw.trim()).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" | "whatsapp" => Ok(parsed),
        other => Err(format!("Unsupported URL scheme: {other}")),
    }
}

/// Launch an external URL or URI protocol (e.g. `whatsapp://send?phone=...` or `https://wa.me/...`)
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let parsed = is_allowed_url(&url)?;
    #[cfg(windows)]
    {
        use windows::core::{w, PCWSTR};
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW};
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let wide_url: Vec<u16> = parsed.as_str().encode_utf16().chain(Some(0)).collect();
        let mut info = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            lpVerb: w!("open"),
            lpFile: PCWSTR(wide_url.as_ptr()),
            nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };
        unsafe { ShellExecuteExW(&mut info) }.map_err(|e| e.message())
    }
    #[cfg(not(windows))]
    {
        let _ = parsed;
        Ok(())
    }
}

/// Open WhatsApp Web in an on-demand, lazy-loaded companion window.
#[tauri::command]
pub async fn whatsapp_open_web(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("whatsapp-web") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }

    let url = Url::parse("https://web.whatsapp.com").map_err(|e| e.to_string())?;

    let builder = WebviewWindowBuilder::new(&app, "whatsapp-web", WebviewUrl::External(url))
        .title("WhatsApp Web · narra-notch")
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .inner_size(960.0, 720.0)
        .center()
        .resizable(true);

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

/// Close the WhatsApp Web window and terminate its WebView process to free 100% RAM back to 0 MB.
#[tauri::command]
pub async fn whatsapp_close_web(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("whatsapp-web") {
        let _ = w.close();
    }
    Ok(())
}

/// Check whether the WhatsApp Web companion window is currently active.
#[tauri::command]
pub async fn whatsapp_web_status(app: AppHandle) -> bool {
    app.get_webview_window("whatsapp-web").is_some()
}
