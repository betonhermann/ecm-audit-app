(function () {
  const M = window.Model;
  const S = window.Store;

  const state = {
    audits: [],
    audit: null,
    view: "liste",
    filter: "alle",
    saveTimer: null,
    saveStatus: "",
    license: { trial: false, expired: false },
  };

  // ---------- Hilfen ----------
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  // Pfade sind punktgetrennt; Punkte innerhalb eines Schlüssels (z. B. Kapitel "11.2"
  // oder "I.I|10") werden als § geschrieben.
  function enc(key) { return String(key).replace(/\./g, "§"); }
  function splitPath(path) { return path.split(".").map((p) => p.replace(/§/g, ".")); }
  function getPath(obj, path) {
    return splitPath(path).reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, val) {
    const parts = splitPath(path);
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null || typeof o[parts[i]] !== "object") o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = val;
  }

  // Fragetext: Zeilenumbrüche erhalten, Info-Zeilen zurücknehmen
  function richText(t) {
    return esc(t)
      .split("\n")
      .map((line) => (/^\s*\((Info|z\.\s?B\.)/i.test(line) ? '<span class="info">' + line + "</span>" : line))
      .join("<br>");
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }

  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " toast-" + kind : "");
    t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), kind === "error" ? 9000 : 5000);
  }

  function dialog(text, okLabel, danger) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.className = "modal-wrap";
      wrap.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true"><p>' + esc(text) + "</p>" +
        '<div class="modal-actions"><button class="btn" data-r="0">Abbrechen</button>' +
        '<button class="btn ' + (danger ? "btn-danger" : "btn-primary") + '" data-r="1">' + esc(okLabel) + "</button></div></div>";
      document.body.appendChild(wrap);
      const ok = wrap.querySelector('[data-r="1"]');
      ok.focus();
      function close(r) { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(r); }
      function onKey(e) { if (e.key === "Escape") close(false); }
      document.addEventListener("keydown", onKey);
      wrap.addEventListener("click", (e) => {
        const b = e.target.closest("[data-r]");
        if (b) close(b.dataset.r === "1");
        else if (e.target === wrap) close(false);
      });
    });
  }

  // ---------- Speichern ----------
  function touch() {
    if (!state.audit) return;
    state.audit.updated = new Date().toISOString();
    setSaveStatus("Ungespeichert …");
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 500);
  }

  async function saveNow() {
    clearTimeout(state.saveTimer);
    const a = state.audit;
    if (!a) return;
    try {
      await S.save(a);
      const i = state.audits.findIndex((x) => x.id === a.id);
      if (i > -1) state.audits[i] = a; else state.audits.push(a);
      setSaveStatus("Gespeichert " + new Date().toLocaleTimeString("de-DE"));
    } catch (e) {
      setSaveStatus("Nicht gespeichert");
      toast("Speichern fehlgeschlagen: " + (e && e.message ? e.message : e), "error");
    }
  }

  function setSaveStatus(t) {
    state.saveStatus = t;
    const el = $("#save-status");
    if (el) el.textContent = t;
  }

  // ---------- Navigation ----------
  const VIEWS = [
    ["stamm", "Stammdaten"],
    ["check", "Checkliste"],
    ["plan", "Auditplan"],
    ["awp", "AWP"],
    ["bericht", "Auditbericht"],
    ["druck", "Drucken"],
  ];

  function renderSidebar() {
    const a = state.audit;
    const nav = $("#nav");
    if (!a) {
      nav.innerHTML = "";
      $("#audit-head").innerHTML = "";
      return;
    }
    const st = M.stats(a);
    const f = M.findings(a);
    const badge = {
      check: st.total ? st.done + "/" + st.total : "",
      awp: f.abw.length ? String(f.abw.length) : (f.hin.length ? String(f.hin.length) : ""),
    };
    $("#audit-head").innerHTML =
      '<div class="ah-firma">' + esc(a.stamm.firma || "Neues Audit") + "</div>" +
      '<div class="ah-meta">' + esc([M.datumKurz(a.stamm.datum), (M.AUDITARTEN.find((x) => x[0] === a.stamm.auditart) || [, ""])[1]].filter(Boolean).join(", ")) + "</div>";
    nav.innerHTML = VIEWS.map(([id, label]) =>
      '<button class="nav-btn' + (state.view === id ? " active" : "") + '" data-view="' + id + '"' + (state.view === id ? ' aria-current="page"' : "") + ">" +
      "<span>" + label + "</span>" + (badge[id] ? '<span class="nav-badge' + (id === "awp" && f.abw.length ? " warn" : "") + '"' + (id === "awp" ? ' title="' + f.abw.length + " Abweichungen, " + f.hin.length + ' Hinweise"' : "") + ">" + badge[id] + "</span>" : "") +
      "</button>").join("");
    setSaveStatus(state.saveStatus || "");
  }

  function go(view) {
    state.view = view;
    if (state.audit) lsSet("ecm-last-view", view);
    render();
    $("#main").scrollTop = 0;
  }

  function render() {
    if (state.license.expired) return renderLocked();
    renderSidebar();
    $("#btn-liste").classList.toggle("active", state.view === "liste");
    const main = $("#main");
    const fn = {
      liste: viewListe, stamm: viewStamm, check: viewCheck, plan: viewPlan,
      awp: viewAwp, bericht: viewBericht, druck: viewDruck,
    }[state.view];
    main.innerHTML = fn();
    if (state.view === "check") afterCheck();
    if (state.view === "druck") updatePreview();
  }

  // ---------- Auditliste ----------
  function viewListe() {
    const list = state.audits.slice().sort((x, y) => (y.updated || "").localeCompare(x.updated || ""));
    let rows = "";
    for (const a of list) {
      const st = M.stats(a);
      const f = M.findings(a);
      const art = (M.AUDITARTEN.find((x) => x[0] === a.stamm.auditart) || [, "–"])[1];
      rows +=
        '<tr data-open="' + esc(a.id) + '" tabindex="0">' +
        "<td><strong>" + esc(a.stamm.firma || "Ohne Firmennamen") + "</strong><div class=\"muted\">" + esc([a.stamm.plz, a.stamm.ort].filter(Boolean).join(" ")) + "</div></td>" +
        "<td>" + esc(M.datumKurz(a.stamm.datum) || "–") + "</td>" +
        "<td>" + esc(art) + "</td>" +
        '<td><div class="meter"><span style="width:' + (st.total ? Math.round((st.done / st.total) * 100) : 0) + '%"></span></div><div class="muted">' + st.done + " von " + st.total + "</div></td>" +
        "<td>" + (f.abw.length ? '<span class="pill pill-ne">' + f.abw.length + "</span>" : '<span class="muted">0</span>') + "</td>" +
        '<td class="muted">' + esc(new Date(a.updated).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })) + "</td>" +
        '<td class="row-actions">' +
        '<button class="btn btn-small" data-act="folge" data-id="' + esc(a.id) + '" title="Neues Audit mit denselben Stammdaten anlegen">Folgeaudit</button>' +
        '<button class="btn btn-small" data-act="export" data-id="' + esc(a.id) + '">Exportieren</button>' +
        '<button class="btn btn-small btn-ghost-danger" data-act="loeschen" data-id="' + esc(a.id) + '">Löschen</button>' +
        "</td></tr>";
    }
    return (
      '<div class="page">' +
      '<header class="page-head"><div><h1>Audits</h1><p class="lead">' +
      (list.length ? list.length + (list.length === 1 ? " Audit" : " Audits") + " gespeichert." : "Noch keine Audits angelegt.") +
      '</p></div><div class="actions">' +
      '<button class="btn" data-act="import">Audit importieren</button>' +
      '<button class="btn btn-primary" data-act="neu">Neues Audit</button></div></header>' +
      (list.length
        ? '<table class="list"><thead><tr><th>Organisation</th><th>Auditdatum</th><th>Auditart</th><th>Bewertet</th><th>Abw.</th><th>Geändert</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>"
        : '<div class="empty"><p>Lege ein neues Audit an. Danach füllst du die Stammdaten aus, wählst die Kapitel und arbeitest die Checkliste ab. Auditplan, AWP und Auditbericht entstehen daraus.</p><button class="btn btn-primary" data-act="neu">Neues Audit</button></div>') +
      '<p class="muted small" id="datadir"></p>' +
      "</div>"
    );
  }

  async function openAudit(id) {
    const a = state.audits.find((x) => x.id === id);
    if (!a) return;
    await saveNow();
    state.audit = M.normalize(a);
    lsSet("ecm-last-audit", id);
    go("stamm");
  }

  async function createAudit(fromId) {
    await saveNow();
    const a = M.newAudit();
    if (fromId) {
      const src = M.normalize(state.audits.find((x) => x.id === fromId));
      a.stamm = JSON.parse(JSON.stringify(src.stamm));
      a.stamm.datum = "";
      a.stamm.auditart = "";
    }
    state.audit = a;
    state.audits.push(a);
    await saveNow();
    lsSet("ecm-last-audit", a.id);
    go("stamm");
  }

  function fileName(a) {
    const name = (a.stamm.firma || "Audit").replace(/[^\wäöüÄÖÜß\- ]+/g, "").trim().replace(/\s+/g, "_");
    return "ECM_Audit_" + name + "_" + (a.stamm.datum || new Date().toISOString().slice(0, 10)) + ".json";
  }

  async function exportAudit(id) {
    const a = state.audits.find((x) => x.id === id);
    if (!a) return;
    try {
      const where = await S.exportFile(fileName(a), JSON.stringify(a, null, 2));
      toast(where ? "Exportiert nach " + where : "Export gestartet");
    } catch (e) {
      toast("Export fehlgeschlagen: " + (e && e.message ? e.message : e), "error");
    }
  }

  async function deleteAudit(id) {
    const a = state.audits.find((x) => x.id === id);
    if (!a) return;
    const ok = await dialog("Audit „" + (a.stamm.firma || "Ohne Firmennamen") + "“ löschen? Die Datei wird in den Papierkorb-Ordner der App verschoben.", "Löschen", true);
    if (!ok) return;
    try {
      await S.remove(id);
      state.audits = state.audits.filter((x) => x.id !== id);
      if (state.audit && state.audit.id === id) state.audit = null;
      render();
      toast("Audit gelöscht");
    } catch (e) {
      toast("Löschen fehlgeschlagen: " + (e && e.message ? e.message : e), "error");
    }
  }

  function importAudit(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !data.stamm || !data.antworten) throw new Error("Die Datei ist kein Audit-Export dieser App.");
        const a = M.normalize(data);
        if (state.audits.some((x) => x.id === a.id)) {
          const ok = await dialog("Dieses Audit ist schon vorhanden. Als Kopie importieren?", "Als Kopie importieren");
          if (!ok) return;
          a.id = M.newAudit().id;
        }
        a.updated = new Date().toISOString();
        await S.save(a);
        state.audits.push(a);
        render();
        toast("Audit importiert: " + (a.stamm.firma || "Ohne Firmennamen"));
      } catch (e) {
        toast("Import fehlgeschlagen: " + e.message, "error");
      }
    };
    reader.readAsText(file);
  }

  // ---------- Formular-Bausteine ----------
  function field(label, path, opts) {
    opts = opts || {};
    const v = getPath(state.audit, path);
    const id = "f-" + path.replace(/\./g, "-");
    let input;
    if (opts.type === "textarea") {
      input = '<textarea id="' + id + '" data-bind="' + path + '" rows="' + (opts.rows || 3) + '">' + esc(v) + "</textarea>";
    } else {
      input = '<input id="' + id + '" type="' + (opts.type || "text") + '" data-bind="' + path + '" value="' + esc(v) + '"' + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + (opts.list ? ' list="' + opts.list + '"' : "") + ">";
    }
    return '<label class="field' + (opts.wide ? " wide" : "") + '" for="' + id + '"><span>' + esc(label) + "</span>" + input + "</label>";
  }

  function check(label, path, extra) {
    const v = !!getPath(state.audit, path);
    return '<label class="check"><input type="checkbox" data-bind="' + path + '"' + (v ? " checked" : "") + (extra || "") + "><span>" + esc(label) + "</span></label>";
  }

  // ---------- Stammdaten ----------
  function personTable(kind) {
    const list = state.audit.stamm[kind];
    const third = kind === "team" ? ["firma", "Firma"] : ["bemerkung", "Bemerkung"];
    let rows = list.map((p, i) =>
      "<tr>" +
      '<td><input data-bind="stamm.' + kind + "." + i + '.name" value="' + esc(p.name) + '" aria-label="Vorname Nachname" placeholder="Vorname Nachname"></td>' +
      '<td><input data-bind="stamm.' + kind + "." + i + '.funktion" value="' + esc(p.funktion) + '" aria-label="Funktion"' + (kind === "team" ? ' list="dl-funktion"' : "") + "></td>" +
      '<td class="kz" data-kz="' + kind + "." + i + '">' + esc(M.kuerzel(p.name)) + "</td>" +
      '<td><input data-bind="stamm.' + kind + "." + i + "." + third[0] + '" value="' + esc(p[third[0]]) + '" aria-label="' + third[1] + '"></td>' +
      '<td><button class="icon-btn" data-act="person-del" data-kind="' + kind + '" data-i="' + i + '" aria-label="Zeile entfernen" title="Zeile entfernen">×</button></td>' +
      "</tr>").join("");
    return '<table class="grid"><thead><tr><th>Vorname / Nachname</th><th>Funktion</th><th>Kürzel</th><th>' + third[1] + "</th><th></th></tr></thead><tbody>" + rows +
      '</tbody></table><button class="btn btn-small" data-act="person-add" data-kind="' + kind + '">Person hinzufügen</button>';
  }

  function viewStamm() {
    const s = state.audit.stamm;
    const auditart = M.AUDITARTEN.map(([k, l]) =>
      '<label class="radio-card' + (s.auditart === k ? " on" : "") + '"><input type="radio" name="auditart" value="' + k + '" data-act="auditart"' + (s.auditart === k ? " checked" : "") + "><span>" + l + "</span></label>").join("");

    const kapI = M.KAPITEL_I.map(([k, l]) => check(l, "stamm.kapitel." + enc(k), ' data-rerender-nav="1"')).join("");
    const kapII = M.KAPITEL_II.map(([k, l]) => check(l, "stamm.kapitel." + enc(k), ' data-rerender-nav="1"')).join("");
    const kapFn = M.KAPITEL_FN.map(([k, l]) => check(l, "stamm.kapitel." + k, ' data-rerender-nav="1"')).join("");

    const verantw = M.VERANTWORTLICHE.map(([k, l]) => {
      const v = s.verantwortliche[k] || { status: "" };
      return "<tr><td>" + esc(l) + "</td>" +
        ["ja", "nein"].map((x) => '<td class="c"><input type="radio" name="v-' + k + '" data-act="verantw" data-k="' + k + '" value="' + x + '"' + (v.status === x ? " checked" : "") + ' aria-label="' + esc(l) + ": " + x + '"></td>').join("") +
        '<td><input data-bind="stamm.verantwortliche.' + k + '.bem" value="' + esc(v.bem) + '" aria-label="Bemerkung ' + esc(l) + '"></td></tr>';
    }).join("");

    const ft = M.FUNKTIONSTRAEGER.map(([k, l]) =>
      '<div class="ft"><h4>' + esc(l) + '</h4><div class="form-grid three">' +
      field("Name", "stamm.funktionstraeger." + k + ".name") +
      field("Telefonnummer", "stamm.funktionstraeger." + k + ".tel", { type: "tel" }) +
      field("E-Mail-Adresse", "stamm.funktionstraeger." + k + ".mail", { type: "email" }) +
      "</div></div>").join("");

    return (
      '<div class="page">' +
      '<header class="page-head"><div><h1>Stammdaten</h1><p class="lead">Grundlage: Durchführungsverordnung (EU) 2019/779 und Verordnung (EU) Nr. 1078/2012.</p></div></header>' +

      '<section class="panel"><h2>Zu auditierende Organisation</h2><div class="form-grid">' +
      field("Firmenname", "stamm.firma", { wide: true }) + field("Straße", "stamm.strasse") +
      field("Postleitzahl", "stamm.plz", { placeholder: "DE-12345" }) + field("Ort", "stamm.ort") + field("Land", "stamm.land") +
      field("Datum des Audits", "stamm.datum", { type: "date" }) +
      "</div></section>" +

      '<section class="panel"><h2>Auditart</h2><p class="hint">Erst- und Wiederholungsaudit wählen alle Kapitel I und I.I samt CRSC-Zusatzfragen an, das Überwachungsaudit wählt sie ab. Danach kannst du einzelne Kapitel frei ändern.</p>' +
      '<div class="radio-row">' + auditart + "</div></section>" +

      '<section class="panel"><h2>Zu prüfende Bereiche</h2>' +
      '<div class="kap-cols"><div><h3>I Managementfunktion</h3>' + kapI + "</div>" +
      '<div><h3>I.I Anforderungen an den Betrieb</h3>' + kapII + '<h3 class="mt">ECM-Funktionen</h3>' + kapFn +
      '<h3 class="mt">Zusatzfragen</h3>' + check("inkl. der Zusatzfragen der CRSC-Lieferantenüberwachung", "stamm.crsc", ' data-rerender-nav="1"') + "</div></div></section>" +

      '<section class="panel"><h2>Teilnehmer Auditteam</h2>' + personTable("team") + "</section>" +
      '<section class="panel"><h2>Teilnehmer Organisation</h2>' + personTable("org") + "</section>" +

      '<section class="panel"><h2>Leistungsumfang der auditierten Organisation</h2>' +
      '<div class="check-row">' + M.LEISTUNG.map(([k, l]) => check(l, "stamm.leistung." + k)).join("") + "</div>" +
      '<p class="hint">' + esc(M.LEISTUNG_TEXT) + "</p>" +
      '<h3>für</h3><div class="check-cols">' + M.BAUTEILE.map(([k, l]) => check(l, "stamm.bauteile." + k)).join("") + "</div>" +
      '<div class="check-cols mt">' + M.ECM_FUNKTIONEN.map(([k, l]) => check(l, "stamm.ecmFunktion." + k)).join("") + "</div>" +
      '<div class="mt">' + check("Freitext", "stamm.freitextAktiv") + field("", "stamm.freitext", { type: "textarea", rows: 2 }) + "</div></section>" +

      '<section class="panel"><h2>Angaben zum überwachten Unternehmen</h2><div class="form-grid">' +
      field("Homepage", "stamm.homepage") + field("Handelsregisternummer", "stamm.hrnr") + field("USt-IdNr.", "stamm.ustid") +
      field("Versicherungsnachweis (Haftpflicht, Personen-/Sachschäden), Versicherungssumme und Gültigkeitszeitraum", "stamm.versicherung", { type: "textarea", rows: 2, wide: true }) +
      "</div><h3>Firmenprofil</h3><div class=\"form-grid\">" +
      field("Geschäftszweck", "stamm.geschaeftszweck", { wide: true }) + field("Gründungsjahr", "stamm.gruendungsjahr") + field("Anzahl der Mitarbeiter", "stamm.mitarbeiter") +
      "</div></section>" +

      '<section class="panel"><h2>Funktionsträger und Zuständigkeiten</h2>' + ft + "</section>" +

      '<section class="panel"><h2>Verantwortliche Personen</h2><table class="grid verantw"><thead><tr><th>Funktion</th><th class="c">ja</th><th class="c">nein</th><th>Bemerkungen / verantwortliche Person(en)</th></tr></thead><tbody>' + verantw + "</tbody></table></section>" +
      '<datalist id="dl-funktion"><option value="Auditor"><option value="Fachexperte"><option value="Hospitant"></datalist>' +
      "</div>"
    );
  }

  // ---------- Checkliste ----------
  function rateButtons(key, r) {
    return '<div class="rate" role="radiogroup" aria-label="Bewertung">' +
      M.RATINGS.map(([k, short, long], i) =>
        '<button type="button" class="rb rb-' + k + (r === k ? " on" : "") + '" role="radio" aria-checked="' + (r === k) + '" data-rate="' + k + '" data-key="' + key + '" title="' + long + " (Taste " + (i + 1) + ')">' + short + "</button>").join("") +
      "</div>";
  }

  function questionRow(bl, it) {
    const key = M.qKey(bl.id, it.id);
    const a = M.answer(state.audit, key);
    const showAbw = a.r === "ne" || a.abw;
    const showHin = !!a.hin;
    return (
      '<div class="q' + (a.r ? " r-" + a.r : "") + '" data-q="' + key + '" tabindex="0">' +
      '<div class="q-id">' + esc(it.id) + (it.crsc ? '<span class="tag">CRSC</span>' : "") + "</div>" +
      '<div class="q-body"><div class="q-text">' + richText(it.text) + "</div>" +
      '<div class="q-notes">' +
      '<label class="note note-abw' + (showAbw ? "" : " hidden") + (a.r === "ne" && !a.abw.trim() ? " missing" : "") + '"><span>Abweichung / Feststellung</span><textarea rows="2" data-ans="abw" data-key="' + key + '">' + esc(a.abw) + "</textarea></label>" +
      '<label class="note note-hin' + (showHin ? "" : " hidden") + '"><span>Hinweis</span><textarea rows="2" data-ans="hin" data-key="' + key + '">' + esc(a.hin) + "</textarea></label>" +
      '<button type="button" class="link-btn' + (showHin ? " hidden" : "") + '" data-act="add-hin" data-key="' + key + '">Hinweis hinzufügen</button>' +
      "</div></div>" +
      rateButtons(key, a.r) +
      "</div>"
    );
  }

  function sectionStats(bl, s) {
    let t = 0, d = 0, ne = 0;
    s.items.forEach((it) => {
      if (it.t !== "q") return;
      t++;
      const r = M.answer(state.audit, M.qKey(bl.id, it.id)).r;
      if (r) d++;
      if (r === "ne") ne++;
    });
    return { t, d, ne };
  }

  function viewCheck() {
    const a = state.audit;
    const struct = M.structure(a);
    if (!struct.length) {
      return '<div class="page"><header class="page-head"><div><h1>Checkliste</h1></div></header><div class="empty"><p>Es sind noch keine Kapitel ausgewählt. Wähle in den Stammdaten die Auditart oder einzelne Kapitel aus.</p><button class="btn btn-primary" data-view="stamm">Zu den Stammdaten</button></div></div>';
    }
    let toc = "", body = "";
    for (const bl of struct) {
      toc += '<div class="toc-block">' + esc(bl.id) + "</div>";
      body += '<div class="block-head" id="blk-' + esc(bl.id) + '"><span class="block-id">' + esc(bl.id) + "</span><h2>" + esc(bl.title) + "</h2></div>";
      bl.desc.forEach((d) => (body += '<p class="block-desc">' + richText(d.text) + "</p>"));
      for (const s of bl.sections) {
        const sid = "sec-" + (bl.id + "-" + s.id).replace(/\./g, "_");
        const ss = sectionStats(bl, s);
        toc += '<a href="#' + sid + '" data-toc="' + sid + '"><span>' + esc(s.id) + " " + esc(s.title) + '</span><span class="toc-count' + (ss.d === ss.t ? " done" : "") + '">' + ss.d + "/" + ss.t + "</span></a>";
        body += '<section class="sec" id="' + sid + '"><h3><span class="sec-id">' + esc(s.id) + "</span>" + esc(s.title) + "</h3>";
        for (const it of s.items) {
          if (it.t === "q") body += questionRow(bl, it);
          else if (it.t === "sub") body += '<h4 class="sub">' + esc(it.id) + " " + esc(it.text) + "</h4>";
          else if (it.t === "crsc") body += '<div class="crsc-head">' + richText(it.text) + "</div>";
          else if (it.t === "hint") body += '<details class="aud-hint"><summary>Hinweise für den Auditor</summary><div>' + richText(it.text) + "</div></details>";
          else body += '<div class="lead-in"><span class="q-id">' + esc(it.id) + "</span><div>" + richText(it.text) + "</div></div>";
        }
        if (s.evidence) {
          const k = M.sKey(bl.id, s.id);
          body += '<label class="evidence"><span>Nachweise / Bemerkungen</span><textarea rows="3" data-bind="nachweise.' + enc(k) + '">' + esc(a.nachweise[k] || "") + "</textarea></label>";
        }
        body += "</section>";
      }
    }
    const st = M.stats(a);
    const filters = [["alle", "Alle"], ["offen", "Offen"], ["ne", "Abweichungen"], ["hin", "Mit Hinweis"]];
    return (
      '<div class="check-layout">' +
      '<aside class="toc" aria-label="Kapitel">' + toc + "</aside>" +
      '<div class="check-main">' +
      '<div class="check-bar"><div class="progress" title="' + st.done + " von " + st.total + ' bewertet">' +
      ["e", "ne", "ng", "nz"].map((k) => '<span class="pb-' + k + '" style="width:' + (st.total ? (st.by[k] / st.total) * 100 : 0) + '%"></span>').join("") +
      '</div><div class="check-count"><strong>' + st.done + "</strong> von " + st.total + " bewertet</div>" +
      '<div class="seg" role="group" aria-label="Filter">' + filters.map(([k, l]) => '<button class="' + (state.filter === k ? "on" : "") + '" data-filter="' + k + '">' + l + "</button>").join("") + "</div>" +
      '<div class="legend">' + M.RATINGS.map(([k, s, l]) => '<span><span class="lg lg-' + k + '">' + s + "</span> " + l + "</span>").join("") + "</div>" +
      "</div>" +
      '<div class="check-body filter-' + state.filter + '">' + body + "</div>" +
      '<p class="muted small kb">Tastatur: Frage anklicken, dann 1 = e., 2 = n.e., 3 = n.g., 4 = n.z., 0 = zurücksetzen. Pfeiltasten wechseln die Frage.</p>' +
      "</div></div>"
    );
  }

  function afterCheck() {
    applyFilterMarks();
  }

  function applyFilterMarks() {
    $all(".q").forEach((q) => {
      const a = M.answer(state.audit, q.dataset.q);
      q.classList.toggle("is-open", !a.r);
      q.classList.toggle("has-hin", !!a.hin.trim());
    });
  }

  function refreshCheckBar() {
    const st = M.stats(state.audit);
    const bar = $(".check-bar");
    if (!bar) return;
    $all(".progress span", bar).forEach((sp) => {
      const k = sp.className.replace("pb-", "");
      sp.style.width = (st.total ? (st.by[k] / st.total) * 100 : 0) + "%";
    });
    $(".check-count", bar).innerHTML = "<strong>" + st.done + "</strong> von " + st.total + " bewertet";
    // Kapitelzähler
    for (const bl of M.structure(state.audit)) {
      for (const s of bl.sections) {
        const sid = "sec-" + (bl.id + "-" + s.id).replace(/\./g, "_");
        const el = $('[data-toc="' + sid + '"] .toc-count');
        if (el) {
          const ss = sectionStats(bl, s);
          el.textContent = ss.d + "/" + ss.t;
          el.classList.toggle("done", ss.d === ss.t);
        }
      }
    }
    renderSidebar();
  }

  function setRating(key, r) {
    const a = state.audit;
    const cur = M.answer(a, key);
    const next = Object.assign({}, cur, { r: cur.r === r ? "" : r });
    a.antworten[key] = next;
    const row = $('[data-q="' + key + '"]');
    if (row) {
      row.className = "q" + (next.r ? " r-" + next.r : "") + (row.classList.contains("focus") ? " focus" : "");
      $all(".rb", row).forEach((b) => {
        const on = b.dataset.rate === next.r;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", on);
      });
      const abw = $(".note-abw", row);
      abw.classList.toggle("hidden", !(next.r === "ne" || next.abw));
      abw.classList.toggle("missing", next.r === "ne" && !next.abw.trim());
      if (next.r === "ne" && !next.abw.trim()) $("textarea", abw).focus();
    }
    applyFilterMarks();
    refreshCheckBar();
    touch();
  }

  // ---------- Auditplan ----------
  function viewPlan() {
    const a = state.audit;
    const p = a.plan;
    const zeiten = M.planZeiten();
    const themen = M.planThemen(a);
    const teiln = M.planTeilnehmer(a);
    const konf = M.planKonflikte(a);
    let rows = "";
    p.zeilen.forEach((z, i) => {
      const prev = p.zeilen.slice(0, i).map((x) => x.zeit).filter(Boolean).pop() || "";
      const opts = zeiten.filter((t) => !prev || t >= prev);
      if (z.zeit && !opts.includes(z.zeit)) opts.unshift(z.zeit);
      const sub = M.planUntertitel(a, z.thema);
      const chips = teiln.map((t) => t.k).concat(M.PLAN_SONDER).map((k) => {
        const on = z.teilnehmer.includes(k);
        const name = (teiln.find((t) => t.k === k) || {}).name || "";
        return '<button type="button" class="chip' + (on ? " on" : "") + '" data-act="plan-tn" data-i="' + i + '" data-k="' + esc(k) + '" aria-pressed="' + on + '"' + (name ? ' title="' + esc(name) + '"' : "") + ">" + esc(k) + "</button>";
      }).join("");
      rows +=
        '<tr class="' + (konf.bad.has(i) ? "conflict" : "") + '">' +
        '<td><select data-plan="zeit" data-i="' + i + '" aria-label="Zeit"><option value="">–</option>' + opts.map((t) => "<option" + (t === z.zeit ? " selected" : "") + ">" + t + "</option>").join("") + "</select></td>" +
        '<td><input list="dl-themen" data-plan="thema" data-i="' + i + '" value="' + esc(z.thema) + '" aria-label="Thema" placeholder="Thema wählen oder eingeben">' + (sub ? '<div class="sub-text">' + esc(sub) + "</div>" : "") + "</td>" +
        '<td><div class="chips">' + chips + "</div></td>" +
        '<td class="row-tools"><button class="icon-btn" data-act="plan-up" data-i="' + i + '" aria-label="Nach oben" title="Nach oben">↑</button><button class="icon-btn" data-act="plan-down" data-i="' + i + '" aria-label="Nach unten" title="Nach unten">↓</button><button class="icon-btn" data-act="plan-del" data-i="' + i + '" aria-label="Zeile löschen" title="Zeile löschen">×</button></td>' +
        "</tr>";
    });
    return (
      '<div class="page">' +
      '<header class="page-head"><div><h1>Auditplan</h1><p class="lead">' + esc(M.datumLang(a.stamm.datum) || "Auditdatum fehlt in den Stammdaten") + "</p></div>" +
      '<div class="actions"><button class="btn" data-act="plan-vorlage">Standardablauf einfügen</button><button class="btn btn-primary" data-act="plan-add">Zeile hinzufügen</button></div></header>' +
      (konf.msgs.length ? '<div class="alert">' + konf.msgs.map(esc).join("<br>") + "</div>" : "") +
      (teiln.length ? "" : '<div class="alert alert-info">Trage in den Stammdaten Auditteam und Teilnehmer der Organisation ein. Die Kürzel erscheinen dann hier zur Auswahl.</div>') +
      '<section class="panel"><table class="grid plan"><thead><tr><th style="width:110px">Zeit</th><th>Auditinhalte, Themen</th><th style="width:34%">Teilnehmer</th><th style="width:110px"></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4" class="muted c">Noch keine Zeilen. Füge den Standardablauf ein oder lege Zeilen einzeln an.</td></tr>') +
      "</tbody></table></section>" +
      '<section class="panel"><h2>Unterschriften</h2><p class="hint">Leer lassen, wenn von Hand ausgefüllt wird.</p><div class="form-grid">' +
      field("Auditplan erstellt (CRSC): Datum", "plan.erstelltDatum", { type: "date" }) + field("Name", "plan.erstelltName") +
      field("Auditplan bestätigt (Lieferant): Datum", "plan.bestaetigtDatum", { type: "date" }) + field("Name", "plan.bestaetigtName") +
      "</div></section>" +
      '<datalist id="dl-themen">' + themen.map((t) => '<option value="' + esc(t) + '">').join("") + "</datalist>" +
      "</div>"
    );
  }

  function planVorlage() {
    const a = state.audit;
    const k = a.stamm.kapitel;
    const alle = M.planTeilnehmer(a).map((t) => t.k);
    const team = a.stamm.team.map((p) => M.kuerzel(p.name)).filter(Boolean);
    const t = [["08:00", "Eröffnungsgespräch", alle.concat(["Mitglied der GF"])], ["08:30", "Management", alle]];
    if (M.KAPITEL_I.some((x) => k[x[0]])) t.push(["09:00", "I. Anforderungen an die Managementfunktion", alle]);
    if (["10", "11.1", "11.2", "11.3"].some((x) => k[x])) t.push(["10:30", "I.I Anforderungen an den Betrieb", alle.concat(["ggf. weitere MA"])]);
    t.push(["12:00", "Mittagspause", []]);
    let h = 12.75;
    ["II", "III", "IV"].forEach((fn) => {
      if (!k[fn]) return;
      const label = M.planThemen(a).find((x) => x.startsWith(fn + "."));
      t.push([hhmm(h), label, alle]);
      h += 1;
    });
    t.push([hhmm(h), "Zusammenfassung der Auditergebnisse", team]);
    t.push([hhmm(h + 0.5), "Abschlussgespräch", alle.concat(["Mitglied der GF"])]);
    t.push([hhmm(h + 1), "Ende des Audits", []]);
    a.plan.zeilen = a.plan.zeilen.concat(t.map(([zeit, thema, tn]) => ({ zeit, thema, teilnehmer: M.sortTeilnehmer(Array.from(new Set(tn))) })));
  }
  function hhmm(h) {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60 / 15) * 15;
    return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
  }

  // ---------- AWP ----------
  function teamOptions(sel) {
    const names = state.audit.stamm.team.map((p) => p.name.trim()).filter(Boolean);
    if (sel && !names.includes(sel)) names.unshift(sel);
    return names.map((n) => "<option" + (n === sel ? " selected" : "") + ">" + esc(n) + "</option>").join("");
  }

  function findingCard(f) {
    const e = M.awpEntry(state.audit, f);
    const k = f.typ + ":" + f.key;
    const p = (name) => 'data-awp="' + esc(k) + '" data-f="' + name + '"';
    return (
      '<article class="finding f-' + f.typ + '">' +
      '<div class="f-head"><span class="f-nr">' + (f.typ === "A" ? "Abweichung " : "Hinweis ") + f.nr + '</span><span class="f-punkt">zu Punkt ' + esc(f.punkt) + "</span>" +
      '<button class="link-btn" data-act="goto-q" data-key="' + esc(f.key) + '">In der Checkliste ändern</button></div>' +
      '<p class="f-text' + (f.text ? "" : " missing") + '">' + (f.text ? richText(f.text) : "Feststellung fehlt. Trage sie in der Checkliste bei der Frage ein.") + "</p>" +
      '<details class="f-frage"><summary>Fragetext</summary>' + richText(f.frage) + "</details>" +
      '<div class="form-grid awp-grid">' +
      '<label class="field"><span>Auditor / Fachexperte</span><select ' + p("auditor") + "><option value=\"\">–</option>" + teamOptions(e.auditor) + "</select></label>" +
      '<label class="field wide"><span>Maßnahme</span><textarea rows="2" ' + p("massnahme") + ">" + esc(e.massnahme) + "</textarea></label>" +
      '<label class="field"><span>Erledigung bis</span><input type="date" ' + p("bis") + ' value="' + esc(e.bis) + '"></label>' +
      '<label class="field"><span>Kontrolle durch</span><input ' + p("kontrolle") + ' value="' + esc(e.kontrolle) + '"></label>' +
      '<label class="field"><span>abgezeichnet</span><input ' + p("abgezeichnet") + ' value="' + esc(e.abgezeichnet) + '"></label>' +
      '<label class="field wide"><span>Anmerkungen</span><input ' + p("anmerkung") + ' value="' + esc(e.anmerkung) + '"></label>' +
      "</div></article>"
    );
  }

  function viewAwp() {
    const a = state.audit;
    const f = M.findings(a);
    return (
      '<div class="page">' +
      '<header class="page-head"><div><h1>Abweichungs- und Hinweisprotokoll (AWP)</h1><p class="lead">Alle mit n.e. bewerteten Fragen werden zu Abweichungen, alle eingetragenen Hinweise zu Hinweisen. Die Nummerierung folgt der Checkliste.</p></div></header>' +
      "<h2 class=\"h-list\">Abweichungen <span class=\"count\">" + f.abw.length + "</span></h2>" +
      (f.abw.length ? f.abw.map(findingCard).join("") : '<p class="muted">Keine Abweichungen.</p>') +
      "<h2 class=\"h-list\">Hinweise <span class=\"count\">" + f.hin.length + "</span></h2>" +
      (f.hin.length ? f.hin.map(findingCard).join("") : '<p class="muted">Keine Hinweise.</p>') +
      '<section class="panel"><h2>Zusammenfassung der Ergebnisse und des Abschlussgesprächs</h2>' +
      M.awpZusammenfassung(a, f.abw.length).map((t) => "<p>" + richText(t) + "</p>").join("") +
      (a.stamm.auditart ? "" : '<p class="alert alert-info">Auditart fehlt in den Stammdaten. Bis dahin steht hier „Erteilung/Aufrechterhaltung“.</p>') +
      "</section></div>"
    );
  }

  // ---------- Auditbericht ----------
  function viewBericht() {
    const a = state.audit;
    const f = M.findings(a);
    let kap = "";
    for (const bl of M.structure(a)) {
      kap += '<h3 class="rep-block">' + esc(bl.id) + " " + esc(bl.title) + "</h3>";
      for (const s of bl.sections) {
        const k = M.sKey(bl.id, s.id);
        const items = f.abw.concat(f.hin).filter((x) => x.block === bl.id && x.section === s.id);
        kap += '<div class="rep-sec"><label class="field wide"><span>' + esc(s.id) + ". " + esc(s.title) + '</span><textarea rows="3" data-bind="bericht.kapitel.' + enc(k) + '" placeholder="Bewertung des Kapitels">' + esc(a.bericht.kapitel[k] || "") + "</textarea></label>" +
          items.map((x) => '<p class="rep-f rep-' + x.typ + '">' + (x.typ === "A" ? "Abweichung " : "Hinweis ") + x.nr + ": " + esc(x.text || "(Feststellung fehlt)") + "</p>").join("") +
          "</div>";
      }
    }
    return (
      '<div class="page">' +
      '<header class="page-head"><div><h1>Auditbericht</h1><p class="lead">Kapitel, Abweichungen und Hinweise kommen aus der Checkliste. Du schreibst nur die Bewertungstexte.</p></div></header>' +
      '<section class="panel"><div class="form-grid">' +
      field("Mitgeltende Unterlagen", "bericht.unterlagen", { wide: true }) +
      field("Anlagen", "bericht.anlagen", { wide: true }) +
      field("Vorwort / Allgemeines", "bericht.vorwort", { type: "textarea", rows: 5, wide: true }) +
      "</div></section>" +
      '<section class="panel"><h2>Auditfeststellungen</h2>' + (kap || '<p class="muted">Keine Kapitel ausgewählt.</p>') + "</section>" +
      '<section class="panel"><h2>Abweichungen</h2><p>' + esc(M.abwSatz(f.abw.length)) + "</p>" +
      "<h2>Hinweise und Empfehlungen</h2><p>Die Hinweise gemäß Abweichungsprotokoll wurden mit der Organisation besprochen und werden von dieser in eigener Verantwortung sinngemäß angewendet. Weitere Empfehlungen wurden der Organisation durch das Auditteam im Rahmen der Überwachung mitgeteilt.</p>" +
      "<h2>Auditschlussfolgerung</h2>" + M.schlussfolgerung(a, f.abw.length).map((t) => "<p>" + esc(t) + "</p>").join("") +
      "</section></div>"
    );
  }

  // ---------- Drucken ----------
  const DOCS = [
    ["stamm", "Stammdaten"],
    ["plan", "Auditplan"],
    ["check", "Checkliste"],
    ["awp", "AWP"],
    ["bericht", "Auditbericht"],
  ];
  function viewDruck() {
    const sel = (lsGet("ecm-print-sel") || "plan,check,awp,bericht").split(",");
    return (
      '<div class="page page-wide">' +
      '<header class="page-head"><div><h1>Drucken</h1><p class="lead">Im Druckdialog „Microsoft Print to PDF“ wählen, um eine PDF-Datei zu speichern.</p></div>' +
      '<div class="actions"><button class="btn btn-primary" data-act="print">Drucken / PDF</button></div></header>' +
      '<div class="check-row">' + DOCS.map(([k, l]) => '<label class="check"><input type="checkbox" data-doc="' + k + '"' + (sel.includes(k) ? " checked" : "") + "><span>" + l + "</span></label>").join("") + "</div>" +
      '<div class="preview-wrap"><div id="preview" class="paper-stack"></div></div>' +
      "</div>"
    );
  }

  function selectedDocs() {
    return $all("[data-doc]").filter((c) => c.checked).map((c) => c.dataset.doc);
  }

  function updatePreview() {
    const docs = selectedDocs();
    lsSet("ecm-print-sel", docs.join(","));
    $("#preview").innerHTML = docs.length ? window.Docs.render(state.audit, docs) : '<p class="muted">Kein Dokument ausgewählt.</p>';
  }

  async function doPrint() {
    await saveNow();
    const docs = selectedDocs();
    if (!docs.length) return toast("Wähle mindestens ein Dokument aus.");
    $("#print-root").innerHTML = window.Docs.render(state.audit, docs);
    document.title = (state.audit.stamm.firma || "Audit") + " " + M.datumKurz(state.audit.stamm.datum);
    setTimeout(() => {
      window.print();
      document.title = "ECM Audit";
    }, 50);
  }

  // ---------- Ereignisse ----------
  function onInput(e) {
    const t = e.target;
    const a = state.audit;
    if (!a) return;

    if (t.dataset.bind) {
      const path = t.dataset.bind;
      setPath(a, path, t.type === "checkbox" ? t.checked : t.value);
      if (path.startsWith("stamm.team") || path.startsWith("stamm.org")) {
        const m = path.match(/^stamm\.(team|org)\.(\d+)\.name$/);
        if (m) {
          const cell = $('[data-kz="' + m[1] + "." + m[2] + '"]');
          if (cell) cell.textContent = M.kuerzel(t.value);
        }
      }
      if (path === "stamm.firma" || path === "stamm.datum") renderSidebar();
      if (t.type === "checkbox" && t.dataset.rerenderNav) renderSidebar();
      touch();
      return;
    }

    if (t.dataset.ans) {
      const key = t.dataset.key;
      const cur = M.answer(a, key);
      a.antworten[key] = Object.assign({}, cur, { [t.dataset.ans]: t.value });
      if (t.dataset.ans === "abw") t.closest(".note").classList.toggle("missing", cur.r === "ne" && !t.value.trim());
      if (t.dataset.ans === "hin") t.closest(".q").classList.toggle("has-hin", !!t.value.trim());
      touch();
      return;
    }

    if (t.dataset.awp) {
      const k = t.dataset.awp;
      a.awp[k] = Object.assign({}, a.awp[k] || {}, { [t.dataset.f]: t.value });
      touch();
      return;
    }

    if (t.dataset.plan) {
      const z = a.plan.zeilen[+t.dataset.i];
      z[t.dataset.plan] = t.value;
      touch();
      if (e.type === "change") {
        if (t.dataset.plan === "thema") {
          // Nur den Untertitel anpassen, sonst gehen Klicks auf das nächste Feld verloren
          const cell = t.parentElement;
          let sub = cell.querySelector(".sub-text");
          const txt = M.planUntertitel(a, t.value);
          if (txt && !sub) { sub = document.createElement("div"); sub.className = "sub-text"; cell.appendChild(sub); }
          if (sub) { sub.textContent = txt; if (!txt) sub.remove(); }
        } else {
          render();
        }
      }
      return;
    }

    if (t.dataset.doc) updatePreview();
  }

  async function onClick(e) {
    const t = e.target.closest("button, [data-open], a[data-toc]");
    if (!t) return;
    const a = state.audit;

    if (t.dataset.view) return go(t.dataset.view);
    if (t.id === "btn-liste") { await saveNow(); state.view = "liste"; return render(); }
    if (t.dataset.open && !e.target.closest("button")) return openAudit(t.dataset.open);
    if (t.dataset.rate) return setRating(t.dataset.key, t.dataset.rate);
    if (t.dataset.filter) {
      state.filter = t.dataset.filter;
      $(".check-body").className = "check-body filter-" + state.filter;
      $all("[data-filter]").forEach((b) => b.classList.toggle("on", b === t));
      return;
    }
    if (t.dataset.toc) {
      e.preventDefault();
      const el = document.getElementById(t.dataset.toc);
      if (el) el.scrollIntoView({ block: "start" });
      return;
    }

    switch (t.dataset.act) {
      case "neu": return createAudit();
      case "folge": return createAudit(t.dataset.id);
      case "export": return exportAudit(t.dataset.id);
      case "loeschen": return deleteAudit(t.dataset.id);
      case "import": return $("#import-file").click();
      case "person-add":
        a.stamm[t.dataset.kind].push(t.dataset.kind === "team" ? { name: "", funktion: "", firma: "" } : { name: "", funktion: "", bemerkung: "" });
        touch(); return render();
      case "person-del":
        a.stamm[t.dataset.kind].splice(+t.dataset.i, 1);
        touch(); return render();
      case "add-hin": {
        const row = t.closest(".q");
        $(".note-hin", row).classList.remove("hidden");
        t.classList.add("hidden");
        $(".note-hin textarea", row).focus();
        return;
      }
      case "plan-add": {
        const last = a.plan.zeilen[a.plan.zeilen.length - 1];
        a.plan.zeilen.push({ zeit: last ? last.zeit : "", thema: "", teilnehmer: [] });
        touch(); return render();
      }
      case "plan-vorlage":
        if (a.plan.zeilen.length && !(await dialog("Der Standardablauf wird unter die vorhandenen Zeilen angehängt.", "Anhängen"))) return;
        planVorlage(); touch(); return render();
      case "plan-del": a.plan.zeilen.splice(+t.dataset.i, 1); touch(); return render();
      case "plan-up": case "plan-down": {
        const i = +t.dataset.i, j = t.dataset.act === "plan-up" ? i - 1 : i + 1;
        if (j < 0 || j >= a.plan.zeilen.length) return;
        const z = a.plan.zeilen;
        [z[i], z[j]] = [z[j], z[i]];
        touch(); return render();
      }
      case "plan-tn": {
        const z = a.plan.zeilen[+t.dataset.i];
        const k = t.dataset.k;
        const set = z.teilnehmer.includes(k) ? z.teilnehmer.filter((x) => x !== k) : z.teilnehmer.concat([k]);
        z.teilnehmer = M.sortTeilnehmer(set);
        touch(); return render();
      }
      case "goto-q": {
        state.view = "check";
        state.filter = "alle";
        render();
        const row = $('[data-q="' + CSS.escape(t.dataset.key) + '"]');
        if (row) { row.scrollIntoView({ block: "center" }); row.focus(); }
        return;
      }
      case "print": return doPrint();
      case "export-alle": return exportAll();
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === "import-file") {
      if (t.files[0]) importAudit(t.files[0]);
      t.value = "";
      return;
    }
    if (t.dataset.act === "auditart") {
      M.setAuditart(state.audit, t.value);
      touch();
      return render();
    }
    if (t.dataset.act === "verantw") {
      state.audit.stamm.verantwortliche[t.dataset.k].status = t.value;
      return touch();
    }
    if (t.dataset.plan) return onInput(e);
    if (t.dataset.doc) return updatePreview();
    if (t.type === "checkbox" || t.tagName === "SELECT") onInput(e);
  }

  function onKey(e) {
    if (state.view !== "check") return;
    const row = e.target.classList && e.target.classList.contains("q") ? e.target : null;
    if (!row) return;
    const map = { "1": "e", "2": "ne", "3": "ng", "4": "nz" };
    if (map[e.key]) { e.preventDefault(); setRating(row.dataset.q, map[e.key]); return; }
    if (e.key === "0" || e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const cur = M.answer(state.audit, row.dataset.q).r;
      if (cur) setRating(row.dataset.q, cur);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const rows = $all(".q").filter((q) => q.offsetParent !== null);
      const i = rows.indexOf(row);
      const next = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { next.focus(); next.scrollIntoView({ block: "nearest" }); }
    }
  }

  // ---------- Testversion ----------
  function trialInfo() {
    const L = state.license;
    if (!L.trial) return "";
    if (L.expired) return "Testversion abgelaufen";
    const ms = L.expires * 1000 - Date.now();
    const tage = Math.max(0, Math.ceil(ms / 86400000));
    const bis = new Date(L.expires * 1000).toLocaleDateString("de-DE");
    return "Testversion, gültig bis " + bis + " (" + (tage === 1 ? "noch 1 Tag" : "noch " + tage + " Tage") + ")";
  }

  function renderLocked() {
    const L = state.license;
    document.body.classList.add("locked");
    $("#nav").innerHTML = "";
    $("#audit-head").innerHTML = "";
    const bis = L.expires ? new Date(L.expires * 1000).toLocaleDateString("de-DE") : "";
    $("#main").innerHTML =
      '<div class="page"><div class="lock">' +
      "<h1>Testversion abgelaufen</h1>" +
      "<p>" + (L.tampered
        ? "Die Testversion wurde gesperrt, weil die Systemuhr zurückgestellt oder die Lizenzdatei verändert wurde."
        : "Der Testzeitraum ist am " + esc(bis) + " abgelaufen.") + "</p>" +
      "<p>Deine Audits sind nicht verloren. Du kannst sie exportieren und in der Vollversion wieder importieren.</p>" +
      (L.contact ? '<p class="lock-contact">Vollversion: ' + esc(L.contact) + "</p>" : "") +
      '<button class="btn btn-primary" data-act="export-alle">Alle Audits exportieren (' + state.audits.length + ")</button>" +
      "</div></div>";
  }

  async function exportAll() {
    let n = 0, where = "";
    for (const a of state.audits) {
      try {
        where = (await S.exportFile(fileName(a), JSON.stringify(a, null, 2))) || where;
        n++;
      } catch (e) {
        toast("Export fehlgeschlagen: " + (e && e.message ? e.message : e), "error");
      }
    }
    toast(n + (n === 1 ? " Audit" : " Audits") + " exportiert" + (where ? " nach " + where.replace(/[\\/][^\\/]*$/, "") : ""));
  }

  // ---------- Start ----------
  async function init() {
    document.addEventListener("input", (e) => {
      if (e.target.matches("input:not([type=checkbox]):not([type=radio]), textarea")) onInput(e);
    });
    document.addEventListener("change", onChange);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", (e) => {
      if (e.target.matches && e.target.matches("tr[data-open]") && e.key === "Enter") openAudit(e.target.dataset.open);
    });
    window.addEventListener("beforeunload", () => { if (state.saveTimer) saveNow(); });
    window.addEventListener("afterprint", () => { $("#print-root").innerHTML = ""; });

    try {
      state.license = await S.license();
    } catch (e) {
      state.license = { trial: true, expired: true, tampered: false, expires: 0, contact: "" };
    }
    const ti = trialInfo();
    if (ti) {
      const el = document.createElement("div");
      el.className = "trial-note";
      el.textContent = ti;
      $(".sidebar-foot").prepend(el);
    }
    try {
      state.audits = (await S.list()).map(M.normalize);
    } catch (e) {
      toast("Audits konnten nicht geladen werden: " + (e && e.message ? e.message : e), "error");
    }
    const last = lsGet("ecm-last-audit");
    const found = last && state.audits.find((x) => x.id === last);
    if (found) {
      state.audit = found;
      state.view = lsGet("ecm-last-view") || "stamm";
    }
    render();
    try {
      const d = await S.dataDir();
      const el = $("#datadir");
      if (el) el.textContent = "Speicherort: " + d;
      window.__dataDir = d;
    } catch (e) { /* egal */ }
  }

  // Speicherort auch nach Neuaufbau der Liste anzeigen
  const origRender = render;
  render = function () {
    origRender();
    const el = $("#datadir");
    if (el && window.__dataDir) el.textContent = "Speicherort: " + window.__dataDir;
  };

  document.addEventListener("DOMContentLoaded", init);
})();
