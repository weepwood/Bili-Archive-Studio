#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{net::TcpStream, process::{Child, Command, Stdio}, sync::Mutex, time::Duration};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct Backend(Mutex<Child>);

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let resources = app.path().resource_dir()?;
            let node = resources.join("runtime").join("node.exe");
            let server = resources.join("app").join("server.js");
            let data = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data)?;
            let mut command = Command::new(&node);
            command
                .arg(&server)
                .arg("--data")
                .arg(&data)
                .arg("--port")
                .arg("18765")
                .current_dir(resources.join("app"))
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            let child = command.spawn().map_err(|e| {
                std::io::Error::new(e.kind(), format!("内置本地服务无法启动：{e}"))
            })?;
            app.manage(Backend(Mutex::new(child)));
            let address = "127.0.0.1:18765";
            let mut ready = false;
            for _ in 0..80 {
                if TcpStream::connect_timeout(&address.parse()?, Duration::from_millis(120)).is_ok() {
                    ready = true;
                    break;
                }
                std::thread::sleep(Duration::from_millis(125));
            }
            if !ready {
                return Err("本地服务启动超时，请确认 18765 端口未被其他程序占用".into());
            }
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External("http://127.0.0.1:18765/".parse()?)
            )
            .title("Bili Archive Studio")
            .inner_size(1400.0, 900.0)
            .min_inner_size(980.0, 680.0)
            .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("无法初始化桌面客户端")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<Backend>() {
                    if let Ok(mut child) = state.0.lock() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}
