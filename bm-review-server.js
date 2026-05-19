// bm-review-server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { setLocationAlias , getLocationAlias } = require("./src/orgs/CTT/locationAliases");

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const baseDir = path.resolve(process.cwd(), arg("--dir", "data\\output\\review"));
const reviewConfigPath = path.join(baseDir, "config.json");

function readReviewConfig() {
  if (!fs.existsSync(reviewConfigPath)) return {};
  return readJson(reviewConfigPath);
}

function writeReviewConfigPatch(patch) {
  const current = readReviewConfig();
  writeJson(reviewConfigPath, {
    ...current,
    ...patch
  });
}
const batchExportDir = path.join(baseDir, "_batch_exports");
fs.mkdirSync(batchExportDir, { recursive: true });

function send(res, code, body, contentType = "application/json") {
  res.writeHead(code, { "Content-Type": contentType });
  res.end(body);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function safeJoin(...parts) {
  const joined = path.resolve(baseDir, ...parts);
  if (!joined.startsWith(baseDir)) throw new Error("Invalid path");
  return joined;
}

function applyLocationAliasToPlace(name, address1) {
  const alias = getLocationAlias(name, address1);

  return {
    name: alias?.name || name || "",
    address1: alias?.address1 || address1 || ""
  };
}

function applyLocationAliasesToRow(row) {
  const pu = applyLocationAliasToPlace(row.PickupName, row.PickupAddress1);
  const drop = applyLocationAliasToPlace(row.DropoffName, row.DropoffAddress1);

  row.PickupName = pu.name;
  row.PickupAddress1 = pu.address1;
  row.DropoffName = drop.name;
  row.DropoffAddress1 = drop.address1;

  if (Array.isArray(row.legs)) {
    for (const leg of row.legs) {
      const legPu = applyLocationAliasToPlace(leg.PickupName, leg.PickupAddress1);
      const legDrop = applyLocationAliasToPlace(leg.DropoffName, leg.DropoffAddress1);

      leg.PickupName = legPu.name;
      leg.PickupAddress1 = legPu.address1;
      leg.DropoffName = legDrop.name;
      leg.DropoffAddress1 = legDrop.address1;
    }
  }

  return row;
}

const HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>BM Review</title>
  <style>
    body{
      font-family:system-ui,Segoe UI,Arial;
      margin:0;
      display:flex;
      height:100vh;
      background:#fafbff;
      color:#111827;
    }

    #left{
      width:340px;
      border-right:1px solid #d6d8ea;
      padding:12px;
      overflow:auto;
      background:#e4e4f0;
    }

    #main{
      flex:1;
      padding:12px;
      overflow:auto;
      background:#fafbff;
    }

        #mainHeader{
      position:sticky;
      top:0;
      z-index:5;
      background:#fafbff;
      padding-bottom:10px;
      border-bottom:1px solid #d6d8ea;
    }

    .toolbar{
      display:flex;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
      margin-top:8px;
    }

    .globalbar{
      display:flex;
      align-items:center;
      gap:12px;
      flex-wrap:wrap;
      margin-top:8px;
      padding:8px 0;
    }

    .globalbar input[type="date"]{
      padding:7px 10px;
      border:1px solid #d6d8ea;
      border-radius:10px;
      background:#fff;
    }

    .toolbar input[type="text"],
    .toolbar input:not([type]),
    .toolbar select{
      padding:7px 10px;
      border:1px solid #d6d8ea;
      border-radius:10px;
      background:#fff;
    }

    .fac{
      padding:8px;
      border:1px solid #d6d8ea;
      border-radius:10px;
      margin:8px 0;
      background:#ffffff;
      box-shadow:0 1px 2px rgba(0,0,0,0.04);
    }

    .pill{
      display:inline-block;
      padding:2px 6px;
      border-radius:6px;
      background:#e4e4f0;
      font-size:12px;
      color:#64748b;
    }

    table{
      width:100%;
      border-collapse:collapse;
    }

    th,td{
      border-bottom:1px solid #e4e4f0;
      padding:6px 8px;
      vertical-align:top;
    }

    th{
      position:sticky;
      top:96px;
      background:#e4e4f0;
      z-index:2;
      font-weight:600;
    }

    tr:hover{
      background:#f1f2fb;
    }

    .row-exclude td{
      text-decoration:line-through;
      color:#64748b;
      background:#f3f4fa;
    }

    button{
      padding:6px 10px;
      border:1px solid #d6d8ea;
      border-radius:8px;
      background:#ffffff;
      cursor:pointer;
    }

    button:hover{
      background:#f1f2fb;
    }

    input[type="number"]{
      border:1px solid #d6d8ea;
      border-radius:6px;
      padding:2px 4px;
    }

    input[type="checkbox"]{
      transform:scale(1.1);
    }
  </style>
</head>
<body>
  <div id="left">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <h3 style="margin:6px 0">Facilities</h3>
    </div>

    <div style="margin:8px 0 12px 0">
      <label style="display:flex;align-items:center;gap:6px;color:#374151">
        <input type="checkbox" id="selectAllReviewed" onchange="toggleAllReviewed(this.checked)" />
        <span>Select all reviewed</span>
      </label>
    </div>

    <div id="facList">Loading…</div>
  </div>
    <div id="main">
      <div id="mainHeader">
        <h2 style="margin:6px 0">BM Review</h2>

        <div id="status" style="color:#666;margin-bottom:8px">Select a facility + period.</div>

        <div class="globalbar" id="globalBar">
          <label style="display:flex;align-items:center;gap:6px;color:#374151">
            <input type="checkbox" id="fuelToggle" onchange="updateFuelGlobals()" />
            <span>Fuel SC</span>
          </label>

          <label style="display:flex;align-items:center;gap:6px;color:#374151">
            <span>From</span>
            <input type="date" id="fuelStart" onchange="updateFuelGlobals()" />
          </label>

          <label style="display:flex;align-items:center;gap:6px;color:#374151">
            <span>To</span>
            <input type="date" id="fuelEnd" onchange="updateFuelGlobals()" />
          </label>
          <button type="button" onclick="addFuelWindowRow()">Add another period</button>
          <div id="fuelExtraWindows" style="display:flex;flex-direction:column;gap:6px;width:100%;margin-left:84px"></div>
        </div>

        <div class="toolbar" id="toolbar" style="display:none">
          <input
            id="search"
            placeholder="Search…"
            oninput="renderRows()"
            style="min-width:240px"
          />

          <button onclick="mergeSelectedTrips()">Merge selected</button>

          <label style="display:flex;align-items:center;gap:6px;color:#374151">
            <span>Output</span>
            <select id="deliveryFormat">
              <option value="qbo">QBO</option>
              <option value="pdf">PDF</option>
            </select>
          </label>

          <button onclick="save()">Save</button>
          <button onclick="runBatchExport()">Batch Export</button>
          <span id="saveMsg" style="color:#666"></span>
        </div>
      </div>

      <div id="tableWrap"></div>
  </div>

<script src="/preReviewSuggestions.js"></script>
<script src="/cleanLocationName.js"></script>
<script src="/renderRows.js"></script>
<script>
let INDEX=null;
let current = { acct:null, period:null };
let ITEMS=[];
let OVERRIDES={ invoiceType:"single", deliveryFormat:"qbo", reviewed:false, reviewedAt:null, overrides:{} };
let REVIEW_CONFIG = {};
let DIRTY = false;
let BATCH_SELECTED = {};
window.BM_ACCOUNT_CODES = [];

