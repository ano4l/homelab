// Regenerate with: node scripts/build-icons.mjs
// Uses sharp from local dependencies, or NODE_PATH for a shared tools runtime.
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ink = '#161619';
const points = [];
const angle = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < 720; i++) {
  const y = 1 - (i / 719) * 2;
  const ring = Math.sqrt(1 - y * y);
  const x = Math.cos(angle * i) * ring;
  const z = Math.sin(angle * i) * ring;
  const depth = (z + 1) / 2;
  points.push({ x: 256 + x * 174, y: 256 + y * 174, z, r: 1.5 + depth * 2.7, opacity: .12 + depth * .82 });
}
points.sort((a, b) => a.z - b.z);
const particles = points.map(p => `    <circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${p.r.toFixed(2)}" opacity="${p.opacity.toFixed(2)}"/>`).join('\n');
// Paths keep the mark identical across devices without an installed font.
const mark = '<path d="m198 232 20 48 20-48m28 0v48m34-48-33 24 35 24" fill="none" stroke="#161619" stroke-width="9" stroke-linecap="square" stroke-linejoin="miter"/>';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="VK particle sphere">
  <rect width="512" height="512" fill="#fff"/>
  <g fill="${ink}">
${particles}
  </g>
  <rect x="178" y="216" width="148" height="80" rx="4" fill="#fff" fill-opacity=".96"/>
  ${mark}
</svg>\n`;
await writeFile('public/icons/vk-app-icon.svg', svg);
for (const size of [180, 192, 512]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/icons/vk-app-icon-${size}.png`);
}
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#fff"/>
  <path d="m5 9 5 14 5-14m4 0v14m8-14-8 7 8 7" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"/>
</svg>\n`;
await writeFile('public/icons/vk-favicon.svg', favicon);
console.log('Generated monochrome sphere icons: 180, 192, 512px and SVG favicon.');
