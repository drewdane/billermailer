function num(v) {
  if (v === null || v === undefined) return 0;

  const s = String(v).trim().replace(/\$/g, "").replace(/,/g, "");
  if (!s || s.toLowerCase() === "nan") return 0;

  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function hasY(v) {
  return norm(v) === "y";
}

function parseTimeToMinutes(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return hh * 60 + mm;
}

function isWindowHit(minutes, startRaw, endRaw) {
  const start = parseTimeToMinutes(startRaw);
  const end = parseTimeToMinutes(endRaw);

  if (minutes == null || start == null || end == null) return false;

  if (start === end) return true; // all day

  if (start < end) {
    return minutes >= start && minutes < end;
  }

  return minutes >= start || minutes < end;
}

function parseRideDate(rideDateRaw) {
  const s = String(rideDateRaw || "").trim();
  const datePart = s.split(" ")[0];
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const d = new Date(year, monthIndex, 1);
  let count = 0;

  while (d.getMonth() === monthIndex) {
    if (d.getDay() === weekday) {
      count += 1;
      if (count === nth) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }

  return null;
}

function lastWeekdayOfMonth(year, monthIndex, weekday) {
  const d = new Date(year, monthIndex + 1, 0);

  while (d.getMonth() === monthIndex) {
    if (d.getDay() === weekday) return new Date(d);
    d.setDate(d.getDate() - 1);
  }

  return null;
}

function isSameMonthDay(d, monthIndex, day) {
  return d.getMonth() === monthIndex && d.getDate() === day;
}

function isHoliday(dateObj) {
  if (!dateObj) return false;

  const year = dateObj.getFullYear();

  if (isSameMonthDay(dateObj, 0, 1)) return true;
  if (isSameMonthDay(dateObj, 6, 4)) return true;
  if (isSameMonthDay(dateObj, 10, 11)) return true;
  if (isSameMonthDay(dateObj, 11, 25)) return true;

  const memorial = lastWeekdayOfMonth(year, 4, 1);
  if (memorial && memorial.toDateString() === dateObj.toDateString()) return true;

  const labor = nthWeekdayOfMonth(year, 8, 1, 1);
  if (labor && labor.toDateString() === dateObj.toDateString()) return true;

  const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4);
  if (thanksgiving && thanksgiving.toDateString() === dateObj.toDateString()) return true;

  return false;
}

function getChargeEvaluationLegs(groupedTrip) {
  return Array.isArray(groupedTrip.legs) && groupedTrip.legs.length
    ? groupedTrip.legs
    : [groupedTrip];
}

function addCandidate(candidates, kind, amount, source, debug) {
  if (!kind || amount <= 0) return;

  candidates.push({
    kind,
    amount,
    source,
    debug,
  });
}

function pickHighestCandidate(candidates) {
  if (!candidates.length) return null;

  return candidates.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;

    const priority = {
      HOLIDAY: 4,
      THIRD_SHIFT: 3,
      WEEKEND: 2,
      AFTER_HOURS: 1,
    };

    return (priority[b.kind] || 0) - (priority[a.kind] || 0);
  })[0];
}

