/**
 * Generate minimal valid PNG icons for the browser extension.
 * Creates 16x16, 48x48, and 128x128 icons with a simple design.
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

async function main() {
  let createCanvas;
  try {
    createCanvas = require('canvas').createCanvas;
  } catch {
    console.log('canvas module not found. Generating minimal placeholder PNGs.');
    console.log('Install canvas for better icons: npm install canvas');
    generateMinimalPNGs();
    return;
  }

  const sizes = [16, 48, 128];
  const iconsDir = path.join(__dirname, '..', 'extension', 'icons');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  for (const size of sizes) {
    const c = createCanvas(size, size);
    const ctx = c.getContext('2d');

    // Background: dark circle with record dot
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.4;

    // Outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, r + size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#2c3e50';
    ctx.fill();

    // Inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e74c3c';
    ctx.fill();

    // Record dot (small white circle)
    const dotR = size * 0.12;
    ctx.beginPath();
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const buf = c.toBuffer('image/png');
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
    console.log(`Created icon${size}.png`);
  }
}

function generateMinimalPNGs() {
  // Minimal 1x1 pixel valid PNGs as placeholders
  // Users should replace these with real icons
  const sizes = [16, 48, 128];
  const iconsDir = path.join(__dirname, '..', 'extension', 'icons');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  for (const size of sizes) {
    // Minimal valid 1x1 PNG (red pixel)
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
      0x00, 0x00, 0x03, 0x00, 0x01, 0x3f, 0x15, 0x37,
      0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
      0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
    console.log(`Created placeholder icon${size}.png (replace with real icon)`);
  }
}

main().catch(console.error);