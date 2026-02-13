export let draftTimer = null;
export const logTimers = new WeakMap();
export const translateLabelTimers = new Map();
export const chunkUpdateFrames = new Map();

export const state = {
    summary: { text: "", usage: null },
    chunks: [],
    usageTotals: {
        summary: { prompt: 0, cached: 0, completion: 0, total: 0, has: false },
        translate: { prompt: 0, cached: 0, completion: 0, total: 0, has: false },
    },
    queue: {
        list: [],
        queued: new Set(),
        inFlight: new Set(),
        active: 0,
        controllers: new Map(),
        running: false,
        cancelRequested: false,
    },
};

export const els = {
    settingsSection: document.getElementById("settingsSection"),
    settingsToggle: document.getElementById("settingsToggle"),
    settingsBody: document.getElementById("settingsBody"),
    baseUrl: document.getElementById("baseUrl"),
    apiKey: document.getElementById("apiKey"),
    summaryModel: document.getElementById("summaryModel"),
    translateModel: document.getElementById("translateModel"),
    targetLang: document.getElementById("targetLang"),
    sourceInput: document.getElementById("sourceInput"),
    summaryText: document.getElementById("summaryText"),
    summaryBtn: document.getElementById("summaryBtn"),
    chunkBtn: document.getElementById("chunkBtn"),
    resetBtn: document.getElementById("resetBtn"),
    translateBtn: document.getElementById("translateBtn"),
    chunkList: document.getElementById("chunkList"),
    chunkCount: document.getElementById("chunkCount"),
    summaryUsage: document.getElementById("summaryUsage"),
    translateUsage: document.getElementById("translateUsage"),
    summaryCost: document.getElementById("summaryCost"),
    translateCost: document.getElementById("translateCost"),
    totalCost: document.getElementById("totalCost"),
    pricingDetails: document.getElementById("pricingDetails"),
    summaryPricePrompt: document.getElementById("summaryPricePrompt"),
    summaryPriceCached: document.getElementById("summaryPriceCached"),
    summaryPriceCompletion: document.getElementById("summaryPriceCompletion"),
    translatePricePrompt: document.getElementById("translatePricePrompt"),
    translatePriceCached: document.getElementById("translatePriceCached"),
    translatePriceCompletion: document.getElementById("translatePriceCompletion"),
    copyAllBtn: document.getElementById("copyAllBtn"),
    inputLog: document.getElementById("inputLog"),
    connectionTestBtn: document.getElementById("connectionTestBtn"),
    connectionTestLog: document.getElementById("connectionTestLog"),
    summaryLog: document.getElementById("summaryLog"),
    chunkLog: document.getElementById("chunkLog"),
    concurrencyRange: document.getElementById("concurrencyRange"),
    concurrencyValue: document.getElementById("concurrencyValue"),
};

export function setDraftTimer(value) {
    draftTimer = value;
}
