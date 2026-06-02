import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const force = process.argv.includes("--force");
const schemaDirectory = join(process.cwd(), "prisma");

function sqliteFilePath(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.startsWith("file:")) return join(schemaDirectory, "dev.db");

  const rawPath = databaseUrl.slice("file:".length).split("?")[0] || "./dev.db";
  if (/^[/\\]/.test(rawPath) || /^[A-Za-z]:[/\\]/.test(rawPath)) return rawPath;

  return join(schemaDirectory, rawPath);
}

const databasePath = sqliteFilePath();

if (force && existsSync(databasePath)) {
  unlinkSync(databasePath);
}

if (existsSync(databasePath)) {
  const push = spawnSync(
    "prisma",
    ["db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: true,
      env: process.env
    }
  );

  if (push.status !== 0) {
    console.error(push.stderr || push.stdout);
    process.exit(push.status ?? 1);
  }

  console.log("SQLite schema updated.");
  process.exit(0);
}

const diff = spawnSync(
  "prisma",
  [
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script"
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: true,
    env: process.env
  }
);

if (diff.status !== 0 || !diff.stdout) {
  console.error(diff.stderr || diff.stdout);
  process.exit(diff.status ?? 1);
}

const execute = spawnSync(
  "prisma",
  ["db", "execute", "--stdin", "--schema", "prisma/schema.prisma"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    input: diff.stdout,
    shell: true,
    env: process.env
  }
);

if (execute.status !== 0) {
  console.error(execute.stderr || execute.stdout);
  process.exit(execute.status ?? 1);
}

console.log("SQLite schema bootstrapped.");
