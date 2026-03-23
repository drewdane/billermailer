const { num } = require("../../../pricing/rateLookup");

function money(v) {
  const cleaned = String(v ?? "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();

  const n = Number(cleaned || 0);
  return Number.isFinite(n) ? n : 0;
}

function normPart(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/[.,#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addressKeyFrom(prefix, row) {
  return [
    normPart(row?.[`${prefix}Address1`]),
    normPart(row?.[`${prefix}City`]),
    normPart(row?.[`${prefix}State`]),
    normPart(row?.[`${prefix}Zip`]),
  ].join("|");
}

function getLegs(groupedTrip) {
  return Array.isArray(groupedTrip.legs) && groupedTrip.legs.length
    ? groupedTrip.legs
    : [groupedTrip];
}

function computeLegacyDeadheadCharge(groupedTrip, rateRow) {
  const dhMiles = money(groupedTrip.DirectMileage);
  if (dhMiles <= 0) {
    return { deadheadMiles: 0, deadheadCharge: 0, reason: "NO_DIRECT_MILEAGE", debug: {} };
  }

  const flatFee = money(rateRow["dh_flat_fee"]);
  if (flatFee > 0) {
    return {
      deadheadMiles: dhMiles,
      deadheadCharge: flatFee,
      reason: "FLAT_FEE",
      debug: {
        dhMiles,
        dh_flat_fee: flatFee,
      },
    };
  }

  const startMiles = money(rateRow["dh_start_miles"]);
  if (startMiles > 0 && dhMiles < startMiles) {
    return {
      deadheadMiles: 0,
      deadheadCharge: 0,
      reason: "BELOW_THRESHOLD",
      debug: {
        dhMiles,
        dh_start_miles: startMiles,
      },
    };
  }

  const rate1 = money(rateRow["dh_rate_tier1"]);
  const rate2 = money(rateRow["dh_rate_tier2"]);
  const rate3 = money(rateRow["dh_rate_tier3"]);

  const tier2Start = money(rateRow["dh_tier2_start_miles"]);
  const tier3Start = money(rateRow["dh_tier3_start_miles"]);

  let rate = 0;
  let source = "";

  if (tier3Start > 0 && dhMiles >= tier3Start && rate3 > 0) {
    rate = rate3;
    source = "dh_rate_tier3";
  } else if (tier2Start > 0 && dhMiles >= tier2Start && rate2 > 0) {
    rate = rate2;
    source = "dh_rate_tier2";
  } else if (rate1 > 0) {
    rate = rate1;
    source = "dh_rate_tier1";
  } else if (rate2 > 0) {
    rate = rate2;
    source = "dh_rate_tier2_fallback";
  } else if (rate3 > 0) {
    rate = rate3;
    source = "dh_rate_tier3_fallback";
  }

  return {
    deadheadMiles: dhMiles,
    deadheadCharge: dhMiles * rate,
    reason: rate > 0 ? "TIERED_RATE" : "NO_DH_RATE",
    debug: {
      dhMiles,
      rate,
      rateSource: source,
      dh_start_miles: startMiles,
      dh_tier2_start_miles: tier2Start,
      dh_tier3_start_miles: tier3Start,
    },
  };
}

function computeDeadheadCharge(groupedTrip, rateRow = {}, pricingContext = {}) {
  const legs = getLegs(groupedTrip);
  const firstLeg = legs[0] || groupedTrip;
  const lastLeg = legs[legs.length - 1] || groupedTrip;

  const tripShape = String(groupedTrip.TripShape || "").trim().toUpperCase();

  const firstPickupKey = addressKeyFrom("Pickup", firstLeg);
  const lastDropoffKey = addressKeyFrom("Dropoff", lastLeg);

  const returnsToStart =
    firstPickupKey &&
    lastDropoffKey &&
    firstPickupKey === lastDropoffKey;

  if (returnsToStart) {
    return {
      deadheadMiles: 0,
      deadheadCharge: 0,
      reason: "RETURNS_TO_START_ADDRESS",
      debug: {
        tripShape,
        firstPickupKey,
        lastDropoffKey,
        returnsToStart,
      },
    };
  }

  const firstPickupInLoop = !!pricingContext?.derived?.firstPickupInLoop;
  const lastDropoffInLoop = !!pricingContext?.derived?.lastDropoffInLoop;

  if (firstPickupInLoop && lastDropoffInLoop) {
    return {
      deadheadMiles: 0,
      deadheadCharge: 0,
      reason: "BOTH_ENDPOINTS_IN_LOOP",
      debug: {
        tripShape,
        firstPickupInLoop,
        lastDropoffInLoop,
      },
    };
  }

  const legacy = computeLegacyDeadheadCharge(groupedTrip, rateRow);

  return {
    ...legacy,
    debug: {
      ...(legacy.debug || {}),
      tripShape,
      firstPickupKey,
      lastDropoffKey,
      returnsToStart,
      firstPickupInLoop,
      lastDropoffInLoop,
    },
  };
}

module.exports = {
  computeDeadheadCharge,
};