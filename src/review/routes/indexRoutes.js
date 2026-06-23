const fs = require("fs");

function handleIndexRoute({
  res,
  send,
  safeJoin,
  readJson,
  baseDir,
}) {
  const p = safeJoin("index.json");

  if (!fs.existsSync(p)) {
    return send(
      res,
      500,
      `index.json not found at:\n${p}\n\nBase dir:\n${baseDir}\n\nFix: rerun bm-reviewpackets.js with --outDir matching this folder, or start server with --dir pointing to it.`,
      "text/plain; charset=utf-8"
    );
  }

  const index = readJson(p);

  for (const acct of Object.keys(index.facilities || {})) {
    const facility = index.facilities[acct];

    for (const period of Object.keys(facility.periods || {})) {
      const overridesPath = safeJoin(acct, period, "overrides.json");

      let reviewed = false;
      let reviewedAt = null;
      let invoiceType = "single";

      if (fs.existsSync(overridesPath)) {
        const o = readJson(overridesPath);
        reviewed = !!o.reviewed;
        reviewedAt = o.reviewedAt || null;
        invoiceType = o.invoiceType || "single";
      }

      facility.periods[period] = {
        ...(facility.periods[period] || {}),
        reviewed,
        reviewedAt,
        invoiceType,
      };
    }
  }

  return send(
    res,
    200,
    JSON.stringify(index),
    "application/json"
  );
}

module.exports = {
  handleIndexRoute,
};