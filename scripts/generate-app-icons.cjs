const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");

const appIconDirectory = path.join(__dirname, "..", "public", "app-icon");
const sourceIcon = path.join(appIconDirectory, "icon.png");
const generatedIcons = [
  path.join(appIconDirectory, "icon.ico"),
  path.join(appIconDirectory, "icon.icns")
];

if (!fs.existsSync(sourceIcon)) {
  console.log("[icons] Add public/app-icon/icon.png to generate native app icons.");
  process.exit(0);
}

const sourceModifiedAt = fs.statSync(sourceIcon).mtimeMs;
const generatedIconsAreCurrent = generatedIcons.every((iconPath) => (
  fs.existsSync(iconPath) && fs.statSync(iconPath).mtimeMs >= sourceModifiedAt
));

if (generatedIconsAreCurrent) {
  console.log("[icons] Native app icons are current.");
  process.exit(0);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electron, [path.join(__dirname, "generate-app-icons-electron.cjs")], {
  env,
  stdio: "inherit",
  windowsHide: true
});

if (result.error) {
  console.error(`[icons] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
