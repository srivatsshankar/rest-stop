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

module.exports = {
  createIco,
  createIcns,
  icoSizes,
  icnsSizes
};
