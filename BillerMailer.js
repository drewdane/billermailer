process.title = "BillerMailer";
const { execSync, spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function pickFile() {
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Filter = 'CSV files (*.csv)|*.csv|All files (*.*)|*.*'
$dlg.Title = 'Select TripMaster export'
$dlg.InitialDirectory = '${require("path").join(process.cwd(), "data").replace(/\\/g, "\\\\")}'
$result = $dlg.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dlg.FileName
}
`;

  const result = spawnSync(
    "powershell",
    ["-NoProfile", "-STA", "-Command", psScript],
    { encoding: "utf8" }
  );

  if (result.error) return "";
  return String(result.stdout || "").trim();
}

function openBrowser(url) {
  spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

const file = pickFile();
console.log("Selected file:", file);

if (!file) {
  console.error("No file selected.");
  process.exit(1);
}

if (!fs.existsSync(file)) {
  console.error("File not found:", file);
  process.exit(1);
}

console.log("Harvesting...");
run(`node bm-harvest.js --in "${file}" --out data/output/bm_harvest_latest.csv --skipped data/output/bm_skipped_latest.csv`);

try {
  run(`rmdir /s /q data\\output\\review`);
} catch {}

console.log("Building review packets...");
run(`node bm-reviewpackets.js --in data/output/bm_harvest_latest.csv --outDir data/output/review`);

console.log("Launching review server...");
openBrowser("http://localhost:8787");
run(`node bm-review-server.js --dir data/output/review`);