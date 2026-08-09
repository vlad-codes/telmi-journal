use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::process::CommandEvent;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

struct BackendProcess(Mutex<Option<CommandChild>>);
struct OllamaProcess(Mutex<Option<std::process::Child>>);

fn find_ollama_binary() -> Option<String> {
    let mut candidates = vec![
        std::path::PathBuf::from("/usr/local/bin/ollama"),
        std::path::PathBuf::from("/opt/homebrew/bin/ollama"),
        std::path::PathBuf::from("/opt/local/bin/ollama"),
    ];

    #[cfg(target_os = "windows")]
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            std::path::PathBuf::from(local_app_data)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe"),
        );
    }

    if let Some(path) = std::env::var_os("PATH") {
        let executable = if cfg!(target_os = "windows") {
            "ollama.exe"
        } else {
            "ollama"
        };
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join(executable)));
    }

    candidates
        .into_iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|p| p.to_string_lossy().into_owned())
}

fn ollama_already_running() -> bool {
    std::net::TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse().unwrap(),
        std::time::Duration::from_millis(300),
    )
    .is_ok()
}

#[tauri::command]
fn check_ollama_installed() -> bool {
    find_ollama_binary().is_some()
}

#[tauri::command]
fn quit_app(backend: tauri::State<BackendProcess>, ollama: tauri::State<OllamaProcess>) {
    if let Ok(mut guard) = backend.0.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
    if let Ok(mut guard) = ollama.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![quit_app, check_ollama_installed])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // In a release build we spawn the bundled Python backend (sidecar)
            // and point it at the app's PRIVATE data dir
            // (~/Library/Application Support/com.telmi.desktop/). In dev
            // (`tauri dev`) we deliberately DON'T spawn it — you run
            // `uvicorn api:app` manually instead, which defaults its data dir to
            // the repo folder. That keeps personal data (installed app) and test
            // data (dev) fully separate, with no chance of `tauri dev` touching
            // your real entries.
            #[cfg(not(debug_assertions))]
            {
                let data_dir = app.path().app_data_dir()?;
                std::fs::create_dir_all(&data_dir)?;

                let sidecar = app.shell().sidecar("telmi-backend")?;
                let (mut rx, child) = sidecar
                    .env("TELMI_DATA_DIR", data_dir.to_string_lossy().as_ref())
                    .spawn()?;

                // Drain the sidecar's stdout/stderr in a background task so the
                // pipe never blocks and we can see output in the terminal.
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                print!("[sidecar] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                eprint!("[sidecar] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(payload) => {
                                eprintln!(
                                    "[sidecar] process terminated — code: {:?}, signal: {:?}",
                                    payload.code, payload.signal
                                );
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                app.manage(BackendProcess(Mutex::new(Some(child))));
            }

            // Dev build: no bundled backend — rely on a manually started
            // `uvicorn api:app` (repo-local data). Manage an empty handle so
            // `quit_app` still works.
            #[cfg(debug_assertions)]
            {
                app.manage(BackendProcess(Mutex::new(None)));
            }

            // Auto-start Ollama if installed but not already running
            let ollama_child: Option<std::process::Child> =
                if let Some(binary) = find_ollama_binary() {
                    if !ollama_already_running() {
                        std::process::Command::new(&binary)
                            .arg("serve")
                            // Keep Telmi's managed Ollama server local-only even
                            // when the parent environment sets OLLAMA_HOST to a
                            // wildcard bind address such as 0.0.0.0.
                            .env("OLLAMA_HOST", "127.0.0.1:11434")
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .spawn()
                            .ok()
                    } else {
                        None
                    }
                } else {
                    None
                };
            app.manage(OllamaProcess(Mutex::new(ollama_child)));

            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                if let Some(win) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(&win, NSVisualEffectMaterial::Sidebar, None, None);
                }
            }

            Ok(())
        })
        .on_window_event(|_window, _event| {})
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
