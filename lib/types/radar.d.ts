import type { TraceLineLike } from './trace-line.ts';
export type { TraceLineLike };
/** Pure reliability radar over tool-trace records: per-tool error rate, retry
 * clusters (same tool failing on consecutive calls within a short span) and a
 * slow tail. Thresholds are explicit inputs so the UI can tune loudness. */
export interface ToolReliability {
    tool: string;
    calls: number;
    errors: number;
    errorRate: number;
    /** consecutive-error runs: [ [tool, runLength], ... ] merged per tool */
    worstRun: number;
    p95Ms: number;
    maxMs: number;
}
export interface RadarOptions {
    errorRateAlert: number;
}
export declare function percentile(values: number[], p: number): number;
export declare function reliability(records: TraceLineLike[]): ToolReliability[];
export interface RadarAlert {
    tool: string;
    kind: 'error-rate' | 'streak';
    message: string;
}
export declare function alerts(reliabilities: ToolReliability[], options: RadarOptions): RadarAlert[];
export declare function renderRadar(reliabilities: ToolReliability[], radarAlerts: RadarAlert[]): string;
//# sourceMappingURL=radar.d.ts.map