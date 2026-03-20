// src/review/priceGroupedTrip.js

const {
  num,
  baseColumn,
  resolvePerMile,
} = require("../pricing/rateLookup");

const { applySpecialPricingRules } = require("./specialPricing");

function priceGroupedTrip(groupedTrip, rateRow, opts = {}) {
  const { normalizeTripForPricing } = require("../pricing/normalizeTripForPricing");

  const norm = normalizeTripForPricing(groupedTrip);

  const flags = [...norm.flags];
  const status = norm.status;
  const tripType = norm.tripType;
  const shape = norm.shape;
  const legs = norm.legs;
  const milesRounded = norm.milesRounded;

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

  // Pricing rule:
  // 1W => 1W base + actual one-way mileage
  // RT => RT base + doubled outbound mileage
  // MS => RT base + actual total mileage
  const isRtBase = shape === "ROUND_TRIP" || shape === "MULTI_STOP";

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
    audit: {
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
      rateRowId: rateRow.__rowNumber || null,
    },
  };
}

module.exports = {
  priceGroupedTrip,
};