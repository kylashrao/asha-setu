import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const output = "out";
const staticDirectory = "_next/static";
const generated = (await readdir(join(output, staticDirectory), { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(output.length));
// Keep the offline document and its static assets in the same cache revision.
const shell = new Map([
  ["/", "index.html"],
  ...["/manifest.json", "/icon.svg", ...generated.sort()].map((asset) => [asset, asset]),
]);
const worker = await readFile("public/sw.js", "utf8");
const digest = createHash("sha256").update(worker);
for (const [url, file] of shell) {
  digest.update(url);
  digest.update(await readFile(join(output, file)));
}
await writeFile(join(output, "sw.js"), worker
  .replace('const REVISION = "source";', `const REVISION = "${digest.digest("hex").slice(0, 16)}";`)
  .replace(/^const ASSETS = .*;$/m, () => `const ASSETS = ${JSON.stringify([...shell.keys()])};`));
