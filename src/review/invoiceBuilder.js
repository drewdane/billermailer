const fs = require("fs");

function yesFlag(v) {
  return String(v || "").trim().toLowerCase() === "y";
}

function rateRowIncludesActualTimes(rateRow) {
  return yesFlag(
    rateRow?.invoice_include_actual_times ||
    rateRow?.InvoiceIncludeActualTimes ||
    rateRow?.include_actual_times ||
    rateRow?.IncludeActualTimes
  );
}

function exportCustomerName(repricedRow, rateRow, fallbackAccountCode, isPrivatePayTrip) {
  if (isPrivatePayTrip(repricedRow)) {
    return String(
      (
        (repricedRow.FirstName || "") +
        " " +
        (repricedRow.LastName || "")
      ).trim() || fallbackAccountCode
    );
  }

  return String(
    rateRow?.billingName ||
    rateRow?.billing_name ||
    rateRow?.BillingName ||
    fallbackAccountCode ||
    ""
  ).trim();
}

function buildGroupedInvoicesForSet({ baseDir, acct, period, invoiceType, safeJoin, readReviewConfig }) {
  const itemsPath = safeJoin(acct, period, "items.json");
  const overridesPath = safeJoin(acct, period, "overrides.json");

  if (!fs.existsSync(itemsPath)) {
    throw new Error(`Missing items.json for ${acct} / ${period}`);
  }

  const rows = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const overrides = fs.existsSync(overridesPath)
    ? JSON.parse(fs.readFileSync(overridesPath, "utf8"))
    : { overrides: {} };

  const reviewConfig = readReviewConfig();

    const { buildBillableLines } = require("./buildBillableLines");
    const { loadRateSheet, makeRateLookup } = require("./loadRateSheet");
    const { priceGroupedTrip } = require("./priceGroupedTrip");
    const { computeAvailableCharges } = require("./reviewAdjustments");
    const { scrubStaleTimeChargeOverride } = require("./reviewOverrides");
    const { ratesPath: defaultRatesPath, buildPricingContext } = require("../orgs/CTT/pricing/pricingContext");
    const { computeDeadheadCharge } = require("../orgs/CTT/pricing/computeDeadheadCharge");
    const { inferQboClass, isPrivatePayTrip } = require("../orgs/CTT/qboClass");
    const { matchesAnyBillingAddress } = require("../orgs/CTT/addressUtils");
    const { normalizeInvoiceSplit, inferThrSplit, pickPoNumber } = require("../orgs/CTT/invoiceSplit");
    const { riderInitials } = require("../orgs/CTT/invoiceNumbers");
    const { num } = require("../pricing/rateLookup");

  const rateRows = loadRateSheet(defaultRatesPath);
  const rateLookupFn = makeRateLookup(rateRows);

  global.BM_SHORT_CODE_MAP = new Map();

  for (const row of rateRows) {
    const acctCode = String(row.AccountCode || row.account_code || row.account || "").trim();
    const shortCode = String(row.ShortCode || row.shortcode || row.short_code || "").trim();

    if (acctCode && shortCode) {
      global.BM_SHORT_CODE_MAP.set(acctCode, shortCode.toUpperCase());
    }
  }

  const lines = [];
  let accountInvoiceMethod = "single";

  const manualMergeGroups = {};

  for (const r of rows) {
    const rawOverride = overrides.overrides?.[r.LineId] || {};
    const o = scrubStaleTimeChargeOverride(rawOverride);
    const review = { ...(r.review || {}), ...o };

    if (review.MergeGroupId) {
      if (!manualMergeGroups[review.MergeGroupId]) {
        manualMergeGroups[review.MergeGroupId] = [];
      }

      manualMergeGroups[review.MergeGroupId].push({
        row: r,
        review
      });

      continue;
    }

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
    accountInvoiceMethod = String(
      rateRow?.invoice_method ||
      rateRow?.InvoiceMethod ||
      accountInvoiceMethod ||
      "single"
    ).trim().toLowerCase();
    const pricingContext = buildPricingContext(pricingInput);
    let exportRows = [];

    if (
      review.SplitTrip &&
      Array.isArray(r.legs) &&
      r.legs.length > 1
    ) {
      exportRows = r.legs.map((leg, idx) => {
        const splitMiles = Math.round(
          Number(r.DirectMileage || 0) / Math.max(1, r.legs.length)
        );

        const splitReview = {
          ...review,
          MileageOverride: splitMiles
        };

        const singleRow = {
          ...r,
          ...leg,
          TripShape: "ONE_WAY",
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

    const exportGlobals = {
      fuelSurchargeEnabled: !!reviewConfig.fuelSurchargeEnabled,
      fuelSurchargeWindows: Array.isArray(reviewConfig.fuelSurchargeWindows)
        ? reviewConfig.fuelSurchargeWindows
        : []
    };

    for (const exportRow of exportRows) {
      const repricedRow = exportRow.repricedRow;

      const splitOverride = String(review.InvoiceSplitOverride || "AUTO").toUpperCase();

      const invoiceSplit = splitOverride === "AUTO"
        ? inferThrSplit(repricedRow)
        : normalizeInvoiceSplit(splitOverride);

      const className =
        review.ClassOverride ||
        inferQboClass(repricedRow, { matchesAnyBillingAddress })

      const exportCustomer = exportCustomerName(
        repricedRow,
        rateRow,
        effectiveAccountCode,
        isPrivatePayTrip
      );

      const built = buildBillableLines(repricedRow, exportGlobals).map((line) => ({
        ...line,
        customer: exportCustomer,
        invoiceSplit,
        className,
        isPrivatePay: isPrivatePayTrip(repricedRow),
        ppInitials: riderInitials(repricedRow),
        serviceDate: repricedRow.RideDateISO || line.rideDateISO || "",
      }));

      lines.push(...built);
    }
  }

  for (const [groupId, members] of Object.entries(manualMergeGroups)) {

    const sortedMembers = members.slice().sort((a, b) => {
      const da = String(a.row.RideDateISO || a.row.RideDate || "");
      const db = String(b.row.RideDateISO || b.row.RideDate || "");
      const ta = String(a.row.ScheduledPickupTime || "");
      const tb = String(b.row.ScheduledPickupTime || "");
      return (da + " " + ta).localeCompare(db + " " + tb);
    });

    const first = sortedMembers[0];
    const firstRow = first.row;
    const firstReview = {
      ...first.review,
      ClassOverride: "",
    };

    const mergedMileage = members.reduce((sum, m) => {
      return sum + Number(m.row.DirectMileage || 0);
    }, 0);

    const mergedLegs = members
      .map((m) => m.row)
      .sort((a, b) => {
        const da = String(a.RideDateISO || a.RideDate || "");
        const db = String(b.RideDateISO || b.RideDate || "");
        const ta = String(a.ScheduledPickupTime || "");
        const tb = String(b.ScheduledPickupTime || "");
        return (da + " " + ta).localeCompare(db + " " + tb);
      });

    const routeReview = {
      ...firstReview,
      PickupNameOverride: "",
      PickupAddress1Override: "",
      DropoffNameOverride: "",
      DropoffAddress1Override: "",
    };

    const mergedRow = {
      ...mergedLegs[0],
      TripShape: "MULTI_STOP",
      LegCount: mergedLegs.length,
      DirectMileage: mergedMileage,
      review: routeReview,
      legs: mergedLegs,
    };

    const effectiveAccountCode =
      String(firstReview.MoveToAccountCode || "").trim() ||
      String(firstRow.AccountCode || "").trim();

    const pricingInput = {
      ...mergedRow,
      review: routeReview,
      AccountCode: effectiveAccountCode,
      AccountName: effectiveAccountCode,
    };

    const rateRow = rateLookupFn(pricingInput);

    const pricingContext = buildPricingContext(pricingInput);

    const pricing = priceGroupedTrip(
      pricingInput,
      rateRow,
      pricingContext
    );

    const repricedRow = {
      ...pricingInput,
      pricing,
      invoiceMethod:
        rateRow?.invoice_method ||
        rateRow?.InvoiceMethod ||
        "single",
    };

    const exportGlobals = {
      fuelSurchargeEnabled: !!reviewConfig.fuelSurchargeEnabled,
      fuelSurchargeWindows: Array.isArray(reviewConfig.fuelSurchargeWindows)
        ? reviewConfig.fuelSurchargeWindows
        : []
    };

    const className = "300 Round Trip";

    const exportCustomer = exportCustomerName(
      repricedRow,
      rateRow,
      effectiveAccountCode,
      isPrivatePayTrip
    );

    const built = buildBillableLines(repricedRow, exportGlobals).map((line) => ({
      ...line,
      customer: exportCustomer,
      invoiceSplit: "OTHER",
      className,
      isPrivatePay: isPrivatePayTrip(repricedRow),
      ppInitials: riderInitials(repricedRow),
    }));

    lines.push(...built);
  }

  let grouped = [];

  const effectiveInvoiceType = accountInvoiceMethod || "single";

  if (effectiveInvoiceType === "single") {
    const byCustomer = {};

  for (const l of lines) {
    const customer = String(l.customer || acct).trim();
    if (!byCustomer[customer]) byCustomer[customer] = [];
    byCustomer[customer].push(l);
  }

  grouped = Object.entries(byCustomer).map(([customer, customerLines]) => ({
    invoiceNo: "PENDING",
    customer,
    lines: customerLines,
  }));

  } else if (effectiveInvoiceType === "thr_split") {
    const bySplit = {};

    for (const l of lines) {
      const customer = String(l.customer || acct).trim();
      const split = normalizeInvoiceSplit(l.invoiceSplit || "OTHER");
      const key = customer + "||" + split;

      if (!bySplit[key]) bySplit[key] = [];
      bySplit[key].push(l);
    }

    grouped = Object.entries(bySplit).map(([key, splitLines]) => {
      const [customer, split] = key.split("||");

      return {
        invoiceNo: "PENDING",
        customer,
        lines: splitLines,
      };
    });

  } else if (effectiveInvoiceType === "individual") {
    const byTrip = {};

    for (const l of lines) {
      const customer = String(l.customer || acct).trim();
      const key = customer + "||" + l.lineId;
      if (!byTrip[key]) byTrip[key] = [];
      byTrip[key].push(l);
    }

    grouped = Object.entries(byTrip).map(([k, v]) => {
      const customer = String(v[0]?.customer || acct).trim();

      return {
        invoiceNo: "PENDING",
        customer,
        lines: v,
      };
    });
  }

  return grouped;
}

module.exports = {
  buildGroupedInvoicesForSet,
  rateRowIncludesActualTimes,
};