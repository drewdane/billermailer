const fs = require("fs");
const path = require("path");

const REVIEW_DIR = path.join(__dirname, "data", "output", "review");
const OUT_DIR = path.join(__dirname, "data", "output", "invoice_preview");

function moneyNum(v) {
  const cleaned = String(v ?? "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();
  const n = Number(cleaned || 0);
  return Number.isFinite(n) ? n : 0;
}

function computeWaitCharge(item) {
  const review = item.review || {};
  if (!review.AddWait) return 0;

  const cfg = item.waitConfig || {};
  const waitMinutes = Number(review.WaitTotalMinutes || 0);
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

function computeDeadheadCharge(item) {
  const review = item.review || {};
  if (!review.AddDeadhead) return 0;
  return Number(item.deadheadCharge || 0);
}

function applyOverrides(item, overrides) {
  const o = (overrides.overrides || {})[item.LineId];
  if (!o) return item;

  const out = { ...item };
  out.Action = o.Action ?? out.Action;
  out.Modifier = o.Modifier ?? out.Modifier;
  out.Note = o.Note ?? out.Note;
  out.MoveToAccountCode = o.MoveToAccountCode ?? out.MoveToAccountCode;

  out.review = {
    ...(out.review || {}),
    Action: o.Action ?? out.review?.Action ?? "INCLUDE",
    Modifier: o.Modifier ?? out.review?.Modifier ?? "NONE",
    Note: o.Note ?? out.review?.Note ?? "",
    MoveToAccountCode: o.MoveToAccountCode ?? out.review?.MoveToAccountCode ?? "",
    AddHazmat: !!o.AddHazmat,
    AddO2: !!o.AddO2,
    AddBari: !!o.AddBari,
    AddDeadhead: !!o.AddDeadhead,
    AddWait: !!o.AddWait,
    WaitTotalMinutes: Number(o.WaitTotalMinutes || 0),
    MatchToQuote: !!o.MatchToQuote,
    QuoteAmount: Number(o.QuoteAmount || 0),
  };

  return out;
}

function transportDescription(item) {
  const rider = [item.FirstName || "", item.LastName || ""].join(" ").trim();
  const dob = item.DOB ? ` (${item.DOB})` : "";
  const mobility = item.Mobility || "";
  const shape =
    item.TripShape === "ROUND_TRIP" ? "Round Trip" :
    item.TripShape === "MULTI_STOP" ? "Multi-Stop" :
    "1-Way";
  const pickup = item.PickupName || "";
  const dropoff = item.DropoffName || "";
  const date = item.RideDate || item.RideDateISO || "";

  return `Transport ${rider}${dob} ${mobility} ${shape} from ${pickup} to ${dropoff} ${date}`.trim();
}

function line(desc, amount) {
  return { Description: desc, Amount: Number(amount || 0).toFixed(2) };
}

function buildLines(item) {
  const lines = [];
  const review = item.review || {};

  if ((item.Action || "INCLUDE") === "EXCLUDE") return lines;

  if (review.MatchToQuote) {
    lines.push(line(`${transportDescription(item)} (Match to Quote)`, review.QuoteAmount || 0));
    return lines;
  }

  const base = Number(item.pricing?.base || 0);
  const mileage = Number(item.pricing?.mileage || 0);
  const cancelFee = Number(item.pricing?.cancelFee || 0);
  const miles = item.DirectMileage || "";

  if (base) lines.push(line(transportDescription(item), base));
  if (mileage) lines.push(line(`${miles} miles`, mileage));
  if (cancelFee) lines.push(line("Cancel Fee", cancelFee));

  if (review.AddHazmat) {
    lines.push(line("Hazmat", Number(item.availableCharges?.hazmat || 0)));
  }

  if (review.AddO2) {
    lines.push(line("Oxygen", Number(item.availableCharges?.o2 || 0)));
  }

  if (review.AddBari) {
    lines.push(line("Bariatric", Number(item.availableCharges?.bari || 0)));
  }

  if (review.AddDeadhead) {
    lines.push(line("Deadhead", computeDeadheadCharge(item)));
  }

  if (review.AddWait) {
    lines.push(line("Wait Time", computeWaitCharge(item)));
  }

  return lines;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(filePath, rows) {
  const lines = [];
  lines.push("Description,Amount");
  for (const row of rows) {
    lines.push([csvEscape(row.Description), csvEscape(row.Amount)].join(","));
  }
  fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");
}

function sanitize(name) {
  return String(name || "unknown").replace(/[<>:"/\\|?*]+/g, "_").trim();
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name === "items.json") out.push(p);
  }
  return out;
}

function main() {
  if (!fs.existsSync(REVIEW_DIR)) {
    console.error("Review folder not found:", REVIEW_DIR);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const itemFiles = walk(REVIEW_DIR);
  if (!itemFiles.length) {
    console.error("No items.json files found under:", REVIEW_DIR);
    process.exit(1);
  }

  let written = 0;

  for (const itemsPath of itemFiles) {
    const dir = path.dirname(itemsPath);
    const overridesPath = path.join(dir, "overrides.json");

    const items = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
    const overrides = fs.existsSync(overridesPath)
      ? JSON.parse(fs.readFileSync(overridesPath, "utf8"))
      : { invoiceType: "single", overrides: {} };

    const reviewed = items.map((it) => applyOverrides(it, overrides));
    const included = reviewed.filter((it) => (it.Action || "INCLUDE") !== "EXCLUDE");

    if (!included.length) continue;

    const acct = sanitize(included[0].AccountCode || path.basename(path.dirname(dir)));
    const period = sanitize(path.basename(dir));
    const invoiceType = overrides.invoiceType || "single";

    if (invoiceType === "trip") {
      const tripDir = path.join(OUT_DIR, `${acct}__${period}__trip_invoices`);
      fs.mkdirSync(tripDir, { recursive: true });

      for (const item of included) {
        const lines = buildLines(item);
        const rider = sanitize(`${item.FirstName || ""}_${item.LastName || ""}`.trim() || item.LineId);
        const outPath = path.join(tripDir, `${rider}__${sanitize(item.LineId)}.csv`);
        writeCsv(outPath, lines);
        written++;
      }
    } else {
      const allLines = [];
      for (const item of included) {
        allLines.push(...buildLines(item));
      }
      const outPath = path.join(OUT_DIR, `${acct}__${period}.csv`);
      writeCsv(outPath, allLines);
      written++;
    }
  }

  console.log("Invoice preview export complete.");
  console.log("Output folder:", OUT_DIR);
  console.log("Files written:", written);
}

main();