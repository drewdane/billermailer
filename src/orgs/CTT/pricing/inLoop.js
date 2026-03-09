// src/orgs/CTT/pricing/inLoop.js

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function zip5(v) {
  const m = String(v || "").match(/\b(\d{5})\b/);
  return m ? m[1] : "";
}

const DEFINITELY_IN_LOOP_ZIPS = new Set([
  "76102",
  "76103",
  "76104",
  "76105",
  "76106",
  "76107",
  "76109",
  "76110",
  "76111",
  "76113",
  "76114",
  "76115",
  "76116",
  "76117",
  "76119",
]);

const MIXED_ZIPS = new Set([
  "76108",
  "76112",
  "76118",
  "76137",
  "76180",
]);

const REVIEW_ZIPS = new Set([
  "76132",
  "76133",
  "76134",
]);

const IN_LOOP_CITY_HINTS = new Set([
  "whitesettlement",
  "westworthvillage",
  "riveroaks",
  "sansompark",
  "haltomcity",
  "richlandhills",
]);

function stopInfo(name, address1, city, zip) {
  return {
    name: norm(name),
    address1: norm(address1),
    city: norm(city),
    zip: zip5(zip),
  };
}

function isDefinitelyInLoopStop(stop) {
  if (DEFINITELY_IN_LOOP_ZIPS.has(stop.zip)) return true;

  // Helpful city-based fallback for mixed zips like 76108.
  // Not perfect, but pushes us toward "very, very good."
  if (MIXED_ZIPS.has(stop.zip) && IN_LOOP_CITY_HINTS.has(stop.city)) {
    return true;
  }

  return false;
}

function isAmbiguousStop(stop) {
  if (MIXED_ZIPS.has(stop.zip)) return true;
  if (REVIEW_ZIPS.has(stop.zip)) return true;
  return false;
}

function deriveInLoop(groupedTrip) {
  const legs = Array.isArray(groupedTrip.legs) ? groupedTrip.legs : [groupedTrip];
  if (!legs.length) {
    return { inLoop: false, reason: "NO_LEGS" };
  }

  let sawAmbiguous = false;

  for (const leg of legs) {
    const pickup = stopInfo(
      leg.PickupName,
      leg.PickupAddress1,
      leg.PickupCity,
      leg.PickupZip
    );

    const dropoff = stopInfo(
      leg.DropoffName,
      leg.DropoffAddress1,
      leg.DropoffCity,
      leg.DropoffZip
    );

    for (const stop of [pickup, dropoff]) {
      if (!stop.zip) {
        return { inLoop: false, reason: "ZIP_MISSING" };
      }

      if (isDefinitelyInLoopStop(stop)) {
        continue;
      }

      if (isAmbiguousStop(stop)) {
        sawAmbiguous = true;
        continue;
      }

      return { inLoop: false, reason: "ZIP_OUTSIDE_LOOP" };
    }
  }

  if (sawAmbiguous) {
    return { inLoop: false, reason: "AMBIGUOUS_BOUNDARY" };
  }

  return { inLoop: true, reason: "ZIP_MATCH" };
}

module.exports = {
  deriveInLoop,
};