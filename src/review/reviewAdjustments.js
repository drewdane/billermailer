// src/review/reviewAdjustments.js

const { num } = require("../pricing/rateLookup");

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return row[k];
  }
  return "";
}

function money(v) {
  const cleaned = String(v ?? "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const n = Number(cleaned || 0);
  return Number.isFinite(n) ? n : 0;
}

function normMobility(m) {
  return String(m || "").trim().toUpperCase();
}

function parseRideHoursToMinutes(v) {
  const s = String(v || "").trim();
  if (!s) return 0;

  // supports "1.5", "1.50", "01:30", "1:30"
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Math.round(Number(s) * 60);
  }

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    return Number(m[1]) * 60 + Number(m[2]);
  }

  return 0;
}

function computeO2Charge(groupedTrip, rateRow) {
  const rate = money(pick(rateRow, ["o2_rate", "O2_rate"]));
  if (!rate) return 0;

  const blockMin = money(pick(rateRow, ["o2_block_min", "O2_block_min"]));
  const transportMinutes = parseRideHoursToMinutes(groupedTrip.RideHours);

  if (blockMin > 0 && transportMinutes > 0) {
    return Math.ceil(transportMinutes / blockMin) * rate;
  }

  return rate;
}

function computeBariCharge(groupedTrip, rateRow) {
  const shape = String(groupedTrip.TripShape || "ONE_WAY").toUpperCase();
  const mobility = normMobility(groupedTrip.Mobility);

  const isRt = shape === "ROUND_TRIP";
  const isStr = mobility === "STR" || mobility === "RECL";
  const oneWayKey = isStr ? "bari_str_1w_fee" : "bari_wc_1w_fee";
  const rtKey = isStr ? "bari_str_rt_fee" : "bari_wc_rt_fee";

  const exact = money(rateRow[isRt ? rtKey : oneWayKey]);
  if (exact) return exact;

  // fallback to WC 1W model if matrix is incomplete
  return money(rateRow["bari_wc_1w_fee"]);
}

function computeHazmatCharge(groupedTrip, rateRow) {
  return money(rateRow["hazmat_fee"]);
}

function computeAvailableCharges(groupedTrip, rateRow) {
  return {
    hazmat: computeHazmatCharge(groupedTrip, rateRow),
    o2: computeO2Charge(groupedTrip, rateRow),
    bari: computeBariCharge(groupedTrip, rateRow),
  };
}

function computeDeadheadCharge(groupedTrip, rateRow) {
  const dhMiles = money(groupedTrip.DirectMileage);
  if (dhMiles <= 0) return 0;

  const flatFee = money(rateRow["dh_flat_fee"]);
  if (flatFee > 0) return flatFee;

  const startMiles = money(rateRow["dh_start_miles"]);
  if (startMiles > 0 && dhMiles < startMiles) return 0;

  const tripMiles = money(groupedTrip.DirectMileage);

  const rate1 = money(rateRow["dh_rate_tier1"]);
  const rate2 = money(rateRow["dh_rate_tier2"]);
  const rate3 = money(rateRow["dh_rate_tier3"]);

  const tier2Start = money(rateRow["dh_tier2_start_miles"]);
  const tier3Start = money(rateRow["dh_tier3_start_miles"]);

  let rate = 0;

  if (tier3Start > 0 && tripMiles >= tier3Start && rate3 > 0) {
    rate = rate3;
  } else if (tier2Start > 0 && tripMiles >= tier2Start && rate2 > 0) {
    rate = rate2;
  } else if (rate1 > 0) {
    rate = rate1;
  } else if (rate2 > 0) {
    rate = rate2;
  } else if (rate3 > 0) {
    rate = rate3;
  }

  return dhMiles * rate;
}

module.exports = {
  computeAvailableCharges,
  computeDeadheadCharge,
};