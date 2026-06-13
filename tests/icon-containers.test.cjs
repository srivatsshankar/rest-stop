const test = require("node:test");
const assert = require("node:assert/strict");
const { createIco, createIcns, icoSizes, icnsSizes } = require("../scripts/icon-containers.cjs");

function fakeImageSource() {
  return {
    resize({ width, height, quality }) {
      assert.equal(width, height);
      assert.equal(quality, "best");
      return {
        toPNG() {
          return Buffer.from(`png:${width}`);
        }
      };
    }
  };
}

test("createIco writes a valid ICO directory", () => {
  const ico = createIco(fakeImageSource());
  const entryCount = ico.readUInt16LE(4);

  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(entryCount, icoSizes.length);

  let previousOffset = 6 + entryCount * 16;
  icoSizes.forEach((size, index) => {
    const entryOffset = 6 + index * 16;
    assert.equal(ico[entryOffset], size >= 256 ? 0 : size);
    assert.equal(ico[entryOffset + 1], size >= 256 ? 0 : size);
    assert.equal(ico.readUInt16LE(entryOffset + 4), 1);
    assert.equal(ico.readUInt16LE(entryOffset + 6), 32);

    const imageSize = ico.readUInt32LE(entryOffset + 8);
    const imageOffset = ico.readUInt32LE(entryOffset + 12);
    assert.equal(imageOffset, previousOffset);
    assert.equal(ico.subarray(imageOffset, imageOffset + imageSize).toString(), `png:${size}`);
    previousOffset = imageOffset + imageSize;
  });
});

test("createIcns writes typed ICNS chunks", () => {
  const icns = createIcns(fakeImageSource());
  let offset = 8;

  assert.equal(icns.toString("ascii", 0, 4), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);

  icnsSizes.forEach(([size, type]) => {
    const chunkLength = icns.readUInt32BE(offset + 4);
    assert.equal(icns.toString("ascii", offset, offset + 4), type);
    assert.equal(icns.subarray(offset + 8, offset + chunkLength).toString(), `png:${size}`);
    offset += chunkLength;
  });

  assert.equal(offset, icns.length);
});
