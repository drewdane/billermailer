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

function isPrivatePayTrip(r) {
  const billingClass = String(r.BillingClass || "").trim().toUpperCase();
  const accountCode = String(r.AccountCode || "").trim().toLowerCase();
  const accountName = String(r.AccountName || "").trim().toLowerCase();
  const customer = String(r.customer || "").trim().toLowerCase();

  return (
    billingClass === "PRIVATE_PAY" ||
    billingClass === "PRIVATE PAY" ||
    accountCode.includes("private pay") ||
    accountName.includes("private pay") ||
    accountCode === "ctt comp" ||
    accountName === "ctt comp" ||
    customer.includes("private pay") ||
    customer === "ctt comp"
  );
}

function riderLabel(r) {
  const first = String(r.FirstName || "").trim();
  const last = String(r.LastName || "").trim();

  if (last && first) return `${last}, ${first}`;
  if (last) return last;
  if (first) return first;

  return "Unknown Rider";
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

  const dob = isPrivatePayTrip(r)
    ? ""
    : formatDobPart(r);

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

function invoiceFullStopListLabel(r) {
  const legs = Array.isArray(r.legs) ? r.legs : [];
  if (!legs.length) return "";

  function legSortTime(leg) {
    return [
      String(leg.RideDateISO || leg.RideDate || ""),
      String(
        leg.ActualPickupTime ||
        leg.PickupArrivalTime ||
        leg.ScheduledPickupTime ||
        leg.PickupTime ||
        ""
      )
    ].join(" ");
  }

  const sortedLegs = legs.slice().sort((a, b) =>
    legSortTime(a).localeCompare(legSortTime(b))
  );

  const parts = [];

  for (const leg of sortedLegs) {
    const isFirstLeg = sortedLegs.indexOf(leg) === 0;

    const puName = cleanLocationName(
      isFirstLeg
        ? (r.review?.PickupNameOverride || leg.PickupName || "")
        : (leg.PickupName || "")
    );
    const puAddr = String(
      isFirstLeg
        ? (r.review?.PickupAddress1Override || leg.PickupAddress1 || "")
        : (leg.PickupAddress1 || "")
    ).trim();

    const doName = cleanLocationName(
      isFirstLeg
        ? (r.review?.DropoffNameOverride || leg.DropoffName || "")
        : (leg.DropoffName || "")
    );
    const doAddr = String(
      isFirstLeg
        ? (r.review?.DropoffAddress1Override || leg.DropoffAddress1 || "")
        : (leg.DropoffAddress1 || "")
    ).trim();

    const puTime = cleanTime(
      leg.ActualPickupTime ||
      leg.PickupArrivalTime ||
      leg.ScheduledPickupTime ||
      ""
    );

    const doTime = cleanTime(
      leg.ActualDropoffTime ||
      leg.DropoffArrivalTime ||
      ""
    );

    const puSuffix = puTime ? ` (Pick up ${puTime})` : "";
    const doSuffix = doTime ? ` (Drop off ${doTime})` : "";

    const from = [puName, puAddr].filter(Boolean).join(" ");
    const to = [doName, doAddr].filter(Boolean).join(" ");

    if (from && to) parts.push(`FROM: ${from}${puSuffix} TO ${to}${doSuffix}`);
    else if (from) parts.push(`FROM: ${from}${puSuffix}`);
    else if (to) parts.push(`TO ${to}${doSuffix}`);
  }

  return parts.length ? " - " + parts.join("; ") : "";
}

function invoiceRouteLabel(r) {
  if (r.invoiceFullStopList && Array.isArray(r.legs) && r.legs.length) {
    return invoiceFullStopListLabel(r);
  }

  function legSortTime(leg) {
    const src =
      Array.isArray(leg.legs) && leg.legs.length
        ? leg.legs[0]
        : leg;

    return [
      String(src.RideDateISO || src.RideDate || ""),
      String(
        src.ActualPickupTime ||
        src.PickupArrivalTime ||
        src.ScheduledPickupTime ||
        src.PickupTime ||
        ""
      )
    ].join(" ");
  }

  const sortedLegs = Array.isArray(r.legs)
    ? r.legs.slice().sort((a, b) =>
        legSortTime(a).localeCompare(legSortTime(b))
      )
    : [];

const firstLeg = sortedLegs.length ? sortedLegs[0] : null;
const lastLeg = sortedLegs.length ? sortedLegs[sortedLegs.length - 1] : null;

  const shape = String(r.TripShape || "").toUpperCase();

  const useLegRoute =
    (shape === "ROUND_TRIP" || shape === "MULTI_STOP") &&
    firstLeg &&
    lastLeg;

  const puSource = useLegRoute ? firstLeg : r;

  const doSource =
    shape === "ROUND_TRIP" && firstLeg
      ? firstLeg
      : useLegRoute
        ? lastLeg
        : r;

  const puName = cleanLocationName(
    r.review?.PickupNameOverride || puSource.PickupName || ""
  );
  const puAddr = String(
    r.review?.PickupAddress1Override || puSource.PickupAddress1 || ""
  ).trim();

  const doName = cleanLocationName(
    r.review?.DropoffNameOverride || doSource.DropoffName || ""
  );
  const doAddr = String(
    r.review?.DropoffAddress1Override || doSource.DropoffAddress1 || ""
  ).trim();

  const includeTimes = !!r.invoiceIncludeActualTimes;

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

function foldedWcAccessoryAmount(r) {
  const shape = String(r.TripShape || "").toUpperCase();
  const isRt = shape === "ROUND_TRIP" || shape === "MULTI_STOP";
  const src = r.availableWcAccessories || {};

  if (r.review?.AddRECL) {
    return Number(isRt ? (src.recl_rt || 0) : (src.recl_1w || 0));
  }

  if (r.review?.AddNeedWC) {
    return Number(isRt ? (src.needwc_rt || 0) : (src.needwc_1w || 0));
  }

  return 0;
}

function tripChargeLabel(r) {
  const shape = String(r.TripShape || "").toUpperCase();
  const mobility = String(r.Mobility || "").toUpperCase();

  if (shape === "ROUND_TRIP") {return "Trip Charge - Round Trip";}
  if (shape === "MULTI_STOP") {return "Trip Charge - Multi-Stop";}
  
  if (mobility === "STR") {return "Trip Charge - 1-Way with Stretcher";}
  if (r.review?.AddRECL) {return "Trip Charge - 1-Way with Recliner";}

  if (r.review?.AddNeedWC) {
    return "Trip Charge - 1-Way with Wheelchair";}
  return "Trip Charge - 1-Way";
}

function tripRouteLabel(r) {
  const pu =
    cleanLocationName(r.review?.PickupNameOverride || r.PickupName || "") ||
    String(r.review?.PickupAddress1Override || r.PickupAddress1 || "").trim();

  const doff =
    cleanLocationName(r.review?.DropoffNameOverride || r.DropoffName || "") ||
    String(r.review?.DropoffAddress1Override || r.DropoffAddress1 || "").trim();

  if (pu && doff) return `${pu} to ${doff}`;
  return pu || doff || "";
}

function msComponentRouteText(r, componentIndex, componentKind) {
  const legs = Array.isArray(r.legs) ? r.legs : [];
  if (!legs.length) return invoiceRouteLabel(r);

  function legSortTime(leg) {
    return [
      String(leg.RideDateISO || leg.RideDate || ""),
      String(
        leg.ActualPickupTime ||
        leg.PickupArrivalTime ||
        leg.ScheduledPickupTime ||
        leg.PickupTime ||
        ""
      )
    ].join(" ");
  }

  const sortedLegs = legs.slice().sort((a, b) =>
    legSortTime(a).localeCompare(legSortTime(b))
  );

  const kind = String(componentKind || "").toUpperCase();

  const startIdx =
    kind === "RT"
      ? Number(componentIndex || 0) * 2
      : Number(componentIndex || 0);

  const endIdx =
    kind === "RT"
      ? Math.min(startIdx + 1, sortedLegs.length - 1)
      : startIdx;

  const firstLeg = sortedLegs[startIdx];
  const lastLeg = sortedLegs[endIdx];

  if (!firstLeg) return invoiceRouteLabel(r);

  const puName = cleanLocationName(firstLeg.PickupName || "");
  const puAddr = String(firstLeg.PickupAddress1 || "").trim();

  const doName = cleanLocationName((lastLeg || firstLeg).DropoffName || "");
  const doAddr = String((lastLeg || firstLeg).DropoffAddress1 || "").trim();

  const includeTimes = !!r.invoiceIncludeActualTimes;

  const puTime = cleanTime(
    firstLeg.ActualPickupTime ||
    firstLeg.PickupArrivalTime ||
    firstLeg.ScheduledPickupTime ||
    ""
  );

  const doTime = cleanTime(
    (lastLeg || firstLeg).ActualDropoffTime ||
    (lastLeg || firstLeg).DropoffArrivalTime ||
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

function timeChargeAmountForCode(r, code) {
  const c = String(code || "").toUpperCase();
  const auto = automaticTimeCharge(r);

  if (auto && auto.code === c) return money(auto.amount || 0);

  const charges = r.availableCharges || {};

  if (c === "AFTER_HOURS") return money(charges.after_hours || 0);
  if (c === "THIRD_SHIFT") return money(charges.third_shift || 0);
  if (c === "WEEKEND") return money(charges.weekend || 0);
  if (c === "HOLIDAY") return money(charges.holiday || 0);

  return 0;
}

function selectedTimeCharge(r) {
  const review = r.review || {};

  if (review.AddHoliday) {
    return { code: "HOLIDAY", amount: timeChargeAmountForCode(r, "HOLIDAY") };
  }

  if (review.AddThirdShift) {
    return { code: "THIRD_SHIFT", amount: timeChargeAmountForCode(r, "THIRD_SHIFT") };
  }

  if (review.AddWeekend) {
    return { code: "WEEKEND", amount: timeChargeAmountForCode(r, "WEEKEND") };
  }

  if (review.AddAfterHours) {
    return { code: "AFTER_HOURS", amount: timeChargeAmountForCode(r, "AFTER_HOURS") };
  }

  if (!review.TimeChargeManual) {
    const auto = automaticTimeCharge(r);
    if (auto?.code) return auto;
  }

  return null;
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

  const shape = String(r.TripShape || "").toUpperCase();
  if (shape !== "ONE_WAY") return 0;

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

  const tier2Start = Number(String(cfg.dh_tier2_start_miles || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  const tier3Start = Number(String(cfg.dh_tier3_start_miles || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);

  const rate1 = Number(String(cfg.dh_rate_tier1 || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  const rate2 = Number(String(cfg.dh_rate_tier2 || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);
  const rate3 = Number(String(cfg.dh_rate_tier3 || "").replace(/\$/g, "").replace(/,/g, "").trim() || 0);

  let rate = 0;

  if (tier3Start > 0 && miles >= tier3Start && rate3 > 0) {
    rate = rate3;
  } else if (tier2Start > 0 && miles >= tier2Start && rate2 > 0) {
    rate = rate2;
  } else if (rate1 > 0) {
    rate = rate1;
  }

  return money(miles * rate);
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

  return money(rate * (loadedMiles));
}

function productServiceForKind(kind) {
  const k = String(kind || "").toUpperCase();

  if (k === "BASE") return "Trip Charge";
  if (k === "MILEAGE") return "Mileage";
  if (k === "CANCEL_FEE") return "Cancellation Fee";
  if (k === "AFTER_HOURS") return "After Hours Fee";
  if (k === "THIRD_SHIFT") return "3rd Shift";
  if (k === "HOLIDAY") return "Holiday";
  if (k === "WEEKEND") return "Weekend";
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
      Number(r.pricing?.cancelFee || r.availableCharges?.cancel_fee || 0),
      { forceZero: forceZeroMode }
    );
  } else {

    const msComponents = Array.isArray(r.pricing?.audit?.multiStopBaseComponents)
      ? r.pricing.audit.multiStopBaseComponents
      : [];

    if (
      String(r.TripShape || "").toUpperCase() === "MULTI_STOP" &&
      msComponents.length
    ) {
      for (const comp of msComponents) {
        const compRouteText = msComponentRouteText(
          r,
          Number(comp.componentIndex || 0),
          comp.kind
        );

        const totalLegs = Number(r.LegCount || r.legs?.length || 0);

        const legStart = (Number(comp.componentIndex || 0) * 2) + 1;
        const legEnd = comp.kind === "RT"
          ? Math.min(legStart + 1, totalLegs)
          : legStart;

        const legLabel = legStart === legEnd
          ? `Leg ${legStart} of ${totalLegs}`
          : `Legs ${legStart} & ${legEnd} of ${totalLegs}`;

        const mobilityLabel =
          String(r.Mobility || "").toUpperCase() === "STR"
            ? " with Stretcher"
            : r.review?.AddRECL
              ? " with Recliner"
              : r.review?.AddNeedWC
                ? " with Wheelchair"
                : "";

        const label = `Trip Charge - ${legLabel}${mobilityLabel}`;

        addLine(
          lines,
          r,
          "BASE",
          `${prefix}${compRouteText} - ${label}`,
          Number(comp.amount || 0),
          { forceZero: forceZeroMode }
        );
      }
    } else {
      addLine(
        lines,
        r,
        "BASE",
        `${prefix}${routeText} - ${tripChargeLabel(r)}`,
        Number(r.pricing?.base || 0) + foldedWcAccessoryAmount(r),
        { forceZero: forceZeroMode }
      );
    }

    const mileageAmount = Number(r.pricing?.mileage || 0);
    const billableMiles = Math.ceil(
      Number(r.pricing?.audit?.billableMiles || r.review?.MileageOverride || r.DirectMileage || 0)
    );

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
  }

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

  if (
    r.review?.AddDeadhead &&
    String(r.TripShape || "").toUpperCase() === "ONE_WAY"
  ) {
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

  const timeCharge = selectedTimeCharge(r);
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
      // Hide positive quote variance by adding it to the Trip Charge line.
      if (billingClass !== "PRIVATE_PAY" && variance > 0) {
        const baseLine = lines.find((line) => line.lineKind === "BASE");

        if (baseLine) {
          baseLine.amount = money(Number(baseLine.amount || 0) + variance);
          baseLine.rate = money(Number(baseLine.rate || 0) + variance);
          return lines;
        }
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