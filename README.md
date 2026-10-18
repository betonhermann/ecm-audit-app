# ECM Audit

Desktop-App (Tauri) als Ersatz für die Excel-Auditcheckliste „Auditcheckliste ECM I, II, III und IV“ (Beta 5.0, Makros v6.7).

## Aufbau

- `dist/` – die Oberfläche (HTML, CSS, JavaScript ohne Build-Schritt)
  - `js/catalog.js` – Fragenkatalog, automatisch erzeugt aus der Excel
  - `js/model.js` – Datenmodell und Auswertungslogik (nachgebaut aus den VBA-Modulen)
  - `js/app.js` – Bedienoberfläche
  - `js/docs.js` – Druckansichten (Stammdaten, Auditplan, Checkliste, AWP, Auditbericht)
- `src-tauri/` – Rust-Teil: speichert jedes Audit als JSON-Datei
  - Windows: `%APPDATA%\de.deiss-it.ecm-audit\audits\`
  - Gelöschte Audits landen in `audits\papierkorb\`
  - Exporte gehen in den Download-Ordner
- `tools/build_catalog.py` – erzeugt `dist/js/catalog.js` aus der Excel

## Fragenkatalog aktualisieren

Wenn sich die CRSC-Grundsätze ändern, die neue Excel-Datei einlesen:

```
pip install openpyxl
python3 tools/build_catalog.py "pfad/zur/Auditcheckliste.xlsm"
```

Danach Version in `src-tauri/tauri.conf.json` und `package.json` erhöhen, committen und pushen. GitHub Actions baut die Installer.

Bestehende Audits behalten ihre Antworten, solange die Fragennummern gleich bleiben (Schlüssel ist Block + Nummer, z. B. `I|1.1.6`).

## Entwickeln

```
npm install
npm run tauri dev
```

Die Oberfläche lässt sich auch direkt im Browser öffnen (`dist/index.html`). Dann wird im localStorage gespeichert statt in Dateien.

## Abweichungen zur Excel (bewusst korrigiert)

- Auditbericht: Beim Erstaudit „Erteilung“ statt „Erstellung“ des Konformitätsnachweises (wie im AWP).
- Auditschlussfolgerung ohne Abweichungen: kein Satz „Nach der nachweislichen Korrektur der o. g. Abweichungen …“.
- Hinweise gehen ins AWP, auch wenn die Frage nicht angekreuzt ist.
- I.I 10.2 (in der Excel bewertbar, aber ohne Text) ist das Feld „Nachweise / Bemerkungen“ von Kapitel 10.
- Nachweisfeld von Kapitel 11 erscheint, sobald 11.1, 11.2 oder 11.3 gewählt ist.
- Kapitel II 6 erscheint im Auditbericht (in der Excel fehlte es wegen der Nummer „6.0“).
- Teilnehmer der Organisation im Auditplan werden vollständig übernommen (Excel verwies doppelt auf Zeile 59).
- Kapitelauswahl „11. Management von Anlagen …“ entfällt, sie wirkte in der Excel identisch zu 11.1.
