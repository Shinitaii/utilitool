#!/usr/bin/env node
// Enforces the Android cleartext-traffic guard documented in BUILD.md. `android/`
// is git-ignored and regenerated locally via `npx cap add android`, so this step
// was previously a manual, unenforced instruction — easy to forget on a fresh
// checkout, a new machine, or after deleting `android/` to fix a sync issue. Wired
// into `cap:add:android` and `cap:sync` (see package.json) so it runs every time
// those commands do, instead of relying on a human to remember BUILD.md.
//
// Safe to run repeatedly: no-ops if the config already exists and is wired up.
// No-ops (with a warning, not a failure) if `android/` hasn't been generated yet,
// since `cap:add:android` runs this only after `cap add android` succeeds, but a
// bare `npm install` or first clone shouldn't fail over a platform that hasn't
// been added.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(__dirname, "..");
const androidRoot = join(mobileRoot, "android");
const xmlDir = join(androidRoot, "app", "src", "main", "res", "xml");
const configPath = join(xmlDir, "network_security_config.xml");
const manifestPath = join(androidRoot, "app", "src", "main", "AndroidManifest.xml");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

function main() {
  if (!existsSync(androidRoot)) {
    console.warn(
      "[network-security-config] android/ not found yet — skipping " +
        "(run `npm run cap:add:android` first)."
    );
    return;
  }

  let changed = false;

  if (!existsSync(configPath)) {
    mkdirSync(xmlDir, { recursive: true });
    writeFileSync(configPath, NETWORK_SECURITY_CONFIG, "utf8");
    console.log(`[network-security-config] created ${configPath}`);
    changed = true;
  }

  if (!existsSync(manifestPath)) {
    throw new Error(
      `[network-security-config] android/ exists but AndroidManifest.xml is missing at ${manifestPath} — android/ may be partially generated; try removing it and re-running \`npm run cap:add:android\`.`
    );
  }

  const manifest = readFileSync(manifestPath, "utf8");
  const applicationTagMatch = manifest.match(/<application\b[^>]*>/s);

  if (!applicationTagMatch) {
    throw new Error(
      `[network-security-config] could not find an <application> tag in ${manifestPath} — apply android:networkSecurityConfig="@xml/network_security_config" manually.`
    );
  }

  const applicationTag = applicationTagMatch[0];
  if (!applicationTag.includes("android:networkSecurityConfig")) {
    const patchedTag = applicationTag.replace(
      />$/,
      '\n        android:networkSecurityConfig="@xml/network_security_config">'
    );
    writeFileSync(manifestPath, manifest.replace(applicationTag, patchedTag), "utf8");
    console.log(`[network-security-config] wired networkSecurityConfig into ${manifestPath}`);
    changed = true;
  }

  console.log(
    changed
      ? "[network-security-config] cleartext traffic protection applied."
      : "[network-security-config] already up to date."
  );
}

main();
