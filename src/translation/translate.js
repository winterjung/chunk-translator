import { state, els } from '../state.js';
import { SYSTEM_TRANSLATION } from '../constants.js';
import { callChatCompletionStream } from '../api/client.js';
import { getUnsupportedBaseUrlMessage } from '../api/errors.js';
import { scheduleChunkUpdate, flushChunkUpdate, updateChunkCard } from '../ui/chunks.js';
import { addUsage, updateUsageUI } from '../ui/usage.js';
import { getTargetLanguage, getConcurrency } from '../chunking/operations.js';

export function enqueueChunk(id) {
    if (state.queue.cancelRequested) return;
    if (state.queue.queued.has(id) || state.queue.inFlight.has(id)) return;
    state.queue.queued.add(id);
    state.queue.list.push(id);
    processQueue();
}

export function processQueue() {
    if (state.queue.cancelRequested) return;
    const limit = getConcurrency();
    while (state.queue.active < limit && state.queue.list.length) {
        const id = state.queue.list.shift();
        state.queue.queued.delete(id);
        translateChunk(id);
    }
}

export async function translateChunk(id) {
    const chunk = state.chunks.find((item) => item.id === id);
    if (!chunk) return;
    if (state.queue.cancelRequested) {
        chunk.status = "error";
        chunk.error = "Canceled.";
        updateChunkCard(chunk);
        return;
    }
    const baseUrl = els.baseUrl.value.trim();
    const apiKey = els.apiKey.value;
    const model = els.translateModel.value.trim();
    if (!baseUrl || !model) {
        chunk.status = "error";
        chunk.error = "Missing settings.";
        updateChunkCard(chunk);
        return;
    }
    const unsupportedMessage = getUnsupportedBaseUrlMessage(baseUrl);
    if (unsupportedMessage) {
        chunk.status = "error";
        chunk.error = unsupportedMessage;
        updateChunkCard(chunk);
        return;
    }
    state.queue.active += 1;
    state.queue.inFlight.add(id);
    const controller = new AbortController();
    state.queue.controllers.set(id, controller);
    chunk.status = "active";
    chunk.error = "";
    updateChunkCard(chunk);
    try {
        const target = getTargetLanguage();
        const summaryText = els.summaryText.value.trim();
        const extra = chunk.extraInstruction ? chunk.extraInstruction.trim() : "";
        const previous = chunk.translatedText ? chunk.translatedText.trim() : "";
        chunk.translatedText = "";
        chunk.usage = null;
        updateChunkCard(chunk);
        const contentParts = [
            `Target language: ${target}`,
        ];
        if (extra) {
            contentParts.push(
                `Chunk extra instruction: ${extra}`,
            );
        }
        if (previous) {
            contentParts.push(
                "Previous translation (use as a draft to improve the translation):",
                "<previous>",
                previous,
                "</previous>",
            );
        }
        if (summaryText) {
            contentParts.push(
                "Summary (use as a context to improve the translation):",
                "<summary>",
                summaryText,
                "</summary>",
            );
        }
        contentParts.push(
            "Translate the following chunk:",
            "<chunk>",
            chunk.sourceText,
            "</chunk>",
        );
        const messages = [
            { role: "system", content: SYSTEM_TRANSLATION },
            {
                role: "user",
                content: contentParts.join("\n"),
            },
        ];
        const streamResult = await callChatCompletionStream({
            baseUrl,
            apiKey,
            model,
            messages,
            signal: controller.signal,
            onDelta: (deltaText) => {
                chunk.translatedText += deltaText;
                scheduleChunkUpdate(chunk);
            },
            onUsage: (usage) => {
                chunk.usage = usage;
            },
        });
        if (!chunk.translatedText && streamResult && streamResult.text) {
            chunk.translatedText = streamResult.text;
        }
        if (!chunk.translatedText) throw new Error("Empty response");
        chunk.translatedText = chunk.translatedText.trimEnd();
        chunk.status = "done";
        const usage = chunk.usage || (streamResult ? streamResult.usage : null);
        chunk.usage = usage || null;
        if (usage) addUsage(state.usageTotals.translate, usage);
        updateUsageUI();
    } catch (err) {
        chunk.status = "error";
        chunk.error = err && err.name === "AbortError" ? "Canceled." : err.message;
    } finally {
        flushChunkUpdate(chunk);
        // scheduleDraftSave will be called from main.js event handler
        if (state.queue.active > 0) state.queue.active -= 1;
        state.queue.inFlight.delete(id);
        state.queue.controllers.delete(id);
        processQueue();
        // updateTranslateButton and setLog will be called from queue.js
    }
}