window.BM_GLOBALS = {
  fuelSurchargeEnabled: false,
  fuelSurchargeStart: "",
  fuelSurchargeEnd: ""
};

function getFuelWindowsFromUi() {
  const windows = [];

  const start = document.getElementById("fuelStart")?.value || "";
  const end = document.getElementById("fuelEnd")?.value || "";

  if (start || end) {
    windows.push({ start, end });
  }

  document.querySelectorAll("[data-fuel-window-row]").forEach((row) => {
    const s = row.querySelector("[data-fuel-start]")?.value || "";
    const e = row.querySelector("[data-fuel-end]")?.value || "";

    if (s || e) {
      windows.push({ start: s, end: e });
    }
  });

  return windows;
}

function updateFuelGlobals() {
  const enabled = document.getElementById("fuelToggle")?.checked;

  window.BM_GLOBALS = {
    fuelSurchargeEnabled: !!enabled,
    fuelSurchargeStart: document.getElementById("fuelStart")?.value || "",
    fuelSurchargeEnd: document.getElementById("fuelEnd")?.value || "",
    fuelSurchargeWindows: getFuelWindowsFromUi()
  };

  renderRows();
  if (window.markDirty) window.markDirty();
  fetch("/api/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(window.BM_GLOBALS)
  }).catch(err => console.error("Failed to save FSC config", err));
}

function addFuelWindowRow(start = "", end = "", shouldUpdate = true) {
  const wrap = document.getElementById("fuelExtraWindows");
  if (!wrap) return;

  const row = document.createElement("div");
  row.dataset.fuelWindowRow = "1";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";

  row.innerHTML =
    "<span>From</span>" +
    "<input type='date' data-fuel-start value='" + esc(start) + "' />" +
    "<span>To</span>" +
    "<input type='date' data-fuel-end value='" + esc(end) + "' />" +
    "<button type='button' data-remove-fuel-window>Remove</button>";

  row.querySelector("[data-fuel-start]").onchange = updateFuelGlobals;
  row.querySelector("[data-fuel-end]").onchange = updateFuelGlobals;

  row.querySelector("[data-remove-fuel-window]").onclick = () => {
    row.remove();
    updateFuelGlobals();
  };

  wrap.appendChild(row);
  if (shouldUpdate) updateFuelGlobals();
}

function esc(s){ return String(s??"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

function markDirty() {
  DIRTY = true;
  renderFacilityReviewState();
}

function renderFacilityReviewState() {
  if (!INDEX || !current.acct || !current.period) return;

  const link = document.querySelector(
    'a[data-acct="' + current.acct + '"][data-period="' + current.period + '"]'
  );
  if (!link) return;

  const row = link.parentElement;
  const card = row?.parentElement;
  if (!row || !card) return;

  let pill = row.querySelector(".review-state-pill");
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "pill review-state-pill";
    pill.style.marginLeft = "6px";
    row.appendChild(pill);
  }

  if (DIRTY) {
    pill.textContent = "Unsaved Changes";
    pill.style.background = "#fee2e2";
    pill.style.color = "#991b1b";
    card.style.background = "#fff7ed";
  } else if (OVERRIDES.reviewed) {
    pill.textContent = "Reviewed";
    pill.style.background = "#dcfce7";
    pill.style.color = "#166534";
    card.style.background = "#f0fdf4";
  } else {
    pill.textContent = "";
    pill.style.background = "";
    pill.style.color = "";
    card.style.background = "";
  }
}

window.markDirty = markDirty;

async function loadReviewConfig() {
  try {
    REVIEW_CONFIG = await (await fetch("/api/config")).json();
  } catch (err) {
    console.error("Failed to load review config", err);
  }
}

async function runExport() {
  if (!current.acct || !current.period) return;

  const invoiceType = document.getElementById("invoiceType").value || "single";
  const deliveryFormat = document.getElementById("deliveryFormat").value || "qbo";

  if (deliveryFormat !== "qbo") {
    alert("PDF export not implemented yet");
    return;
  }

  const exportUrl =
    "/api/export-qbo?acct=" +
    encodeURIComponent(current.acct) +
    "&period=" +
    encodeURIComponent(current.period) +
    "&invoiceType=" +
    encodeURIComponent(invoiceType);

  window.location.href = exportUrl;
}

function setBatchSelected(acct, period, checked) {
  const key = acct + "||" + period;
  if (checked) BATCH_SELECTED[key] = true;
  else delete BATCH_SELECTED[key];
}

function isBatchSelected(acct, period) {
  return !!BATCH_SELECTED[acct + "||" + period];
}

function toggleAllReviewed(checked) {
  if (!INDEX || !INDEX.facilities) return;

  if (!checked) {
    BATCH_SELECTED = {};
    loadIndex();
    return;
  }

  const next = {};
  for (const acct of Object.keys(INDEX.facilities || {})) {
    const fac = INDEX.facilities[acct];
    for (const period of Object.keys(fac.periods || {})) {
      const meta = fac.periods[period] || {};
      if (meta.reviewed) {
        next[acct + "||" + period] = true;
      }
    }
  }

  BATCH_SELECTED = next;
  loadIndex();
}

async function runBatchExport() {
  const selected = Object.keys(BATCH_SELECTED).map((key) => {
    const [acct, period] = key.split("||");
    return { acct, period };
  });

  if (!selected.length) {
    alert("Select at least one reviewed facility.");
    return;
  }

  const resp = await fetch("/api/export-qbo-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected })
  });

  const data = await resp.json();

  if (!resp.ok) {
    alert(data?.error || "Batch export failed");
    return;
  }

  if (!Array.isArray(data.files) || !data.files.length) {
    alert("No export files were generated.");
    return;
  }

  for (const file of data.files) {
    window.open(file.url, "_blank");
  }
}

async function loadAccountCodes(){
  try {
    const resp = await fetch("/api/accounts");
    const data = await resp.json();
    window.BM_ACCOUNT_CODES = Array.isArray(data.accounts) ? data.accounts : [];
  } catch (err) {
    console.error("Failed to load account codes", err);
    window.BM_ACCOUNT_CODES = [];
  }
}

