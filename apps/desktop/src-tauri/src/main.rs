#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use keyring::Entry;

const KEYRING_SERVICE: &str = "ar.estudiocontable.payroll.desktop";
const KEYRING_ACCOUNT: &str = "active_session_token";

#[tauri::command]
fn save_session_token(token: String) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_session_token() -> Result<Option<String>, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn clear_session_token() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_session_token,
            get_session_token,
            clear_session_token
        ])
        .run(tauri::generate_context!())
        .expect("Error al iniciar el cliente de escritorio Tauri 2");
}
