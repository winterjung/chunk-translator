export function splitByLength(text, limit) {
    const parts = [];
    for (let i = 0; i < text.length; i += limit) {
        parts.push(text.slice(i, i + limit));
    }
    return parts;
}

export function sentenceSegments(text) {
    if (window.Intl && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter("und", { granularity: "sentence" });
        return Array.from(segmenter.segment(text), (part) => part.segment);
    }
    const regex = /[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g;
    return text.match(regex) || [text];
}

export function mergeSmallChunks(chunks, endsParagraph, minLength) {
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

export function splitTrailingHeadingLine(text) {
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

export function shiftTrailingHeadings(chunks) {
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

export function chunkText(raw) {
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
