# dsh-per-turn-stats

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供**每轮独立统计**：模型耗时、工具耗时、首 token 延迟（TTFT）、输出速度（TPS），显示在"本轮用量"面板里。

## 效果

<!-- TODO: 插入主人提供的截图 -->
![本轮用量面板](docs/screenshot-usage-panel.png)

每轮对话结束后，点击"本轮用量"图标（数据库图标），在展开的面板里可以看到：

- **模型耗时**：模型推理的墙钟时间（step/start → assistant/message）
- **工具耗时**：工具调用的总耗时（tool/call → tool/result）
- **首 token**：首 token 延迟（TTFT，step/start → 第一个 token）
- **输出速度**：输出速度（TPS，decodeTokens / decodeMs）

<!-- TODO: 插入主人提供的截图 -->
![会话统计](docs/screenshot-stats.png)

## 安装

```bash
# 在 DSH 的 profile 目录里
pnpm add dsh-per-turn-stats
```

然后在 `package.json` 的 `dsh.profile.bundles` 里加上 `dsh-per-turn-stats`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-per-turn-stats"
      ]
    }
  }
}
```

重启 DSH 即可。

## 工作原理

本插件注册了一个 **session projection**（`perTurnStats`），对会话事件流做纯函数折叠（fold）：

- 监听 `step/start`、`assistant/attempt`、`assistant/message`、`tool/call`、`tool/result`、`turn/end` 事件
- 按 Turn 累计模型耗时、工具耗时、TTFT、输出速度
- 在 `turn/end` 时清理该 Turn 的临时状态，保证视图有界

投影结果通过 DSH 核心的 `TurnUsagePanel` 组件显示（核心代码已集成 timing 显示）。

## 依赖

- `zod` ^4.6.5（schema 校验）

## License

MIT
