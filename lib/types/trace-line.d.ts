/** Tolerant trace-line parsing: torn lines are skipped and counted, never fatal. */
export interface TraceLineLike {
    v: number;
    sessionId: string;
    at: string;
    tool: string;
    durationMs: number;
    argChars: number;
    resultChars: number;
    isError: boolean;
    turn?: number;
}
export declare function parseRecordLine(line: string): TraceLineLike | null;
//# sourceMappingURL=trace-line.d.ts.map