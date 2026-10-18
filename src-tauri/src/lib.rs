use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

// ---------------------------------------------------------------------------
// Testversion
// Wird nur aktiv, wenn beim Bauen ECM_TRIAL_DAYS gesetzt ist. Dann läuft die App
// ab dem ersten Start so viele Tage, höchstens aber bis ECM_TRIAL_CAP
// (Unix-Zeit, vom Build-Workflow gesetzt). Danach kann nur noch exportiert werden.
// Zurückgestellte Systemuhr oder eine veränderte Statusdatei sperren ebenfalls.
// ---------------------------------------------------------------------------
const TRIAL_DAYS: Option<&str> = option_env!("ECM_TRIAL_DAYS");
const TRIAL_CAP: Option<&str> = option_env!("ECM_TRIAL_CAP");
const TRIAL_CONTACT: Option<&str> = option_env!("ECM_TRIAL_CONTACT");
const TRIAL_SALT: &str = "ecm-audit/deiss-it/2026";
const CLOCK_TOLERANCE: i64 = 6 * 3600;

#[derive(serde::Serialize, Clone)]
struct License {
  trial: bool,
  expired: bool,
  tampered: bool,
  expires: i64,
  contact: String,
}

fn now_secs() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs() as i64)
    .unwrap_or(0)
}

// FNV-1a, reicht als Prüfsumme gegen Herumeditieren der Statusdatei
fn checksum(text: &str) -> u64 {
  let mut h: u64 = 0xcbf29ce484222325;
  for b in TRIAL_SALT.bytes().chain(text.bytes()) {
    h ^= b as u64;
    h = h.wrapping_mul(0x100000001b3);
  }
  h
}

fn license(app: &tauri::AppHandle) -> License {
  let contact = TRIAL_CONTACT.unwrap_or("").to_string();
  let days = match TRIAL_DAYS.and_then(|d| d.trim().parse::<i64>().ok()) {
    Some(d) if d > 0 => d,
    _ => {
      return License { trial: false, expired: false, tampered: false, expires: 0, contact };
    }
  };
  let cap = TRIAL_CAP.and_then(|c| c.trim().parse::<i64>().ok()).unwrap_or(i64::MAX);
  let now = now_secs();

  let file = match app.path().app_data_dir() {
    Ok(dir) => {
      let _ = fs::create_dir_all(&dir);
      dir.join("lizenz.dat")
    }
    Err(_) => {
      return License { trial: true, expired: true, tampered: true, expires: 0, contact };
    }
  };

  let mut tampered = false;
  let (first, last) = match fs::read_to_string(&file) {
    Ok(text) => {
      let parts: Vec<&str> = text.trim().split('|').collect();
      let parsed = if parts.len() == 3 {
        let f = parts[0].parse::<i64>().ok();
        let l = parts[1].parse::<i64>().ok();
        let c = parts[2].parse::<u64>().ok();
        match (f, l, c) {
          (Some(f), Some(l), Some(c)) if c == checksum(&format!("{f}|{l}")) => Some((f, l)),
          _ => None,
        }
      } else {
        None
      };
      match parsed {
        Some(v) => v,
        None => {
          tampered = true;
          (0, now)
        }
      }
    }
    Err(_) => (now, now),
  };

  if now + CLOCK_TOLERANCE < last {
    tampered = true;
  }

  if !tampered {
    let new_last = last.max(now);
    let body = format!("{first}|{new_last}");
    let _ = fs::write(&file, format!("{body}|{}", checksum(&body)));
  }

  let expires = (first + days * 86400).min(cap);
  License { trial: true, expired: tampered || now >= expires, tampered, expires, contact }
}

fn ensure_licensed(app: &tauri::AppHandle) -> Result<(), String> {
  if license(app).expired {
    Err("Die Testversion ist abgelaufen. Speichern ist nicht mehr möglich.".to_string())
  } else {
    Ok(())
  }
}

#[tauri::command]
fn license_status(app: tauri::AppHandle) -> License {
  license(&app)
}

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
  ensure_licensed(&app)?;
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
  ensure_licensed(&app)?;
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
      data_dir,
      license_status
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
