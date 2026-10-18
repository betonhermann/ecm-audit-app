use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// Audits liegen als JSON-Dateien im App-Datenordner:
//   Windows: %APPDATA%\de.deiss-it.ecm-audit\audits\<id>.json
// Gelöschte Audits wandern nach audits\papierkorb\ statt endgültig zu verschwinden.

fn audits_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| e.to_string())?
    .join("audits");
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir)
}

fn check_id(id: &str) -> Result<(), String> {
  let ok = !id.is_empty()
    && id.len() <= 64
    && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
  if ok { Ok(()) } else { Err(format!("Ungültige Audit-ID: {id}")) }
}

fn clean_filename(name: &str) -> String {
  let cleaned: String = name
    .chars()
    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == ' ' { c } else { '_' })
    .collect();
  let trimmed = cleaned.trim().trim_start_matches('.');
  if trimmed.is_empty() { "export.json".to_string() } else { trimmed.to_string() }
}

#[tauri::command]
fn list_audits(app: tauri::AppHandle) -> Result<Vec<String>, String> {
  let dir = audits_dir(&app)?;
  let mut out = Vec::new();
  for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
    let path = entry.map_err(|e| e.to_string())?.path();
    if path.extension().and_then(|e| e.to_str()) == Some("json") {
      if let Ok(text) = fs::read_to_string(&path) {
        out.push(text);
      }
    }
  }
  Ok(out)
}

#[tauri::command]
fn save_audit(app: tauri::AppHandle, id: String, content: String) -> Result<(), String> {
  check_id(&id)?;
  let dir = audits_dir(&app)?;
  let tmp = dir.join(format!("{id}.json.tmp"));
  let target = dir.join(format!("{id}.json"));
  // Erst in temporäre Datei schreiben, dann umbenennen: kein halbes JSON bei Absturz
  fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;
  fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn delete_audit(app: tauri::AppHandle, id: String) -> Result<(), String> {
  check_id(&id)?;
  let dir = audits_dir(&app)?;
  let bin = dir.join("papierkorb");
  fs::create_dir_all(&bin).map_err(|e| e.to_string())?;
  let src = dir.join(format!("{id}.json"));
  if src.exists() {
    fs::rename(&src, bin.join(format!("{id}.json"))).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn export_file(app: tauri::AppHandle, filename: String, content: String) -> Result<String, String> {
  let dir = app.path().download_dir().map_err(|e| e.to_string())?;
  let name = clean_filename(&filename);
  let mut target = dir.join(&name);
  // Vorhandene Datei nicht überschreiben: name (2).json, name (3).json ...
  let (stem, ext) = match name.rsplit_once('.') {
    Some((s, e)) => (s.to_string(), format!(".{e}")),
    None => (name.clone(), String::new()),
  };
  let mut n = 2;
  while target.exists() {
    target = dir.join(format!("{stem} ({n}){ext}"));
    n += 1;
  }
  fs::write(&target, content.as_bytes()).map_err(|e| e.to_string())?;
  Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn data_dir(app: tauri::AppHandle) -> Result<String, String> {
  Ok(audits_dir(&app)?.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      list_audits,
      save_audit,
      delete_audit,
      export_file,
      data_dir
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
