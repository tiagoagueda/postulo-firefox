// Print the SHA-256 of every file under a directory, one "digest  path" line each, sorted, so
// that the package the release workflow built can be compared with the one signed later.
//
//   node scripts/digests.mjs dist

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function digests(root) {
  const lines = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
        lines.push(`${hash}  ${relative(root, path).split(sep).join("/")}`);
      }
    }
  };
  walk(root);
  return lines.sort((a, b) => a.slice(66).localeCompare(b.slice(66)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(digests(process.argv[2] || "dist").join("\n"));
}
