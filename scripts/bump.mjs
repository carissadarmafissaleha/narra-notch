// Sets the app version everywhere it lives: `npm run bump 1.2.0`.
// Commit and push afterwards; the release workflow builds and publishes it.
// `npm run version:check` verifies that no file was left behind.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run bump <major.minor.patch>");
  process.exit(1);
}

// Mobile build number: 2.0.3 -> 203. Monotonic across minor/patch bumps.
const build = version.split(".").join("");

const edit = (path, pattern, replacement) => {
  const text = readFileSync(path, "utf8");
  if (!pattern.test(text)) throw new Error(`No version found in ${path}`);
  writeFileSync(path, text.replace(pattern, replacement));
};

edit("package.json", /("version":\s*")[^"]+(")/, `$1${version}$2`);
edit("src-tauri/tauri.conf.json", /("version":\s*")[^"]+(")/, `$1${version}$2`);
edit("src-tauri/Cargo.toml", /^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`);
edit("src-tauri/Cargo.lock", /(name = "notch"\r?\nversion = ")[^"]+(")/, `$1${version}$2`);

// package-lock carries the root version twice; npm rewrites it on install, so
// keep both in sync here instead of letting `npm ci` silently bump them.
const lockPath = "package-lock.json";
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
lock.version = version;
if (lock.packages?.[""]) lock.packages[""].version = version;
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

// iOS reads these from the Xcode build settings (Info.plist uses the variables).
edit(
  "ios/App/App.xcodeproj/project.pbxproj",
  /MARKETING_VERSION = [^;]+;/g,
  `MARKETING_VERSION = ${version};`,
);
edit(
  "ios/App/App.xcodeproj/project.pbxproj",
  /CURRENT_PROJECT_VERSION = [^;]+;/g,
  `CURRENT_PROJECT_VERSION = ${build};`,
);

// Android reads these from Gradle; they show up in the APK details screen.
edit("android/app/build.gradle", /versionCode\s+\d+/, `versionCode ${build}`);
edit("android/app/build.gradle", /versionName\s+"[^"]+"/, `versionName "${version}"`);

console.log(`Version set to ${version} (build ${build}). Commit and push to publish the release.`);
