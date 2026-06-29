/**
 * Brain Builder — project-local extension for Project Brain.
 *
 * Two modes, switchable:
 *   /plan    — read-only planning/discussion (write tools off, bash allowlisted)
 *   /execute — build (full tools, design rules enforced)
 *   /mode    — show current mode + quick rules
 *   Ctrl+Alt+P — toggle plan/execute
 *   --plan   — start in plan mode
 *
 * The standing design rules live in AGENTS.md (auto-loaded, always in
 * context). This extension injects a short mode reminder each turn and tracks
 * a numbered plan ("Plan:" header) with [DONE:n] completion during execution.
 *
 * Mode context strings are baked into ./context.ts so they are never repeated
 * by the user. State persists across session resume.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import {
	extractTodoItems,
	isSafeCommand,
	markCompletedSteps,
	type TodoItem,
} from "./utils.ts";
import { EXECUTE_CONTEXT, PLAN_CONTEXT, RULES_SUMMARY } from "./context.ts";

type Mode = "plan" | "execute";

// Built-in tools managed by this extension.
const MANAGED_TOOLS = new Set<string>(["read", "bash", "edit", "write", "grep", "find", "ls"]);
const PLAN_TOOLS = ["read", "bash", "grep", "find", "ls"];
const EXECUTE_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls"];

// customTypes we inject per-turn (filtered from history to avoid stale noise).
const TRANSIENT_CONTEXT_TYPES = new Set<string>(["brain-plan-context", "brain-execute-context"]);

interface BrainState {
	mode: Mode;
	todos: TodoItem[];
	executing: boolean; // true when running a tracked plan in execute mode
}

function unique(names: string[]): string[] {
	return [...new Set(names)];
}

function toolsForMode(mode: Mode, current: string[]): string[] {
	const others = current.filter((n) => !MANAGED_TOOLS.has(n));
	return mode === "plan"
		? unique([...others, ...PLAN_TOOLS])
		: unique([...others, ...EXECUTE_TOOLS]);
}

export default function brainBuilderExtension(pi: ExtensionAPI): void {
	let mode: Mode = "execute";
	let executing = false;
	let todos: TodoItem[] = [];

	pi.registerFlag("plan", {
		description: "Start the brain-builder in plan (read-only) mode",
		type: "boolean",
		default: false,
	});

	function applyTools(target: Mode): void {
		pi.setActiveTools(toolsForMode(target, pi.getActiveTools()));
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (executing && todos.length > 0) {
			const done = todos.filter((t) => t.completed).length;
			ctx.ui.setStatus("brain-mode", ctx.ui.theme.fg("accent", `🧠 execute ${done}/${todos.length}`));
		} else if (mode === "plan") {
			ctx.ui.setStatus("brain-mode", ctx.ui.theme.fg("warning", "🧠 plan (read-only)"));
		} else {
			ctx.ui.setStatus("brain-mode", ctx.ui.theme.fg("success", "🧠 execute"));
		}

		if (executing && todos.length > 0) {
			const lines = todos.map((item) =>
				item.completed
					? ctx.ui.theme.fg("success", "☑ ") +
						ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text))
					: `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`,
			);
			ctx.ui.setWidget("brain-plan", lines);
		} else {
			ctx.ui.setWidget("brain-plan", undefined);
		}
	}

	function persistState(): void {
		pi.appendEntry("brain-builder", {
			mode,
			todos,
			executing,
		} satisfies BrainState);
	}

	function setMode(target: Mode, ctx: ExtensionContext, opts?: { runPlan?: boolean }): void {
		mode = target;
		applyTools(target);
		if (target === "plan") {
			executing = false;
			ctx.ui.notify("Plan mode (read-only). Write tools disabled.", "info");
		} else if (!opts?.runPlan) {
			// Plain execute: drop any stale plan tracking.
			executing = false;
			todos = [];
			ctx.ui.notify("Execute mode. Full tools restored.", "info");
		}
		updateStatus(ctx);
		persistState();
	}

	// --- Commands ---

	pi.registerCommand("plan", {
		description: "Enter plan mode (read-only: discuss + plan, no edits)",
		handler: async (_args, ctx) => setMode("plan", ctx),
	});

	pi.registerCommand("execute", {
		description: "Enter execute mode (build, full tools)",
		handler: async (_args, ctx) => setMode("execute", ctx),
	});

	pi.registerCommand("mode", {
		description: "Show current brain-builder mode and quick rules",
		handler: async (_args, ctx) => {
			const planSteps = executing && todos.length > 0
				? `\nPlan: ${todos.filter((t) => t.completed).length}/${todos.length} done`
				: "";
			ctx.ui.notify(`Mode: ${mode}${planSteps}\n\n${RULES_SUMMARY}`, "info");
		},
	});

	pi.registerCommand("brain-todos", {
		description: "Show the current plan steps and progress",
		handler: async (_args, ctx) => {
			if (todos.length === 0) {
				ctx.ui.notify("No active plan. Use /plan and ask for a numbered plan.", "info");
				return;
			}
			const list = todos
				.map((t, i) => `${i + 1}. ${t.completed ? "✓" : "○"} ${t.text}`)
				.join("\n");
			ctx.ui.notify(`Plan progress:\n${list}`, "info");
		},
	});

	// Toggle plan <-> execute.
	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle brain-builder plan/execute mode",
		handler: async (ctx) => setMode(mode === "plan" ? "execute" : "plan", ctx),
	});

	// --- Enforcement: block destructive bash in plan mode ---

	pi.on("tool_call", async (event) => {
		if (mode !== "plan" || event.toolName !== "bash") return;
		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode (read-only): command not allowlisted. Switch with /execute first.\nCommand: ${command}`,
			};
		}
	});

	// edit/write are disabled in plan mode via tool set, but double-guard:
	pi.on("tool_call", async (event) => {
		if (mode === "plan" && (event.toolName === "edit" || event.toolName === "write")) {
			return {
				block: true,
				reason: "Plan mode is read-only. Use /execute to make changes.",
			};
		}
	});

	// --- Context: drop stale transient mode-context messages, keep history clean ---

	pi.on("context", async (event) => {
		return {
			messages: event.messages.filter((m) => {
				const customType = (m as { customType?: string }).customType;
				if (customType && TRANSIENT_CONTEXT_TYPES.has(customType)) return false;
				return true;
			}),
		};
	});

	// --- Inject mode context each turn ---

	pi.on("before_agent_start", async () => {
		if (mode === "plan") {
			return {
				message: {
					customType: "brain-plan-context",
					content: PLAN_CONTEXT,
					display: false,
				},
			};
		}

		if (executing && todos.length > 0) {
			const remaining = todos.filter((t) => !t.completed);
			const list = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "brain-execute-context",
					content: `${EXECUTE_CONTEXT}\n\nTracked plan — remaining steps:\n${list}\n\nMark each finished step with [DONE:n].`,
					display: false,
				},
			};
		}

		return {
			message: {
				customType: "brain-execute-context",
				content: EXECUTE_CONTEXT,
				display: false,
			},
		};
	});

	// --- Track [DONE:n] progress during execution ---

	pi.on("turn_end", async (event, ctx) => {
		if (!executing || todos.length === 0) return;
		const message = event.message as { role?: string; content?: unknown };
		if (message.role !== "assistant" || !Array.isArray(message.content)) return;
		const text = (message.content as Array<{ type?: string; text?: string }>)
			.filter((b) => b.type === "text")
			.map((b) => b.text ?? "")
			.join("\n");
		if (markCompletedSteps(text, todos) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// --- Plan lifecycle: in plan mode, capture the plan and offer execution ---

	pi.on("agent_end", async (event, ctx) => {
		// Execution complete?
		if (executing && todos.length > 0) {
			if (todos.every((t) => t.completed)) {
				const done = todos.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "brain-plan-complete", content: `**Plan complete!** ✓\n\n${done}`, display: true },
					{ triggerTurn: false },
				);
				executing = false;
				todos = [];
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (mode !== "plan" || !ctx.hasUI) return;

		// Extract a plan from the last assistant message.
		const lastAssistant = [...event.messages]
			.reverse()
			.find((m) => (m as { role?: string }).role === "assistant");
		if (!lastAssistant) return;
		const content = (lastAssistant as { content?: unknown }).content;
		const text = Array.isArray(content)
			? (content as Array<{ type?: string; text?: string }>)
					.filter((b) => b.type === "text")
					.map((b) => b.text ?? "")
					.join("\n")
			: "";
		const extracted = extractTodoItems(text);
		if (extracted.length === 0) return;
		todos = extracted;
		persistState();

		const list = todos.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
		const listMsg = {
			customType: "brain-plan-list",
			content: `**Plan (${todos.length} steps):**\n\n${list}`,
			display: true,
		};

		const choice = await ctx.ui.select("Plan ready — what next?", [
			"Execute the plan (track progress)",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (!choice) return;

		if (choice.startsWith("Execute")) {
			const first = todos[0];
			if (!first) return;
			mode = "execute";
			executing = true;
			applyTools("execute");
			updateStatus(ctx);
			persistState();

			const remaining = todos.map((t) => `${t.step}. ${t.text}`).join("\n");
			const execMsg = `Execute the plan.\n\nRemaining steps:\n${remaining}\n\nStart with: ${first.text}\nAfter completing a step, include [DONE:n] in your response.`;
			pi.sendMessage(listMsg, { deliverAs: "followUp" });
			pi.sendMessage(
				{ customType: "brain-plan-execute", content: execMsg, display: true },
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendMessage(listMsg, { deliverAs: "followUp" });
				pi.sendUserMessage(refinement.trim(), { deliverAs: "followUp" });
			}
		}
	});

	// --- Restore state on session start/resume ---

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			mode = "plan";
		}

		const entries = ctx.sessionManager.getEntries();
		const stateEntry = entries
			.filter(
				(e: { type: string; customType?: string }) =>
					e.type === "custom" && e.customType === "brain-builder",
			)
			.pop() as { data?: BrainState } | undefined;

		if (stateEntry?.data) {
			mode = stateEntry.data.mode ?? mode;
			todos = stateEntry.data.todos ?? todos;
			executing = stateEntry.data.executing ?? executing;
		}

		// On resume of an executing plan, re-scan messages after the last
		// execute marker to rebuild completion state.
		if (stateEntry && executing && todos.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const e = entries[i] as { customType?: string };
				if (e.customType === "brain-plan-execute") {
					executeIndex = i;
					break;
				}
			}
			const texts: string[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i] as { type?: string; message?: { role?: string; content?: unknown } };
				if (entry.type === "message" && entry.message?.role === "assistant" && Array.isArray(entry.message.content)) {
					const t = (entry.message.content as Array<{ type?: string; text?: string }>)
						.filter((b) => b.type === "text")
						.map((b) => b.text ?? "")
						.join("\n");
					texts.push(t);
				}
			}
			markCompletedSteps(texts.join("\n"), todos);
		}

		applyTools(mode);
		updateStatus(ctx);
	});
}