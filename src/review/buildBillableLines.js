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

function cleanTime(v) {
  const s = String(v || "").trim();

  if (!s) return "";

  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;

  let hour = Number(m[1]);
  const minute = m[2];

  const ampm = hour >= 12 ? "pm" : "am";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${ampm}`;
}

function cleanDob(v) {
  let s = String(v || "").trim();

  if (!s) return "";
  if (s === "/ /") return "";
  if (s === "//") return "";
  if (/^\/\s*\/$/.test(s)) return "";

  s = s.replace(/\s+12:00:00\s+AM$/i, "").trim();

  return s;
}

function riderLabel(r) {
  const fullName = [r.FirstName, r.LastName].filter(Boolean).join(" ").trim();
  return fullName || "Unknown Rider";
}

function formatDobPart(r) {
  const dob = cleanDob(r.DOB || r.DateOfBirth || r.BirthDate || "");
  return dob ? ` (DOB: ${dob})` : "";
}

function extractMraNumber(r) {
  const text = [
    r.Comments,
    r.Comments1,
    r.SpecialDirections,
    r.notesFull,
  ]
    .filter(Boolean)
    .join("\n");

  const m = text.match(/MRA\s*(?:#|num|number)?\s*(\d{9})/i);

  return m ? m[1] : "";
}

function formatMraPart(r) {
  const mra = String(
    r.review?.MraNumberOverride ||
    extractMraNumber(r) ||
    ""
  ).trim();

  return mra ? ` - MRA# ${mra}` : "";
}

function formatPoPart(r) {
  const po = String(
    r.review?.PoNumberOverride ||
    r.poNumber ||
    r.PONumber ||
    r.po_number ||
    ""
  ).trim();

  return po ? ` - PO# ${po}` : "";
}

function invoicePrefix(r) {
  const rider = riderLabel(r);
  const dob = formatDobPart(r);
  const mra = formatMraPart(r);
  const po = formatPoPart(r);
  const date = fmtDateForLine(r.RideDateISO);

  return `${rider}${dob}${mra}${po} - TRIP DATE: ${date}`;
}

function locationLabel(name, address1) {
  return [name, address1]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" ");
}

function invoiceRouteLabel(r) {
  const puName = cleanLocationName(r.review?.PickupNameOverride || r.PickupName || "");
  const puAddr = String(r.review?.PickupAddress1Override || r.PickupAddress1 || "").trim();

  const doName = cleanLocationName(r.review?.DropoffNameOverride || r.DropoffName || "");
  const doAddr = String(r.review?.DropoffAddress1Override || r.DropoffAddress1 || "").trim();

  const includeTimes = !!r.invoiceIncludeActualTimes;

  const firstLeg = Array.isArray(r.legs) && r.legs.length ? r.legs[0] : null;
  const lastLeg = Array.isArray(r.legs) && r.legs.length ? r.legs[r.legs.length - 1] : null;

  const puTime = cleanTime(
    r.review?.ActualPickupTimeOverride ||
    r.ActualPickupTime ||
    firstLeg?.ActualPickupTime ||
    r.PickupArrivalTime ||
    firstLeg?.PickupArrivalTime ||
    ""
  );

  const doTime = cleanTime(
    r.review?.ActualDropoffTimeOverride ||
    r.ActualDropoffTime ||
    lastLeg?.ActualDropoffTime ||
    r.DropoffArrivalTime ||
    lastLeg?.DropoffArrivalTime ||
    ""
  );

  const puSuffix =
    includeTimes && puTime
      ? ` (Pick up ${puTime})`
      : "";

  const doSuffix =
    includeTimes && doTime
      ? ` (Drop off ${doTime})`
      : "";

  const from = [puName, puAddr].filter(Boolean).join(" ");
  const to = [doName, doAddr].filter(Boolean).join(" ");

  if (from && to) return ` - FROM: ${from}${puSuffix} TO ${to}${doSuffix}`;
  if (from) return ` - FROM: ${from}${puSuffix}`;
  if (to) return ` - TO ${to}${doSuffix}`;
  return "";
}

