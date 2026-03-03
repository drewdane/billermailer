// src/pricing/rateLookup.js (v2 schema)

function num(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(/\$/g, "").replace(/,/g, "");
  if (!s || s.toLowerCase() === "nan") return 0;
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}

function hasRate(v) {
  return num(v) > 0;
}

function roundMiles(raw) {
  const x = Number(raw);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

// tiers: 0–30, 31–100, 101+
function tieredOtherPerMile(rateRow, milesRounded) {
  const r0 = num(rateRow.mile_rate_0_30);
  const r31 = hasRate(rateRow.mile_rate_31_100) ? num(rateRow.mile_rate_31_100) : r0;
  const r101 = hasRate(rateRow.mile_rate_101_plus) ? num(rateRow.mile_rate_101_plus) : r31;

  if (milesRounded <= 30) return { perMile: r0, source: "mile_rate_0_30" };
  if (milesRounded <= 100) return { perMile: r31, source: "mile_rate_31_100" };
  return { perMile: r101, source: "mile_rate_101_plus" };
}

// base columns are now normalized (no case pain)
function baseColumn({ isRoundTrip, tripType, inLoop }) {
  const tt = String(tripType || "").trim().toLowerCase(); // ambu, haswc, needwc, recl, str

  if (tt === "ambu" && inLoop) return isRoundTrip ? "base_rt_ambu_inloop" : "base_1w_ambu_inloop";
  return (isRoundTrip ? "base_rt_" : "base_1w_") + tt;
}

// RECL treated as WC for mileage selection
function mileageCategory(tripType) {
  const tt = String(tripType || "").trim().toUpperCase();
  if (tt === "HASWC" || tt === "NEEDWC" || tt === "RECL") return "WC";
  if (tt === "STR") return "STR";
  return "OTHER";
}

function resolvePerMile({ rateRow, isRoundTrip, tripType, milesRounded }) {
  const cat = mileageCategory(tripType);

  if (cat === "WC") {
    const col = isRoundTrip ? "wc_mile_rate_rt" : "wc_mile_rate_1w";
    if (hasRate(rateRow[col])) return { perMile: num(rateRow[col]), source: col };
    return tieredOtherPerMile(rateRow, milesRounded);
  }

  if (cat === "STR") {
    if (!isRoundTrip) {
      const has0 = hasRate(rateRow.str_mile_rate_1w_0_30);
      const has31 = hasRate(rateRow.str_mile_rate_1w_31_plus);
      if (has0 && has31) {
        const col = (milesRounded <= 30) ? "str_mile_rate_1w_0_30" : "str_mile_rate_1w_31_plus";
        return { perMile: num(rateRow[col]), source: col };
      }
      return tieredOtherPerMile(rateRow, milesRounded);
    } else {
      if (hasRate(rateRow.str_mile_rate_rt)) return { perMile: num(rateRow.str_mile_rate_rt), source: "str_mile_rate_rt" };
      return tieredOtherPerMile(rateRow, milesRounded);
    }
  }

  return tieredOtherPerMile(rateRow, milesRounded);
}

module.exports = {
  num,
  hasRate,
  roundMiles,
  baseColumn,
  resolvePerMile,
  mileageCategory
};