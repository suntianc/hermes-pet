/**
 * Shared application state for coordinating close-to-tray behavior.
 *
 * When the user closes the window, we intercept the `close` event and
 * hide the window instead of destroying it. The only way to truly quit
 * is via the tray menu's "Quit" item, which sets `isQuitting = true`
 * before calling `app.quit()`.
 *
 * This module is intentionally minimal to avoid circular dependencies
 * between main.ts, window.ts, tray.ts, and ipc.ts.
 */

let isQuitting = false;

export function getIsQuitting(): boolean {
  return isQuitting;
}

export function setIsQuitting(value: boolean): void {
  isQuitting = value;
}
