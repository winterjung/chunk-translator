import { els, logTimers } from '../state.js';
import { LOG_HIDE_DELAY } from '../constants.js';

export function setLog(el, message, type = "") {
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

export function setSettingsCollapsed(collapsed) {
    if (!els.settingsSection || !els.settingsToggle || !els.settingsBody) return;
    els.settingsSection.classList.toggle("is-collapsed", collapsed);
    els.settingsToggle.setAttribute("aria-expanded", String(!collapsed));
    els.settingsToggle.textContent = collapsed ? "펼치기" : "접기";
}

export function applyPresetValue(targetId, value) {
    const target = els[targetId];
    if (!target) return;
    target.value = value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.focus();
}
