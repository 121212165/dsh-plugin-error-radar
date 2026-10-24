/**
 * dsh wiring for error-radar: reads the tool-trace sidecars (same JSONL
 * contract and default dir as dsh-plugin-tool-trace) and reports reliability.
 * Read-only on the sidecars.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { type TraceLineLike } from './trace-line.ts';
export declare const name = "error-radar";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    dataDir?: string;
    errorRateAlert: number;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    errorRateAlert: Schema<number, number>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    errorRateAlert: Schema<number, number>;
}>>;
export declare function expandHome(path: string): string;
export declare function readTrace(dataDir: string): {
    records: TraceLineLike[];
    skipped: number;
};
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=plugin.d.ts.map