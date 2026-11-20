import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const output = "out";
const staticDirectory = "_next/static";
const generated = (await readdir(join(output, staticDirectory), { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(output.length));
const shell = ["/", "/manifest.json", "/icon.svg", ...generated.sort()];
const worker = await readFile("public/sw.js", "utf8");
const digest = createHash("sha256").update(worker);
for (const asset of shell) {
  digest.update(asset);
  digest.update(await readFile(join(output, asset === "/" ? "index.html" : asset)));
}
await writeFile(join(output, "sw.js"), worker
  .replace('const REVISION = "source";', `const REVISION = "${digest.digest("hex").slice(0, 16)}";`)
  .replace(/^const ASSETS = .*;$/m, () => `const ASSETS = ${JSON.stringify(shell)};`));
