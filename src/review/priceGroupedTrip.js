// src/review/priceGroupedTrip.js

const {
  num,
  roundMiles,
  baseColumn,
  resolvePerMile,
} = require("../pricing/rateLookup");

const { applySpecialPricingRules } = require("./specialPricing");

function normStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function classifyStatus(statusRaw) {
  const s = normStatus(statusRaw);
  if (s === "rode") return { kind: "RODE" };
  if (s === "noshow" || s === "ridercancel") return { kind: "CANCEL_FEE" };
  return { kind: "UNKNOWN" };
}

function mapMobilityToTripType(mobilityRaw) {
  const raw = String(mobilityRaw || "").trim().toUpperCase();
  const flags = [];

  if (!raw) return { tripType: null, flags: ["MOBILITY_MISSING"] };

  if (raw === "AMBU" || raw === "A" || raw.includes("AMBU")) {
    return { tripType: "AMBU", flags };
  }

  if (raw === "STR" || raw === "S" || raw.includes("STR") || raw.includes("STRETCH")) {
    return { tripType: "STR", flags };
  }

  if (raw === "RECL" || raw.includes("RECL")) {
    return { tripType: "RECL", flags };
  }

  if (raw.includes("HASWC") || raw.includes("HAS WC") || raw.includes("OWN WC")) {
    return { tripType: "HASWC", flags };
  }

  if (raw.includes("NEEDWC") || raw.includes("NEED WC")) {
    return { tripType: "NEEDWC", flags };
  }

  if (raw === "WC" || raw.includes("WHEEL")) {
    flags.push("MOBILITY_WC_GENERIC");
    return { tripType: "WC", flags };
  }

  flags.push(`MOBILITY_UNKNOWN:${raw}`);
  return { tripType: null, flags };
}

function getLegs(groupedTrip) {
  return Array.isArray(groupedTrip.legs) && groupedTrip.legs.length
    ? groupedTrip.legs
    : [groupedTrip];
}

function totalActualMilesRounded(legs) {
  const total = legs.reduce((sum, leg) => sum + num(leg.DirectMileage), 0);
  return roundMiles(total);
}

function roundTripMilesRounded(legs) {
  const firstLeg = legs[0];
  const outbound = roundMiles(firstLeg?.DirectMileage);
  return outbound * 2;
}

function priceGroupedTrip(groupedTrip, rateRow, opts = {}) {
  const flags = [];
  const status = classifyStatus(groupedTrip.RideStatus);
  const { tripType, flags: mobilityFlags } = mapMobilityToTripType(groupedTrip.Mobility);
  flags.push(...mobilityFlags);

  if (!rateRow) {
    return {
      pricingType: "NO_RATE",
      status: groupedTrip.RideStatus,
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee: 0,
      total: 0,
      flags: ["NO_RATE_MATCH", ...flags],
      debug: {},
    };
  }

  if (!tripType) {
    return {
      pricingType: "NO_TRIP_TYPE",
      status: groupedTrip.RideStatus,
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee: 0,
      total: 0,
      flags,
      debug: {},
    };
  }

  if (status.kind === "CANCEL_FEE") {
    const cancelFee = num(rateRow.cancel_fee);
    return {
      pricingType: "CANCEL_FEE",
      status: groupedTrip.RideStatus,
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee,
      total: cancelFee,
      flags,
      debug: {},
    };
  }

  if (status.kind === "UNKNOWN") {
    flags.push(`UNKNOWN_STATUS:${groupedTrip.RideStatus || ""}`);
    return {
      pricingType: "UNKNOWN_STATUS",
      status: groupedTrip.RideStatus,
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee: 0,
      total: 0,
      flags,
      debug: {},
    };
  }

  const specialPrice = applySpecialPricingRules(groupedTrip, rateRow, tripType, opts);
  if (specialPrice) {
    specialPrice.status = groupedTrip.RideStatus;
    specialPrice.flags = [...(specialPrice.flags || []), ...flags];
    specialPrice.debug = {
      ...(specialPrice.debug || {}),
      tripShape: groupedTrip.TripShape,
      billingClass: groupedTrip.BillingClass,
    };
    return specialPrice;
  }

  const legs = getLegs(groupedTrip);
  const shape = String(groupedTrip.TripShape || "ONE_WAY").trim().toUpperCase();

  // Pricing rule:
  // 1W => 1W base + actual one-way mileage
  // RT => RT base + doubled outbound mileage
  // MS => RT base + actual total mileage
  const isRtBase = shape === "ROUND_TRIP" || shape === "MULTI_STOP";

  const milesRounded =
    shape === "ROUND_TRIP"
      ? roundTripMilesRounded(legs)
      : totalActualMilesRounded(legs);

  const includedMiles = num(rateRow.included_miles);
  const billableMiles = Math.max(0, milesRounded - includedMiles);

  const bKey = baseColumn({
    isRoundTrip: isRtBase,
    tripType,
  });

  const base = num(rateRow[bKey]);

  const { perMile, source: perMileSource } = resolvePerMile({
    rateRow,
    isRoundTrip: isRtBase,
    tripType,
    milesRounded,
  });

  const mileage = billableMiles * perMile;

  return {
    pricingType: "NORMAL",
    status: groupedTrip.RideStatus,
    base,
    mileage,
    accessories: [],
    cancelFee: 0,
    total: base + mileage,
    flags,
    debug: {
      tripShape: shape,
      tripType,
      milesRounded,
      includedMiles,
      billableMiles,
      baseKey: bKey,
      perMileRate: perMile,
      perMileSource,
      legCount: groupedTrip.LegCount || legs.length,
      additionalStopCount: groupedTrip.AdditionalStopCount || 0,
    },
  };
}

module.exports = {
  priceGroupedTrip,
};