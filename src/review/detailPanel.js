(function () {
  function buildPricingHtml(ctx) {
    const {
      r,
      esc,
      rowDisplayTotal,
      wcAccessoryState,
      isCancelled,
      computeDeadheadChargeFromReview,
      computeWaitCharge,
      selectedTimeChargeAmount,
      fuelSurchargeAmount,
    } = ctx;

    const base = Number((r.pricing && r.pricing.base) || 0);
    const billableMiles = Number(r.review?.MileageOverride || 0);
    const mileageRate =
      billableMiles > 0
        ? Number((r.pricing && r.pricing.mileage) || 0) /
          Number((r.pricing?.audit?.billableMiles) || billableMiles)
        : 0;

    const mileage = billableMiles * mileageRate;
    const wcStateDetail = wcAccessoryState(r);
    const cancelFee = Number(r.pricing?.cancelFee || r.availableCharges?.cancel_fee || 0);
    const grandTotal = Number(rowDisplayTotal(r));

    const chargedAccessoryLines = [];

    if (r.review?.AddNeedWC) {
      chargedAccessoryLines.push("<div>Need WC: $" + wcStateDetail.needwcAmount.toFixed(2) + "</div>");
    }
    if (r.review?.AddRECL) {
      chargedAccessoryLines.push("<div>RECL: $" + wcStateDetail.reclAmount.toFixed(2) + "</div>");
    }
    if (r.review?.AddHazmat) {
      chargedAccessoryLines.push("<div>Hazmat: $" + Number(r.availableCharges?.hazmat || 0).toFixed(2) + "</div>");
    }
    if (r.review?.AddO2) {
      chargedAccessoryLines.push("<div>Oxygen: $" + Number(r.availableCharges?.o2 || 0).toFixed(2) + "</div>");
    }
    if (r.review?.AddBari) {
      chargedAccessoryLines.push("<div>Bariatric: $" + Number(r.availableCharges?.bari || 0).toFixed(2) + "</div>");
    }
    if (r.review?.AddDeadhead) {
      chargedAccessoryLines.push(
        "<div>Deadhead (" + Number(r.review?.DeadheadMiles || 0).toFixed(0) +
        " mi): <span data-dh-total>$" + computeDeadheadChargeFromReview(r).toFixed(2) + "</span></div>"
      );
    }
    if (r.review?.AddWait) {
      chargedAccessoryLines.push(
        "<div>Wait Time: <span data-wait-total>$" + computeWaitCharge(r).toFixed(2) + "</span></div>"
      );
    }

    const selectedTimeCharge = (() => {
      if (r.review?.AddHoliday) return { label: "Holiday", amount: selectedTimeChargeAmount(r) };
      if (r.review?.AddThirdShift) return { label: "3rd Shift", amount: selectedTimeChargeAmount(r) };
      if (r.review?.AddWeekend) return { label: "Weekend", amount: selectedTimeChargeAmount(r) };
      if (r.review?.AddAfterHours) return { label: "After Hours", amount: selectedTimeChargeAmount(r) };
      return null;
    })();

    if (selectedTimeCharge && selectedTimeCharge.amount > 0) {
      chargedAccessoryLines.push(
        "<div>" + esc(selectedTimeCharge.label) + ": $" + selectedTimeCharge.amount.toFixed(2) + "</div>"
      );
    }

    const fuelTotal = fuelSurchargeAmount(r);
    if (fuelTotal > 0) {
      chargedAccessoryLines.push("<div>Fuel Surcharge: $" + fuelTotal.toFixed(2) + "</div>");
    }

    if (r.review?.MatchToQuote) {
      const quoteAmount = Number(r.review?.QuoteAmount || 0);
      const currentTotal = Number(grandTotal || 0);
      const variance = quoteAmount - currentTotal;

      chargedAccessoryLines.push(
        "<div>Match To Quote: $" + variance.toFixed(2) + "</div>"
      );
    }

    const noChargeHtml = r.review?.NoCharge
      ? "<div style='margin-top:6px;color:#991b1b;font-weight:600'>No Charge</div>"
      : "";

    return (
      "<div style='margin-bottom:8px'><b>Pricing</b></div>" +
      (
        isCancelled(r)
          ? "<div>Cancellation Fee: $" + cancelFee.toFixed(2) + "</div>"
          : (
              "<div>Base: $" + base.toFixed(2) + "</div>" +
              "<div>Mileage: $" + mileage.toFixed(2) + "</div>" +
              chargedAccessoryLines.join("")
            )
      ) +
      noChargeHtml +
      "<div style='margin-top:6px'><b>Total: $" + grandTotal.toFixed(2) + "</b></div>"
    );
  }

  function buildLegsHtml(ctx) {
  const { r, esc } = ctx;

  return Array.isArray(r.legs) && r.legs.length
    ? r.legs.map((leg, idx) => {
        const puNameRaw = leg.PickupName || "";
        const puAddrRaw = leg.PickupAddress1 || "";
        const doNameRaw = leg.DropoffName || "";
        const doAddrRaw = leg.DropoffAddress1 || "";

        const puNameClean = window.cleanLocationName ? window.cleanLocationName(puNameRaw) : puNameRaw;
        const puAddrClean = puAddrRaw;
        const puCity = esc([leg.PickupCity, leg.PickupState, leg.PickupZip].filter(Boolean).join(" "));

        const doNameClean = window.cleanLocationName ? window.cleanLocationName(doNameRaw) : doNameRaw;
        const doAddrClean = doAddrRaw;
        const doCity = esc([leg.DropoffCity, leg.DropoffState, leg.DropoffZip].filter(Boolean).join(" "));

        const puName = esc(
          idx === 0 && r.review?.PickupNameOverride
            ? r.review.PickupNameOverride
            : puNameClean
        );

        const puAddr = esc(
          idx === 0 && r.review?.PickupAddress1Override
            ? r.review.PickupAddress1Override
            : puAddrClean
        );

        const doName = esc(
          idx === 0 && r.review?.DropoffNameOverride
            ? r.review.DropoffNameOverride
            : doNameClean
        );

        const doAddr = esc(
          idx === 0 && r.review?.DropoffAddress1Override
            ? r.review.DropoffAddress1Override
            : doAddrClean
        );

        const puKey = "pu-" + idx;
        const doKey = "do-" + idx;

        return (
          "<div>" +
            "<div><b>Pick up:</b></div>" +
            "<input data-loc-edit='pu-name' data-loc-key='" + puKey + "' data-original-name='" + esc(puNameRaw) + "' data-original-address='" + esc(puAddrRaw) + "' value='" + puName + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
            "<input data-loc-edit='pu-address' data-loc-key='" + puKey + "' data-original-name='" + esc(puNameRaw) + "' data-original-address='" + esc(puAddrRaw) + "' value='" + puAddr + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
            "<div style='color:#334155'>" + puCity + "</div>" +
            "<button data-loc-save-alias='pu' data-loc-key='" + puKey + "' type='button' style='margin-top:6px'>Save pick up address for future</button>" +
            "<div style='margin-top:8px'><b>Drop-off:</b></div>" +
            "<input data-loc-edit='do-name' data-loc-key='" + doKey + "' data-original-name='" + esc(doNameRaw) + "' data-original-address='" + esc(doAddrRaw) + "' value='" + doName + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
            "<input data-loc-edit='do-address' data-loc-key='" + doKey + "' data-original-name='" + esc(doNameRaw) + "' data-original-address='" + esc(doAddrRaw) + "' value='" + doAddr + "' style='width:100%;box-sizing:border-box;margin-top:3px;border:1px solid #d6d8ea;border-radius:6px;padding:2px 4px' />" +
            "<div style='color:#334155'>" + doCity + "</div>" +
            "<button data-loc-save-alias='do' data-loc-key='" + doKey + "' type='button' style='margin-top:6px'>Save drop-off address for future</button>" +
          "</div>"
        );
      }).join("")
    : "<div style='color:#64748b'>No leg detail available.</div>";
}

function buildPoHtml(ctx) {
  const { r, esc, extractMraNumberFromText } = ctx;

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

  let poHtml =
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

  return poHtml;
}

function buildActualTimesHtml(ctx) {
  const { r, esc } = ctx;

  if (!r.invoiceIncludeActualTimes) return "";

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

  return (
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
    "</div>"
  );
}

function buildDetailPanelHtml(ctx) {
  const {
    pricingHtml,
    actualTimesHtml,
    poHtml,
    splitHtml,
    notesHtml,
    legsHtml,
  } = ctx;

  return (
    "<div style='display:grid; grid-template-columns: 240px 320px repeat(auto-fit, minmax(260px, 1fr)); gap:20px; align-items:start'>" +

      "<div>" +
        pricingHtml +
        "<div data-export-preview-lines style='margin-top:12px;padding-top:8px;border-top:1px solid #e5e7eb'>" +
          "<div style='margin-bottom:6px'><b>Export Preview</b></div>" +
          "<div style='color:#64748b'>Loading...</div>" +
        "</div>" +
        actualTimesHtml +
        poHtml +
        splitHtml +
      "</div>" +

      notesHtml +

      legsHtml +

    "</div>"
  );
}

function buildSplitHtml(ctx) {
  const { r } = ctx;

  const canSplit =
    Array.isArray(r.legs) &&
    r.legs.length > 1;

  if (!canSplit) return "";

  return (
    "<label style='display:flex;align-items:center;gap:6px;margin-top:8px'>" +
      "<input data-split-trip type='checkbox' " +
      (r.review?.SplitTrip ? "checked" : "") +
      " />" +
      "<span>Split this trip into separate 1-ways</span>" +
    "</label>"
  );
}

function buildNotesHtml(ctx) {
  const { r, esc } = ctx;

  return (
    "<div>" +
      "<div style='margin-bottom:8px'><b>Notes</b></div>" +
      "<div style='white-space:pre-line'>" +
        esc(r.notesFull || "") +
      "</div>" +
    "</div>"
  );
}

function wireSimpleDetailControls(ctx) {
  const { r, detailBox } = ctx;

  const poInput = detailBox.querySelector("[data-po-number-override]");
  if (poInput) {
    poInput.oninput = () => {
      r.review.PoNumberOverride = poInput.value;
      if (window.markDirty) window.markDirty();
    };
  }

  const splitSelect = detailBox.querySelector("[data-invoice-split-override]");
  if (splitSelect) {
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
}

function wireLocationEditors(ctx) {
  const { r, detailBox } = ctx;

  detailBox.querySelectorAll("[data-loc-edit]").forEach((input) => {
    input.oninput = () => {
      const locKey = input.dataset.locKey || "";

      // Current override model only supports the first displayed route.
      // Do not let return-leg edits overwrite the export route overrides.
      if (locKey !== "pu-0" && locKey !== "do-0") {
        return;
      }

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
}

function wireAliasButtons(ctx) {
  const { detailBox } = ctx;

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
          address1,
        }),
      });

      btn.textContent = "Saved";

      setTimeout(() => {
        btn.textContent = isPickup ? "Save pick up address for future" : "Save drop-off address for future";
      }, 1200);

      if (window.markDirty) window.markDirty();
    };
  });
}

