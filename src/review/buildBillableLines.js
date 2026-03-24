function money(n) {
  return Number(Number(n || 0).toFixed(2));
}

function prettyTimeChargeLabel(code) {
  const c = String(code || "").toUpperCase();

  if (c === "AFTER_HOURS") return "After Hours";
  if (c === "THIRD_SHIFT") return "3rd Shift";
  if (c === "WEEKEND") return "Weekend";
  if (c === "HOLIDAY") return "Holiday";

  return String(code || "");
}

function fmtDateForLine(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return String(iso);
  return `${Number(m)}/${Number(d)}/${String(y).slice(-2)}`;
}

function riderLabel(r) {
  const fullName = [r.FirstName, r.LastName].filter(Boolean).join(" ").trim();
  return fullName || "Unknown Rider";
}

function tripRouteLabel(r) {
  const pu = String(r.PickupName || r.PickupAddress1 || "").trim();
  const doff = String(r.DropoffName || r.DropoffAddress1 || "").trim();
  if (pu && doff) return `${pu} to ${doff}`;
  return pu || doff || "";
}

function accessoryAmountByCode(r, code) {
  const lines = Array.isArray(r.pricing?.accessories) ? r.pricing.accessories : [];
  const hit = lines.find((x) => String(x.code || "").toUpperCase() === String(code).toUpperCase());
  return money(hit?.amount || 0);
}

function automaticTimeCharge(r) {
  const lines = Array.isArray(r.pricing?.accessories) ? r.pricing.accessories : [];
  const hit = lines.find((x) => {
    const code = String(x.code || "").toUpperCase();
    return code === "HOLIDAY" || code === "WEEKEND" || code === "THIRD_SHIFT" || code === "AFTER_HOURS";
  });
  return hit
    ? {
        code: String(hit.code || "").toUpperCase(),
        label: String(hit.label || "").trim() || "Time Charge",
        amount: money(hit.amount || 0),
      }
    : null;
}

