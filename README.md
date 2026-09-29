# dsh-plugin-error-radar

DeepSeek Harness (dsh) 插件：**工具可靠性雷达**。读 [tool-trace](https://github.com/121212165/dsh-plugin-tool-trace) 的调用边车，按工具算错误率、连续失败次数、p95/最慢耗时，并对"系统性坏掉"和"只是抖动"分别告警。

适合回答："我的 agent 最近在哪类工具上反复翻车？哪个工具慢得离谱？"——tool-trace 回答"做了什么、慢在哪"，本插件回答"**该修哪里**"。

同系列：[tool-trace](https://github.com/121212165/dsh-plugin-tool-trace)（数据源）· [session-insights](https://github.com/121212165/dsh-plugin-session-insights)（总量概览）· [cache-guard](https://github.com/121212165/dsh-plugin-cache-guard)（钱为什么多花）。

## 用法

- **`/radar`**：按错误率降序输出每个工具的 `调用数 · 错误率 · 连败 · p95 · 最慢`，下方附 `⚠ 告警` 段。

```text
工具可靠性雷达（按错误率排序）:
  bash                        42 次 · 错误率  19% · 连败 2 · p95 3120ms · 最慢 9012ms
  web_fetch                   11 次 · 错误率  36% · 连败 4 · p95 5400ms · 最慢 8800ms

⚠ 告警:
  - web_fetch 错误率 36%（4/11），超过告警线
  - web_fetch 连续失败 4 次——像是系统性问题而不是抖动
```

没有 tool-trace 数据时明确说明，不会输出空表糊人。

## 判定口径

- **错误率** = 该工具 `isError=true` 的记录数 / 该工具全部记录数。
- **连败 (`worstRun`)** = 按时间排序后，该工具**连续**失败的最长串。1 次失败混进 1 次成功即断串——所以它衡量的是"崩成一片"而不是"崩得多"。
- **两类告警各管一件事**（同一条记录可能同时触发两条，这是有意的）：
  - `error-rate`：调用数 ≥ 3 且错误率 > `errorRateAlert`；
  - `streak`：连败 ≥ 3。
- **p95** 用最近秩法（`ceil(p/100·n)` 索引，钳到数组内），空样本返回 0；非有限/负数耗时记录被排除在时长统计之外，但仍计入调用数与错误率。
- 时长口径继承 tool-trace 的 `durationMs`（pre/post-execute 配对计时），包含工具自身排队时间。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | |
| `dataDir` | `~/.dsh/tool-trace` | tool-trace 边车目录，**本插件只读** |
| `errorRateAlert` | `20` | 告警线（百分比 1–100） |

只读取 `tool-trace-YYYY-MM.jsonl` 命名的文件；损坏行跳过并在输出末尾报数（`⚠ N 行损坏被跳过`）。

## 安装

`npm i dsh-plugin-error-radar`；或克隆后 `npm install`（`prepare` 构建 `lib/`）再链进 profile 的 node_modules。挂载片段见 `cordis.patch.yml`。必须先装 tool-trace 才有数据。

## 验证状态

- 纯函数（错误率、连败串、p95 边界、双类告警的触发与静默、渲染）4 个 `node --test` 全绿。
- 本机 live：读真实 tool-trace 边车（含 `quota_check` 等真实记录）出表；`skipped` 计数走真实容错解析路径。
- 已知局限：样本极少时（<3 次调用）刻意不告警，避免一次抖动就报"系统性问题"。
