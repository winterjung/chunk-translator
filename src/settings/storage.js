import { els } from '../state.js';
import { STORAGE_KEY, DEFAULT_CONCURRENCY } from '../constants.js';
import { setLog } from '../ui/log.js';

export function saveSettings(options = {}) {
    const { silent = false } = options;
    const payload = {
        baseUrl: els.baseUrl.value.trim(),
        apiKey: els.apiKey.value,
        summaryModel: els.summaryModel.value.trim(),
        translateModel: els.translateModel.value.trim(),
        targetLang: els.targetLang.value.trim(),
        concurrency: Number(els.concurrencyRange.value) || DEFAULT_CONCURRENCY,
        summaryPricePrompt: els.summaryPricePrompt.value,
        summaryPriceCached: els.summaryPriceCached.value,
        summaryPriceCompletion: els.summaryPriceCompletion.value,
        translatePricePrompt: els.translatePricePrompt.value,
        translatePriceCached: els.translatePriceCached.value,
        translatePriceCompletion: els.translatePriceCompletion.value,
        pricingOpen: els.pricingDetails ? els.pricingDetails.open : undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    if (!silent) {
        setLog(els.inputLog, "Saved.", "ok");
    }
}

export function loadSettings() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (data.baseUrl) els.baseUrl.value = data.baseUrl;
        if (data.apiKey) els.apiKey.value = data.apiKey;
        if (data.summaryModel) els.summaryModel.value = data.summaryModel;
        if (data.translateModel) els.translateModel.value = data.translateModel;
        if (data.targetLang) {
            els.targetLang.value = data.targetLang;
        } else {
            const legacy = (data.targetLangCustom || data.targetLangPreset || "").trim();
            if (legacy) els.targetLang.value = legacy;
        }
        if (data.concurrency) {
            els.concurrencyRange.value = String(data.concurrency);
        }
        if (data.summaryPricePrompt !== undefined) {
            els.summaryPricePrompt.value = String(data.summaryPricePrompt ?? "");
        }
        if (data.summaryPriceCached !== undefined) {
            els.summaryPriceCached.value = String(data.summaryPriceCached ?? "");
        }
        if (data.summaryPriceCompletion !== undefined) {
            els.summaryPriceCompletion.value = String(data.summaryPriceCompletion ?? "");
        }
        if (data.translatePricePrompt !== undefined) {
            els.translatePricePrompt.value = String(data.translatePricePrompt ?? "");
        }
        if (data.translatePriceCached !== undefined) {
            els.translatePriceCached.value = String(data.translatePriceCached ?? "");
        }
        if (data.translatePriceCompletion !== undefined) {
            els.translatePriceCompletion.value = String(data.translatePriceCompletion ?? "");
        }
        if (data.pricingOpen !== undefined && els.pricingDetails) {
            els.pricingDetails.open = Boolean(data.pricingOpen);
        }
        return data;
    } catch (err) {
        setLog(els.inputLog, "Error: invalid settings.", "error");
    }
    return null;
}
