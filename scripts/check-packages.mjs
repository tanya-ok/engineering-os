#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const names = process.argv.length > 2 ? process.argv.slice(2) : ["rag", "dashboard"];
for (const name of names) {
  assert.ok(["rag", "dashboard"].includes(name), "Unknown package");
  const [archive] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: `${root}/${name}`,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const paths = new Set(archive.files.map((file) => file.path));
  for (const path of ["LICENSE", "README.md", "dist/cli.js"]) {
    assert.ok(paths.has(path), `${name}: missing runtime or license file: ${path}`);
  }
  for (const path of paths) {
    assert.ok(
      !/^(src|web|\.beads|\.data|node_modules)\//.test(path),
      `${name}: non-runtime directory in archive`,
    );
    assert.ok(
      !/(^|\/)(vaults|routing|dashboard)\.json$/.test(path),
      `${name}: local configuration in archive`,
    );
    assert.ok(
      !/(^|\/)\.env($|\.)|\.(db|sqlite|pem|key)$/.test(path),
      `${name}: private state in archive`,
    );
  }
  if (name === "dashboard") {
    for (const path of ["public/bundle.js", "public/index.html", "fixtures/beads.sample.jsonl"]) {
      assert.ok(paths.has(path), `dashboard: missing application asset: ${path}`);
    }
  }
  console.log(
    `${name}: ${paths.size} intended archive files; runtime and privacy path checks passed`,
  );
}
