import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reliability, alerts, renderRadar, percentile, type TraceLineLike } from '../src/radar.ts';

const record = (over: Partial<TraceLineLike>): TraceLineLike =>
  ({ v: 1, sessionId: 's', at: '2026-09-29T00:00:00.000Z', tool: 'bash', durationMs: 100, argChars: 1, resultChars: 1, isError: false, ...over }) as TraceLineLike;

const at = (minute: number): string => `2026-09-29T00:${String(minute).padStart(2, '0')}:00.000Z`;

test('per-tool error rate and consecutive-failure runs', () => {
  const items = reliability([
    record({ at: at(1), isError: true }),
    record({ at: at(2), isError: true }),
    record({ at: at(3), isError: true }),
    record({ at: at(4) }),
    record({ tool: 'read', at: at(5), durationMs: 50 }),
  ]);
  const bash = items.find((item) => item.tool === 'bash')!;
  assert.equal(bash.calls, 4);
  assert.equal(bash.errors, 3);
  assert.equal(bash.errorRate, 0.75);
  assert.equal(bash.worstRun, 3);
  const read = items.find((item) => item.tool === 'read')!;
  assert.equal(read.worstRun, 0);
  assert.equal(items[0]!.tool, 'bash'); // sorted by error rate first
});

test('percentile picks the p95 of durations', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.equal(percentile([], 95), 0);
  assert.equal(percentile([100], 95), 100);
});

test('alerts fire for high error rate and streaks, quiet tools stay silent', () => {
  const items = reliability([
    record({ tool: 'flaky', at: at(1), isError: true }),
    record({ tool: 'flaky', at: at(2), isError: true }),
    record({ tool: 'flaky', at: at(3), isError: true }),
    record({ tool: 'stable', at: at(4) }),
  ]);
  const list = alerts(items, { errorRateAlert: 0.2 });
  // flaky trips both signals: 100% error rate (>= 3 calls) and a 3-long failure run.
  assert.deepEqual(list.map((alert) => alert.kind).sort(), ['error-rate', 'streak']);
  const stable = reliability([
    record({ tool: 'flaky', at: at(1), isError: true }),
    record({ tool: 'flaky', at: at(2) }),
    record({ tool: 'flaky', at: at(3), isError: true }),
  ]);
  assert.equal(alerts(stable, { errorRateAlert: 0.9 }).length, 0); // 67% < 90% threshold, run length 1
  assert.ok(list.some((alert) => alert.message.includes('flaky')));
});

test('rendering ranks by error rate and includes alert block', () => {
  const items = reliability([
    record({ tool: 'flaky', at: at(1), isError: true }),
    record({ tool: 'flaky', at: at(2), isError: true }),
    record({ tool: 'flaky', at: at(3), isError: true }),
  ]);
  const text = renderRadar(items, alerts(items, { errorRateAlert: 0.2 }));
  assert.ok(text.includes('工具可靠性雷达'));
  assert.ok(text.includes('⚠ 告警'));
  assert.ok(text.includes('连败 3'));
  assert.ok(renderRadar([], []).includes('还没有'));
});
