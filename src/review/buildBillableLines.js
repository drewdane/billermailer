const { progressiveDeadheadChargeFromMiles } = require("../orgs/CTT/pricing/utils/progressiveDeadhead");
const { cleanLocationName } = require("./cleanLocationName");

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

function cleanDob(v) {
  const s = String(v || "").trim();

  if (!s) return "";
  if (s === "/ /") return "";
  if (s === "//") return "";
  if (/^\/\s*\/$/.test(s)) return "";

  return s;
}

function formatDobPart(r) {
  const dob = cleanDob(r.DOB || r.DateOfBirth || r.BirthDate || "");
  return dob ? ` (DOB: ${dob})` : "";
}

function riderLabel(r) {
  const fullName = [r.FirstName, r.LastName].filter(Boolean).join(" ").trim();
  return fullName || "Unknown Rider";
}

function invoicePrefix(r) {
  const rider = riderLabel(r);
  const dob = formatDobPart(r);
  const date = fmtDateForLine(r.RideDateISO);

  return `${rider}${dob} - TRIP DATE: ${date}`;
}

function locationLabel(name, address1) {
  return [name, address1]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" ");
}

function invoiceRouteLabel(r) {
  const from = locationLabel(cleanLocationName(r.PickupName || ""), r.PickupAddress1);
  const to = locationLabel(cleanLocationName(r.DropoffName || ""), r.DropoffAddress1);

  if (from && to) return ` - FROM: ${from} TO ${to}`;
  if (from) return ` - FROM: ${from}`;
  if (to) return ` - TO ${to}`;
  return "";
}

function tripChargeLabel(r) {
  const shape = String(r.TripShape || "").toUpperCase();

  if (shape === "ROUND_TRIP") return "Trip Charge - Round Trip";
  if (shape === "MULTI_STOP") return "Trip Charge - Multi-Stop";

  return "Trip Charge - One Way";
}

