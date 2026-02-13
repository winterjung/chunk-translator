import { state, els } from '../state.js';
import { DRAFT_KEY } from '../constants.js';
import { normalizeStoredUsage } from '../utils.js';
import { normalizeStoredUsageTotals, recomputeUsageTotals } from '../ui/usage.js';
import { createChunk } from './operations.js';
import { renderChunks } from '../ui/chunks.js';

export function sanitizeChunkStatus(status) {
    if (status === "done" || status === "error" || status === "pending") return status;
    return "pending";
}

export function serializeChunkForDraft(chunk) {
    const status = chunk.status === "active" ? "pending" : chunk.status;
    return {
        id: chunk.id,
        sourceText: chunk.sourceText,
        translatedText: chunk.translatedText || "",
        status: sanitizeChunkStatus(status),
        error: chunk.error || "",
        usage: chunk.usage || null,
        extraInstruction: chunk.extraInstruction || "",
    };
}

export function createChunkFromDraft(raw) {
    const text = raw && typeof raw.sourceText === "string" ? raw.sourceText : "";
    const chunk = createChunk(text);
    if (raw && typeof raw.id === "string") chunk.id = raw.id;
    chunk.translatedText = raw && typeof raw.translatedText === "string" ? raw.translatedText : "";
    chunk.status = sanitizeChunkStatus(raw && raw.status ? raw.status : "pending");
    chunk.error = raw && typeof raw.error === "string" ? raw.error : "";
    chunk.usage = normalizeStoredUsage(raw ? raw.usage : null);
    chunk.extraInstruction = raw && typeof raw.extraInstruction === "string" ? raw.extraInstruction : "";
    return chunk;
}

export function saveDraft() {
    const sourceText = els.sourceInput.value;
    const summaryText = els.summaryText.value;
    const hasDraft = sourceText.trim() || summaryText.trim() || state.chunks.length;
    if (!hasDraft) {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (err) {
            console.warn("Draft remove failed.", err);
        }
        return;
    }
    const payload = {
        v: 1,
        savedAt: Date.now(),
        sourceText,
        summaryText,
        summaryUsage: state.summary.usage || null,
        usageTotals: state.usageTotals,
        chunks: state.chunks.map(serializeChunkForDraft),
    };
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (err) {
        console.warn("Draft save failed.", err);
    }
}

export function loadDraft() {
    let raw = null;
    try {
        raw = localStorage.getItem(DRAFT_KEY);
    } catch (err) {
        return;
    }
    if (!raw) return;
    let data = null;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        return;
    }
    if (data && typeof data.sourceText === "string") {
        els.sourceInput.value = data.sourceText;
    }
    if (data && typeof data.summaryText === "string") {
        els.summaryText.value = data.summaryText;
        state.summary.text = data.summaryText;
    }
    state.summary.usage = normalizeStoredUsage(data ? data.summaryUsage : null);
    if (data && Array.isArray(data.chunks) && data.chunks.length) {
        state.chunks = data.chunks.map(createChunkFromDraft).filter((chunk) => chunk.sourceText && chunk.sourceText.trim());
        renderChunks();
    }
    const storedTotals = normalizeStoredUsageTotals(data ? data.usageTotals : null);
    if (storedTotals) {
        state.usageTotals = storedTotals;
    } else {
        recomputeUsageTotals();
    }
}
