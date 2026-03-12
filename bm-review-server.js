// bm-review-server.js
// Local review UI for Stacie: Include / Exclude / Modify + notes.
// Run:
//   node bm-review-server.js --dir "C:\Users\Drew\BillerMailer\data\output\review"
// Then open:
//   http://localhost:8787

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const baseDir = path.resolve(process.cwd(), arg("--dir", "data\\output\\review"));

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
    <h3 style="margin:6px 0">Facilities</h3>
    <div id="facList">Loading…</div>
  </div>
    <div id="main">
      <div id="mainHeader">
        <h2 style="margin:6px 0">BM Review</h2>
        <div id="status" style="color:#666;margin-bottom:8px">Select a facility + period.</div>

        <div class="toolbar" id="toolbar" style="display:none">
          <input
            id="search"
            placeholder="Search…"
            oninput="renderRows()"
            style="min-width:240px"
          />

          <label style="display:flex;align-items:center;gap:6px;color:#374151">
            <span>Invoice Type</span>
            <select id="invoiceType">
              <option value="single">Single invoice</option>
              <option value="trip">Individual invoices</option>
            </select>
          </label>

          <button onclick="save()">Save</button>
          <span id="saveMsg" style="color:#666"></span>
        </div>
      </div>

      <div id="tableWrap"></div>
  </div>

<script src="/renderRows.js"></script>
<script>
let INDEX=null;
let current = { acct:null, period:null };
let ITEMS=[];
let OVERRIDES={ invoiceType:"single", overrides:{} };

function esc(s){ return String(s??"").replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

async function loadIndex(){
  const facList = document.getElementById("facList");
  facList.textContent = "Loading…";

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

        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = (f.periods[p].count || 0) + " trips";

        row.appendChild(a);
        row.appendChild(document.createTextNode(" "));
        row.appendChild(pill);

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
  document.getElementById("status").textContent = acct + " / " + period;
  document.getElementById("toolbar").style.display = "flex";
  ITEMS = await (await fetch("/api/items?acct="+encodeURIComponent(acct)+"&period="+encodeURIComponent(period))).json();
  OVERRIDES = await (await fetch("/api/overrides?acct="+encodeURIComponent(acct)+"&period="+encodeURIComponent(period))).json();

    for(const it of ITEMS){
    const o = (OVERRIDES.overrides||{})[it.LineId];
    if(!o) continue;

    it.Action = o.Action ?? it.Action;
    it.Modifier = o.Modifier ?? it.Modifier;
    it.Note = o.Note ?? it.Note;
    it.MoveToAccountCode = o.MoveToAccountCode ?? it.MoveToAccountCode;

    if (!it.review) it.review = {};
    it.review.Action = o.Action ?? it.review.Action ?? "INCLUDE";
    it.review.Modifier = o.Modifier ?? it.review.Modifier ?? "NONE";
    it.review.Note = o.Note ?? it.review.Note ?? "";
    it.review.MoveToAccountCode = o.MoveToAccountCode ?? it.review.MoveToAccountCode ?? "";

    it.review.AddHazmat = !!o.AddHazmat;
    it.review.AddO2 = !!o.AddO2;
    it.review.AddBari = !!o.AddBari;
    it.review.AddDeadhead = !!o.AddDeadhead;
    it.review.AddWait = !!o.AddWait;
    it.review.WaitTotalMinutes = Number(o.WaitTotalMinutes || 0);
    it.review.MatchToQuote = !!o.MatchToQuote;
    it.review.QuoteAmount = Number(o.QuoteAmount || 0);
  }

    const invoiceTypeEl = document.getElementById("invoiceType");
    invoiceTypeEl.value = OVERRIDES.invoiceType || "single";
    document.getElementById("invoiceType").value = OVERRIDES.invoiceType || "single";

  renderRows();
}

async function save(){
  const overrides = {};
  for(const r of ITEMS){
        overrides[r.LineId] = {
      Action: r.Action,
      Modifier: r.Modifier,
      Note: r.Note,
      MoveToAccountCode: r.MoveToAccountCode || "",

      AddHazmat: !!r.review?.AddHazmat,
      AddO2: !!r.review?.AddO2,
      AddBari: !!r.review?.AddBari,
      AddDeadhead: !!r.review?.AddDeadhead,
      AddWait: !!r.review?.AddWait,
      WaitTotalMinutes: Number(r.review?.WaitTotalMinutes || 0),
      MatchToQuote: !!r.review?.MatchToQuote,
      QuoteAmount: Number(r.review?.QuoteAmount || 0),
    };
  }
  const resp = await fetch("/api/overrides", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ acct: current.acct, period: current.period, overrides })
  });
  const msg = document.getElementById("saveMsg");
  msg.textContent = resp.ok ? "Saved." : "Save failed.";
  setTimeout(()=>msg.textContent="", 1500);
}

function toggleDetails(id) {
  const row = document.getElementById("detail_" + id);
  if (!row) return;
  row.style.display = row.style.display === "none" ? "" : "none";
}

loadIndex();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  try {
    const u = url.parse(req.url, true);

    if (u.pathname === "/renderRows.js") {
      const p = path.resolve(process.cwd(), "src", "review", "renderRows.js");
      return send(res, 200, fs.readFileSync(p, "utf8"), "application/javascript; charset=utf-8");
    }

    if (u.pathname === "/") return send(res, 200, HTML, "text/html; charset=utf-8");

    
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
      return send(res, 200, JSON.stringify(readJson(p)), "application/json");
    }

    if (u.pathname === "/api/items") {
      const acct = u.query.acct;
      const period = u.query.period;
      const p = safeJoin(acct, period, "items.json");
      return send(res, 200, JSON.stringify(readJson(p)), "application/json");
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
        const overrides = payload.overrides || {};
        const p = safeJoin(acct, period, "overrides.json");
        writeJson(p, { invoiceType, overrides });
        send(res, 200, JSON.stringify({ ok: true }), "application/json");
      });
      return;
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