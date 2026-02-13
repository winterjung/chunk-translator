import { state, els } from '../state.js';
import { coerceNumber, resolveTotalTokens, resolveCachedTokens } from '../utils.js';

export function addUsage(bucket, usage) {
    if (!usage) return;
    bucket.has = true;
    bucket.prompt += coerceNumber(usage.prompt);
    bucket.cached += coerceNumber(usage.cached);
    bucket.completion += coerceNumber(usage.completion);
    bucket.total += coerceNumber(usage.total);
}

export function resetUsageTotals() {
    state.usageTotals.summary = { prompt: 0, cached: 0, completion: 0, total: 0, has: false };
    state.usageTotals.translate = { prompt: 0, cached: 0, completion: 0, total: 0, has: false };
}

export function normalizeUsageTotalsBucket(bucket) {
    if (!bucket || typeof bucket !== "object") return null;
    const prompt = coerceNumber(bucket.prompt);
    const cached = coerceNumber(bucket.cached);
    const completion = coerceNumber(bucket.completion);
    const total = resolveTotalTokens(bucket.total, prompt, completion);
    const has = Boolean(bucket.has || prompt || cached || completion || total);
    if (!has) return null;
    return { prompt, cached, completion, total, has };
}

export function normalizeStoredUsageTotals(rawTotals) {
    if (!rawTotals || typeof rawTotals !== "object") return null;
    const summary = normalizeUsageTotalsBucket(rawTotals.summary);
    const translate = normalizeUsageTotalsBucket(rawTotals.translate);
    if (!summary && !translate) return null;
    return {
        summary: summary || { prompt: 0, cached: 0, completion: 0, total: 0, has: false },
        translate: translate || { prompt: 0, cached: 0, completion: 0, total: 0, has: false },
    };
}

export function recomputeUsageTotals() {
    resetUsageTotals();
    if (state.summary.usage) addUsage(state.usageTotals.summary, state.summary.usage);
    state.chunks.forEach((chunk) => {
        if (chunk.usage) addUsage(state.usageTotals.translate, chunk.usage);
    });
}

export function getRateValue(raw, fallback) {
    const value = raw === "" || raw === null || raw === undefined ? null : Number(raw);
    if (value === null || !Number.isFinite(value) || value < 0) return fallback;
    return value;
}

export function getPricing(kind) {
    const promptEl = kind === "summary" ? els.summaryPricePrompt : els.translatePricePrompt;
    const cachedEl = kind === "summary" ? els.summaryPriceCached : els.translatePriceCached;
    const completionEl = kind === "summary" ? els.summaryPriceCompletion : els.translatePriceCompletion;
    const prompt = getRateValue(promptEl ? promptEl.value.trim() : "", 0);
    const cached = getRateValue(cachedEl ? cachedEl.value.trim() : "", prompt);
    const completion = getRateValue(completionEl ? completionEl.value.trim() : "", 0);
    return { prompt, cached, completion };
}

export function formatUsd(value) {
    if (!Number.isFinite(value)) return "$0.00";
    const abs = Math.abs(value);
    if (abs === 0) return "$0.00";
    if (abs < 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(2)}`;
}

export function formatUsageLine(bucket) {
    if (!bucket.has) return "N/A";
    return `prompt ${bucket.prompt} (cached ${bucket.cached}) / completion ${bucket.completion} / total ${bucket.total}`;
}

export function computeCost(bucket, pricing) {
    if (!bucket.has) return 0;
    const prompt = coerceNumber(bucket.prompt);
    const cached = Math.min(prompt, coerceNumber(bucket.cached));
    const completion = coerceNumber(bucket.completion);
    const uncached = Math.max(0, prompt - cached);
    const cost = (uncached * pricing.prompt + cached * pricing.cached + completion * pricing.completion) / 1_000_000;
    return Number.isFinite(cost) ? cost : 0;
}

export function updateUsageUI() {
    const s = state.usageTotals.summary;
    const t = state.usageTotals.translate;
    const summaryPricing = getPricing("summary");
    const translatePricing = getPricing("translate");
    const summaryCost = computeCost(s, summaryPricing);
    const translateCost = computeCost(t, translatePricing);
    const totalCost = summaryCost + translateCost;
    els.summaryUsage.textContent = formatUsageLine(s);
    els.translateUsage.textContent = formatUsageLine(t);
    els.summaryCost.textContent = s.has ? formatUsd(summaryCost) : "N/A";
    els.translateCost.textContent = t.has ? formatUsd(translateCost) : "N/A";
    els.totalCost.textContent = (s.has || t.has) ? formatUsd(totalCost) : "N/A";
}
