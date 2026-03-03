// src/pricing/parseTime.js

function parseTmTime(s) {
  if (!s) return null;
  const d = new Date(String(s));
  return Number.isFinite(d.getTime()) ? d : null;
}

function minutesBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return null;
  const mins = Math.round(ms / 60000);
  return mins > 0 ? mins : null;
}

// Transport time: ActualPickupTime -> ActualDropoffTime
function parseHMS(hms) {
  // "HH:MM:SS"
  if (!hms) return null;
  const m = String(hms).trim().match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]), ss = Number(m[3]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  return hh * 60 + mm + (ss >= 30 ? 1 : 0); // round seconds to nearest minute
}

function getTransportMinutes(trip) {
  // 1) Prefer DirectDriveDuration if available
  const dd = parseHMS(trip.DirectDriveDuration);
  if (dd != null && dd > 0) return dd;

  // 2) Then RideHours (x.xxxx hours)
  const rh = Number(trip.RideHours);
  if (Number.isFinite(rh) && rh > 0) return Math.round(rh * 60);

  // 3) Then actual timestamps
  const ap = parseTmTime(trip.ActualPickupTime);
  const ad = parseTmTime(trip.ActualDropoffTime);
  if (ap && ad) {
    const m = minutesBetween(ap, ad);
    if (m != null) return m;
  }

  // fallback: arrival times (optional)
  const pa = parseTmTime(trip.PickupArrivalTime);
  const da = parseTmTime(trip.DropoffArrivalTime);
  if (pa && da) {
    const m = minutesBetween(pa, da);
    if (m != null) return m;
  }

  // fallback: scheduled (optional)
  const sp = parseTmTime(trip.ScheduledPickupTime);
  const sd = parseTmTime(trip.ScheduledDropoffTime);
  if (sp && sd) {
    const m = minutesBetween(sp, sd);
    if (m != null) return m;
  }

  return null;
}

// Wait at pickup: PickupArrivalTime -> ActualPickupTime (departing / transporting start)
function getPickupWaitMinutes(trip, graceMinutes = 30) {
  const arrive = parseTmTime(trip.PickupArrivalTime);
  const depart = parseTmTime(trip.ActualPickupTime);
  if (!arrive || !depart) return { raw: null, billable: 0, status: "missing_times" };

  const raw = minutesBetween(arrive, depart);
  if (raw == null) return { raw: null, billable: 0, status: "bad_times" };

  const grace = Number.isFinite(Number(graceMinutes)) ? Number(graceMinutes) : 30;
  const billable = Math.max(0, raw - grace);

  // cap flag (optional)
  const status = raw > 360 ? "suspiciously_large" : "ok";

  return { raw, billable, status };
}

module.exports = {
  parseTmTime,
  getTransportMinutes,
  getPickupWaitMinutes
};