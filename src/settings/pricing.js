import { els, state } from '../state.js';
import { WELL_KNOWN_MODEL_PRICING, MODEL_ALIASES } from '../constants.js';
import { normalizeModelId, stripProviderPrefix, parseCostValue } from '../utils.js';
import { saveSettings } from './storage.js';
import { updateUsageUI } from '../ui/usage.js';

export function resolveWellKnownPricing(modelId) {
    const normalized = normalizeModelId(stripProviderPrefix(modelId));
    if (!normalized) return null;
    const key = MODEL_ALIASES[normalized] || normalized;
    return WELL_KNOWN_MODEL_PRICING[key] || null;
}

export function setPriceInputValue(el, value) {
    if (!el) return;
    if (value === null || value === undefined) {
        el.value = "";
        return;
    }
    el.value = String(value);
}

export function prefillPricingForModel(kind, modelId, options = {}) {
    const { silent = false } = options;
    const pricing = resolveWellKnownPricing(modelId);
    if (!pricing) return;
    const inputCost = parseCostValue(pricing.input);
    const outputCost = parseCostValue(pricing.output);
    const cachedCost = parseCostValue(pricing.cache_read);
    if (inputCost === null && outputCost === null && cachedCost === null) return;
    const promptEl = kind === "summary" ? els.summaryPricePrompt : els.translatePricePrompt;
    const cachedEl = kind === "summary" ? els.summaryPriceCached : els.translatePriceCached;
    const completionEl = kind === "summary" ? els.summaryPriceCompletion : els.translatePriceCompletion;
    setPriceInputValue(promptEl, inputCost);
    setPriceInputValue(cachedEl, cachedCost);
    setPriceInputValue(completionEl, outputCost);
    saveSettings({ silent });
    updateUsageUI();
}

export function hasStoredPricing(data, kind) {
    if (!data || typeof data !== "object") return false;
    if (kind === "summary") {
        return (
            Object.prototype.hasOwnProperty.call(data, "summaryPricePrompt") ||
            Object.prototype.hasOwnProperty.call(data, "summaryPriceCached") ||
            Object.prototype.hasOwnProperty.call(data, "summaryPriceCompletion")
        );
    }
    return (
        Object.prototype.hasOwnProperty.call(data, "translatePricePrompt") ||
        Object.prototype.hasOwnProperty.call(data, "translatePriceCached") ||
        Object.prototype.hasOwnProperty.call(data, "translatePriceCompletion")
    );
}

export function hasAnyPriceInput(kind) {
    const promptEl = kind === "summary" ? els.summaryPricePrompt : els.translatePricePrompt;
    const cachedEl = kind === "summary" ? els.summaryPriceCached : els.translatePriceCached;
    const completionEl = kind === "summary" ? els.summaryPriceCompletion : els.translatePriceCompletion;
    return [promptEl, cachedEl, completionEl].some((el) => el && el.value.trim() !== "");
}

export function prefillPricingDefaults(storedSettings) {
    if (!hasStoredPricing(storedSettings, "summary") && !hasAnyPriceInput("summary")) {
        prefillPricingForModel("summary", els.summaryModel.value, { silent: true });
    }
    if (!hasStoredPricing(storedSettings, "translate") && !hasAnyPriceInput("translate")) {
        prefillPricingForModel("translate", els.translateModel.value, { silent: true });
    }
}
