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
    body{font-family:system-ui,Segoe UI,Arial;margin:0;display:flex;height:100vh}
    #left{width:340px;border-right:1px solid #ddd;padding:12px;overflow:auto}
    #main{flex:1;padding:12px;overflow:auto}
    .fac{padding:8px;border:1px solid #ddd;border-radius:10px;margin:8px 0}
    .pill{display:inline-block;padding:2px 8px;border:1px solid #ccc;border-radius:999px;margin-left:6px;font-size:12px;color:#555}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ddd;padding:6px;font-size:12px;vertical-align:top}
    th{position:sticky;top:0;background:#fff;z-index:2}
    select,input{font-size:12px}
    .row-exclude{opacity:0.45}
    .toolbar{display:flex;gap:10px;align-items:center;margin:8px 0;flex-wrap:wrap}
    button{padding:8px 10px;border:1px solid #ccc;border-radius:10px;background:#fff;cursor:pointer}
  </style>
</head>
<body>
  <div id="left">
    <h3 style="margin:6px 0">Facilities</h3>
    <div id="facList">Loading…</div>
  </div>
  <div id="main">
    <h2 style="margin:6px 0">BM Review</h2>
    <div id="status" style="color:#666;margin-bottom:8px">Select a facility + period.</div>
    <div class="toolbar" id="toolbar" style="display:none">
      <button onclick="save()">Save</button>
      <span id="saveMsg" style="color:#666"></span>
      <input id="search" placeholder="Search…" oninput="renderRows()" style="padding:7px;border:1px solid #ccc;border-radius:10px;min-width:240px"/>
    </div>
    <div id="tableWrap"></div>
  </div>

<script>
let INDEX=null;
let current = { acct:null, period:null };
let ITEMS=[];
let OVERRIDES={ overrides:{} };

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
    if(o){
      it.Action = o.Action ?? it.Action;
      it.Modifier = o.Modifier ?? it.Modifier;
      it.Note = o.Note ?? it.Note;
    }
  }
  renderRows();
}

function renderRows(){
  const q = (document.getElementById("search").value||"").toLowerCase().trim();
  const rows = ITEMS.filter(r=>{
    if(!q) return true;
    const hay = (r.FirstName+" "+r.LastName+" "+r.PickupName+" "+r.DropoffName+" "+r.PickupCity+" "+r.DropoffCity+" "+r.Mobility+" "+r.RideStatus+" "+r.Comments+" "+r.Comments1).toLowerCase();
    return hay.includes(q);
  });

  const wrap = document.getElementById("tableWrap");
  wrap.innerHTML = "";
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr>" +
    "<th>Date</th><th>Pickup</th><th>Dropoff</th><th>Rider</th><th>Mobi</th><th>Status</th><th>Miles</th><th>Action</th><th>Modifier</th><th>Note</th>" +
  "</tr></thead>";
  const tb = document.createElement("tbody");

  for(const r of rows){
    const tr = document.createElement("tr");
    if(r.Action==="EXCLUDE") tr.className="row-exclude";

    tr.innerHTML =
      "<td>"+esc(r.RideDateISO||"")+"</td>" +
      "<td><b>"+esc(r.PickupName||"")+"</b><div>"+esc(r.PickupCity||"")+"</div></td>" +
      "<td><b>"+esc(r.DropoffName||"")+"</b><div>"+esc(r.DropoffCity||"")+"</div></td>" +
      "<td>"+esc((r.FirstName||"")+" "+(r.LastName||""))+"</td>" +
      "<td>"+esc(r.Mobility||"")+"</td>" +
      "<td>"+esc(r.RideStatus||"")+"</td>" +
      "<td>"+esc(r.DirectMileage||"")+"</td>";

    const action = document.createElement("select");
    ["INCLUDE","EXCLUDE","MODIFY","MOVE"].forEach(v=>{
      const opt=document.createElement("option");
      opt.value=v; opt.text=v;
      if(r.Action===v) opt.selected=true;
      action.appendChild(opt);
    });
    action.onchange = () => {
      r.Action = action.value;
      if (r.Action !== "MODIFY") r.Modifier = "NONE";
      if (r.Action !== "MOVE") r.MoveToAccountCode = "";
      renderRows();
    };

    const mod = document.createElement("select");
    ["NONE","HALF","FREE"].forEach(v=>{
      const opt=document.createElement("option");
      opt.value=v; opt.text=v;
      if(r.Modifier===v) opt.selected=true;
      mod.appendChild(opt);
    });
    mod.onchange=()=>{ r.Modifier=mod.value; if(r.Action!=="MODIFY" && r.Modifier!=="NONE"){ r.Action="MODIFY"; } };

    // Build account options (AccountCode keys from INDEX)
    const acctOptions = Object.keys((INDEX && INDEX.facilities) ? INDEX.facilities : {}).sort();

    const moveTo = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.text = "(select account)";
    moveTo.appendChild(blank);

    for (const ac of acctOptions) {
      const opt = document.createElement("option");
      opt.value = ac;
      opt.text = ac; // AccountCode is the billing key
      if ((r.MoveToAccountCode || "") === ac) opt.selected = true;
      moveTo.appendChild(opt);
    }
    moveTo.onchange = () => { r.MoveToAccountCode = moveTo.value; };

    // Only show if Action=MOVE
    moveTo.style.display = (r.Action === "MOVE") ? "inline-block" : "none";

    const note = document.createElement("input");
    note.value = r.Note || "";
    note.style.width="220px";
    note.oninput=()=>{ r.Note = note.value; };

    const tdA=document.createElement("td"); tdA.appendChild(action);
    const tdM=document.createElement("td"); tdM.appendChild(mod);
    const tdMove = document.createElement("td");
    tdMove.appendChild(moveTo);
    const tdN=document.createElement("td"); tdN.appendChild(note);
    tr.appendChild(tdA); tr.appendChild(tdM); tr.appendChild(tdMove); tr.appendChild(tdN);
    tb.appendChild(tr);
  }

  table.appendChild(tb);
  wrap.appendChild(table);
}

async function save(){
  const overrides = {};
  for(const r of ITEMS){
    overrides[r.LineId] = {
    Action: r.Action,
    Modifier: r.Modifier,
    Note: r.Note,
    MoveToAccountCode: r.MoveToAccountCode || ""
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

loadIndex();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  try {
    const u = url.parse(req.url, true);

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
        const overrides = payload.overrides || {};
        const p = safeJoin(acct, period, "overrides.json");
        writeJson(p, { overrides });
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