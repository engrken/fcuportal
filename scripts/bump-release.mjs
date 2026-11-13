import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Beta releases: fixes advance the beta iteration; features advance minor. */
export function nextReleaseVersion(current, kind) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(?:beta|rc)\.(\d+))?$/.exec(current);
  if (!match) throw new Error("Expected a semantic version such as 0.2.0-beta.1.");
  let [, major, minor, patch, beta] = match.map((part, index) => index ? Number(part) : part);
  if (kind === "fix") {
    if (beta !== undefined) return `${major}.${minor}.${patch}-beta.${beta + 1}`;
    return `${major}.${minor}.${patch + 1}-beta.1`;
  }
  if (kind === "feature") return `${major}.${minor + 1}.0-beta.1`;
  if (kind === "major") return `${major + 1}.0.0-beta.1`;
  throw new Error("Choose fix, feature, or major.");
}

async function main() {
  const [kind, ...noteParts] = process.argv.slice(2);
  const note = noteParts.join(" ").trim();
  if (!["fix", "feature", "major"].includes(kind) || note.length < 8) {
    throw new Error('Usage: npm run version:fix -- "Describe the actual fix" (also version:feature or version:major)');
  }
  const pkgFile = join(root, "package.json");
  const lockFile = join(root, "package-lock.json");
  const notesFile = join(root, "src", "data", "releases.json");
  const [pkg, lock, notes] = await Promise.all([pkgFile, lockFile, notesFile].map(async file => JSON.parse(await readFile(file, "utf8"))));
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) {
    throw new Error("package.json and package-lock.json version values must match.");
  }
  if (!Array.isArray(notes) || notes[0]?.version !== pkg.version) {
    throw new Error("Latest release note must match package.json before bumping.");
  }
  const next = nextReleaseVersion(pkg.version, kind);
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = type => dateParts.find(item => item.type === type)?.value ?? "00";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  pkg.version = next;
  lock.version = next;
  lock.packages[""].version = next;
  notes.unshift({ version: next, date, kind, changes: [note] });
  await Promise.all([
    writeFile(pkgFile, JSON.stringify(pkg, null, 2) + "\n"),
    writeFile(lockFile, JSON.stringify(lock, null, 2) + "\n"),
    writeFile(notesFile, JSON.stringify(notes, null, 2) + "\n")
  ]);
  console.log(`SAGA release set to v${next}. Commit the version files with the related fix or feature.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
