/** One-glance tool health verdict, merging what used to be two command
 * surfaces: tool-trace's raw volume/latency stats and error-radar's
 * reliability alerts. Pure — it takes already-parsed trace records in.
 *
 * The writer stays in dsh-plugin-tool-trace on purpose: capturing needs the
 * tools/pre-execute + post-execute middleware pair, and a second plugin
 * mounting the same hooks would double-count every call. So this is a merged
 * *view*, not a duplicated collector.
 */

import type { RadarAlert, ToolReliability } from './radar.ts';
import type { TraceLineLike } from './trace-line.ts';

export interface HealthScope {
  /** null = whole loaded window */
  days: number | null;
  from: string | null;
  to: string | null;
}

export interface HealthVerdict {
  tools: number;
  calls: number;
  errors: number;
  errorRate: number;
  streaks: RadarAlert[];
  rates: RadarAlert[];
  slowest: ToolReliability | null;
  /** a consecutive-failure streak is systemic, not jitter: it blocks new work */
  blocking: boolean;
  scope: HealthScope;
}

/** Newest-first cut by age, so "健康" means 最近几天的健康 and not 本月平均值. */
export function recentRecords(records: TraceLineLike[], now = new Date(), days: number | null = null): TraceLineLike[] {
  const stamped = records.filter((record) => Number.isFinite(Date.parse(record.at)));
  if (days === null) return stamped;
  const since = now.getTime() - days * 86_400_000;
  return stamped.filter((record) => Date.parse(record.at) >= since);
}

export function verdict(reliabilities: ToolReliability[], radarAlerts: RadarAlert[], scope: HealthScope): HealthVerdict {
  const calls = reliabilities.reduce((total, item) => total + item.calls, 0);
  const errors = reliabilities.reduce((total, item) => total + item.errors, 0);
  const slowest = reliabilities.reduce<ToolReliability | null>((best, item) => (!best || item.p95Ms > best.p95Ms ? item : best), null);
  const streaks = radarAlerts.filter((alert) => alert.kind === 'streak');
  return {
    tools: reliabilities.length,
    calls,
    errors,
    errorRate: calls > 0 ? errors / calls : 0,
    streaks,
    rates: radarAlerts.filter((alert) => alert.kind === 'error-rate'),
    slowest,
    blocking: streaks.length > 0,
    scope,
  };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function scopeLabel(scope: HealthScope): string {
  if (scope.days === null) return scope.to ? `全部记录（${scope.from?.slice(0, 10)} → ${scope.to?.slice(0, 10)}）` : '没有记录';
  return `近 ${scope.days} 天${scope.to ? `（至 ${scope.to.slice(0, 16).replace('T', ' ')}）` : ''}`;
}

/** `limit` keeps the ranking short — the point of /health is one screen. */
export function renderHealth(result: HealthVerdict, ranked: ToolReliability[], radarAlerts: RadarAlert[], limit = 5): string {
  if (!result.calls) return `工具健康：${scopeLabel(result.scope)}里没有工具调用记录。追踪由 dsh-plugin-tool-trace 写入；有数据后再来看，或放宽窗口 /health --days 30。`;
  const lines = [`工具健康 · ${scopeLabel(result.scope)} · ${result.tools} 个工具 ${result.calls} 次调用 · 错误率 ${pct(result.errorRate)}（${result.errors} 次失败）`];
  lines.push(
    result.blocking
      ? `判定 ❌ 有系统性故障：${result.streaks.map((alert) => alert.message).join('；')}——先修这条，再往别的窗口派活`
      : result.rates.length
        ? `△ 没有连败，但 ${result.rates.map((alert) => alert.message).join('；')}`
        : '✓ 没有告警，工具面是干净的，可以开工',
  );
  if (result.slowest && result.slowest.p95Ms > 0) {
    lines.push(`  └ 最慢 ${result.slowest.tool}：p95 ${result.slowest.p95Ms}ms · 峰值 ${result.slowest.maxMs}ms`);
  }
  if (ranked.length) {
    lines.push('排行（错误率优先，前 ' + Math.min(limit, ranked.length) + '）:');
    for (const item of ranked.slice(0, limit)) {
      lines.push(`  ${item.tool.padEnd(24)} ${String(item.calls).padStart(4)} 次 · 错误率 ${String(Math.round(item.errorRate * 100)).padStart(3)}% · 连败 ${item.worstRun} · p95 ${item.p95Ms}ms`);
    }
  }
  if (radarAlerts.length > 0 && !result.blocking) lines.push(`⚠ ${radarAlerts.length} 条告警已列出；完整雷达见 /radar。`);
  else if (!radarAlerts.length) lines.push('✓ 无告警。');
  else lines.push('完整排行与阈值见 /radar。');
  return lines.join('\n');
}
