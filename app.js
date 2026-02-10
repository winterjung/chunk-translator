    const STORAGE_KEY = "chunk-translator-settings";
    const DRAFT_KEY = "chunk-translator-draft-v1";
    const DEFAULT_CONCURRENCY = 2;
    const LOG_HIDE_DELAY = 3000;

    let draftTimer = null;
    const logTimers = new WeakMap();
    const translateLabelTimers = new Map();

    const SYSTEM_TRANSLATION = [
      "You are a translation engine.",
      "The input may be in any language.",
      "Translate into the target language.",
      "Always preserve the original tone and voice.",
      "Preserve Markdown, formatting, and structure.",
      "Do NOT translate code blocks, inline code (``), URLs, file paths, or commands.",
    ].join(" ");

    const SYSTEM_SUMMARY = [
      "You are a summarization engine.",
      "The input may be in any language.",
      "Write the summary in the target language.",
      "Do NOT translate code blocks, inline code (``), URLs, file paths, or commands.",
    ].join(" ");

    const state = {
      summary: { text: "", usage: null },
      chunks: [],
      usageTotals: {
        summary: { prompt: 0, completion: 0, total: 0, has: false },
        translate: { prompt: 0, completion: 0, total: 0, has: false },
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

    const els = {
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
      summaryAgainBtn: document.getElementById("summaryAgainBtn"),
      chunkBtn: document.getElementById("chunkBtn"),
      resetBtn: document.getElementById("resetBtn"),
      translateBtn: document.getElementById("translateBtn"),
      chunkList: document.getElementById("chunkList"),
      chunkCount: document.getElementById("chunkCount"),
      summaryUsage: document.getElementById("summaryUsage"),
      translateUsage: document.getElementById("translateUsage"),
      copyAllBtn: document.getElementById("copyAllBtn"),
      inputLog: document.getElementById("inputLog"),
      summaryLog: document.getElementById("summaryLog"),
      chunkLog: document.getElementById("chunkLog"),
      toast: document.getElementById("toast"),
      concurrencyRange: document.getElementById("concurrencyRange"),
      concurrencyValue: document.getElementById("concurrencyValue"),
    };

    function setLog(el, message, type = "") {
      if (logTimers.has(el)) {
        clearTimeout(logTimers.get(el));
        logTimers.delete(el);
      }

      const hasMessage = Boolean(message && message.trim());
      el.textContent = message;
      if (type) {
        el.dataset.type = type;
      } else {
        delete el.dataset.type;
      }

      if (!hasMessage) {
        el.classList.add("is-hidden");
        return;
      }

      el.classList.remove("is-hidden");
      if (type === "ok") {
        const timer = setTimeout(() => {
          el.textContent = "";
          delete el.dataset.type;
          el.classList.add("is-hidden");
          logTimers.delete(el);
        }, LOG_HIDE_DELAY);
        logTimers.set(el, timer);
      }
    }

    function setSettingsCollapsed(collapsed) {
      if (!els.settingsSection || !els.settingsToggle || !els.settingsBody) return;
      els.settingsSection.classList.toggle("is-collapsed", collapsed);
      els.settingsToggle.setAttribute("aria-expanded", String(!collapsed));
      els.settingsToggle.textContent = collapsed ? "펼치기" : "접기";
    }

    function applyPresetValue(targetId, value) {
      const target = els[targetId];
      if (!target) return;
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.focus();
    }

    function saveSettings() {
      const payload = {
        baseUrl: els.baseUrl.value.trim(),
        apiKey: els.apiKey.value,
        summaryModel: els.summaryModel.value.trim(),
        translateModel: els.translateModel.value.trim(),
        targetLang: els.targetLang.value.trim(),
        concurrency: Number(els.concurrencyRange.value) || DEFAULT_CONCURRENCY,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setLog(els.inputLog, "Saved.", "ok");
    }

    function loadSettings() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
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
        updateConcurrencyUI();
      } catch (err) {
        setLog(els.inputLog, "Error: invalid settings.", "error");
      }
    }

    function clearDraftStorage() {
      try {
        localStorage.removeItem(DRAFT_KEY);
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

    function clearAllInputs() {
      if (draftTimer) {
        clearTimeout(draftTimer);
        draftTimer = null;
      }
      translateLabelTimers.forEach((timer) => clearTimeout(timer));
      translateLabelTimers.clear();
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
      clearDraftStorage();
    }

    function scheduleDraftSave() {
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(saveDraft, 500);
    }

    function normalizeStoredUsage(usage) {
      if (!usage || typeof usage !== "object") return null;
      const prompt = usage.prompt ?? usage.prompt_tokens ?? usage.input_tokens ?? 0;
      const completion = usage.completion ?? usage.completion_tokens ?? usage.output_tokens ?? 0;
      const total = usage.total ?? usage.total_tokens ?? (prompt + completion);
      if (!prompt && !completion && !total) return null;
      return { prompt, completion, total };
    }

    function getTargetLanguage() {
      return els.targetLang.value.trim() || "English";
    }

    function getConcurrency() {
      const value = Number(els.concurrencyRange.value);
      if (!Number.isFinite(value) || value < 1) return DEFAULT_CONCURRENCY;
      return Math.min(8, Math.max(1, Math.floor(value)));
    }

    function updateConcurrencyUI() {
      const value = getConcurrency();
      els.concurrencyValue.textContent = String(value);
    }

    function normalizeUsage(usage) {
      if (!usage || typeof usage !== "object") return null;
      const prompt = usage.prompt_tokens ?? usage.input_tokens ?? 0;
      const completion = usage.completion_tokens ?? usage.output_tokens ?? 0;
      const total = usage.total_tokens ?? (prompt + completion);
      if (!prompt && !completion && !total) return null;
      return { prompt, completion, total };
    }

    function addUsage(bucket, usage) {
      if (!usage) return;
      bucket.has = true;
      bucket.prompt += usage.prompt || 0;
      bucket.completion += usage.completion || 0;
      bucket.total += usage.total || 0;
    }

    function resetUsageTotals() {
      state.usageTotals.summary = { prompt: 0, completion: 0, total: 0, has: false };
      state.usageTotals.translate = { prompt: 0, completion: 0, total: 0, has: false };
    }

    function recomputeUsageTotals() {
      resetUsageTotals();
      if (state.summary.usage) addUsage(state.usageTotals.summary, state.summary.usage);
      state.chunks.forEach((chunk) => {
        if (chunk.usage) addUsage(state.usageTotals.translate, chunk.usage);
      });
    }

    function updateUsageUI() {
      const s = state.usageTotals.summary;
      const t = state.usageTotals.translate;
      els.summaryUsage.textContent = s.has ? `prompt ${s.prompt} / completion ${s.completion} / total ${s.total}` : "N/A";
      els.translateUsage.textContent = t.has ? `prompt ${t.prompt} / completion ${t.completion} / total ${t.total}` : "N/A";
    }

    function sanitizeChunkStatus(status) {
      if (status === "done" || status === "error" || status === "pending") return status;
      return "pending";
    }

    function serializeChunkForDraft(chunk) {
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

    function createChunkFromDraft(raw) {
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

    function saveDraft() {
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
        chunks: state.chunks.map(serializeChunkForDraft),
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      } catch (err) {
        console.warn("Draft save failed.", err);
      }
    }

    function loadDraft() {
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
      recomputeUsageTotals();
    }

    const copyAllFeedback = {
      timer: null,
      originalText: "",
      originalAria: "",
    };

    function flashCopyAllButton(message = "Copied.") {
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

    function splitByLength(text, limit) {
      const parts = [];
      for (let i = 0; i < text.length; i += limit) {
        parts.push(text.slice(i, i + limit));
      }
      return parts;
    }

    function sentenceSegments(text) {
      if (window.Intl && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter("und", { granularity: "sentence" });
        return Array.from(segmenter.segment(text), (part) => part.segment);
      }
      const regex = /[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g;
      return text.match(regex) || [text];
    }

    function mergeSmallChunks(chunks, endsParagraph, minLength) {
      if (!Array.isArray(chunks) || chunks.length === 0) return [];
      if (!Array.isArray(endsParagraph) || endsParagraph.length !== chunks.length) {
        return chunks.slice();
      }
      const merged = [];
      let current = chunks[0];
      let currentLength = current.length;

      for (let i = 1; i < chunks.length; i += 1) {
        const next = chunks[i];
        const candidateLength = currentLength + next.length;
        if (candidateLength < minLength) {
          const joiner = endsParagraph[i - 1] ? "\n\n" : "";
          current += joiner + next;
          currentLength = candidateLength + joiner.length;
          continue;
        }
        merged.push(current);
        current = next;
        currentLength = next.length;
      }

      merged.push(current);
      return merged;
    }

    function splitTrailingHeadingLine(text) {
      const lines = text.split("\n");
      let end = lines.length - 1;
      while (end >= 0 && lines[end].trim() === "") end -= 1;
      if (end < 0) return { body: "", heading: "" };
      const lastLine = lines[end];
      if (!/^#{1,6}\s+/.test(lastLine.trimStart())) return { body: text, heading: "" };
      const bodyLines = lines.slice(0, end);
      while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === "") bodyLines.pop();
      return { body: bodyLines.join("\n"), heading: lastLine.trimEnd() };
    }

    function shiftTrailingHeadings(chunks) {
      if (!Array.isArray(chunks) || chunks.length === 0) return [];
      const output = chunks.slice();
      for (let i = 0; i < output.length - 1; i += 1) {
        const { body, heading } = splitTrailingHeadingLine(output[i]);
        if (!heading) continue;
        output[i] = body;
        const next = output[i + 1].replace(/^\n+/, "");
        output[i + 1] = `${heading}\n\n${next}`;
      }
      return output.filter((chunk) => chunk && chunk.trim());
    }

    function chunkText(raw) {
      const paragraphs = raw.split(/\n\s*\n+/);
      const chunks = [];
      const endsParagraph = [];
      paragraphs.forEach((para) => {
        if (!para || !para.trim()) return;
        const clean = para.replace(/^\n+|\n+$/g, "");
        const paraChunks = [];
        if (clean.length <= 800) {
          paraChunks.push(clean);
        } else {
          const sentences = sentenceSegments(clean);
          let buffer = "";
          sentences.forEach((sentence) => {
            if (sentence.length > 800) {
              if (buffer.length) {
                paraChunks.push(buffer);
                buffer = "";
              }
              paraChunks.push(sentence);
              return;
            }
            if (buffer.length + sentence.length > 800 && buffer.length) {
              paraChunks.push(buffer);
              buffer = sentence;
            } else {
              buffer += sentence;
            }
          });
          if (buffer.length) paraChunks.push(buffer);
        }
        paraChunks.forEach((text, index) => {
          chunks.push(text);
          endsParagraph.push(index === paraChunks.length - 1);
        });
      });
      const merged = mergeSmallChunks(chunks, endsParagraph, 300);
      return shiftTrailingHeadings(merged);
    }

    function createChunk(text) {
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

    function clearTranslateLabelTimer(id) {
      const timer = translateLabelTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        translateLabelTimers.delete(id);
      }
    }

    function shouldShowDetails(chunk) {
      return Boolean(chunk.translatedText && chunk.translatedText.trim());
    }

    function applyTranslateButtonState(chunk, button) {
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

    function renderChunks() {
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

        const details = document.createElement("div");
        details.className = "chunk-details";
        details.dataset.role = "details";
        details.hidden = !shouldShowDetails(chunk);
        details.appendChild(resultLabel);
        details.appendChild(resultArea);
        details.appendChild(extraLabel);
        details.appendChild(extraArea);

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

    function updateChunkCard(chunk) {
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
      const translateBtn = card.querySelector("[data-role='translate-btn']");
      if (translateBtn) {
        applyTranslateButtonState(chunk, translateBtn);
      }
    }

    function applyChunking() {
      const raw = els.sourceInput.value;
      if (!raw.trim()) {
        setLog(els.chunkLog, "Error: invalid input.", "error");
        return;
      }
      const texts = chunkText(raw);
      state.chunks = texts.map((text) => createChunk(text));
      renderChunks();
      scheduleDraftSave();
      setLog(els.chunkLog, `Done. ${texts.length} chunks.`, "ok");
    }

    function mergeChunks(index, direction) {
      if (direction === "up" && index === 0) {
        setLog(els.chunkLog, "Error: top chunk.", "error");
        return;
      }
      if (direction === "down" && index === state.chunks.length - 1) {
        setLog(els.chunkLog, "Error: bottom chunk.", "error");
        return;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      const base = state.chunks[targetIndex];
      const current = state.chunks[index];
      const separator = mergeSeparator(base.sourceText, current.sourceText);
      base.sourceText = `${base.sourceText}${separator}${current.sourceText}`;
      base.translatedText = "";
      base.status = "pending";
      base.error = "";
      base.usage = null;
      state.chunks.splice(index, 1);
      renderChunks();
      scheduleDraftSave();
      setLog(els.chunkLog, "Merged.", "ok");
    }

    function splitChunkAt(index, position) {
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
      scheduleDraftSave();
      setLog(els.chunkLog, "Split.", "ok");
    }

    function mergeSeparator(left, right) {
      const leftHasNewline = /\n$/.test(left);
      const rightHasNewline = /^\n/.test(right);
      if (leftHasNewline || rightHasNewline) return "";
      return "\n\n";
    }

    function getUnsupportedBaseUrlMessage(baseUrl) {
      if (!baseUrl) return "";
      if (/api\.anthropic\.com/i.test(baseUrl)) return "Anthropic not yet supported.";
      return "";
    }

    function extractErrorMessage(payload) {
      if (!payload) return "";
      if (typeof payload === "string") return payload;
      if (Array.isArray(payload)) {
        for (const item of payload) {
          const message = extractErrorMessage(item);
          if (message) return message;
        }
        return "";
      }
      if (payload.message && typeof payload.message === "string") return payload.message;
      if (payload.error) {
        if (typeof payload.error === "string") return payload.error;
        if (payload.error.message && typeof payload.error.message === "string") return payload.error.message;
        if (Array.isArray(payload.error.details)) {
          for (const detail of payload.error.details) {
            if (detail && typeof detail.message === "string") return detail.message;
          }
        }
      }
      return "";
    }

    async function callChatCompletion({ baseUrl, apiKey, model, messages, signal }) {
      const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
      const headers = {
        "Content-Type": "application/json",
      };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model,
          messages,
          temperature: 1.0,
        }),
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        throw new Error(`Invalid JSON (${res.status})`);
      }
      if (!res.ok) {
        const message = extractErrorMessage(data) || res.statusText || "Request failed";
        throw new Error(`${res.status} ${message}`);
      }
      return data;
    }

    async function generateSummary() {
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
      els.summaryAgainBtn.disabled = true;
      setLog(els.summaryLog, "[active] 요약 생성 중...", "");
      try {
        const messages = [
          { role: "system", content: SYSTEM_SUMMARY },
          {
            role: "user",
            content: [
              `Target language: ${target}`,
              "Summarize the following text into exactly 5 bullet points in the target language.",
              "Use '-' as the bullet prefix.",
              "TEXT:",
              "<<<",
              source,
              ">>>",
            ].join("\n"),
          },
        ];
        const data = await callChatCompletion({ baseUrl, apiKey, model, messages });
        const output = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : "";
        if (!output) throw new Error("Empty response");
        els.summaryText.value = output.trim();
        state.summary.text = output.trim();
        const usage = normalizeUsage(data.usage);
        state.summary.usage = usage;
        if (usage) addUsage(state.usageTotals.summary, usage);
        updateUsageUI();
        scheduleDraftSave();
        setLog(els.summaryLog, "Done.", "ok");
      } catch (err) {
        setLog(els.summaryLog, `Error: ${err.message}`, "error");
      } finally {
        els.summaryBtn.disabled = false;
        els.summaryAgainBtn.disabled = false;
      }
    }

    function enqueueChunk(id) {
      if (state.queue.cancelRequested) return;
      if (state.queue.queued.has(id) || state.queue.inFlight.has(id)) return;
      state.queue.queued.add(id);
      state.queue.list.push(id);
      processQueue();
    }

    function processQueue() {
      if (state.queue.cancelRequested) return;
      const limit = getConcurrency();
      while (state.queue.active < limit && state.queue.list.length) {
        const id = state.queue.list.shift();
        state.queue.queued.delete(id);
        translateChunk(id);
      }
    }

    async function translateChunk(id) {
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
        const contentParts = [
          `Target language: ${target}`,
          "Preserve the original tone.",
          `Chunk extra instruction: ${extra || "(none)"}`,
        ];
        if (previous) {
          contentParts.push(
            "Previous translation (use as a draft to improve, if any):",
            "<<<PREVIOUS>>>",
            previous,
            "<<<END PREVIOUS>>>",
          );
        }
        contentParts.push(
          "Summary (context only, do NOT copy into output):",
          "<<<SUMMARY>>>",
          summaryText || "(empty)",
          "<<<END SUMMARY>>>",
          "Chunk to translate:",
          "<<<CHUNK>>>",
          chunk.sourceText,
          "<<<END CHUNK>>>",
          "Translate only the chunk. Do not include the summary in the output.",
        );
        const messages = [
          { role: "system", content: SYSTEM_TRANSLATION },
          {
            role: "user",
            content: contentParts.join("\n"),
          },
        ];
        const data = await callChatCompletion({ baseUrl, apiKey, model, messages, signal: controller.signal });
        const output = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : "";
        if (!output) throw new Error("Empty response");
        chunk.translatedText = output.trimEnd();
        chunk.status = "done";
        const usage = normalizeUsage(data.usage);
        chunk.usage = usage;
        if (usage) addUsage(state.usageTotals.translate, usage);
        updateUsageUI();
      } catch (err) {
        chunk.status = "error";
        chunk.error = err && err.name === "AbortError" ? "Canceled." : err.message;
      } finally {
        updateChunkCard(chunk);
        scheduleDraftSave();
        if (state.queue.active > 0) state.queue.active -= 1;
        state.queue.inFlight.delete(id);
        state.queue.controllers.delete(id);
        processQueue();
        if (state.queue.running && state.queue.active === 0 && state.queue.list.length === 0) {
          state.queue.running = false;
          updateTranslateButton();
          setLog(els.chunkLog, "Done.", "ok");
        }
      }
    }

    function startTranslateAll() {
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

    function updateTranslateButton() {
      if (state.queue.running) {
        els.translateBtn.textContent = "■ 중지";
        els.translateBtn.setAttribute("aria-label", "번역 중지");
      } else {
        els.translateBtn.textContent = "+ 전체 번역 시작";
        els.translateBtn.setAttribute("aria-label", "전체 번역 시작");
      }
    }

    function stopAllTranslations() {
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
      scheduleDraftSave();
    }

    function toggleTranslateAll() {
      if (state.queue.running) {
        stopAllTranslations();
      } else {
        startTranslateAll();
      }
    }

    async function copyAllTranslations() {
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
      ];
      saveInputs.forEach((el) => {
        el.addEventListener("change", saveSettings);
        el.addEventListener("input", () => {
          scheduleSave();
          setLog(els.inputLog, "Saved.", "ok");
        });
      });

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

      els.chunkBtn.addEventListener("click", applyChunking);
      if (els.resetBtn) {
        els.resetBtn.addEventListener("click", clearAllInputs);
      }
      els.summaryBtn.addEventListener("click", generateSummary);
      els.summaryAgainBtn.addEventListener("click", generateSummary);
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
          updateChunkCard(chunk);
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
          return;
        }
        if (target.dataset.action === "merge-down") {
          mergeChunks(index, "down");
          return;
        }
        if (target.dataset.action === "split") {
          const textarea = els.chunkList.querySelector(`textarea[data-role='chunk-source'][data-id='${id}']`);
          const cursor = textarea ? textarea.selectionStart : 0;
          splitChunkAt(index, cursor);
          return;
        }
        if (target.dataset.action === "translate") {
          const chunk = state.chunks[index];
          if (!chunk) return;
          state.queue.cancelRequested = false;
          chunk.status = "pending";
          chunk.error = "";
          enqueueChunk(id);
          updateChunkCard(chunk);
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

    loadSettings();
    loadDraft();
    updateConcurrencyUI();
    updateUsageUI();
    updateTranslateButton();
    initEvents();
  
