// src/pricing/pricing.js (v2 schema)

const { num, roundMiles, baseColumn, resolvePerMile } = require("./rateLookup");
const { getTransportMinutes } = require("./parseTime");

/**
 * Status rules (BM v1):
 * - Rode => normal pricing
 * - NoShow / RiderCancel => cancellation fee only
 * - Anything else => flag for review, default $0
 */
function normStatus(s) {
  return String(s || "").trim().toLowerCase();
}

function classifyStatus(statusRaw) {
  const s = normStatus(statusRaw);
  if (s === "rode") return { kind: "RODE", needsReview: false };
  if (s === "noshow" || s === "ridercancel") return { kind: "CANCEL_FEE", needsReview: false };
  return { kind: "UNKNOWN", needsReview: true, raw: statusRaw };
}

// $X per N minutes, billed in ceil blocks
function calcTimedCharge(amountPerBlock, minutesPerBlock, billMinutes) {
  const amt = num(amountPerBlock);
  const block = num(minutesPerBlock);
  const mins = num(billMinutes);

  if (amt <= 0 || block <= 0 || mins <= 0) return { blocks: 0, charge: 0 };
  const blocks = Math.ceil(mins / block);
  return { blocks, charge: blocks * amt };
}

// ---- Accessory helpers ----

function isTruthy(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "y" || s === "yes" || s === "on";
}

function parseLocalDate(s) {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isFinite(d.getTime()) ? d : null;
}

// time window check that supports overnight windows (e.g. 22:00–06:00)
function inTimeWindow(d, startHHMM, endHHMM) {
  if (!d || !startHHMM || !endHHMM) return false;

  const [sh, sm] = String(startHHMM).split(":").map(Number);
  const [eh, em] = String(endHHMM).split(":").map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return false;

  const mins = d.getHours() * 60 + d.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;

  if (start === end) return false; // degenerate
  if (start < end) return mins >= start && mins < end; // same-day window
  return mins >= start || mins < end; // overnight window
}

/**
 * Trip-side overrides (temporary BM shape while inputs are messy):
 *
 * HazMat:
 *   - default ON; to remove: trip.RemoveHazmat = true
 *
 * O2:
 *   - enable: trip.AddO2 = true
 *
 * Wait:
 *   - enable: trip.AddWait = true
 *   - total minutes input: trip.WaitTotalMinutes = number (TOTAL wait minutes)
 *
 * Attendant:
 *   - enable: trip.AddAtt = true
 *   - total minutes input: trip.AttTotalMinutes = number
 *
 * BARI:
 *   - enable: trip.AddBari = true (later: auto-suggest from comments)
 *
 * Deadhead:
 *   - enable: trip.AddDeadhead = true
 *   - optional override miles: trip.DeadheadMiles = number (else uses trip miles)
 */
function readOverrides(trip) {
  return {
    removeHazmat: isTruthy(trip.RemoveHazmat),

    addO2: isTruthy(trip.AddO2),

    addWait: isTruthy(trip.AddWait),
    waitTotalMinutes: num(trip.WaitTotalMinutes),

    addAtt: isTruthy(trip.AddAtt),
    attTotalMinutes: num(trip.AttTotalMinutes),

    addBari: isTruthy(trip.AddBari),

    addDeadhead: isTruthy(trip.AddDeadhead),
    deadheadMiles: num(trip.DeadheadMiles)
  };
}

