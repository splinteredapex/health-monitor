// Renders Android launcher icons and splash images with the pre-installed Playwright Chromium.
// Run after `npx cap add android`: node scripts/make-android-icons.mjs
import { chromium } from 'playwright';
import { readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const RES = 'android/app/src/main/res';
const NAVY = '#0f2340';
const pulse = (stroke = 36) => `<path d="M96 276h88l36-84 56 168 40-108 24 24h76" fill="none" stroke="#5fb3ad" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`;
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${NAVY}"/>${pulse()}</svg>`;
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${NAVY}"/><g transform="translate(51 51) scale(0.8)">${pulse()}</g></svg>`;
// Adaptive foreground: 108dp canvas, keep artwork in the central 66dp safe zone.
const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(108 108) scale(0.578)">${pulse(40)}</g></svg>`;
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(svg, w, h, file, bg = 'transparent') {
  await page.setViewportSize({ width: w, height: h });
  const side = Math.min(w, h);
  const img = side === w && side === h ? `<img style="width:${w}px;height:${h}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`
    : `<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;background:${bg}"><img style="width:${Math.round(side * 0.35)}px;height:${Math.round(side * 0.35)}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></div>`;
  await page.setContent(`<style>html,body{margin:0;background:${bg}}</style>${img}`);
  writeFileSync(file, await page.screenshot({ omitBackground: bg === 'transparent' }));
}
for (const [d, k] of Object.entries(DENS)) {
  const dir = `${RES}/mipmap-${d}`;
  await render(square, 48 * k, 48 * k, `${dir}/ic_launcher.png`);
  await render(round, 48 * k, 48 * k, `${dir}/ic_launcher_round.png`);
  await render(fg, 108 * k, 108 * k, `${dir}/ic_launcher_foreground.png`);
}
// Splash screens: keep each existing image's dimensions.
for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
  const f = `${RES}/${dir}/splash.png`;
  if (!existsSync(f)) continue;
  const out = execFileSync('python3', ['-c', `import struct;d=open('${f}','rb').read(24);print(*struct.unpack('>II',d[16:24]))`]).toString().trim().split(' ').map(Number);
  await render(square, out[0], out[1], f, NAVY);
}
await browser.close();
console.log('android icons written');
