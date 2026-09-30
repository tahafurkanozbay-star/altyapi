import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const SOURCE_ROOTS = ["src", "scripts", "tests", "worker"] as const;
const FORBIDDEN_AUTHORED_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const errors: string[] = [];

for (const root of SOURCE_ROOTS) {
  await walk(root);
}

const generatedWorker = await readFile("public/sw.js", "utf8");
if (!generatedWorker.startsWith("/* AUTO-GENERATED from worker/service-worker.ts. DO NOT EDIT. */")) {
  errors.push("public/sw.js generated-artifact başlığı taşımıyor; Service Worker kaynağı worker/service-worker.ts olmalıdır.");
}

if (errors.length > 0) {
  console.error("Kaynak dil doğrulaması başarısız:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log("✓ First-party uygulama, test, araç ve Service Worker kaynakları TypeScript/TSX olarak doğrulandı.");

async function walk(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!entry.isFile()) continue;
    if (FORBIDDEN_AUTHORED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      errors.push(`${relative(".", path)} elde yazılmış JavaScript kaynağı içeriyor.`);
    }
  }
}
