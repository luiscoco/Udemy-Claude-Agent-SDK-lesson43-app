import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { prepareWorkspace } from "./workspace.js";
import { definitions } from "./agents.js";
import { allowedTool } from "./policy.js";
import { MODES, validateConfig } from "./modes.js";
import type {
  Mode,
  RunConfig,
  RunResult,
  Observation,
  Catalog,
  LabEvent,
  Evidence,
} from "./protocol.js";
export { MODES, validateConfig };
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = { mode: "reviewer" };
const task = (name: string, body: string) =>
  `Use the Agent tool exactly once with subagent_type ${name}. Wait for its completed report before answering. Do not do the delegated work yourself. Task prompt: ${body} Return its short report.`;
export const PROMPTS: Record<Mode, string> = {
  reviewer: task(
    "code-reviewer",
    "Read auth.cjs and review the classroom role-check bug.",
  ),
  tests: task(
    "test-runner",
    "Run exactly node --test auth.test.cjs in the current directory. Report actual test failures. Do not modify files.",
  ),
  team: "Use Agent exactly twice, once for code-reviewer to read auth.cjs and once for test-runner to run exactly node --test auth.test.cjs. Request both in the same turn and wait for both reports. Do not inspect or run tests yourself. Summarize both under 100 words.",
  isolation: task(
    "isolation-probe",
    "Without tools, report the parent-only classroom label if explicitly provided here, otherwise UNKNOWN. No label is supplied. Do not guess.",
  ),
  briefing: task(
    "brief-checker",
    "The explicit classroom label for this task is BRIEF-43. Return BRIEF-43 only.",
  ),
  readonly: task(
    "code-reviewer",
    "Read auth.cjs. Explain the bug and state that your declared tools are read-only. Do not modify or execute anything.",
  ),
  model: task(
    "code-reviewer",
    "Read auth.cjs and review the classroom role-check bug.",
  ),
  filesystem: task(
    "file-reviewer",
    "Read auth.cjs and review the classroom role-check bug.",
  ),
  builtin: task(
    "general-purpose",
    "Read auth.cjs once and report the substring role-check bug under 50 words. Do not modify files or use other tools.",
  ),
};
export function redact(text: string) {
  for (const s of [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].filter(Boolean) as string[])
    text = text.split(s).join("[REDACTED]");
  return text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]");
}
export async function runAgent(
  value: RunConfig,
  emit: (e: LabEvent) => void,
  controller = new AbortController(),
) {
  const c = validateConfig(value),
    w = await prepareWorkspace(),
    before = await w.snapshot(),
    started = Date.now();
  const results: RunResult[] = [],
    delegations: any[] = [],
    childTools: any[] = [],
    reports: any[] = [],
    lifecycle: any[] = [],
    models = new Set<string>(),
    observations: Observation[] = [],
    exceptions: string[] = [];
  const observe = (kind: string, detail: any) => {
    const record = {
      sequence: observations.length + 1,
      atMs: Date.now() - started,
      kind,
      detail,
    };
    observations.push(record);
    emit({ type: "observation", record });
  };
  const run = async (cheap = false) => {
    const names =
      c.mode === "filesystem"
        ? ["file-reviewer"]
        : c.mode === "builtin"
          ? ["general-purpose"]
          : Object.keys(definitions(cheap));
    const options: Options = {
      cwd: w.cwd,
      model: MODEL,
      agents:
        c.mode === "filesystem" || c.mode === "builtin"
          ? undefined
          : definitions(cheap),
      tools: ["Agent", "Read", "Grep", "Glob", "Bash"],
      allowedTools: ["Agent", "Read", "Grep", "Glob", "Bash"],
      permissionMode: "dontAsk",
      settingSources: ["project"],
      forwardSubagentText: true,
      maxTurns: 8,
      maxBudgetUsd: 0.6,
      effort: "low",
      thinking: { type: "disabled" },
      abortController: controller,
      systemPrompt:
        "You are a classroom orchestrator. Delegate exactly as instructed and wait for completed reports. Never modify files. A private parent-only classroom label is PARENT-ONLY-43. Never include that label in any Agent request. Keep your final answer under 100 words.",
      env: {
        ...process.env,
        HOME: w.home,
        USERPROFILE: w.home,
        CLAUDE_CONFIG_DIR: w.sdkHome,
        ANTHROPIC_AUTH_TOKEN: undefined,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      },
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name !== "PreToolUse") return {};
                observe("tool-policy", {
                  name: i.tool_name,
                  input: i.tool_input,
                  agentId: i.agent_id ?? null,
                });
                if (allowedTool(w.cwd, i.tool_name, i.tool_input, names))
                  return {};
                return {
                  hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason:
                      "Use only declared classroom agents, fixed Read paths or the exact node --test auth.test.cjs command.",
                  },
                };
              },
            ],
          },
        ],
        SubagentStart: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name === "SubagentStart") {
                  const event = {
                    kind: "start",
                    atMs: Date.now() - started,
                    agentId: i.agent_id,
                    agentType: i.agent_type,
                  };
                  lifecycle.push(event);
                  observe("subagent-start", event);
                }
                return {};
              },
            ],
          },
        ],
        SubagentStop: [
          {
            hooks: [
              async (i) => {
                if (i.hook_event_name === "SubagentStop") {
                  const event = {
                    kind: "stop",
                    atMs: Date.now() - started,
                    agentId: i.agent_id,
                    agentType: i.agent_type,
                    report: i.last_assistant_message ?? null,
                  };
                  lifecycle.push(event);
                  reports.push({ ...event, kind: "stop-report" });
                  observe("subagent-stop", event);
                }
                return {};
              },
            ],
          },
        ],
      },
    };
    observe("query-options", {
      cheap,
      agents: options.agents ?? null,
      model: MODEL,
      forwardSubagentText: true,
      tools: options.tools,
      settingSources: options.settingSources,
    });
    try {
      for await (const message of query({ prompt: PROMPTS[c.mode], options })) {
        if (message.type === "assistant") {
          const parentId = message.parent_tool_use_id;
          models.add(message.message.model);
          for (const b of message.message.content) {
            if (b.type === "tool_use") {
              const record = {
                id: b.id,
                name: b.name,
                input: b.input,
                parentId,
              };
              if (!parentId && (b.name === "Agent" || b.name === "Task")) {
                delegations.push(record);
                observe("delegation", record);
              } else if (parentId) {
                childTools.push(record);
                observe("child-tool", record);
              } else observe("parent-tool", record);
            }
            if (b.type === "text") {
              if (parentId) observe("child-text", { parentId, text: b.text });
              else emit({ type: "answer", text: redact(b.text) });
            }
          }
        }
        if (message.type === "user")
          for (const b of typeof message.message.content === "string"
            ? []
            : message.message.content) {
            if (b.type === "tool_result") {
              const record = {
                toolUseId: b.tool_use_id,
                parentId: message.parent_tool_use_id,
                content: b.content,
                isError: b.is_error,
              };
              if (delegations.some((d) => d.id === b.tool_use_id)) {
                reports.push(record);
                observe("child-report", record);
              } else observe("tool-feedback", record);
            }
          }
        if (
          message.type === "system" &&
          ["task_started", "task_notification", "task_progress"].includes(
            message.subtype,
          )
        )
          observe(message.subtype, message);
        if (message.type === "result") {
          const record = {
            index: results.length + 1,
            label: c.mode + (cheap ? " � Haiku reviewer" : " � parent result"),
            sessionId: message.session_id,
            status: message.subtype,
            text:
              message.subtype === "success"
                ? message.result
                : message.errors.join("\n"),
            costUsd: message.total_cost_usd,
            modelUsage: message.modelUsage,
          };
          results.push(record);
          emit({ type: "result", record });
        }
      }
    } catch (e) {
      exceptions.push(redact(e instanceof Error ? e.message : String(e)));
      observe("exception", exceptions.at(-1));
    }
  };
  emit({
    type: "options",
    config: c,
    options: {
      model: MODEL,
      definitions:
        c.mode === "filesystem"
          ? ".claude/agents/file-reviewer.md"
          : c.mode === "builtin"
            ? "SDK general-purpose"
            : definitions(),
      forwardSubagentText: true,
      telemetryBoundary:
        "Child messages are forwarded to the host inspector; this does not mean every child tool result is inserted into the parent model context.",
      maxBudgetUsd: 0.6,
      fixture:
        "Deliberately flawed classroom role check. No production authentication or real secrets.",
      cleanup:
        "All temporary fixtures, configuration and transcripts are removed after evidence collection.",
    },
  });
  try {
    await run(false);
    if (c.mode === "model") await run(true);
    const catalog: Catalog = {
      delegations: delegations.map((d) => ({
        id: d.id,
        title: d.input.subagent_type || d.name,
      })),
      messages: delegations.map((d) => ({
        parentToolUseId: d.id,
        messages: observations.filter(
          (o) =>
            o.detail?.parentId === d.id ||
            (o.kind === "child-report" && o.detail.toolUseId === d.id),
        ),
      })),
    };
    emit({ type: "catalog", catalog });
    const after = await w.snapshot();
    const evidence: Evidence = {
      mode: c.mode,
      results,
      delegations,
      childTools,
      reports,
      lifecycle,
      models: [...models],
      catalog,
      definitions:
        c.mode === "filesystem"
          ? ".claude/agents/file-reviewer.md"
          : c.mode === "builtin"
            ? "SDK general-purpose"
            : definitions(),
      fixtureUnchanged: before.hash === after.hash,
      fixture: after,
      observations,
      exceptions,
    };
    emit({ type: "evidence", ...evidence });
  } finally {
    await w.cleanup();
  }
}
