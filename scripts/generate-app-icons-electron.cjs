const { app, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { createIco, createIcns } = require("./icon-containers.cjs");

const appIconDirectory = path.join(__dirname, "..", "public", "app-icon");
const sourceIcon = path.join(appIconDirectory, "icon.png");
const windowsIcon = path.join(appIconDirectory, "icon.ico");
const macIcon = path.join(appIconDirectory, "icon.icns");

app.whenReady().then(() => {
  try {
    generateIcons();
    console.log("[icons] Generated icon.ico and icon.icns from icon.png.");
    app.exit(0);
  } catch (error) {
    console.error(`[icons] ${error instanceof Error ? error.message : String(error)}`);
    app.exit(1);
  }
});

function generateIcons() {
  const source = nativeImage.createFromPath(sourceIcon);
  if (source.isEmpty()) {
    throw new Error("public/app-icon/icon.png is not a readable PNG image.");
  }

  const sourceSize = source.getSize();
  if (sourceSize.width !== sourceSize.height) {
    console.warn("[icons] icon.png is not square; generated icons may look stretched.");
  }

  fs.mkdirSync(appIconDirectory, { recursive: true });
  fs.writeFileSync(windowsIcon, createIco(source));
  fs.writeFileSync(macIcon, createIcns(source));
}
