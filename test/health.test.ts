/** Pure tests for the merged health verdict.
 * @module test/health */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { alerts, reliability, type TraceLineLike } from '../src/radar.ts';
import { recentRecords, renderHealth, verdict, type HealthScope } from '../src/health.ts';

const NOW = new Date('2026-10-02T12:00:00.000Z');

function record(over: Partial<TraceLineLike>): TraceLineLike {
  return { v: 1, sessionId: 's', at: '2026-10-02T10:00:00.000Z', tool: 'bash', durationMs: 100, argChars: 1, resultChars: 1, isError: false, ...over } as TraceLineLike;
}

const SCOPE: HealthScope = { days: 3, from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T10:00:00.000Z' };

test('recentRecords windows by age and drops unparseable stamps', () => {
  const records = [
    record({ at: '2026-10-02T10:00:00.000Z' }),
    record({ at: '2026-09-28T10:00:00.000Z' }),
    record({ at: 'not a date' }),
  ];
  assert.equal(recentRecords(records, NOW, 3).length, 1, 'only the record inside the three-day window');
  assert.equal(recentRecords(records, NOW, 4).length, 1, 'exactly four days still excludes 09-28T10');
  assert.equal(recentRecords(records, NOW, 5).length, 2);
  assert.equal(recentRecords(records, NOW, null).length, 2, 'days=null keeps the whole loaded window but still drops garbage');
});

test('the verdict totals the ranking and calls a streak blocking', () => {
  const ranked = reliability([
    record({ tool: 'bash', isError: true, at: '2026-10-02T09:00:00.000Z' }),
    record({ tool: 'bash', isError: true, at: '2026-10-02T09:01:00.000Z' }),
    record({ tool: 'bash', isError: true, at: '2026-10-02T09:02:00.000Z' }),
    record({ tool: 'read', durationMs: 5, at: '2026-10-02T09:03:00.000Z' }),
    record({ tool: 'web_fetch', durationMs: 9000, at: '2026-10-02T09:04:00.000Z' }),
  ]);
  const found = alerts(ranked, { errorRateAlert: 0.2 });
  const result = verdict(ranked, found, SCOPE);
  assert.equal(result.calls, 5);
  assert.equal(result.tools, 3);
  assert.equal(result.errors, 3);
  assert.equal(result.errorRate, 0.6);
  assert.equal(result.blocking, true, 'three consecutive failures is systemic, not jitter');
  assert.equal(result.streaks.length, 1);
  assert.equal(result.slowest!.tool, 'web_fetch', 'slowest is by p95, not by max');

  const clean = verdict(reliability([record({ tool: 'read' }), record({ tool: 'read', at: '2026-10-02T09:05:00.000Z' })]), [], SCOPE);
  assert.equal(clean.blocking, false);
  assert.equal(clean.slowest!.p95Ms, 100);
});

test('the health screen says one thing up front: can work start', () => {
  const failing = reliability([
    record({ tool: 'bash', isError: true, at: '2026-10-02T09:00:00.000Z' }),
    record({ tool: 'bash', isError: true, at: '2026-10-02T09:01:00.000Z' }),
    record({ tool: 'bash', isError: true, at: '2026-10-02T09:02:00.000Z' }),
  ]);
  const blocked = renderHealth(verdict(failing, alerts(failing, { errorRateAlert: 0.2 }), SCOPE), failing, alerts(failing, { errorRateAlert: 0.2 }));
  assert.ok(blocked.startsWith('工具健康 · 近 3 天'), blocked);
  assert.ok(blocked.includes('判定 ❌ 有系统性故障'), blocked);
  assert.ok(blocked.includes('先修这条'), blocked);

  const clean = renderHealth(verdict([], [], SCOPE), [], []);
  assert.ok(clean.includes('没有工具调用记录'), clean);
  assert.ok(clean.includes('/health --days 30'), 'the fallback tells you how to widen the window');

  const ok = renderHealth(
    verdict(reliability([record({ tool: 'read' }), record({ tool: 'read', at: '2026-10-02T09:05:00.000Z' })]), [], SCOPE),
    reliability([record({ tool: 'read' }), record({ tool: 'read', at: '2026-10-02T09:05:00.000Z' })]),
    [],
  );
  assert.ok(ok.includes('✓ 没有告警，工具面是干净的，可以开工'), ok);
  assert.ok(ok.includes('排行'), ok);

  // an error-rate alert without a streak is a warning, not a blocker
  const jitter = [
    record({ tool: 'web_fetch', isError: true, at: '2026-10-02T09:00:00.000Z' }),
    record({ tool: 'web_fetch', isError: true, at: '2026-10-02T09:01:00.000Z' }),
    record({ tool: 'web_fetch', at: '2026-10-02T09:02:00.000Z' }),
  ];
  const ranked = reliability(jitter);
  const found = alerts(ranked, { errorRateAlert: 0.2 });
  const warn = renderHealth(verdict(ranked, found, SCOPE), ranked, found);
  assert.ok(warn.includes('△ 没有连败'), warn);
  assert.ok(!warn.includes('❌'), warn);

  // ranking is capped so /health stays one screen
  const many = Array.from({ length: 9 }, (_, index) => record({ tool: `tool-${index}`, at: `2026-10-02T09:${String(index).padStart(2, '0')}:00.000Z` }));
  const short = renderHealth(verdict(reliability(many), [], SCOPE), reliability(many), [], 3);
  assert.equal(short.split('\n').filter((line) => line.includes('次 · 错误率')).length, 3, short);
});

test('the scope label never claims a window it did not use', () => {
  assert.ok(renderHealth(verdict([], [], { days: null, from: '2026-09-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z' }), [], []).startsWith('工具健康：全部记录（2026-09-01 → 2026-10-02）'));
  assert.ok(renderHealth(verdict([], [], { days: null, from: null, to: null }), [], []).includes('没有记录'));
});
