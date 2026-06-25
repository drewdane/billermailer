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

  function pricedAccessoryAmount(r, code) {
    const lines = Array.isArray(r.pricing?.accessories)
      ? r.pricing.accessories
      : [];

    const hit = lines.find(
      (x) =>
        String(x.code || "").toUpperCase() ===
        String(code).toUpperCase()
    );

    return Number(hit?.amount || 0);
  }

  function automaticTimeChargeAmount(r) {
    const hit = automaticTimeCharge(r);
    return Number(hit?.amount || 0);
  }

  function timeChargeAmountForCode(r, code) {
    const c = String(code || "").toUpperCase();
    const auto = automaticTimeCharge(r);

    if (auto && String(auto.code || "").toUpperCase() === c) {
      return Number(auto.amount || 0);
    }

    const charges = r.availableCharges || {};

    if (c === "AFTER_HOURS") return Number(charges.after_hours || 0);
    if (c === "THIRD_SHIFT") return Number(charges.third_shift || 0);
    if (c === "WEEKEND") return Number(charges.weekend || 0);
    if (c === "HOLIDAY") return Number(charges.holiday || 0);

    return 0;
  }

  function selectedTimeChargeAmount(r) {
    if (r.review?.AddHoliday) return timeChargeAmountForCode(r, "HOLIDAY");
    if (r.review?.AddThirdShift) return timeChargeAmountForCode(r, "THIRD_SHIFT");
    if (r.review?.AddWeekend) return timeChargeAmountForCode(r, "WEEKEND");
    if (r.review?.AddAfterHours) return timeChargeAmountForCode(r, "AFTER_HOURS");

    return 0;
  }

  function wcAccessoryState(r) {
    const shape = String(r.TripShape || "").toUpperCase();
    const isRt = shape === "ROUND_TRIP" || shape === "MULTI_STOP";

    const src = r.availableWcAccessories || {};

    const needwcAmount = Number(
      isRt ? (src.needwc_rt || 0) : (src.needwc_1w || 0)
    );

    const reclAmount = Number(
      isRt ? (src.recl_rt || 0) : (src.recl_1w || 0)
    );

    let addNeedWC = !!r.review?.AddNeedWC;
    let addRECL = !!r.review?.AddRECL;

    if (addNeedWC && addRECL) {
      addNeedWC = false;
    }

    return {
      needwcAmount,
      reclAmount,
      addNeedWC,
      addRECL
    };
  }

  function isCancelled(r) {
    const raw = String(r.RideStatus || "").trim().toLowerCase();
    const tmCancelled = raw === "noshow" || raw === "ridercancel";

    const override = String(r.review?.CancelOverride || "AUTO").toUpperCase();

    if (override === "YES") return true;
    if (override === "NO") return false;
    return tmCancelled;
  }

  function foldedWcAccessoryAmount(r) {
    const shape = String(r.TripShape || "").toUpperCase();
    const isRt = shape === "ROUND_TRIP" || shape === "MULTI_STOP";
    const src = r.availableWcAccessories || {};

    if (r.review?.AddRECL) {
      return Number(isRt ? (src.recl_rt || 0) : (src.recl_1w || 0));
    }

    if (r.review?.AddNeedWC) {
      return Number(isRt ? (src.needwc_rt || 0) : (src.needwc_1w || 0));
    }

    return 0;
  }

  function baseTripTotal(r) {
    if (isCancelled(r)) {
      return Number(
        r.pricing?.cancelFee ||
        r.availableCharges?.cancel_fee ||
        0
      );
    }

    return Number(r.pricing?.base || 0)
      + foldedWcAccessoryAmount(r)
      + Number(r.pricing?.mileage || 0);
  }

  function rowAccessoryTotal(r, helpers = {}) {
    if (isCancelled(r)) return 0;

    const charges = r.availableCharges || {};
    let total = 0;

    if (r.review?.AddHazmat) total += Number(charges.hazmat || 0);
    if (r.review?.AddO2) total += Number(charges.o2 || 0);
    if (r.review?.AddBari) total += Number(charges.bari || 0);

    total += helpers.computeDeadheadChargeFromReview?.(r) || 0;
    total += helpers.computeWaitCharge?.(r) || 0;
    total += helpers.selectedTimeChargeAmount?.(r) || 0;
    total += helpers.fuelSurchargeAmount?.(r) || 0;

    return total;
  }

  function rowDisplayTotal(r, helpers = {}) {
    if (r.review?.MatchToQuote) {
      return Number(r.review?.QuoteAmount || 0);
    }

    if (r.review?.NoCharge) {
      return 0;
    }

    const base = helpers.baseTripTotal
      ? helpers.baseTripTotal(r)
      : baseTripTotal(r);

    const accessories = helpers.rowAccessoryTotal
      ? helpers.rowAccessoryTotal(r)
      : rowAccessoryTotal(r, helpers);

    return base + accessories;
  }

  function computeWaitCharge(r) {
    if (!r.review?.AddWait) return 0;

    const cfg = r.waitConfig || {};
    const waitMinutes = Number(r.review?.WaitTotalMinutes || 0);
    if (waitMinutes <= 0) return 0;

    const rate = moneyNum(cfg.wait_rate);
    if (rate <= 0) return 0;

    const blockMin = moneyNum(cfg.wait_block_min);
    const graceMin = moneyNum(cfg.wait_grace_min);

    const chargedMinutes = Math.max(0, waitMinutes - graceMin);
    if (chargedMinutes <= 0) return 0;

    if (blockMin > 0) {
      return Math.ceil(chargedMinutes / blockMin) * rate;
    }

    return rate;
  }

  function computeDeadheadChargeFromReview(r) {
    if (!r.review?.AddDeadhead) return 0;

    const miles = Number(r.review?.DeadheadMiles || 0);
    if (miles <= 0) return 0;

    const cfg = r.deadheadConfig || {};

    const flatRaw = String(cfg.dh_flat_fee ?? "").trim();
    const flatFee = moneyNum(cfg.dh_flat_fee);

    if (flatRaw && flatFee > 0) {
      return flatFee;
    }

    const startMiles = moneyNum(cfg.dh_start_miles);
    if (startMiles > 0 && miles < startMiles) return 0;

    const tier2Start = moneyNum(cfg.dh_tier2_start_miles);
    const tier3Start = moneyNum(cfg.dh_tier3_start_miles);

    const rate1 = moneyNum(cfg.dh_rate_tier1);
    const rate2 = moneyNum(cfg.dh_rate_tier2);
    const rate3 = moneyNum(cfg.dh_rate_tier3);

    let rate = 0;

    if (tier3Start > 0 && miles >= tier3Start && rate3 > 0) {
      rate = rate3;
    } else if (tier2Start > 0 && miles >= tier2Start && rate2 > 0) {
      rate = rate2;
    } else if (rate1 > 0) {
      rate = rate1;
    }

    return miles * rate;
  }

  function fuelSurchargeAmount(r, fuelState = {}) {
    if (!fuelState.fuelSurchargeEnabled) return 0;

    const rate = Number(r.fuelSurchargeRate || 0);
    if (rate <= 0) return 0;

    const tripDate = String(r.RideDateISO || "");
    if (!tripDate) return 0;

    const windows = Array.isArray(fuelState.fuelSurchargeWindows)
      ? fuelState.fuelSurchargeWindows
      : [];

    const effectiveWindows = windows.length
      ? windows
      : [
          {
            start: fuelState.fuelSurchargeStart || "",
            end: fuelState.fuelSurchargeEnd || "",
          },
        ];

    const inWindow = effectiveWindows.some((win) => {
      const start = String(win.start || "");
      const end = String(win.end || "");

      if (!start || !end) return false;

      return tripDate >= start && tripDate <= end;
    });

    if (!inWindow) return 0;

    const loadedMiles = Number(
      r.review?.MileageOverride ||
      r.pricing?.audit?.billableMiles ||
      r.DirectMileage ||
      0
    );

    const dhMiles = r.review?.AddDeadhead
      ? Number(r.review?.DeadheadMiles || 0)
      : 0;

    return rate * (loadedMiles + dhMiles);
  }

  window.BM_REVIEW_PRICING = {
    moneyNum,
    automaticTimeCharge,
    pricedAccessoryAmount,
    automaticTimeChargeAmount,
    timeChargeAmountForCode,
    selectedTimeChargeAmount,
    wcAccessoryState,
    isCancelled,
    foldedWcAccessoryAmount,
    baseTripTotal,
    rowAccessoryTotal,
    rowDisplayTotal,
    computeWaitCharge,
    computeDeadheadChargeFromReview,
    fuelSurchargeAmount,
  };
})();