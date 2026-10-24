function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseRecordLine(line) {
    const text = line.trim();
    if (!text)
        return null;
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return null;
    }
    if (!isRecord(value))
        return null;
    if (value.v !== 1)
        return null;
    if (typeof value.sessionId !== 'string' || typeof value.at !== 'string' || typeof value.tool !== 'string')
        return null;
    if (Number.isNaN(Date.parse(value.at)))
        return null;
    if (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs) || value.durationMs < 0)
        return null;
    if (typeof value.argChars !== 'number' || typeof value.resultChars !== 'number')
        return null;
    if (typeof value.isError !== 'boolean')
        return null;
    return value;
}
//# sourceMappingURL=trace-line.js.map