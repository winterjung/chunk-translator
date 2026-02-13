import { MODEL_ALIASES } from './constants.js';

export function coerceNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

export function normalizeModelId(value) {
    return (value || "").trim().toLowerCase();
}

export function stripProviderPrefix(modelId) {
    const raw = String(modelId || "").trim();
    const lower = raw.toLowerCase();
    const prefixes = ["openai/", "anthropic/", "google/", "gemini/"];
    for (const prefix of prefixes) {
        if (lower.startsWith(prefix)) return raw.slice(prefix.length);
    }
    return raw;
}

export function resolveCachedTokens(usage) {
    if (!usage || typeof usage !== "object") return 0;
    const direct = usage.cached ?? usage.cached_tokens ?? usage.prompt_cached_tokens ?? usage.input_cached_tokens;
    if (direct !== undefined && direct !== null) return coerceNumber(direct);
    if (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens !== undefined) {
        return coerceNumber(usage.prompt_tokens_details.cached_tokens);
    }
    if (usage.input_tokens_details && usage.input_tokens_details.cached_tokens !== undefined) {
        return coerceNumber(usage.input_tokens_details.cached_tokens);
    }
    return 0;
}

export function resolveTotalTokens(rawTotal, prompt, completion) {
    const total = Number(rawTotal);
    if (Number.isFinite(total) && total > 0) return total;
    const computed = prompt + completion;
    return Number.isFinite(computed) ? computed : 0;
}

export function normalizeUsage(usage) {
    if (!usage || typeof usage !== "object") return null;
    const prompt = coerceNumber(usage.prompt ?? usage.prompt_tokens ?? usage.input_tokens);
    const completion = coerceNumber(usage.completion ?? usage.completion_tokens ?? usage.output_tokens);
    const total = resolveTotalTokens(usage.total ?? usage.total_tokens, prompt, completion);
    const cached = resolveCachedTokens(usage);
    if (!prompt && !completion && !total && !cached) return null;
    return { prompt, cached, completion, total };
}

export function normalizeStoredUsage(usage) {
    if (!usage || typeof usage !== "object") return null;
    const prompt = coerceNumber(usage.prompt ?? usage.prompt_tokens ?? usage.input_tokens);
    const completion = coerceNumber(usage.completion ?? usage.completion_tokens ?? usage.output_tokens);
    const total = resolveTotalTokens(usage.total ?? usage.total_tokens, prompt, completion);
    const cached = resolveCachedTokens(usage);
    if (!prompt && !completion && !total && !cached) return null;
    return { prompt, cached, completion, total };
}

export function parseCostValue(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}
