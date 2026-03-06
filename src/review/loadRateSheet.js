// src/review/loadRateSheet.js

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

function normalizeHeader(h) {
  return String(h || "").trim();
}

function normalizeKey(v) {
  return String(v || "").trim().toLowerCase();
}

function loadRateSheet(csvPath) {
  const fullPath = path.resolve(process.cwd(), csvPath);
  const raw = fs.readFileSync(fullPath, "utf8");

  const rows = parse(raw, {
    columns: (header) => header.map(normalizeHeader),
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  return rows;
}

function makeRateLookup(rateRows) {
  const byCode = new Map();
  const byName = new Map();

  for (const row of rateRows) {
    const code = normalizeKey(row.AccountCode);
    const name = normalizeKey(row.AccountName);

    if (code) byCode.set(code, row);
    if (name) byName.set(name, row);
  }

  return function rateLookupFn(trip) {
    const code = normalizeKey(trip.AccountCode);
    const name = normalizeKey(trip.AccountName);

    if (code && byCode.has(code)) return byCode.get(code);
    if (name && byName.has(name)) return byName.get(name);
    return null;
  };
}

module.exports = {
  loadRateSheet,
  makeRateLookup,
};