function computeWaitCharge(r) {
  if (!r.review?.AddWait) return 0;

  const cfg = r.waitConfig || {};
  const waitMinutes = Number(r.review?.WaitTotalMinutes || 0);
  if (waitMinutes <= 0) return 0;

  const rate = Number(String(cfg.wait_rate || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  if (rate <= 0) return 0;

  const blockMin = Number(String(cfg.wait_block_min || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  const graceMin = Number(String(cfg.wait_grace_min || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);

  const chargedMinutes = Math.max(0, waitMinutes - graceMin);
  if (chargedMinutes <= 0) return 0;

  if (blockMin > 0) {
    return money(Math.ceil(chargedMinutes / blockMin) * rate);
  }

  return money(rate);
}

function computeDeadheadChargeFromReview(r) {
  if (!r.review?.AddDeadhead) return 0;

  const miles = Number(r.review?.DeadheadMiles || 0);
  if (miles <= 0) return 0;

  const cfg = r.deadheadConfig || {};

  const flatRaw = String(cfg.dh_flat_fee ?? "").trim();
  const flatFee = Number(String(cfg.dh_flat_fee || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);

  if (flatRaw && flatFee > 0) {
    return money(flatFee);
  }

  const startMiles = Number(String(cfg.dh_start_miles || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  if (startMiles > 0 && miles < startMiles) return 0;

  const rate1 = Number(String(cfg.dh_rate_tier1 || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  const rate2 = Number(String(cfg.dh_rate_tier2 || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  const rate3 = Number(String(cfg.dh_rate_tier3 || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);

  const tier2Start = Number(String(cfg.dh_tier2_start_miles || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  const tier3Start = Number(String(cfg.dh_tier3_start_miles || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);

  let rate = 0;

  if (tier3Start > 0 && miles >= tier3Start && rate3 > 0) {
    rate = rate3;
  } else if (tier2Start > 0 && miles >= tier2Start && rate2 > 0) {
    rate = rate2;
  } else if (rate1 > 0) {
    rate = rate1;
  } else if (rate2 > 0) {
    rate = rate2;
  } else if (rate3 > 0) {
    rate = rate3;
  }

  return money(miles * rate);
}

function fuelSurchargeAmount(r, globals = {}) {
  if (!globals.fuelSurchargeEnabled) return 0;

  const rate = Number(r.fuelSurchargeRate || 0);
  if (rate <= 0) return 0;

  const tripDate = String(r.RideDateISO || "");
  const start = String(globals.fuelSurchargeStart || "");
  const end = String(globals.fuelSurchargeEnd || "");

  if (!tripDate || !start || !end) return 0;
  if (tripDate < start || tripDate > end) return 0;

  const loadedMiles = Number(r.pricing?.audit?.billableMiles || 0);
  const dhMiles = r.review?.AddDeadhead ? Number(r.review?.DeadheadMiles || 0) : 0;

  return money(rate * (loadedMiles + dhMiles));
}

function addLine(lines, r, kind, description, amount, extra = {}) {
  const amt = money(amount);
  if (amt <= 0) return;

  lines.push({
    lineKind: kind,
    lineDescription: description,
    amount: amt,
    lineId: r.LineId,
    rideDateISO: r.RideDateISO || "",
    rider: riderLabel(r),
    tripShape: r.TripShape || "",
    mobility: r.Mobility || "",
    route: tripRouteLabel(r),
    ...extra,
  });
}

function buildBillableLines(r, globals = {}) {
  const lines = [];
  const dateLabel = fmtDateForLine(r.RideDateISO);
  const rider = riderLabel(r);
  const route = tripRouteLabel(r);
  const prefix = `${rider} ${dateLabel}`.trim();

  if (r.review?.MatchToQuote) {
    addLine(
      lines,
      r,
      "MATCH_TO_QUOTE",
      `Match to Quote - ${prefix}${route ? " - " + route : ""}`,
      Number(r.review?.QuoteAmount || 0)
    );
    return lines;
  }

  if (r.review?.NoCharge) {
    addLine(
      lines,
      r,
      "NO_CHARGE",
      `No Charge - ${prefix}${route ? " - " + route : ""}`,
      0.01
    );

    // force true zero after addLine's >0 guard
    lines[lines.length - 1].amount = 0;

    return lines;
  }

  const raw = String(r.RideStatus || "").trim().toLowerCase();
  const tmCancelled = raw === "noshow" || raw === "ridercancel";
  const override = String(r.review?.CancelOverride || "AUTO").toUpperCase();
  const isCancelled =
    override === "YES" ? true :
    override === "NO" ? false :
    tmCancelled;

  if (isCancelled) {
    addLine(
      lines,
      r,
      "CANCEL_FEE",
      `Cancellation Fee - ${prefix}${route ? " - " + route : ""}`,
      Number(r.pricing?.cancelFee || 0)
    );
    return lines;
  }

  addLine(
    lines,
    r,
    "BASE",
    `Transport ${prefix}${route ? " - " + route : ""}`,
    Number(r.pricing?.base || 0)
  );

  const mileageAmount = Number(r.pricing?.mileage || 0);
  const billableMiles = Number(r.pricing?.audit?.billableMiles || 0);
  addLine(
    lines,
    r,
    "MILEAGE",
    `Mileage - ${billableMiles} mi`,
    mileageAmount,
    { miles: billableMiles }
  );

  const isRtBase =
    String(r.TripShape || "").toUpperCase() === "ROUND_TRIP" ||
    String(r.TripShape || "").toUpperCase() === "MULTI_STOP";

  if (r.review?.AddNeedWC) {
    addLine(
      lines,
      r,
      "NEED_WC",
      "Need WC",
      Number(isRtBase ? r.availableWcAccessories?.needwc_rt : r.availableWcAccessories?.needwc_1w) || 0
    );
  }

  if (r.review?.AddRECL) {
    addLine(
      lines,
      r,
      "RECL",
      "Recliner",
      Number(isRtBase ? r.availableWcAccessories?.recl_rt : r.availableWcAccessories?.recl_1w) || 0
    );
  }

  if (r.review?.AddHazmat) {
    addLine(lines, r, "HAZMAT", "Hazmat", Number(r.availableCharges?.hazmat || 0));
  }

  if (r.review?.AddO2) {
    addLine(lines, r, "O2", "Oxygen", Number(r.availableCharges?.o2 || 0));
  }

  if (r.review?.AddBari) {
    addLine(lines, r, "BARI", "Bariatric", Number(r.availableCharges?.bari || 0));
  }

  if (r.review?.AddDeadhead) {
    addLine(
      lines,
      r,
      "DEADHEAD",
      `Deadhead - ${Number(r.review?.DeadheadMiles || 0)} mi`,
      computeDeadheadChargeFromReview(r),
      { miles: Number(r.review?.DeadheadMiles || 0) }
    );
  }

  if (r.review?.AddWait) {
    addLine(
      lines,
      r,
      "WAIT",
      `Wait Time - ${Number(r.review?.WaitTotalMinutes || 0)} min`,
      computeWaitCharge(r),
      { minutes: Number(r.review?.WaitTotalMinutes || 0) }
    );
  }

  const timeCharge = automaticTimeCharge(r);
  if (timeCharge && timeCharge.amount > 0) {
    addLine(
      lines,
      r,
      timeCharge.code,
      prettyTimeChargeLabel(timeCharge.code),
      timeCharge.amount
    );
  }

  const fuel = fuelSurchargeAmount(r, globals);
  if (fuel > 0) {
    addLine(lines, r, "FUEL_SURCHARGE", "Fuel Surcharge", fuel);
  }

  return lines;
}

module.exports = {
  buildBillableLines,
};