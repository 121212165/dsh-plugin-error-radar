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
import { reliability, alerts, renderRadar, type RadarOptions } from './radar.ts';

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

  log.info(`mounted · dataDir=${dataDir}`);
}
