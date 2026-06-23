(function () {
  function moneyNum(v) {
    const cleaned = String(v ?? "")
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .trim();

    const n = Number(cleaned || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function automaticTimeCharge(r) {
    const lines = Array.isArray(r.pricing?.accessories)
      ? r.pricing.accessories
      : [];

    return (
      lines.find((x) => {
        const code = String(x.code || "").toUpperCase();

        return (
          code === "HOLIDAY" ||
          code === "WEEKEND" ||
          code === "THIRD_SHIFT" ||
          code === "AFTER_HOURS"
        );
      }) || null
    );
  }

  window.BM_REVIEW_PRICING = {
    moneyNum,
    automaticTimeCharge,
  };
})();