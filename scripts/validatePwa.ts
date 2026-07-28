import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const publicDir = path.join(root, "public");
const manifestPath = path.join(publicDir, "manifest.json");
const serviceWorkerPath = path.join(publicDir, "sw.js");
const nextConfigPath = path.join(root, "next.config.ts");

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 4);
  assert.ok(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable"));
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length > 0);

  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  for (const icon of manifest.icons) {
    const iconPath = path.join(publicDir, icon.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(iconPath), `Missing PWA icon: ${icon.src}`);
    const metadata = await sharp(iconPath).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes, `Invalid dimensions: ${icon.src}`);
  }

  assert.ok(fs.existsSync(path.join(publicDir, "offline.html")), "Missing offline fallback page");

  const serviceWorker = fs.readFileSync(serviceWorkerPath, "utf8");
  new vm.Script(serviceWorker, { filename: serviceWorkerPath });
  assert.ok(serviceWorker.includes("url.origin !== self.location.origin"));
  assert.ok(serviceWorker.includes("url.pathname.startsWith('/api/')"));
  assert.ok(serviceWorker.includes("url.searchParams.has('_rsc')"));
  assert.ok(serviceWorker.includes("networkFirstNavigation"));
  assert.ok(serviceWorker.includes("getSafeNotificationUrl"));
  assert.equal(serviceWorker.includes("staleWhileRevalidate"), false);
  assert.equal(serviceWorker.includes("/dashboard',"), false);
  assert.equal(serviceWorker.includes("/community',"), false);

  const nextConfig = fs.readFileSync(nextConfigPath, "utf8");
  assert.ok(nextConfig.includes("source: '/sw.js'"));
  assert.ok(nextConfig.includes("no-cache, no-store, must-revalidate"));
  assert.ok(nextConfig.includes("source: '/manifest.json'"));
  assert.ok(nextConfig.includes("source: '/icon-:size.png'"));

  console.log("PWA validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
