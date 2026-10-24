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
export declare function recentRecords(records: TraceLineLike[], now?: Date, days?: number | null): TraceLineLike[];
export declare function verdict(reliabilities: ToolReliability[], radarAlerts: RadarAlert[], scope: HealthScope): HealthVerdict;
/** `limit` keeps the ranking short — the point of /health is one screen. */
export declare function renderHealth(result: HealthVerdict, ranked: ToolReliability[], radarAlerts: RadarAlert[], limit?: number): string;
//# sourceMappingURL=health.d.ts.map