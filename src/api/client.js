import { extractErrorMessage } from './errors.js';
import { normalizeUsage } from '../utils.js';

export async function callModels({ baseUrl, apiKey, signal }) {
    const url = `${baseUrl.replace(/\/$/, "")}/models`;
    const headers = {
        "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(url, {
        method: "GET",
        headers,
        signal,
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

export async function callChatCompletion({ baseUrl, apiKey, model, messages, signal }) {
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

export async function callChatCompletionStream({ baseUrl, apiKey, model, messages, signal, onDelta, onUsage }) {
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
            stream: true,
            stream_options: { include_usage: true },
        }),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (err) {
            throw new Error(`Invalid JSON (${res.status})`);
        }
        const message = extractErrorMessage(data) || res.statusText || "Request failed";
        throw new Error(`${res.status} ${message}`);
    }

    if (!res.body || !contentType.includes("text/event-stream")) {
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch (err) {
            throw new Error("Invalid JSON");
        }
        const output = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : "";
        if (output && typeof onDelta === "function") {
            onDelta(output);
        }
        const usage = normalizeUsage(data && data.usage ? data.usage : null);
        if (usage && typeof onUsage === "function") {
            onUsage(usage);
        }
        return { text: output || "", usage };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let eventLines = [];
    let result = "";
    let usage = null;
    let isDone = false;

    const flushEvent = (dataString) => {
        if (!dataString) return;
        if (dataString === "[DONE]") {
            isDone = true;
            return;
        }
        let payload = null;
        try {
            payload = JSON.parse(dataString);
        } catch (err) {
            return;
        }
        const nextUsage = normalizeUsage(payload && payload.usage ? payload.usage : null);
        if (nextUsage) {
            usage = nextUsage;
            if (typeof onUsage === "function") onUsage(nextUsage);
        }
        if (!payload || !Array.isArray(payload.choices)) return;
        payload.choices.forEach((choice) => {
            if (!choice || !choice.delta) return;
            const deltaText = typeof choice.delta.content === "string" ? choice.delta.content : "";
            if (!deltaText) return;
            result += deltaText;
            if (typeof onDelta === "function") onDelta(deltaText, result);
        });
    };

    while (!isDone) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
            if (line === "") {
                if (eventLines.length) {
                    const dataString = eventLines.join("\n");
                    eventLines = [];
                    flushEvent(dataString);
                    if (isDone) break;
                }
                continue;
            }
            if (line.startsWith("data:")) {
                eventLines.push(line.replace(/^data:\s?/, ""));
            }
        }
    }

    if (eventLines.length) {
        flushEvent(eventLines.join("\n"));
    }

    return { text: result, usage };
}
