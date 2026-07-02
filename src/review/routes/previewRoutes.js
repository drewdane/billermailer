function money(n) {
  return Number(Number(n || 0).toFixed(2));
}

function buildPricingSummary(lines) {
  const summary = {
    base: 0,
    mileage: 0,
    accessories: [],
    total: 0,
  };

  for (const line of Array.isArray(lines) ? lines : []) {
    const kind = String(line.lineKind || "").toUpperCase();
    const amount = money(line.amount || 0);

    if (kind === "BASE" || kind === "CANCEL_FEE") {
      summary.base += amount;
    } else if (kind === "MILEAGE") {
      summary.mileage += amount;
    } else {
      let label = line.productService || kind;

      if (kind === "MATCH_TO_QUOTE") label = "Match To Quote";
      if (kind === "DEADHEAD") label = "Deadhead" + (line.miles ? " (" + line.miles + " mi)" : "");
      if (kind === "WAIT") label = "Wait Time" + (line.minutes ? " (" + line.minutes + " min)" : "");

      summary.accessories.push({
        kind,
        label,
        amount,
      });
    }

    summary.total += amount;
  }

  summary.base = money(summary.base);
  summary.mileage = money(summary.mileage);
  summary.total = money(summary.total);

  return summary;
}

function handlePreviewLinesRoute(ctx) {
  const {
    req,
    res,
    send,
    buildBillableLines,
    resolveReviewedRowsForExport,
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
    readReviewConfig,
  } = ctx;

  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    try {
      const payload = JSON.parse(body || "{}");
      const r = payload.row || {};
      const review = payload.review || r.review || {};

      if (!r.LineId) {
        return send(res, 400, JSON.stringify({
          ok: false,
          error: "Missing row.LineId"
        }), "application/json");
      }

      const { exportRows } = resolveReviewedRowsForExport({
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

      const reviewConfig = readReviewConfig();

      const globals = {
        fuelSurchargeEnabled: !!reviewConfig.fuelSurchargeEnabled,
        fuelSurchargeWindows: Array.isArray(reviewConfig.fuelSurchargeWindows)
          ? reviewConfig.fuelSurchargeWindows
          : []
      };

      const lines = [];

      for (const exportRow of exportRows) {
        lines.push(...buildBillableLines(exportRow.repricedRow, globals));
      }

      const pricingSummary = buildPricingSummary(lines);

      return send(res, 200, JSON.stringify({
        ok: true,
        lineId: r.LineId,
        lines,
        pricingSummary,
        total: pricingSummary.total,
      }), "application/json");
    } catch (err) {
      console.error("Preview lines failed:", err);
      return send(res, 500, JSON.stringify({
        ok: false,
        error: String(err?.message || err)
      }), "application/json");
    }
  });
}

module.exports = {
  handlePreviewLinesRoute,
};