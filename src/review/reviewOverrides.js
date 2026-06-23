function scrubStaleTimeChargeOverride(o = {}) {
  const out = { ...o };

  if (!out.TimeChargeManual) {
    delete out.AddAfterHours;
    delete out.AddThirdShift;
    delete out.AddWeekend;
    delete out.AddHoliday;
  }

  return out;
}

function ensureReview(row) {
  if (!row.review) row.review = {};
  return row.review;
}

function applyOverrideToItem(item, rawOverride = {}) {
  const o = scrubStaleTimeChargeOverride(rawOverride);
  const review = ensureReview(item);

  item.Action = o.Action ?? item.Action;
  item.Modifier = o.Modifier ?? item.Modifier;
  item.Note = o.Note ?? item.Note;
  item.MoveToAccountCode = o.MoveToAccountCode ?? item.MoveToAccountCode;

  review.ClassOverride = o.ClassOverride || "";
  review.Action = o.Action ?? review.Action ?? "INCLUDE";
  review.Modifier = o.Modifier ?? review.Modifier ?? "NONE";
  review.Note = o.Note ?? review.Note ?? "";
  review.MoveToAccountCode = o.MoveToAccountCode ?? review.MoveToAccountCode ?? "";

  review.SplitTrip = !!o.SplitTrip;
  review.MergeGroupId = o.MergeGroupId || "";
  review.MergeShape = o.MergeShape || "";

  review.AddNeedWC = typeof o.AddNeedWC === "boolean" ? o.AddNeedWC : review.AddNeedWC;
  review.AddRECL = typeof o.AddRECL === "boolean" ? o.AddRECL : review.AddRECL;
  review.AddHazmat = !!o.AddHazmat;
  review.AddO2 = !!o.AddO2;
  review.AddBari = !!o.AddBari;

  review.TimeChargeManual = !!o.TimeChargeManual;
  review.AddAfterHours = !!o.AddAfterHours;
  review.AddThirdShift = !!o.AddThirdShift;
  review.AddWeekend = !!o.AddWeekend;
  review.AddHoliday = !!o.AddHoliday;

  review.AddDeadhead = !!o.AddDeadhead;
  review.DeadheadMiles = Number(o.DeadheadMiles || 0);

  review.PoNumberOverride = o.PoNumberOverride || "";
  review.AddWait = !!o.AddWait;
  review.WaitTotalMinutes = Number(o.WaitTotalMinutes || 0);

  review.CancelOverride = o.CancelOverride || review.CancelOverride || "AUTO";
  review.NoCharge = typeof o.NoCharge === "boolean" ? o.NoCharge : !!review.NoCharge;

  review.MatchToQuote = !!o.MatchToQuote;
  review.QuoteAmount = Number(o.QuoteAmount || 0);

  review.TripTypeOverride = o.TripTypeOverride || "";
  review.MileageOverride = Number.isFinite(Number(o.MileageOverride))
    ? Number(o.MileageOverride)
    : Number(item.DirectMileage || 0);

  review.ActualPickupTimeOverride = o.ActualPickupTimeOverride || "";
  review.ActualDropoffTimeOverride = o.ActualDropoffTimeOverride || "";

  review.PickupNameOverride = o.PickupNameOverride || "";
  review.PickupAddress1Override = o.PickupAddress1Override || "";
  review.DropoffNameOverride = o.DropoffNameOverride || "";
  review.DropoffAddress1Override = o.DropoffAddress1Override || "";

  review.MraNumberOverride = o.MraNumberOverride || "";
  review.InvoiceSplitOverride = o.InvoiceSplitOverride || "AUTO";

  return item;
}

function applyOverridesToItems(items = [], overridesDoc = {}) {
  const overrides = overridesDoc.overrides || {};

  for (const item of items) {
    const o = overrides[item.LineId];
    if (!o) continue;
    applyOverrideToItem(item, o);
  }

  return items;
}

function serializeReviewOverride(row) {
  const review = row.review || {};

  return {
    Action: row.Action,
    Modifier: row.Modifier,
    Note: row.Note,
    MoveToAccountCode: review.MoveToAccountCode || "",

    SplitTrip: !!review.SplitTrip,
    MergeGroupId: review.MergeGroupId || "",
    MergeShape: review.MergeShape || "",

    ClassOverride: review.ClassOverride || "",

    AddNeedWC: !!review.AddNeedWC,
    AddRECL: !!review.AddRECL,
    AddHazmat: !!review.AddHazmat,
    AddO2: !!review.AddO2,
    AddBari: !!review.AddBari,

    TimeChargeManual: !!review.TimeChargeManual,
    AddAfterHours: !!review.AddAfterHours,
    AddThirdShift: !!review.AddThirdShift,
    AddWeekend: !!review.AddWeekend,
    AddHoliday: !!review.AddHoliday,

    AddDeadhead: !!review.AddDeadhead,
    DeadheadMiles: Number(review.DeadheadMiles || 0),

    PoNumberOverride: review.PoNumberOverride || "",

    AddWait: !!review.AddWait,
    WaitTotalMinutes: Number(review.WaitTotalMinutes || 0),

    CancelOverride: review.CancelOverride || "AUTO",
    NoCharge: !!review.NoCharge,

    MatchToQuote: !!review.MatchToQuote,
    QuoteAmount: Number(review.QuoteAmount || 0),

    TripTypeOverride: review.TripTypeOverride || "",
    MileageOverride: Number(review.MileageOverride || row.DirectMileage || 0),

    ActualPickupTimeOverride: review.ActualPickupTimeOverride || "",
    ActualDropoffTimeOverride: review.ActualDropoffTimeOverride || "",

    MraNumberOverride: review.MraNumberOverride || "",
    InvoiceSplitOverride: review.InvoiceSplitOverride || "AUTO",

    PickupNameOverride: review.PickupNameOverride || "",
    PickupAddress1Override: review.PickupAddress1Override || "",
    DropoffNameOverride: review.DropoffNameOverride || "",
    DropoffAddress1Override: review.DropoffAddress1Override || "",
  };
}

function serializeReviewOverrides(items = []) {
  const overrides = {};

  for (const row of items) {
    overrides[row.LineId] = serializeReviewOverride(row);
  }

  return overrides;
}

module.exports = {
  scrubStaleTimeChargeOverride,
  applyOverrideToItem,
  applyOverridesToItems,
  serializeReviewOverride,
  serializeReviewOverrides,
};