// src/review/groupTrips.js
//
// Group raw TripMaster legs into billable trips.
//
// Terminology:
// - leg: one raw TripMaster ride row
// - trip: one billable BM review item made of 1+ legs
//
// Shapes:
// - ONE_WAY: 1 leg
// - ROUND_TRIP: 2 legs that reverse back
// - MULTI_STOP: 3+ chained legs
//
// Conservative grouping rules:
// - same account
// - same service date
// - same rider
// - legs must chain: prior dropoff ~= next pick up
// - legs sorted by scheduled pick up time / confirmation number
//
// Notes:
// - only Rode legs are grouped for now
// - NoShow / RiderCancel / other non-Rode stay as single-leg trips
// - confirmation number is treated as a helpful hint, not a hard requirement

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[#.,/\\()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMobility(m) {
  const s = String(m || "").trim().toUpperCase();

  if (s === "S") return "STR";
  if (s === "A") return "AMBU";
  return s;
}

function riderKey(leg) {
  return [
    norm(leg.FirstName),
    norm(leg.LastName),
  ].join("|");
}

function statusKind(rideStatus) {
  const s = norm(rideStatus);
  if (s === "rode") return "RODE";
  if (s === "noshow" || s === "ridercancel") return "NON_RODE";
  return "OTHER";
}

function num(v) {
  const x = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(x) ? x : 0;
}

function confNum(leg) {
  const raw = String(leg.ConfirmationNumber || "").trim();
  const digits = raw.match(/\d+/g);
  if (!digits) return null;
  const joined = digits.join("");
  const n = Number(joined);
  return Number.isFinite(n) ? n : null;
}

function rideDateISO(leg) {
  if (leg.RideDateISO) return String(leg.RideDateISO).trim();

  const s = String(leg.RideDate || "").trim();
  const datePart = s.split(" ")[0];
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const mm = String(Number(m[1])).padStart(2, "0");
  const dd = String(Number(m[2])).padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function parseTmDateOnly(s) {
  const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return {
    y: Number(m[3]),
    m: Number(m[1]),
    d: Number(m[2]),
  };
}

function parseTimeOnly(s) {
  const txt = String(s || "").trim();
  if (!txt) return null;

  // handles "10:15", "9:45", "10:15 AM", "3:05 PM"
  const m = txt.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!m) return null;

  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = (m[3] || "").toUpperCase();

  if (ap === "PM" && hh < 12) hh += 12;
  if (ap === "AM" && hh === 12) hh = 0;

  return { hh, mm };
}

function parseDateTimeMaybe(s) {
  const txt = String(s || "").trim();
  if (!txt) return null;

  // full datetime strings can still parse normally
  const d = new Date(txt);
  return Number.isFinite(d.getTime()) ? d : null;
}

function localDateTimeValue(leg, timeFieldValue) {
  const rideDate =
    parseTmDateOnly(leg.RideDate) ||
    (leg.RideDateISO
      ? (() => {
          const m = String(leg.RideDateISO).match(/^(\d{4})-(\d{2})-(\d{2})$/);
          return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
        })()
      : null);

  const t = parseTimeOnly(timeFieldValue);
  if (!rideDate || !t) return null;

  return new Date(
    rideDate.y,
    rideDate.m - 1,
    rideDate.d,
    t.hh,
    t.mm,
    0,
    0
  ).getTime();
}

function isZeroTimeValue(v) {
  const s = String(v || "").trim();
  return s === "00:00" || s === "0:00" || s === "12:00 AM" || s === "12:00AM";
}

function sortTimeValue(leg) {
  // Best available real-world ordering:
  // 1) Actual pickup
  const actualPickup =
    localDateTimeValue(leg, leg.ActualPickupTime) ??
    parseDateTimeMaybe(leg.ActualPickupTime)?.getTime();
  if (actualPickup != null) return actualPickup;

  // 2) Dropoff arrival
  const dropoffArrival =
    localDateTimeValue(leg, leg.DropoffArrivalTime) ??
    parseDateTimeMaybe(leg.DropoffArrivalTime)?.getTime();
  if (dropoffArrival != null) return dropoffArrival;

  // 3) Scheduled pickup, but ignore midnight placeholders for will-calls
  if (!isZeroTimeValue(leg.ScheduledPickupTime)) {
    const scheduledPickup =
      localDateTimeValue(leg, leg.ScheduledPickupTime) ??
      parseDateTimeMaybe(leg.ScheduledPickupTime)?.getTime();
    if (scheduledPickup != null) return scheduledPickup;
  }

  // 4) Scheduled dropoff if usable
  if (!isZeroTimeValue(leg.ScheduledDropoffTime)) {
    const scheduledDropoff =
      localDateTimeValue(leg, leg.ScheduledDropoffTime) ??
      parseDateTimeMaybe(leg.ScheduledDropoffTime)?.getTime();
    if (scheduledDropoff != null) return scheduledDropoff;
  }

  // 5) Last resort only
  const c = confNum(leg);
  if (c != null) return c;

  return Number.MAX_SAFE_INTEGER;
}