function parseLocalDate(s) {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseISODateOnly(s) {
  // "YYYY-MM-DD" -> local midnight
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
  const d = new Date(y, mo, da, 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isDateInRange(d, start, end) {
  if (!d || !start || !end) return false;
  const t = d.getTime();
  // end is inclusive through the end of that day
  const endInclusive = end.getTime() + (24 * 60 * 60 * 1000) - 1;
  return t >= start.getTime() && t <= endInclusive;
}

function isStrTrip(tripType) {
  return String(tripType || "").trim().toUpperCase() === "STR";
}

function bariFee(rateRow, { tripType, isRoundTrip }) {
  // Column names (v2):
  // bari_wc_1w_fee, bari_wc_rt_fee, bari_str_1w_fee, bari_str_rt_fee
  const isStr = isStrTrip(tripType);

  const key =
    isStr
      ? (isRoundTrip ? "bari_str_rt_fee" : "bari_str_1w_fee")
      : (isRoundTrip ? "bari_wc_rt_fee" : "bari_wc_1w_fee");

  const chosen = num(rateRow[key]);

  // Special fallback: if only bari_wc_1w_fee is filled, treat as universal BARI surcharge
  if (chosen > 0) return { amount: chosen, source: key };

  const universal = num(rateRow.bari_wc_1w_fee);
  if (universal > 0) return { amount: universal, source: "bari_wc_1w_fee(universal)" };

  return { amount: 0, source: key };
}

/**
 * Deadhead logic (v2):
 * - dh_start_miles: if trip miles < start => no DH charge
 * - dh_tier2_start_miles / dh_tier3_start_miles determine tier qualification
 * - ALL DH miles billed at highest qualified tier rate
 * - dh_flat_fee: if present (>0), use it (and ignore per-mile tiers) for now
 *
 * DH miles source (BM v1): default = trip miles; optional override.
 */
function deadheadCharge(rateRow, tripMilesRounded, overrides) {
  const flat = num(rateRow.dh_flat_fee);
  if (flat > 0) {
    return {
      amount: flat,
      mode: "flat",
      details: { source: "dh_flat_fee" }
    };
  }

  const start = num(rateRow.dh_start_miles);
  if (start > 0 && tripMilesRounded < start) {
    return {
      amount: 0,
      mode: "per_mile",
      details: { reason: "below_start_threshold", dh_start_miles: start }
    };
  }

  const dhMiles = overrides.deadheadMiles > 0 ? overrides.deadheadMiles : tripMilesRounded;
  if (dhMiles <= 0) {
    return { amount: 0, mode: "per_mile", details: { reason: "no_miles" } };
  }

  const t2 = num(rateRow.dh_tier2_start_miles);
  const t3 = num(rateRow.dh_tier3_start_miles);

  // choose highest qualified tier number
  let tier = 1;
  if (t2 > 0 && tripMilesRounded >= t2) tier = 2;
  if (t3 > 0 && tripMilesRounded >= t3) tier = 3;

  const r1 = num(rateRow.dh_rate_tier1);
  const r2 = num(rateRow.dh_rate_tier2);
  const r3 = num(rateRow.dh_rate_tier3);

  let rate = r1;
  let rateSource = "dh_rate_tier1";

  if (tier === 2 && r2 > 0) { rate = r2; rateSource = "dh_rate_tier2"; }
  if (tier === 3 && r3 > 0) { rate = r3; rateSource = "dh_rate_tier3"; }

  // fallback if chosen tier rate missing
  if (rate <= 0) {
    if (r3 > 0) { rate = r3; rateSource = "dh_rate_tier3(fallback)"; }
    else if (r2 > 0) { rate = r2; rateSource = "dh_rate_tier2(fallback)"; }
    else { rate = r1; rateSource = "dh_rate_tier1(fallback)"; }
  }

  const amount = dhMiles * rate;

  return {
    amount,
    mode: "per_mile",
    details: { dhMiles, tripMilesRounded, tier, rate, rateSource, dh_start_miles: start }
  };
}

// ---- Main entry point ----

function priceTrip(trip, rateRow, opts = {}) {
  const flags = [];
  const overrides = readOverrides(trip);

  const status = classifyStatus(trip.RideStatus);

  // Cancellation fee only
  if (status.kind === "CANCEL_FEE") {
    const cancelFee = num(rateRow.cancel_fee);
    return {
      pricingType: "CANCEL_FEE",
      status: trip.RideStatus,
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee,
      total: cancelFee,
      debug: {},
      flags
    };
  }

  // Unknown status: flag + $0
  if (status.kind === "UNKNOWN") {
    flags.push(`UNKNOWN_STATUS:${trip.RideStatus || ""}`);
    return {
      pricingType: "UNKNOWN_STATUS",
      status: trip.RideStatus,
      base: 0,
      mileage: 0,
      accessories: [],
      cancelFee: 0,
      total: 0,
      debug: {},
      flags
    };
  }

  // Normal pricing (Rode)
  const milesRounded = roundMiles(trip.DirectMileage);
  const includedMiles = num(rateRow.included_miles);
  const billableMiles = Math.max(0, milesRounded - includedMiles);

  const isRoundTrip = isTruthy(trip.isRoundTrip); // pairing logic upstream
  const tripType = String(trip.tripType || "").trim().toUpperCase(); // "HASWC"|"NEEDWC"|"RECL"|"STR"|"AMBU"
  const inLoop = isTruthy(trip.inLoop);

  const bKey = baseColumn({ isRoundTrip, tripType, inLoop });
  const base = num(rateRow[bKey]);

  const { perMile, source: perMileSource } = resolvePerMile({
    rateRow,
    isRoundTrip,
    tripType,
    milesRounded
  });

  const mileage = billableMiles * perMile;

  const accessories = [];

  // BARI: opt-in. Two-category rule:
  // - either account has full matrix, OR one flat fee stored in bari_wc_1w_fee
  // If selected fee is missing, fall back to bari_wc_1w_fee.
  // If bari_wc_1w_fee is missing/0 => account has no BARI fee (silent $0).
  if (overrides.addBari) {
    const isStr = (tripType === "STR");
    const isRT = Boolean(isRoundTrip); // if you don’t have RT yet, this will just be false

    const wc1 = num(rateRow.bari_wc_1w_fee);
    if (wc1 > 0) {
      let fee = 0;

      if (isStr) {
        fee = isRT ? num(rateRow.bari_str_rt_fee) : num(rateRow.bari_str_1w_fee);
        if (fee <= 0) fee = wc1; // fallback
      } else {
        fee = isRT ? num(rateRow.bari_wc_rt_fee) : wc1;
        if (fee <= 0) fee = wc1; // fallback
      }

      if (fee > 0) {
        accessories.push({ code: "BARI", amount: fee });
      }
    }
  }

  // Fuel surcharge: active only inside an explicit date range (opts.fuelSurchargeRange)
  // Applies per-account per-mile rate to ALL miles (rounded), even included miles.
  if (opts.fuelSurchargeRange?.start && opts.fuelSurchargeRange?.end) {
    const fs = num(rateRow.fuel_surcharge);
    if (fs > 0 && milesRounded > 0) {
      // Prefer RideDate (yours is always midnight); fallback to ScheduledPickupTime
      const tripDate = parseLocalDate(trip.RideDate) || parseLocalDate(trip.ScheduledPickupTime);

      if (isDateInRange(tripDate, opts.fuelSurchargeRange.start, opts.fuelSurchargeRange.end)) {
        accessories.push({
          code: "FUEL",
          amount: fs * milesRounded,
          meta: { perMile: fs, miles: milesRounded, mode: "date_range" }
        });
      }
    }
  }

  // HazMat: defaults ON for every trip, removable
  const hazmatFee = num(rateRow.hazmat_fee);
  if (hazmatFee > 0 && !overrides.removeHazmat) {
    accessories.push({ code: "HAZMAT", amount: hazmatFee, meta: { defaultOn: true } });
  }

    // O2: common. Opt-in (button). Uses transport minutes if block size exists,
  // otherwise treats o2_rate as a flat fee (legacy contracts).
  if (overrides.addO2) {
    const o2Rate = num(rateRow.o2_rate);
    const o2Block = num(rateRow.o2_block_min);

    if (o2Rate > 0) {
      if (o2Block > 0) {
        const transportMinutes = getTransportMinutes(trip);
        if (transportMinutes == null) {
          flags.push("MISSING_TRANSPORT_MINUTES_FOR_O2");
        } else {
          const r = calcTimedCharge(o2Rate, o2Block, transportMinutes);
          if (r.charge > 0) {
            accessories.push({
              code: "O2",
              minutes: transportMinutes,
              blocks: r.blocks,
              amount: r.charge,
              meta: { mode: "timed", rate: o2Rate, blockMin: o2Block }
            });
          }
        }
      } else {
        // Legacy: flat O2 fee
        accessories.push({
          code: "O2",
          amount: o2Rate,
          meta: { mode: "flat", rate: o2Rate }
        });
      }
    } else {
      flags.push("O2_RATE_NOT_CONFIGURED");
    }
  }

  // WAIT: rare/punitive. Opt-in (button) + Stacie enters TOTAL wait minutes.
  if (overrides.addWait) {
    const waitRate = num(rateRow.wait_rate);
    const waitBlock = num(rateRow.wait_block_min);
    const grace = num(rateRow.wait_grace_min) > 0 ? num(rateRow.wait_grace_min) : (opts.defaultWaitGraceMinutes ?? 30);

    if (waitRate > 0 && waitBlock > 0) {
      const totalWait = overrides.waitTotalMinutes;
      if (totalWait <= 0) {
        flags.push("WAIT_SELECTED_BUT_NO_MINUTES");
      } else {
        const billable = Math.max(0, totalWait - grace);
        const r = calcTimedCharge(waitRate, waitBlock, billable);
        if (r.charge > 0) {
          accessories.push({
            code: "WAIT",
            minutes: billable,
            blocks: r.blocks,
            amount: r.charge,
            meta: { totalWaitMinutes: totalWait, graceMin: grace, rate: waitRate, blockMin: waitBlock }
          });
        } else {
          // selected, but billable was 0 after grace; keep it silent (punitive model)
        }
      }
    } else {
      flags.push("WAIT_RATE_NOT_CONFIGURED");
    }}

  // ATT: rare. Opt-in (button) + Stacie enters total minutes.
  if (overrides.addAtt) {
    const attRate = num(rateRow.att_rate);
    const attBlock = num(rateRow.att_block_min);

    if (attRate > 0 && attBlock > 0) {
      const mins = overrides.attTotalMinutes;
      if (mins <= 0) {
        flags.push("ATT_SELECTED_BUT_NO_MINUTES");
      } else {
        const r = calcTimedCharge(attRate, attBlock, mins);
        if (r.charge > 0) {
          accessories.push({
            code: "ATT",
            minutes: mins,
            blocks: r.blocks,
            amount: r.charge,
            meta: { rate: attRate, blockMin: attBlock }
          });
        }
      }
    } else {
      flags.push("ATT_RATE_NOT_CONFIGURED");
    }
  }

  function bariFee(rateRow, { tripType, isRoundTrip }) {
    const isStr = isStrTrip(tripType);

    const key =
      isStr
        ? (isRoundTrip ? "bari_str_rt_fee" : "bari_str_1w_fee")
        : (isRoundTrip ? "bari_wc_rt_fee" : "bari_wc_1w_fee");

    const chosen = num(rateRow[key]);
    if (chosen > 0) return { amount: chosen, source: key };

    // Two-category model fallback: WC 1W is the "flat/universal" BARI fee if present
    const wc1 = num(rateRow.bari_wc_1w_fee);
    if (wc1 > 0) return { amount: wc1, source: "bari_wc_1w_fee(fallback)" };

    // No WC 1W => account has no BARI fee
    return { amount: 0, source: key };
  }

  // DEADHEAD: opt-in (button). Uses your tier logic + optional flat.
  if (overrides.addDeadhead) {
    const dh = deadheadCharge(rateRow, milesRounded, overrides);
    if (dh.amount > 0) {
      accessories.push({ code: "DH", amount: dh.amount, meta: dh.details, mode: dh.mode });
    } else {
      // DH selected but computed 0: still useful to flag why
      if (dh.details?.reason) flags.push(`DH_ZERO:${dh.details.reason}`);
    }
  }

    // ---- Calendar surcharges (override-first for BM v1) ----
  // Uses ScheduledPickupTime as anchor (per your decision)
  const sched = parseLocalDate(trip.ScheduledPickupTime);

  // These are boolean toggles Stacie can apply now.
  const addHOL = isTruthy(trip.AddHOL);
  const addWKND = isTruthy(trip.AddWKND);
  const add3S = isTruthy(trip.Add3S);
  const addAH  = isTruthy(trip.AddAH);

  // Rates come from account sheet (v2 names)
  const holRate = num(rateRow.holiday_rate);
  const wkndRate = num(rateRow.weekend_rate);
  const ahRate = num(rateRow.after_hours_rate);
  const s3Rate = num(rateRow.third_shift_rate);

  // 3S supersedes AH (your impression)
  if (addHOL && holRate > 0) accessories.push({ code: "HOL", amount: holRate });
  if (addWKND && wkndRate > 0) accessories.push({ code: "WKND", amount: wkndRate });

  if (add3S && s3Rate > 0) {
    accessories.push({ code: "3S", amount: s3Rate });
  } else if (addAH && ahRate > 0) {
    accessories.push({ code: "AH", amount: ahRate });
  }

  const accessoriesTotal = accessories.reduce((sum, a) => sum + num(a.amount), 0);
  const total = base + mileage + accessoriesTotal;

  return {
    pricingType: "NORMAL",
    status: trip.RideStatus,
    base,
    mileage,
    accessories,
    cancelFee: 0,
    total,
    debug: {
      milesRounded,
      includedMiles,
      billableMiles,
      baseKey: bKey,
      perMileRate: perMile,
      perMileSource
    },
    flags
  };
}

module.exports = { priceTrip };