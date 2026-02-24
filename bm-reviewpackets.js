// bm-reviewpackets.js
// Build per-facility/per-period review packets from bm_harvest.csv
//
// Usage:
//   node bm-reviewpackets.js --in data\output\bm_harvest_jan_2026.csv --outDir data\output\review
//
// This creates:
//   outDir/
//     config.json (if missing)
//     index.json
//     <AccountCode>/
//       <PeriodKey>/
//         items.json
//         overrides.json (created if missing)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parse } = require("csv-parse/sync");

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const inPath = arg("--in", "bm_harvest.csv");
const outDir = arg("--outDir", "data\\output\\review");

function normalizeHeader(h) {
  return String(h ?? "").trim();
}

function hasValue(v) {
  return String(v ?? "").trim().length > 0;
}

// RideDate example: "1/2/2026 12:00:00 AM" -> ISO "2026-01-02"
function rideDateToISO(rideDateStr) {
  const s = String(rideDateStr ?? "").trim();
  const datePart = s.split(" ")[0];
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function sha1(str) {
  return crypto.createHash("sha1").update(str, "utf8").digest("hex");
}

function computeLineId(r) {
  const parts = [
    r.AccountCode,
    r.RideDateISO,
    r.ScheduledPickupTime,
    r.FirstName,
    r.LastName,
    r.PickupAddress1,
    r.DropoffAddress1,
    r.DirectMileage,
    r.Mobility,
  ].map((x) => String(x ?? "").trim());
  return sha1(parts.join("|"));
}

function safeSegment(s) {
  return String(s ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

// --- Period logic config ---
const CONFIG_PATH = path.join(outDir, "config.json");
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    // default to biweekly with a placeholder anchor you can edit later
    const cfg = {
      period: {
        mode: "biweekly", // "biweekly" or "semi_monthly"
        biweekly_anchor_iso: "2026-01-01", // edit later when you confirm
      },
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
    return cfg;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function periodKeySemiMonthly(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  const half = d <= 15 ? "01-15" : "16-EOM";
  return `${y}-${mm}_${half}`;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function compareISO(a, b) {
  return a.localeCompare(b);
}

function periodKeyBiweekly(isoDate, anchorIso) {
  // Find which 14-day window (starting at anchor) this date falls into
  // Window: [anchor + 14*k, anchor + 14*(k+1) - 1]
  // We compute k by iterating in 14d steps—fast enough for 689 rows.
  let start = anchorIso;
  let end = addDaysISO(start, 13);

  // If isoDate before anchor, move backward
  while (compareISO(isoDate, start) < 0) {
    start = addDaysISO(start, -14);
    end = addDaysISO(start, 13);
  }
  while (compareISO(isoDate, end) > 0) {
    start = addDaysISO(start, 14);
    end = addDaysISO(start, 13);
  }
  return `${start}_to_${end}`; // explicit, no ambiguity
}

function periodKeyFor(isoDate, cfg) {
  const mode = cfg.period?.mode ?? "biweekly";
  if (mode === "semi_monthly") return periodKeySemiMonthly(isoDate);
  const anchor = cfg.period?.biweekly_anchor_iso ?? "2026-01-01";
  return periodKeyBiweekly(isoDate, anchor);
}

// --------------------------

if (!fs.existsSync(inPath)) {
  console.error(`Input not found: ${path.resolve(inPath)}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const cfg = loadConfig();

const raw = fs.readFileSync(inPath, "utf8");
const records = parse(raw, {
  columns: (header) => header.map(normalizeHeader),
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
});

let badDate = 0;
let missingAccount = 0;

const index = {
  generatedAt: new Date().toISOString(),
  inputFile: path.resolve(inPath),
  periodMode: cfg.period.mode,
  facilities: {}, // AccountCode -> { AccountName, periods: { periodKey: { count } } }
};

for (const r of records) {
  const acctCode = String(r.AccountCode ?? "").trim();
  const acctName = String(r.AccountName ?? "").trim();
  if (!hasValue(acctCode)) {
    missingAccount++;
    continue;
  }

  const iso = rideDateToISO(r.RideDate);
  if (!iso) {
    badDate++;
    continue;
  }

  const enriched = { ...r, RideDateISO: iso };
  enriched.LineId = computeLineId(enriched);
  enriched.Action = "INCLUDE"; // INCLUDE | EXCLUDE | MODIFY | MOVE
  enriched.Modifier = "NONE";  // NONE | HALF | FREE
  enriched.Note = "";
  enriched.MoveToAccountCode = ""; // when Action=MOVE

  const pKey = periodKeyFor(iso, cfg);

  const facDir = path.join(outDir, safeSegment(acctCode));
  const periodDir = path.join(facDir, safeSegment(pKey));
  fs.mkdirSync(periodDir, { recursive: true });

  const itemsPath = path.join(periodDir, "items.json");
  const overridesPath = path.join(periodDir, "overrides.json");

  // append line item to items.json (load+write; fine at this scale)
  let items = [];
  if (fs.existsSync(itemsPath)) items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  items.push(enriched);
  fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2), "utf8");

  // create overrides.json if missing
  if (!fs.existsSync(overridesPath)) {
    fs.writeFileSync(overridesPath, JSON.stringify({ overrides: {} }, null, 2), "utf8");
  }

  // update index
  if (!index.facilities[acctCode]) {
    index.facilities[acctCode] = { AccountName: acctName, periods: {} };
  }
  index.facilities[acctCode].periods[pKey] = index.facilities[acctCode].periods[pKey] || { count: 0 };
  index.facilities[acctCode].periods[pKey].count += 1;
}

fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2), "utf8");

console.log("BM review packets created.");
console.log(`Rows read: ${records.length}`);
console.log(`Bad RideDate parse: ${badDate}`);
console.log(`Missing AccountCode: ${missingAccount}`);
console.log(`Output folder: ${path.resolve(outDir)}`);
console.log(`Config: ${path.resolve(CONFIG_PATH)}`);
console.log(`Index: ${path.resolve(path.join(outDir, "index.json"))}`);