function computeTimeBasedCharge(groupedTrip, rateRow = {}) {
  const legs = getChargeEvaluationLegs(groupedTrip);

  const candidates = [];

  const weekdayAfterHoursRate = num(rateRow.after_hours_rate);
  const weekdayThirdShiftRate = num(rateRow.third_shift_rate);
  const weekendRate = num(rateRow.weekend_rate);
  const holidayRate = num(rateRow.holiday_rate);

  for (const leg of legs) {
    const rideDate = parseRideDate(leg.RideDate || groupedTrip.RideDate);
    const pickupMinutes = parseTimeToMinutes(leg.ScheduledPickupTime);
    const day = rideDate ? rideDate.getDay() : null;

    const isSat = day === 6;
    const isSun = day === 0;
    const isWeekend = isSat || isSun;

    const regularWeekend =
      (isSat && hasY(rateRow.regular_includes_sat || rateRow.regular_includes_saturday)) ||
      (isSun && hasY(rateRow.regular_includes_sun || rateRow.regular_includes_sunday));

    const prefix = isSat ? "sat" : isSun ? "sun" : null;

    if (isHoliday(rideDate) && holidayRate > 0) {
      const hasHolidayWindow =
        String(rateRow.holiday_start || "").trim() ||
        String(rateRow.holiday_end || "").trim();

      const holidayHit = hasHolidayWindow
        ? isWindowHit(pickupMinutes, rateRow.holiday_start, rateRow.holiday_end)
        : true;

      if (holidayHit) {
        addCandidate(candidates, "HOLIDAY", holidayRate, "holiday_rate", {
          rideDate: leg.RideDate || groupedTrip.RideDate || "",
          scheduledPickupTime: leg.ScheduledPickupTime || "",
          holidayStart: rateRow.holiday_start || "",
          holidayEnd: rateRow.holiday_end || "",
        });
      }
    }

    if (isWeekend && prefix) {
      const weekendAfterHoursStart = rateRow[`${prefix}_after_hours_start`];
      const weekendAfterHoursEnd = rateRow[`${prefix}_after_hours_end`];
      const weekendAfterHoursRate =
        num(rateRow[`${prefix}_after_hours_rate`]) || weekdayAfterHoursRate;

      const weekendThirdShiftStart = rateRow[`${prefix}_third_shift_start`];
      const weekendThirdShiftEnd = rateRow[`${prefix}_third_shift_end`];
      const weekendThirdShiftRate =
        num(rateRow[`${prefix}_third_shift_rate`]) || weekdayThirdShiftRate;

      if (
        isWindowHit(pickupMinutes, weekendThirdShiftStart, weekendThirdShiftEnd) &&
        weekendThirdShiftRate > 0
      ) {
        addCandidate(candidates, "THIRD_SHIFT", weekendThirdShiftRate, `${prefix}_third_shift_rate`, {
          legId: leg.ConfirmationNumber || "",
          day: isSat ? "SATURDAY" : "SUNDAY",
          scheduledPickupTime: leg.ScheduledPickupTime || "",
          start: weekendThirdShiftStart || "",
          end: weekendThirdShiftEnd || "",
        });
      }

      if (
        isWindowHit(pickupMinutes, weekendAfterHoursStart, weekendAfterHoursEnd) &&
        weekendAfterHoursRate > 0
      ) {
        addCandidate(candidates, "AFTER_HOURS", weekendAfterHoursRate, `${prefix}_after_hours_rate`, {
          legId: leg.ConfirmationNumber || "",
          day: isSat ? "SATURDAY" : "SUNDAY",
          scheduledPickupTime: leg.ScheduledPickupTime || "",
          start: weekendAfterHoursStart || "",
          end: weekendAfterHoursEnd || "",
        });
      }

      if (!regularWeekend && weekendRate > 0) {
        addCandidate(candidates, "WEEKEND", weekendRate, "weekend_rate", {
          legId: leg.ConfirmationNumber || "",
          day: isSat ? "SATURDAY" : "SUNDAY",
          scheduledPickupTime: leg.ScheduledPickupTime || "",
          regularWeekend: false,
        });
      }
    }

    if (!isWeekend) {
      if (
        isWindowHit(pickupMinutes, rateRow.third_shift_start, rateRow.third_shift_end) &&
        weekdayThirdShiftRate > 0
      ) {
        addCandidate(candidates, "THIRD_SHIFT", weekdayThirdShiftRate, "third_shift_rate", {
          legId: leg.ConfirmationNumber || "",
          scheduledPickupTime: leg.ScheduledPickupTime || "",
          start: rateRow.third_shift_start || "",
          end: rateRow.third_shift_end || "",
        });
      }

      if (
        isWindowHit(pickupMinutes, rateRow.after_hours_start, rateRow.after_hours_end) &&
        weekdayAfterHoursRate > 0
      ) {
        addCandidate(candidates, "AFTER_HOURS", weekdayAfterHoursRate, "after_hours_rate", {
          legId: leg.ConfirmationNumber || "",
          scheduledPickupTime: leg.ScheduledPickupTime || "",
          start: rateRow.after_hours_start || "",
          end: rateRow.after_hours_end || "",
        });
      }
    }
  }

  const winner = pickHighestCandidate(candidates);

  if (winner) {
    return {
      ...winner,
      debug: {
        ...(winner.debug || {}),
        evaluatedLegs: legs.length,
        candidates,
      },
    };
  }

  return {
    kind: null,
    amount: 0,
    source: null,
    debug: {
      evaluatedLegs: legs.length,
      candidates,
    },
  };
}

module.exports = {
  computeTimeBasedCharge,
};