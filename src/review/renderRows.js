// src/review/renderRows.js
// Browser-side render function for BM Review

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
      "<th style='width:140px'>Rider</th>" +
      "<th style='width:180px'>Pickup</th>" +
      "<th style='width:180px'>Dropoff</th>" +
      "<th style='width:55px'>Mi</th>" +
      "<th>Notes</th>" +
      "<th style='width:70px'>HZ</th>" +
      "<th style='width:70px'>O2</th>" +
      "<th style='width:70px'>BARI</th>" +
      "<th style='width:150px'>Quote</th>" +
      "<th style='width:90px'>Total</th>" +
      "<th style='width:70px'></th>" +
    "</tr></thead>";

  const tb = document.createElement("tbody");

  for (const r of rows) {
    const tr = document.createElement("tr");
    if (r.Action === "EXCLUDE") tr.className = "row-exclude";

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
        Action: "INCLUDE",
        Modifier: "NONE",
        Note: "",
        MoveToAccountCode: ""
      };
    }

    const total =
      r.pricing && typeof r.pricing.total === "number"
        ? "$" + r.pricing.total.toFixed(2)
        : "";

    tr.innerHTML =
      "<td>" + esc(r.RideDateISO || "") + "</td>" +
      "<td>" + esc(((r.FirstName || "") + " " + (r.LastName || "")).trim()) +
        "<div style='color:#666'>" + esc(r.Mobility || "") + "</div></td>" +
      "<td><b>" + esc(r.PickupName || "") + "</b><div>" + esc(r.PickupCity || "") + "</div></td>" +
      "<td><b>" + esc(r.DropoffName || "") + "</b><div>" + esc(r.DropoffCity || "") + "</div></td>" +
      "<td>" + esc(r.DirectMileage || "") + "</td>" +
      "<td style='white-space:pre-line; overflow:hidden; text-overflow:ellipsis;' title='" +
        esc(r.notesFull || "") + "'>" +
        esc(r.notesPreview || "") +
      "</td>" +
      "<td></td>" +
      "<td></td>" +
      "<td></td>" +
      "<td></td>" +
      "<td><b>" + esc(total) + "</b></td>" +
      "<td></td>";

    const tds = tr.querySelectorAll("td");

    // HZ
    const hzTd = tds[6];
    const hzLabel = document.createElement("label");
    hzLabel.style.whiteSpace = "nowrap";
    const hzCb = document.createElement("input");
    hzCb.type = "checkbox";
    hzCb.checked = !!r.review.AddHazmat;
    hzCb.onchange = () => { r.review.AddHazmat = hzCb.checked; };
    hzLabel.appendChild(hzCb);
    hzLabel.appendChild(document.createTextNode(" $"));
    hzLabel.appendChild(document.createTextNode("—"));
    hzTd.appendChild(hzLabel);

    // O2
    const o2Td = tds[7];
    const o2Label = document.createElement("label");
    o2Label.style.whiteSpace = "nowrap";
    const o2Cb = document.createElement("input");
    o2Cb.type = "checkbox";
    o2Cb.checked = !!r.review.AddO2;
    o2Cb.onchange = () => { r.review.AddO2 = o2Cb.checked; };
    o2Label.appendChild(o2Cb);
    o2Label.appendChild(document.createTextNode(" $"));
    o2Label.appendChild(document.createTextNode("—"));
    o2Td.appendChild(o2Label);

    // BARI
    const bariTd = tds[8];
    const bariLabel = document.createElement("label");
    bariLabel.style.whiteSpace = "nowrap";
    const bariCb = document.createElement("input");
    bariCb.type = "checkbox";
    bariCb.checked = !!r.review.AddBari;
    bariCb.onchange = () => { r.review.AddBari = bariCb.checked; };
    bariLabel.appendChild(bariCb);
    bariLabel.appendChild(document.createTextNode(" $"));
    bariLabel.appendChild(document.createTextNode("—"));
    bariTd.appendChild(bariLabel);

    // Quote
    const quoteTd = tds[9];
    quoteTd.style.whiteSpace = "nowrap";

    const quoteCb = document.createElement("input");
    quoteCb.type = "checkbox";
    quoteCb.checked = !!r.review.MatchToQuote;
    quoteCb.onchange = () => {
      r.review.MatchToQuote = quoteCb.checked;
      quoteInput.disabled = !quoteCb.checked;
    };
    quoteTd.appendChild(quoteCb);
    quoteTd.appendChild(document.createTextNode(" $"));

    const quoteInput = document.createElement("input");
    quoteInput.type = "number";
    quoteInput.step = "0.01";
    quoteInput.style.width = "80px";
    quoteInput.value = r.review.QuoteAmount || "";
    quoteInput.disabled = !r.review.MatchToQuote;
    quoteInput.oninput = () => {
      r.review.QuoteAmount = Number(quoteInput.value || 0);
    };
    quoteTd.appendChild(quoteInput);

    // More
    const moreTd = tds[11];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "More";
    btn.onclick = function () {
      toggleDetails(r.LineId || "");
    };
    moreTd.appendChild(btn);

    tb.appendChild(tr);

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

    detailBox.innerHTML =
      "<div style='display:grid; grid-template-columns: 1fr 1fr; gap:16px'>" +
        "<div>" +
          "<div style='margin-bottom:8px'><b>Pricing Breakdown</b></div>" +
          "<div>Base: $" + base.toFixed(2) + "</div>" +
          "<div>Mileage: $" + mileage.toFixed(2) + "</div>" +
          "<div>Cancel Fee: $" + cancelFee.toFixed(2) + "</div>" +
          "<div style='margin-top:8px'><b>Total: $" + grandTotal.toFixed(2) + "</b></div>" +
        "</div>" +
        "<div>" +
          "<div style='margin-bottom:8px'><b>Full Notes</b></div>" +
          "<div style='white-space:pre-line'>" + esc(r.notesFull || "") + "</div>" +
        "</div>" +
      "</div>";

    detailCell.appendChild(detailBox);
    detailRow.appendChild(detailCell);
    tb.appendChild(detailRow);
  }

  table.appendChild(tb);
  wrap.appendChild(table);
}