fn main() {
  // Testversion: Laufzeit wird beim Bauen festgelegt (siehe .github/workflows/trial-build.yml)
  println!("cargo:rerun-if-env-changed=ECM_TRIAL_DAYS");
  println!("cargo:rerun-if-env-changed=ECM_TRIAL_CAP");
  println!("cargo:rerun-if-env-changed=ECM_TRIAL_CONTACT");
  tauri_build::build()
}
