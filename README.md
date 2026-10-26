# Claude Agent SDK · Lesson 43 · Subagents fundamentals

Five linked student pages, large text, actual SDK experiments and coloured code in all thirteen UML steps.

## What you will learn

- Define focused specialists: Use the agents option with separate description and prompt fields. A reviewer and a test runner have different expertise and tool capabilities.
- Delegate through Agent: The parent invokes specialists through the real Agent tool. Inspect native tool-use IDs, child tool events and returned reports to distinguish delegation from a parent-only answer.
- Give a clear task brief: A fresh child does not automatically receive the parent’s history or system prompt. Compare a withheld classroom label with one explicitly supplied in the delegation prompt.
- Restrict each child’s tools: The code reviewer has Read, Grep and Glob; the test runner can execute one fixed Node test command. The intentionally flawed fixture is read-only throughout the lab.
- Inspect concurrency and models: Request two specialists in one turn and inspect actual start/stop times. Compare inherited and Haiku reviewer models using observed IDs and SDK-reported estimates, without promising a universal speed or cost result.
- Compare three creation paths: Run programmatic definitions, a real .claude/agents/file-reviewer.md definition loaded from project settings, and the SDK’s built-in general-purpose agent.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson43-app.git
cd .\Udemy-Claude-Agent-SDK-lesson43-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson43-subagents`. Open http://127.0.0.1:3143 and keep the terminal running. Node.js 24+, API credit and model access are required. Windows may require Git Bash.

## Create your .env file

Preserve an existing file. Enter your own model key, then restart. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3143
# Windows only, if needed:
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe

```

No GitHub token or Managed Agents IDs are required. Secrets, dependencies and teaching media stay outside Git.

## Run the experiments

### Run specialists and a team

Reviewer reads the toy module. Tests runs the actual assertion suite, including its intentional failure. Team requests both specialists in one turn and waits for reports. Inspect start/stop times; concurrency is observed rather than assumed.

```powershell
npm run sample:env -- reviewer
npm run sample:env -- tests
npm run sample:env -- team
```

### Compare isolation and explicit briefing

Isolation withholds the parent-only classroom label from the child task. Briefing explicitly supplies BRIEF-43. Readonly verifies the reviewer’s declared tools and actual child calls while file hashes remain unchanged.

```powershell
npm run sample:env -- isolation
npm run sample:env -- briefing
npm run sample:env -- readonly
```

### Compare models and creation paths

Model repeats the reviewer task with inherited and Haiku child models. Inspect observed IDs and native result estimates; these are not a controlled benchmark. Filesystem loads a real project agent definition; Builtin delegates to general-purpose.

```powershell
npm run sample:env -- model
npm run sample:env -- filesystem
npm run sample:env -- builtin
npm test
```

## How the app was built

### 1. Validate the classroom scenario

The browser selects a fixed experiment; it cannot inject agent definitions, model IDs, task prompts or arbitrary paths.

Source: `src/modes.ts`, selected lines 3–9. Surrounding code omitted.

```typescript
export function validateConfig(value: unknown): RunConfig {
  const c = value as Record<string, unknown>;
  if (!c || typeof c !== "object" || !MODES.includes(c.mode as never))
    throw new Error("Choose a listed subagent experiment.");
  if (Object.keys(c).some((k) => k !== "mode"))
    throw new Error("Only the classroom mode can be configured.");
  return { mode: c.mode as RunConfig["mode"] };
```

### 2. Define when and how a specialist works

description guides specialist selection; prompt defines its role and behavior. These required fields serve different purposes.

Source: `src/agents.ts`, selected lines 4–8. Surrounding code omitted.

```typescript
"code-reviewer": {
      description:
        "Read-only classroom code reviewer. Use to inspect auth.cjs for the deliberately flawed role check.",
      prompt:
        "Read auth.cjs once. Identify why not-admin is incorrectly accepted. Do not modify files or run commands. Report under 50 words.",
```

### 3. Choose child tools and model

Give the reviewer a read-only tool set. The model comparison changes its model override while the task and fixture remain fixed.

Source: `src/agents.ts`, selected lines 9–12. Surrounding code omitted.

```typescript
tools: ["Read", "Grep", "Glob"],
      model: cheap ? "haiku" : "inherit",
      maxTurns: 5,
      effort: "low",
```

### 4. Attach definitions and enable Agent

Programmatic modes pass the agents option and allow the actual Agent tool. Filesystem and built-in modes omit programmatic definitions.

Source: `src/agent.ts`, selected lines 100–107. Surrounding code omitted.

```typescript
agents:
        c.mode === "filesystem" || c.mode === "builtin"
          ? undefined
          : definitions(cheap),
      tools: ["Agent", "Read", "Grep", "Glob", "Bash"],
      allowedTools: ["Agent", "Read", "Grep", "Glob", "Bash"],
      permissionMode: "dontAsk",
      settingSources: ["project"],
```

### 5. Observe a native delegation

Detect top-level Agent tool-use blocks and retain their actual IDs and delegation inputs. A parent answer alone is not proof of delegation.

Source: `src/agent.ts`, selected lines 212–216. Surrounding code omitted.

```typescript
if (!parentId && (b.name === "Agent" || b.name === "Task")) {
                delegations.push(record);
                observe("delegation", record);
              } else if (parentId) {
                childTools.push(record);
```

### 6. Observe a real specialist start

Native start hooks identify the actual child and its start time. Independent start/stop events allow inspection of requested concurrency.

