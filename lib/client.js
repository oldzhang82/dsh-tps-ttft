/**
 * dsh-tps-ttft client bundle: renders a per-turn timing pill in the turn tail.
 *
 * The pill reads the `perTurnStats` session projection (registered by the
 * server-side index.js) and shows model time, tool time, TTFT, and output
 * speed. It is fully self-contained: no core harness changes required.
 *
 * Loaded by the host via /plugins/dsh-tps-ttft/client.js. May only require
 * shell seed words (react, jsx-runtime, primitives).
 */
window.__ModuleLoader__.load({
  id: "dsh-tps-ttft",
  factory: (require) => {
    const bundleModule = { exports: {} };
    Object.defineProperty(bundleModule.exports, Symbol.toStringTag, { value: "Module" });
    const react = require("react");
    const jsxRuntime = require("react/jsx-runtime");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const { useState, useRef, useEffect } = react;
    const { jsx: _jsx, jsxs: _jsxs } = jsxRuntime;

    const NS = "chat.tps-ttft";

    const zh = {
      title: "本轮耗时",
      model: "模型耗时",
      tool: "工具耗时",
      ttft: "首 token",
      tps: "输出速度",
    };
    const en = {
      title: "Turn timing",
      model: "Model time",
      tool: "Tool time",
      ttft: "TTFT",
      tps: "Output speed",
    };

    /** Format a wall-time duration in ms as a compact human-readable string. */
    function formatDuration(ms) {
      const s = ms / 1000;
      if (s < 60) return `${Math.round(s * 10) / 10}s`;
      const whole = Math.round(s);
      return `${Math.floor(whole / 60)}m${whole % 60}s`;
    }

    /**
     * Per-turn timing pill. Reads the perTurnStats projection for its turn and
     * renders a compact gauge trigger; clicking opens a small popover with the
     * four timing rows.
     */
    function TimingPill({ turn, useProjection, t }) {
      const [open, setOpen] = useState(false);
      const rootRef = useRef(null);

      // Close on outside click.
      useEffect(() => {
        if (!open) return;
        const onDoc = (e) => {
          if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
      }, [open]);

      const stats = useProjection("perTurnStats");
      const entry = stats === undefined || stats === null
        ? undefined
        : stats.find((item) => item.turn === turn);
      if (entry === undefined) return null;

      const llmMs = entry.llmMs;
      const toolMs = entry.toolMs;
      const ttftMs = entry.ttftSteps > 0 ? entry.ttftMs / entry.ttftSteps : 0;
      const tps = entry.decodeMs > 0 && entry.decodeTokens > 0
        ? entry.decodeTokens / (entry.decodeMs / 1000)
        : null;

      const GaugeIcon = primitives.IconGaugeOutlineRegular;

      const rows = [
        { key: "model", value: formatDuration(llmMs), show: true },
        { key: "tool", value: formatDuration(toolMs), show: toolMs > 0 },
        { key: "ttft", value: formatDuration(ttftMs), show: ttftMs > 0 },
        { key: "tps", value: tps === null ? null : `${Math.round(tps)} tok/s`, show: tps !== null },
      ].filter((row) => row.show);

      return _jsxs("span", {
        ref: rootRef,
        style: { position: "relative", display: "inline-flex", alignItems: "center" },
        children: [
          _jsx("button", {
            type: "button",
            "aria-haspopup": "dialog",
            "aria-expanded": open,
            onClick: () => setOpen(!open),
            style: {
              display: "inline-flex", alignItems: "center", gap: "4px",
              padding: "2px 8px", borderRadius: "12px",
              border: "1px solid rgba(128,128,128,0.25)",
              background: "transparent", color: "inherit",
              fontSize: "12px", lineHeight: 1.4, cursor: "pointer",
            },
            children: [
              GaugeIcon ? _jsx(GaugeIcon, { size: 14, "aria-hidden": true }) : _jsx("span", { style: { fontSize: 12 }, children: "⏱" }),
              _jsx("span", { children: formatDuration(llmMs) }),
            ],
          }),
          open ? _jsxs("div", {
            role: "dialog",
            "aria-label": t("title"),
            style: {
              position: "absolute", bottom: "calc(100% + 6px)", left: 0,
              minWidth: "160px", padding: "8px 10px", borderRadius: "8px",
              background: "var(--dsh-surface-raised, #1e1e1e)",
              border: "1px solid rgba(128,128,128,0.3)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              zIndex: 1000, fontSize: "12px",
            },
            children: [
              _jsx("div", {
                style: { fontWeight: 600, marginBottom: "6px", paddingBottom: "4px", borderBottom: "1px solid rgba(128,128,128,0.2)" },
                children: t("title"),
              }),
              _jsxs("dl", {
                style: { margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 12px" },
                children: rows.map((row) => [
                  _jsx("dt", { key: row.key + "-k", style: { opacity: 0.7 }, children: t(row.key) }),
                  _jsx("dd", { key: row.key + "-v", style: { margin: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }, children: row.value }),
                ]),
              }),
            ],
          }) : null,
        ],
      });
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-tps-ttft: timing dictionaries");
      ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
        name: "conversation.chat.turnTail",
        id: "tps-ttft",
        locale: NS,
      }, TimingPill));
    }

    bundleModule.exports.NS = NS;
    bundleModule.exports.apply = apply;
    bundleModule.exports.inject = ["slots", "locale"];
    return bundleModule.exports;
  }
});
