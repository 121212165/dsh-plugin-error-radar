# dsh-plugin-error-radar

> 🧩 **dsh 插件家族**（22 件）：总目录 **[dsh-plugin-family](https://github.com/121212165/dsh-plugin-family)** ｜ 明星插件：**[ide-hub](https://github.com/121212165/dsh-plugin-ide-hub)** 跨 IDE 统一管理 · **[task-forge](https://github.com/121212165/dsh-plugin-task-forge)** 跨窗口无损交接 · **[quota](https://github.com/121212165/dsh-plugin-quota)** 实时用量仪表


**EN** · Tool reliability radar over dsh-plugin-tool-trace data: per-tool error rate, failure streaks, p95 latency — and deliberate silence below 3 calls so one fluke is never reported as a systemic problem (`/radar`), plus a one-screen go/no-go verdict over a recent window (`/health --days 3`). · 14 `node --test` green · verified against real tool-trace sidecars on this machine, including the corrupt-line `skipped` counter path.

DeepSeek Harness (dsh) 插件：**工具可靠性雷达**。读 [tool-trace](https://github.com/121212165/dsh-plugin-tool-trace) 的调用边车，按工具算错误率、连续失败次数、p95/最慢耗时，并对"系统性坏掉"和"只是抖动"分别告警。

适合回答："我的 agent 最近在哪类工具上反复翻车？哪个工具慢得离谱？"——tool-trace 回答"做了什么、慢在哪"，本插件回答"**该修哪里**"。

同系列：[tool-trace](https://github.com/121212165/dsh-plugin-tool-trace)（数据源）· [session-insights](https://github.com/121212165/dsh-plugin-session-insights)（总量概览）· [cache-guard](https://github.com/121212165/dsh-plugin-cache-guard)（钱为什么多花）。

## 用法

- **`/radar`**：按错误率降序输出每个工具的 `调用数 · 错误率 · 连败 · p95 · 最慢`，下方附 `⚠ 告警` 段。
- **`/health [--days 3]`**：把 tool-trace 的量/时延与雷达的告警**合成一屏判定**——开头一行就是结论：`✓ 没有告警，工具面是干净的，可以开工` / `△ 没有连败，但…` / `❌ 有系统性故障：X 连续失败 N 次——先修这条，再往别的窗口派活`。默认只看**近 3 天**（`--days 1..365` 可放宽），窗口里没有记录就明说"窗口外还有 N 条"，不拿月平均冒充今天的健康。

这是"tool-trace + error-radar 合并成 health 命令组"的落点：**合并的是命令面，不是采集**。采集需要 `tools/pre-execute` + `post-execute` 那对中间件按 callId 配对，两个插件各挂一份会把每次调用记两遍，所以写入权继续留在 dsh-plugin-tool-trace（它的 `/tools-stats` 现在会指向这里）。

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
- **`/health` 的"阻塞"只认连败**（`streak` 告警）：连败是"这条路现在走不通"，错误率高但成功穿插其间只是"抖"，不该拦住开工。慢尾按 **p95** 而不是峰值挑最慢的工具。

## 配置

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | |
| `dataDir` | `~/.dsh/tool-trace` | tool-trace 边车目录，**本插件只读** |
| `errorRateAlert` | `20` | 告警线（百分比 1–100） |

只读取 `tool-trace-YYYY-MM.jsonl` 命名的文件；损坏行跳过并在输出末尾报数（`⚠ N 行损坏被跳过`）。

## 安装

三步，实测于 `@deepseek-ai/dsh@0.1.7-alpha.1`（需 `pnpm` 在 PATH 上）：

```sh
# ① 装进 profile：dsh plugin 把参数原样转发给 pnpm，git 包会自动跑 prepare 构建 lib/
dsh plugin --profile web add github:121212165/dsh-plugin-error-radar
```

② 把本仓库根目录 `cordis.patch.yml` 的内容**并进** `$DSH_HOME/profiles/web/cordis.patch.yml`。
该文件默认是 `[]`，所以要么整份替换，要么把 insert 条目并进同一个数组；**不要直接追加**——
追加会形成两个 YAML 文档，启动即报
`failed to parse overlay ... end of the stream or a document separator is expected`（本机实测踩过）。

③ 重启 dsh。配置层与 client 半都要重启才生效（客户端按 boot 时算出的内容 rev 下发，硬刷新浏览器没用）。

自检挂载：`dsh --profile web --dump-config | grep dsh-plugin-error-radar`，应看到该条目。
## 验证状态

- 14 个 `node --test` 全绿：雷达纯函数 4（错误率、连败串、p95 边界、双类告警触发与静默）+ 健康判定纯函数 4（窗口裁剪、总量/最慢/阻塞、一屏渲染的四种结论、窗口标签不许说谎）+ 装配层 6（真临时 `tool-trace-*.jsonl` 上跑 `/health` 与 `/radar`：无数据点名目录、干净窗口、连败判定、`--days` 收窄与放宽、坏参数拒绝、损坏行计数；坏 `errorRateAlert` 启动即失败点名 error-radar）。
- 本机 live：读真实 tool-trace 边车（含 `quota_check` 等真实记录）出表；`skipped` 计数走真实容错解析路径。
- 已知局限：样本极少时（<3 次调用）刻意不告警，避免一次抖动就报"系统性问题"。
