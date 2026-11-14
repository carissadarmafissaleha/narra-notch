// Fails when the version in any shipped artifact differs from package.json.
// Run locally with `npm run version:check`; the release workflow runs it too.
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const pkg = JSON.parse(read("package.json"));
const version = pkg.version;
const build = version.split(".").join("");

const failures = [];
const expect = (label, actual) => {
  if (actual !== version) failures.push(`${label}: expected ${version}, found ${actual ?? "nothing"}`);
};

const first = (text, pattern) => text.match(pattern)?.[1];

expect("src-tauri/tauri.conf.json", first(read("src-tauri/tauri.conf.json"), /"version":\s*"([^"]+)"/));
expect("src-tauri/Cargo.toml", first(read("src-tauri/Cargo.toml"), /^version\s*=\s*"([^"]+)"/m));
expect(
  "src-tauri/Cargo.lock (package notch)",
  first(read("src-tauri/Cargo.lock"), /name = "notch"\r?\nversion = "([^"]+)"/),
);

const lock = JSON.parse(read("package-lock.json"));
expect("package-lock.json", lock.version);
expect("package-lock.json (packages[\"\"])", lock.packages?.[""]?.version);

const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]);
if (marketing.length === 0) failures.push("ios/App/App.xcodeproj/project.pbxproj: no MARKETING_VERSION");
for (const value of marketing) expect("iOS MARKETING_VERSION", value);
for (const value of builds) {
  if (value !== build) failures.push(`iOS CURRENT_PROJECT_VERSION: expected ${build}, found ${value}`);
}

const gradle = read("android/app/build.gradle");
expect("Android versionName", first(gradle, /versionName\s+"([^"]+)"/));
const code = first(gradle, /versionCode\s+(\d+)/);
if (code !== build) failures.push(`Android versionCode: expected ${build}, found ${code ?? "nothing"}`);

if (failures.length) {
  console.error("Version mismatch — run `npm run bump <version>` and commit the result:\n");
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}

console.log(`All shipped versions match ${version} (build ${build}).`);