function tripRouteLabel(r) {
  const pu = cleanLocationName(r.PickupName || "") || String(r.PickupAddress1 || "").trim();
  const doff = cleanLocationName(r.DropoffName || "") || String(r.DropoffAddress1 || "").trim();
  if (pu && doff) return `${pu} to ${doff}`;
  return pu || doff || "";
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

  return money(progressiveDeadheadChargeFromMiles(miles, cfg));
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

function productServiceForKind(kind) {
  const k = String(kind || "").toUpperCase();

  if (k === "BASE") return "Trip Charge";
  if (k === "MILEAGE") return "Mileage";
  if (k === "CANCEL_FEE") return "Cancellation Fee";
  if (k === "AFTER_HOURS" || k === "THIRD_SHIFT") return "After Hours";
  if (k === "WEEKEND") return "Weekend";
  if (k === "O2") return "Oxygen";
  if (k === "DEADHEAD") return "Deadhead";

  if (k === "MATCH_TO_QUOTE") return "Transport Miscellaneous Income";
  if (k === "FUEL_SURCHARGE") return "Transport Miscellaneous Income";
  if (k === "WAIT") return "Transport Miscellaneous Income";
  if (k === "ATTENDANT") return "Transport Miscellaneous Income";
  if (k === "NEED_WC" || k === "RECL" || k === "BARI" || k === "HAZMAT") {
    return "Transport Miscellaneous Income";
  }

  return "Services";
}

function addLine(lines, r, kind, description, amount, extra = {}) {
  const amt = money(amount);
  if (amt <= 0 && !extra.forceZero) return;

  lines.push({
    lineKind: kind,
    productService: extra.productService || productServiceForKind(kind),
    lineDescription: description,
    amount: extra.forceZero ? 0 : amt,
    lineId: r.LineId,
    rideDateISO: r.RideDateISO || "",
    rider: riderLabel(r),
    tripShape: r.TripShape || "",
    mobility: r.Mobility || "",
    route: tripRouteLabel(r),
    ...extra,
  });

  delete lines[lines.length - 1].forceZero;
}

function buildBillableLines(r, globals = {}) {
  if ((r.review?.Action || r.Action || "INCLUDE") === "EXCLUDE") {
    return [];
  }

  const lines = [];
  const dateLabel = fmtDateForLine(r.RideDateISO);
  const rider = riderLabel(r);
  const route = tripRouteLabel(r);
  const prefix = invoicePrefix(r);
  const routeText = invoiceRouteLabel(r);
  const forceZeroMode = !!(r.review?.MatchToQuote || r.review?.NoCharge);
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
    `${prefix}${routeText} - ${tripChargeLabel(r)}`,
    Number(r.pricing?.base || 0),
    { forceZero: forceZeroMode }
  );

  const mileageAmount = Number(r.pricing?.mileage || 0);
  const billableMiles = Number(r.pricing?.audit?.billableMiles || 0);
  addLine(
    lines,
    r,
    "MILEAGE",
    `${prefix} - Mileage - ${billableMiles} mi`,
    mileageAmount,
    { miles: billableMiles, forceZero: forceZeroMode }
  );

  const isRtBase =
    String(r.TripShape || "").toUpperCase() === "ROUND_TRIP" ||
    String(r.TripShape || "").toUpperCase() === "MULTI_STOP";

  if (r.review?.AddNeedWC) {
    addLine(
      lines,
      r,
      "NEED_WC",
      `${prefix} - Provide WC`,
      Number(isRtBase ? r.availableWcAccessories?.needwc_rt : r.availableWcAccessories?.needwc_1w) || 0,
      { forceZero: forceZeroMode }
    );
  }

  if (r.review?.AddRECL) {
    addLine(
      lines,
      r,
      "RECL",
      `${prefix} - Reclining WC`,
      Number(isRtBase ? r.availableWcAccessories?.recl_rt : r.availableWcAccessories?.recl_1w) || 0,
      { forceZero: forceZeroMode }
    );
  }

  if (r.review?.AddHazmat) {
    addLine(lines, r, "HAZMAT", `${prefix} - HAZMAT`, Number(r.availableCharges?.hazmat || 0), { forceZero: forceZeroMode });
  }

  if (r.review?.AddO2) {
    addLine(lines, r, "O2", `${prefix} - Provide Oxygen`, Number(r.availableCharges?.o2 || 0), { forceZero: forceZeroMode });
  }

  if (r.review?.AddBari) {
    addLine(lines, r, "BARI", `${prefix} - Bariatric fee`, Number(r.availableCharges?.bari || 0), { forceZero: forceZeroMode });
  }

  if (r.review?.AddDeadhead) {
    addLine(
      lines,
      r,
      "DEADHEAD",
      `${prefix} - Deadhead - ${Number(r.review?.DeadheadMiles || 0)} mi`,
      computeDeadheadChargeFromReview(r),
      { miles: Number(r.review?.DeadheadMiles || 0), forceZero: forceZeroMode }
    );
  }

  if (r.review?.AddWait) {
    addLine(
      lines,
      r,
      "WAIT",
      `${prefix} - Wait Time - ${Number(r.review?.WaitTotalMinutes || 0)} min`,
      computeWaitCharge(r),
      { minutes: Number(r.review?.WaitTotalMinutes || 0), forceZero: forceZeroMode }
    );
  }

  const timeCharge = automaticTimeCharge(r);
  if (timeCharge && (timeCharge.amount > 0 || forceZeroMode)) {
    addLine(
      lines,
      r,
      timeCharge.code,
      prettyTimeChargeLabel(timeCharge.code),
      timeCharge.amount,
      { forceZero: forceZeroMode }
    );
  }

  const fuel = fuelSurchargeAmount(r, globals);
  if (fuel > 0 || forceZeroMode) {
    addLine(lines, r, "FUEL_SURCHARGE", `${prefix} - Fuel Surcharge`, fuel, { forceZero: forceZeroMode });
  }

  if (r.review?.NoCharge) {
    for (const line of lines) {
      line.amount = 0;
    }

    if (!lines.length) {
      addLine(
        lines,
        r,
        "NO_CHARGE",
        `${prefix} - No Charge`,
        0,
        { forceZero: true }
      );
    }

    return lines;
  }

  if (r.review?.MatchToQuote) {
    for (const line of lines) {
      line.amount = 0;
    }

    addLine(
      lines,
      r,
      "MATCH_TO_QUOTE",
      `${prefix} - Match to Quote`,
      Number(r.review?.QuoteAmount || 0)
    );

    return lines;
  }

  return lines;
}

module.exports = {
  buildBillableLines,
};