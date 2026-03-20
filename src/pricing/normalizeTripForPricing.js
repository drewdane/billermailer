const { num, roundMiles } = require("./rateLookup");

function normStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function classifyStatus(statusRaw) {
  const s = normStatus(statusRaw);
  if (s === "rode") return { kind: "RODE" };
  if (s === "noshow" || s === "ridercancel") return { kind: "CANCEL_FEE" };
  return { kind: "UNKNOWN" };
}

function mapMobilityToTripType(mobilityRaw, groupedTrip) {
  const raw = String(mobilityRaw || "").trim().toUpperCase();
  const flags = [];

  if (!raw) return { tripType: null, flags: ["MOBILITY_MISSING"] };

  if (raw.includes("AMBU")) return { tripType: "AMBU", flags };
  if (raw.includes("STR")) return { tripType: "STR", flags };
  if (raw.includes("RECL")) return { tripType: "RECL", flags };
  if (raw.includes("HASWC")) return { tripType: "HASWC", flags };
  if (raw.includes("NEEDWC")) return { tripType: "NEEDWC", flags };

  if (raw === "WC") {
    if (groupedTrip.BillingClass === "PRIVATE_PAY") {
      flags.push("MOBILITY_WC_GENERIC_ASSUMED_HASWC");
      return { tripType: "HASWC", flags };
    }
    if (groupedTrip.TripShape === "ROUND_TRIP") {
      flags.push("MOBILITY_WC_GENERIC_ASSUMED_HASWC");
      return { tripType: "HASWC", flags };
    }
    if (groupedTrip.TripShape === "ONE_WAY") {
      flags.push("MOBILITY_WC_GENERIC_ASSUMED_NEEDWC");
      return { tripType: "NEEDWC", flags };
    }
    return { tripType: "HASWC", flags };
  }

  flags.push(`MOBILITY_UNKNOWN:${raw}`);
  return { tripType: null, flags };
}

function normalizeTripForPricing(groupedTrip) {
  const flags = [];

  const status = classifyStatus(groupedTrip.RideStatus);
  const { tripType, flags: mobilityFlags } =
    mapMobilityToTripType(groupedTrip.Mobility, groupedTrip);

  flags.push(...mobilityFlags);

  const legs = Array.isArray(groupedTrip.legs) && groupedTrip.legs.length
    ? groupedTrip.legs
    : [groupedTrip];

  const shape = String(groupedTrip.TripShape || "ONE_WAY")
    .trim()
    .toUpperCase();

  const milesRounded =
    shape === "ROUND_TRIP"
      ? roundMiles((legs[0]?.DirectMileage || 0) * 2)
      : roundMiles(legs.reduce((sum, l) => sum + num(l.DirectMileage), 0));

  return {
    status,
    tripType,
    shape,
    legs,
    milesRounded,
    flags,
  };
}

module.exports = {
  normalizeTripForPricing,
};