/**
 * Per-turn statistics projection: a pure fold of step boundaries, assistant
 * streams, and tool pairs into per-Turn wall times and token counts.
 *
 * The fold mirrors the shipped `sessionStats` unit field by field, except the
 * totals are kept per Turn and pruned at `turn/end` so the view stays bounded.
 * The projection registry validates wire payloads against its own schema; the
 * state shape is documented here and kept plain JSON for cache compatibility.
 */

import { z } from "zod";

const turnSchema = z.object({
  turn: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  llmMs: z.number().nonnegative(),
  toolMs: z.number().nonnegative(),
  ttftMs: z.number().nonnegative(),
  ttftSteps: z.number().int().nonnegative(),
  decodeMs: z.number().nonnegative(),
  decodeTokens: z.number().nonnegative(),
}).strict();

const viewSchema = z.array(turnSchema);

const stateSchema = z.object({
  turns: z.array(turnSchema),
  openTurn: z.number().int().nonnegative().nullable(),
  openStep: z.object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    startTime: z.number().nonnegative(),
    firstTokenTime: z.number().nonnegative().nullable(),
  }).nullable(),
  pendingCalls: z.record(z.string(), z.object({
    time: z.number().nonnegative(),
    turn: z.number().int().nonnegative(),
  })),
});

function isTokenDelta(chunk) {
  switch (chunk.type) {
    case "text-delta":
    case "reasoning-delta":
      return chunk.text !== "";
    case "tool-call-delta":
      return chunk.argumentsDelta !== "" || chunk.name !== undefined;
    default:
      return false;
  }
}

function runFirstTokenTime(run) {
  if (run.type === "tool-call-chunks" && run.name !== undefined) return run.time0;
  const fragments = run.type === "tool-call-chunks" ? run.args : run.texts;
  let time = run.time0;
  for (let index = 0; index < fragments.length; index += 1) {
    if (index > 0) time += run.dt[index - 1];
    if (fragments[index] !== "") return time;
  }
  return undefined;
}

function firstTokenTime(stream) {
  for (const record of stream) {
    const time = record.type === "chunk"
      ? (isTokenDelta(record.chunk) ? record.time : undefined)
      : runFirstTokenTime(record);
    if (time !== undefined) return time;
  }
  return undefined;
}

function outputTokens(usage) {
  if (typeof usage !== "object" || usage === null) return null;
  const value = usage.outputTokens;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function emptyTurn(turn) {
  return {
    turn,
    steps: 0,
    llmMs: 0,
    toolMs: 0,
    ttftMs: 0,
    ttftSteps: 0,
    decodeMs: 0,
    decodeTokens: 0
  };
}

function updateTurn(state, turn, patch) {
  const index = state.turns.findIndex((entry) => entry.turn === turn);
  if (index === -1) return { ...state, turns: [...state.turns, { ...emptyTurn(turn), ...patch }] };
  const current = state.turns[index];
  const merged = {
    ...current,
    steps: current.steps + (patch.steps ?? 0),
    llmMs: current.llmMs + (patch.llmMs ?? 0),
    toolMs: current.toolMs + (patch.toolMs ?? 0),
    ttftMs: current.ttftMs + (patch.ttftMs ?? 0),
    ttftSteps: current.ttftSteps + (patch.ttftSteps ?? 0),
    decodeMs: current.decodeMs + (patch.decodeMs ?? 0),
    decodeTokens: current.decodeTokens + (patch.decodeTokens ?? 0)
  };
  const next = [...state.turns];
  next[index] = merged;
  return { ...state, turns: next };
}

const perTurnStatsProjectionDefinition = {
  key: "perTurnStats",
  stateVersion: 1,
  stateSchema,
  init: () => ({ turns: [], openTurn: null, openStep: null, pendingCalls: {} }),
  apply: (state, event) => {
    switch (event.type) {
      case "step/start": {
        return {
          ...state,
          openTurn: event.data.turn,
          openStep: {
            turn: event.data.turn,
            step: event.data.step,
            startTime: event.time,
            firstTokenTime: null
          }
        };
      }
      case "assistant/attempt": {
        const open = state.openStep;
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state;
        const first = firstTokenTime(event.data.stream) ?? null;
        if (open.firstTokenTime !== null || first === null) return state;
        return {
          ...state,
          openStep: { ...open, firstTokenTime: first }
        };
      }
      case "assistant/message": {
        const open = state.openStep;
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state;
        const firstToken = open.firstTokenTime ?? firstTokenTime(event.data.stream) ?? null;
        const llmMs = Math.max(0, event.time - open.startTime);
        let patch = { steps: 1, llmMs };
        if (firstToken !== null) {
          const ttftMs = Math.max(0, firstToken - open.startTime);
          const tokens = outputTokens(event.data.usage);
          patch = {
            ...patch,
            ttftMs,
            ttftSteps: 1,
            ...(tokens !== null ? { decodeMs: Math.max(0, event.time - firstToken), decodeTokens: tokens } : {})
          };
        }
        return updateTurn({ ...state, openStep: null }, event.data.turn, patch);
      }
      case "tool/call": {
        const turn = event.data.turn ?? state.openTurn;
        if (turn === null || turn === undefined) return state;
        return {
          ...state,
          pendingCalls: { ...state.pendingCalls, [event.data.callId]: { time: event.time, turn } }
        };
      }
      case "tool/result": {
        const callId = event.data.message.source.callId;
        const pending = state.pendingCalls[callId];
        if (pending === undefined) return state;
        const pendingCalls = { ...state.pendingCalls };
        delete pendingCalls[callId];
        const toolMs = Math.max(0, event.time - pending.time);
        return updateTurn({ ...state, pendingCalls }, pending.turn, { toolMs: toolMs });
      }
      case "turn/end": {
        const turn = event.data.turn;
        return {
          ...state,
          openTurn: state.openTurn === turn ? null : state.openTurn,
          openStep: state.openStep !== null && state.openStep.turn === turn ? null : state.openStep,
          pendingCalls: Object.fromEntries(
            Object.entries(state.pendingCalls).filter(([, value]) => value.turn !== turn)
          )
        };
      }
      default:
        return state;
    }
  },
  wire: {
    viewSchema,
    view: (state) => state.turns
  }
};

export const inject = ["sessionProjections"];

export function apply(ctx) {
  ctx.sessionProjections.register(perTurnStatsProjectionDefinition);
}
