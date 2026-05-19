// cleanLocationName is loaded into window by bm-review-server.js
function renderRows() {
    
  const fuelState = window.BM_GLOBALS || {
    fuelSurchargeEnabled: false,
    fuelSurchargeStart: "",
    fuelSurchargeEnd: ""
  };

  const q = (document.getElementById("search").value || "").toLowerCase().trim();

  const rows = ITEMS.filter((r) => {
    if (!q) return true;

    const hay = [
      r.FirstName,
      r.LastName,
      window.cleanLocationName ? window.cleanLocationName(r.PickupName || "") : r.PickupName,
      window.cleanLocationName ? window.cleanLocationName(r.DropoffName || "") : r.DropoffName,
      r.PickupCity,
      r.DropoffCity,
      r.notesFull,
      r.RideStatus,
      r.Mobility,
      r.TripShape,
    ]
      .map((v) => String(v || ""))
      .join(" ")
      .toLowerCase();

    return hay.includes(q);
  });

  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = "";

  const table = document.createElement("table");
  table.style.tableLayout = "fixed";
  table.style.width = "100%";

  table.innerHTML =
    "<thead><tr>" +
      "<th style='width:90px'>Date</th>" +
      "<th style='width:55px'>Incl</th>" +
      "<th style='width:150px'>Rider</th>" +
      "<th style='width:180px'>Pick up</th>" +
      "<th style='width:180px'>Drop-off</th>" +
      "<th style='width:55px'>Mi</th>" +
      "<th>Notes</th>" +
      "<th style='width:520px'>Adjustments</th>" +
      "<th style='width:90px'>Total</th>" +
    "</tr></thead>";

  const tb = document.createElement("tbody");

  function makeCell(html = "") {
    const td = document.createElement("td");
    td.innerHTML = html;
    return td;
  }

  function fmtMoney(n) {
    return "$" + Number(n || 0).toFixed(2);
  }

  function moneyNum(v) {
    const cleaned = String(v ?? "")
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .trim();

    const n = Number(cleaned || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function tripShapeLabel(r) {
    if (r.pricing && r.pricing.badge) return r.pricing.badge;
    return r.TripShape === "ROUND_TRIP" ? "RT"
      : r.TripShape === "MULTI_STOP" ? "MS"
      : "1W";
  }

  function extractMraNumberFromText(text) {
    const m = String(text || "").match(/MRA\s*(?:#|num|number)?\s*(\d{9})/i);
    return m ? m[1] : "";
  }
  
  function computeWaitCharge(r) {
    if (!r.review?.AddWait) return 0;

    const cfg = r.waitConfig || {};
    const waitMinutes = Number(r.review?.WaitTotalMinutes || 0);
    if (waitMinutes <= 0) return 0;

    const rate = moneyNum(cfg.wait_rate);
    if (rate <= 0) return 0;

    const blockMin = moneyNum(cfg.wait_block_min);
    const graceMin = moneyNum(cfg.wait_grace_min);

    const chargedMinutes = Math.max(0, waitMinutes - graceMin);
    if (chargedMinutes <= 0) return 0;

    if (blockMin > 0) {
      return Math.ceil(chargedMinutes / blockMin) * rate;
    }

    return rate;
  }

    function computeDeadheadChargeFromReview(r) {
    if (!r.review?.AddDeadhead) return 0;

    const miles = Number(r.review?.DeadheadMiles || 0);
    if (miles <= 0) return 0;

    const cfg = r.deadheadConfig || {};

    const flatRaw = String(cfg.dh_flat_fee ?? "").trim();
    const flatFee = moneyNum(cfg.dh_flat_fee);

    if (flatRaw && flatFee > 0) {
      return flatFee;
    }

    const startMiles = moneyNum(cfg.dh_start_miles);
    const rate1 = moneyNum(cfg.dh_rate_tier1);
    const rate2 = moneyNum(cfg.dh_rate_tier2);
    const rate3 = moneyNum(cfg.dh_rate_tier3);

    const tier2Start = moneyNum(cfg.dh_tier2_start_miles);
    const tier3Start = moneyNum(cfg.dh_tier3_start_miles);

    if (miles <= startMiles) return 0;

    let total = 0;

    // Tier 1: after free miles up to tier 2 start
    const tier1From = startMiles;
    const tier1To = tier2Start > 0 ? Math.min(miles, tier2Start - 1) : miles;
    if (rate1 > 0 && tier1To > tier1From) {
      total += (tier1To - tier1From) * rate1;
    }

    // Tier 2
    if (tier2Start > 0 && miles >= tier2Start && rate2 > 0) {
      const tier2To = tier3Start > 0 ? Math.min(miles, tier3Start - 1) : miles;
      if (tier2To >= tier2Start) {
        total += (tier2To - tier2Start + 1) * rate2;
      }
    }

    // Tier 3
    if (tier3Start > 0 && miles >= tier3Start && rate3 > 0) {
      total += (miles - tier3Start + 1) * rate3;
    }

    return total;
  }

  function fuelSurchargeAmount(r) {
    if (!fuelState.fuelSurchargeEnabled) return 0;

    const rate = Number(r.fuelSurchargeRate || 0);
    if (rate <= 0) return 0;

    const tripDate = String(r.RideDateISO || "");
    if (!tripDate) return 0;

    const windows = Array.isArray(fuelState.fuelSurchargeWindows)
      ? fuelState.fuelSurchargeWindows
      : [];

    const effectiveWindows = windows.length
      ? windows
      : [
          {
            start: fuelState.fuelSurchargeStart || "",
            end: fuelState.fuelSurchargeEnd || "",
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

    return rate * (loadedMiles + dhMiles);
  }

  function pricedAccessoryAmount(r, code) {
    const lines = Array.isArray(r.pricing?.accessories) ? r.pricing.accessories : [];
    const hit = lines.find((x) => String(x.code || "").toUpperCase() === String(code).toUpperCase());
    return Number(hit?.amount || 0);
  }

  function automaticTimeChargeAmount(r) {
    const lines = Array.isArray(r.pricing?.accessories) ? r.pricing.accessories : [];
    const hit = lines.find((x) => {
      const code = String(x.code || "").toUpperCase();
      return code === "HOLIDAY" || code === "WEEKEND" || code === "THIRD_SHIFT" || code === "AFTER_HOURS";
    });
    return Number(hit?.amount || 0);
  }

  function wcAccessoryState(r) {
    const shape = String(r.TripShape || "").toUpperCase();
    const isRt = shape === "ROUND_TRIP" || shape === "MULTI_STOP";

    const src = r.availableWcAccessories || {};

    const needwcAmount = Number(isRt ? (src.needwc_rt || 0) : (src.needwc_1w || 0));
    const reclAmount = Number(isRt ? (src.recl_rt || 0) : (src.recl_1w || 0));

    let addNeedWC = !!r.review?.AddNeedWC;
    let addRECL = !!r.review?.AddRECL;

    if (addNeedWC && addRECL) {
      addNeedWC = false;
    }

    return {
      needwcAmount,
      reclAmount,
      addNeedWC,
      addRECL
    };
  }

  function isCancelled(r) {
    const raw = String(r.RideStatus || "").trim().toLowerCase();
    const tmCancelled = raw === "noshow" || raw === "ridercancel";

    const override = String(r.review?.CancelOverride || "AUTO").toUpperCase();

    if (override === "YES") return true;
    if (override === "NO") return false;
    return tmCancelled;
  }
  
  function baseTripTotal(r) {
    if (isCancelled(r)) {
      return Number(r.pricing?.cancelFee || 0);
    }

    return Number(r.pricing?.base || 0)
      + Number(r.pricing?.mileage || 0);
  }

  function rowAccessoryTotal(r) {
    if (isCancelled(r)) return 0;

    const charges = r.availableCharges || {};
    const wcState = wcAccessoryState(r);
    let total = 0;

    if (r.review?.AddNeedWC) total += wcState.needwcAmount;
    if (r.review?.AddRECL) total += wcState.reclAmount;

    if (r.review?.AddHazmat) total += Number(charges.hazmat || 0);
    if (r.review?.AddO2) total += Number(charges.o2 || 0);
    if (r.review?.AddBari) total += Number(charges.bari || 0);

      total += computeDeadheadChargeFromReview(r);
      total += computeWaitCharge(r);
      total += automaticTimeChargeAmount(r);
      total += fuelSurchargeAmount(r);
      return total;
  }

  function rowDisplayTotal(r) {
    if (r.review?.MatchToQuote) {
      return Number(r.review?.QuoteAmount || 0);
    }

    if (r.review?.NoCharge) {
      return 0;
    }

    return baseTripTotal(r) + rowAccessoryTotal(r);
  }

  for (const r of rows) {
    const defaultNeedWC = pricedAccessoryAmount(r, "NeedWC") > 0;
    const defaultRECL = pricedAccessoryAmount(r, "RECL") > 0;
    const defaultDeadhead = Number(r.deadheadCharge || 0) > 0;
    const defaultDeadheadMiles = Number(r.deadheadMiles || 0);

    if (!r.review) {
      r.review = {
        AddNeedWC: defaultNeedWC,
        AddRECL: defaultRECL,
        AddHazmat: false,
        AddO2: false,
        AddBari: false,
        CancelOverride: "AUTO",
        NoCharge: false,
        MatchToQuote: false,
        QuoteAmount: 0,
        TripTypeOverride: "",
        AddWait: false,
        WaitTotalMinutes: 0,
        AddDeadhead: defaultDeadhead,
        DeadheadMiles: defaultDeadheadMiles,
        Action: r.Action || "INCLUDE",
        Modifier: r.Modifier || "NONE",
        Note: r.Note || "",
        MoveToAccountCode: r.MoveToAccountCode || "",
        MileageOverride: Number(r.DirectMileage || 0)
      };
    } else {
      if (typeof r.review.AddNeedWC !== "boolean") r.review.AddNeedWC = defaultNeedWC;
      if (typeof r.review.AddRECL !== "boolean") r.review.AddRECL = defaultRECL;
      if (typeof r.review.AddDeadhead !== "boolean") r.review.AddDeadhead = defaultDeadhead;
      if (!Number.isFinite(Number(r.review.DeadheadMiles))) r.review.DeadheadMiles = defaultDeadheadMiles;
      if (!r.review.CancelOverride) r.review.CancelOverride = "AUTO";
      if (typeof r.review.NoCharge !== "boolean") r.review.NoCharge = false;
      if (!r.review.TripTypeOverride) r.review.TripTypeOverride = "";
      if (!Number.isFinite(Number(r.review.MileageOverride))) {
        r.review.MileageOverride = Number(r.DirectMileage || 0);
      }
    }

    const tr = document.createElement("tr");
    if ((r.Action || "INCLUDE") === "EXCLUDE") tr.className = "row-exclude";

    // Date and time
    tr.appendChild(makeCell(
      "<div>" + esc(r.RideDateISO || "") + "</div>" +
      "<div style='color:#64748b;font-size:16px;margin-top:2px'>" +
        "PU " +
        esc((Array.isArray(r.legs) && r.legs.length ? r.legs[0]?.ScheduledPickupTime : r.ScheduledPickupTime) || "") +
      "</div>"
    ));

    // Include
    const inclTd = makeCell();
    const inclCb = document.createElement("input");
    inclCb.type = "checkbox";
    inclCb.checked = (r.Action || "INCLUDE") !== "EXCLUDE";
    inclCb.onchange = () => {
      r.Action = inclCb.checked ? "INCLUDE" : "EXCLUDE";
      r.review.Action = r.Action;
      tr.className = inclCb.checked ? "" : "row-exclude";
    };
    inclTd.appendChild(inclCb);
    tr.appendChild(inclTd);

    // Rider
    const riderTd = makeCell(
      "<div>" + esc(((r.FirstName || "") + " " + (r.LastName || "")).trim()) + "</div>" +
      "<div style='display:flex; gap:8px; align-items:center; margin-top:2px'>" +
        "<span style='color:#64748b'>" + esc(r.Mobility || "") + "</span>" +
        "<span style='padding:1px 6px;border-radius:6px;background:#e4e4f0;color:#334155;font-size:11px;font-weight:600'>" +
          esc(tripShapeLabel(r)) +
        "</span>" +
      "</div>"
    );
    tr.appendChild(riderTd);

    // Pick up
    tr.appendChild(makeCell(
       "<b>" + esc(window.cleanLocationName ? window.cleanLocationName(r.PickupName || "") : (r.PickupName || "")) + "</b><div>" + esc(r.PickupCity || "") + "</div>"
    ));

    // Drop-off
    tr.appendChild(makeCell(
       "<b>" + esc(window.cleanLocationName ? window.cleanLocationName(r.DropoffName || "") : (r.DropoffName || "")) + "</b><div>" + esc(r.DropoffCity || "") + "</div>"
    ));

    // Miles
    const milesTd = makeCell();

    const milesInput = document.createElement("input");
    milesInput.type = "number";
    milesInput.step = "1";
    milesInput.style.width = "52px";
    milesInput.value = r.review.MileageOverride || 0;

    milesInput.oninput = () => {
      r.review.MileageOverride = Number(milesInput.value || 0);

      refreshRowTotal();
      refreshDetailPanel();

      if (window.markDirty) window.markDirty();
    };

    milesInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        milesInput.blur();
      }
    };

    milesTd.appendChild(milesInput);
    tr.appendChild(milesTd);

    // Notes
    const notesTd = makeCell(esc(r.notesPreview || ""));
    notesTd.style.whiteSpace = "pre-line";
    notesTd.style.overflow = "hidden";
    notesTd.style.textOverflow = "ellipsis";
    notesTd.title = String(r.notesFull || "");
    tr.appendChild(notesTd);

    // Adjustments
    const adjTd = makeCell();
    adjTd.style.whiteSpace = "normal";

    function makeCheckMoney(labelText, checked, _amountText) {
      const label = document.createElement("label");
      label.style.whiteSpace = "nowrap";
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "4px";
      label.style.marginRight = "12px";
      label.style.marginBottom = "4px";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!checked;
      label.appendChild(cb);

      const txt = document.createElement("span");
      txt.textContent = labelText;
      label.appendChild(txt);

      return { label, cb, txt };
    }

    const adjWrap = document.createElement("div");
    adjWrap.style.display = "flex";
    adjWrap.style.flexWrap = "wrap";
    adjWrap.style.alignItems = "center";
    adjWrap.style.rowGap = "6px";

    const wcState = wcAccessoryState(r);

    const suggestions = window.getPreReviewSuggestions
      ? window.getPreReviewSuggestions(r)
      : { flags: { O2: false, RECL: false, BARI: false }, waitSuggestion: null };

    const suggestionFlags = suggestions.flags;

    if (suggestions.waitSuggestion) {
      if (!r.review) r.review = {};

      if (!r.review.AddWait) {
        r.review.AddWait = true;
      }

      if (!r.review.WaitTotalMinutes || Number(r.review.WaitTotalMinutes) === 0) {
        r.review.WaitTotalMinutes = suggestions.waitSuggestion.waitMinutes;
      }

      r._suggestedWait = suggestions.waitSuggestion.multiplier;
    }

    const needwcCtl = makeCheckMoney("Need WC", wcState.addNeedWC, fmtMoney(wcState.needwcAmount));
    const reclCtl = makeCheckMoney("RECL", wcState.addRECL, fmtMoney(wcState.reclAmount));
    const hzCtl = makeCheckMoney("HZ", !!r.review.AddHazmat, fmtMoney(r.availableCharges?.hazmat || 0));
    const o2Ctl = makeCheckMoney("O2", !!r.review.AddO2, fmtMoney(r.availableCharges?.o2 || 0));
    const bariCtl = makeCheckMoney("BARI", !!r.review.AddBari, fmtMoney(r.availableCharges?.bari || 0));
      if (window.applySuggestionStyle) {
        window.applySuggestionStyle(o2Ctl.txt, suggestionFlags.O2, r.review.AddO2);
        window.applySuggestionStyle(reclCtl.txt, suggestionFlags.RECL, r.review.AddRECL);
        window.applySuggestionStyle(bariCtl.txt, suggestionFlags.BARI, r.review.AddBari);
    }

    const typeWrap = document.createElement("label");
    typeWrap.style.whiteSpace = "nowrap";
    typeWrap.style.display = "inline-flex";
    typeWrap.style.alignItems = "center";
    typeWrap.style.gap = "4px";
    typeWrap.style.marginRight = "12px";
    typeWrap.style.marginBottom = "4px";

    const typeText = document.createElement("span");
    typeText.textContent = "Type";
    typeWrap.appendChild(typeText);

    const typeSel = document.createElement("select");
    typeSel.style.border = "1px solid #d6d8ea";
    typeSel.style.borderRadius = "6px";
    typeSel.style.padding = "2px 4px";

    [
      ["AMBU", "AMBU"],
      ["WC", "WC"],
      ["STR", "STR"]
    ].forEach(([value, label]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      if ((r.review.TripTypeOverride || r.Mobility || "AMBU") === value) opt.selected = true;
      typeSel.appendChild(opt);
    });

    typeWrap.appendChild(typeSel);

    const classWrap = document.createElement("label");
    classWrap.style.whiteSpace = "nowrap";
    classWrap.style.display = "inline-flex";
    classWrap.style.alignItems = "center";
    classWrap.style.gap = "4px";
    classWrap.style.marginRight = "12px";
    classWrap.style.marginBottom = "4px";

    const classText = document.createElement("span");
    classText.textContent = "Class";
    classWrap.appendChild(classText);

    const classSel = document.createElement("select");
    classSel.style.border = "1px solid #d6d8ea";
    classSel.style.borderRadius = "6px";
    classSel.style.padding = "2px 4px";

    [
      "100 Admission",
      "200 Discharge",
      "300 Round Trip",
      "350 Half Round Trip",
      "375 Private Pay One Way",
      "380 Private Pay Round Trip",
      "400 Other",
      "450 Cancellation"
    ].forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      classSel.appendChild(opt);
    });

    classSel.value = r.review?.ClassOverride || r.inferredClass || "400 Other";

    classSel.onchange = () => {
      r.review.ClassOverride = classSel.value;
      if (window.markDirty) window.markDirty();
    };

    classWrap.appendChild(classSel);

    const dhWrap = document.createElement("label");
    dhWrap.style.whiteSpace = "nowrap";
    dhWrap.style.display = "inline-flex";
    dhWrap.style.alignItems = "center";
    dhWrap.style.gap = "4px";
    dhWrap.style.marginRight = "12px";
    dhWrap.style.marginBottom = "4px";

    const dhCb = document.createElement("input");
    dhCb.type = "checkbox";
    dhCb.checked = !!r.review.AddDeadhead;
    dhWrap.appendChild(dhCb);

    const dhText = document.createElement("span");
    dhText.textContent = "DH";
    dhWrap.appendChild(dhText);

    const dhMilesInput = document.createElement("input");
    dhMilesInput.type = "number";
    dhMilesInput.step = "1";
    dhMilesInput.style.width = "56px";
    dhMilesInput.value = r.review.DeadheadMiles || "";
    dhWrap.appendChild(dhMilesInput);

    const dhMilesLabel = document.createElement("span");
    dhMilesLabel.textContent = "mi";
    dhWrap.appendChild(dhMilesLabel);

    const noChargeCtl = makeCheckMoney("No Charge", !!r.review.NoCharge, "");
    const mergeCtl = makeCheckMoney("Merge", !!r.review.MergeSelected, "");

    adjWrap.appendChild(typeWrap);
    adjWrap.appendChild(classWrap);
    adjWrap.appendChild(mergeCtl.label);
    adjWrap.appendChild(needwcCtl.label);
    adjWrap.appendChild(reclCtl.label);
    adjWrap.appendChild(hzCtl.label);
    adjWrap.appendChild(o2Ctl.label);
    adjWrap.appendChild(bariCtl.label);
    adjWrap.appendChild(dhWrap);

    const waitWrap = document.createElement("label");
    waitWrap.style.whiteSpace = "nowrap";
    waitWrap.style.display = "inline-flex";
    waitWrap.style.alignItems = "center";
    waitWrap.style.gap = "4px";
    waitWrap.style.marginRight = "12px";
    waitWrap.style.marginBottom = "4px";

    const waitCb = document.createElement("input");
    waitCb.type = "checkbox";
    waitCb.checked = !!r.review.AddWait;
    waitWrap.appendChild(waitCb);

    const waitText = document.createElement("span");
    waitText.textContent = "WAIT";
    waitWrap.appendChild(waitText);
    if (window.applySuggestionStyle) {
      window.applySuggestionStyle(waitText, suggestionFlags.WAIT, r.review.AddWait);
    }

    const waitMinutesInput = document.createElement("input");
    waitMinutesInput.type = "number";
    waitMinutesInput.step = "1";
    waitMinutesInput.style.width = "56px";
    waitMinutesInput.value = r.review.WaitTotalMinutes || "";
    waitWrap.appendChild(waitMinutesInput);

    const waitUnit = document.createElement("span");
    waitUnit.textContent = "min";
    waitWrap.appendChild(waitUnit);

    adjWrap.appendChild(waitWrap);
    adjWrap.appendChild(noChargeCtl.label);

    const overrideWrap = document.createElement("label");
    overrideWrap.style.whiteSpace = "nowrap";
    overrideWrap.style.display = "inline-flex";
    overrideWrap.style.alignItems = "center";
    overrideWrap.style.gap = "4px";
    overrideWrap.style.marginRight = "12px";
    overrideWrap.style.marginBottom = "4px";

    const overrideCb = document.createElement("input");
    overrideCb.type = "checkbox";
    overrideCb.checked = !!r.review.MatchToQuote;
    overrideWrap.appendChild(overrideCb);

    const overrideLabel = document.createElement("span");
    overrideLabel.textContent = "Match";
    overrideWrap.appendChild(overrideLabel);

    const overrideDollar = document.createElement("span");
    overrideDollar.textContent = "$";
    overrideWrap.appendChild(overrideDollar);

    const overrideInput = document.createElement("input");
    overrideInput.type = "number";
    overrideInput.step = "0.01";
    overrideInput.style.width = "82px";
    overrideInput.value = r.review.QuoteAmount || "";
    overrideInput.disabled = !r.review.MatchToQuote;
    overrideWrap.appendChild(overrideInput);

    adjWrap.appendChild(overrideWrap);

    adjTd.appendChild(adjWrap);
    tr.appendChild(adjTd);

    const moveWrap = document.createElement("label");
    moveWrap.style.whiteSpace = "nowrap";
    moveWrap.style.display = "inline-flex";
    moveWrap.style.alignItems = "center";
    moveWrap.style.gap = "4px";
    moveWrap.style.marginRight = "12px";
    moveWrap.style.marginBottom = "4px";

    const moveText = document.createElement("span");
    moveText.textContent = "Move";
    moveWrap.appendChild(moveText);

    const moveInput = document.createElement("select");
    moveInput.style.width = "180px";
    moveInput.style.border = "1px solid #d6d8ea";
    moveInput.style.borderRadius = "6px";
    moveInput.style.padding = "2px 4px";
    moveInput.style.background = "#fff";

    const blankOpt = document.createElement("option");
    blankOpt.value = "";
    blankOpt.textContent = "to account";
    moveInput.appendChild(blankOpt);

    const accountCodes = Array.isArray(window.BM_ACCOUNT_CODES) ? window.BM_ACCOUNT_CODES : [];
    const currentMove = String(r.review.MoveToAccountCode || "").trim();

    if (currentMove && !accountCodes.includes(currentMove)) {
      const currentOpt = document.createElement("option");
      currentOpt.value = currentMove;
      currentOpt.textContent = currentMove + " (saved)";
      moveInput.appendChild(currentOpt);
    }

    for (const acctCode of accountCodes) {
      const opt = document.createElement("option");
      opt.value = acctCode;
      opt.textContent = acctCode;
      moveInput.appendChild(opt);
    }

    moveInput.value = currentMove;

    moveWrap.appendChild(moveInput);

    adjWrap.appendChild(moveWrap);

    // Total
    const totalTd = makeCell();
    totalTd.style.whiteSpace = "nowrap";

    const totalTop = document.createElement("div");
    totalTop.innerHTML = "<b>" + esc(fmtMoney(rowDisplayTotal(r))) + "</b>";
    totalTd.appendChild(totalTop);

    tr.appendChild(totalTd);

    function refreshRowTotal() {
      totalTop.innerHTML = "<b>" + esc(fmtMoney(rowDisplayTotal(r))) + "</b>";
    }

    function refreshDeadheadUI() {
      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    }

    function refreshDetailPanel() {
      try {
        renderDetailPanel();
      } catch (err) {
        console.error("refreshDetailPanel failed", err);
      }
    }

    needwcCtl.cb.onchange = () => {
      r.review.AddNeedWC = needwcCtl.cb.checked;

      if (needwcCtl.cb.checked) {
        r.review.AddRECL = false;
        reclCtl.cb.checked = false;
      }

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    reclCtl.cb.onchange = () => {
      r.review.AddRECL = reclCtl.cb.checked;

      if (reclCtl.cb.checked) {
        r.review.AddNeedWC = false;
        needwcCtl.cb.checked = false;
      }

      if (window.applySuggestionStyle) {
        window.applySuggestionStyle(reclCtl.label, suggestionFlags.RECL, r.review.AddRECL);
      }

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    hzCtl.cb.onchange = () => {
      r.review.AddHazmat = hzCtl.cb.checked;
      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    o2Ctl.cb.onchange = () => {
      r.review.AddO2 = o2Ctl.cb.checked;

      if (window.applySuggestionStyle) {
        window.applySuggestionStyle(o2Ctl.label, suggestionFlags.O2, r.review.AddO2);
      }

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    bariCtl.cb.onchange = () => {
      r.review.AddBari = bariCtl.cb.checked;

      if (window.applySuggestionStyle) {
        window.applySuggestionStyle(bariCtl.label, suggestionFlags.BARI, r.review.AddBari);
      }

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    dhCb.onchange = () => {
      r.review.AddDeadhead = dhCb.checked;
      refreshDeadheadUI();
    };

    dhMilesInput.oninput = () => {
      r.review.DeadheadMiles = Number(dhMilesInput.value || 0);
      refreshDeadheadUI();
    };

    dhMilesInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        dhMilesInput.blur();
      }
    };

    waitCb.onchange = () => {
      r.review.AddWait = waitCb.checked;

      if (window.applySuggestionStyle) {
        window.applySuggestionStyle(waitText, suggestionFlags.WAIT, r.review.AddWait);
      }

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    waitMinutesInput.oninput = () => {
      r.review.WaitTotalMinutes = Number(waitMinutesInput.value || 0);
      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    waitMinutesInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        waitMinutesInput.blur();
      }
    };

    typeSel.onchange = () => {
      r.review.TripTypeOverride = typeSel.value || r.Mobility || "AMBU";
      if (window.markDirty) window.markDirty();
    };

    moveInput.onchange = () => {
      r.review.MoveToAccountCode = moveInput.value.trim();
      if (window.markDirty) window.markDirty();
    };

    noChargeCtl.cb.onchange = () => {
      r.review.NoCharge = noChargeCtl.cb.checked;
      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    mergeCtl.cb.onchange = () => {
      r.review.MergeSelected = mergeCtl.cb.checked;
    };

    overrideCb.onchange = () => {
      r.review.MatchToQuote = overrideCb.checked;
      overrideInput.disabled = !overrideCb.checked;
      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    overrideInput.oninput = () => {
      r.review.QuoteAmount = Number(overrideInput.value || 0);
      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    overrideInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        overrideInput.blur();
      }
    };

    // Row click toggles details (but not when clicking inputs/labels/buttons)
    tr.style.cursor = "pointer";
    tr.addEventListener("click", (e) => {
      if (e.target.closest("input, label, button")) return;
      toggleDetails(r.LineId || "");
    });

    tb.appendChild(tr);

    // Detail row
    const detailRow = document.createElement("tr");
    detailRow.id = "detail_" + String(r.LineId || "");
    detailRow.style.display = "none";

    const detailCell = document.createElement("td");
    detailCell.colSpan = 9;

    const detailBox = document.createElement("div");
    detailBox.style.padding = "12px";
    detailBox.style.borderTop = "1px solid #ddd";
    detailBox.style.background = "#fafafa";

        function renderDetailPanel() {
          const base = Number((r.pricing && r.pricing.base) || 0);
          const billableMiles = Number(r.review?.MileageOverride || 0);
          const mileageRate =
            billableMiles > 0
              ? Number((r.pricing && r.pricing.mileage) || 0) /
                Number((r.pricing?.audit?.billableMiles) || billableMiles)
              : 0;

          const mileage = billableMiles * mileageRate;
          const wcStateDetail = wcAccessoryState(r);
          const cancelFee = Number((r.pricing && r.pricing.cancelFee) || 0);
          const noChargeHtml = r.review?.NoCharge
            ? "<div style='margin-top:6px;color:#991b1b;font-weight:600'>No Charge</div>"
            : "";

          const grandTotal = Number(rowDisplayTotal(r));

          const chargedAccessoryLines = [];

          if (r.review?.AddNeedWC) {
            chargedAccessoryLines.push(
              "<div>Need WC: $" + wcStateDetail.needwcAmount.toFixed(2) + "</div>"
            );
          }
          if (r.review?.AddRECL) {
            chargedAccessoryLines.push(
              "<div>RECL: $" + wcStateDetail.reclAmount.toFixed(2) + "</div>"
            );
          }
          if (r.review?.AddHazmat) {
            chargedAccessoryLines.push(
              "<div>Hazmat: $" + Number(r.availableCharges?.hazmat || 0).toFixed(2) + "</div>"
            );
          }
          if (r.review?.AddO2) {
            chargedAccessoryLines.push(
              "<div>Oxygen: $" + Number(r.availableCharges?.o2 || 0).toFixed(2) + "</div>"
            );
          }
          if (r.review?.AddBari) {
            chargedAccessoryLines.push(
              "<div>Bariatric: $" + Number(r.availableCharges?.bari || 0).toFixed(2) + "</div>"
            );
          }
          if (r.review?.AddDeadhead) {
            chargedAccessoryLines.push(
              "<div>Deadhead (" + Number(r.review?.DeadheadMiles || 0).toFixed(0) + " mi): <span data-dh-total>$" + computeDeadheadChargeFromReview(r).toFixed(2) + "</span></div>"
            );
          }
          if (r.review?.AddWait) {
            chargedAccessoryLines.push(
              "<div>Wait Time: <span data-wait-total>$" + computeWaitCharge(r).toFixed(2) + "</span></div>"
            );
          }

          const canSplit =
            Array.isArray(r.legs) &&
            r.legs.length > 1;
          
          const legsHtml = Array.isArray(r.legs) && r.legs.length
            ? r.legs.map((leg, idx) => {
                const puNameRaw = leg.PickupName || "";
                const puAddrRaw = leg.PickupAddress1 || "";
                const doNameRaw = leg.DropoffName || "";
                const doAddrRaw = leg.DropoffAddress1 || "";

                const puName = esc(window.cleanLocationName ? window.cleanLocationName(puNameRaw) : puNameRaw);
                const puAddr = esc(puAddrRaw);
                const puCity = esc([leg.PickupCity, leg.PickupState, leg.PickupZip].filter(Boolean).join(" "));

                const doName = esc(window.cleanLocationName ? window.cleanLocationName(doNameRaw) : doNameRaw);
                const doAddr = esc(doAddrRaw);
                const doCity = esc([leg.DropoffCity, leg.DropoffState, leg.DropoffZip].filter(Boolean).join(" "));
                const puKey = "pu-" + idx;
                const doKey = "do-" + idx;
                return (
                  "<div>" +
                    "<div><b>Pick up:</b></div>" +
                    "<input data-loc-edit='pu-name' data-loc-key='" + puKey + "' data-original-name='" + esc(puNameRaw) + "' data-original-address='" + esc(puAddrRaw) + "' value='" + puName + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
                    "<input data-loc-edit='pu-address' data-loc-key='" + puKey + "' data-original-name='" + esc(puNameRaw) + "' data-original-address='" + esc(puAddrRaw) + "' value='" + puAddr + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
                    "<div style='color:#334155'>" + puCity + "</div>" +
                    "<button data-loc-save-alias='pu' data-loc-key='" + puKey + "' type='button' style='margin-top:6px'>" +
                      "Save pick up address for future" +
                    "</button>" +
                    "<div style='margin-top:8px'><b>Drop-off:</b></div>" +
                    "<input data-loc-edit='do-name' data-loc-key='" + doKey + "' data-original-name='" + esc(doNameRaw) + "' data-original-address='" + esc(doAddrRaw) + "' value='" + doName + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
                    "<input data-loc-edit='do-address' data-loc-key='" + doKey + "' data-original-name='" + esc(doNameRaw) + "' data-original-address='" + esc(doAddrRaw) + "' value='" + doAddr + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
                    "<div style='color:#334155'>" + doCity + "</div>" +
                    "<button data-loc-save-alias='do' data-loc-key='" + doKey + "' type='button' style='margin-top:6px'>" +
                      "Save drop-off address for future" +
                    "</button>" +
                  "</div>"
                );
              }).join("")
            : "<div style='color:#64748b'>No leg detail available.</div>";

          const autoTimeCharge = automaticTimeChargeAmount(r);
          const autoTimeLine = Array.isArray(r.pricing?.accessories)
            ? r.pricing.accessories.find((x) => {
                const code = String(x.code || "").toUpperCase();
                return code === "HOLIDAY" || code === "WEEKEND" || code === "THIRD_SHIFT" || code === "AFTER_HOURS";
              })
            : null;

          if (autoTimeCharge > 0 && autoTimeLine) {
            chargedAccessoryLines.push(
              "<div>" + esc(String(autoTimeLine.label || "Time Charge")) + ": $" + autoTimeCharge.toFixed(2) + "</div>"
            );
          }
          
            const fuelTotal = fuelSurchargeAmount(r);
            if (fuelTotal > 0) {
              chargedAccessoryLines.push(
                "<div>Fuel Surcharge: $" + fuelTotal.toFixed(2) + "</div>"
              );
          }

          let splitHtml = "";

          if (canSplit) {
            splitHtml =
              "<label style='display:flex;align-items:center;gap:6px;margin-top:8px'>" +
                "<input data-split-trip type='checkbox' " +
                (r.review?.SplitTrip ? "checked" : "") +
                " />" +
                "<span>Split this trip into separate 1-ways</span>" +
              "</label>";
          }
          
          let poHtml = "";

          const poVal = esc(
            r.review?.PoNumberOverride ||
            r.poNumber ||
            ""
          );

          const mraVal = esc(
            r.review?.MraNumberOverride ||
            extractMraNumberFromText(r.notesFull || "") ||
            ""
          );

          poHtml =
            "<div style='margin-top:12px;padding-top:8px;border-top:1px solid #e5e7eb'>" +

              "<label style='display:flex;align-items:center;gap:6px;margin-bottom:6px'>" +
                "<span style='width:90px'>PO#</span>" +
                "<input data-po-number-override type='text' value='" + poVal + "' style='width:180px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
              "</label>";

          if (String(r.invoiceMethod || "").toLowerCase() === "thr_split") {
            poHtml +=
              "<div style='margin:10px 0 6px 0'><b>THR / Invoice Billing</b></div>" +

              "<label style='display:flex;align-items:center;gap:6px;margin-bottom:6px'>" +
                "<span style='width:90px'>MRA #</span>" +
                "<input data-mra-number-override type='text' value='" + mraVal + "' style='width:180px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
              "</label>" +

              "<label style='display:flex;align-items:center;gap:6px'>" +
                "<span style='width:90px'>Invoice Split</span>" +
                "<select data-invoice-split-override style='width:180px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px'>" +
                  "<option value='OTHER'>Other</option>" +
                  "<option value='ER'>ER</option>" +
                  "<option value='ADMISSION'>Admission</option>" +
                  "<option value='DISCHARGE'>Discharge</option>" +
                "</select>" +
              "</label>";
          }

          poHtml += "</div>";

          let actualTimesHtml = "";

          if (r.invoiceIncludeActualTimes) {
            const firstLeg = Array.isArray(r.legs) && r.legs.length ? r.legs[0] : null;
            const lastLeg = Array.isArray(r.legs) && r.legs.length ? r.legs[r.legs.length - 1] : null;

            const puVal = esc(
              r.review?.ActualPickupTimeOverride ||
              firstLeg?.ActualPickupTime ||
              r.ActualPickupTime ||
              firstLeg?.PickupArrivalTime ||
              r.PickupArrivalTime ||
              ""
            );

            const doVal = esc(
              r.review?.ActualDropoffTimeOverride ||
              lastLeg?.ActualDropoffTime ||
              r.ActualDropoffTime ||
              lastLeg?.DropoffArrivalTime ||
              r.DropoffArrivalTime ||
              ""
            );

            actualTimesHtml =
              "<div style='margin-top:12px;padding-top:8px;border-top:1px solid #e5e7eb'>" +
                "<div style='margin-bottom:6px'><b>Invoice Times</b></div>" +
                "<label style='display:flex;align-items:center;gap:6px;margin-bottom:6px'>" +
                  "<span style='width:70px'>PU Time</span>" +
                  "<input data-pu-time-override type='text' value='" + puVal + "' style='width:110px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
                "</label>" +
                "<label style='display:flex;align-items:center;gap:6px'>" +
                  "<span style='width:70px'>DO Time</span>" +
                  "<input data-do-time-override type='text' value='" + doVal + "' style='width:110px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
                "</label>" +
              "</div>";
          }

          

          detailBox.innerHTML =
            "<div style='display:grid; grid-template-columns: 240px 320px repeat(auto-fit, minmax(260px, 1fr)); gap:20px; align-items:start'>" +

              "<div>" +
                "<div style='margin-bottom:8px'><b>Pricing</b></div>" +
                "<div>Base: $" + base.toFixed(2) + "</div>" +
                "<div>Mileage: $" + mileage.toFixed(2) + "</div>" +
                (cancelFee > 0 ? "<div>Cancel Fee: $" + cancelFee.toFixed(2) + "</div>" : "") +
                noChargeHtml +
                chargedAccessoryLines.join("") +
                "<div style='margin-top:6px'><b>Total: $" + grandTotal.toFixed(2) + "</b></div>" +
                actualTimesHtml +
                poHtml +
                splitHtml +
              "</div>" +

              "<div>" +
                "<div style='margin-bottom:8px'><b>Notes</b></div>" +
                "<div style='white-space:pre-line'>" + esc(r.notesFull || "") + "</div>" +
              "</div>" +

              legsHtml +

            "</div>";

            detailBox.querySelectorAll("[data-loc-edit]").forEach((input) => {
              input.oninput = () => {
                const kind = input.dataset.locEdit || "";
                const isPickup = kind.startsWith("pu");

                if (isPickup) {
                  if (kind === "pu-name") r.review.PickupNameOverride = input.value;
                  if (kind === "pu-address") r.review.PickupAddress1Override = input.value;
                } else {
                  if (kind === "do-name") r.review.DropoffNameOverride = input.value;
                  if (kind === "do-address") r.review.DropoffAddress1Override = input.value;
                }

                if (window.markDirty) window.markDirty();
              };
            });

            detailBox.querySelectorAll("[data-loc-save-alias]").forEach((btn) => {
              btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const side = btn.dataset.locSaveAlias || "";
                const locKey = btn.dataset.locKey || "";
                const isPickup = side === "pu";

                const nameInput = detailBox.querySelector(
                  `[data-loc-key='${locKey}'][data-loc-edit='${isPickup ? "pu-name" : "do-name"}']`
                );

                const addrInput = detailBox.querySelector(
                  `[data-loc-key='${locKey}'][data-loc-edit='${isPickup ? "pu-address" : "do-address"}']`
                );

                const originalName = nameInput?.dataset.originalName || "";
                const originalAddress1 = nameInput?.dataset.originalAddress || "";

                const name = nameInput?.value || "";
                const address1 = addrInput?.value || "";

                await fetch("/api/location-alias", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    originalName,
                    originalAddress1,
                    name,
                    address1
                  })
                });

                btn.textContent = "Saved";
                setTimeout(() => {
                  btn.textContent = isPickup ? "Save pickup alias" : "Save drop-off alias";
                }, 1200);

                if (window.markDirty) window.markDirty();
              };
            });

            const poInput = detailBox.querySelector("[data-po-number-override]");
            if (poInput) {
              poInput.oninput = () => {
                r.review.PoNumberOverride = poInput.value;
                if (window.markDirty) window.markDirty();
              };
            }

            const splitSelect = detailBox.querySelector("[data-invoice-split-override]");
            if (splitSelect) {
              const savedSplit = String(r.review?.InvoiceSplitOverride || "").toUpperCase();

              splitSelect.value = r.invoiceSplit || "OTHER";
              splitSelect.onchange = () => {
                r.review.InvoiceSplitOverride = splitSelect.value || "OTHER";
                if (window.markDirty) window.markDirty();
              };
            }

            const splitTripCb = detailBox.querySelector("[data-split-trip]");

            if (splitTripCb) {
              splitTripCb.onchange = () => {
                r.review.SplitTrip = !!splitTripCb.checked;

                if (window.markDirty) window.markDirty();
              };
            }
        }

      const mraInput = detailBox.querySelector("[data-mra-number-override]");
      if (mraInput) {
        mraInput.oninput = () => {
          r.review.MraNumberOverride = mraInput.value;
          if (window.markDirty) window.markDirty();
        };
      }
      
        const puOverrideInput = detailBox.querySelector("[data-pu-time-override]");
      if (puOverrideInput) {
        puOverrideInput.oninput = () => {
          r.review.ActualPickupTimeOverride = puOverrideInput.value;
          if (window.markDirty) window.markDirty();
        };
      }

      const doOverrideInput = detailBox.querySelector("[data-do-time-override]");
      if (doOverrideInput) {
        doOverrideInput.oninput = () => {
          r.review.ActualDropoffTimeOverride = doOverrideInput.value;
          if (window.markDirty) window.markDirty();
        };
      }

      renderDetailPanel();
    
    detailCell.appendChild(detailBox);
    detailRow.appendChild(detailCell);
    tb.appendChild(detailRow);
  }

  table.appendChild(tb);
  wrap.appendChild(table);
}