// Speicher: in der Desktop-App über Tauri (JSON-Dateien im App-Datenordner),
// im Browser (Entwicklung/Test) über localStorage.
(function () {
  const tauri = window.__TAURI__ && window.__TAURI__.core;
  const LS_KEY = "ecm-audit-store-v1";

  function lsRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function lsWrite(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch (e) { /* voll oder gesperrt */ }
  }

  window.Store = {
    isDesktop: !!tauri,

    async list() {
      if (tauri) {
        const texts = await tauri.invoke("list_audits");
        const out = [];
        for (const t of texts) {
          try { out.push(JSON.parse(t)); } catch (e) { console.warn("Defekte Auditdatei übersprungen", e); }
        }
        return out;
      }
      return Object.values(lsRead());
    },

    async save(audit) {
      const content = JSON.stringify(audit);
      if (tauri) return tauri.invoke("save_audit", { id: audit.id, content });
      const all = lsRead();
      all[audit.id] = audit;
      lsWrite(all);
    },

    async remove(id) {
      if (tauri) return tauri.invoke("delete_audit", { id });
      const all = lsRead();
      delete all[id];
      lsWrite(all);
    },

    // Liefert den Speicherort als Text zurück (Desktop) oder null (Browser-Download)
    async exportFile(filename, content) {
      if (tauri) return tauri.invoke("export_file", { filename, content });
      const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return null;
    },

    async dataDir() {
      if (tauri) return tauri.invoke("data_dir");
      return "Browser-Speicher (localStorage)";
    },
  };
})();
