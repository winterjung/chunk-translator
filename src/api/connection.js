import { els } from '../state.js';
import { callModels } from './client.js';
import { getUnsupportedBaseUrlMessage } from './errors.js';
import { setLog } from '../ui/log.js';

export async function testConnection() {
    if (!els.connectionTestBtn || !els.connectionTestLog) return;
    const baseUrl = els.baseUrl.value.trim();
    const apiKey = els.apiKey.value;
    if (!baseUrl) {
        setLog(els.connectionTestLog, "Error: missing Base URL.", "error");
        return;
    }
    if (!apiKey) {
        setLog(els.connectionTestLog, "Error: missing API key.", "error");
        return;
    }
    const unsupportedMessage = getUnsupportedBaseUrlMessage(baseUrl);
    if (unsupportedMessage) {
        setLog(els.connectionTestLog, `Error: ${unsupportedMessage}`, "error");
        return;
    }
    els.connectionTestBtn.disabled = true;
    setLog(els.connectionTestLog, "테스트 중...", "");
    try {
        const data = await callModels({ baseUrl, apiKey });
        const count = data && Array.isArray(data.data) ? data.data.length : 0;
        const message = count ? `OK: ${count}개 모델 응답.` : "OK: 응답 확인됨.";
        setLog(els.connectionTestLog, message, "ok");
    } catch (err) {
        setLog(els.connectionTestLog, `Error: ${err.message}`, "error");
    } finally {
        els.connectionTestBtn.disabled = false;
    }
}
