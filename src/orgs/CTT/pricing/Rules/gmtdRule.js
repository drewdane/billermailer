// src/orgs/CTT/pricing/rules/gmtdRule.js

function gmtdRule(groupedTrip, rateRow, tripType, ctx = {}) {
  const debugKenneth =
    String(groupedTrip.FirstName || "").trim().toLowerCase() === "kenneth" &&
    String(groupedTrip.LastName || "").trim().toLowerCase() === "hirsh";

  if (debugKenneth) {
    console.log("GMTD DEBUG", {
      rider: `${groupedTrip.FirstName} ${groupedTrip.LastName}`,
      billingClass: groupedTrip.BillingClass,
      tripShape: groupedTrip.TripShape,
      tripType,
      inLoop: ctx.derived?.inLoop,
      inLoopReason: ctx.derived?.inLoopReason,
      miles: ctx.derived?.gmtdRoundTripMilesRaw,
      accountCode: groupedTrip.AccountCode,
      accountName: groupedTrip.AccountName,
    });
  }

  if (!qualifiesForGMTD(groupedTrip, tripType, ctx)) return null;

  // ...rest of function...
}

const AMBULATORY = [
  { max: 10, price: 79 },
  { max: 15, price: 99 },
  { max: 20, price: 119 },
  { max: 25, price: 139 },
  { max: 30, price: 159 },
];

const WHEELCHAIR = [
  { max: 10, price: 119 },
  { max: 15, price: 139 },
  { max: 20, price: 159 },
  { max: 25, price: 179 },
  { max: 30, price: 199 },
];

const WC_PROVIDED_SURCHARGE = 10;

function roundTripMilesRule(roundTripMilesRaw) {
  const oneDecimal = Math.round(roundTripMilesRaw * 10) / 10;
  const whole = Math.round(oneDecimal);
  return { oneDecimal, whole };
}

function pickTier(table, roundTripWholeMiles) {
  return table.find((t) => roundTripWholeMiles <= t.max) ?? null;
}

function qualifiesForGMTD(groupedTrip, tripType, ctx = {}) {
  const inLoop = !!ctx.derived?.inLoop;

  if (groupedTrip.BillingClass !== "PRIVATE_PAY") return false;
  if (groupedTrip.TripShape !== "ROUND_TRIP") return false;
  if (!inLoop) return false;

  // AMBU / WC only
  if (!["AMBU", "HASWC", "NEEDWC", "WC"].includes(tripType)) return false;

  return true;
}

function gmtdRule(groupedTrip, rateRow, tripType, ctx = {}) {
  if (!qualifiesForGMTD(groupedTrip, tripType, ctx)) return null;

  const roundTripMilesRaw = Number(ctx.derived?.gmtdRoundTripMilesRaw ?? groupedTrip.DirectMileage ?? 0);
  const { oneDecimal, whole } = roundTripMilesRule(roundTripMilesRaw);

  if (oneDecimal >= 30.5) {
    return {
      pricingType: "GMTD_UNAVAILABLE",
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee: 0,
      total: 0,
      flags: ["GMTD_OUT_OF_RANGE"],
      debug: {},
    };
  }

  const table = ["HASWC", "NEEDWC", "WC"].includes(tripType) ? WHEELCHAIR : AMBULATORY;
  const tier = pickTier(table, whole);

  if (!tier) {
    return {
      pricingType: "GMTD_UNAVAILABLE",
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee: 0,
      total: 0,
      flags: ["GMTD_NO_TIER"],
      debug: {},
    };
  }

  const wcFee = tripType === "NEEDWC" ? WC_PROVIDED_SURCHARGE : 0;
  const total = tier.price + wcFee;

  return {
    pricingType: "GMTD",
    badge: "GMTD",
    base: tier.price,
    mileage: 0,
    accessories: wcFee > 0 ? [{ code: "WC_PROVIDED", amount: wcFee }] : [],
    cancelFee: 0,
    total,
    flags: [],
    debug: {
      roundTripMiles: oneDecimal,
      roundTripMilesWhole: whole,
      tripType,
      wcFee,
    },
  };
}

module.exports = {
  gmtdRule,
};