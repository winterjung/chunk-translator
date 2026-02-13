import { state, els, translateLabelTimers, chunkUpdateFrames } from '../state.js';

export function clearTranslateLabelTimer(id) {
    const timer = translateLabelTimers.get(id);
    if (timer) {
        clearTimeout(timer);
        translateLabelTimers.delete(id);
    }
}

export function shouldShowDetails(chunk) {
    if (chunk.status && chunk.status !== "pending") return true;
    return Boolean(chunk.translatedText && chunk.translatedText.trim());
}

export function shouldShowExtra(chunk) {
    if (!chunk || chunk.status !== "done") return false;
    return Boolean(chunk.translatedText && chunk.translatedText.trim());
}

export function applyTranslateButtonState(chunk, button) {
    clearTranslateLabelTimer(chunk.id);
    button.classList.remove("btn-done");
    if (chunk.status === "active") {
        button.textContent = "Translating...";
        button.disabled = true;
        return;
    }
    button.disabled = false;
    if (chunk.status === "done") {
        button.textContent = "✓ 완료";
        button.classList.add("btn-done");
        const timer = setTimeout(() => {
            translateLabelTimers.delete(chunk.id);
            const current = state.chunks.find((item) => item.id === chunk.id);
            if (!current || current.status !== "done") return;
            const card = els.chunkList.querySelector(`.chunk-card[data-id='${chunk.id}']`);
            if (!card) return;
            const currentButton = card.querySelector("[data-role='translate-btn']");
            if (!currentButton) return;
            currentButton.textContent = "↻ 재번역";
            currentButton.classList.remove("btn-done");
        }, 3000);
        translateLabelTimers.set(chunk.id, timer);
        return;
    }
    button.textContent = chunk.translatedText ? "↻ 재번역" : "▶ 번역";
}

export function renderChunks() {
    els.chunkList.innerHTML = "";
    state.chunks.forEach((chunk, index) => {
        const card = document.createElement("div");
        card.className = "chunk-card";
        card.dataset.id = chunk.id;

        const head = document.createElement("div");
        head.className = "chunk-head";

        const title = document.createElement("div");
        title.className = "chunk-title";
        title.textContent = `#${index + 1}`;

        head.appendChild(title);

        const actions = document.createElement("div");
        actions.className = "chunk-actions";

        const mergeUp = document.createElement("button");
        mergeUp.dataset.action = "merge-up";
        mergeUp.dataset.id = chunk.id;
        mergeUp.setAttribute("aria-label", "위와 병합");
        mergeUp.textContent = "↑ 위와 병합";

        const mergeDown = document.createElement("button");
        mergeDown.dataset.action = "merge-down";
        mergeDown.dataset.id = chunk.id;
        mergeDown.setAttribute("aria-label", "아래와 병합");
        mergeDown.textContent = "↓ 아래와 병합";

        const splitBtn = document.createElement("button");
        splitBtn.dataset.action = "split";
        splitBtn.dataset.id = chunk.id;
        splitBtn.setAttribute("aria-label", "커서에서 분할");
        splitBtn.textContent = "✂ 커서에서 분할";

        const translateBtn = document.createElement("button");
        translateBtn.dataset.action = "translate";
        translateBtn.dataset.role = "translate-btn";
        translateBtn.dataset.id = chunk.id;
        translateBtn.setAttribute("aria-label", "청크 번역");
        applyTranslateButtonState(chunk, translateBtn);

        actions.appendChild(mergeUp);
        actions.appendChild(mergeDown);
        actions.appendChild(splitBtn);
        actions.appendChild(translateBtn);

        const sourceLabel = document.createElement("div");
        sourceLabel.className = "label";
        sourceLabel.textContent = "원문";

        const sourceArea = document.createElement("textarea");
        sourceArea.dataset.role = "chunk-source";
        sourceArea.dataset.id = chunk.id;
        sourceArea.setAttribute("aria-label", "청크 원문");
        sourceArea.rows = 6;
        sourceArea.value = chunk.sourceText;

        const lengthMeta = document.createElement("div");
        lengthMeta.className = "chunk-meta";
        lengthMeta.dataset.role = "length";
        lengthMeta.dataset.id = chunk.id;
        lengthMeta.textContent = `길이: ${chunk.sourceText.length}자`;

        const resultLabel = document.createElement("div");
        resultLabel.className = "label";
        resultLabel.textContent = "번역 결과";

        const resultArea = document.createElement("textarea");
        resultArea.readOnly = true;
        resultArea.dataset.role = "translation";
        resultArea.dataset.id = chunk.id;
        resultArea.setAttribute("aria-label", "번역 결과");
        resultArea.rows = 6;
        resultArea.value = chunk.translatedText || "";

        const extraLabel = document.createElement("div");
        extraLabel.className = "label";
        extraLabel.textContent = "추가지시";

        const extraArea = document.createElement("textarea");
        extraArea.dataset.role = "extra";
        extraArea.dataset.id = chunk.id;
        extraArea.setAttribute("aria-label", "추가지시");
        extraArea.rows = 2;
        extraArea.placeholder = "예: 더 간결하게, 제목을 유지";
        extraArea.value = chunk.extraInstruction || "";

        const extraSection = document.createElement("div");
        extraSection.className = "chunk-extra";
        extraSection.dataset.role = "extra-section";
        extraSection.hidden = !shouldShowExtra(chunk);
        extraSection.appendChild(extraLabel);
        extraSection.appendChild(extraArea);

        const details = document.createElement("div");
        details.className = "chunk-details";
        details.dataset.role = "details";
        details.hidden = !shouldShowDetails(chunk);
        details.appendChild(resultLabel);
        details.appendChild(resultArea);
        details.appendChild(extraSection);

        const errorText = document.createElement("div");
        errorText.className = "error-text";
        errorText.dataset.role = "error";
        errorText.dataset.id = chunk.id;
        errorText.textContent = chunk.error || "";
        if (!chunk.error) errorText.style.display = "none";

        card.appendChild(head);
        card.appendChild(actions);
        card.appendChild(sourceLabel);
        card.appendChild(sourceArea);
        card.appendChild(lengthMeta);
        card.appendChild(details);
        card.appendChild(errorText);

        els.chunkList.appendChild(card);
    });
    els.chunkCount.textContent = String(state.chunks.length);
}