async function loadIndex(){
  const facList = document.getElementById("facList");
  facList.textContent = "Loading…";
  await loadAccountCodes();

  try{
    const resp = await fetch("/api/index");
    const txt = await resp.text();
    if(!resp.ok){
      facList.innerHTML = "<div style='color:#b00'><b>Failed to load index</b><div style='margin-top:6px;white-space:pre-wrap'>"+esc(txt)+"</div></div>";
      return;
    }
    INDEX = JSON.parse(txt);

    facList.innerHTML = "";
    const keys = Object.keys(INDEX.facilities || {}).sort();
    if(!keys.length){
      facList.innerHTML = "<div style='color:#b00'><b>No facilities found</b><div style='margin-top:6px'>Index loaded but facilities is empty.</div></div>";
      return;
    }

    for(const acct of keys){
      const f = INDEX.facilities[acct];
      const div = document.createElement("div");
      div.className="fac";

      const title = document.createElement("div");
      title.innerHTML = "<b>"+esc(acct)+"</b><div style='color:#666'>"+esc(f.AccountName||"")+"</div>";
      div.appendChild(title);

      const periods = Object.keys(f.periods || {}).sort();
      for(const p of periods){
        const row = document.createElement("div");
        row.style.marginTop = "6px";

        const a = document.createElement("a");
        a.href = "#";
        a.textContent = p;
        a.dataset.acct = acct;
        a.dataset.period = p;
        a.onclick = (e) => {
          e.preventDefault();
          openSet(a.dataset.acct, a.dataset.period);
        };

        const meta = f.periods[p] || {};

        const tripPill = document.createElement("span");
        tripPill.className = "pill";
        tripPill.textContent = (meta.count || 0) + " trips";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.style.marginLeft = "8px";
        cb.checked = isBatchSelected(acct, p);
        cb.disabled = !meta.reviewed;
        cb.onchange = () => {
          setBatchSelected(acct, p, cb.checked);
        };

        row.appendChild(a);
        row.appendChild(document.createTextNode(" "));
        row.appendChild(tripPill);
        row.appendChild(cb);

        div.appendChild(row);
      }

      facList.appendChild(div);
    }
  }catch(e){
    facList.innerHTML = "<div style='color:#b00'><b>Failed to load index</b><div style='margin-top:6px;white-space:pre-wrap'>"+esc(e.message||String(e))+"</div></div>";
  }
}

async function openSet(acct, period){
  current = { acct, period };
  DIRTY = false;
  document.getElementById("status").textContent = acct + " / " + period;
  document.getElementById("toolbar").style.display = "flex";
  document.getElementById("deliveryFormat").onchange = () => {
    markDirty();
  };
  document.getElementById("deliveryFormat").value = OVERRIDES.deliveryFormat || "qbo";
  ITEMS = await (await fetch("/api/items?acct="+encodeURIComponent(acct)+"&period="+encodeURIComponent(period))).json();
  OVERRIDES = await (await fetch("/api/overrides?acct="+encodeURIComponent(acct)+"&period="+encodeURIComponent(period))).json();

  OVERRIDES.reviewed = !!OVERRIDES.reviewed;
  OVERRIDES.reviewedAt = OVERRIDES.reviewedAt || null;
  OVERRIDES.deliveryFormat = OVERRIDES.deliveryFormat || "qbo";

  for(const it of ITEMS){
    const o = (OVERRIDES.overrides||{})[it.LineId];
    if(!o) continue;

    it.Action = o.Action ?? it.Action;
    it.Modifier = o.Modifier ?? it.Modifier;
    it.Note = o.Note ?? it.Note;
    it.MoveToAccountCode = o.MoveToAccountCode ?? it.MoveToAccountCode;
    if (!it.review) it.review = {};
    it.review.ClassOverride = o.ClassOverride || "";
    it.review.Action = o.Action ?? it.review.Action ?? "INCLUDE";
    it.review.Modifier = o.Modifier ?? it.review.Modifier ?? "NONE";
    it.review.Note = o.Note ?? it.review.Note ?? "";
    it.review.MoveToAccountCode = o.MoveToAccountCode ?? it.review.MoveToAccountCode ?? "";

    it.review.SplitTrip = !!o.SplitTrip;
    it.review.MergeGroupId = o.MergeGroupId || "";
    it.review.MergeShape = o.MergeShape || "";
    it.review.AddHazmat = !!o.AddHazmat;
    it.review.AddO2 = !!o.AddO2;
    it.review.AddBari = !!o.AddBari;
    it.review.AddDeadhead = !!o.AddDeadhead;
    it.review.DeadheadMiles = Number(o.DeadheadMiles || 0);
    it.review.PoNumberOverride = o.PoNumberOverride || "";
    it.review.AddWait = !!o.AddWait;
    it.review.WaitTotalMinutes = Number(o.WaitTotalMinutes || 0);
    it.review.MatchToQuote = !!o.MatchToQuote;
    it.review.QuoteAmount = Number(o.QuoteAmount || 0);
    it.review.AddNeedWC = typeof o.AddNeedWC === "boolean" ? o.AddNeedWC : it.review.AddNeedWC;
    it.review.AddRECL = typeof o.AddRECL === "boolean" ? o.AddRECL : it.review.AddRECL;
    it.review.CancelOverride = o.CancelOverride || it.review.CancelOverride || "AUTO";
    it.review.NoCharge = typeof o.NoCharge === "boolean" ? o.NoCharge : !!it.review.NoCharge;
    it.review.TripTypeOverride = o.TripTypeOverride || "";
    it.review.MileageOverride = Number.isFinite(Number(o.MileageOverride))
      ? Number(o.MileageOverride)
      : Number(it.DirectMileage || 0);
    it.review.ActualPickupTimeOverride =
      o.ActualPickupTimeOverride || "";

    it.review.ActualDropoffTimeOverride =
      o.ActualDropoffTimeOverride || "";
    it.review.PickupNameOverride = o.PickupNameOverride || "";
    it.review.PickupAddress1Override = o.PickupAddress1Override || "";
    it.review.DropoffNameOverride = o.DropoffNameOverride || "";
    it.review.DropoffAddress1Override = o.DropoffAddress1Override || "";
    it.review.MraNumberOverride = o.MraNumberOverride || "";
    it.review.InvoiceSplitOverride = o.InvoiceSplitOverride || "AUTO";
    if (o.CancelOverride) it.review.CancelOverride = o.CancelOverride;
    if (typeof o.NoCharge === "boolean") it.review.NoCharge = o.NoCharge;
    if (typeof o.AddNeedWC === "boolean") it.review.AddNeedWC = o.AddNeedWC;
    if (typeof o.AddRECL === "boolean") it.review.AddRECL = o.AddRECL;
  }

    const deliveryFormatEl = document.getElementById("deliveryFormat");
    deliveryFormatEl.value = OVERRIDES.deliveryFormat || "qbo";

    renderRows();
    renderFacilityReviewState();
    }

function mergeSelectedTrips() {
  const selected = ITEMS.filter((r) => r.review?.MergeSelected);

  if (selected.length < 2) {
    alert("Select at least two trips to merge.");
    return;
  }

  const groupId = "manual_" + Date.now();

  for (const r of selected) {
    if (!r.review) r.review = {};
    r.review.MergeGroupId = groupId;
    r.review.MergeShape = "MULTI_STOP";
    r.review.MergeSelected = false;
  }

  if (window.markDirty) window.markDirty();
  renderRows();
}

