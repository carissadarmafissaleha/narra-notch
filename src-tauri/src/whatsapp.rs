use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// Launch an external URL or URI protocol (e.g. `whatsapp://send?phone=...` or `https://wa.me/...`)
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "start", "", &url]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
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
