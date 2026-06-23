function handleAccountsRoute({
  res,
  send,
}) {
  const { loadRateSheet } = require("../loadRateSheet");
  const {
    ratesPath: defaultRatesPath,
  } = require("../../orgs/CTT/pricing/pricingContext");

  const rows = loadRateSheet(defaultRatesPath);

  const accounts = Array.from(new Set(
    rows
      .map((r) =>
        String(
          r.AccountCode ||
          r.account_code ||
          r.account ||
          r.Account ||
          ""
        ).trim()
      )
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  return send(
    res,
    200,
    JSON.stringify({ accounts }),
    "application/json"
  );
}

module.exports = {
  handleAccountsRoute,
};