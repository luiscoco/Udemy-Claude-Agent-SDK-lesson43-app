import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export const FIXTURE =
  '// Deliberately flawed classroom role check; not production authentication.\nexports.canAccess = role => typeof role === "string" && role.includes("admin");\n';
export async function prepareWorkspace() {
  const parent = resolve(realpathSync.native(tmpdir()), "claude-sdk43"),
    root = resolve(parent, randomUUID());
  const safe = () => {
    const p = relative(parent, root);
    if (!p || p.startsWith("..") || isAbsolute(p))
      throw new Error("Invalid classroom workspace.");
  };
  safe();
  const cwd = join(root, "project"),
    home = join(root, "home"),
    sdkHome = join(root, "sdk");
  for (const p of [cwd, home, sdkHome, join(cwd, ".claude", "agents")])
    await mkdir(p, { recursive: true });
  await writeFile(join(cwd, "auth.cjs"), FIXTURE);
  await writeFile(
    join(cwd, "auth.test.cjs"),
    'const{test}=require("node:test"),assert=require("node:assert/strict"),{canAccess}=require("./auth.cjs");test("admin is accepted",()=>assert.equal(canAccess("admin"),true));test("viewer is denied",()=>assert.equal(canAccess("viewer"),false));test("not-admin is denied",()=>assert.equal(canAccess("not-admin"),false));',
  );
  await writeFile(
    join(cwd, "CLAUDE.md"),
    "Classroom project. Do not modify files. Keep reports under 60 words.",
  );
  await writeFile(
    join(cwd, ".claude", "agents", "file-reviewer.md"),
    "---\nname: file-reviewer\ndescription: Classroom read-only code reviewer.\ntools: Read\nmodel: inherit\n---\nRead auth.cjs once. Identify the substring role-check bug. Do not modify files. Report under 50 words.",
  );
  async function snapshot() {
    const code = await readFile(join(cwd, "auth.cjs"), "utf8"),
      tests = await readFile(join(cwd, "auth.test.cjs"), "utf8");
    return {
      code,
      tests,
      hash: createHash("sha256")
        .update(code + tests)
        .digest("hex"),
    };
  }
  return {
    cwd,
    home,
    sdkHome,
    snapshot,
    async test() {
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      try {
        const r = await exec(process.execPath, ["--test", "auth.test.cjs"], {
          cwd,
          env,
          timeout: 15000,
        });
        return { passed: true, output: r.stdout };
      } catch (e) {
        return { passed: false, output: (e as { stdout?: string }).stdout };
      }
    },
    async cleanup() {
      safe();
      await rm(root, { recursive: true, force: true });
    },
  };
}
