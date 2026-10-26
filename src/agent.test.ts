import { test } from "node:test";
import assert from "node:assert/strict";
import { definitions } from "./agents.js";
import { allowedTool } from "./policy.js";
import { validateConfig } from "./modes.js";
import { prepareWorkspace } from "./workspace.js";
test("reviewer has separate selection description and role prompt", () => {
  const d = definitions()["code-reviewer"];
  assert.ok(d.description.includes("reviewer"));
  assert.ok(d.prompt.includes("Read auth.cjs"));
  assert.deepEqual(d.tools, ["Read", "Grep", "Glob"]);
  assert.ok(!d.tools!.includes("Bash"));
});
test("model override changes only the reviewer choice", () => {
  assert.equal(definitions()["code-reviewer"].model, "inherit");
  assert.equal(definitions(true)["code-reviewer"].model, "haiku");
  assert.deepEqual(
    definitions(true)["test-runner"],
    definitions()["test-runner"],
  );
});
test("Agent calls require a known specialist and do not carry parent-only label", () => {
  const names = Object.keys(definitions());
  assert.ok(
    allowedTool(
      "C:/lab",
      "Agent",
      { subagent_type: "code-reviewer", prompt: "Read auth.cjs" },
      names,
    ),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Agent",
      { subagent_type: "unknown", prompt: "Read auth.cjs" },
      names,
    ),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Agent",
      { subagent_type: "isolation-probe", prompt: "PARENT-ONLY-43" },
      names,
    ),
  );
});
test("file reads and scans stay inside disposable project", () => {
  assert.ok(allowedTool("C:/lab", "Read", { file_path: "auth.cjs" }, []));
  assert.ok(!allowedTool("C:/lab", "Read", { file_path: "../.env" }, []));
  assert.ok(
    !allowedTool("C:/lab", "Grep", { path: "C:/outside", pattern: "x" }, []),
  );
  assert.ok(allowedTool("C:/lab", "Glob", { pattern: "auth.*" }, []));
});
test("only the real test command can execute", () => {
  assert.ok(
    allowedTool("C:/lab", "Bash", { command: "node --test auth.test.cjs" }, []),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Bash",
      { command: "node --test auth.test.cjs; echo extra" },
      [],
    ),
  );
  assert.ok(
    !allowedTool(
      "C:/lab",
      "Write",
      { file_path: "auth.cjs", content: "fix" },
      [],
    ),
  );
});
test("browser cannot inject definitions, model or paths", () => {
  assert.deepEqual(validateConfig({ mode: "team" }), { mode: "team" });
  for (const x of [
    { mode: "unknown" },
    { mode: "team", agents: {} },
    { mode: "model", model: "other" },
  ])
    assert.throws(() => validateConfig(x));
});
test("actual test fixture exposes the intentional role-check bug without changing files", async () => {
  const w = await prepareWorkspace();
  try {
    const before = await w.snapshot(),
      r = await w.test(),
      after = await w.snapshot();
    assert.equal(r.passed, false);
    assert.ok(r.output?.includes("not-admin"));
    assert.equal(before.hash, after.hash);
  } finally {
    await w.cleanup();
  }
});
