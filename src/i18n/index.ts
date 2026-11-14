import { settings } from "../settings/store";
import { en } from "./en";
import { id } from "./id";

/*
 * Translation: the German text lives directly in the code and doubles as the key;
 * `id.ts` provides the Indonesian version (default) and `en.ts` provides the English version.
 * Placeholders: t("vor {n} Min.", { n: 5 }).
 *
 * No hook needed: the notch subscribes to the settings and re-renders the whole tree
 * when the language changes. Send module-level constants (label lists) through t()
 * only at render time, otherwise they stay in the startup language.
 */
export type Language = "id" | "en";

export function lang(): Language {
  const l = settings.get().language;
  return (l === "en" ? "en" : "id") as Language;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const currentLang = lang();
  let s = currentLang === "en" ? (en[key] ?? key) : (id[key] ?? key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Locale for Intl (numbers, dates, weekdays). */
export function locale(): string {
  return lang() === "en" ? "en-GB" : "id-ID";
}

/** Error texts from Rust (AI chat, converter) arrive in German; translate them by pattern. */
const backendPatternsEn: [RegExp, string][] = [
  [/^Kein Modell eingetragen$/, "No model set"],
  [/^Base-URL muss mit https:\/\/ beginnen$/, "Base URL must start with https://"],
  [/^Unbekannter Anbieter: (.*)$/, "Unknown provider: $1"],
  [/^Schlüssel abgelehnt \((\d+)\) – (.*)$/s, "Key rejected ($1) – $2"],
  [/^Nicht gefunden \(404\) – Base-URL oder Modell prüfen\. (.*)$/s, "Not found (404) – check base URL or model. $1"],
  [/^Limit erreicht \(429\) – kurz warten$/, "Rate limit reached (429) – wait a moment"],
  [/^Fehler (\d+): (.*)$/s, "Error $1: $2"],
  [/^Datei nicht mehr vorhanden$/, "File no longer exists"],
  [/^Dateien nicht mehr vorhanden$/, "Files no longer exist"],
  [/^Ist schon in diesem Format$/, "Already in this format"],
  [/^Format wird nicht unterstützt$/, "Format not supported"],
  [/^Kann nicht speichern: (.*)$/s, "Cannot save: $1"],
  [/^Zielformat für Bilder nicht verfügbar$/, "Target format not available for images"],
  [/^Zielformat für Audio\/Video nicht verfügbar$/, "Target format not available for audio/video"],
  [/^Zielformat für Dokumente nicht verfügbar$/, "Target format not available for documents"],
  [/^Zielformat für Tabellen nicht verfügbar$/, "Target format not available for spreadsheets"],
  [/^Datei nicht lesbar: (.*)$/s, "Cannot read file: $1"],
  [/^PDF-Text nicht lesbar \(evtl\. nur Bilder\/Scan\)$/, "Cannot read PDF text (maybe only images/scan)"],
  [/^Keine gültige DOCX-Datei$/, "Not a valid DOCX file"],
  [/^DOCX-Inhalt nicht lesbar$/, "Cannot read DOCX content"],
  [/^Tabelle nicht lesbar$/, "Cannot read spreadsheet"],
  [/^Tabelle hat kein Blatt$/, "Spreadsheet has no sheet"],
  [/^Tabelle ist leer$/, "Spreadsheet is empty"],
  [/^CSV nicht lesbar$/, "Cannot read CSV"],
  [/^Für PDF wird Microsoft Edge oder Chrome benötigt$/, "PDF needs Microsoft Edge or Chrome"],
  [/^PDF konnte nicht erstellt werden$/, "PDF could not be created"],
  [/^PDF-Druck startet nicht: (.*)$/s, "PDF printing failed to start: $1"],
  [/^Umwandlung fehlgeschlagen: (.*)$/s, "Conversion failed: $1"],
  [/^ffmpeg startet nicht: (.*)$/s, "ffmpeg won't start: $1"],
  [/^Client-Secret fehlt$/, "Client secret missing"],
  [/^Keine Verbindung$/, "No connection"],
  [/^Keine Verbindung: (.*)$/s, "No connection: $1"],
  [/^Bild konnte nicht gelesen werden$/, "Cannot read image"],
  [/^Kein Token$/, "No token received"],
  [/^Kein Code$/, "No code received"],
  [/^Token abgelehnt$/, "Token rejected"],
  [/^Abgelehnt$/, "Declined"],
  [/^Im Portal http:\/\/localhost als Redirect eintragen$/, "Add http://localhost as a redirect in the developer portal"],
];

const backendPatternsId: [RegExp, string][] = [
  [/^Kein Modell eingetragen$/, "Tidak ada model yang dipilih"],
  [/^Base-URL muss mit https:\/\/ beginnen$/, "Base URL harus dimulai dengan https://"],
  [/^Unbekannter Anbieter: (.*)$/, "Penyedia tidak dikenal: $1"],
  [/^Schlüssel abgelehnt \((\d+)\) – (.*)$/s, "Kunci ditolak ($1) – $2"],
  [/^Nicht gefunden \(404\) – Base-URL oder Modell prüfen\. (.*)$/s, "Tidak ditemukan (404) – periksa base URL atau model. $1"],
  [/^Limit erreicht \(429\) – kurz warten$/, "Batas limit tercapai (429) – tunggu sebentar"],
  [/^Fehler (\d+): (.*)$/s, "Error $1: $2"],
  [/^Datei nicht mehr vorhanden$/, "File sudah tidak ada"],
  [/^Dateien nicht mehr vorhanden$/, "File-file sudah tidak ada"],
  [/^Ist schon in diesem Format$/, "Sudah dalam format ini"],
  [/^Format wird nicht unterstützt$/, "Format tidak didukung"],
  [/^Kann nicht speichern: (.*)$/s, "Tidak dapat menyimpan: $1"],
  [/^Zielformat für Bilder nicht verfügbar$/, "Format tujuan untuk gambar tidak tersedia"],
  [/^Zielformat für Audio\/Video nicht verfügbar$/, "Format tujuan untuk audio/video tidak tersedia"],
  [/^Zielformat für Dokumente nicht verfügbar$/, "Format tujuan untuk dokumen tidak tersedia"],
  [/^Zielformat für Tabellen nicht verfügbar$/, "Format tujuan untuk tabel/spreadsheet tidak tersedia"],
  [/^Datei nicht lesbar: (.*)$/s, "File tidak dapat dibaca: $1"],
  [/^PDF-Text nicht lesbar \(evtl\. nur Bilder\/Scan\)$/, "Teks PDF tidak dapat dibaca (mungkin hanya gambar/scan)"],
  [/^Keine gültige DOCX-Datei$/, "Bukan file DOCX yang valid"],
  [/^DOCX-Inhalt nicht lesbar$/, "Konten DOCX tidak dapat dibaca"],
  [/^Tabelle nicht lesbar$/, "Spreadsheet tidak dapat dibaca"],
  [/^Tabelle hat kein Blatt$/, "Spreadsheet tidak memiliki lembar kerja"],
  [/^Tabelle ist leer$/, "Spreadsheet kosong"],
  [/^CSV nicht lesbar$/, "CSV tidak dapat dibaca"],
  [/^Für PDF wird Microsoft Edge oder Chrome benötigt$/, "PDF membutuhkan Microsoft Edge atau Chrome"],
  [/^PDF konnte nicht erstellt werden$/, "PDF gagal dibuat"],
  [/^PDF-Druck startet nicht: (.*)$/s, "Gagal memulai pencetakan PDF: $1"],
  [/^Umwandlung fehlgeschlagen: (.*)$/s, "Konversi gagal: $1"],
  [/^ffmpeg startet nicht: (.*)$/s, "ffmpeg gagal berjalan: $1"],
  [/^Client-Secret fehlt$/, "Client secret tidak ada"],
  [/^Keine Verbindung$/, "Tidak ada koneksi"],
  [/^Keine Verbindung: (.*)$/s, "Tidak ada koneksi: $1"],
  [/^Bild konnte nicht gelesen werden$/, "Gambar tidak dapat dibaca"],
  [/^Kein Token$/, "Tidak ada token yang diterima"],
  [/^Kein Code$/, "Tidak ada kode yang diterima"],
  [/^Token abgelehnt$/, "Token ditolak"],
  [/^Abgelehnt$/, "Ditolak"],
  [/^Im Portal http:\/\/localhost als Redirect eintragen$/, "Tambahkan http://localhost sebagai redirect di portal developer"],
];

export function tBackend(msg: string): string {
  const currentLang = lang();
  const patterns = currentLang === "en" ? backendPatternsEn : backendPatternsId;
  for (const [re, translated] of patterns) if (re.test(msg)) return msg.replace(re, translated);
  return msg;
}
