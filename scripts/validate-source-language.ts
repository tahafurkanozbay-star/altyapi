import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const { stdout } = await execFileAsync("git", ["ls-files"], { encoding: "utf8" });
const tracked = stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
const forbiddenExecutableSources = tracked.filter((path) => /\.(?:js|jsx|mjs|cjs)$/i.test(path));
const errors: string[] = [];

if (forbiddenExecutableSources.length > 0) {
  errors.push(`First-party executable source must be TypeScript; tracked JavaScript found: ${forbiddenExecutableSources.join(", ")}`);
}

for (const path of tracked.filter((entry) => entry.endsWith(".html"))) {
  const html = await readFile(path, "utf8");
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/i.test(match[1] ?? ""))
    .filter((match) => !/\btype\s*=\s*["'](?:application\/ld\+json|application\/json)["']/i.test(match[1] ?? ""))
    .filter((match) => (match[2] ?? "").trim().length > 0);
  if (inlineScripts.length > 0) errors.push(`${path} içinde TypeScript guardrail'ini aşan inline JavaScript bulundu.`);
}

for (const required of ["src/boot.ts", "worker/sw.ts", "scripts/build-service-worker.ts"]) {
  if (!tracked.includes(required)) errors.push(`TypeScript kaynak zincirinin gerekli dosyası eksik: ${required}`);
}

if (errors.length > 0) {
  console.error("Kaynak dili doğrulaması başarısız:\n- " + errors.join("\n- "));
  process.exit(1);
}

console.log(`✓ Kaynak dili doğrulandı: ${tracked.length} tracked dosyada first-party executable JavaScript kaynağı yok.`);
