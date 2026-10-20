import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('resources', { recursive: true });
await sharp('resources/icon.svg').resize(512, 512).png().toFile('resources/icon.png');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(size => sharp('resources/icon.svg').resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((data, i) => {
  const p = 6 + 16 * i;
  header[p] = sizes[i] % 256; header[p + 1] = sizes[i] % 256;
  header.writeUInt16LE(1, p + 4); header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(data.length, p + 8); header.writeUInt32LE(offset, p + 12);
  offset += data.length;
});
await writeFile('resources/icon.ico', Buffer.concat([header, ...images]));
// A visual contact sheet for checking the actual small raster sizes on both themes.
const cards = [];
for (let row = 0; row < 2; row++) {
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const canvas = sharp({ create: { width: 280, height: 300, channels: 4, background: row ? '#151730' : '#eee8d9' } });
    const label = Buffer.from(`<svg width="280" height="30"><text x="140" y="22" text-anchor="middle" fill="${row ? '#e7e6f4' : '#29251e'}" font-size="16">${size}px</text></svg>`);
    cards.push({ input: await canvas.composite([{ input: images[i], left: Math.floor((280 - size) / 2), top: Math.floor((270 - size) / 2) }, { input: label, left: 0, top: 270 }]).png().toBuffer(), left: i * 280, top: row * 300 });
  }
}
await mkdir('build', { recursive: true });
await sharp({ create: { width: 1960, height: 600, channels: 4, background: '#eee8d9' } }).composite(cards).png().toFile('build/icon-preview.png');
console.log('Generated SVG-derived PNG, multi-size ICO and build/icon-preview.png');
