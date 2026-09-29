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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRecordLine(line: string): TraceLineLike | null {
  const text = line.trim();
  if (!text) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.v !== 1) return null;
  if (typeof value.sessionId !== 'string' || typeof value.at !== 'string' || typeof value.tool !== 'string') return null;
  if (Number.isNaN(Date.parse(value.at))) return null;
  if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0) return null;
  if (typeof value.argChars !== 'number' || typeof value.resultChars !== 'number') return null;
  if (typeof value.isError !== 'boolean') return null;
  return value as unknown as TraceLineLike;
}
