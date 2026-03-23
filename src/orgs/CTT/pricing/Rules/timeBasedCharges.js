function num(v) {
  if (v === null || v === undefined) return 0;

  const s = String(v)
    .trim()
    .replace(/\$/g, "")
    .replace(/,/g, "");

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
  return hh * 60 + mm;
}

function isWindowHit(minutes, startRaw, endRaw) {
  const start = parseTimeToMinutes(startRaw);
  const end = parseTimeToMinutes(endRaw);
  if (minutes == null || start == null || end == null) return false;

  // SAME-DAY window (e.g. 17:00 → 22:00)
  if (start < end) {
    return minutes >= start && minutes < end;
  }

  // OVERNIGHT window (e.g. 20:00 → 08:00)
  return minutes >= start || minutes < end;
}

function parseRideDate(rideDateRaw) {
  const s = String(rideDateRaw || "").trim();
  const datePart = s.split(" ")[0];
  const m = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);

  return new Date(year, month - 1, day);
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

  // Fixed-date holidays
  if (isSameMonthDay(dateObj, 0, 1)) return true;   // New Year's Day
  if (isSameMonthDay(dateObj, 6, 4)) return true;   // Independence Day
  if (isSameMonthDay(dateObj, 10, 11)) return true; // Veteran's Day
  if (isSameMonthDay(dateObj, 11, 25)) return true; // Christmas Day

  // Memorial Day = last Monday in May
  const memorial = lastWeekdayOfMonth(year, 4, 1);
  if (memorial && memorial.toDateString() === dateObj.toDateString()) return true;

  // Labor Day = first Monday in September
  const labor = nthWeekdayOfMonth(year, 8, 1, 1);
  if (labor && labor.toDateString() === dateObj.toDateString()) return true;

  // Thanksgiving = fourth Thursday in November
  const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4);
  if (thanksgiving && thanksgiving.toDateString() === dateObj.toDateString()) return true;

  return false;
}

function getFirstScheduledPickup(groupedTrip) {
  const legs = Array.isArray(groupedTrip.legs) && groupedTrip.legs.length
    ? groupedTrip.legs
    : [groupedTrip];

  const sorted = [...legs].sort((a, b) =>
    String(a.ScheduledPickupTime || "").localeCompare(String(b.ScheduledPickupTime || ""))
  );

  return sorted[0] || groupedTrip;
}

function computeTimeBasedCharge(groupedTrip, rateRow = {}) {
    const firstLeg = getFirstScheduledPickup(groupedTrip);
    const rideDate = parseRideDate(firstLeg.RideDate || groupedTrip.RideDate);
    const pickupMinutes = parseTimeToMinutes(firstLeg.ScheduledPickupTime);

    const day = rideDate ? rideDate.getDay() : null; // 0=sun, 6=sat

    const weekendRate = num(rateRow.weekend_rate);
    const holidayRate = num(rateRow.holiday_rate);
    const thirdShiftRate = num(rateRow.third_shift_rate);
    const afterHoursRate = num(rateRow.after_hours_rate);

    const afterHoursHit = isWindowHit(
        pickupMinutes,
        rateRow.after_hours_start,
        rateRow.after_hours_end
    );

    const thirdShiftHit = isWindowHit(
        pickupMinutes,
        rateRow.third_shift_start,
        rateRow.third_shift_end
    );

  // 1) HOLIDAY
  if (isHoliday(rideDate) && holidayRate > 0) {
    return {
      kind: "HOLIDAY",
      amount: holidayRate,
      source: "holiday_rate",
      debug: {
        scheduledPickupTime: firstLeg.ScheduledPickupTime || "",
        rideDate: firstLeg.RideDate || groupedTrip.RideDate || "",
      },
    };
  }

  // 2) WEEKEND
  if (day === 6) {
    const regularSat = hasY(rateRow.regular_includes_saturday);

    if (!regularSat && weekendRate > 0) {
      return {
        kind: "WEEKEND",
        amount: weekendRate,
        source: "weekend_rate",
        debug: {
          day: "SATURDAY",
          regularIncludesSaturday: false,
          afterHoursHit,
        },
      };
    }

    if (regularSat && afterHoursHit && weekendRate > 0) {
      return {
        kind: "WEEKEND",
        amount: weekendRate,
        source: "weekend_rate",
        debug: {
          day: "SATURDAY",
          regularIncludesSaturday: true,
          afterHoursHit,
        },
      };
    }
  }

  if (day === 0) {
    const regularSun = hasY(rateRow.regular_includes_sunday);

    if (!regularSun && weekendRate > 0) {
      return {
        kind: "WEEKEND",
        amount: weekendRate,
        source: "weekend_rate",
        debug: {
          day: "SUNDAY",
          regularIncludesSunday: false,
          afterHoursHit,
        },
      };
    }

    if (regularSun && afterHoursHit && weekendRate > 0) {
      return {
        kind: "WEEKEND",
        amount: weekendRate,
        source: "weekend_rate",
        debug: {
          day: "SUNDAY",
          regularIncludesSunday: true,
          afterHoursHit,
        },
      };
    }
  }

  // 3) THIRD SHIFT
  if (thirdShiftHit && thirdShiftRate > 0) {
    return {
      kind: "THIRD_SHIFT",
      amount: thirdShiftRate,
      source: "third_shift_rate",
      debug: {
        scheduledPickupTime: firstLeg.ScheduledPickupTime || "",
        thirdShiftHit,
      },
    };
  }

  // 4) AFTER HOURS
  if (afterHoursHit && afterHoursRate > 0) {
    return {
      kind: "AFTER_HOURS",
      amount: afterHoursRate,
      source: "after_hours_rate",
      debug: {
        scheduledPickupTime: firstLeg.ScheduledPickupTime || "",
        afterHoursHit,
      },
    };
  }

  return {
    kind: null,
    amount: 0,
    source: null,
    debug: {
      scheduledPickupTime: firstLeg.ScheduledPickupTime || "",
      rideDate: firstLeg.RideDate || groupedTrip.RideDate || "",
      afterHoursHit,
      thirdShiftHit,
      day,
    },
  };
}

module.exports = {
  computeTimeBasedCharge,
};