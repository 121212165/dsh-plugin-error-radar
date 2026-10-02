/** Assembly tests for error-radar: the real apply() on a mock context reading a
 * real temp tool-trace directory, covering /health and the untouched /radar.
 * @module test/plugin */

import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apply, readTrace } from '../src/plugin.ts';

interface CapturedCommand {
  name: string;
  description: string;
  input?: { hint?: string };
  handler: (args: { rawInput?: string }) => { kind: string; text: string };
}

function mount(config: Record<string, unknown> = {}): { commands: Map<string, CapturedCommand>; dataDir: string } {
  const dataDir = mkdtempSync(join(tmpdir(), 'error-radar-'));
  after(() => rmSync(dataDir, { recursive: true, force: true }));
  const commands = new Map<string, CapturedCommand>();
  apply(
    { logger: () => ({ info() {}, warn() {}, debug() {} }), commands: { register: (definition: CapturedCommand) => void commands.set(definition.name, definition) } } as never,
    { enabled: true, errorRateAlert: 20, dataDir, ...config } as never,
  );
  return { commands, dataDir };
}


const ago = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString();

function trace(dataDir: string, lines: string[]): void {
  writeFileSync(join(dataDir, 'tool-trace-2026-10.jsonl'), lines.join('\n') + '\n', 'utf8');
}

const call = (tool: string, isError: boolean, hours: number, durationMs = 50): string =>
  JSON.stringify({ v: 1, sessionId: 'session-abc', at: ago(hours), tool, durationMs, argChars: 10, resultChars: 20, isError });

test('disabled mounts nothing; a bad alert threshold fails startup naming the plugin', () => {
  const off = mount({ enabled: false });
  assert.equal(off.commands.size, 0);
  for (const bad of [{ errorRateAlert: 0 }, { errorRateAlert: 101 }, { errorRateAlert: Number.NaN }]) {
    assert.throws(() => mount(bad), /error-radar: errorRateAlert/);
  }
});

test('apply registers radar and the merged health command', () => {
  const { commands } = mount();
  assert.deepEqual([...commands.keys()].sort(), ['health', 'radar']);
  assert.equal(commands.get('health')!.input!.hint, '[--days 3]');
});

test('/health with no trace data is a refusal that names the directory', () => {
  const { commands, dataDir } = mount();
  const result = commands.get('health')!.handler({ rawInput: '' });
  assert.equal(result.kind, 'error');
  assert.ok(result.text.includes(dataDir), result.text);
  assert.ok(result.text.includes('dsh-plugin-tool-trace'), 'it says who writes the data it reads');
});

test('/health judges a clean window and a streaking tool', () => {
  const { commands, dataDir } = mount();
  trace(dataDir, [call('read', false, 1), call('read', false, 2), call('bash', false, 3, 4_000)]);
  const clean = commands.get('health')!.handler({ rawInput: '' });
  assert.equal(clean.kind, 'success');
  assert.ok(clean.text.includes('✓ 没有告警，工具面是干净的，可以开工'), clean.text);
  assert.ok(clean.text.includes('3 次调用'), clean.text);

  trace(dataDir, [call('web_fetch', true, 1), call('web_fetch', true, 2), call('web_fetch', true, 3), call('read', false, 4)]);
  const broken = commands.get('health')!.handler({ rawInput: '' });
  assert.ok(broken.text.includes('判定 ❌ 有系统性故障'), broken.text);
  assert.ok(broken.text.includes('连续失败 3 次'), broken.text);
  // /radar keeps its own wording and the same underlying numbers
  const radar = commands.get('radar')!.handler({});
  assert.ok(radar.text.includes('工具可靠性雷达'), radar.text);
  assert.ok(radar.text.includes('web_fetch'), radar.text);
});

test('/health scopes by --days and says what it did not see', () => {
  const { commands, dataDir } = mount();
  trace(dataDir, [call('read', false, 200), call('read', false, 210)]);
  const empty = commands.get('health')!.handler({ rawInput: '--days 3' });
  assert.equal(empty.kind, 'success');
  assert.ok(empty.text.includes('最近 3 天没有工具调用记录'), empty.text);
  assert.ok(empty.text.includes('窗口外还有 2 条'), empty.text);

  const widened = commands.get('health')!.handler({ rawInput: '--days=30' });
  assert.ok(widened.text.startsWith('工具健康 · 近 30 天'), widened.text);

  for (const bad of ['--days 0', '--days abc', '--days 9999', '--days -3']) {
    const refused = commands.get('health')!.handler({ rawInput: bad });
    assert.equal(refused.kind, 'error', `${bad} → ${refused.text}`);
  }
});

test('corrupt trace lines are counted, not silently dropped', () => {
  const { commands, dataDir } = mount();
  trace(dataDir, [call('read', false, 1), '{ half-written', '', call('read', false, 2)]);
  const parsed = readTrace(dataDir);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.skipped, 1);
  const report = commands.get('health')!.handler({ rawInput: '' });
  assert.ok(report.text.includes('⚠ 1 行损坏被跳过（全量窗口统计）'), report.text);
});
