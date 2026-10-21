#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

fn main() {
    // H5: suppress obsolete systemd invocations before any store/network I/O.
    // The graphical application will disable the corresponding user units.
    #[cfg(target_os = "linux")]
    if std::env::args().any(|a| a == "--idle-watch" || a == "--background-tick") {
        return;
    }
    if std::env::args().any(|a| a == "--migrate-ai-only") {
        if let Err(e) = tcs_mail_lib::migrate_ai_only() {
            eprintln!("TCS Mail AI migration: {e}");
            std::process::exit(1);
        }
        return;
    }
    if std::env::args().any(|a| a == "--idle-watch") {
        if let Err(e) = tcs_mail_lib::background_idle() {
            eprintln!("TCS Mail IDLE: {e}");
            std::process::exit(1);
        }
        return;
    }
    if std::env::args().any(|a| a == "--background-tick") {
        if let Err(e) = tcs_mail_lib::background_tick() {
            eprintln!("TCS Mail background: {e}");
            std::process::exit(1);
        }
        return;
    }
    tcs_mail_lib::run();
}