function tripChargeLabel(r) {
  const shape = String(r.TripShape || "").toUpperCase();
  const mobility = String(r.Mobility || "").toUpperCase();

  if (shape === "ROUND_TRIP") {return "Trip Charge - Round Trip";}
  if (shape === "MULTI_STOP") {return "Trip Charge - Multi-Stop";}
  
  if (mobility === "STR") {return "Trip Charge - 1-Way with Stretcher";}
  if (r.review?.AddRECL) {return "Trip Charge - 1-Way with Recliner";}
  if (r.review?.AddNeedWC || mobility === "WC") {return "Trip Charge - 1-Way with Wheelchair";}
  return "Trip Charge - 1-Way";
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
  if (!tripDate) return 0;

  const windows = Array.isArray(globals.fuelSurchargeWindows)
    ? globals.fuelSurchargeWindows
    : [];

  const effectiveWindows = windows.length
    ? windows
    : [
        {
          start: globals.fuelSurchargeStart || "",
          end: globals.fuelSurchargeEnd || "",
        },
      ];

  const inWindow = effectiveWindows.some((win) => {
    const start = String(win.start || "");
    const end = String(win.end || "");

    if (!start || !end) return false;

    return tripDate >= start && tripDate <= end;
  });

  if (!inWindow) return 0;

  const loadedMiles = Number(
    r.review?.MileageOverride ||
    r.pricing?.audit?.billableMiles ||
    r.DirectMileage ||
    0
  );

  const dhMiles = r.review?.AddDeadhead
    ? Number(r.review?.DeadheadMiles || 0)
    : 0;

  return money(rate * (loadedMiles + dhMiles));
}

function productServiceForKind(kind) {
  const k = String(kind || "").toUpperCase();

  if (k === "BASE") return "Trip Charge";
  if (k === "MILEAGE") return "Mileage";
  if (k === "CANCEL_FEE") return "Cancellation Fee";
  if (k === "AFTER_HOURS") return "After Hours Fee";
  if (k === "THIRD_SHIFT" || k === "WEEKEND") {
    return "3rd Shift/Holiday";
  }
  if (k === "O2") return "Oxygen";
  if (k === "DEADHEAD") return "Dry Run";
  if (k === "WAIT") return "Wait Time";
  if (k === "ATTENDANT") return "Attendant/Aide";
  if (k === "HAZMAT") return "HazMat Handling Fee";
  if (k === "BARI") return "Bariatric Surcharge";
  if (k === "MATCH_TO_QUOTE") {
    return "Transport Miscellaneous Income";
  }

  return "Trip Charge";
}

