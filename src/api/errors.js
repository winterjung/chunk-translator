export function extractErrorMessage(payload) {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    if (Array.isArray(payload)) {
        for (const item of payload) {
            const message = extractErrorMessage(item);
            if (message) return message;
        }
        return "";
    }
    if (payload.message && typeof payload.message === "string") return payload.message;
    if (payload.error) {
        if (typeof payload.error === "string") return payload.error;
        if (payload.error.message && typeof payload.error.message === "string") return payload.error.message;
        if (Array.isArray(payload.error.details)) {
            for (const detail of payload.error.details) {
                if (detail && typeof detail.message === "string") return detail.message;
            }
        }
    }
    return "";
}

export function getUnsupportedBaseUrlMessage(baseUrl) {
    if (!baseUrl) return "";
    if (/api\.anthropic\.com/i.test(baseUrl)) return "Anthropic not yet supported.";
    return "";
}
