function renderRows() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();

  const rows = ITEMS.filter((r) => {
    if (!q) return true;

    const hay = [
      r.FirstName,
      r.LastName,
      r.PickupName,
      r.DropoffName,
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

  function computeDeadheadCharge(r) {
    if (!r.review?.AddDeadhead) return 0;
    return Number(r.deadheadCharge || 0);
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

  function pricedAccessoryAmount(r, code) {
    const lines = Array.isArray(r.pricing?.accessories) ? r.pricing.accessories : [];
    const hit = lines.find((x) => String(x.code || "").toUpperCase() === String(code).toUpperCase());
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

  function baseTripTotal(r) {
    return Number(r.pricing?.base || 0)
      + Number(r.pricing?.mileage || 0)
      + Number(r.pricing?.cancelFee || 0);
  }

    function rowAccessoryTotal(r) {
      const charges = r.availableCharges || {};
      const wcState = wcAccessoryState(r);
      let total = 0;

      if (r.review?.AddNeedWC) total += wcState.needwcAmount;
      if (r.review?.AddRECL) total += wcState.reclAmount;

      if (r.review?.AddHazmat) total += Number(charges.hazmat || 0);
      if (r.review?.AddO2) total += Number(charges.o2 || 0);
      if (r.review?.AddBari) total += Number(charges.bari || 0);
      if (r.review?.AddDeadhead) total += Number(r.deadheadCharge || 0);

      total += computeWaitCharge(r);
      return total;
    }

  function rowDisplayTotal(r) {
    if (r.review?.MatchToQuote) {
      return Number(r.review?.QuoteAmount || 0);
    }
    return baseTripTotal(r) + rowAccessoryTotal(r);
  }

  for (const r of rows) {
    const defaultNeedWC = pricedAccessoryAmount(r, "NeedWC") > 0;
    const defaultRECL = pricedAccessoryAmount(r, "RECL") > 0;

    if (!r.review) {
      r.review = {
        AddNeedWC: defaultNeedWC,
        AddRECL: defaultRECL,
        AddHazmat: false,
        AddO2: false,
        AddBari: false,
        MatchToQuote: false,
        QuoteAmount: 0,
        AddWait: false,
        WaitTotalMinutes: 0,
        AddDeadhead: false,
        DeadheadMiles: 0,
        Action: r.Action || "INCLUDE",
        Modifier: r.Modifier || "NONE",
        Note: r.Note || "",
        MoveToAccountCode: r.MoveToAccountCode || ""
      };
    } else {
      if (typeof r.review.AddNeedWC !== "boolean") r.review.AddNeedWC = defaultNeedWC;
      if (typeof r.review.AddRECL !== "boolean") r.review.AddRECL = defaultRECL;
    }

    const tr = document.createElement("tr");
    if ((r.Action || "INCLUDE") === "EXCLUDE") tr.className = "row-exclude";

    // Date
    tr.appendChild(makeCell(esc(r.RideDateISO || "")));

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
      "<b>" + esc(r.PickupName || "") + "</b><div>" + esc(r.PickupCity || "") + "</div>"
    ));

    // Drop-off
    tr.appendChild(makeCell(
      "<b>" + esc(r.DropoffName || "") + "</b><div>" + esc(r.DropoffCity || "") + "</div>"
    ));

    // Miles
    tr.appendChild(makeCell(esc(r.DirectMileage || "")));

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

    function makeCheckMoney(labelText, checked, amountText) {
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

      const text = document.createElement("span");
      text.textContent = `${labelText} ${amountText}`;

      label.appendChild(cb);
      label.appendChild(text);
      return { label, cb };
    }

    const adjWrap = document.createElement("div");
    adjWrap.style.display = "flex";
    adjWrap.style.flexWrap = "wrap";
    adjWrap.style.alignItems = "center";
    adjWrap.style.rowGap = "6px";

    const wcState = wcAccessoryState(r);

    const needwcCtl = makeCheckMoney("Need WC", wcState.addNeedWC, fmtMoney(wcState.needwcAmount));
    const reclCtl = makeCheckMoney("RECL", wcState.addRECL, fmtMoney(wcState.reclAmount));
    const hzCtl = makeCheckMoney("HZ", !!r.review.AddHazmat, fmtMoney(r.availableCharges?.hazmat || 0));
    const o2Ctl = makeCheckMoney("O2", !!r.review.AddO2, fmtMoney(r.availableCharges?.o2 || 0));
    const bariCtl = makeCheckMoney("BARI", !!r.review.AddBari, fmtMoney(r.availableCharges?.bari || 0));
    const dhCtl = makeCheckMoney("DH", !!r.review.AddDeadhead, fmtMoney(r.deadheadCharge || 0));

    adjWrap.appendChild(needwcCtl.label);
    adjWrap.appendChild(reclCtl.label);
    adjWrap.appendChild(hzCtl.label);
    adjWrap.appendChild(o2Ctl.label);
    adjWrap.appendChild(bariCtl.label);
    adjWrap.appendChild(dhCtl.label);

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

    const waitMinutesInput = document.createElement("input");
    waitMinutesInput.type = "number";
    waitMinutesInput.step = "1";
    waitMinutesInput.style.width = "56px";
    waitMinutesInput.value = r.review.WaitTotalMinutes || "";
    waitWrap.appendChild(waitMinutesInput);

    const waitAmt = document.createElement("span");
    waitAmt.textContent = fmtMoney(computeWaitCharge(r));
    waitWrap.appendChild(waitAmt);

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
    };

    reclCtl.cb.onchange = () => {
      r.review.AddRECL = reclCtl.cb.checked;

      if (reclCtl.cb.checked) {
        r.review.AddNeedWC = false;
        needwcCtl.cb.checked = false;
      }

      refreshRowTotal();
      refreshDetailPanel();
    };

    hzCtl.cb.onchange = () => {
      r.review.AddHazmat = hzCtl.cb.checked;
      refreshRowTotal();
      refreshDetailPanel();
    };

    o2Ctl.cb.onchange = () => {
      r.review.AddO2 = o2Ctl.cb.checked;
      refreshRowTotal();
      refreshDetailPanel();
    };

    bariCtl.cb.onchange = () => {
      r.review.AddBari = bariCtl.cb.checked;
      refreshRowTotal();
      refreshDetailPanel();
    };

    dhCtl.cb.onchange = () => {
      r.review.AddDeadhead = dhCtl.cb.checked;
      refreshRowTotal();
      refreshDetailPanel();
    };

    waitCb.onchange = () => {
      r.review.AddWait = waitCb.checked;
      refreshRowTotal();
      refreshDetailPanel();
    };

    waitMinutesInput.oninput = () => {
      r.review.WaitTotalMinutes = Number(waitMinutesInput.value || 0);
      refreshRowTotal();
      refreshDetailPanel();
    };

    waitMinutesInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        waitMinutesInput.blur();
      }
    };

    overrideCb.onchange = () => {
      r.review.MatchToQuote = overrideCb.checked;
      overrideInput.disabled = !overrideCb.checked;
      refreshRowTotal();
      refreshDetailPanel();
    };

    overrideInput.oninput = () => {
      r.review.QuoteAmount = Number(overrideInput.value || 0);
      refreshRowTotal();
      refreshDetailPanel();
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
          const mileage = Number((r.pricing && r.pricing.mileage) || 0);
          const cancelFee = Number((r.pricing && r.pricing.cancelFee) || 0);
          const wcStateDetail = wcAccessoryState(r);
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
              "<div>Deadhead: <span data-dh-total>$" + computeDeadheadCharge(r).toFixed(2) + "</span></div>"
            );
          }
          if (r.review?.AddWait) {
            chargedAccessoryLines.push(
              "<div>Wait Time: <span data-wait-total>$" + computeWaitCharge(r).toFixed(2) + "</span></div>"
            );
          }

          const legsHtml = Array.isArray(r.legs) && r.legs.length
            ? r.legs.map((leg, idx) => {
                const puName = esc(leg.PickupName || "");
                const puAddr = esc(leg.PickupAddress1 || "");
                const puCity = esc([leg.PickupCity, leg.PickupState, leg.PickupZip].filter(Boolean).join(" "));
                const doName = esc(leg.DropoffName || "");
                const doAddr = esc(leg.DropoffAddress1 || "");
                const doCity = esc([leg.DropoffCity, leg.DropoffState, leg.DropoffZip].filter(Boolean).join(" "));
                return (
                  "<div>" +
                    "<div style='margin-bottom:6px'><b>Leg " + (idx + 1) + "</b></div>" +
                    "<div><b>Pick up:</b> " + puName + "</div>" +
                    "<div style='color:#334155'>" + puAddr + "</div>" +
                    "<div style='color:#334155'>" + puCity + "</div>" +
                    "<div style='margin-top:8px'><b>Drop-off:</b> " + doName + "</div>" +
                    "<div style='color:#334155'>" + doAddr + "</div>" +
                    "<div style='color:#334155'>" + doCity + "</div>" +
                  "</div>"
                );
              }).join("")
            : "<div style='color:#64748b'>No leg detail available.</div>";

          detailBox.innerHTML =
            "<div style='display:grid; grid-template-columns: 240px 320px repeat(auto-fit, minmax(260px, 1fr)); gap:20px; align-items:start'>" +

              "<div>" +
                "<div style='margin-bottom:8px'><b>Pricing</b></div>" +
                "<div>Base: $" + base.toFixed(2) + "</div>" +
                "<div>Mileage: $" + mileage.toFixed(2) + "</div>" +
                (cancelFee > 0 ? "<div>Cancel Fee: $" + cancelFee.toFixed(2) + "</div>" : "") +
                chargedAccessoryLines.join("") +
                "<div style='margin-top:6px'><b>Total: $" + grandTotal.toFixed(2) + "</b></div>" +
              "</div>" +

              "<div>" +
                "<div style='margin-bottom:8px'><b>Notes</b></div>" +
                "<div style='white-space:pre-line'>" + esc(r.notesFull || "") + "</div>" +
              "</div>" +

              legsHtml +

            "</div>";
        }

      renderDetailPanel();
    
    detailCell.appendChild(detailBox);
    detailRow.appendChild(detailCell);
    tb.appendChild(detailRow);
  }

  table.appendChild(tb);
  wrap.appendChild(table);
}