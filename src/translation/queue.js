import { state, els } from '../state.js';
import { enqueueChunk } from './translate.js';
import { updateChunkCard, flashCopyAllButton } from '../ui/chunks.js';
import { setLog } from '../ui/log.js';

export function startTranslateAll() {
    if (!state.chunks.length) {
        setLog(els.chunkLog, "Error: no chunks.", "error");
        return;
    }
    state.queue.cancelRequested = false;
    state.queue.running = true;
    updateTranslateButton();
    state.queue.list = [];
    state.queue.queued.clear();
    state.chunks.forEach((chunk) => {
        chunk.status = "pending";
        chunk.error = "";
        enqueueChunk(chunk.id);
        updateChunkCard(chunk);
    });
    setLog(els.chunkLog, `Queued ${state.chunks.length} chunks.`, "ok");
}

export function updateTranslateButton() {
    if (state.queue.running) {
        els.translateBtn.textContent = "■ 중지";
        els.translateBtn.setAttribute("aria-label", "번역 중지");
    } else {
        els.translateBtn.textContent = "▶ 전체 번역 시작";
        els.translateBtn.setAttribute("aria-label", "전체 번역 시작");
    }
}

export function stopAllTranslations() {
    state.queue.cancelRequested = true;
    state.queue.list = [];
    state.queue.queued.clear();
    state.queue.controllers.forEach((controller) => controller.abort());
    state.queue.controllers.clear();
    state.queue.inFlight.clear();
    state.queue.active = 0;
    state.queue.running = false;
    state.chunks.forEach((chunk) => {
        if (chunk.status === "active" || chunk.status === "pending") {
            chunk.status = "error";
            chunk.error = "Canceled.";
            updateChunkCard(chunk);
        }
    });
    updateTranslateButton();
    setLog(els.chunkLog, "Canceled.", "error");
    // scheduleDraftSave will be called from main.js event handler
}

export function toggleTranslateAll() {
    if (state.queue.running) {
        stopAllTranslations();
    } else {
        startTranslateAll();
    }
}

export async function copyAllTranslations() {
    const hasTranslation = state.chunks.some((chunk) => (chunk.translatedText || "").trim());
    if (!hasTranslation) {
        flashCopyAllButton("Nothing to copy.");
        return;
    }
    const missing = state.chunks.filter((chunk) => !(chunk.translatedText || "").trim());
    if (missing.length) {
        setLog(els.chunkLog, "Warning: 일부 청크 미완료.", "error");
    }
    const text = state.chunks.map((chunk) => chunk.translatedText || "").join("\n\n");
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const temp = document.createElement("textarea");
            temp.value = text;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            temp.remove();
        }
        flashCopyAllButton("Copied.");
    } catch (err) {
        setLog(els.chunkLog, "Error: copy failed.", "error");
    }
}
