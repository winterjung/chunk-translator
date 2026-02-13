export const STORAGE_KEY = "chunk-translator-settings";
export const DRAFT_KEY = "chunk-translator-draft-v1";
export const DEFAULT_CONCURRENCY = 2;
export const LOG_HIDE_DELAY = 3000;

export const MODEL_ALIASES = {
    "gemini-3-pro": "gemini-3-pro-preview",
    "gemini-3-flash": "gemini-3-flash-preview",
};

export const WELL_KNOWN_MODEL_PRICING = {
    "gpt-5.2": { input: 1.75, output: 14, cache_read: 0.175 },
    "gpt-5-mini": { input: 0.25, output: 2, cache_read: 0.025 },
    "gpt-5-nano": { input: 0.05, output: 0.4, cache_read: 0.005 },
    "o4-mini": { input: 1.1, output: 4.4, cache_read: 0.28 },
    "claude-opus-4-6": { input: 5, output: 25, cache_read: 0.5 },
    "claude-sonnet-4-5": { input: 3, output: 15, cache_read: 0.3 },
    "claude-haiku-4-5": { input: 1, output: 5, cache_read: 0.1 },
    "gemini-3-pro-preview": { input: 2, output: 12, cache_read: 0.2 },
    "gemini-3-flash-preview": { input: 0.5, output: 3, cache_read: 0.05 },
    "gemini-2.5-flash": { input: 0.3, output: 2.5, cache_read: 0.075 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4, cache_read: 0.025 },
};

export const SYSTEM_TRANSLATION = [
    "You are a translation engine.",
    "Translate the given text into the target language.",
    "Always preserve the original tone and voice with intention.",
    "Preserve Markdown, formatting, and structure.",
    "Preserve code blocks and inline code, but translate human-readable comments.",
].join(" ");

export const SYSTEM_SUMMARY = [
    "You are a summarization engine.",
    "Write the summary for the given text in the target language.",
].join(" ");
