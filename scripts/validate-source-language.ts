import { readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOTS = ["src", "scripts", "tests"] as const;
const FORBIDDEN_EXECUTABLE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx"]);

interface LanguageAudit {
  typescriptFiles: number;
  forbiddenFiles: string[];
}

async function auditDirectory(root: string, directory: string, audit: LanguageAudit): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      await auditDirectory(root, absolute, audit);
      continue;
    }
    if (!entry.isFile()) continue;

    const extension = extname(entry.name).toLocaleLowerCase("en-US");
    const path = relative(".", absolute).replaceAll("\\", "/");
    if (TYPESCRIPT_EXTENSIONS.has(extension)) audit.typescriptFiles += 1;
    if (FORBIDDEN_EXECUTABLE_EXTENSIONS.has(extension)) audit.forbiddenFiles.push(path);
  }
}

const audit: LanguageAudit = { typescriptFiles: 0, forbiddenFiles: [] };
for (const root of ROOTS) await auditDirectory(root, root, audit);

if (audit.forbiddenFiles.length > 0) {
  console.error(
    "TypeScript kaynak sözleşmesi ihlal edildi. First-party çalıştırılabilir kaynaklarda JS/MJS/CJS/JSX kullanılamaz:\n- "
      + audit.forbiddenFiles.join("\n- ")
  );
  process.exit(1);
}

if (audit.typescriptFiles < 20) {
  console.error(`TypeScript kaynak denetimi beklenmeyen derecede az dosya buldu: ${audit.typescriptFiles}.`);
  process.exit(1);
}

console.log(`✓ Kaynak dili sözleşmesi geçerli: ${audit.typescriptFiles} TypeScript/TSX dosyası, 0 JavaScript kaynak dosyası.`);
