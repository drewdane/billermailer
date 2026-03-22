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
  const accessories = norm.accessories || { NeedWC: false, RECL: false };
  const shape = norm.shape;
  const legs = norm.legs;
  const milesRounded = norm.milesRounded;

  const isRtBase = shape === "ROUND_TRIP" || shape === "MULTI_STOP";

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
    const accessoryLines = [];
    let accessoryTotal = 0;

    if (accessories?.NeedWC) {
      const col = isRtBase ? "needwc_rt" : "needwc_1w";
      const fee = num(rateRow[col]);

      if (fee > 0) {
        accessoryLines.push({
          code: "NeedWC",
          label: "Wheelchair Provided",
          amount: fee,
        });
        accessoryTotal += fee;
      } else {
        flags.push(`NEEDWC_ENABLED_BUT_NO_RATE:${col}`);
      }
    }

    if (accessories?.RECL) {
      const col = isRtBase ? "recl_rt" : "recl_1w";
      const fee = num(rateRow[col]);

      if (fee > 0) {
        accessoryLines.push({
          code: "RECL",
          label: "Reclining Wheelchair",
          amount: fee,
        });
        accessoryTotal += fee;
      } else {
        flags.push(`RECL_ENABLED_BUT_NO_RATE:${col}`);
      }
    }

    specialPrice.status = groupedTrip.RideStatus;
    specialPrice.flags = [...(specialPrice.flags || []), ...flags];
    specialPrice.accessories = [...(specialPrice.accessories || []), ...accessoryLines];
    specialPrice.total = num(specialPrice.total) + accessoryTotal;
    specialPrice.audit = {
      ...(specialPrice.audit || {}),
      tripShape: shape,
      billingClass: groupedTrip.BillingClass,
      rateRowId: rateRow.__rowNumber || null,
      normalizedAccessories: accessories,
      accessoryTotal,
    };
    return specialPrice;
  }

  const includedMiles = num(rateRow.included_miles);
  const billableMiles = Math.max(0, milesRounded - includedMiles);

  const bKey = baseColumn({
    isRoundTrip: isRtBase,
    tripType,
    inLoop: false,
    rateRow,
  });

  const base = num(rateRow[bKey]);

  const { perMile, source: perMileSource } = resolvePerMile({
    rateRow,
    isRoundTrip: isRtBase,
    tripType,
    milesRounded,
  });

  const mileage = billableMiles * perMile;

  const accessoryLines = [];
  let accessoryTotal = 0;

  // NeedWC
  if (accessories?.NeedWC) {
    const col = isRtBase ? "needwc_rt" : "needwc_1w";
    const fee = num(rateRow[col]);

    if (fee > 0) {
      accessoryLines.push({
        code: "NeedWC",
        label: "Need WC",
        amount: fee,
      });
      accessoryTotal += fee;
    } else {
      flags.push(`NEEDWC_ENABLED_BUT_NO_RATE:${col}`);
    }
  }

  // RECL (CTT-specific)
  if (accessories?.RECL) {
    const col = isRtBase ? "recl_rt" : "recl_1w";
    const fee = num(rateRow[col]);

    if (fee > 0) {
      accessoryLines.push({
        code: "RECL",
        label: "Recliner",
        amount: fee,
      });
      accessoryTotal += fee;
    } else {
      flags.push(`RECL_ENABLED_BUT_NO_RATE:${col}`);
    }
  }

  const total = base + mileage + accessoryTotal;

  return {
    pricingType: "NORMAL",
    status: groupedTrip.RideStatus,
    base,
    mileage,
    accessories: accessoryLines,
    cancelFee: 0,
    total,
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
      needwcApplied: accessories?.NeedWC || false,
      reclApplied: accessories?.RECL || false,
      accessoryTotal,
      rawMobility: groupedTrip.Mobility,
      normalizedAccessories: accessories,
      needwcColumnTried: isRtBase ? "needwc_rt" : "needwc_1w",
      needwcValue: isRtBase ? num(rateRow.needwc_rt) : num(rateRow.needwc_1w),
    },
  };
}

module.exports = {
  priceGroupedTrip,
};