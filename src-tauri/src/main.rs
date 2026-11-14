// Never show a console window on Windows
#![windows_subsystem = "windows"]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // Antigravity & AI Agent lifecycle hook runner
    if args.len() >= 3 && args[1] == "--agent-hook" {
        std::process::exit(notch_lib::agent_run_hook_client(&args[2]));
    }

    // Elevated helper call from "Unlock FPS": grant rights and exit. Must run
    // before run(), otherwise single-instance would hand it to the running app.
    if let [_, flag, sid] = args.as_slice() {
        if flag == "--fps-unlock" {
            std::process::exit(notch_lib::fps_elevated_unlock(sid));
        }
    }
    notch_lib::run()
}