export function updateChunkCard(chunk) {
    const card = els.chunkList.querySelector(`.chunk-card[data-id='${chunk.id}']`);
    if (!card) {
        renderChunks();
        return;
    }
    const lengthMeta = card.querySelector("[data-role='length']");
    if (lengthMeta) {
        lengthMeta.textContent = `길이: ${chunk.sourceText.length}자`;
    }
    const translation = card.querySelector("[data-role='translation']");
    if (translation) {
        translation.value = chunk.translatedText || "";
    }
    const errorText = card.querySelector("[data-role='error']");
    if (errorText) {
        errorText.textContent = chunk.error || "";
        errorText.style.display = chunk.error ? "block" : "none";
    }
    const details = card.querySelector("[data-role='details']");
    if (details) {
        details.hidden = !shouldShowDetails(chunk);
    }
    const extraSection = card.querySelector("[data-role='extra-section']");
    if (extraSection) {
        extraSection.hidden = !shouldShowExtra(chunk);
    }
    const translateBtn = card.querySelector("[data-role='translate-btn']");
    if (translateBtn) {
        applyTranslateButtonState(chunk, translateBtn);
    }
}

export function scheduleChunkUpdate(chunk) {
    if (chunkUpdateFrames.has(chunk.id)) return;
    const frame = requestAnimationFrame(() => {
        chunkUpdateFrames.delete(chunk.id);
        updateChunkCard(chunk);
    });
    chunkUpdateFrames.set(chunk.id, frame);
}

export function flushChunkUpdate(chunk) {
    const frame = chunkUpdateFrames.get(chunk.id);
    if (frame) {
        cancelAnimationFrame(frame);
        chunkUpdateFrames.delete(chunk.id);
    }
    updateChunkCard(chunk);
}

const copyAllFeedback = {
    timer: null,
    originalText: "",
    originalAria: "",
};

export function flashCopyAllButton(message = "Copied.") {
    const button = els.copyAllBtn;
    if (!button) return;
    if (!copyAllFeedback.originalText) {
        copyAllFeedback.originalText = button.textContent;
        copyAllFeedback.originalAria = button.getAttribute("aria-label") || "";
    }
    if (copyAllFeedback.timer) {
        clearTimeout(copyAllFeedback.timer);
    }
    button.textContent = message;
    if (message) button.setAttribute("aria-label", message);
    copyAllFeedback.timer = setTimeout(() => {
        button.textContent = copyAllFeedback.originalText;
        if (copyAllFeedback.originalAria) {
            button.setAttribute("aria-label", copyAllFeedback.originalAria);
        } else {
            button.removeAttribute("aria-label");
        }
    }, 1200);
}