async function save(){
  const overrides = {};
  for(const r of ITEMS){
    overrides[r.LineId] = {
      Action: r.Action,
      Modifier: r.Modifier,
      Note: r.Note,
      MoveToAccountCode: r.review?.MoveToAccountCode || "",

      SplitTrip: !!r.review?.SplitTrip,
      MergeGroupId: r.review?.MergeGroupId || "",
      MergeShape: r.review?.MergeShape || "",
      ClassOverride: r.review?.ClassOverride || "",
      AddNeedWC: !!r.review?.AddNeedWC,
      AddRECL: !!r.review?.AddRECL,
      AddHazmat: !!r.review?.AddHazmat,
      AddO2: !!r.review?.AddO2,
      AddBari: !!r.review?.AddBari,
      AddDeadhead: !!r.review?.AddDeadhead,
      DeadheadMiles: Number(r.review?.DeadheadMiles || 0),
      PoNumberOverride: r.review?.PoNumberOverride || "",
      AddWait: !!r.review?.AddWait,
      WaitTotalMinutes: Number(r.review?.WaitTotalMinutes || 0),
      CancelOverride: r.review?.CancelOverride || "AUTO",
      NoCharge: !!r.review?.NoCharge,
      MatchToQuote: !!r.review?.MatchToQuote,
      QuoteAmount: Number(r.review?.QuoteAmount || 0),
      TripTypeOverride: r.review?.TripTypeOverride || "",
      MileageOverride: Number(r.review?.MileageOverride || r.DirectMileage || 0),
      ActualPickupTimeOverride:
        r.review?.ActualPickupTimeOverride || "",

      ActualDropoffTimeOverride:
        r.review?.ActualDropoffTimeOverride || "",
      MraNumberOverride: r.review?.MraNumberOverride || "",
      InvoiceSplitOverride: r.review?.InvoiceSplitOverride || "AUTO",
      PickupNameOverride: r.review?.PickupNameOverride || "",
      PickupAddress1Override: r.review?.PickupAddress1Override || "",
      DropoffNameOverride: r.review?.DropoffNameOverride || "",
      DropoffAddress1Override: r.review?.DropoffAddress1Override || "",
    };
  }

  const resp = await fetch("/api/overrides", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      acct: current.acct,
      period: current.period,
      deliveryFormat: document.getElementById("deliveryFormat").value || "qbo",
      reviewed: true,
      reviewedAt: new Date().toISOString(),
      fuelSurchargeEnabled: !!window.BM_GLOBALS?.fuelSurchargeEnabled,
      fuelSurchargeWindows: getFuelWindowsFromUi(),
      fuelSurchargeStart: window.BM_GLOBALS?.fuelSurchargeStart || "",
      fuelSurchargeEnd: window.BM_GLOBALS?.fuelSurchargeEnd || "",
      overrides
    })
  });

  const msg = document.getElementById("saveMsg");

  if (resp.ok) {
    OVERRIDES.reviewed = true;
    OVERRIDES.reviewedAt = new Date().toISOString();
    OVERRIDES.fuelSurchargeEnabled = !!window.BM_GLOBALS?.fuelSurchargeEnabled;
    OVERRIDES.fuelSurchargeStart = window.BM_GLOBALS?.fuelSurchargeStart || "";
    OVERRIDES.fuelSurchargeEnd = window.BM_GLOBALS?.fuelSurchargeEnd || "";
    DIRTY = false;
    renderFacilityReviewState();
  }

  msg.textContent = resp.ok ? "Saved." : "Save failed.";
  setTimeout(()=>msg.textContent="", 1500);
}

function toggleDetails(id) {
  const row = document.getElementById("detail_" + id);
  if (!row) return;
  row.style.display = row.style.display === "none" ? "" : "none";
}

