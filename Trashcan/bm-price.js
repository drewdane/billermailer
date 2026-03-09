// bm-price.js

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function roundMiles(raw) {
  const x = n(raw);
  return Math.round(x);
}

function hasRate(v) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0;
}

function mileageTierRate(rateRow, milesRounded) {
  const r0 = n(rateRow["OthMi0"]);
  const r30 = n(rateRow["OthMi30"]);
  const r100 = n(rateRow["OthMi100"]);
  if (milesRounded <= 30) return r0;
  if (milesRounded <= 100) return r30;
  return r100;
}

function baseColumn({ isRoundTrip, tripType, inLoop }) {
  if (tripType === "AMBU" && inLoop) return isRoundTrip ? "RT AMBU InLoop" : "1W Ambu InLoop";
  return (isRoundTrip ? "RT " : "1W ") + tripType; // e.g. "1W HASWC", "RT STR", "1W RECL"
}

// RECL treated as WC for mileage selection
function mileageCategory(tripType) {
  if (tripType === "HASWC" || tripType === "NEEDSWC" || tripType === "RECL") return "WC";
  if (tripType === "STR") return "STR";
  return "OTHER"; // AMBU
}

function perMileRateColumn({ isRoundTrip, tripType, milesRounded, rateRow }) {
  const cat = mileageCategory(tripType);

  if (cat === "WC") {
    const col = isRoundTrip ? "RTWCMi" : "1wWCMi";
    if (hasRate(rateRow[col])) return { kind: "col", col };
    return { kind: "tieredOther" };
  }

  if (cat === "STR") {
    if (!isRoundTrip) {
      // 1-way stretcher special: 0/30 buckets if present
      const has0 = hasRate(rateRow["1wSTR0Mi"]);
      const has30 = hasRate(rateRow["1wSTR30Mi"]);
      if (has0 && has30) return { kind: "str_1w_bucket" }; // use <31 rule
      return { kind: "tieredOther" };
    } else {
      if (hasRate(rateRow["RTSTRMi"])) return { kind: "col", col: "RTSTRMi" };
      return { kind: "tieredOther" };
    }
  }

  // OTHER (AMBU, etc.)
  return { kind: "tieredOther" };
}

function resolvePerMileRate({ isRoundTrip, tripType, milesRounded, rateRow }) {
  const sel = perMileRateColumn({ isRoundTrip, tripType, milesRounded, rateRow });

  if (sel.kind === "col") return n(rateRow[sel.col]);

  if (sel.kind === "str_1w_bucket") {
    // Your flowchart uses <31 for STR 1-way buckets :contentReference[oaicite:7]{index=7}
    return milesRounded < 31 ? n(rateRow["1wSTR0Mi"]) : n(rateRow["1wSTR30Mi"]);
  }

  // fallback: tiered other mileage rates
  return mileageTierRate(rateRow, milesRounded);
}

function computeMileageCharge({ milesRounded, rateRow, perMileRate }) {
  const included = n(rateRow["InclMi"]);
  const billableMiles = Math.max(0, milesRounded - included);
  return billableMiles * perMileRate;
}

// Main: base + mileage (accessories come after)
function computeBaseAndMileage({ trip, rateRow }) {
  const milesRounded = roundMiles(trip.DirectMileage);
  const isRoundTrip = !!trip.isRoundTrip; // you set this upstream
  const tripType = trip.tripType;         // "AMBU"|"HASWC"|"NEEDSWC"|"RECL"|"STR"
  const inLoop = !!trip.inLoop;

  const baseCol = baseColumn({ isRoundTrip, tripType, inLoop });
  const base = n(rateRow[baseCol]);

  const perMileRate = resolvePerMileRate({ isRoundTrip, tripType, milesRounded, rateRow });
  const mileage = computeMileageCharge({ milesRounded, rateRow, perMileRate });

  return { milesRounded, baseCol, base, perMileRate, mileage };
}

module.exports = { computeBaseAndMileage };