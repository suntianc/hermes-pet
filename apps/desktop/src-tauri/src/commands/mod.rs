pub mod window;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You are running on Tauri 2.", name)
}
