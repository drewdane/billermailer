const { moveRowsToAccount } = require("../moveRowsToAccount");

function handleGetOverrides({
  u,
  res,
  send,
  safeJoin,
  readJson,
}) {
  const acct = u.query.acct;
  const period = u.query.period;
  const p = safeJoin(acct, period, "overrides.json");

  return send(res, 200, JSON.stringify(readJson(p)), "application/json");
}

function handlePostOverrides({
  req,
  res,
  send,
  safeJoin,
  writeJson,
  baseDir,
}) {
  let body = "";

  req.on("data", (c) => (body += c));

  req.on("end", () => {
    const payload = JSON.parse(body || "{}");
    const acct = payload.acct;
    const period = payload.period;

    const invoiceType = payload.invoiceType || "single";
    const deliveryFormat = payload.deliveryFormat || "qbo";
    const reviewed = !!payload.reviewed;
    const reviewedAt = payload.reviewedAt || null;
    const fuelSurchargeEnabled = !!payload.fuelSurchargeEnabled;
    const fuelSurchargeStart = payload.fuelSurchargeStart || "";
    const fuelSurchargeEnd = payload.fuelSurchargeEnd || "";
    const overrides = payload.overrides || {};

    const p = safeJoin(acct, period, "overrides.json");

    writeJson(p, {
      invoiceType,
      deliveryFormat,
      reviewed,
      reviewedAt,
      fuelSurchargeEnabled,
      fuelSurchargeStart,
      fuelSurchargeEnd,
      overrides,
    });

    const movesByAccount = {};

    for (const [lineId, o] of Object.entries(overrides || {})) {
      const toAcct = String(o.MoveToAccountCode || "").trim();
      if (!toAcct || toAcct === acct) continue;

      if (!movesByAccount[toAcct]) movesByAccount[toAcct] = [];
      movesByAccount[toAcct].push(lineId);
    }

    for (const [toAcct, lineIds] of Object.entries(movesByAccount)) {
        try {
            moveRowsToAccount({
            baseDir,
            fromAcct: acct,
            toAcct,
            period,
            lineIds,
            safeJoin,
            });
        } catch (err) {
            console.warn(
            "Move rows skipped:",
            err?.message || String(err)
            );
        }
    }

    return send(res, 200, JSON.stringify({ ok: true }), "application/json");
  });
}

module.exports = {
  handleGetOverrides,
  handlePostOverrides,
};