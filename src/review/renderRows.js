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
      "<th style='width:70px'>HZ</th>" +
      "<th style='width:70px'>O2</th>" +
      "<th style='width:70px'>BARI</th>" +
      "<th style='width:160px'>Override</th>" +
      "<th style='width:90px'>Total</th>" +
    "</tr></thead>";

  const tb = document.createElement("tbody");

  function makeCell(html = "") {
    const td = document.createElement("td");
    td.innerHTML = html;
    return td;
  }

  function tripShapeLabel(r) {
    if (r.pricing && r.pricing.badge) return r.pricing.badge;
    return r.TripShape === "ROUND_TRIP" ? "RT"
      : r.TripShape === "MULTI_STOP" ? "MS"
      : "1W";
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

    const total =
      r.pricing && typeof r.pricing.total === "number"
        ? "$" + r.pricing.total.toFixed(2)
        : "";

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
    hzCb.onchange = () => { r.review.AddHazmat = hzCb.checked; };
    hzLabel.appendChild(hzCb);
    hzLabel.appendChild(document.createTextNode(" $—"));
    hzTd.appendChild(hzLabel);
    tr.appendChild(hzTd);

    // O2
    const o2Td = makeCell();
    const o2Label = document.createElement("label");
    o2Label.style.whiteSpace = "nowrap";
    const o2Cb = document.createElement("input");
    o2Cb.type = "checkbox";
    o2Cb.checked = !!r.review.AddO2;
    o2Cb.onchange = () => { r.review.AddO2 = o2Cb.checked; };
    o2Label.appendChild(o2Cb);
    o2Label.appendChild(document.createTextNode(" $—"));
    o2Td.appendChild(o2Label);
    tr.appendChild(o2Td);

    // BARI
    const bariTd = makeCell();
    const bariLabel = document.createElement("label");
    bariLabel.style.whiteSpace = "nowrap";
    const bariCb = document.createElement("input");
    bariCb.type = "checkbox";
    bariCb.checked = !!r.review.AddBari;
    bariCb.onchange = () => { r.review.AddBari = bariCb.checked; };
    bariLabel.appendChild(bariCb);
    bariLabel.appendChild(document.createTextNode(" $—"));
    bariTd.appendChild(bariLabel);
    tr.appendChild(bariTd);

    // Override
    const overrideTd = makeCell();
    overrideTd.style.whiteSpace = "nowrap";
    const overrideCb = document.createElement("input");
    overrideCb.type = "checkbox";
    overrideCb.checked = !!r.review.MatchToQuote;
    overrideCb.onchange = () => {
      r.review.MatchToQuote = overrideCb.checked;
      overrideInput.disabled = !overrideCb.checked;
    };
    overrideTd.appendChild(overrideCb);
    overrideTd.appendChild(document.createTextNode(" $"));

    const overrideInput = document.createElement("input");
    overrideInput.type = "number";
    overrideInput.step = "0.01";
    overrideInput.style.width = "82px";
    overrideInput.value = r.review.QuoteAmount || "";
    overrideInput.disabled = !r.review.MatchToQuote;
    overrideInput.oninput = () => {
      r.review.QuoteAmount = Number(overrideInput.value || 0);
    };
    overrideTd.appendChild(overrideInput);
    tr.appendChild(overrideTd);

    // Total
    tr.appendChild(makeCell("<b>" + esc(total) + "</b>"));

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
    detailCell.colSpan = 12;

    const detailBox = document.createElement("div");
    detailBox.style.padding = "12px";
    detailBox.style.borderTop = "1px solid #ddd";
    detailBox.style.background = "#fafafa";

    const base = Number((r.pricing && r.pricing.base) || 0);
    const mileage = Number((r.pricing && r.pricing.mileage) || 0);
    const cancelFee = Number((r.pricing && r.pricing.cancelFee) || 0);
    const grandTotal = Number((r.pricing && r.pricing.total) || 0);

    const legsHtml = Array.isArray(r.legs) && r.legs.length
      ? r.legs.map((leg, idx) => {
          const puName = esc(leg.PickupName || "");
          const puAddr = esc(leg.PickupAddress1 || "");
          const puCity = esc([leg.PickupCity, leg.PickupState, leg.PickupZip].filter(Boolean).join(" "));
          const doName = esc(leg.DropoffName || "");
          const doAddr = esc(leg.DropoffAddress1 || "");
          const doCity = esc([leg.DropoffCity, leg.DropoffState, leg.DropoffZip].filter(Boolean).join(" "));
          return (
            "<div style='margin-bottom:10px'>" +
              "<div><b>Leg " + (idx + 1) + "</b></div>" +
              "<div><b>Pick up:</b> " + puName + "</div>" +
              "<div style='color:#334155'>" + puAddr + "</div>" +
              "<div style='color:#334155'>" + puCity + "</div>" +
              "<div style='margin-top:4px'><b>Drop-off:</b> " + doName + "</div>" +
              "<div style='color:#334155'>" + doAddr + "</div>" +
              "<div style='color:#334155'>" + doCity + "</div>" +
            "</div>"
          );
        }).join("")
      : "";
    
    detailBox.innerHTML =
      "<div style='display:grid; grid-template-columns: 220px 1fr 1fr 1fr; gap:16px'>" +

        "<div>" +
          "<div style='margin-bottom:6px'><b>Pricing</b></div>" +
          "<div>Base: $" + base.toFixed(2) + "</div>" +
          "<div>Mileage: $" + mileage.toFixed(2) + "</div>" +
          "<div>Cancel Fee: $" + cancelFee.toFixed(2) + "</div>" +
          "<div style='margin-top:6px'><b>Total: $" + grandTotal.toFixed(2) + "</b></div>" +
        "</div>" +

        "<div>" +
          "<div style='margin-bottom:6px'><b>Pick up</b></div>" +
          "<div>" + esc(r.PickupName || "") + "</div>" +
          "<div style='color:#334155'>" + esc(r.PickupAddress1 || "") + "</div>" +
          "<div style='color:#334155'>" + esc([r.PickupCity, r.PickupState, r.PickupZip].filter(Boolean).join(" ")) + "</div>" +
        "</div>" +

        "<div>" +
          "<div style='margin-bottom:6px'><b>Drop-off</b></div>" +
          "<div>" + esc(r.DropoffName || "") + "</div>" +
          "<div style='color:#334155'>" + esc(r.DropoffAddress1 || "") + "</div>" +
          "<div style='color:#334155'>" + esc([r.DropoffCity, r.DropoffState, r.DropoffZip].filter(Boolean).join(" ")) + "</div>" +
        "</div>" +

        "<div>" +
          "<div style='margin-bottom:6px'><b>Notes</b></div>" +
          "<div style='white-space:pre-line'>" + esc(r.notesFull || "") + "</div>" +
        "</div>" +

      "</div>" +

      (legsHtml
        ? "<div style='margin-top:16px'>" +
            "<div style='margin-bottom:8px'><b>Legs</b></div>" +
            "<div style='display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:16px'>" +
              legsHtml +
            "</div>" +
          "</div>"
        : "");

    detailCell.appendChild(detailBox);
    detailRow.appendChild(detailCell);
    tb.appendChild(detailRow);
  }

  table.appendChild(tb);
  wrap.appendChild(table);
}