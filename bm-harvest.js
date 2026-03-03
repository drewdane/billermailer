// bm-harvest.js
// BillerMailer (BM) - Harvest step
//
// Purpose:
// - Read a TripMaster CSV export that contains MANY columns.
// - Extract ONLY the billing-relevant columns you specified (TARGET_COLUMNS),
//   preserving their order.
// - Skip only:
//    1) rows missing RideDate
//    2) rows missing BOTH AccountCode and AccountName
//    3) rows where AccountName OR AccountCode is exactly "Private Pay"
// - DO NOT filter by RideStatus (status is carried through as data).
//
// Usage:
//   node bm-harvest.js --in data\input\tripmaster_export.csv --out data\output\bm_harvest.csv --skipped data\output\bm_skipped.csv
//
// Install dependency:
//   npm i csv-parse

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parse } = require("csv-parse/sync");

// --- The exact columns you provided (order preserved) ---
const TARGET_COLUMNS = [
  "FirstName",
  "LastName",
  "MiddleInitial",
  "Comments",
  "ConfirmationNumber",
  "RideDate",
  "ScheduledPickupTime",
  "PickupArrivalTime",
  "ActualPickupTime",
  "DropoffArrivalTime",
  "ActualDropoffTime",
  "ScheduledDropoffTime",
  "DirectDriveDuration",
  "RideHours",
  "Mobility",
  "RideStatus",
  "DirectMileage",
  "Comments1",
  "PickupName",
  "PickupAddress1",
  "PickupCity",
  "PickupState",
  "PickupZip",
  "DropoffName",
  "DropoffAddress1",
  "DropoffCity",
  "DropoffState",
  "DropoffZip",
  "AccountCode",
  "AccountName",
];

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const inPathRaw = arg("--in");
const outPathRaw = arg("--out", "bm_harvest.csv");
const skippedPathRaw = arg("--skipped", "bm_skipped.csv");

if (!inPathRaw) {
  console.error("Missing --in <path to raw TripMaster CSV>");
  process.exit(1);
}

// Resolve relative paths against current working directory for clarity.
const inPath = path.resolve(process.cwd(), inPathRaw);
const outPath = path.resolve(process.cwd(), outPathRaw);
const skippedPath = path.resolve(process.cwd(), skippedPathRaw);

function normalizeHeader(h) {
  // Conservative: trim only. (Prevents "AccountName " issues)
  return String(h ?? "").trim();
}

function hasValue(v) {
  return String(v ?? "").trim().length > 0;
}

function isSkipAccount(row) {
  const code = String(row["AccountCode"] ?? "").trim();
  const name = String(row["AccountName"] ?? "").trim();
  return (
    code === "Private Pay" || name === "Private Pay" ||
    code === "CTT Comp"   || name === "CTT Comp"
  );
}

function validateRow(row) {
  // Status is NOT a filter.
  if (!hasValue(row["RideDate"])) return "missing RideDate";
  if (!hasValue(row["AccountCode"]) && !hasValue(row["AccountName"]))
    return "missing AccountCode/AccountName";
  if (isSkipAccount(row)) return "non-invoiced account (skip)";
  return null;
}

function csvEscape(v) {
  const s = String(v ?? "");
  // Escape quotes by doubling them; quote field if it contains comma, quote, or newline
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsvLine(values) {
  return values.map(csvEscape).join(",");
}

if (!fs.existsSync(inPath)) {
  console.error(`Input file not found: ${inPath}`);
  console.error(
    `Tip: from your BM folder, run: dir (or ls) to confirm the filename and location.`
  );
  process.exit(1);
}

const raw = fs.readFileSync(inPath, "utf8");

// hash for run traceability (useful for later state tracking)
const fileHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 12);

let records;
try {
  records = parse(raw, {
    columns: (header) => header.map(normalizeHeader),
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });
} catch (err) {
  console.error("Failed to parse CSV. If this came from LibreOffice, re-export as CSV with:");
  console.error(" - UTF-8");
  console.error(' - Field delimiter: ","');
  console.error(' - String delimiter: \'"\'');
  console.error(" - Save cell content as shown: checked");
  console.error("\nParse error:", err?.message ?? err);
  process.exit(1);
}

if (!records.length) {
  console.error("No records found in CSV.");
  process.exit(1);
}

// Confirm required headers exist (case-sensitive, since you gave exact names)
const headers = Object.keys(records[0]);
const missingHeaders = TARGET_COLUMNS.filter((c) => !headers.includes(c));
if (missingHeaders.length) {
  console.error("Missing expected columns in input CSV:");
  for (const h of missingHeaders) console.error("  -", h);
  console.error("\nTip: Check for spelling/case differences or trailing spaces in headers.");
  console.error("If the export uses different header names, we'll add a mapping alias table.");
  process.exit(1);
}

// Prepare outputs
const outLines = [];
const skippedLines = [];

// Add file hash column so downstream steps can detect reprocessing / provenance
outLines.push(toCsvLine([...TARGET_COLUMNS, "SourceFileHash"]));
skippedLines.push(toCsvLine([...TARGET_COLUMNS, "SkipReason", "SourceFileHash"]));

let kept = 0;
let skipped = 0;

for (const row of records) {
  // Narrow row to target columns
  const narrowed = {};
  for (const col of TARGET_COLUMNS) narrowed[col] = row[col];

  const reason = validateRow(narrowed);
  if (reason) {
    skipped++;
    skippedLines.push(
      toCsvLine([...TARGET_COLUMNS.map((c) => narrowed[c] ?? ""), reason, fileHash])
    );
    continue;
  }

  kept++;
  outLines.push(toCsvLine([...TARGET_COLUMNS.map((c) => narrowed[c] ?? ""), fileHash]));
}

// Ensure output dirs exist
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.mkdirSync(path.dirname(skippedPath), { recursive: true });

// Write files
fs.writeFileSync(outPath, outLines.join("\n"), "utf8");
fs.writeFileSync(skippedPath, skippedLines.join("\n"), "utf8");

console.log(`BM harvest complete.`);
console.log(`Input file:  ${inPath}`);
console.log(`Input rows:  ${records.length}`);
console.log(`Kept rows:   ${kept}`);
console.log(`Skipped:     ${skipped}`);
console.log(`Output CSV:  ${outPath}`);
console.log(`Skipped CSV: ${skippedPath}`);
console.log(`Hash:        ${fileHash}`);