loadReviewConfig().then(loadIndex);
</script>
</body>
</html>`;

function fmtQboDate(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;

  const year = m[1];
  const month = String(Number(m[2]));
  const day = String(Number(m[3]));

  return month + "/" + day + "/" + year;
}

function compactDateForDocNum(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "000000";
  return m[2] + m[3] + m[1].slice(-2); // MMDDYY
}

function yesFlag(v) {
  return String(v || "").trim().toLowerCase() === "y";
}

function rateRowIncludesActualTimes(rateRow) {
  return yesFlag(
    rateRow?.invoice_include_actual_times ||
    rateRow?.InvoiceIncludeActualTimes ||
    rateRow?.include_actual_times ||
    rateRow?.IncludeActualTimes
  );
}

function shortAcctCode(acct) {
  const acctKey = String(acct || "").trim();

  if (global.BM_SHORT_CODE_MAP && global.BM_SHORT_CODE_MAP.has(acctKey)) {
    return global.BM_SHORT_CODE_MAP.get(acctKey);
  }

  throw new Error(`Missing ShortCode in accounts_v2 for account: "${acctKey}"`);
}

function buildPrivatePayInvoiceNo(r, serviceDate, seq = null) {
  const initials = String(r.ppInitials || riderInitials(r) || "XX").toUpperCase();

  const compactDate = String(serviceDate || "")
    .replace(/-/g, "")
    .slice(2);

  const base = "PP" + initials + "-" + compactDate;

  if (seq == null) return base;

  return base + "-" + String(seq).padStart(2, "0");
}

function buildInvoiceNo(acct, periodEndIso, suffix = null) {
  const base = shortAcctCode(acct) + "-" + compactDateForDocNum(periodEndIso);

  if (suffix == null) return base;

  if (typeof suffix === "number") {
    return base + "-" + String(suffix).padStart(2, "0");
  }

  return base + "-" + String(suffix).trim().toUpperCase();
}

function normalizeInvoiceSplit(v) {
  const s = String(v || "").trim().toUpperCase();

  if (s === "ER") return "ER";
  if (s === "ADMISSION") return "ADMISSION";
  if (s === "DISCHARGE") return "DISCHARGE";
  if (s === "OTHER") return "OTHER";

  return "OTHER";
}

function normAddr(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|parkway|pkwy|highway|hwy)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function addressMatches(a, b) {
  const x = normAddr(a);
  const y = normAddr(b);

  if (!x || !y) return false;

  return x.includes(y) || y.includes(x);
}

function isPrivatePayTrip(r) {
  const billingClass = String(r.BillingClass || "").trim().toUpperCase();
  const accountCode = String(r.AccountCode || "").trim().toLowerCase();
  const accountName = String(r.AccountName || "").trim().toLowerCase();
  const customer = String(r.customer || "").trim().toLowerCase();

  return (
    billingClass === "PRIVATE_PAY" ||
    billingClass === "PRIVATE PAY" ||
    accountCode.includes("private pay") ||
    accountName.includes("private pay") ||
    accountCode === "ctt comp" ||
    accountName === "ctt comp" ||
    customer.includes("private pay") ||
    customer === "ctt comp"
  );
}

function riderInitials(r) {
  const first = String(r.FirstName || "").trim();
  const last = String(r.LastName || "").trim();

  return (
    (first[0] || "X") +
    (last[0] || "X")
  ).toUpperCase();
}

function inferQboClass(r) {
  const shape = String(r.TripShape || "").toUpperCase();
  const billingClass = String(r.BillingClass || "").toUpperCase();
  const accountCode = String(r.AccountCode || "").toLowerCase();

  const rawStatus = String(r.RideStatus || "").trim().toLowerCase();
  const cancelOverride = String(r.review?.CancelOverride || "AUTO").toUpperCase();

  const isCancelled =
    cancelOverride === "YES" ? true :
    cancelOverride === "NO" ? false :
    rawStatus === "noshow" || rawStatus === "ridercancel";

  if (isCancelled) return "450 Cancellation";

  const isPrivatePay = isPrivatePayTrip(r);

  if (
    isPrivatePay &&
    (shape === "ROUND_TRIP" || shape === "MULTI_STOP")
  ) {
    return "380 Private Pay Round Trip";
  }

  if (isPrivatePay) return "375 Private Pay One Way";

  if (shape === "ROUND_TRIP") return "300 Round Trip";
  if (shape === "MULTI_STOP") return "300 Round Trip";

  const billingAddress = r.billingAddress || r.billing_address || "";
  const puAddr = r.PickupAddress1 || "";
  const doAddr = r.DropoffAddress1 || "";

  if (addressMatches(doAddr, billingAddress)) {
    return "100 Admission";
  }

  if (addressMatches(puAddr, billingAddress)) {
    return "200 Discharge";
  }

  return "400 Other";
}

function inferThrSplit(r) {
  const text = [
    r.PickupName,
    r.PickupAddress1,
    r.DropoffName,
    r.DropoffAddress1,
    r.notesFull
  ].map(v => String(v || "").toLowerCase()).join(" ");

  const erText = [
    r.PickupName,
    r.DropoffName,
    r.notesFull
  ].map(v => String(v || "").toLowerCase()).join(" ");

  if (
    /\bemergency\s+(room|department)\b/i.test(erText) ||
    /\bfrom\s+er\b/i.test(erText) ||
    /\bto\s+er\b/i.test(erText) ||
    /\bER\s+pickup\b/i.test(erText)
  ) {
    return "ER";
  }

  const pu = [r.PickupName, r.PickupAddress1].map(v => String(v || "").toLowerCase()).join(" ");
  const drop = [r.DropoffName, r.DropoffAddress1].map(v => String(v || "").toLowerCase()).join(" ");

  const hospitalRx = /\b(harris|texas health|THR|huguley|hospital|methodist)\b/i;

  if (hospitalRx.test(drop) && !hospitalRx.test(pu)) {
    return "ADMISSION";
  }

  if (hospitalRx.test(pu) && !hospitalRx.test(drop)) {
    return "DISCHARGE";
  }

  return "OTHER";
}

function invoiceSplitSuffix(split) {
  const s = normalizeInvoiceSplit(split);

  if (s === "ER") return "ER";
  if (s === "ADMISSION") return "ADM";
  if (s === "DISCHARGE") return "DIS";
  return "OTH";
}

function assertNoInvoiceNoCollisions(grouped) {
  const seen = new Map();

  for (const inv of grouped || []) {
    const invoiceNo = String(inv.invoiceNo || "").trim();
    const customer = String(inv.customer || "").trim();

    if (!invoiceNo) continue;

    const prior = seen.get(invoiceNo);
    if (prior && prior !== customer) {
      throw new Error(
        `Invoice number collision: ${invoiceNo} assigned to both "${prior}" and "${customer}"`
      );
    }

    seen.set(invoiceNo, customer);
  }
}

function csvEscape(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function csvFromRows(csvRows) {
  return csvRows.map(r => r.map(csvEscape).join(",")).join("\n");
}

function buildCsvRowsFromGrouped(grouped, period) {
  const csvRows = [
    ["Customer", "InvoiceNo", "InvoiceDate", "DueDate", "ServiceDate", "Product/Service", "Description", "Qty", "Rate", "Amount", "Class"],
  ];

  for (const inv of grouped) {
    for (const l of inv.lines) {
      const invoiceDate = fmtQboDate(period.split("_")[2] || "");
      csvRows.push([
        inv.customer,
        inv.invoiceNo,
        invoiceDate,
        invoiceDate,
        fmtQboDate(l.rideDateISO || ""),
        l.productService || "Services",
        l.lineDescription,
        l.qty === "" ? "" : Number(l.qty ?? 1).toFixed(2),
        l.rate === "" ? "" : Number(l.rate ?? l.amount ?? 0).toFixed(2),
        Number(l.amount || 0).toFixed(2),
        l.className || "",
      ]);
    }
  }

  return csvRows;
}

function buildGroupedInvoicesForSet(baseDir, acct, period, invoiceType) {
  const itemsPath = safeJoin(acct, period, "items.json");
  const overridesPath = safeJoin(acct, period, "overrides.json");

  if (!fs.existsSync(itemsPath)) {
    throw new Error(`Missing items.json for ${acct} / ${period}`);
  }

  const rows = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const overrides = fs.existsSync(overridesPath)
    ? JSON.parse(fs.readFileSync(overridesPath, "utf8"))
    : { overrides: {} };

  const reviewConfig = readReviewConfig();

  const { buildBillableLines } = require("./src/review/buildBillableLines");
  const { loadRateSheet, makeRateLookup } = require("./src/review/loadRateSheet");
  const { priceGroupedTrip } = require("./src/review/priceGroupedTrip");
  const { ratesPath: defaultRatesPath, buildPricingContext } = require("./src/orgs/CTT/pricing/pricingContext");
  const { computeAvailableCharges } = require("./src/review/reviewAdjustments");
  const { computeDeadheadCharge } = require("./src/orgs/CTT/pricing/computeDeadheadCharge");
  const { num } = require("./src/pricing/rateLookup");

  const rateRows = loadRateSheet(defaultRatesPath);
  const rateLookupFn = makeRateLookup(rateRows);

  global.BM_SHORT_CODE_MAP = new Map();

  for (const row of rateRows) {
    const acctCode = String(row.AccountCode || row.account_code || row.account || "").trim();
    const shortCode = String(row.ShortCode || row.shortcode || row.short_code || "").trim();

    if (acctCode && shortCode) {
      global.BM_SHORT_CODE_MAP.set(acctCode, shortCode.toUpperCase());
    }
  }

  const lines = [];
  let accountInvoiceMethod = "single";

  const manualMergeGroups = {};

  for (const r of rows) {
    const o = overrides.overrides?.[r.LineId] || {};
    const review = { ...(r.review || {}), ...o };

    if (review.MergeGroupId) {
      if (!manualMergeGroups[review.MergeGroupId]) {
        manualMergeGroups[review.MergeGroupId] = [];
      }

      manualMergeGroups[review.MergeGroupId].push({
        row: r,
        review
      });

      continue;
    }

    const override = review.TripTypeOverride || "";
    let mobilityOverride = r.Mobility;

    if (override === "STR") mobilityOverride = "STR";
    else if (override === "WC") mobilityOverride = "WC";
    else if (override === "AMBU") mobilityOverride = "AMBU";

    const effectiveAccountCode =
      String(review.MoveToAccountCode || "").trim() ||
      String(r.AccountCode || "").trim();

    const mileageOverride = Number(review.MileageOverride || 0);
    const effectiveMileage = mileageOverride > 0
      ? mileageOverride
      : Number(r.DirectMileage || 0);

    const pricingInput = {
      ...r,
      review,
      AccountCode: effectiveAccountCode,
      AccountName: effectiveAccountCode,
      Mobility: mobilityOverride,
      BillingClass: r.BillingClass,
      DirectMileage: String(effectiveMileage),
    };

    const rateRow = rateLookupFn(pricingInput);
    accountInvoiceMethod = String(
      rateRow?.invoice_method ||
      rateRow?.InvoiceMethod ||
      accountInvoiceMethod ||
      "single"
    ).trim().toLowerCase();
    const pricingContext = buildPricingContext(pricingInput);
    let exportRows = [];

    if (
      review.SplitTrip &&
      Array.isArray(r.legs) &&
      r.legs.length > 1
    ) {
      exportRows = r.legs.map((leg, idx) => {
        const splitMiles = Math.round(
          Number(r.DirectMileage || 0) / Math.max(1, r.legs.length)
        );

        const splitReview = {
          ...review,
          MileageOverride: splitMiles
        };

        const singleRow = {
          ...r,
          ...leg,
          TripShape: "ONE_WAY",
          pricing: null,
          LineId: String(r.LineId || "") + "_split_" + idx,
          review: splitReview
        };

        const singlePricingInput = {
          ...singleRow,
          review: splitReview,
          AccountCode: effectiveAccountCode,
          AccountName: effectiveAccountCode,
          Mobility: mobilityOverride,
          BillingClass: r.BillingClass,
          DirectMileage: String(splitMiles),
        };

        const singlePricingContext = buildPricingContext(singlePricingInput);

        const singlePricing = priceGroupedTrip(
          singlePricingInput,
          rateRow,
          singlePricingContext
        );

        return {
          repricedRow: {
            ...singlePricingInput,
            pricing: singlePricing,
          }
        };
      });
    }
    if (!exportRows.length) {
    const pricing = priceGroupedTrip(pricingInput, rateRow, pricingContext);
    const availableCharges = computeAvailableCharges(pricingInput, rateRow || {});
    const deadheadResult = computeDeadheadCharge(pricingInput, rateRow || {}, pricingContext);

    const repricedRow = {
      invoiceMethod:
        rateRow?.invoice_method ||
        rateRow?.InvoiceMethod ||
        "single",
      ...pricingInput,
      pricing,
      invoiceIncludeActualTimes: rateRowIncludesActualTimes(rateRow || {}),
      billingAddress:
        rateRow?.billing_address ||
        rateRow?.BillingAddress ||
        "",
      poNumber:
        rateRow?.po_number ||
        rateRow?.PONumber ||
        rateRow?.poNumber ||
        "",
      availableCharges,
      deadheadCharge: Number(deadheadResult.deadheadCharge || 0),
      deadheadMiles: Number(deadheadResult.deadheadMiles || 0),
      deadheadDebug: deadheadResult,
      deadheadConfig: {
        dh_flat_fee: rateRow?.dh_flat_fee ?? "",
        dh_start_miles: rateRow?.dh_start_miles ?? "",
        dh_rate_tier1: rateRow?.dh_rate_tier1 ?? "",
        dh_rate_tier2: rateRow?.dh_rate_tier2 ?? "",
        dh_rate_tier3: rateRow?.dh_rate_tier3 ?? "",
        dh_tier2_start_miles: rateRow?.dh_tier2_start_miles ?? "",
        dh_tier3_start_miles: rateRow?.dh_tier3_start_miles ?? "",
      },
      waitConfig: {
        wait_rate: rateRow?.wait_rate ?? "",
        wait_block_min: rateRow?.wait_block_min ?? "",
        wait_grace_min: rateRow?.wait_grace_min ?? "",
      },
      fuelSurchargeRate: num(rateRow?.fuel_surcharge),
      availableWcAccessories: {
        needwc_1w: num(rateRow?.needwc_1w),
        needwc_rt: num(rateRow?.needwc_rt),
        recl_1w: num(rateRow?.recl_1w),
        recl_rt: num(rateRow?.recl_rt),
      },
    };
    exportRows.push({ repricedRow });
  }

    const exportGlobals = {
      fuelSurchargeEnabled: !!reviewConfig.fuelSurchargeEnabled,
      fuelSurchargeWindows: Array.isArray(reviewConfig.fuelSurchargeWindows)
        ? reviewConfig.fuelSurchargeWindows
        : []
    };

    for (const [groupId, members] of Object.entries(manualMergeGroups)) {

      const first = members[0];
      const firstRow = first.row;
      const firstReview = first.review;

      const mergedMileage = members.reduce((sum, m) => {
        return sum + Number(m.row.DirectMileage || 0);
      }, 0);

      const mergedRow = {
        ...firstRow,
        TripShape: "MULTI_STOP",
        DirectMileage: mergedMileage,
        review: firstReview,
        legs: members.map((m) => m.row),
      };

      const effectiveAccountCode =
        String(firstReview.MoveToAccountCode || "").trim() ||
        String(firstRow.AccountCode || "").trim();

      const pricingInput = {
        ...mergedRow,
        review: firstReview,
        AccountCode: effectiveAccountCode,
        AccountName: effectiveAccountCode,
      };

      const rateRow = rateLookupFn(pricingInput);

      const pricingContext = buildPricingContext(pricingInput);

      const pricing = priceGroupedTrip(
        pricingInput,
        rateRow,
        pricingContext
      );

      const repricedRow = {
        ...pricingInput,
        pricing,
        invoiceMethod:
          rateRow?.invoice_method ||
          rateRow?.InvoiceMethod ||
          "single",
      };

      const exportGlobals = {
        fuelSurchargeEnabled: !!reviewConfig.fuelSurchargeEnabled,
        fuelSurchargeWindows: Array.isArray(reviewConfig.fuelSurchargeWindows)
          ? reviewConfig.fuelSurchargeWindows
          : []
      };

      const className =
        firstReview.ClassOverride ||
        inferQboClass(repricedRow);

      const exportCustomer = isPrivatePayTrip(repricedRow)
        ? String(
            (
              (repricedRow.FirstName || "") +
              " " +
              (repricedRow.LastName || "")
            ).trim() || effectiveAccountCode
          )
        : effectiveAccountCode;

      const built = buildBillableLines(repricedRow, exportGlobals).map((line) => ({
        ...line,
        customer: exportCustomer,
        invoiceSplit,
        className,
        isPrivatePay: isPrivatePayTrip(repricedRow),
        ppInitials: riderInitials(repricedRow),
      }));

      lines.push(...built);
    }

    for (const exportRow of exportRows) {
      const repricedRow = exportRow.repricedRow;

      const splitOverride = String(review.InvoiceSplitOverride || "AUTO").toUpperCase();

      const invoiceSplit = splitOverride === "AUTO"
        ? inferThrSplit(repricedRow)
        : normalizeInvoiceSplit(splitOverride);

      const className =
        review.ClassOverride ||
        inferQboClass(repricedRow);

      const exportCustomer = isPrivatePayTrip(repricedRow)
        ? String(
            (
              (repricedRow.FirstName || "") +
              " " +
              (repricedRow.LastName || "")
            ).trim() || effectiveAccountCode
          )
        : effectiveAccountCode;

      const built = buildBillableLines(repricedRow, exportGlobals).map((line) => ({
        ...line,
        customer: exportCustomer,
        invoiceSplit,
        className,
        isPrivatePay: isPrivatePayTrip(repricedRow),
        ppInitials: riderInitials(repricedRow),
        serviceDate: repricedRow.RideDateISO || line.rideDateISO || "",
      }));

      lines.push(...built);
    }
  }

  let grouped = [];

  const effectiveInvoiceType = accountInvoiceMethod || "single";

  if (effectiveInvoiceType === "single") {
    const byCustomer = {};

  for (const l of lines) {
    const customer = String(l.customer || acct).trim();
    if (!byCustomer[customer]) byCustomer[customer] = [];
    byCustomer[customer].push(l);
  }

  grouped = Object.entries(byCustomer).map(([customer, customerLines]) => ({
    invoiceNo: (() => {
      const sampleLine = customerLines[0] || {};

      if (sampleLine.isPrivatePay) {
        return buildPrivatePayInvoiceNo(
          sampleLine,
          sampleLine.serviceDate,
          null
        );
      }

      return buildInvoiceNo(
        customer,
        period.split("_")[2] || "",
        null
      );
    })(),
    customer,
    lines: customerLines,
  }));

  } else if (effectiveInvoiceType === "thr_split") {
  const bySplit = {};

  for (const l of lines) {
    const customer = String(l.customer || acct).trim();
    const split = normalizeInvoiceSplit(l.invoiceSplit || "OTHER");
    const key = customer + "||" + split;

    if (!bySplit[key]) bySplit[key] = [];
    bySplit[key].push(l);
  }

  grouped = Object.entries(bySplit).map(([key, splitLines]) => {
    const [customer, split] = key.split("||");

    return {
      invoiceNo: buildInvoiceNo(customer, period.split("_")[2] || "", invoiceSplitSuffix(split)),
      customer,
      lines: splitLines,
    };
  });

  } else if (effectiveInvoiceType === "individual") {
    const byTrip = {};

    for (const l of lines) {
      const customer = String(l.customer || acct).trim();
      const key = customer + "||" + l.lineId;
      if (!byTrip[key]) byTrip[key] = [];
      byTrip[key].push(l);
    }

    grouped = Object.entries(byTrip).map(([k, v], i) => {
      const customer = String(v[0]?.customer || acct).trim();
      return {
        invoiceNo: (() => {
          const sampleLine = v[0] || {};

          if (sampleLine.isPrivatePay) {
            return buildPrivatePayInvoiceNo(
              sampleLine,
              sampleLine.serviceDate,
              null
            );
          }

          return buildInvoiceNo(
            customer,
            period.split("_")[2] || "",
            i + 1
          );
        })(),
        customer,
        lines: v,
      };
    });
  }

  return grouped;
}

const server = http.createServer((req, res) => {
  try {
    const u = url.parse(req.url, true);

    if (u.pathname === "/renderRows.js") {
      const p = path.resolve(process.cwd(), "src", "review", "renderRows.js");
      return send(res, 200, fs.readFileSync(p, "utf8"), "application/javascript; charset=utf-8");
    }

    if (u.pathname === "/preReviewSuggestions.js") {
      const p = path.resolve(process.cwd(), "src", "review", "preReviewSuggestions.js");
      return send(res, 200, fs.readFileSync(p, "utf8"), "application/javascript; charset=utf-8");
    }

    if (u.pathname === "/cleanLocationName.js") {
      const p = path.resolve(process.cwd(), "src", "review", "cleanLocationName.js");

      let js = fs.readFileSync(p, "utf8");

      js = js
        .replace(/const\s+\{\s*getLocationAlias\s*\}\s*=\s*require\([^)]+\);\s*/g, "")
        .replace(/module\.exports\s*=\s*\{\s*cleanLocationName\s*,?\s*\};?/g, "");

      js = js.replace(
        /const alias = getLocationAlias\(s\);[\s\S]*?if \(alias\?\.name\) \{[\s\S]*?s = alias\.name;[\s\S]*?\}/,
        ""
      );

      js += "\nwindow.cleanLocationName = cleanLocationName;\n";

      return send(res, 200, js, "application/javascript; charset=utf-8");
    }

    if (u.pathname === "/api/location-alias" && req.method === "POST") {
      let body = "";

      req.on("data", chunk => {
        body += chunk;
      });

      req.on("end", () => {
        try {
          const data = JSON.parse(body || "{}");

          setLocationAlias(
            data.originalName || "",
            data.originalAddress1 || "",
            {
              name: data.name || "",
              address1: data.address1 || ""
            }
          );

          return send(res, 200, JSON.stringify({ ok: true }), "application/json");
        } catch (err) {
          console.error(err);
          return send(
            res,
            500,
            JSON.stringify({ ok: false, error: String(err) }),
            "application/json"
          );
        }
      });

      return;
    }

    if (u.pathname === "/") return send(res, 200, HTML, "text/html; charset=utf-8");
        
      if (u.pathname === "/api/accounts") {
      const { loadRateSheet } = require("./src/review/loadRateSheet");
      const { ratesPath: defaultRatesPath } = require("./src/orgs/CTT/pricing/pricingContext");

      const rows = loadRateSheet(defaultRatesPath);

      const accounts = Array.from(new Set(
        rows
          .map((r) =>
            String(
              r.AccountCode ||
              r.account_code ||
              r.account ||
              r.Account ||
              ""
            ).trim()
          )
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b));

      return send(res, 200, JSON.stringify({ accounts }), "application/json");
    }

    if (u.pathname === "/api/config" && req.method === "GET") {
      return send(res, 200, JSON.stringify(readReviewConfig()), "application/json");
    }

    if (u.pathname === "/api/config" && req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        const payload = JSON.parse(body || "{}");

        writeReviewConfigPatch({
          fuelSurchargeEnabled: !!payload.fuelSurchargeEnabled,
          fuelSurchargeWindows: Array.isArray(payload.fuelSurchargeWindows)
            ? payload.fuelSurchargeWindows
            : []
        });

        return send(res, 200, JSON.stringify({ ok: true }), "application/json");
      });
      return;
    }

    if (u.pathname === "/api/index") {
      const p = safeJoin("index.json");
      if (!fs.existsSync(p)) {
        return send(
          res,
          500,
          `index.json not found at:\n${p}\n\nBase dir:\n${baseDir}\n\nFix: rerun bm-reviewpackets.js with --outDir matching this folder, or start server with --dir pointing to it.`,
          "text/plain; charset=utf-8"
        );
      }

      const index = readJson(p);

      for (const acct of Object.keys(index.facilities || {})) {
        const facility = index.facilities[acct];
        for (const period of Object.keys(facility.periods || {})) {
          const overridesPath = safeJoin(acct, period, "overrides.json");
          let reviewed = false;
          let reviewedAt = null;
          let invoiceType = "single";

          if (fs.existsSync(overridesPath)) {
            const o = readJson(overridesPath);
            reviewed = !!o.reviewed;
            reviewedAt = o.reviewedAt || null;
            invoiceType = o.invoiceType || "single";
          }

          facility.periods[period] = {
            ...(facility.periods[period] || {}),
            reviewed,
            reviewedAt,
            invoiceType
          };
        }
      }

      return send(res, 200, JSON.stringify(index), "application/json");
    }

    if (u.pathname === "/api/items") {
      const acct = String(u.query.acct || "").trim();
      const period = u.query.period;
      const p = safeJoin(acct, period, "items.json");

      const rows = readJson(p);

      const { loadRateSheet, makeRateLookup } = require("./src/review/loadRateSheet");
      const { ratesPath: defaultRatesPath } = require("./src/orgs/CTT/pricing/pricingContext");

      const rateRows = loadRateSheet(defaultRatesPath);
      const rateLookupFn = makeRateLookup(rateRows);

      const rateRow = rateLookupFn({
        AccountCode: acct,
        AccountName: acct,
      }) || {};

      const includeTimes = rateRowIncludesActualTimes(rateRow);

      const poNumber =
        rateRow?.po_number ||
        rateRow?.PONumber ||
        rateRow?.poNumber ||
        rateRow?.["PO Number"] ||
        rateRow?.["PO#"] ||
        "";

      const invoiceMethod = String(
        rateRow?.invoice_method ||
        rateRow?.InvoiceMethod ||
        "single"
      ).trim().toLowerCase();

      for (const row of rows) {
        row.invoiceIncludeActualTimes = includeTimes;
        row.poNumber = poNumber;
        row.invoiceMethod = invoiceMethod;

        applyLocationAliasesToRow(row);

        row.invoiceSplit =
          invoiceMethod === "thr_split"
            ? inferThrSplit(row)
            : "";
        row.billingAddress =
        rateRow?.billing_address ||
        rateRow?.BillingAddress ||
        "";
        row.inferredClass = inferQboClass(row);
      }

      return send(res, 200, JSON.stringify(rows), "application/json");
    }

    if (u.pathname === "/api/overrides" && req.method === "GET") {
      const acct = u.query.acct;
      const period = u.query.period;
      const p = safeJoin(acct, period, "overrides.json");
      return send(res, 200, JSON.stringify(readJson(p)), "application/json");
    }

    if (u.pathname === "/api/overrides" && req.method === "POST") {
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
          overrides
        });
        send(res, 200, JSON.stringify({ ok: true }), "application/json");
      });
      return;
    }

        if (u.pathname === "/api/export-qbo" && req.method === "GET") {
      try {
        const acct = String(u.query.acct || "").trim();
        const period = String(u.query.period || "").trim();
        const invoiceType = String(u.query.invoiceType || "single").trim();

        if (!acct || !period) {
          return send(res, 400, "Missing acct/period", "text/plain; charset=utf-8");
        }

        const grouped = buildGroupedInvoicesForSet(baseDir, acct, period, invoiceType);
        assertNoInvoiceNoCollisions(grouped);
        const csvRows = buildCsvRowsFromGrouped(grouped, period);
        const csv = csvFromRows(csvRows);

        res.writeHead(200, {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${acct}_${period}.csv"`,
        });
        return res.end(csv);

        } catch (err) {
          console.error("Batch export failed:", err);
          return send(
            res,
            500,
            JSON.stringify({
              error: "Batch export failed: " + (err?.message || String(err))
            }),
            "application/json"
          );
        }
    }

    if (u.pathname === "/api/export-qbo-batch" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const selected = Array.isArray(payload.selected) ? payload.selected : [];

          if (!selected.length) {
            return send(res, 400, JSON.stringify({ error: "Nothing selected" }), "application/json");
          }

          const header = ["Customer", "InvoiceNo", "InvoiceDate", "DueDate", "ServiceDate", "Product/Service", "Description", "Qty", "Rate", "Amount", "Class"];

          const maxDataRowsPerFile = 1000;

          const allInvoiceGroups = [];

          for (const entry of selected) {
            const acct = String(entry.acct || "").trim();
            const period = String(entry.period || "").trim();

            if (!acct || !period) continue;

            const overridesPath = safeJoin(acct, period, "overrides.json");
            const overrides = fs.existsSync(overridesPath)
              ? readJson(overridesPath)
              : { invoiceType: "single", reviewed: false };

            if (!overrides.reviewed) continue;

            const grouped = buildGroupedInvoicesForSet(baseDir, acct, period || "single");

            for (const inv of grouped) {
              const dataRows = buildCsvRowsFromGrouped([inv], period).slice(1); // no header
              allInvoiceGroups.push({
                acct,
                period,
                invoiceNo: inv.invoiceNo,
                rows: dataRows,
                rowCount: dataRows.length,
              });
            }
          }

          if (!allInvoiceGroups.length) {
            return send(res, 400, JSON.stringify({ error: "No reviewed exports found in selection" }), "application/json");
          }

          const invoiceNoOwners = new Map();
          const invoiceNoCounts = new Map();

          for (const inv of allInvoiceGroups) {
            const originalInvoiceNo = String(inv.invoiceNo || "").trim();
            const owner = String(inv.acct || "").trim();

            if (!originalInvoiceNo) continue;

            const prior = invoiceNoOwners.get(originalInvoiceNo);

            if (prior && prior !== owner) {
              const count = (invoiceNoCounts.get(originalInvoiceNo) || 1) + 1;
              invoiceNoCounts.set(originalInvoiceNo, count);

              const newInvoiceNo = `${originalInvoiceNo}-${String(count).padStart(2, "0")}`;

              for (const row of inv.rows) {
                row[1] = newInvoiceNo; // InvoiceNo column
              }

              inv.invoiceNo = newInvoiceNo;
              invoiceNoOwners.set(newInvoiceNo, owner);
            } else {
              invoiceNoOwners.set(originalInvoiceNo, owner);
              if (!invoiceNoCounts.has(originalInvoiceNo)) {
                invoiceNoCounts.set(originalInvoiceNo, 1);
              }
            }
          }

          const files = [];
          let currentRows = [header];
          let currentCount = 0;
          let part = 1;
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");

          function flushFile() {
            if (currentRows.length <= 1) return;

            const fileName = `batch_qbo_${stamp}_part_${String(part).padStart(2, "0")}.csv`;
            const outPath = path.join(batchExportDir, fileName);
            fs.writeFileSync(outPath, csvFromRows(currentRows), "utf8");

            files.push({
              fileName,
              url: "/downloads/" + encodeURIComponent(fileName)
            });

            part += 1;
            currentRows = [header];
            currentCount = 0;
          }

          for (const inv of allInvoiceGroups) {
            if (inv.rowCount > maxDataRowsPerFile) {
              return send(
                res,
                400,
                JSON.stringify({ error: `Invoice ${inv.invoiceNo} exceeds ${maxDataRowsPerFile} rows by itself` }),
                "application/json"
              );
            }

            if (currentCount > 0 && currentCount + inv.rowCount > maxDataRowsPerFile) {
              flushFile();
            }

            currentRows.push(...inv.rows);
            currentCount += inv.rowCount;
          }

          flushFile();

          return send(res, 200, JSON.stringify({ ok: true, files }), "application/json");
        } catch (err) {
          console.error(err);
          return send(res, 500, JSON.stringify({ error: "Batch export failed" }), "application/json");
        }
      });
      return;
    }

    if (u.pathname.startsWith("/downloads/")) {
      const fileName = decodeURIComponent(u.pathname.replace("/downloads/", ""));
      const p = path.join(batchExportDir, fileName);

      if (!p.startsWith(batchExportDir) || !fs.existsSync(p)) {
        return send(res, 404, "File not found", "text/plain; charset=utf-8");
      }

      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      });
      return res.end(fs.readFileSync(p, "utf8"));
    }

    send(res, 404, "not found", "text/plain; charset=utf-8");
  } catch (e) {
    send(res, 500, String(e.message || e), "text/plain; charset=utf-8");
  }
});

server.listen(8787, () => {
  console.log("BM Review running at http://localhost:8787");
  console.log("Base dir:", baseDir);
  console.log("Expecting index at:", path.join(baseDir, "index.json"));
});