import type { TraceLineLike } from './trace-line.ts';

export type { TraceLineLike };

/** Pure reliability radar over tool-trace records: per-tool error rate, retry
 * clusters (same tool failing on consecutive calls within a short span) and a
 * slow tail. Thresholds are explicit inputs so the UI can tune loudness. */

export interface ToolReliability {
  tool: string;
  calls: number;
  errors: number;
  errorRate: number; // 0..1
  /** consecutive-error runs: [ [tool, runLength], ... ] merged per tool */
  worstRun: number;
  p95Ms: number;
  maxMs: number;
}

export interface RadarOptions {
  errorRateAlert: number; // fraction 0..1
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

export function reliability(records: TraceLineLike[]): ToolReliability[] {
  const byTool = new Map<string, TraceLineLike[]>();
  for (const record of records) {
    if (typeof record.tool !== 'string') continue;
    const group = byTool.get(record.tool);
    if (group) group.push(record);
    else byTool.set(record.tool, [record]);
  }
  const out: ToolReliability[] = [];
  for (const [tool, group] of byTool) {
    const durations = group.map((record) => record.durationMs).filter((value) => Number.isFinite(value) && value >= 0);
    const errors = group.filter((record) => record.isError).length;
    const chronological = [...group].sort((a, b) => (a.at < b.at ? -1 : 1));
    let worstRun = 0;
    let run = 0;
    for (const record of chronological) {
      if (record.isError) {
        run++;
        worstRun = Math.max(worstRun, run);
      } else {
        run = 0;
      }
    }
    out.push({
      tool,
      calls: group.length,
      errors,
      errorRate: group.length ? errors / group.length : 0,
      worstRun,
      p95Ms: percentile(durations, 95),
      maxMs: durations.length ? Math.max(...durations) : 0,
    });
  }
  return out.sort((a, b) => b.errorRate - a.errorRate || b.calls - a.calls);
}

export interface RadarAlert {
  tool: string;
  kind: 'error-rate' | 'streak';
  message: string;
}

export function alerts(reliabilities: ToolReliability[], options: RadarOptions): RadarAlert[] {
  const list: RadarAlert[] = [];
  for (const item of reliabilities) {
    if (item.calls >= 3 && item.errorRate > options.errorRateAlert) {
      list.push({ tool: item.tool, kind: 'error-rate', message: `${item.tool} 错误率 ${Math.round(item.errorRate * 100)}%（${item.errors}/${item.calls}），超过告警线` });
    }
    if (item.worstRun >= 3) {
      list.push({ tool: item.tool, kind: 'streak', message: `${item.tool} 连续失败 ${item.worstRun} 次——像是系统性问题而不是抖动` });
    }
  }
  return list;
}

export function renderRadar(reliabilities: ToolReliability[], radarAlerts: RadarAlert[]): string {
  if (!reliabilities.length) return '还没有工具调用记录（需要 dsh-plugin-tool-trace 先积累数据）。';
  const lines = reliabilities
    .slice(0, 12)
    .map((item) =>
      `  ${item.tool.padEnd(24)} ${String(item.calls).padStart(4)} 次 · 错误率 ${String(Math.round(item.errorRate * 100)).padStart(3)}% · 连败 ${item.worstRun} · p95 ${item.p95Ms}ms · 最慢 ${item.maxMs}ms`,
    );
  const alertLines = radarAlerts.length ? ['⚠ 告警:', ...radarAlerts.map((alert) => `  - ${alert.message}`)] : [];
  return ['工具可靠性雷达（按错误率排序）:', ...lines, '', ...alertLines].join('\n').trimEnd();
}
