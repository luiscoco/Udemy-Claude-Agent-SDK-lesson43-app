import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
export function definitions(cheap = false): Record<string, AgentDefinition> {
  return {
    "code-reviewer": {
      description:
        "Read-only classroom code reviewer. Use to inspect auth.cjs for the deliberately flawed role check.",
      prompt:
        "Read auth.cjs once. Identify why not-admin is incorrectly accepted. Do not modify files or run commands. Report under 50 words.",
      tools: ["Read", "Grep", "Glob"],
      model: cheap ? "haiku" : "inherit",
      maxTurns: 5,
      effort: "low",
    },
    "test-runner": {
      description:
        "Classroom test specialist. Use to execute auth.test.cjs and report the actual results.",
      prompt:
        "Run Bash exactly once with command node --test auth.test.cjs in the current directory. Do not add cd, redirection, or other commands. Report the actual failing assertion under 50 words. Never fix files.",
      tools: ["Bash", "Read"],
      model: "inherit",
      maxTurns: 5,
      effort: "low",
    },
    "isolation-probe": {
      description: "Tests fresh child context without parent-only information.",
      prompt:
        "You receive no parent history or parent system prompt. If no private classroom label was explicitly supplied in your task prompt, reply exactly UNKNOWN. Do not guess or use tools.",
      tools: [],
      model: "inherit",
      maxTurns: 2,
    },
    "brief-checker": {
      description:
        "Returns an explicit classroom label supplied in the delegation task.",
      prompt:
        "Reply only with the classroom label supplied in the task. If none was supplied reply UNKNOWN. No tools.",
      tools: [],
      model: "inherit",
      maxTurns: 2,
    },
  };
}
