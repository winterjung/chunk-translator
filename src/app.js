import { els, state } from './state.js';
import { loadSettings, saveSettings } from './settings/storage.js';
import { prefillPricingDefaults, prefillPricingForModel } from './settings/pricing.js';
import { saveDraft, loadDraft } from './chunking/draft.js';
import { updateConcurrencyUI, applyChunking, mergeChunks, splitChunkAt } from './chunking/operations.js';
import { updateUsageUI, resetUsageTotals } from './ui/usage.js';
import { renderChunks } from './ui/chunks.js';
import { setLog, setSettingsCollapsed, applyPresetValue } from './ui/log.js';
import { testConnection } from './api/connection.js';
import { generateSummary } from './translation/summary.js';
import { toggleTranslateAll, updateTranslateButton, copyAllTranslations } from './translation/queue.js';
import { enqueueChunk, processQueue } from './translation/translate.js';

function clearAllInputs() {
    if (state.draftTimer) {
        clearTimeout(state.draftTimer);
        state.draftTimer = null;
    }
    state.translateLabelTimers.forEach((timer) => clearTimeout(timer));
    state.translateLabelTimers.clear();
    resetQueueState();
    els.sourceInput.value = "";
    els.summaryText.value = "";
    state.summary = { text: "", usage: null };
    state.chunks = [];
    renderChunks();
    resetUsageTotals();
    updateUsageUI();
    updateTranslateButton();
    setLog(els.summaryLog, "", "");
    setLog(els.chunkLog, "Cleared.", "ok");
    try {
        localStorage.removeItem("chunk-translator-draft-v1");
    } catch (err) {
        console.warn("Draft remove failed.", err);
    }
}

function resetQueueState() {
    state.queue.cancelRequested = true;
    state.queue.list = [];
    state.queue.queued.clear();
    state.queue.controllers.forEach((controller) => controller.abort());
    state.queue.controllers.clear();
    state.queue.inFlight.clear();
    state.queue.active = 0;
    state.queue.running = false;
    state.queue.cancelRequested = false;
}

function initEvents() {
    let saveTimer = null;
    const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveSettings, 400);
    };
    const saveInputs = [
        els.baseUrl,
        els.apiKey,
        els.summaryModel,
        els.translateModel,
        els.targetLang,
        els.concurrencyRange,
        els.summaryPricePrompt,
        els.summaryPriceCached,
        els.summaryPriceCompletion,
        els.translatePricePrompt,
        els.translatePriceCached,
        els.translatePriceCompletion,
    ];
    saveInputs.forEach((el) => {
        el.addEventListener("change", saveSettings);
        el.addEventListener("input", () => {
            scheduleSave();
            setLog(els.inputLog, "Saved.", "ok");
            updateUsageUI();
        });
    });

    els.summaryModel.addEventListener("input", () => {
        prefillPricingForModel("summary", els.summaryModel.value);
    });

    els.translateModel.addEventListener("input", () => {
        prefillPricingForModel("translate", els.translateModel.value);
    });

    if (els.pricingDetails) {
        els.pricingDetails.addEventListener("toggle", () => {
            saveSettings({ silent: true });
        });
    }

    els.sourceInput.addEventListener("input", () => {
        scheduleDraftSave();
    });

    els.concurrencyRange.addEventListener("input", () => {
        updateConcurrencyUI();
        if (state.queue.running) processQueue();
    });

    document.querySelectorAll(".preset-chips").forEach((group) => {
        group.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-target][data-value]");
            if (!button || !group.contains(button)) return;
            applyPresetValue(button.dataset.target, button.dataset.value);
        });
    });

    els.summaryText.addEventListener("input", () => {
        state.summary.text = els.summaryText.value;
        setLog(els.summaryLog, "Saved.", "ok");
        scheduleDraftSave();
    });

    if (els.settingsToggle) {
        els.settingsToggle.addEventListener("click", () => {
            const collapsed = els.settingsSection.classList.contains("is-collapsed");
            setSettingsCollapsed(!collapsed);
        });
    }

    if (els.connectionTestBtn) {
        els.connectionTestBtn.addEventListener("click", testConnection);
    }

    els.chunkBtn.addEventListener("click", () => {
        applyChunking();
        scheduleDraftSave();
    });

    if (els.resetBtn) {
        els.resetBtn.addEventListener("click", clearAllInputs);
    }

    els.summaryBtn.addEventListener("click", () => {
        generateSummary();
        scheduleDraftSave();
    });

    els.translateBtn.addEventListener("click", toggleTranslateAll);
    els.copyAllBtn.addEventListener("click", copyAllTranslations);

    els.chunkList.addEventListener("input", (event) => {
        const target = event.target;
        if (target && target.matches("textarea[data-role='chunk-source']")) {
            const id = target.dataset.id;
            const chunk = state.chunks.find((item) => item.id === id);
            if (!chunk) return;
            chunk.sourceText = target.value;
            chunk.status = "pending";
            chunk.error = "";
            const card = els.chunkList.querySelector(`.chunk-card[data-id='${id}']`);
            if (card) {
                const lengthMeta = card.querySelector("[data-role='length']");
                if (lengthMeta) lengthMeta.textContent = `길이: ${chunk.sourceText.length}자`;
            }
            setLog(els.chunkLog, "Saved.", "ok");
            scheduleDraftSave();
        }
    });

    els.chunkList.addEventListener("click", (event) => {
        const target = event.target;
        if (!target || !target.dataset.action) return;
        const id = target.dataset.id;
        const index = state.chunks.findIndex((item) => item.id === id);
        if (index === -1) return;
        if (target.dataset.action === "merge-up") {
            mergeChunks(index, "up");
            scheduleDraftSave();
            return;
        }
        if (target.dataset.action === "merge-down") {
            mergeChunks(index, "down");
            scheduleDraftSave();
            return;
        }
        if (target.dataset.action === "split") {
            const textarea = els.chunkList.querySelector(`textarea[data-role='chunk-source'][data-id='${id}']`);
            const cursor = textarea ? textarea.selectionStart : 0;
            splitChunkAt(index, cursor);
            scheduleDraftSave();
            return;
        }
        if (target.dataset.action === "translate") {
            const chunk = state.chunks[index];
            if (!chunk) return;
            state.queue.cancelRequested = false;
            chunk.status = "pending";
            chunk.error = "";
            enqueueChunk(id);
            const card = els.chunkList.querySelector(`.chunk-card[data-id='${id}']`);
            if (card) {
                const translateBtn = card.querySelector("[data-role='translate-btn']");
                if (translateBtn) {
                    translateBtn.textContent = "Translating...";
                    translateBtn.disabled = true;
                }
            }
            setLog(els.chunkLog, "Queued 1 chunk.", "ok");
            return;
        }
    });

    els.chunkList.addEventListener("input", (event) => {
        const target = event.target;
        if (target && target.matches("textarea[data-role='extra']")) {
            const id = target.dataset.id;
            const chunk = state.chunks.find((item) => item.id === id);
            if (!chunk) return;
            chunk.extraInstruction = target.value;
            scheduleDraftSave();
        }
    });

    window.addEventListener("beforeunload", saveDraft);
}

function scheduleDraftSave() {
    if (state.draftTimer) clearTimeout(state.draftTimer);
    state.draftTimer = setTimeout(saveDraft, 500);
}

// Initialize app
const storedSettings = loadSettings();
prefillPricingDefaults(storedSettings);
loadDraft();
updateConcurrencyUI();
updateUsageUI();
updateTranslateButton();
initEvents();
