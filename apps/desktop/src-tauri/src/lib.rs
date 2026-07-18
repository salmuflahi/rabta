/// Builds and runs the OmniBus Tauri application.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running OmniBus");
}
