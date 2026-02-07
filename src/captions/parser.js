const parseTimecode = (value) => {
  if (!value || typeof value !== "string") {
    return 0;
  }

  const normalized = value.trim();
  const parts = normalized.split(":");
  if (parts.length < 2) {
    const seconds = Number.parseFloat(normalized);
    return Number.isFinite(seconds) ? seconds : 0;
  }

  const secondsPart = Number.parseFloat(parts.pop());
  const minutesPart = Number.parseInt(parts.pop(), 10);
  const hoursPart = parts.length > 0 ? Number.parseInt(parts.pop(), 10) : 0;

  if (!Number.isFinite(secondsPart) || !Number.isFinite(minutesPart) || !Number.isFinite(hoursPart)) {
    return 0;
  }

  return hoursPart * 3600 + minutesPart * 60 + secondsPart;
};

const DEFAULT_CUE_DURATION_SECONDS = 2;
const RATE_LIMIT_STATUS = 429;

const getXmlAttr = (attrs, name) => {
  if (!attrs || !name) {
    return "";
  }

  const pattern = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`);
  const match = attrs.match(pattern);
  if (!match) {
    return "";
  }
  if (typeof match[1] === "string") {
    return match[1];
  }
  if (typeof match[2] === "string") {
    return match[2];
  }
  return "";
};

const parseVtt = (text) => {
  if (!text || typeof text !== "string") {
    return [];
  }

  const lines = text.replace(/\r/g, "").split("\n");
  const cues = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i].trim();
    i += 1;

    if (!rawLine || rawLine === "WEBVTT") {
      continue;
    }

    let timingLine = rawLine;
    if (!timingLine.includes("-->") && i < lines.length && lines[i].includes("-->")) {
      timingLine = lines[i].trim();
      i += 1;
    }

    if (!timingLine.includes("-->")) {
      continue;
    }

    const [startRaw, endRaw] = timingLine
      .split("-->")
      .map((item) => item.trim().split(" ")[0]);
    const start = parseTimecode(startRaw);
    const end = parseTimecode(endRaw);

    let cueText = "";
    while (i < lines.length && lines[i].trim()) {
      cueText = cueText ? `${cueText}\n${lines[i]}` : lines[i];
      i += 1;
    }

    if (cueText) {
      cues.push({ start, end, text: cueText });
    }
  }

  return cues;
};

const decodeEntities = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
};

const stripXmlTags = (value) => value.replace(/<[^>]+>/g, "");

const normalizeCueText = (raw) => {
  if (!raw || typeof raw !== "string") {
    return "";
  }

  const decoded = decodeEntities(raw);
  const withBreaks = decoded.replace(/<br\s*\/?\s*>/gi, "\n");
  const cleaned = stripXmlTags(withBreaks);
  return cleaned.replace(/\r/g, "").trim();
};

const parseLegacyXml = (text) => {
  if (!text || typeof text !== "string") {
    return [];
  }

  const cues = [];
  const regex = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let match = null;

  while ((match = regex.exec(text))) {
    const attrs = match[1] || "";
    const start = parseTimecode(getXmlAttr(attrs, "start"));
    const duration = Number.parseFloat(getXmlAttr(attrs, "dur"));
    const end =
      Number.isFinite(duration) && duration > 0
        ? start + duration
        : start + DEFAULT_CUE_DURATION_SECONDS;
    const cleaned = normalizeCueText(match[2] || "");

    if (cleaned) {
      cues.push({ start, end, text: cleaned });
    }
  }

  return cues;
};

const parseSrv3Xml = (text) => {
  if (!text || typeof text !== "string") {
    return [];
  }

  const cues = [];
  const regex = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let match = null;

  while ((match = regex.exec(text))) {
    const attrs = match[1] || "";
    const startMs = Number.parseFloat(getXmlAttr(attrs, "t"));
    const durationMs = Number.parseFloat(getXmlAttr(attrs, "d"));
    if (!Number.isFinite(startMs)) {
      continue;
    }

    const start = startMs / 1000;
    const end =
      Number.isFinite(durationMs) && durationMs > 0
        ? start + durationMs / 1000
        : start + DEFAULT_CUE_DURATION_SECONDS;
    const cleaned = normalizeCueText(match[2] || "");
    if (cleaned) {
      cues.push({ start, end, text: cleaned });
    }
  }

  return cues;
};

const parseXml = (text) => {
  const legacyCues = parseLegacyXml(text);
  const srv3Cues = parseSrv3Xml(text);
  const cues = [...legacyCues, ...srv3Cues];

  if (cues.length <= 1) {
    return cues;
  }

  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
};

const parseJson3 = (text) => {
  if (!text || typeof text !== "string") {
    return [];
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return [];
  }

  const events = Array.isArray(parsed && parsed.events) ? parsed.events : [];
  const cues = [];

  for (const event of events) {
    const startMs = Number(event && event.tStartMs);
    if (!Number.isFinite(startMs)) {
      continue;
    }

    const durationMs = Number(event && event.dDurationMs);
    const start = startMs / 1000;
    const end = Number.isFinite(durationMs) ? start + durationMs / 1000 : start;

    const segs = Array.isArray(event && event.segs) ? event.segs : [];
    const rawText = segs
      .map((segment) => (segment && typeof segment.utf8 === "string" ? segment.utf8 : ""))
      .join("");
    const cleaned = normalizeCueText(rawText);

    if (cleaned) {
      cues.push({ start, end, text: cleaned });
    }
  }

  return cues;
};

const parseCaptionText = (text) => {
  if (!text || typeof text !== "string") {
    return [];
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJson3(trimmed);
  }

  if (trimmed.startsWith("<")) {
    return parseXml(trimmed);
  }

  return parseVtt(trimmed);
};

const fetchCaption = async (url) => {
  if (!url) {
    throw new Error("Caption URL is required");
  }

  const appendOrReplaceFmt = (rawUrl, fmt) => {
    if (!rawUrl || typeof rawUrl !== "string") {
      return rawUrl;
    }

    if (/[?&]fmt=/.test(rawUrl)) {
      return rawUrl.replace(/([?&])fmt=[^&]*/g, `$1fmt=${fmt}`);
    }

    const separator = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${separator}fmt=${fmt}`;
  };

  const requestUrls = [url];
  for (const fmt of ["json3", "srv3", "vtt"]) {
    const next = appendOrReplaceFmt(url, fmt);
    if (!requestUrls.includes(next)) {
      requestUrls.push(next);
    }
  }

  let lastStatus = null;
  let lastTriedUrl = "";
  for (const requestUrl of requestUrls) {
    const response = await fetch(requestUrl, {
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) {
      lastStatus = response.status;
      lastTriedUrl = requestUrl;
      if (response.status === RATE_LIMIT_STATUS) {
        break;
      }
      continue;
    }

    const text = await response.text();
    const cues = parseCaptionText(text);
    if (cues.length > 0) {
      return cues;
    }
  }

  if (lastStatus !== null) {
    const error = new Error(`Failed to load captions: ${lastStatus}`);
    error.status = lastStatus;
    error.sourceUrl = url;
    error.lastTriedUrl = lastTriedUrl;
    throw error;
  }

  return [];
};

export { fetchCaption, parseCaptionText, parseVtt, parseXml, parseJson3 };