Source: `src/agent.ts`, selected lines 153–159. Surrounding code omitted.

```typescript
if (i.hook_event_name === "SubagentStart") {
                  const event = {
                    kind: "start",
                    atMs: Date.now() - started,
                    agentId: i.agent_id,
                    agentType: i.agent_type,
                  };
```

### 7. Constrain reads and test execution

Permit only the exact classroom test command. Read and scan capabilities remain inside the isolated fixture project; edits are rejected.

Source: `src/policy.ts`, selected lines 17–24. Surrounding code omitted.

```typescript
if (name === "Bash")
    return (
      typeof i.command === "string" &&
      i.command.trim() === "node --test auth.test.cjs"
    );
  if (name === "Read")
    return (
      typeof i.file_path === "string" &&
```

### 8. Correlate child tools with the Agent call

Child tool-use messages carry parent_tool_use_id. Correlate the nested activity with the originating Agent tool ID.

Source: `src/agent.ts`, selected lines 215–218. Surrounding code omitted.

```typescript
} else if (parentId) {
                childTools.push(record);
                observe("child-tool", record);
              } else observe("parent-tool", record);
```

### 9. Separate child text from parent output

Forwarded child text is shown in host telemetry; parent assistant text is rendered separately. Host observability is not the parent model’s full context.

Source: `src/agent.ts`, selected lines 220–224. Surrounding code omitted.

```typescript
if (b.type === "text") {
              if (parentId) observe("child-text", { parentId, text: b.text });
              else emit({ type: "answer", text: redact(b.text) });
            }
          }
```

### 10. Recognize the Agent tool return

Record actual Agent returns. A foreground return may contain the final report; background launches can be receipts followed by native completion notifications.

Source: `src/agent.ts`, selected lines 237–241. Surrounding code omitted.

```typescript
if (delegations.some((d) => d.id === b.tool_use_id)) {
                reports.push(record);
                observe("child-report", record);
              } else observe("tool-feedback", record);
            }
```

### 11. Capture native child completion

Record the native stop event and its final assistant message when provided. Preserve lifecycle timing instead of inventing progress.

Source: `src/agent.ts`, selected lines 172–179. Surrounding code omitted.

```typescript
if (i.hook_event_name === "SubagentStop") {
                  const event = {
                    kind: "stop",
                    atMs: Date.now() - started,
                    agentId: i.agent_id,
                    agentType: i.agent_type,
                    report: i.last_assistant_message ?? null,
                  };
```

### 12. Observe filesystem agent definitions

Create a real project Markdown agent definition. Project setting sources let the SDK discover it, while programmatic agents are omitted in that mode.

Source: `src/workspace.ts`, selected lines 35–37. Surrounding code omitted.

```typescript
join(cwd, ".claude", "agents", "file-reviewer.md"),
    "---\nname: file-reviewer\ndescription: Classroom read-only code reviewer.\ntools: Read\nmodel: inherit\n---\nRead auth.cjs once. Identify the substring role-check bug. Do not modify files. Report under 50 words.",
  );
```

### 13. Verify the fixture remains unchanged

Independently hash both fixture and tests after all reports. A successful reviewer result must not imply unobserved edits or fabricated test execution.

Source: `src/agent.ts`, selected lines 327–331. Surrounding code omitted.

```typescript
fixtureUnchanged: before.hash === after.hash,
      fixture: after,
      observations,
      exceptions,
    };
```

## Reference topics and limits

- Three actual creation paths: Programmatic modes use AgentDefinition objects. Filesystem mode loads .claude/agents/file-reviewer.md from an isolated project. Builtin mode invokes general-purpose. Each scenario verifies native Agent calls and child activity.
- Parent context versus host telemetry: Fresh children receive their role and task prompt, not the parent system prompt/history automatically. Project instructions can be inherited. forwardSubagentText explicitly exposes nested messages to this app’s host inspector; this does not insert every child tool call into the parent model context.
- Asynchronous results: Current SDK/CLI versions can launch child tasks asynchronously. Consume the whole query stream, inspect task events and child stop reports, and do not stop at the first parent result frame. Agent returns can be launch receipts rather than final reports.
- Measured scheduling: Team requests two specialists together. Native start and stop timestamps reveal the actual scheduling. Overlap, total latency and speedups vary with model scheduling and service conditions; this app does not promise that every run is parallel.
- Model and cost comparison: Model runs the same reviewer task with inherited and Haiku overrides. Display actual observed model IDs and SDK-reported result estimates. Prompt caching, multiple parent result frames and workload variation mean these numbers are not a universal price/performance benchmark; do not blindly sum cumulative frames.
- Tool scope and fixture purpose: The reviewer has Read/Grep/Glob; the test runner additionally has its exact Bash test command. Global hooks reject unrelated commands, paths, writes and unknown agent types. The toy substring role check is intentionally flawed; it is not production authentication guidance.
- Version and lifetime: AgentDefinition fields and asynchronous behavior depend on SDK/CLI version. This app pins its SDK, keeps all project settings isolated and removes fixtures, definitions and transcripts after evidence collection. The built-in model may vary; report observed IDs rather than assume them.

## References

- [Official SDK subagents documentation](https://code.claude.com/docs/en/agent-sdk/subagents)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)

Regenerate student pages with `python scripts/build-pages.py`. Run `npm test` for specialist definitions, bounded delegation, scoped tools, actual fixture behavior and startup checks.
