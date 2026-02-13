import { state, els } from '../state.js';
import { DEFAULT_CONCURRENCY } from '../constants.js';
import { chunkText } from './splitter.js';
import { renderChunks } from '../ui/chunks.js';
import { setLog } from '../ui/log.js';

export function createChunk(text) {
    const hasCrypto = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
    return {
        id: hasCrypto ? crypto.randomUUID() : String(Date.now() + Math.random()),
        sourceText: text,
        translatedText: "",
        status: "pending",
        error: "",
        usage: null,
        extraInstruction: "",
    };
}

export function getConcurrency() {
    const value = Number(els.concurrencyRange.value);
    if (!Number.isFinite(value) || value < 1) return DEFAULT_CONCURRENCY;
    return Math.min(8, Math.max(1, Math.floor(value)));
}

export function updateConcurrencyUI() {
    const value = getConcurrency();
    els.concurrencyValue.textContent = String(value);
}

export function getTargetLanguage() {
    return els.targetLang.value.trim() || "English";
}

export function applyChunking() {
    const raw = els.sourceInput.value;
    if (!raw.trim()) {
        setLog(els.chunkLog, "Error: invalid input.", "error");
        return;
    }
    const texts = chunkText(raw);
    state.chunks = texts.map((text) => createChunk(text));
    renderChunks();
    // scheduleDraftSave will be called from main.js event handler
    setLog(els.chunkLog, `Done. ${texts.length} chunks.`, "ok");
}

export function mergeSeparator(left, right) {
    const leftHasNewline = /\n$/.test(left);
    const rightHasNewline = /^\n/.test(right);
    if (leftHasNewline || rightHasNewline) return "";
    return "\n\n";
}

export function mergeChunks(index, direction) {
    if (direction === "up" && index === 0) {
        setLog(els.chunkLog, "Error: top chunk.", "error");
        return;
    }
    if (direction === "down" && index === state.chunks.length - 1) {
        setLog(els.chunkLog, "Error: bottom chunk.", "error");
        return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const firstIndex = Math.min(index, targetIndex);
    const secondIndex = Math.max(index, targetIndex);
    const first = state.chunks[firstIndex];
    const second = state.chunks[secondIndex];
    const separator = mergeSeparator(first.sourceText, second.sourceText);
    first.sourceText = `${first.sourceText}${separator}${second.sourceText}`;
    first.translatedText = "";
    first.status = "pending";
    first.error = "";
    first.usage = null;
    state.chunks.splice(secondIndex, 1);
    renderChunks();
    // scheduleDraftSave will be called from main.js event handler
    setLog(els.chunkLog, "Merged.", "ok");
}

export function splitChunkAt(index, position) {
    const chunk = state.chunks[index];
    if (!chunk) return;
    if (position <= 0 || position >= chunk.sourceText.length) {
        setLog(els.chunkLog, "Error: 커서 위치 필요.", "error");
        return;
    }
    const left = chunk.sourceText.slice(0, position);
    const right = chunk.sourceText.slice(position);
    if (!left.trim() || !right.trim()) {
        setLog(els.chunkLog, "Error: 분할 불가.", "error");
        return;
    }
    chunk.sourceText = left;
    chunk.translatedText = "";
    chunk.status = "pending";
    chunk.error = "";
    chunk.usage = null;
    const next = createChunk(right);
    state.chunks.splice(index + 1, 0, next);
    renderChunks();
    // scheduleDraftSave will be called from main.js event handler
    setLog(els.chunkLog, "Split.", "ok");
}
