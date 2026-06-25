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

        if (idx === 0) {
          if (!r.review.PickupNameOverride) r.review.PickupNameOverride = puNameClean;
          if (!r.review.PickupAddress1Override) r.review.PickupAddress1Override = puAddrClean;
          if (!r.review.DropoffNameOverride) r.review.DropoffNameOverride = doNameClean;
          if (!r.review.DropoffAddress1Override) r.review.DropoffAddress1Override = doAddrClean;
        }

        const puName = esc(idx === 0 ? (r.review.PickupNameOverride || puNameClean) : puNameClean);
        const puAddr = esc(idx === 0 ? (r.review.PickupAddress1Override || puAddrClean) : puAddrClean);
        const doName = esc(idx === 0 ? (r.review.DropoffNameOverride || doNameClean) : doNameClean);
        const doAddr = esc(idx === 0 ? (r.review.DropoffAddress1Override || doAddrClean) : doAddrClean);

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

function renderDetailPanel() {
  return false;
}

window.BM_DETAIL_PANEL = {
  renderDetailPanel,
  buildPricingHtml,
  buildLegsHtml,
};
})();