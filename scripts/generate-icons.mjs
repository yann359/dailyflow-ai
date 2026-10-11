import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
await mkdir('public/icons', { recursive: true });
const svg = await readFile('public/icon.svg');
await Promise.all(
  [192, 512, 180].map(async (size) =>
    sharp(svg)
      .resize(size, size)
      .png()
      .toFile(
        `public/icons/${size === 180 ? 'apple-touch-icon' : `icon-${size}`}.png`,
      ),
  ),
);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#233e35' },
})
  .composite([
    {
      input: await sharp(svg).resize(320, 320).png().toBuffer(),
      gravity: 'center',
    },
  ])
  .png()
  .toFile('public/icons/icon-maskable.png');
