const fs = require("fs");

function handleItemsRoute({
  req,
  res,
  u,
  send,
  safeJoin,
  readJson,
  inferQboClass,
  matchesAnyBillingAddress,
  normalizeAddress,
  applyLocationAliasesToRow,
  inferThrSplit,
  pickPoNumber,
  rateRowIncludesActualTimes,
}) {
  const acct = String(u.query.acct || "").trim();
  const period = u.query.period;
  const p = safeJoin(acct, period, "items.json");

  const rows = readJson(p);

  const { loadRateSheet, makeRateLookup } = require("../loadRateSheet");
  const {
    ratesPath: defaultRatesPath,
  } = require("../../orgs/CTT/pricing/pricingContext");

  const rateRows = loadRateSheet(defaultRatesPath);
  const rateLookupFn = makeRateLookup(rateRows);

  const rateRow =
    rateLookupFn({
      AccountCode: acct,
      AccountName: acct,
    }) || {};

  const includeTimes = rateRowIncludesActualTimes(rateRow);

  const poNumber =
    rateRow?.po_number ||
    rateRow?.PONumber ||
    rateRow?.poNumber ||
    rateRow?.["PO Number"] ||
    rateRow?.["PO#"] ||
    "";

  const invoiceMethod = String(
    rateRow?.invoice_method ||
    rateRow?.InvoiceMethod ||
    "single"
  )
    .trim()
    .toLowerCase();

  for (const row of rows) {
    row.invoiceIncludeActualTimes = includeTimes;
    row.poNumber = poNumber;
    row.invoiceMethod = invoiceMethod;

    applyLocationAliasesToRow(row);

    row.invoiceSplit =
      invoiceMethod === "thr_split"
        ? inferThrSplit(row)
        : "";

    row.billingAddress =
      rateRow?.billing_address ||
      rateRow?.BillingAddress ||
      "";

    row.billing_address = row.billingAddress;
    row.alt_address_1 = rateRow?.alt_address_1 || "";
    row.alt_address_2 = rateRow?.alt_address_2 || "";
    row.alt_address_3 = rateRow?.alt_address_3 || "";

    normalizeAddress(
      row.billingAddress ||
      ""
    );

    normalizeAddress(
      row.PickupAddress1 ||
      row.PickupAddress ||
      ""
    );

    normalizeAddress(
      row.DropoffAddress1 ||
      row.DropoffAddress ||
      ""
    );

    row.addressMismatch =
      !!row.billingAddress &&
      !matchesAnyBillingAddress(
        row.PickupAddress1 || row.PickupAddress || "",
        row
      ) &&
      !matchesAnyBillingAddress(
        row.DropoffAddress1 || row.DropoffAddress || "",
        row
      );

    row.inferredClass = inferQboClass(row, {
      matchesAnyBillingAddress,
    });

    row.poNumber = pickPoNumber(rateRow, row.invoiceSplit);
  }

  return send(
    res,
    200,
    JSON.stringify(rows),
    "application/json"
  );
}

module.exports = {
  handleItemsRoute,
};