async function loadExportPreviewLines(r, detailBox) {
  const host = detailBox.querySelector("[data-export-preview-lines]");
  if (!host) return;

  try {
    const resp = await fetch("/api/preview-lines", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        row: r,
        review: r.review || {}
      })
    });

    const data = await resp.json();

    if (!data.ok) {
      host.innerHTML =
        "<div style='margin-bottom:6px'><b>Export Preview</b></div>" +
        "<div style='color:#991b1b'>" + String(data.error || "Preview failed") + "</div>";
      return;
    }

    const summary = data.pricingSummary || {};
    const accessories = Array.isArray(summary.accessories) ? summary.accessories : [];

    host.innerHTML =
      "<div style='margin-bottom:6px'><b>Server Pricing</b></div>" +
      "<div>Base: $" + Number(summary.base || 0).toFixed(2) + "</div>" +
      "<div>Mileage: $" + Number(summary.mileage || 0).toFixed(2) + "</div>" +
      accessories.map((line) => {
        return "<div>" + String(line.label || "") + ": $" + Number(line.amount || 0).toFixed(2) + "</div>";
      }).join("") +
      "<div style='margin-top:6px'><b>Total: $" + Number(summary.total || 0).toFixed(2) + "</b></div>";

  } catch (err) {
    host.innerHTML =
      "<div style='margin-bottom:6px'><b>Export Preview</b></div>" +
      "<div style='color:#991b1b'>" + String(err?.message || err) + "</div>";
  }
}

function renderDetailPanel() {
  return false;
}

window.BM_DETAIL_PANEL = {
  renderDetailPanel,
  loadExportPreviewLines,
  buildPricingHtml,
  buildLegsHtml,
  buildPoHtml,
  buildActualTimesHtml,
  buildSplitHtml,
  buildDetailPanelHtml,
  buildNotesHtml,
  wireSimpleDetailControls,
  wireLocationEditors,
  wireAliasButtons,
};
})();