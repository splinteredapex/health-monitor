// Renders PNG icons from inline SVG using the pre-installed Playwright Chromium.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" ${pad ? '' : 'rx="112"'} fill="#0f2340"/><g transform="${pad ? 'translate(77 77) scale(0.7)' : ''}"><path d="M96 276h88l36-84 56 168 40-108 24 24h76" fill="none" stroke="#5fb3ad" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
const targets = [
  ['public/pwa-192x192.png', 192, false],
  ['public/pwa-512x512.png', 512, false],
  ['public/maskable-512x512.png', 512, true],
  ['public/apple-touch-icon.png', 180, true],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, maskable] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg(maskable)).toString('base64')}">`);
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
}
await browser.close();
console.log('icons written');
