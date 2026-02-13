import { state, els } from '../state.js';
import { SYSTEM_SUMMARY } from '../constants.js';
import { callChatCompletionStream } from '../api/client.js';
import { getUnsupportedBaseUrlMessage } from '../api/errors.js';
import { setLog } from '../ui/log.js';
import { addUsage, updateUsageUI } from '../ui/usage.js';
import { getTargetLanguage } from '../chunking/operations.js';

export async function generateSummary() {
    const source = els.sourceInput.value.trim();
    if (!source) {
        setLog(els.summaryLog, "Error: invalid input.", "error");
        return;
    }
    const target = getTargetLanguage();
    const baseUrl = els.baseUrl.value.trim();
    const apiKey = els.apiKey.value;
    const model = els.summaryModel.value.trim();
    if (!baseUrl || !model) {
        setLog(els.summaryLog, "Error: missing settings.", "error");
        return;
    }
    const unsupportedMessage = getUnsupportedBaseUrlMessage(baseUrl);
    if (unsupportedMessage) {
        setLog(els.summaryLog, `Error: ${unsupportedMessage}`, "error");
        return;
    }
    els.summaryBtn.disabled = true;
    setLog(els.summaryLog, "요약 생성 중...", "");
    try {
        els.summaryText.value = "";
        state.summary.text = "";
        state.summary.usage = null;
        const messages = [
            { role: "system", content: SYSTEM_SUMMARY },
            {
                role: "user",
                content: [
                    "Summarize the following text into 3-5 bullet points in the target language.",
                    `Target language: ${target}`,
                    "<text>",
                    source,
                    "</text>",
                ].join("\n"),
            },
        ];
        let streamedText = "";
        let streamedUsage = null;
        const streamResult = await callChatCompletionStream({
            baseUrl,
            apiKey,
            model,
            messages,
            onDelta: (deltaText) => {
                streamedText += deltaText;
                els.summaryText.value = streamedText;
                state.summary.text = streamedText;
            },
            onUsage: (usage) => {
                streamedUsage = usage;
            },
        });
        if (!streamedText && streamResult && streamResult.text) {
            streamedText = streamResult.text;
        }
        if (!streamedText) throw new Error("Empty response");
        const finalText = streamedText.trim();
        els.summaryText.value = finalText;
        state.summary.text = finalText;
        const usage = streamedUsage || (streamResult ? streamResult.usage : null);
        state.summary.usage = usage || null;
        if (usage) addUsage(state.usageTotals.summary, usage);
        updateUsageUI();
        // scheduleDraftSave will be called from main.js event handler
        setLog(els.summaryLog, "Done.", "ok");
    } catch (err) {
        setLog(els.summaryLog, `Error: ${err.message}`, "error");
    } finally {
        els.summaryBtn.disabled = false;
    }
}
