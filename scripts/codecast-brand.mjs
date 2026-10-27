import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Crop and resample the supplied artwork; no traced or re-drawn substitute.
export async function prepareBrand(root, publicDir, sourceDir) {
  const integration = path.join(root, 'integrations/codecast');
  const brand = JSON.parse(await readFile(path.join(integration, 'brand.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const out = path.join(publicDir, 'collo-brand');
  await mkdir(out, { recursive: true });
  const crop = await sharp(path.join(integration, brand.sourceMark))
    .extract(brand.markCrop)
    .png()
    .toBuffer();
  const sizes = [16, 24, 32, 48, 64, 128, 192, 256, 512];
  const icons = new Map();
  for (const size of sizes) {
    const mark = await sharp(crop)
      .resize({ width: Math.round(size * 0.86), height: Math.round(size * 0.7), fit: 'inside' })
      .toBuffer();
    const png = await sharp({
      create: { width: size, height: size, channels: 4, background: brand.paper },
    })
      .composite([{ input: mark, gravity: 'centre' }])
      .png()
      .toBuffer();
    icons.set(size, png);
    await writeFile(path.join(out, `mark-${size}.png`), png);
  }
  const entries = [16, 24, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach((size, i) => {
    const p = 6 + 16 * i,
      png = icons.get(size);
    header[p] = header[p + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, p + 4);
    header.writeUInt16LE(32, p + 6);
    header.writeUInt32LE(png.length, p + 8);
    header.writeUInt32LE(offset, p + 12);
    offset += png.length;
  });
  const ico = Buffer.concat([header, ...entries.map((s) => icons.get(s))]);
  await writeFile(path.join(out, 'app.ico'), ico);
  await writeFile(path.join(publicDir, 'favicon.ico'), ico);
  for (const [file, size] of Object.entries({
    'favicon-16x16.png': 16,
    'favicon-32x32.png': 32,
    'apple-touch-icon.png': 192,
    'android-chrome-192x192.png': 192,
    'android-chrome-512x512.png': 512,
    'logo.png': 256,
    'logo-final.png': 256,
  }))
    await writeFile(path.join(publicDir, file), icons.get(size));
  await writeFile(
    path.join(publicDir, 'logo.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image width="256" height="256" href="data:image/png;base64,${icons.get(256).toString('base64')}"/></svg>`,
  );
  await writeFile(
    path.join(sourceDir, 'packages/web/collo/productBrand.ts'),
    `// Generated from the owned brand configuration.\nexport const productBrand = ${JSON.stringify({ name: brand.name, description: brand.description, markUrl: brand.markUrl, attribution: brand.attribution, version: pkg.version })} as const;\n`,
  );
}
