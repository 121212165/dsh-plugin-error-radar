/**
 * dsh wiring for error-radar: reads the tool-trace sidecars (same JSONL
 * contract and default dir as dsh-plugin-tool-trace) and reports reliability.
 * Read-only on the sidecars.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type {} from '@deepseek-ai/dsh-commands';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parseRecordLine, type TraceLineLike } from './trace-line.ts';
import { alerts, reliability, renderRadar, type RadarOptions } from './radar.ts';
import { recentRecords, renderHealth, verdict } from './health.ts';

export const name = 'error-radar';
export const inject = ['commands'];

export interface Config {
  enabled: boolean;
  dataDir?: string;
  errorRateAlert: number; // percent
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(true),
  dataDir: Schema.string(),
  errorRateAlert: Schema.number().min(1).max(100).default(20),
});

export function expandHome(path: string): string {
  return path.startsWith('~') ? join(homedir(), path.slice(1)) : path;
}

export function readTrace(dataDir: string): { records: TraceLineLike[]; skipped: number } {
  const records: TraceLineLike[] = [];
  let skipped = 0;
  if (!existsSync(dataDir)) return { records, skipped };
  for (const file of readdirSync(dataDir).filter((name) => /^tool-trace-\d{4}-(0[1-9]|1[0-2])\.jsonl$/.test(name)).sort()) {
    for (const line of readFileSync(join(dataDir, file), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const record = parseRecordLine(line);
      if (record) records.push(record);
      else skipped++;
    }
  }
  return { records, skipped };
}

export function apply(ctx: Context, config: Config): void {
  const log = ctx.logger('error-radar');
  if (!config.enabled) return void log.info('disabled by config');
  const dataDir = config.dataDir ? expandHome(config.dataDir) : join(homedir(), '.dsh', 'tool-trace');
  // Startup probe contract (family convention): a bad threshold must fail mount.
  if (!Number.isFinite(config.errorRateAlert) || config.errorRateAlert < 1 || config.errorRateAlert > 100) {
    throw new TypeError('error-radar: errorRateAlert must be a number between 1 and 100');
  }

  ctx.commands.register({
    name: 'radar',
    description: '工具可靠性雷达：错误率排行、连败连、慢尾（读 tool-trace 数据）',
    handler: () => {
      const all = readTrace(dataDir);
      if (!all.records.length) return { kind: 'error', text: `还没有工具追踪数据（${dataDir}）。先装 dsh-plugin-tool-trace。` };
      const options: RadarOptions = { errorRateAlert: config.errorRateAlert / 100 };
      const ranked = reliability(all.records);
      return { kind: 'success', text: renderRadar(ranked, alerts(ranked, options)) + (all.skipped ? `\n⚠ ${all.skipped} 行损坏被跳过` : '') };
    },
  });

  ctx.commands.register({
    name: 'health',
    description: '工具健康一屏：调用量/错误率/连败（系统性故障）/慢尾，直接给能不能开工（读 tool-trace；--days N 缩窗口，默认 3）',
    input: { hint: '[--days 3]' },
    handler: ({ rawInput }) => {
      const raw = String(rawInput ?? '');
      const match = /--days[\s=]+(\S+)/.exec(raw);
      const days = match ? Number.parseInt(match[1]!, 10) : 3;
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        return { kind: 'error', text: `--days 要是 1–365 的整数，收到「${match?.[1] ?? (raw.trim() || '(空)')}」。例：/health --days 7` };
      }
      const all = readTrace(dataDir);
      if (!all.records.length) return { kind: 'error', text: `还没有工具追踪数据（${dataDir}）。先装 dsh-plugin-tool-trace——本插件只读不写。` };
      const scoped = recentRecords(all.records, new Date(), days);
      if (!scoped.length) {
        return { kind: 'success', text: `最近 ${days} 天没有工具调用记录（窗口外还有 ${all.records.length} 条）。放宽些看：/health --days 30` };
      }
      const options: RadarOptions = { errorRateAlert: config.errorRateAlert / 100 };
      const ranked = reliability(scoped);
      const found = alerts(ranked, options);
      const stamps = scoped.map((record) => record.at).sort();
      const report = renderHealth(verdict(ranked, found, { days, from: stamps[0] ?? null, to: stamps[stamps.length - 1] ?? null }), ranked, found);
      return { kind: 'success', text: report + (all.skipped ? `\n⚠ ${all.skipped} 行损坏被跳过（全量窗口统计）` : '') };
    },
  });

  log.info(`mounted · dataDir=${dataDir}`);
}
