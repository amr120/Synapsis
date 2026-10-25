// The tool-using agent loop behind use_tools (and later run_workflow): Gemini decides which of the
// task's tools to call, we call them for real through the tool service, and feed the results back
// until the model answers. Tool failures map to the protocol's upstream_* errors.
import { FunctionCallingConfigMode, type Content, type FunctionDeclaration } from "@google/genai";
import { generateWithGemini } from "../ai/gemini";
import { TaskError, type Task, type TaskOutput, type ToolSpec } from "./protocol";
import { callTool, ToolCallError } from "./tools";

const TOOL_SYSTEM =
  "You are Synapsis, a precise agent that answers by calling the provided tools. " +
  "Always get facts and numbers from tool calls, never guess or invent them. " +
  "Call tools in the order the task needs, use their exact results, and do the arithmetic carefully. " +
  "When you have everything, reply with the final answer first, then one short sentence of support.";

const MAX_TURNS = 10;
const TOOL_ATTEMPTS = 4;

/** Gemini function names must match [A-Za-z_][A-Za-z0-9_.-]{0,63}. */
function safeName(name: string, i: number): string {
  const s = name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 60);
  return /^[A-Za-z_]/.test(s) ? s : `t${i}_${s}`.slice(0, 63);
}

/** Calls a tool, retrying 503s, 429s and network drops with backoff. Timeouts are not retried. */
async function callWithRetry(tool: ToolSpec, task: Task, args: Record<string, unknown>): Promise<unknown> {
  for (let i = 1; ; i++) {
    try {
      return await callTool(tool, task, args);
    } catch (e) {
      if (!(e instanceof ToolCallError)) throw e;
      const timedOut = e.httpStatus === null && /did not answer within/.test(e.message);
      if (timedOut) throw new TaskError("upstream_timeout", e.message);
      const transient = e.httpStatus === null || e.httpStatus === 503 || e.httpStatus === 502 || e.httpStatus === 429;
      if (!transient) return { error: e.message, status: e.httpStatus };
      if (i >= TOOL_ATTEMPTS) throw new TaskError("upstream_unavailable", `${tool.name} kept failing: ${e.message}`);
      await new Promise((r) => setTimeout(r, 300 * 2 ** (i - 1)));
    }
  }
}

export async function runToolAgent(task: Task, system = TOOL_SYSTEM): Promise<TaskOutput> {
  const tools = task.tools ?? [];
  if (!task.input || tools.length === 0) throw new TaskError("invalid_input", "use_tools tasks need task.input and task.tools.");
  if (!task.challengeToken) throw new TaskError("invalid_input", "use_tools tasks need task.challengeToken.");

  const byName = new Map<string, ToolSpec>();
  const declarations: FunctionDeclaration[] = tools.map((t, i) => {
    const name = safeName(t.name, i);
    byName.set(name, t);
    return { name, description: t.description, parametersJsonSchema: t.inputSchema ?? { type: "object", properties: {} } };
  });

  const maxCalls = task.limits?.maxToolCalls ?? Infinity;
  const toolResults: { tool: string; result: unknown }[] = [];
  const contents: Content[] = [{ role: "user", parts: [{ text: typeof task.input === "string" ? task.input : JSON.stringify(task.input) }] }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const budgetLeft = toolResults.length < maxCalls;
    const response = await generateWithGemini({
      contents,
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: declarations }],
        toolConfig: { functionCallingConfig: { mode: budgetLeft ? FunctionCallingConfigMode.AUTO : FunctionCallingConfigMode.NONE } },
      },
    });

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      const text = (response.text ?? "").trim();
      if (!text) throw new TaskError("internal", "The model returned no answer.");
      if (toolResults.length === 0) throw new TaskError("internal", "The model answered without calling any tool.");
      return { text, toolResults };
    }

    if (toolResults.length + calls.length > maxCalls) {
      throw new TaskError("limit_exceeded", `Answering needs more than maxToolCalls (${maxCalls}).`);
    }

    contents.push(response.candidates?.[0]?.content ?? { role: "model", parts: calls.map((functionCall) => ({ functionCall })) });
    const parts = [];
    // Run sequentially: later calls may depend on earlier results, and order is checked in workflows.
    for (const call of calls) {
      const spec = call.name ? byName.get(call.name) : undefined;
      if (!spec) {
        parts.push({ functionResponse: { id: call.id, name: call.name ?? "unknown", response: { error: `No tool named ${call.name}` } } });
        continue;
      }
      const result = await callWithRetry(spec, task, (call.args ?? {}) as Record<string, unknown>);
      toolResults.push({ tool: spec.name, result });
      parts.push({ functionResponse: { id: call.id, name: call.name!, response: { result } } });
    }
    contents.push({ role: "user", parts });
  }
  throw new TaskError("internal", `No final answer after ${MAX_TURNS} model turns.`);
}