function addLine(lines, r, kind, description, amount, extra = {}) {
  const amt = money(amount);
  if (amt < 0 && !extra.allowNegative) return;
  if (amt === 0 && !extra.forceZero) return;

  lines.push({
    lineKind: kind,
    productService: extra.productService || productServiceForKind(kind),
    lineDescription: description,
    qty: extra.qty ?? 1,
    rate: extra.rate ?? amt,
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
  delete lines[lines.length - 1].allowNegative;
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
  const forceZeroMode = !!r.review?.NoCharge;
  const raw = String(r.RideStatus || "").trim().toLowerCase();
  const tmCancelled = raw === "noshow" || raw === "ridercancel";
  const override = String(r.review?.CancelOverride || "AUTO").toUpperCase();
  const isCancelled =
    override === "YES" ? true :
    override === "NO" ? false :
    tmCancelled;

  if (r.review?.NoCharge && isCancelled) {
    addLine(
      lines,
      r,
      "CANCEL_FEE",
      `${prefix}${routeText} - Cancellation Fee - No Charge`,
      0,
      { forceZero: true }
    );
    return lines;
  }

  if (r.review?.NoCharge) {
    addLine(
      lines,
      r,
      "BASE",
      `${prefix}${routeText} - ${tripChargeLabel(r)} - No Charge`,
      0,
      { forceZero: true }
    );
    return lines;
  }

  if (isCancelled) {
    addLine(
      lines,
      r,
      "CANCEL_FEE",
      `${prefix}${routeText} - Cancellation Fee`,
      Number(r.pricing?.cancelFee || 0),
      { forceZero: forceZeroMode }
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
  const billableMiles = Number(r.review?.MileageOverride || r.pricing?.audit?.billableMiles || r.DirectMileage || 0);
  addLine(
    lines,
    r,
    "MILEAGE",
    `${prefix} - Mileage - ${billableMiles} mi`,
    mileageAmount,
    {
      miles: billableMiles,
      qty: billableMiles,
      rate: billableMiles > 0 ? money(mileageAmount / billableMiles) : mileageAmount,
      forceZero: forceZeroMode
    }
  );

  const isRtBase =
    String(r.TripShape || "").toUpperCase() === "ROUND_TRIP" ||
    String(r.TripShape || "").toUpperCase() === "MULTI_STOP";

  if (r.review?.AddHazmat) {
    addLine(lines, r, "HAZMAT", `${prefix} - HAZMAT`, Number(r.availableCharges?.hazmat || 0), { forceZero: forceZeroMode });
  }

  if (r.review?.AddO2) {
    addLine(lines, r, "O2", `${prefix} - Provide Oxygen`, Number(r.availableCharges?.o2 || 0), { forceZero: forceZeroMode });
  }

  if (r.review?.AddBari) {
    addLine(lines, r, "BARI", `${prefix} - Bariatric fee`, Number(r.availableCharges?.bari || 0), { forceZero: forceZeroMode });
  }

  if (r.review?.AddDeadhead && String(r.TripShape || "").toUpperCase() !== "ROUND_TRIP") {
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
      `${prefix} - ${prettyTimeChargeLabel(timeCharge.code)}`,
      timeCharge.amount,
      { forceZero: forceZeroMode }
    );
  }

  const fuel = fuelSurchargeAmount(r, globals);
  if (fuel > 0) {
    addLine(lines, r, "FUEL_SURCHARGE", `${prefix} - Fuel Surcharge`, fuel);
  }

    if (r.review?.MatchToQuote) {
      const quoteAmount = money(r.review?.QuoteAmount || 0);
      const actualTotal = money(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0));
      const variance = money(quoteAmount - actualTotal);
      const billingClass = String(r.BillingClass || "").toUpperCase();

      // Contract/client overquote:
      // Collapse everything to one Trip Charge line at quoted amount.
      if (billingClass !== "PRIVATE_PAY" && variance > 0) {
        return [
          {
            lineKind: "BASE",
            productService: "Trip Charge",
            lineDescription: `${prefix}${routeText} - ${tripChargeLabel(r)}, per Quote`,
            qty: 1,
            rate: quoteAmount,
            amount: quoteAmount,
            lineId: r.LineId,
            rideDateISO: r.RideDateISO || "",
            rider: riderLabel(r),
            tripShape: r.TripShape || "",
            mobility: r.Mobility || "",
            route: tripRouteLabel(r),
          }
        ];
      }

      // Contract underquote OR any Private Pay MTQ:
      // Keep itemized lines and put variance in Transport Miscellaneous Income.
      if (variance !== 0) {
        addLine(
          lines,
          r,
          "MATCH_TO_QUOTE",
          variance < 0
            ? `${prefix} - Discount per Quote`
            : `${prefix} - Match to Quote variance`,
          variance,
          {
            productService: "Transport Miscellaneous Income",
            allowNegative: true,
            qty: "",
            rate: ""
          }
        );
      }

      return lines;
    }

  return lines;
}

module.exports = {
  buildBillableLines,
};