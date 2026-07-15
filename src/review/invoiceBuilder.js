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
    const { resolveReviewedRowsForExport } = require("./resolveReviewedRow");
    const { loadRateSheet, makeRateLookup } = require("./loadRateSheet");
    const { priceGroupedTrip } = require("./priceGroupedTrip");
    const { computeAvailableCharges } = require("./reviewAdjustments");
    const { scrubStaleTimeChargeOverride } = require("./reviewOverrides");
    const { ratesPath: defaultRatesPath, buildPricingContext } = require("../orgs/CTT/pricing/pricingContext");
    const { computeDeadheadCharge } = require("../orgs/CTT/pricing/computeDeadheadCharge");
    const { inferQboClass, isPrivatePayTrip } = require("../orgs/CTT/qboClass");
    const { matchesAnyBillingAddress, applyLocationAliasesToRow, } = require("../orgs/CTT/addressUtils");
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
    applyLocationAliasesToRow(r);

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

    const {
      exportRows,
      rateRow,
      effectiveAccountCode,
    } = resolveReviewedRowsForExport({
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
    });

    accountInvoiceMethod = String(
      rateRow?.invoice_method ||
      rateRow?.InvoiceMethod ||
      accountInvoiceMethod ||
      "single"
    ).trim().toLowerCase();

    const exportGlobals = {
      fuelSurchargeEnabled: !!reviewConfig.fuelSurchargeEnabled,
      fuelSurchargeWindows: Array.isArray(reviewConfig.fuelSurchargeWindows)
        ? reviewConfig.fuelSurchargeWindows
        : []
    };

    for (const exportRow of exportRows) {
      const repricedRow = exportRow.repricedRow;

      const invoiceSplit = normalizeInvoiceSplit(
        repricedRow.InvoiceSplit || "OTHER"
      );

      const rowReview = repricedRow.review || review;

      const className =
        repricedRow.QboClass ||
        inferQboClass(repricedRow, { matchesAnyBillingAddress });

      const exportCustomer = exportCustomerName(
        repricedRow,
        rateRow,
        repricedRow.AccountCode,
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