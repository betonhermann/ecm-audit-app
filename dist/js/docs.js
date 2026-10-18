// Druckansichten: Stammdaten, Auditplan, Checkliste, AWP, Auditbericht.
// Kopf- und Fußzeile kommen über @page-Randbereiche (Seitenzahl „x von y“).
(function () {
  const M = window.Model;

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function br(t) { return esc(t).replace(/\n/g, "<br>"); }
  function box(on) { return '<span class="box' + (on ? " on" : "") + '">' + (on ? "✕" : "") + "</span>"; }
  function cssString(t) { return '"' + String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ") + '"'; }

  function orgName(a) { return a.stamm.firma || "[Organisation]"; }

  function addressBlock(a) {
    const s = a.stamm;
    const miss = '<span class="miss">Bitte in den Stammdaten eintragen</span>';
    return '<div class="addr"><strong>' + (esc(s.firma) || miss) + "</strong><br>" + (esc(s.strasse) || miss) + "<br>" +
      (esc([s.plz, s.ort].filter(Boolean).join(" ")) || miss) + (s.land ? "<br>" + esc(s.land) : "") + "</div>";
  }

  function auditartBoxes(a, title) {
    return '<div class="artbox">' + (title ? "<div class=\"artbox-t\">" + esc(title) + "</div>" : "") +
      M.AUDITARTEN.map(([k, l]) => "<div>" + box(a.stamm.auditart === k) + " " + l + "</div>").join("") + "</div>";
  }

  function docHead(a, title, sub) {
    return '<header class="d-head"><div class="d-title"><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>" +
      '<img class="d-logo" src="img/crsc-logo.png" alt=""></header>';
  }

  function sigBox(title, name, datum) {
    return '<table class="sig"><tr><th colspan="2">' + esc(title) + "</th></tr>" +
      '<tr class="lbl"><td>Datum</td><td>Name</td></tr>' +
      "<tr><td>" + esc(M.datumKurz(datum)) + "</td><td>" + esc(name) + "</td></tr>" +
      '<tr class="sign"><td>Unterschrift</td><td></td></tr></table>';
  }

  function personByRole(a, re) {
    const p = a.stamm.team.find((x) => x.name.trim() && re.test(x.funktion));
    return p ? p.name.trim() : "";
  }

  function leistungList(a) {
    const s = a.stamm;
    return '<div class="lu">' +
      '<div class="lu-row">' + M.LEISTUNG.map(([k, l]) => "<span>" + box(s.leistung[k]) + " " + l + "</span>").join("") + "</div>" +
      '<p class="small">' + esc(M.LEISTUNG_TEXT) + "</p><p><strong>für:</strong></p>" +
      '<div class="lu-cols">' + M.BAUTEILE.map(([k, l]) => "<div>" + box(s.bauteile[k]) + " " + esc(l) + "</div>").join("") + "</div>" +
      '<div class="lu-cols mt">' + M.ECM_FUNKTIONEN.map(([k, l]) => "<div>" + box(s.ecmFunktion[k]) + " " + esc(l) + "</div>").join("") + "</div>" +
      (s.freitextAktiv || s.freitext ? '<div class="mt">' + box(s.freitextAktiv) + " " + br(s.freitext || "Freitext") + "</div>" : "") +
      "</div>";
  }

  function personRows(list, cols) {
    const rows = list.filter((p) => p.name.trim());
    if (!rows.length) return '<tr><td colspan="' + cols.length + '" class="miss">Keine Teilnehmer eingetragen</td></tr>';
    return rows.map((p) => "<tr>" + cols.map((c) => "<td>" + esc(typeof c === "function" ? c(p) : p[c]) + "</td>").join("") + "</tr>").join("");
  }

  // ---------- Stammdaten ----------
  function docStamm(a) {
    const s = a.stamm;
    const kap = (list) => list.map(([k, l]) => "<div>" + box(s.kapitel[k]) + " " + esc(l) + "</div>").join("");
    const ft = M.FUNKTIONSTRAEGER.map(([k, l]) => {
      const f = s.funktionstraeger[k];
      return "<tr><td>" + esc(l) + "</td><td>" + esc(f.name) + "</td><td>" + esc(f.tel) + "</td><td>" + esc(f.mail) + "</td></tr>";
    }).join("");
    const ver = M.VERANTWORTLICHE.map(([k, l]) => {
      const v = s.verantwortliche[k];
      return "<tr><td>" + esc(l) + '</td><td class="c">' + box(v.status === "ja") + '</td><td class="c">' + box(v.status === "nein") + "</td><td>" + esc(v.bem) + "</td></tr>";
    }).join("");
    return (
      '<section class="doc doc-stamm">' + docHead(a, "Stammdaten", "Das Audit beinhaltet die Forderungen der Durchführungsverordnung (EU) 2019/779 und der Verordnung (EU) Nr. 1078/2012 und dient zur Überwachung untervergebener Tätigkeiten der ECM.") +
      '<div class="two">' + addressBlock(a) + auditartBoxes(a) + "</div>" +
      '<p><strong>Datum des Audits:</strong> ' + esc(M.datumKurz(s.datum)) + "</p>" +
      "<h2>Leistungsumfang der auditierten Organisation</h2>" + leistungList(a) +
      "<h2>Teilnehmer Auditteam</h2><table class=\"t\"><thead><tr><th>Vorname / Nachname</th><th>Funktion</th><th>Kürzel</th><th>Firma</th></tr></thead><tbody>" +
      personRows(s.team, ["name", "funktion", (p) => M.kuerzel(p.name), "firma"]) + "</tbody></table>" +
      "<h2>Teilnehmer Organisation</h2><table class=\"t\"><thead><tr><th>Vorname / Nachname</th><th>Funktion</th><th>Kürzel</th><th>Bemerkung</th></tr></thead><tbody>" +
      personRows(s.org, ["name", "funktion", (p) => M.kuerzel(p.name), "bemerkung"]) + "</tbody></table>" +
      '<h2>Zu prüfende Bereiche</h2><div class="two"><div><p><strong>I Anforderungen und Bewertungskriterien bezüglich der Managementfunktion</strong></p>' + kap(M.KAPITEL_I) +
      "</div><div><p><strong>I.I Anforderungen an den Betrieb</strong></p>" + kap(M.KAPITEL_II) + '<p class="mt"><strong>ECM-Funktionen</strong></p>' + kap(M.KAPITEL_FN) +
      '<p class="mt">' + box(s.crsc) + " incl. der Zusatzfragen der CRSC-Lieferantenüberwachung</p></div></div>" +
      '<h2>Angaben zum überwachten Unternehmen</h2><table class="t kv"><tbody>' +
      [["Homepage", s.homepage], ["Handelsregisternummer", s.hrnr], ["USt-IdNr.", s.ustid], ["Versicherungsnachweis", s.versicherung],
        ["Geschäftszweck", s.geschaeftszweck], ["Gründungsjahr", s.gruendungsjahr], ["Anzahl der Mitarbeiter", s.mitarbeiter]]
        .map(([l, v]) => "<tr><th>" + l + "</th><td>" + br(v) + "</td></tr>").join("") + "</tbody></table>" +
      '<h2>Funktionsträger und Zuständigkeiten</h2><table class="t"><thead><tr><th>Funktion</th><th>Name</th><th>Telefon</th><th>E-Mail</th></tr></thead><tbody>' + ft + "</tbody></table>" +
      '<h2>Verantwortliche Personen</h2><table class="t"><thead><tr><th>Funktion</th><th class="c">ja</th><th class="c">nein</th><th>Bemerkungen / verantwortliche Person(en)</th></tr></thead><tbody>' + ver + "</tbody></table>" +
      "</section>"
    );
  }

  // ---------- Auditplan ----------
  function docPlan(a) {
    const s = a.stamm;
    const rows = a.plan.zeilen.map((z) => {
      const sub = M.planUntertitel(a, z.thema);
      return '<tr><td class="c b">' + esc(z.zeit) + "</td><td><strong>" + esc(z.thema) + "</strong>" + (sub ? '<div class="dsubt">' + esc(sub) + "</div>" : "") + '</td><td class="c b">' + z.teilnehmer.map(esc).join(", ").replace(/, (Mitglied der GF|ggf\. weitere MA)/g, "<br>$1") + "</td></tr>";
    }).join("");
    const empty = a.plan.zeilen.length ? "" : Array.from({ length: 12 }, () => "<tr><td>&nbsp;</td><td></td><td></td></tr>").join("");
    return (
      '<section class="doc doc-plan">' + docHead(a, "Auditplan") +
      '<div class="two">' + addressBlock(a) + auditartBoxes(a) + "</div>" +
      "<p><strong>Basis:</strong> Checkliste CRSC Lieferantenüberwachung, DVO (EU) 2019/779 und VO (EU) Nr. 1078/2012</p>" +
      "<h2>Leistungsumfang der auditierten Organisation</h2>" + leistungList(a) +
      '<div class="two top"><div><table class="t"><thead><tr><th>CRSC e.V.</th><th>Teilnehmer</th><th>Funktion</th></tr></thead><tbody>' +
      personRows(s.team, ["firma", "name", "funktion"]) + "</tbody></table></div>" +
      '<div><table class="t"><thead><tr><th>Organisation</th><th>Teilnehmer</th><th>Funktion</th></tr></thead><tbody>' +
      personRows(s.org, [() => s.firma, "name", "funktion"]) + '<tr><td></td><td colspan="2" class="small">ggf. weitere Mitarbeiter</td></tr></tbody></table></div></div>' +
      '<table class="t plan avoid"><thead><tr><th style="width:16mm">Zeit</th><th>Auditinhalte, Themen<br><span class="norm">' + esc(M.datumLang(s.datum)) + '</span></th><th style="width:42mm">Teilnehmer</th></tr></thead><tbody>' + rows + empty + "</tbody></table>" +
      '<div class="sigs">' + sigBox("Auditplan erstellt (CRSC)", a.plan.erstelltName, a.plan.erstelltDatum) + sigBox("Auditplan bestätigt (Lieferant)", a.plan.bestaetigtName, a.plan.bestaetigtDatum) + "</div>" +
      "</section>"
    );
  }

  // ---------- Checkliste ----------
  function docCheck(a) {
    let body = "";
    const legend = '<div class="dlegend">' + M.RATINGS.map(([k, s, l]) => '<span class="dlg dlg-' + k + '">' + s + "</span> = " + l).join("") + "</div>";
    for (const bl of M.structure(a)) {
      body += '<table class="t chk"><colgroup><col style="width:15mm"><col><col class="r"><col class="r"><col class="r"><col class="r"><col style="width:48mm"><col style="width:48mm"></colgroup>' +
        '<thead><tr class="blk"><th>' + esc(bl.id) + "</th><th>" + esc(bl.title) + '</th><th class="c">e.</th><th class="c">n.e.</th><th class="c">n.g.</th><th class="c">n.z.</th><th>Abweichungen</th><th>Hinweise</th></tr></thead><tbody>';
      bl.desc.forEach((d) => (body += "<tr><td>" + esc(d.id) + '</td><td colspan="7">' + br(d.text) + "</td></tr>"));
      for (const s of bl.sections) {
        body += '<tr class="dsec"><td>' + esc(s.id) + '</td><td colspan="7">' + esc(s.title) + "</td></tr>";
        for (const it of s.items) {
          if (it.t === "q") {
            const ans = M.answer(a, M.qKey(bl.id, it.id));
            body += '<tr class="dq"><td>' + esc(it.id) + "</td><td>" + br(it.text) + "</td>" +
              ["e", "ne", "ng", "nz"].map((k) => '<td class="c rc' + (ans.r === k ? " on-" + k : "") + '">' + (ans.r === k ? "✕" : "") + "</td>").join("") +
              '<td class="small">' + br(ans.abw) + '</td><td class="small">' + br(ans.hin) + "</td></tr>";
          } else if (it.t === "sub") {
            body += '<tr class="dsec dsub"><td>' + esc(it.id) + '</td><td colspan="7">' + esc(it.text) + "</td></tr>";
          } else if (it.t === "hint") {
            body += '<tr class="dhint"><td></td><td colspan="7"><em>Hinweise für den Auditor:</em> ' + br(it.text) + "</td></tr>";
          } else {
            body += "<tr><td>" + esc(it.id) + '</td><td colspan="7"' + (it.t === "crsc" ? ' class="crsc"' : "") + ">" + br(it.text) + "</td></tr>";
          }
        }
        if (s.evidence) {
          const n = a.nachweise[M.sKey(bl.id, s.id)] || "";
          body += '<tr class="ev"><td></td><td colspan="7"><strong>Nachweise / Bemerkungen:</strong><div class="ev-text">' + br(n) + "</div></td></tr>";
        }
      }
      body += "</tbody></table>";
    }
    if (!body) body = '<p class="miss">Keine Kapitel ausgewählt.</p>';
    return '<section class="doc doc-check land">' + docHead(a, "Checkliste", esc(orgName(a)) + ", Audit vom " + esc(M.datumKurz(a.stamm.datum))) + legend + body + "</section>";
  }

  // ---------- AWP ----------
  function awpTable(a, list, typ) {
    const rows = list.map((f) => {
      const e = M.awpEntry(a, f);
      return '<tr><td class="c">' + f.nr + "</td><td>" + esc(f.punkt) + "</td><td>" + (f.text ? br(f.text) : '<span class="miss">Feststellung fehlt</span>') + "</td><td>" + esc(e.auditor) + "</td><td>" + br(e.massnahme) + "</td><td>" + esc(M.datumKurz(e.bis)) + "</td><td>" + esc(e.kontrolle) + "</td><td>" + esc(e.abgezeichnet) + "</td><td>" + br(e.anmerkung) + "</td></tr>";
    }).join("");
    return '<table class="t awp"><thead><tr><th style="width:9mm">Nr.</th><th style="width:20mm">zu Punkt</th><th>Feststellung</th><th style="width:30mm">Auditor / Fachexperte</th><th style="width:48mm">Maßnahme</th><th style="width:20mm">Erledigung bis</th><th style="width:24mm">Kontrolle durch</th><th style="width:22mm">abgezeichnet</th><th style="width:30mm">Anmerkungen</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="9" class="c small">' + (typ === "A" ? "Keine Abweichungen" : "Keine Hinweise") + "</td></tr>") + "</tbody></table>";
  }

  function docAwp(a) {
    const f = M.findings(a);
    return (
      '<section class="doc doc-awp land">' + docHead(a, "Abweichungs- und Hinweisprotokoll (AWP)") +
      '<div class="two">' + addressBlock(a) + '<div><p><strong>Auditdatum:</strong> ' + esc(M.datumKurz(a.stamm.datum)) + "</p>" + auditartBoxes(a) + "</div></div>" +
      "<p><strong>Auditkriterien:</strong> CRSC LÜ Grundsätze, DVO (EU) 2019/779 und VO (EU) Nr. 1078/2012</p>" +
      "<h2>Abweichungen</h2>" + awpTable(a, f.abw, "A") +
      "<h2>Hinweise</h2>" + awpTable(a, f.hin, "H") +
      '<div class="avoid"><h2>Zusammenfassung der Ergebnisse und des Abschlussgesprächs</h2>' + M.awpZusammenfassung(a, f.abw.length).map((t) => "<p>" + br(t) + "</p>").join("") + "</div>" +
      '<div class="sigs">' + sigBox("Auditor", personByRole(a, /auditor/i), "") + sigBox("für die überwachte Organisation", "", "") + "</div>" +
      '<div class="sigs">' + sigBox("Fachexperte", personByRole(a, /fachexpert/i), "") + "<div></div></div>" +
      "</section>"
    );
  }

  // ---------- Auditbericht ----------
  function docBericht(a) {
    const s = a.stamm;
    const f = M.findings(a);
    let kap = "";
    for (const bl of M.structure(a)) {
      kap += '<h3 class="d-rb">' + esc(bl.id) + " " + esc(bl.title) + "</h3>";
      for (const sec of bl.sections) {
        const txt = a.bericht.kapitel[M.sKey(bl.id, sec.id)] || "";
        const items = f.abw.concat(f.hin).filter((x) => x.block === bl.id && x.section === sec.id);
        kap += '<div class="d-rs"><h4>' + esc(sec.id) + ". " + esc(sec.title) + "</h4>" + (txt ? "<p>" + br(txt) + "</p>" : "") +
          items.map((x) => '<p class="' + (x.typ === "A" ? "abw" : "") + '">' + (x.typ === "A" ? "Abweichung " : "Hinweis ") + x.nr + ": " + (x.text ? br(x.text) : '<span class="miss">Feststellung fehlt</span>') + "</p>").join("") + "</div>";
      }
    }
    const people = (list) => list.filter((p) => p.name.trim()).map((p) => "<tr><td>" + esc(p.funktion) + "</td><td>" + esc(p.name) + "</td></tr>").join("");
    return (
      '<section class="doc doc-bericht">' + docHead(a, "Auditbericht") +
      '<div class="two">' + addressBlock(a) + '<div><p><strong>Basis:</strong> Grundsätze der Lieferantenüberwachung, Stand: 10.11.2025</p>' + auditartBoxes(a, "Art der Überwachung") + "</div></div>" +
      '<table class="t kv"><tbody>' +
      "<tr><th>Audittermin</th><td>" + esc(M.datumKurz(s.datum)) + "</td></tr>" +
      '<tr><th>Teilnehmer Auditteam</th><td><table class="inner">' + people(s.team) + "</table></td></tr>" +
      '<tr><th>Teilnehmer Organisation</th><td><table class="inner">' + people(s.org) + "</table></td></tr>" +
      "<tr><th>Mitgeltende Unterlagen</th><td>" + br(a.bericht.unterlagen) + "</td></tr>" +
      "<tr><th>Anlagen</th><td>" + br(a.bericht.anlagen) + "</td></tr>" +
      "</tbody></table>" +
      "<h2>Vorwort / Allgemeines</h2>" + (a.bericht.vorwort ? "<p>" + br(a.bericht.vorwort) + "</p>" : '<p class="miss">Kein Vorwort eingetragen.</p>') +
      "<h2>Auditfeststellungen</h2>" + kap +
      '<div class="avoid"><h2>Abweichungen</h2><p>' + esc(M.abwSatz(f.abw.length)) + "</p>" +
      "<h2>Hinweise und Empfehlungen</h2><p>Die Hinweise gemäß Abweichungsprotokoll wurden mit der Organisation besprochen und werden von dieser in eigener Verantwortung sinngemäß angewendet. Weitere Empfehlungen wurden der Organisation durch das Auditteam im Rahmen der Überwachung mitgeteilt.</p></div>" +
      '<div class="avoid"><h2>Auditschlussfolgerung</h2>' + M.schlussfolgerung(a, f.abw.length).map((t) => "<p>" + esc(t) + "</p>").join("") + "</div>" +
      '<div class="sigs">' + sigBox("Auditor", personByRole(a, /auditor/i), "") + sigBox("Fachexperte", personByRole(a, /fachexpert/i), "") + "</div>" +
      "</section>"
    );
  }

  const RENDER = { stamm: docStamm, plan: docPlan, check: docCheck, awp: docAwp, bericht: docBericht };

  function pageStyle(a) {
    const center = orgName(a) + " | Audit vom " + (M.datumKurz(a.stamm.datum) || "[Datum]");
    const left = "Erstellt am: " + new Date().toLocaleDateString("de-DE");
    const margins =
      "@top-left{content:" + cssString("Grundsätze der Lieferantenüberwachung") + ";font:8pt Arial,sans-serif;color:#555}" +
      "@bottom-left{content:" + cssString(left) + ";font:8pt Arial,sans-serif;color:#555}" +
      "@bottom-center{content:" + cssString(center) + ";font:8pt Arial,sans-serif;color:#555}" +
      '@bottom-right{content:"Seite " counter(page) " von " counter(pages);font:8pt Arial,sans-serif;color:#555}';
    return "<style>@page{size:A4 portrait;margin:16mm 14mm 16mm 16mm;" + margins + "}" +
      "@page land{size:A4 landscape;margin:14mm 12mm 14mm 12mm;" + margins + "}</style>";
  }

  window.Docs = {
    render(a, docs) {
      return pageStyle(a) + docs.filter((d) => RENDER[d]).map((d) => RENDER[d](a)).join("");
    },
  };
})();
