function resolveReviewedRowsForExport({
  r,
  review,
  rateLookupFn,
  buildPricingContext,
  priceGroupedTrip,
  computeAvailableCharges,
  computeDeadheadCharge,
  rateRowIncludesActualTimes,
  yesFlag,
  pickPoNumber,
  inferThrSplit,
  normalizeInvoiceSplit,
  num,
}) {
  const override = review.TripTypeOverride || "";
  let mobilityOverride = r.Mobility;

  if (override === "STR") mobilityOverride = "STR";
  else if (override === "WC") mobilityOverride = "WC";
  else if (override === "AMBU") mobilityOverride = "AMBU";

  const effectiveAccountCode =
    String(review.MoveToAccountCode || "").trim() ||
    String(r.AccountCode || "").trim();

  const mileageOverride = Number(review.MileageOverride || 0);
  const effectiveMileage = mileageOverride > 0
    ? mileageOverride
    : Number(r.DirectMileage || 0);

  const pricingInput = {
    ...r,
    review,
    AccountCode: effectiveAccountCode,
    AccountName: effectiveAccountCode,
    Mobility: mobilityOverride,
    BillingClass: r.BillingClass,
    DirectMileage: String(effectiveMileage),
  };

  const rateRow = rateLookupFn(pricingInput);
  const pricingContext = buildPricingContext(pricingInput);
  let exportRows = [];

  if (
    review.SplitTrip &&
    Array.isArray(r.legs) &&
    r.legs.length > 1
  ) {
    exportRows = r.legs.map((leg, idx) => {
      const splitMiles = Number(leg.DirectMileage || 0);

      const splitReview = {
        ...review,
        SplitTrip: false,
        MileageOverride: splitMiles,
        ClassOverride: "",
        PickupNameOverride: "",
        PickupAddress1Override: "",
        DropoffNameOverride: "",
        DropoffAddress1Override: "",
        ActualPickupTimeOverride: "",
        ActualDropoffTimeOverride: "",
      };

      const singleRow = {
        ...r,
        ...leg,
        TripShape: "ONE_WAY",
        LegCount: 1,
        legs: [leg],
        pricing: null,
        LineId: String(r.LineId || "") + "_split_" + idx,
        review: splitReview
      };

      const singlePricingInput = {
        ...singleRow,
        review: splitReview,
        AccountCode: effectiveAccountCode,
        AccountName: effectiveAccountCode,
        Mobility: mobilityOverride,
        BillingClass: r.BillingClass,
        DirectMileage: String(splitMiles),
      };

      const singlePricingContext = buildPricingContext(singlePricingInput);

      const singlePricing = priceGroupedTrip(
        singlePricingInput,
        rateRow,
        singlePricingContext
      );

      return {
        repricedRow: {
          ...singlePricingInput,
          pricing: singlePricing,
          billingAddress:
            rateRow?.billing_address ||
            rateRow?.BillingAddress ||
            "",
        }
      };
    });
  }

  if (!exportRows.length) {
    const pricing = priceGroupedTrip(pricingInput, rateRow, pricingContext);
    const availableCharges = computeAvailableCharges(pricingInput, rateRow || {});
    const deadheadResult = computeDeadheadCharge(pricingInput, rateRow || {}, pricingContext);

    const repricedRow = {
      invoiceMethod:
        rateRow?.invoice_method ||
        rateRow?.InvoiceMethod ||
        "single",
      ...pricingInput,
      pricing,
      invoiceIncludeActualTimes: rateRowIncludesActualTimes(rateRow || {}),
      invoiceFullStopList: yesFlag(
        rateRow?.invoice_full_stop_list ||
        rateRow?.InvoiceFullStopList
      ),
      billingAddress:
        rateRow?.billing_address ||
        rateRow?.BillingAddress ||
        "",
      poNumber: pickPoNumber(
        rateRow,
        String(review.InvoiceSplitOverride || "AUTO").toUpperCase() === "AUTO"
          ? inferThrSplit(pricingInput)
          : normalizeInvoiceSplit(review.InvoiceSplitOverride)
      ),
      availableCharges,
      deadheadCharge: Number(deadheadResult.deadheadCharge || 0),
      deadheadMiles: Number(deadheadResult.deadheadMiles || 0),
      deadheadDebug: deadheadResult,
      deadheadConfig: {
        dh_flat_fee: rateRow?.dh_flat_fee ?? "",
        dh_start_miles: rateRow?.dh_start_miles ?? "",
        dh_rate_tier1: rateRow?.dh_rate_tier1 ?? "",
        dh_rate_tier2: rateRow?.dh_rate_tier2 ?? "",
        dh_rate_tier3: rateRow?.dh_rate_tier3 ?? "",
        dh_tier2_start_miles: rateRow?.dh_tier2_start_miles ?? "",
        dh_tier3_start_miles: rateRow?.dh_tier3_start_miles ?? "",
      },
      waitConfig: {
        wait_rate: rateRow?.wait_rate ?? "",
        wait_block_min: rateRow?.wait_block_min ?? "",
        wait_grace_min: rateRow?.wait_grace_min ?? "",
      },
      fuelSurchargeRate: num(rateRow?.fuel_surcharge),
      availableWcAccessories: {
        needwc_1w: num(rateRow?.needwc_1w),
        needwc_rt: num(rateRow?.needwc_rt),
        recl_1w: num(rateRow?.recl_1w),
        recl_rt: num(rateRow?.recl_rt),
      },
    };

    exportRows.push({ repricedRow });
  }

  return {
    exportRows,
    rateRow,
    effectiveAccountCode,
  };
}

module.exports = {
  resolveReviewedRowsForExport,
};