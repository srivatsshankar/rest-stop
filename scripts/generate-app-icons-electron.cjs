const { app, nativeImage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const appIconDirectory = path.join(__dirname, "..", "public", "app-icon");
const sourceIcon = path.join(appIconDirectory, "icon.png");
const windowsIcon = path.join(appIconDirectory, "icon.ico");
const macIcon = path.join(appIconDirectory, "icon.icns");

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icnsSizes = [
  [16, "icp4"],
  [32, "icp5"],
  [64, "icp6"],
  [128, "ic07"],
  [256, "ic08"],
  [512, "ic09"],
  [1024, "ic10"]
];

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

function createIco(source) {
  const images = icoSizes.map((size) => ({
    size,
    data: resizeToPng(source, size)
  }));
  const header = Buffer.alloc(6);
  const directory = Buffer.alloc(images.length * 16);
  let imageOffset = header.length + directory.length;

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  images.forEach((image, index) => {
    const entryOffset = index * 16;
    directory[entryOffset] = image.size >= 256 ? 0 : image.size;
    directory[entryOffset + 1] = image.size >= 256 ? 0 : image.size;
    directory[entryOffset + 2] = 0;
    directory[entryOffset + 3] = 0;
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(image.data.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

function createIcns(source) {
  const chunks = icnsSizes.map(([size, type]) => {
    const data = resizeToPng(source, size);
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(data.length + header.length, 4);
    return Buffer.concat([header, data]);
  });
  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, 4, "ascii");
  fileHeader.writeUInt32BE(fileHeader.length + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
  return Buffer.concat([fileHeader, ...chunks]);
}

function resizeToPng(source, size) {
  return source.resize({ width: size, height: size, quality: "best" }).toPNG();
}
