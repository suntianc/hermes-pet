mod handlers;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    AppHandle,
};

/// Build and register the system tray icon with complete menu.
/// Called from lib.rs setup closure.
pub fn build_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // ---- Build all menu items ----
    let show_hide = MenuItemBuilder::with_id("show_hide", "Show/Hide")
        .accelerator("CmdOrCtrl+H")
        .build(app)?;

    let always_on_top = MenuItemBuilder::with_id("always_on_top", "Always on Top")
        .accelerator("CmdOrCtrl+T")
        .build(app)?;

    let mouse_passthrough =
        MenuItemBuilder::with_id("mouse_passthrough", "Mouse Passthrough").build(app)?;

    // Size submenu
    let size_small = MenuItemBuilder::with_id("size_small", "Small").build(app)?;
    let size_medium = MenuItemBuilder::with_id("size_medium", "Medium").build(app)?;
    let size_large = MenuItemBuilder::with_id("size_large", "Large").build(app)?;

    let size_submenu = SubmenuBuilder::new(app, "Size")
        .items(&[&size_small, &size_medium, &size_large])
        .build()?;

    let mouse_follow = MenuItemBuilder::with_id("mouse_follow", "Mouse Follow").build(app)?;

    // ---- TTS submenu ----
    let tts_enable = MenuItemBuilder::with_id("tts_enable", "Enable TTS").build(app)?;

    let tts_source_system =
        MenuItemBuilder::with_id("tts_source_system", "System (macOS)").build(app)?;
    let tts_source_local =
        MenuItemBuilder::with_id("tts_source_local", "Local Service").build(app)?;
    let tts_source_cloud =
        MenuItemBuilder::with_id("tts_source_cloud", "Cloud API").build(app)?;

    let tts_source_submenu = SubmenuBuilder::new(app, "Source")
        .items(&[&tts_source_system, &tts_source_local, &tts_source_cloud])
        .build()?;

    let tts_settings = MenuItemBuilder::with_id("tts_settings", "Settings...").build(app)?;

    let tts_submenu = SubmenuBuilder::new(app, "TTS")
        .item(&tts_enable)
        .item(&tts_source_submenu)
        .item(&tts_settings)
        .build()?;

    // ---- Model submenu (dynamic — currently placeholder, populated by Phase 4) ----
    let model_placeholder =
        MenuItemBuilder::with_id("model_placeholder", "(no models)")
            .enabled(false)
            .build(app)?;

    let switch_model_submenu = SubmenuBuilder::new(app, "Switch Model")
        .item(&model_placeholder)
        .build()?;

    let import_model =
        MenuItemBuilder::with_id("import_model", "Import Model...").build(app)?;

    let model_submenu = SubmenuBuilder::new(app, "Model")
        .item(&switch_model_submenu)
        .item(&import_model)
        .build()?;

    // Quit
    let quit = MenuItemBuilder::with_id("quit", "Quit ViviPet")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    // Separator
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;

    // ---- Build full menu ----
    let menu = MenuBuilder::new(app)
        .item(&show_hide)
        .item(&always_on_top)
        .item(&mouse_passthrough)
        .item(&separator)
        .item(&size_submenu)
        .item(&mouse_follow)
        .item(&separator)
        .item(&tts_submenu)
        .item(&separator)
        .item(&model_submenu)
        .item(&separator)
        .item(&quit)
        .build()?;

    // ---- Build TrayIcon ----
    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("ViviPet")
        .show_menu_on_left_click(false)
        .on_menu_event(handlers::on_tray_menu_event)
        .on_tray_icon_event(|tray, event| {
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
        })
        .build(app)?;

    tracing::info!("System tray created");
    Ok(())
}

/// Rebuild model submenu dynamically (called when models change).
/// Placeholder for Phase 4 — in Phase 1 we just log the call.
pub fn refresh_model_menu(_app: &AppHandle, model_names: &[String]) {
    tracing::info!("Model menu refresh requested: {model_names:?}");
    // Phase 4 will implement:
    // 1. Get tray by id
    // 2. Build new submenu items
    // 3. Replace submenu items via set_items()
}

/// Rebuild TTS source submenu (called when TTS config changes).
/// Placeholder for Phase 2.
pub fn refresh_tts_source_menu(_app: &AppHandle) {
    tracing::info!("TTS source menu refresh requested");
    // Phase 2 will implement source radio button checked state
}
