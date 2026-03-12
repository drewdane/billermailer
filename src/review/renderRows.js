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
      "<th style='width:90px'>HZ</th>" +
      "<th style='width:90px'>O2</th>" +
      "<th style='width:90px'>BARI</th>" +
      "<th style='width:90px'>DH</th>" +
      "<th style='width:140px'>WAIT</th>" +
      "<th style='width:160px'>Override</th>" +
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

  function rowAccessoryTotal(r) {
    const charges = r.availableCharges || {};
    let total = 0;
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
    return Number(r.pricing?.total || 0) + rowAccessoryTotal(r);
  }

  for (const r of rows) {
    if (!r.review) {
      r.review = {
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

    // HZ
    const hzTd = makeCell();
    const hzLabel = document.createElement("label");
    hzLabel.style.whiteSpace = "nowrap";
    const hzCb = document.createElement("input");
    hzCb.type = "checkbox";
    hzCb.checked = !!r.review.AddHazmat;
    hzLabel.appendChild(hzCb);
    hzLabel.appendChild(document.createTextNode(" " + fmtMoney(r.availableCharges?.hazmat || 0)));
    hzTd.appendChild(hzLabel);
    tr.appendChild(hzTd);

    // O2
    const o2Td = makeCell();
    const o2Label = document.createElement("label");
    o2Label.style.whiteSpace = "nowrap";
    const o2Cb = document.createElement("input");
    o2Cb.type = "checkbox";
    o2Cb.checked = !!r.review.AddO2;
    o2Label.appendChild(o2Cb);
    o2Label.appendChild(document.createTextNode(" " + fmtMoney(r.availableCharges?.o2 || 0)));
    o2Td.appendChild(o2Label);
    tr.appendChild(o2Td);

    // BARI
    const bariTd = makeCell();
    const bariLabel = document.createElement("label");
    bariLabel.style.whiteSpace = "nowrap";
    const bariCb = document.createElement("input");
    bariCb.type = "checkbox";
    bariCb.checked = !!r.review.AddBari;
    bariLabel.appendChild(bariCb);
    bariLabel.appendChild(document.createTextNode(" " + fmtMoney(r.availableCharges?.bari || 0)));
    bariTd.appendChild(bariLabel);
    tr.appendChild(bariTd);

    // Deadhead
    const dhTd = makeCell();
    const dhLabel = document.createElement("label");
    dhLabel.style.whiteSpace = "nowrap";
    const dhCb = document.createElement("input");
    dhCb.type = "checkbox";
    dhCb.checked = !!r.review.AddDeadhead;
    dhLabel.appendChild(dhCb);
    dhLabel.appendChild(document.createTextNode(" " + fmtMoney(r.deadheadCharge || 0)));
    dhTd.appendChild(dhLabel);
    tr.appendChild(dhTd);

    // Wait time
    const waitTd = makeCell();
    waitTd.style.whiteSpace = "nowrap";

    const waitCb = document.createElement("input");
    waitCb.type = "checkbox";
    waitCb.checked = !!r.review.AddWait;
    waitTd.appendChild(waitCb);

    const waitMinutesInput = document.createElement("input");
    waitMinutesInput.type = "number";
    waitMinutesInput.step = "1";
    waitMinutesInput.style.width = "52px";
    waitMinutesInput.style.marginLeft = "6px";
    waitMinutesInput.value = r.review.WaitTotalMinutes || "";
    waitTd.appendChild(waitMinutesInput);

    const waitAmt = document.createElement("span");
    waitAmt.style.marginLeft = "6px";
    waitAmt.textContent = fmtMoney(computeWaitCharge(r));
    waitTd.appendChild(waitAmt);

    tr.appendChild(waitTd);

    // Override
    const overrideTd = makeCell();
    overrideTd.style.whiteSpace = "nowrap";
    const overrideCb = document.createElement("input");
    overrideCb.type = "checkbox";
    overrideCb.checked = !!r.review.MatchToQuote;
    overrideTd.appendChild(overrideCb);
    overrideTd.appendChild(document.createTextNode(" $"));

    const overrideInput = document.createElement("input");
    overrideInput.type = "number";
    overrideInput.step = "0.01";
    overrideInput.style.width = "82px";
    overrideInput.value = r.review.QuoteAmount || "";
    overrideInput.disabled = !r.review.MatchToQuote;
    overrideTd.appendChild(overrideInput);
    tr.appendChild(overrideTd);

    // Total
    const totalTd = makeCell("<b>" + esc(fmtMoney(rowDisplayTotal(r))) + "</b>");
    tr.appendChild(totalTd);

    function refreshRowTotal() {
      totalTd.innerHTML = "<b>" + esc(fmtMoney(rowDisplayTotal(r))) + "</b>";
    }

    function refreshDetailTotals() {
      const accessoriesBox = detailBox.querySelector("[data-accessory-total]");
      if (accessoriesBox) {
        accessoriesBox.textContent = "$" + rowAccessoryTotal(r).toFixed(2);
      }

      const dhBox = detailBox.querySelector("[data-dh-total]");
      if (dhBox) {
        dhBox.textContent = "$" + computeDeadheadCharge(r).toFixed(2);
      }

      const waitBox = detailBox.querySelector("[data-wait-total]");
      if (waitBox) {
        waitBox.textContent = "$" + computeWaitCharge(r).toFixed(2);
      }

      const totalBox = detailBox.querySelector("[data-grand-total]");
      if (totalBox) {
        totalBox.textContent = "$" + rowDisplayTotal(r).toFixed(2);
      }
    }

    function refreshWaitUI() {
      waitAmt.textContent = fmtMoney(computeWaitCharge(r));
      refreshRowTotal();
      refreshDetailTotals();
    }

    hzCb.onchange = () => {
      r.review.AddHazmat = hzCb.checked;
      refreshRowTotal();
      refreshDetailTotals();
    };

    o2Cb.onchange = () => {
      r.review.AddO2 = o2Cb.checked;
      refreshRowTotal();
      refreshDetailTotals();
    };

    bariCb.onchange = () => {
      r.review.AddBari = bariCb.checked;
      refreshRowTotal();
      refreshDetailTotals();
    };

    dhCb.onchange = () => {
      r.review.AddDeadhead = dhCb.checked;
      refreshRowTotal();
      refreshDetailTotals();
    };

    dhCb.onchange = () => {
      r.review.AddDeadhead = dhCb.checked;
      refreshRowTotal();
      refreshDetailTotals();
    };

    waitCb.onchange = () => {
      r.review.AddWait = waitCb.checked;
      refreshWaitUI();
      refreshDetailTotals();
    };

    waitMinutesInput.oninput = () => {
      r.review.WaitTotalMinutes = Number(waitMinutesInput.value || 0);
      refreshWaitUI();
      refreshDetailTotals();
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
      refreshDetailTotals();
    };

    overrideInput.oninput = () => {
      r.review.QuoteAmount = Number(overrideInput.value || 0);
      refreshRowTotal();
      refreshDetailTotals();
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
    detailCell.colSpan = 14;

    const detailBox = document.createElement("div");
    detailBox.style.padding = "12px";
    detailBox.style.borderTop = "1px solid #ddd";
    detailBox.style.background = "#fafafa";

        const base = Number((r.pricing && r.pricing.base) || 0);
        const mileage = Number((r.pricing && r.pricing.mileage) || 0);
        const cancelFee = Number((r.pricing && r.pricing.cancelFee) || 0);
        const grandTotal = Number(rowDisplayTotal(r));

        const chargedAccessoryLines = [];
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
              "<div>Cancel Fee: $" + cancelFee.toFixed(2) + "</div>" +
              "<div>Accessories: <span data-accessory-total>$" + rowAccessoryTotal(r).toFixed(2) + "</span></div>" +
              chargedAccessoryLines.join("") +
              "<div style='margin-top:6px'><b>Total: <span data-grand-total>$" + grandTotal.toFixed(2) + "</span></b></div>" +
            "</div>" +

            "<div>" +
              "<div style='margin-bottom:8px'><b>Notes</b></div>" +
              "<div style='white-space:pre-line'>" + esc(r.notesFull || "") + "</div>" +
            "</div>" +

            legsHtml +

          "</div>";
    
    detailCell.appendChild(detailBox);
    detailRow.appendChild(detailCell);
    tb.appendChild(detailRow);
  }

  table.appendChild(tb);
  wrap.appendChild(table);
}