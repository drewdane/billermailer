function applyOverrideToItem(item, o = {}) {
  item.Action = o.Action ?? item.Action;
  item.Modifier = o.Modifier ?? item.Modifier;
  item.Note = o.Note ?? item.Note;
  item.MoveToAccountCode = o.MoveToAccountCode ?? item.MoveToAccountCode;

  if (!item.review) item.review = {};

  item.review.ClassOverride = o.ClassOverride || "";
  item.review.Action = o.Action ?? item.review.Action ?? "INCLUDE";
  item.review.Modifier = o.Modifier ?? item.review.Modifier ?? "NONE";
  item.review.Note = o.Note ?? item.review.Note ?? "";
  item.review.MoveToAccountCode = o.MoveToAccountCode ?? item.review.MoveToAccountCode ?? "";

  item.review.SplitTrip = !!o.SplitTrip;
  item.review.MergeGroupId = o.MergeGroupId || "";
  item.review.MergeShape = o.MergeShape || "";

  item.review.AddHazmat = !!o.AddHazmat;
  item.review.AddO2 = !!o.AddO2;
  item.review.AddBari = !!o.AddBari;
  item.review.AddAfterHours = !!o.AddAfterHours;
  item.review.AddThirdShift = !!o.AddThirdShift;
  item.review.AddWeekend = !!o.AddWeekend;
  item.review.AddHoliday = !!o.AddHoliday;

  item.review.AddDeadhead = !!o.AddDeadhead;
  item.review.DeadheadMiles = Number(o.DeadheadMiles || 0);

  item.review.PoNumberOverride = o.PoNumberOverride || "";
  item.review.AddWait = !!o.AddWait;
  item.review.WaitTotalMinutes = Number(o.WaitTotalMinutes || 0);

  item.review.MatchToQuote = !!o.MatchToQuote;
  item.review.QuoteAmount = Number(o.QuoteAmount || 0);

  item.review.AddNeedWC =
    typeof o.AddNeedWC === "boolean" ? o.AddNeedWC : item.review.AddNeedWC;

  item.review.AddRECL =
    typeof o.AddRECL === "boolean" ? o.AddRECL : item.review.AddRECL;

  item.review.CancelOverride = o.CancelOverride || item.review.CancelOverride || "AUTO";

  item.review.NoCharge =
    typeof o.NoCharge === "boolean" ? o.NoCharge : !!item.review.NoCharge;

  item.review.TripTypeOverride = o.TripTypeOverride || "";

  item.review.MileageOverride = Number.isFinite(Number(o.MileageOverride))
    ? Number(o.MileageOverride)
    : Number(item.DirectMileage || 0);

  item.review.ActualPickupTimeOverride = o.ActualPickupTimeOverride || "";
  item.review.ActualDropoffTimeOverride = o.ActualDropoffTimeOverride || "";

  item.review.FirstNameOverride = o.FirstNameOverride || "";
  item.review.LastNameOverride = o.LastNameOverride || "";

  item.review.PickupNameOverride = o.PickupNameOverride || "";
  item.review.PickupAddress1Override = o.PickupAddress1Override || "";
  item.review.DropoffNameOverride = o.DropoffNameOverride || "";
  item.review.DropoffAddress1Override = o.DropoffAddress1Override || "";

  item.review.MraNumberOverride = o.MraNumberOverride || "";
  item.review.InvoiceSplitOverride = o.InvoiceSplitOverride || "AUTO";
}

window.applyOverrideToItem = applyOverrideToItem;