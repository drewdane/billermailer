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

function mapMobility(mobilityRaw, groupedTrip) {
  const raw = String(mobilityRaw || "").trim().toUpperCase();

  const flags = [];
  const accessories = {
    NeedWC: false,
    RECL: false,
  };

  if (!raw) {
    return { tripType: null, accessories, flags: ["MOBILITY_MISSING"] };
  }

  if (raw.includes("AMBU")) {
    return { tripType: "AMBU", accessories, flags };
  }

  if (raw.includes("STR") || raw.includes("STRETCH")) {
    return { tripType: "STR", accessories, flags };
  }

  if (raw === "WC" || raw.includes("WC")) {
    const shape = String(groupedTrip.TripShape || "").trim().toUpperCase();

    if (shape === "ONE_WAY") {
      accessories.NeedWC = true;
      flags.push("DEFAULTED_NEEDWC_FROM_WC_ONE_WAY");
    } else if (shape === "ROUND_TRIP") {
      flags.push("DEFAULTED_HASWC_FROM_WC_ROUND_TRIP");
    } else {
      flags.push("DEFAULTED_HASWC_FROM_WC_OTHER");
    }

    return { tripType: "WC", accessories, flags };
  }

  return {
    tripType: null,
    accessories,
    flags: [`MOBILITY_UNKNOWN:${raw}`],
  };
}

function normalizeTripForPricing(groupedTrip) {
  const flags = [];

  const status = classifyStatus(groupedTrip.RideStatus);

  const { tripType, accessories, flags: mobilityFlags } =
    mapMobility(groupedTrip.Mobility, groupedTrip);

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
    accessories,
    shape,
    legs,
    milesRounded,
    flags,
  };
}

module.exports = {
  normalizeTripForPricing,
};