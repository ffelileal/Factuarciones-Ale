import { invoke } from '@tauri-apps/api/core';

/**
 * Puente seguro hacia Windows Credential Manager (DPAPI / keyring) a través de comandos nativos Rust de Tauri 2.
 *
 * REGLA ARQUITECTÓNICA ESTRICTA (Subfase 2C):
 * - Prohibido almacenar tokens de sesión en `window.localStorage`, `window.sessionStorage` o `document.cookie`.
 * - En entorno nativo Tauri 2, el token se persiste cifrado en el almacén de credenciales del sistema operativo
 *   (`save_session_token`, `get_session_token`, `clear_session_token`).
 * - Si se ejecuta en un navegador de desarrollo sin el host Rust activo, el token se mantiene únicamente
 *   en una variable privada en memoria volátil de cierre léxico (jamás en Web Storage).
 */
let volatileMemoryToken: string | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function saveSessionTokenSecure(token: string): Promise<void> {
  volatileMemoryToken = token;
  if (isTauriRuntime()) {
    await invoke('save_session_token', { token });
  }
}

export async function getSessionTokenSecure(): Promise<string | null> {
  if (isTauriRuntime()) {
    try {
      const token = await invoke<string | null>('get_session_token');
      volatileMemoryToken = token;
      return token;
    } catch {
      return volatileMemoryToken;
    }
  }
  return volatileMemoryToken;
}

export async function clearSessionTokenSecure(): Promise<void> {
  volatileMemoryToken = null;
  if (isTauriRuntime()) {
    await invoke('clear_session_token');
  }
}
