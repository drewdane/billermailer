// bm-review-server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { setLocationAlias , getLocationAlias } = require("./src/orgs/CTT/locationAliases");
const { inferQboClass, isPrivatePayTrip } = require("./src/orgs/CTT/qboClass");
const { scrubStaleTimeChargeOverride, } = require("./src/review/reviewOverrides");
const { csvFromRows, buildCsvRowsFromGrouped, } = require("./src/review/csvExport");
const { normalizeAddress, matchesAnyBillingAddress, applyLocationAliasesToRow, } = require("./src/orgs/CTT/addressUtils");
const { buildGroupedInvoicesForSet, rateRowIncludesActualTimes, } = require("./src/review/invoiceBuilder");
const { inferThrSplit, pickPoNumber, } = require("./src/orgs/CTT/invoiceSplit");
const { fmtQboDate, compactDateForDocNum, assertNoInvoiceNoCollisions, } = require("./src/orgs/CTT/invoiceNumbers");
const { handleItemsRoute, } = require("./src/review/routes/itemRoutes");
const { handleGetConfig, handlePostConfig, } = require("./src/review/routes/configRoutes");
const { handleGetOverrides, handlePostOverrides, } = require("./src/review/routes/overrideRoutes");
const { handleAccountsRoute, } = require("./src/review/routes/accountRoutes");
const { handleIndexRoute, } = require("./src/review/routes/indexRoutes");

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

const reviewPagePath = path.resolve(process.cwd(), "src", "review", "reviewPage.html");

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

    if (u.pathname === "/reviewOverridesClient.js") {
      const p = path.resolve(process.cwd(), "src", "review", "reviewOverridesClient.js");
      return send(res, 200, fs.readFileSync(p, "utf8"), "application/javascript; charset=utf-8");
    }

    if (u.pathname === "/reviewPricing.js") {
      const p = path.resolve(process.cwd(), "src", "review", "reviewPricing.js");
      return send(res, 200, fs.readFileSync(p, "utf8"), "application/javascript; charset=utf-8");
    }

    if (u.pathname === "/detailPanel.js") {
      const p = path.resolve(process.cwd(), "src", "review", "detailPanel.js");
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

    if (u.pathname === "/") {
      return send(
        res,
        200,
        fs.readFileSync(reviewPagePath, "utf8"),
        "text/html; charset=utf-8"
      );
    }
        
    if (u.pathname === "/api/accounts") {
      return handleAccountsRoute({
        res,
        send,
      });
    }

    if (u.pathname === "/api/config" && req.method === "GET") {
      return handleGetConfig({
        res,
        send,
        readReviewConfig,
      });
    }

    if (u.pathname === "/api/config" && req.method === "POST") {
      return handlePostConfig({
        req,
        res,
        send,
        writeReviewConfigPatch,
      });
    }

    if (u.pathname === "/api/index") {
      return handleIndexRoute({
        res,
        send,
        safeJoin,
        readJson,
        baseDir,
      });
    }

    if (u.pathname === "/api/items") {
      return handleItemsRoute({
        req,
        res,
        u,
        send,
        safeJoin,
        readJson,
        inferQboClass,
        matchesAnyBillingAddress,
        normalizeAddress,
        applyLocationAliasesToRow,
        inferThrSplit,
        pickPoNumber,
        rateRowIncludesActualTimes,
      });
    }

    if (u.pathname === "/api/overrides" && req.method === "GET") {
      return handleGetOverrides({
        u,
        res,
        send,
        safeJoin,
        readJson,
      });
    }

    if (u.pathname === "/api/overrides" && req.method === "POST") {
      return handlePostOverrides({
        req,
        res,
        send,
        safeJoin,
        writeJson,
        baseDir,
      });
    }

    if (u.pathname === "/api/export-qbo" && req.method === "GET") {
      try {
        const acct = String(u.query.acct || "").trim();
        const period = String(u.query.period || "").trim();
        const invoiceType = String(u.query.invoiceType || "single").trim();

        if (!acct || !period) {
          return send(res, 400, "Missing acct/period", "text/plain; charset=utf-8");
        }

        const grouped = buildGroupedInvoicesForSet({
          baseDir,
          acct,
          period,
          invoiceType,
          safeJoin,
          readReviewConfig,
        });
        assertNoInvoiceNoCollisions(grouped);
        const csvRows = buildCsvRowsFromGrouped(grouped, period, { fmtQboDate });
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

            const grouped = buildGroupedInvoicesForSet({
              baseDir,
              acct,
              period,
              invoiceType: "single",
              safeJoin,
              readReviewConfig,
            });

            for (const inv of grouped) {
              const dataRows = buildCsvRowsFromGrouped([inv], period, { fmtQboDate }).slice(1); // no header
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

          const invoiceSeqByPeriod = new Map();

          for (const inv of allInvoiceGroups) {
            const periodEndIso = String(inv.period || "").split("_")[2] || "";
            const prefix = compactDateForDocNum(periodEndIso);

            const nextSeq = (invoiceSeqByPeriod.get(periodEndIso) || 0) + 1;
            invoiceSeqByPeriod.set(periodEndIso, nextSeq);

            const newInvoiceNo =
              prefix + String(nextSeq).padStart(3, "0");

            inv.invoiceNo = newInvoiceNo;

            for (const row of inv.rows) {
              row[1] = newInvoiceNo;
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