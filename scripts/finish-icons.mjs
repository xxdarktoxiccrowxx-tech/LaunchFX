import { readFile, writeFile } from 'node:fs/promises';
// ICO embeds PNG representations without resampling or changing the vector-rendered artwork.
const sizes = [16, 32, 64, 128, 256];
const pngs = await Promise.all(sizes.map(size => readFile(`assets/icon.iconset/icon_${size === 64 ? 32 : size}x${size === 64 ? 32 : size}${size === 64 ? '@2x' : ''}.png`)));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
sizes.forEach((size, i) => {
  const start = 6 + i * 16;
  directory[start] = size === 256 ? 0 : size;
  directory[start + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, start + 4);
  directory.writeUInt16LE(32, start + 6);
  directory.writeUInt32LE(pngs[i].length, start + 8);
  directory.writeUInt32LE(offset, start + 12);
  offset += pngs[i].length;
});
await writeFile('assets/icon.ico', Buffer.concat([directory, ...pngs]));
console.log('Windows ICO created with five resolutions.');