function compactAddress(address1, city, state, zip) {
  return [
    norm(address1),
    norm(city),
    norm(state),
    norm(zip),
  ].filter(Boolean).join("|");
}

function normalizeLocationPart(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function compactAddress(address1, city, state, zip) {
  return [
    normalizeLocationPart(address1),
    normalizeLocationPart(city),
    normalizeLocationPart(state),
    normalizeLocationPart(zip),
  ].filter(Boolean).join("|");
}

function locKey(name, address1, city, state, zip) {
  const addr = compactAddress(address1, city, state, zip);
  if (addr) return addr; // address wins if present
  return normalizeLocationPart(name);
}

function pickupKey(leg) {
  return locKey(
    leg.PickupName,
    leg.PickupAddress1,
    leg.PickupCity,
    leg.PickupState,
    leg.PickupZip
  );
}

function dropoffKey(leg) {
  return locKey(
    leg.DropoffName,
    leg.DropoffAddress1,
    leg.DropoffCity,
    leg.DropoffState,
    leg.DropoffZip
  );
}

function samePersonDayAccount(a, b) {
  return (
    String(a.AccountCode || "").trim() === String(b.AccountCode || "").trim() &&
    rideDateISO(a) === rideDateISO(b) &&
    riderKey(a) === riderKey(b)
  );
}

function locationsChain(prevLeg, nextLeg) {
  return dropoffKey(prevLeg) === pickupKey(nextLeg);
}

function confGapLooksReasonable(prevLeg, nextLeg) {
  const a = confNum(prevLeg);
  const b = confNum(nextLeg);

  // If one or both missing, don't block grouping.
  if (a == null || b == null) return true;

  const gap = Math.abs(b - a);

  // Keep this permissive because multi-stop may be entered oddly.
  return gap <= 50;
}

function canChain(prevLeg, nextLeg) {
  if (!samePersonDayAccount(prevLeg, nextLeg)) return false;
  if (statusKind(prevLeg.RideStatus) !== "RODE") return false;
  if (statusKind(nextLeg.RideStatus) !== "RODE") return false;
  if (!locationsChain(prevLeg, nextLeg)) return false;

  return true;
}

function tripShape(legs) {
  if (legs.length <= 1) return "ONE_WAY";

  const first = legs[0];
  const last = legs[legs.length - 1];

  // 3+ chained legs are always multi-stop
  if (legs.length >= 3) return "MULTI_STOP";

  // 2 legs:
  // - if final drop-off returns to original origin, it's a round trip
  // - otherwise it's a multi-stop
  if (pickupKey(first) === dropoffKey(last)) {
    return "ROUND_TRIP";
  }

  return "MULTI_STOP";
}

function groupIdFromLegs(legs, index) {
  const first = legs[0] || {};
  const date = rideDateISO(first) || "unknown-date";
  const acct = String(first.AccountCode || "UNKNOWN").trim();
  const rider = [
    String(first.FirstName || "").trim(),
    String(first.LastName || "").trim(),
  ]
    .filter(Boolean)
    .join("_")
    .replace(/\s+/g, "_");

  const confs = legs
    .map((l) => String(l.ConfirmationNumber || "").trim())
    .filter(Boolean)
    .join("_");

  return [date, acct, rider || "UNKNOWN_RIDER", confs || `grp${index + 1}`].join("|");
}

function summarizeNotes(legs) {
  const seen = new Set();
  const lines = [];

  for (const leg of legs) {
    for (const raw of [leg.Comments, leg.Comments1]) {
      const t = String(raw || "").trim();
      if (!t) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      lines.push(t);
    }
  }

  return lines.join("\n");
}

function notesPreview(text, max = 120) {
  const firstLine = String(text || "").split(/\r?\n/)[0].trim();
  if (firstLine.length <= max) return firstLine;
  return firstLine.slice(0, max - 3).trimEnd() + "...";
}

function buildGroupedTrip(legs, index) {
  const sortedLegs = [...legs].sort((a, b) => sortTimeValue(a) - sortTimeValue(b));
  const first = sortedLegs[0];
  const last = sortedLegs[sortedLegs.length - 1];

  const totalMileage = sortedLegs.reduce((sum, leg) => sum + num(leg.DirectMileage), 0);
  const shape = tripShape(sortedLegs);
  const notesFull = summarizeNotes(sortedLegs);

  return {
    // UI / BM identity
    LineId: groupIdFromLegs(sortedLegs, index),
    TripShape: shape,               // ONE_WAY | ROUND_TRIP | MULTI_STOP
    IsRoundTrip: shape === "ROUND_TRIP",
    IsMultiStop: shape === "MULTI_STOP",
    LegCount: sortedLegs.length,
    AdditionalStopCount: Math.max(0, sortedLegs.length - 2),

    // Carry main trip identity forward
    AccountCode: first.AccountCode,
    AccountName: first.AccountName,
    RideDate: first.RideDate,
    RideDateISO: rideDateISO(first),
    ConfirmationNumber: sortedLegs
      .map((l) => String(l.ConfirmationNumber || "").trim())
      .filter(Boolean)
      .join(", "),

    FirstName: first.FirstName,
    LastName: first.LastName,
    Mobility: normalizeMobility(first.Mobility),
    RideStatus: sortedLegs.every((l) => statusKind(l.RideStatus) === "RODE") ? "Rode" : first.RideStatus,

    // Trip summary shown in table
    PickupName: first.PickupName,
    PickupAddress1: first.PickupAddress1,
    PickupCity: first.PickupCity,
    PickupState: first.PickupState,
    PickupZip: first.PickupZip,

    DropoffName: first.DropoffName,
    DropoffAddress1: first.DropoffAddress1,
    DropoffCity: first.DropoffCity,
    DropoffState: first.DropoffState,
    DropoffZip: first.DropoffZip,

    DirectMileage: String(Math.round(totalMileage)),
    RideHours: first.RideHours, // keep original for now; pricing can switch to grouped duration later

    Comments: notesFull,
    Comments1: notesFull,
    notesFull,
    notesPreview: notesPreview(notesFull),

    // Carry full leg detail for expand/debug/pricing
    legs: sortedLegs,
  };
}

function bucketKey(leg) {
  return [
    String(leg.AccountCode || "").trim(),
    rideDateISO(leg),
    riderKey(leg),
  ].join("|");
}

function findLikelyStartIndex(bucketLegs, unusedIndexes) {
  // A likely "start" leg has a pickup that is NOT the dropoff of another unused leg
  // in the same bucket. If more than one qualifies, take the earliest by time.
  const candidates = [];

  for (const idx of unusedIndexes) {
    const leg = bucketLegs[idx];
    const pu = pickupKey(leg);

    let matchedAsDropoff = false;
    for (const otherIdx of unusedIndexes) {
      if (otherIdx === idx) continue;
      const other = bucketLegs[otherIdx];
      if (dropoffKey(other) === pu) {
        matchedAsDropoff = true;
        break;
      }
    }

    if (!matchedAsDropoff) {
      candidates.push(idx);
    }
  }

  const pool = candidates.length ? candidates : Array.from(unusedIndexes);

  pool.sort((a, b) => sortTimeValue(bucketLegs[a]) - sortTimeValue(bucketLegs[b]));
  return pool[0];
}

function findBestNextIndex(bucketLegs, unusedIndexes, currentLeg) {
  const currentTime = sortTimeValue(currentLeg);

  const matches = Array.from(unusedIndexes)
    .filter((idx) => {
      const leg = bucketLegs[idx];

      return (
        samePersonDayAccount(currentLeg, leg) &&
        statusKind(currentLeg.RideStatus) === "RODE" &&
        statusKind(leg.RideStatus) === "RODE" &&
        locationsChain(currentLeg, leg) &&
        sortTimeValue(leg) >= currentTime
      );
    })
    .sort((a, b) => sortTimeValue(bucketLegs[a]) - sortTimeValue(bucketLegs[b]));

  return matches.length ? matches[0] : null;
}

function groupTrips(rawLegs) {
  // First bucket by account + local service date + rider
  const buckets = new Map();

  for (const leg of rawLegs) {
    const key = bucketKey(leg);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(leg);
  }

  const groups = [];

  for (const bucket of buckets.values()) {
    const bucketLegs = [...bucket].sort((a, b) => sortTimeValue(a) - sortTimeValue(b));
    const unusedIndexes = new Set(bucketLegs.map((_, i) => i));

    while (unusedIndexes.size > 0) {
      const startIdx = findLikelyStartIndex(bucketLegs, unusedIndexes);
      const seed = bucketLegs[startIdx];

      // Non-rode stays single-leg
      if (statusKind(seed.RideStatus) !== "RODE") {
        unusedIndexes.delete(startIdx);
        groups.push(buildGroupedTrip([seed], groups.length));
        continue;
      }

      const chain = [seed];
      unusedIndexes.delete(startIdx);

      let current = seed;
      const originPickup = pickupKey(seed);

      while (true) {
        const nextIdx = findBestNextIndex(bucketLegs, unusedIndexes, current);
        if (nextIdx == null) break;

        const nextLeg = bucketLegs[nextIdx];
        chain.push(nextLeg);
        unusedIndexes.delete(nextIdx);
        current = nextLeg;

        // once the passenger returns to the starting point, the trip is complete
        if (dropoffKey(current) === originPickup) {
          break;
        }
      }

      groups.push(buildGroupedTrip(chain, groups.length));
    }
  }

  return groups;
}

module.exports = {
  groupTrips,
};