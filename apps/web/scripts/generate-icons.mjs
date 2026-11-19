// Gera os ícones PWA (PNG) do Pluton: quadrado escuro com um "P" claro, desenhado
// com formas geométricas simples (ícone original, sem fontes nem marcas de terceiros).
// Uso: pnpm --filter @pluton/web icons  — os PNGs gerados ficam versionados em public/.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const BG = [0x19, 0x19, 0x19];
const FG = [0xd3, 0xd3, 0xd3]; // #ffffffcf sobre #191919

/** O "P" em coordenadas unitárias (0..1). Mesma geometria de public/favicon.svg. */
function insideP(x, y) {
  const stem = x >= 0.32 && x <= 0.44 && y >= 0.24 && y <= 0.78;
  const bars = x >= 0.32 && x <= 0.5 && ((y >= 0.24 && y <= 0.34) || (y >= 0.46 && y <= 0.56));
  const d = Math.hypot(x - 0.5, y - 0.4);
  const bowl = x >= 0.5 && d <= 0.16 && d >= 0.06;
  return stem || bars || bowl;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const SS = 4; // supersampling 4×4 para suavizar as bordas
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 3 + 1);
    raw[row] = 0; // filtro "None"
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (insideP((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size)) hits++;
        }
      }
      const a = hits / (SS * SS);
      for (let ch = 0; ch < 3; ch++) {
        raw[row + 1 + px * 3 + ch] = Math.round(BG[ch] * (1 - a) + FG[ch] * a);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
for (const [name, size] of [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(publicDir, name), png(size));
  console.log(`public/${name} (${size}×${size})`);
}
