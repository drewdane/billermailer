// src/cli/bm-price-test.js
const fs = require("fs");
const path = require("path");
const { priceTrip } = require("../pricing/pricing");
function flag(name) { return process.argv.includes(name); }
function val(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i+1] : null; }

const fO2 = flag("--o2");
const fBari = flag("--bari");
const fDh = flag("--dh");
const fNoHaz = flag("--noHazmat");

const fAH = flag("--ah");
const f3S = flag("--3s");
const fWKND = flag("--wknd");
const fHOL = flag("--hol");

const waitMins = val("--wait");
const attMins = val("--att");
const dhMiles = val("--dhMiles");

const fuelStart = val("--fuelStart"); // YYYY-MM-DD
const fuelEnd = val("--fuelEnd");     // YYYY-MM-DD
const fuelRange =
  fuelStart && fuelEnd
    ? { start: parseISODateOnly(fuelStart), end: parseISODateOnly(fuelEnd) }
    : null;

function parseISODateOnly(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
  const d = new Date(y, mo, da, 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

// Simple CSV parser that handles quotes reasonably well (good enough for BM inputs)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  const header = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.length && r.some(c => String(c).trim() !== ""))
    .map(r => {
      const obj = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? "";
      return obj;
    });
}

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

const tripsFile = arg("--trips");
const rateFile = arg("--rate");
const wantAccountCode = arg("--accountCode");
const wantBillingName = arg("--billingName");
const noAccessories = hasFlag("--noAccessories");

if (!tripsFile || !rateFile) {
  console.log("Usage:");
  console.log("  node src/cli/bm-price-test.js --trips <trips.csv> --rate <accounts.csv> [--accountCode \"...\"] [--billingName \"...\"] [--noAccessories]");
  process.exit(1);
}

const tripsText = fs.readFileSync(path.resolve(tripsFile), "utf8");
const rateText = fs.readFileSync(path.resolve(rateFile), "utf8");
const trips = parseCsv(tripsText);
const rateRows = parseCsv(rateText);

function norm(s) {
  return String(s || "").trim().toLowerCase();
}

let rateRow = null;

if (wantAccountCode) {
  const key = norm(wantAccountCode);
  rateRow = rateRows.find(r => norm(r.AccountCode) === key);
  if (!rateRow) {
    console.log(`ERROR: No row found with AccountCode = "${wantAccountCode}"`);
    process.exit(1);
  }
} else if (wantBillingName) {
  const key = norm(wantBillingName);
  rateRow = rateRows.find(r => norm(r.billingName) === key);
  if (!rateRow) {
    console.log(`ERROR: No row found with billingName = "${wantBillingName}"`);
    process.exit(1);
  }
} else {
  // fallback: first row
  rateRow = rateRows[0];
}

console.log("\nBM price test\n");
console.log(`Trips: ${trips.length}`);
console.log(`Rate row: ${rateRow.billingName || rateRow.AccountCode || "(unknown)"}`);
console.log("");

const header =
  pad("#", 3) +
  pad("Rider", 22) +
  pad("Status", 12) +
  pad("Type", 8) +
  pad("Mi", 5) +
  pad("Base", 10) +
  pad("Mile$", 10) +
  pad("Acc$", 10) +
  pad("Total", 10) +
  " Flags";
console.log(header);
console.log("-".repeat(header.length));

trips.forEach((t, i) => {
  // cheap defaults for test if tripType not present
  if (!t.tripType) {
    const mob = String(t.Mobility || "").toUpperCase();
    t.tripType = mob === "S" ? "STR" : (mob === "WC" ? "HASWC" : "AMBU");
  }
  if (!("isRoundTrip" in t)) t.isRoundTrip = false;
  if (!("inLoop" in t)) t.inLoop = false;

  // If you want "base+mileage only" tests
  if (noAccessories) {
    t.RemoveHazmat = "true";
    t.AddO2 = "false";
    t.AddWait = "false";
    t.AddAtt = "false";
    t.AddBari = "false";
    t.AddDeadhead = "false";
  }
    if (fNoHaz) t.RemoveHazmat = "true";

    if (fO2) t.AddO2 = "true";

    if (waitMins) { t.AddWait = "true"; t.WaitTotalMinutes = String(waitMins); }
    if (attMins)  { t.AddAtt = "true";  t.AttTotalMinutes = String(attMins); }

    if (fBari) t.AddBari = "true";

    if (fDh) {
      t.AddDeadhead = "true";
      if (dhMiles) t.DeadheadMiles = String(dhMiles);
    }

    if (fAH) t.AddAH = "true";
    if (f3S) t.Add3S = "true";
    if (fWKND) t.AddWKND = "true";
    if (fHOL) t.AddHOL = "true";

  const res = priceTrip(t, rateRow, {
    defaultWaitGraceMinutes: 30,
    fuelSurchargeRange: fuelRange
  });

  const accTotal = (res.accessories || []).reduce(
    (sum, a) => sum + Number(a.amount || 0),
    0
  );

  const accDetail = (res.accessories || [])
    .map(a => `${a.code}:${Number(a.amount || 0).toFixed(2)}`)
    .join(",");

  const rider = `${t.FirstName || ""} ${t.LastName || ""}`.trim();

  const line =
    pad(String(i + 1), 3) +
    pad(rider, 22) +
    pad(res.status || t.RideStatus || "", 12) +
    pad(t.tripType || t.Mobility || "", 8) +
    pad((res.debug?.milesRounded ?? ""), 5) +
    pad(res.base.toFixed(2), 10) +
    pad(res.mileage.toFixed(2), 10) +
    pad(accTotal.toFixed(2), 10) +
    pad(res.total.toFixed(2), 10) +
    (res.flags?.length ? " " + res.flags.join(",") : "") +
    (accDetail ? "  " + accDetail : "");

  console.log(line);
});

console.log("\nDone.\n");