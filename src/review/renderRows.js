function renderRows() {
    
  const {
    moneyNum: sharedMoneyNum,
    automaticTimeChargeAmount: sharedAutomaticTimeChargeAmount,
    automaticTimeCharge: sharedAutomaticTimeCharge,
    pricedAccessoryAmount: sharedPricedAccessoryAmount,
    timeChargeAmountForCode: sharedTimeChargeAmountForCode,
    selectedTimeChargeAmount: sharedSelectedTimeChargeAmount,
    wcAccessoryState: sharedWcAccessoryState,
    isCancelled: sharedIsCancelled,
    foldedWcAccessoryAmount: sharedFoldedWcAccessoryAmount,
    baseTripTotal: sharedBaseTripTotal,
    rowAccessoryTotal: sharedRowAccessoryTotal,
    rowDisplayTotal: sharedRowDisplayTotal,
    computeWaitCharge: sharedComputeWaitCharge,
    computeDeadheadChargeFromReview: sharedComputeDeadheadChargeFromReview,
    fuelSurchargeAmount: sharedFuelSurchargeAmount,
  } = window.BM_REVIEW_PRICING || {};

  const fuelState = window.BM_GLOBALS || {
    fuelSurchargeEnabled: false,
    fuelSurchargeStart: "",
    fuelSurchargeEnd: ""
  };

  const q = (document.getElementById("search").value || "").toLowerCase().trim();

  function selectedQboClass(r) {
    return r.review?.ClassOverride || r.inferredClass || "400 Other";
  }

  const QBO_CLASS_OPTIONS = [
    "100 Admission",
    "200 Discharge",
    "300 Round Trip",
    "350 Half Round Trip",
    "375 Private Pay One Way",
    "380 Private Pay Round Trip",
    "390 GMTD",
    "400 Other",
    "450 Cancellation",
  ];

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
    return sharedMoneyNum(v);
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
    return sharedComputeWaitCharge(r);
  }

  function computeDeadheadChargeFromReview(r) {
    return sharedComputeDeadheadChargeFromReview(r);
  }

  function fuelSurchargeAmount(r) {
    return sharedFuelSurchargeAmount(r, fuelState);
  }

  function pricedAccessoryAmount(r, code) {
    return sharedPricedAccessoryAmount(r, code);
  }

  function automaticTimeChargeAmount(r) {
    return sharedAutomaticTimeChargeAmount(r);
  }

  function automaticTimeCharge(r) {
    return sharedAutomaticTimeCharge(r);
  }

  function timeChargeAmountForCode(r, code) {
    return sharedTimeChargeAmountForCode(r, code);
  }

  function selectedTimeChargeAmount(r) {
    return sharedSelectedTimeChargeAmount(r);
  }

  function wcAccessoryState(r) {
    return sharedWcAccessoryState(r);
  }

  function isCancelled(r) {
    return sharedIsCancelled(r);
  }

  function foldedWcAccessoryAmount(r) {
    return sharedFoldedWcAccessoryAmount(r);
  }
  
  function baseTripTotal(r) {
    return sharedBaseTripTotal(r);
  }

  function rowAccessoryTotal(r) {
    return sharedRowAccessoryTotal(r, {
      computeDeadheadChargeFromReview,
      computeWaitCharge,
      selectedTimeChargeAmount,
      fuelSurchargeAmount,
    });
  }

  function rowDisplayTotal(r) {
    return sharedRowDisplayTotal(r, {
      baseTripTotal,
      rowAccessoryTotal,
    });
  }

  for (const r of rows) {
    const defaultNeedWC = pricedAccessoryAmount(r, "NeedWC") > 0;
    const defaultRECL = pricedAccessoryAmount(r, "RECL") > 0;
    const defaultDeadhead = Number(r.deadheadCharge || 0) > 0;
    const defaultDeadheadMiles = Number(r.deadheadMiles || 0);
    const autoTime = automaticTimeCharge(r);

    if (!r.review) {
      r.review = {
        AddNeedWC: defaultNeedWC,
        AddRECL: defaultRECL,
        AddHazmat: false,
        AddO2: false,
        AddBari: false,
        CancelOverride: "AUTO",
        AddAfterHours: autoTime?.code === "AFTER_HOURS",
        AddThirdShift: autoTime?.code === "THIRD_SHIFT",
        AddWeekend: autoTime?.code === "WEEKEND",
        AddHoliday: autoTime?.code === "HOLIDAY",
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
      const autoTime = automaticTimeCharge(r);
      if (!r.review.TimeChargeManual) {
        r.review.AddAfterHours = autoTime?.code === "AFTER_HOURS";
        r.review.AddThirdShift = autoTime?.code === "THIRD_SHIFT";
        r.review.AddWeekend = autoTime?.code === "WEEKEND";
        r.review.AddHoliday = autoTime?.code === "HOLIDAY";
      } else {
        if (typeof r.review.AddAfterHours !== "boolean") r.review.AddAfterHours = false;
        if (typeof r.review.AddThirdShift !== "boolean") r.review.AddThirdShift = false;
        if (typeof r.review.AddWeekend !== "boolean") r.review.AddWeekend = false;
        if (typeof r.review.AddHoliday !== "boolean") r.review.AddHoliday = false;
      }
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
    const ahCtl = makeCheckMoney("AH", !!r.review.AddAfterHours, fmtMoney(timeChargeAmountForCode(r, "AFTER_HOURS")));
    const thirdCtl = makeCheckMoney("3rd", !!r.review.AddThirdShift, fmtMoney(timeChargeAmountForCode(r, "THIRD_SHIFT")));
    const wkndCtl = makeCheckMoney("WKND", !!r.review.AddWeekend, fmtMoney(timeChargeAmountForCode(r, "WEEKEND")));
    const holCtl = makeCheckMoney("HOL", !!r.review.AddHoliday, fmtMoney(timeChargeAmountForCode(r, "HOLIDAY")));

    const cancelCtl = makeCheckMoney("Cancel", isCancelled(r), "");
    adjWrap.appendChild(cancelCtl.label);

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

    QBO_CLASS_OPTIONS.forEach((value) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      classSel.appendChild(opt);
    });

    classSel.value = selectedQboClass(r);

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

    if (r.addressMismatch) {
      const addressWarn = document.createElement("span");
      addressWarn.className = "pill";
      addressWarn.style.background = "#fef3c7";
      addressWarn.style.color = "#92400e";
      addressWarn.style.marginRight = "8px";
      addressWarn.textContent = "⚠ Address mismatch";
      adjWrap.appendChild(addressWarn);
    }
    adjWrap.appendChild(mergeCtl.label);
    adjWrap.appendChild(needwcCtl.label);
    adjWrap.appendChild(reclCtl.label);
    adjWrap.appendChild(hzCtl.label);
    adjWrap.appendChild(o2Ctl.label);
    adjWrap.appendChild(bariCtl.label);
    adjWrap.appendChild(ahCtl.label);
    adjWrap.appendChild(thirdCtl.label);
    adjWrap.appendChild(wkndCtl.label);
    adjWrap.appendChild(holCtl.label);
    adjWrap.appendChild(cancelCtl.label);
    adjWrap.appendChild(noChargeCtl.label);
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

    window.BM_ROW_CONTROLS.wireBasicRowControls({
      r,
      tr,
      inclCb,
      moveInput,
      mergeCtl,
      typeSel,
      classSel,
      markDirty: window.markDirty,
    });

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

    function clearOtherTimeCharges(except) {
      if (except !== "AH") {
        r.review.AddAfterHours = false;
        ahCtl.cb.checked = false;
      }

      if (except !== "THIRD") {
        r.review.AddThirdShift = false;
        thirdCtl.cb.checked = false;
      }

      if (except !== "WKND") {
        r.review.AddWeekend = false;
        wkndCtl.cb.checked = false;
      }

      if (except !== "HOL") {
        r.review.AddHoliday = false;
        holCtl.cb.checked = false;
      }
    }

    ahCtl.cb.onchange = () => {
      r.review.TimeChargeManual = true;
      r.review.AddAfterHours = ahCtl.cb.checked;
      if (ahCtl.cb.checked) clearOtherTimeCharges("AH");

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    thirdCtl.cb.onchange = () => {
      r.review.TimeChargeManual = true;
      r.review.AddThirdShift = thirdCtl.cb.checked;
      if (thirdCtl.cb.checked) clearOtherTimeCharges("THIRD");

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    wkndCtl.cb.onchange = () => {
      r.review.TimeChargeManual = true;
      r.review.AddWeekend = wkndCtl.cb.checked;
      if (wkndCtl.cb.checked) clearOtherTimeCharges("WKND");

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    holCtl.cb.onchange = () => {
      r.review.TimeChargeManual = true;
      r.review.AddHoliday = holCtl.cb.checked;
      if (holCtl.cb.checked) clearOtherTimeCharges("HOL");

      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
    };

    cancelCtl.cb.onchange = () => {
      r.review.CancelOverride = cancelCtl.cb.checked ? "YES" : "NO";

      if (cancelCtl.cb.checked) {
        r.review.ClassOverride = "450 Cancellation";
        classSel.value = "450 Cancellation";
      } else if (r.review.ClassOverride === "450 Cancellation") {
        r.review.ClassOverride = "";
        classSel.value = r.inferredClass || "400 Other";
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

    noChargeCtl.cb.onchange = () => {
      r.review.NoCharge = noChargeCtl.cb.checked;
      refreshRowTotal();
      refreshDetailPanel();
      if (window.markDirty) window.markDirty();
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
      const pricingHtml = window.BM_DETAIL_PANEL.buildPricingHtml({
        r,
        esc,
        rowDisplayTotal,
        wcAccessoryState,
        isCancelled,
        computeDeadheadChargeFromReview,
        computeWaitCharge,
        selectedTimeChargeAmount,
        fuelSurchargeAmount,
      });

      const noChargeHtml = "";

      const splitHtml = window.BM_DETAIL_PANEL.buildSplitHtml({
        r,
      });
      
      const poHtml = window.BM_DETAIL_PANEL.buildPoHtml({
        r,
        esc,
        extractMraNumberFromText,
      });

      const actualTimesHtml = window.BM_DETAIL_PANEL.buildActualTimesHtml({
        r,
        esc,
      });

      const legsHtml = window.BM_DETAIL_PANEL.buildLegsHtml({
        r,
        esc,
      });

      const notesHtml = window.BM_DETAIL_PANEL.buildNotesHtml({
        r,
        esc,
      });

      detailBox.innerHTML = window.BM_DETAIL_PANEL.buildDetailPanelHtml({
        pricingHtml,
        actualTimesHtml,
        poHtml,
        splitHtml,
        notesHtml,
        legsHtml,
      });

      window.BM_DETAIL_PANEL.wireLocationEditors({
        r,
        detailBox,
      });

      window.BM_DETAIL_PANEL.wireAliasButtons({
        detailBox,
      });

      window.BM_DETAIL_PANEL.wireSimpleDetailControls({
        r,
        detailBox,
      });
    }

  renderDetailPanel();
    detailCell.appendChild(detailBox);
    detailRow.appendChild(detailCell);
    tb.appendChild(detailRow);
  }

  table.appendChild(tb);
  wrap.appendChild(table);
}