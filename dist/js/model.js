// Datenmodell und Auswertungslogik. Fachlich nachgebaut aus den VBA-Modulen der
// Auditcheckliste (Beta 5.0, Makros v6.7), mit den im Code kommentierten Korrekturen.
(function () {
  const CAT = window.ECM_CATALOG;

  const LEISTUNG = [
    ["herstellung", "Herstellung"],
    ["aufarbeitung", "Aufarbeitung"],
    ["handel", "Handel"],
    ["bahndienst", "Bahndienstleistungen"],
  ];
  const LEISTUNG_TEXT =
    "von Leistungen für Schienenfahrzeuge unter der Beachtung von europäischen Verordnungen, Richtlinien und sonstiger relevanter Vorgaben (z. B. Technische Normen, UIC-Merkblättern, Allgemeiner Verwendungsvertrag für Güterwagen AVV, VPI European Maintenance Guide, Vorgaben der Wagenhalter bzw. Entity in Charge of Maintenance ECM etc.)";
  const BAUTEILE = [
    ["allgemein", "Allgemeine Bauteile für Schienenfahrzeuge"],
    ["drehgestelle", "Dreh- und Untergestelle für Schienenfahrzeuge"],
    ["aufbauten", "Aufbauten und Bauteile (inkl. Gefahrguttanks und Armaturen) für Schienenfahrzeuge"],
    ["radsaetze", "Radsätze und Bauteile für Radsätze von Schienenfahrzeugen"],
    ["federn", "Federn und Bauteile für Federn von Schienenfahrzeuge"],
    ["zugstoss", "Zug- und Stoßkomponenten für Schienenfahrzeuge"],
    ["bremsen", "Bremsen und Bremsbauteile für Schienenfahrzeuge"],
    ["laufwerke", "Bauteile für Laufwerke von Schienenfahrzeugen"],
    ["schweiss", "Schweißbauteile für Schienenfahrzeuge"],
  ];
  const ECM_FUNKTIONEN = [
    ["ii", "ECM II Funktion (Verwaltung der Instandhaltungsvorgaben)"],
    ["iii", "ECM III Funktion (Umsetzung des Flottenmanagement)"],
    ["iv", "ECM IV Funktion (Fachtechnische Freigabe)"],
  ];
  const AUDITARTEN = [
    ["E", "Erstaudit"],
    ["W", "Wiederholungsaudit"],
    ["U", "Überwachungsaudit"],
  ];
  // Kapitelauswahl wie in den Stammdaten (Zeilen 71–94). "11" ohne Unterpunkt entfällt:
  // in der Excel hat es dieselbe Wirkung wie 11.1.
  const KAPITEL_I = [
    ["1", "1. Führungsaufgabe"],
    ["2", "2. Risikobewertung"],
    ["3", "3. Überwachung"],
    ["4", "4. Ständige Verbesserung"],
    ["5", "5. Struktur und Verantwortlichkeit"],
    ["6", "6. Kompetenzmanagement"],
    ["7", "7. Information"],
    ["8", "8. Dokumentation"],
    ["9", "9. Untervergabetätigkeiten"],
  ];
  const KAPITEL_II = [
    ["10", "10. Allgemeine Anforderungen an die sicherheitsrelevanten Tätigkeiten im Betrieb"],
    ["11.1", "11.1 Anlagen, Ausrüstungen und Werkzeuge"],
    ["11.2", "11.2 Messmittel"],
    ["11.3", "11.3 Sicherheit, Ergonomie und Gesundheitsschutz am Arbeitsplatz"],
  ];
  const KAPITEL_FN = [
    ["II", "II Instandhaltungsentwicklungsfunktion"],
    ["III", "III Fuhrpark-Instandhaltungsmanagementfunktion"],
    ["IV", "IV Instandhaltungserbringungsfunktion"],
  ];
  const KAPITEL_BETRIEB = KAPITEL_I.concat(KAPITEL_II).map((k) => k[0]);

  const VERANTWORTLICHE = [
    ["betrieb", "Verantwortlicher für den Betrieb"],
    ["qmb", "Verantwortlicher für Qualität (QMB)"],
    ["schweiss", "Verantwortliche Schweißaufsicht"],
    ["arbeitssicherheit", "Verantwortlicher für Arbeitssicherheit"],
    ["elektrik", "Verantwortlicher für elektrische Komponenten"],
    ["regelwerke", "Verantwortlicher für Regelwerke"],
    ["fuegetechnik", "Verantwortlicher für Fügetechnik (z.B. Kleben)"],
    ["gefahrgut", "Verantwortlicher für Gefahrgut"],
    ["abfall", "Verantwortlicher für Abfall"],
    ["ersatzteile", "Verantwortlicher für Ersatzteilmanagement"],
    ["messmittel", "Verantwortlicher für Mess- und Prüfmittel"],
    ["bremse", "Verantwortlicher für Bremse/-komponenten"],
    ["radsatz", "Verantwortlicher für Radsatz/-komponenten"],
    ["zugstoss", "Verantwortlicher für Zug- und Stoß Komponenten"],
    ["schulung", "Verantwortlicher Schulung und Weiterbildung"],
    ["datenschutz", "Verantwortlicher für Datenschutz"],
  ];
  const FUNKTIONSTRAEGER = [
    ["gf", "Geschäftsführer"],
    ["tl", "Technischer Leiter / Betriebsleiter"],
    ["qs", "Verantwortlicher für die Qualitätssicherung"],
  ];
  const RATINGS = [
    ["e", "e.", "erfüllt"],
    ["ne", "n.e.", "nicht erfüllt"],
    ["ng", "n.g.", "nicht geprüft"],
    ["nz", "n.z.", "nicht zutreffend"],
  ];

  function uid() {
    const r = Math.random().toString(36).slice(2, 8);
    return "a" + Date.now().toString(36) + r;
  }

  function fromPairs(pairs, val) {
    const o = {};
    pairs.forEach((p) => (o[p[0]] = typeof val === "function" ? val() : val));
    return o;
  }

  function newAudit() {
    const now = new Date().toISOString();
    const kapitel = {};
    KAPITEL_I.concat(KAPITEL_II, KAPITEL_FN).forEach((k) => (kapitel[k[0]] = false));
    return {
      id: uid(),
      schema: 1,
      katalog: CAT.quelle,
      created: now,
      updated: now,
      stamm: {
        firma: "", strasse: "", plz: "", ort: "", land: "Deutschland",
        leistung: fromPairs(LEISTUNG, false),
        bauteile: fromPairs(BAUTEILE, false),
        ecmFunktion: fromPairs(ECM_FUNKTIONEN, false),
        freitextAktiv: false, freitext: "",
        datum: "",
        team: [{ name: "", funktion: "Auditor", firma: "" }],
        org: [{ name: "", funktion: "", bemerkung: "" }],
        auditart: "",
        kapitel,
        crsc: true,
        homepage: "", hrnr: "", ustid: "", versicherung: "",
        geschaeftszweck: "", gruendungsjahr: "", mitarbeiter: "",
        funktionstraeger: fromPairs(FUNKTIONSTRAEGER, () => ({ name: "", tel: "", mail: "" })),
        verantwortliche: fromPairs(VERANTWORTLICHE, () => ({ status: "", bem: "" })),
      },
      antworten: {},
      nachweise: {},
      awp: {},
      plan: { zeilen: [], erstelltDatum: "", erstelltName: "", bestaetigtDatum: "", bestaetigtName: "" },
      bericht: {
        vorwort: "",
        kapitel: {},
        unterlagen: "alle Unterlagen der überwachten Organisation zum Zeitpunkt des Audits",
        anlagen: "Teilnehmerliste, Checkliste und Abweichungsprotokoll",
      },
    };
  }

  // Fehlende Felder bei älteren oder importierten Audits ergänzen
  function normalize(a) {
    const base = newAudit();
    function merge(def, val) {
      if (Array.isArray(def)) return Array.isArray(val) ? val : def;
      if (def && typeof def === "object") {
        const out = {};
        const v = val && typeof val === "object" && !Array.isArray(val) ? val : {};
        for (const k of Object.keys(def)) out[k] = merge(def[k], v[k]);
        for (const k of Object.keys(v)) if (!(k in out)) out[k] = v[k];
        return out;
      }
      return val === undefined || val === null ? def : val;
    }
    const out = merge(base, a);
    if (!a || !a.id) out.id = base.id;
    return out;
  }

  // Auditart wie Worksheet_Change in Stammdaten: Erst-/Wiederholungsaudit wählt
  // alle Kapitel I und I.I samt CRSC an, Überwachungsaudit wählt sie ab.
  function setAuditart(a, art) {
    a.stamm.auditart = art;
    const on = art === "E" || art === "W";
    KAPITEL_BETRIEB.forEach((k) => (a.stamm.kapitel[k] = on));
    a.stamm.crsc = on;
  }

  function kuerzel(name) {
    const n = (name || "").trim();
    if (!n) return "";
    const sp = n.indexOf(" ");
    return (n[0] + (sp > -1 && n[sp + 1] ? n[sp + 1] : "")).toUpperCase();
  }

  function qKey(blockId, itemId) {
    return blockId + "|" + itemId;
  }
  function sKey(blockId, sectionId) {
    return blockId + "|" + sectionId;
  }

  // Sichtbare Struktur der Checkliste (Modul1_Checkliste.ChecklisteErstellen)
  function structure(a) {
    const kap = a.stamm.kapitel;
    const crsc = !!a.stamm.crsc;
    const out = [];
    for (const bl of CAT.blocks) {
      const isFn = bl.id === "II" || bl.id === "III" || bl.id === "IV";
      if (isFn && !kap[bl.id]) continue;
      const sections = [];
      for (const s of bl.sections) {
        const items = s.items.filter((it) => (isFn || kap[it.sel]) && (!it.crsc || crsc));
        if (!items.length) continue;
        sections.push({ id: s.id, title: s.title, evidence: s.evidence, items });
      }
      if (sections.length) out.push({ id: bl.id, title: bl.title, desc: bl.desc, sections });
    }
    return out;
  }

  function answer(a, key) {
    return a.antworten[key] || { r: "", abw: "", hin: "" };
  }

  function stats(a) {
    let total = 0, done = 0;
    const by = { e: 0, ne: 0, ng: 0, nz: 0 };
    for (const bl of structure(a)) {
      for (const s of bl.sections) {
        for (const it of s.items) {
          if (it.t !== "q") continue;
          total++;
          const r = answer(a, qKey(bl.id, it.id)).r;
          if (r) { done++; by[r]++; }
        }
      }
    }
    return { total, done, by };
  }

  function auditorName(a) {
    const t = a.stamm.team.filter((p) => p.name.trim());
    const aud = t.find((p) => /auditor/i.test(p.funktion));
    return (aud || t[0] || { name: "" }).name.trim();
  }

  // Abweichungen und Hinweise (Modul2_AWP.ProtokolleUebertragen).
  // Korrektur: Ein Hinweis wird auch übernommen, wenn die Frage (noch) nicht angekreuzt ist.
  function findings(a) {
    const abw = [], hin = [];
    for (const bl of structure(a)) {
      for (const s of bl.sections) {
        for (const it of s.items) {
          if (it.t !== "q") continue;
          const key = qKey(bl.id, it.id);
          const ans = answer(a, key);
          const base = { block: bl.id, section: s.id, id: it.id, punkt: bl.id + " / " + it.id, frage: it.text, key };
          if (ans.r === "ne") {
            abw.push(Object.assign({ typ: "A", nr: abw.length + 1, text: ans.abw.trim() }, base));
          }
          if (ans.hin.trim()) {
            hin.push(Object.assign({ typ: "H", nr: hin.length + 1, text: ans.hin.trim() }, base));
          }
        }
      }
    }
    return { abw, hin };
  }

  function awpEntry(a, f) {
    const k = f.typ + ":" + f.key;
    const e = a.awp[k] || {};
    return {
      massnahme: e.massnahme || "",
      bis: e.bis || "",
      kontrolle: e.kontrolle || "",
      abgezeichnet: e.abgezeichnet || "",
      anmerkung: e.anmerkung || "",
      auditor: e.auditor || auditorName(a),
    };
  }

  // Korrektur: In Modul4 hieß es beim Erstaudit „Erstellung“, im AWP „Erteilung“.
  function termBegriff(a) {
    if (a.stamm.auditart === "E") return "Erteilung";
    if (a.stamm.auditart === "W" || a.stamm.auditart === "U") return "Aufrechterhaltung";
    return "Erteilung/Aufrechterhaltung";
  }

  function abwSatz(n) {
    if (n === 0) return "Im Rahmen des Audits wurden keine Abweichungen festgestellt.";
    if (n === 1) return "Im Rahmen des Audits wurde 1 Abweichung festgestellt.";
    return "Im Rahmen des Audits wurden " + n + " Abweichungen festgestellt.";
  }

  // Textbausteine „Zusammenfassung der Ergebnisse und des Abschlussgesprächs“ (AddZusammenfassungAWP)
  function awpZusammenfassung(a, n) {
    const t = termBegriff(a);
    const out = [
      "Das Instandhaltungsmanagementsystem ist aufgebaut und enthält unter anderem die Forderungen der Durchführungsverordnung (EU) 2019/779 und der Verordnung (EU) Nr. 1078/2012.\nEs ist im Unternehmen eingeführt, wird laufend aktualisiert und umfassend bewirtschaftet.",
    ];
    if (n === 0) {
      out.push("Es wurden keine Abweichungen im Rahmen der Lieferantenüberwachung festgestellt und somit bestehen keine Einwände gegen die " + t + " des Konformitätsnachweises.");
    } else {
      out.push(n === 1
        ? "Es wurde 1 Abweichung im Rahmen der Lieferantenüberwachung festgestellt."
        : "Es wurden " + n + " Abweichungen im Rahmen der Lieferantenüberwachung festgestellt.");
      out.push("Die " + t + " des Konformitätsnachweises kann erst nach termingerechter Erledigung der o.g. " + (n === 1 ? "Abweichung" : "Abweichungen") + " erfolgen. Die Erledigungen sind dem Auditor termingerecht mit ausreichenden Nachweisen zu übermitteln.");
    }
    out.push("Das eingerichtete System ist der Komplexität der Organisation angepasst.");
    return out;
  }

  // Auditschlussfolgerung (Modul4). Korrektur: ohne Abweichungen entfällt „Nach der Korrektur …“.
  function schlussfolgerung(a, n) {
    const t = termBegriff(a);
    return [
      "Das Auditteam bestätigt, dass das Audit unabhängig und unparteiisch durchgeführt wurde.",
      "Es wird ausdrücklich darauf hingewiesen, dass das gegenständliche Audit auf einem Stichprobenverfahren der verfügbaren Informationen zum Auditzeitpunkt basierte.",
      n > 0
        ? "Nach der nachweislichen Korrektur der o. g. " + (n === 1 ? "Abweichung" : "Abweichungen") + " wird die " + t + " des Konformitätsnachweises empfohlen."
        : "Die " + t + " des Konformitätsnachweises wird empfohlen.",
    ];
  }

  // ---------- Auditplan (Modul3_Auditplan, Tabelle Auditplan) ----------
  function planZeiten() {
    const out = [];
    for (let h = 7; h <= 18; h++) for (let m = 0; m < 60; m += 15) out.push(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
    return out;
  }

  function planThemen(a) {
    const k = a.stamm.kapitel;
    const t = ["Eröffnungsgespräch", "Management", "I. Anforderungen an die Managementfunktion", "I.I Anforderungen an den Betrieb"];
    if (k.II) t.push("II. Anforderungen an die Entwicklung");
    if (k.III) t.push("III. Anforderungen an das Fuhrparkmanagement");
    if (k.IV) t.push("IV. Anforderungen an die Instandhaltungserbringung");
    return t.concat(["Mittagspause", "Kaffeepause", "Zusammenfassung der Auditergebnisse", "Abschlussgespräch", "Ende des Audits"]);
  }

  // Untertitel je Thema (Tabelle8.Worksheet_Change, Logik B)
  function planUntertitel(a, thema) {
    const k = a.stamm.kapitel;
    if (!thema) return "";
    if (thema.includes("Eröffnungsgespräch")) return "Vorstellung, Auditzielsetzungen, Änderungen zum Vorjahr, Auditablauf";
    if (thema.startsWith("I. ")) return KAPITEL_I.filter((x) => k[x[0]]).map((x) => x[1]).join(", ");
    if (thema.startsWith("I.I")) {
      const p = [];
      if (k["10"]) p.push("10. Allgemeine Anforderungen");
      if (k["11.1"]) p.push("11.1 Anlagen, Ausrüstungen und Werkzeuge");
      if (k["11.2"]) p.push("11.2 Messmittel");
      if (k["11.3"]) p.push("11.3 Sicherheit, Ergonomie und Gesundheitsschutz");
      return p.join(", ");
    }
    if (thema.startsWith("II.")) return "1. Instandhaltungsakte, 2. Technische Dokumentation, 3. Sicherheitsrelevante Bauteile, 4. Lebenszyklusverwaltung";
    if (thema.startsWith("III.")) return "1. Betriebsbereitschaft, 2. Instandhaltungsaufträge, 3. Überwachung der Instandhaltung, 4. Freigabe zum Betrieb";
    if (thema.startsWith("IV.")) return "1. Personalqualifikation, 2. Werkzeuge und Prüfmittel, 3. Instandhaltungsnachweise, 4. Freigabe zur Nutzung";
    if (thema === "Management") return "Allgemeines, Unternehmen, Handbuch, Zertifikate";
    return "";
  }

  const PLAN_SONDER = ["Mitglied der GF", "ggf. weitere MA"];

  function planTeilnehmer(a) {
    const out = [];
    a.stamm.team.concat(a.stamm.org).forEach((p) => {
      const k = kuerzel(p.name);
      if (k && !out.some((x) => x.k === k)) out.push({ k, name: p.name.trim() });
    });
    return out;
  }

  // Doppelbelegung gleicher Kürzel zur gleichen Zeit (PruefeKonflikte)
  function planKonflikte(a) {
    const rows = a.plan.zeilen;
    const bad = new Set();
    const msgs = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (!rows[i].zeit || rows[i].zeit !== rows[j].zeit) continue;
        const pi = rows[i].teilnehmer.filter((x) => !PLAN_SONDER.includes(x));
        const pj = rows[j].teilnehmer.filter((x) => !PLAN_SONDER.includes(x));
        pi.filter((x) => pj.includes(x)).forEach((x) => {
          bad.add(i); bad.add(j);
          msgs.push(x + " ist um " + rows[i].zeit + " Uhr doppelt verplant (Zeile " + (i + 1) + " und " + (j + 1) + ").");
        });
      }
    }
    return { bad, msgs };
  }

  function sortTeilnehmer(list) {
    const normal = list.filter((x) => !PLAN_SONDER.includes(x));
    return normal.concat(PLAN_SONDER.filter((x) => list.includes(x)));
  }

  // ---------- Formatierung ----------
  function datumLang(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function datumKurz(iso) {
    if (!iso) return "";
    const p = String(iso).slice(0, 10).split("-");
    return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : iso;
  }

  window.Model = {
    CAT, LEISTUNG, LEISTUNG_TEXT, BAUTEILE, ECM_FUNKTIONEN, AUDITARTEN, KAPITEL_I, KAPITEL_II, KAPITEL_FN,
    VERANTWORTLICHE, FUNKTIONSTRAEGER, RATINGS, PLAN_SONDER,
    newAudit, normalize, setAuditart, kuerzel, qKey, sKey, structure, answer, stats, auditorName,
    findings, awpEntry, termBegriff, abwSatz, awpZusammenfassung, schlussfolgerung,
    planZeiten, planThemen, planUntertitel, planTeilnehmer, planKonflikte, sortTeilnehmer,
    datumLang, datumKurz,
  };
})();
