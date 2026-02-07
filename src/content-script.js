(() => {
  "use strict";

  const STATE = {
    initialized: false,
    startPromise: null,
    cleanup: null,
    modules: null,
    playerResponse: null,
    tracks: [],
    cues: {
      primary: [],
      secondary: []
    },
    cueIndex: {
      primary: 0,
      secondary: 0
    },
    settings: null,
    rafId: 0,
    debugText: {
      primary: "",
      secondary: "",
      translationSource: ""
    },
    liveCaptionText: "",
    captionObserver: null,
    captionRetryTimer: 0,
    captionRetryDelayMs: 15000,
    initRetryTimer: 0,
    initWatchdogTimer: 0,
    lastInitAttemptAt: 0,
    videoId: "",
    aiCache: new Map(),
    aiCacheSource: new Map(),
    aiDbLookup: new Map(),
    aiPending: new Map(),
    aiQueue: null,
    aiQueueTimer: 0,
    aiInFlight: false,
    aiLastRequestAt: 0,
    pocketBaseErrorCache: new Set(),
    timedCaptions: [],
    activeTimedCaption: null,
    lastTimedCaptionTime: Number.NaN,
    dynamicBottomOffsetPx: Number.NaN
  };

  const isWatchPage = () => window.location.pathname === "/watch";
  const getCurrentVideoId = () => {
    try {
      return new URLSearchParams(window.location.search).get("v") || "";
    } catch (error) {
      return "";
    }
  };

  const onReady = (callback) => {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      callback();
      return;
    }
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  };

  const STORAGE_KEY = "dualsub_settings";
  const RATE_LIMIT_STATUS = 429;
  const INIT_DEBOUNCE_MS = 1500;
  const INIT_RETRY_DELAY_MS = 3000;
  const INIT_WATCHDOG_INTERVAL_MS = 4000;
  const BASE_CAPTION_RETRY_DELAY_MS = 15000;
  const MAX_CAPTION_RETRY_DELAY_MS = 120000;
  const AI_QUEUE_DELAY_MS = 550;
  const AI_MIN_REQUEST_GAP_MS = 1200;
  const AI_DB_NAME = "dualsub_cache";
  const AI_DB_VERSION = 1;
  const AI_DB_STORE = "translations";
  const AI_DB_MAX_RECORDS = 2000;
  const AI_DB_PRUNE_TARGET_RECORDS = 1800;
  const CONTROL_BAR_CLEARANCE_PX = 8;
  const CONTROL_BAR_MIN_OPACITY = 0.05;
  const TIMED_CAPTION_MAX_ENTRIES = 5000;
  const TIMED_CAPTION_MIN_DURATION_SECONDS = 0.08;
  const TIMED_CAPTION_SEEK_GAP_SECONDS = 2.5;
  const DEFAULT_SETTINGS = Object.freeze({
    primaryLang: "en",
    secondaryLang: "zh-Hant",
    subtitleDisplayMode: "both",
    topOffsetPx: 72,
    bottomOffsetPx: 72,
    translationProvider: "youtube",
    aiModel: "gemini-2.0-flash",
    aiApiKey: "",
    aiSourceLang: "en",
    aiTargetLang: "zh-Hant",
    aiMinChars: 12,
    pocketBaseUrl: "",
    pocketBaseCollection: "translations",
    pocketBaseTimedCollection: "timed_captions",
    pocketBaseToken: "",
    pocketBaseUserId: "",
    fontSize: 24,
    lineSpacing: 1.1,
    subtitleTextColor: "#ffffff",
    subtitleBackgroundColor: "#000000",
    subtitleBackgroundOpacity: 0.35,
    subtitleFontWeight: 600,
    subtitleBorderRadiusPx: 4,
    position: "bottom",
    opacity: 0.9
  });

  const HEX_COLOR_REGEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

  const normalizeHexColor = (value) => {
    if (typeof value !== "string") {
      return "";
    }

    const trimmed = value.trim();
    if (!HEX_COLOR_REGEX.test(trimmed)) {
      return "";
    }

    if (trimmed.length === 4) {
      const [, r, g, b] = trimmed;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }

    return trimmed.toLowerCase();
  };

  const sanitizeSettings = (input) => {
    const safe = {
      ...DEFAULT_SETTINGS
    };

    if (!input || typeof input !== "object") {
      return safe;
    }

    if (typeof input.fontSize === "number" && input.fontSize >= 12 && input.fontSize <= 64) {
      safe.fontSize = input.fontSize;
    }

    if (typeof input.lineSpacing === "number" && input.lineSpacing >= 1 && input.lineSpacing <= 2) {
      safe.lineSpacing = input.lineSpacing;
    }

    const subtitleTextColor = normalizeHexColor(input.subtitleTextColor);
    if (subtitleTextColor) {
      safe.subtitleTextColor = subtitleTextColor;
    }

    const subtitleBackgroundColor = normalizeHexColor(input.subtitleBackgroundColor);
    if (subtitleBackgroundColor) {
      safe.subtitleBackgroundColor = subtitleBackgroundColor;
    }

    if (typeof input.subtitleBackgroundOpacity === "number" && input.subtitleBackgroundOpacity >= 0 && input.subtitleBackgroundOpacity <= 1) {
      safe.subtitleBackgroundOpacity = input.subtitleBackgroundOpacity;
    }

    if (typeof input.subtitleFontWeight === "number" && input.subtitleFontWeight >= 300 && input.subtitleFontWeight <= 900) {
      safe.subtitleFontWeight = Math.round(input.subtitleFontWeight);
    }

    if (typeof input.subtitleBorderRadiusPx === "number" && input.subtitleBorderRadiusPx >= 0 && input.subtitleBorderRadiusPx <= 24) {
      safe.subtitleBorderRadiusPx = Math.round(input.subtitleBorderRadiusPx);
    }

    if (typeof input.opacity === "number" && input.opacity >= 0.2 && input.opacity <= 1) {
      safe.opacity = input.opacity;
    }

    if (input.position === "top" || input.position === "bottom") {
      safe.position = input.position;
    }

    if (typeof input.primaryLang === "string" && input.primaryLang.trim()) {
      safe.primaryLang = input.primaryLang.trim();
    }

    if (typeof input.secondaryLang === "string" && input.secondaryLang.trim()) {
      safe.secondaryLang = input.secondaryLang.trim();
    }

    if (input.subtitleDisplayMode === "both" || input.subtitleDisplayMode === "translated-only") {
      safe.subtitleDisplayMode = input.subtitleDisplayMode;
    }

    if (typeof input.topOffsetPx === "number" && input.topOffsetPx >= 0 && input.topOffsetPx <= 600) {
      safe.topOffsetPx = Math.round(input.topOffsetPx);
    }

    if (typeof input.bottomOffsetPx === "number" && input.bottomOffsetPx >= 0 && input.bottomOffsetPx <= 600) {
      safe.bottomOffsetPx = Math.round(input.bottomOffsetPx);
    }

    if (input.translationProvider === "youtube" || input.translationProvider === "gemini") {
      safe.translationProvider = input.translationProvider;
    }

    if (typeof input.aiModel === "string" && input.aiModel.trim()) {
      safe.aiModel = input.aiModel.trim();
    }

    if (typeof input.aiApiKey === "string") {
      safe.aiApiKey = input.aiApiKey.trim();
    }

    if (typeof input.aiSourceLang === "string" && input.aiSourceLang.trim()) {
      safe.aiSourceLang = input.aiSourceLang.trim();
    }

    if (typeof input.aiTargetLang === "string" && input.aiTargetLang.trim()) {
      safe.aiTargetLang = input.aiTargetLang.trim();
    }

    if (typeof input.aiMinChars === "number" && input.aiMinChars >= 1 && input.aiMinChars <= 200) {
      safe.aiMinChars = Math.round(input.aiMinChars);
    }

    if (typeof input.pocketBaseUrl === "string") {
      safe.pocketBaseUrl = input.pocketBaseUrl.trim().replace(/\/+$/, "");
    }

    if (typeof input.pocketBaseCollection === "string" && input.pocketBaseCollection.trim()) {
      safe.pocketBaseCollection = input.pocketBaseCollection.trim();
    }

    if (typeof input.pocketBaseTimedCollection === "string" && input.pocketBaseTimedCollection.trim()) {
      safe.pocketBaseTimedCollection = input.pocketBaseTimedCollection.trim();
    }

    if (typeof input.pocketBaseToken === "string") {
      safe.pocketBaseToken = input.pocketBaseToken.trim();
    }

    if (typeof input.pocketBaseUserId === "string") {
      safe.pocketBaseUserId = input.pocketBaseUserId.trim();
    }

    return safe;
  };

  const loadSettings = async () => {
    if (!globalThis.browser || !browser.storage || !browser.storage.local) {
      return sanitizeSettings(DEFAULT_SETTINGS);
    }

    const result = await browser.storage.local.get(STORAGE_KEY);
    return sanitizeSettings(result ? result[STORAGE_KEY] : null);
  };

  const LANGUAGE_GROUPS = Object.freeze({
    ENGLISH: "en",
    ZH_HANT: "zh-hant",
    ZH_HANS: "zh-hans"
  });

  const TRADITIONAL_CODES = new Set(["zh-hant", "zh-tw", "zh-hk", "zh-mo", "zh-cht"]);
  const SIMPLIFIED_CODES = new Set(["zh-hans", "zh-cn", "zh-sg", "zh-chs"]);

  const normalizeLanguageCode = (code) => {
    if (!code || typeof code !== "string") {
      return "";
    }
    return code.trim().toLowerCase().replace(/_/g, "-");
  };

  const toLanguageGroup = (code) => {
    const normalized = normalizeLanguageCode(code);
    if (!normalized) {
      return "";
    }

    if (normalized === LANGUAGE_GROUPS.ENGLISH || normalized.startsWith("en-")) {
      return LANGUAGE_GROUPS.ENGLISH;
    }

    if (TRADITIONAL_CODES.has(normalized)) {
      return LANGUAGE_GROUPS.ZH_HANT;
    }

    if (SIMPLIFIED_CODES.has(normalized)) {
      return LANGUAGE_GROUPS.ZH_HANS;
    }

    const base = normalized.split("-")[0];
    if (base === "zh") {
      return "zh";
    }

    return normalized;
  };

  const getTrackLanguageCode = (track) => {
    if (!track || typeof track !== "object") {
      return "";
    }
    return track.languageCode || track.vssId || "";
  };

  const isAutoGenerated = (track) => track && track.kind === "asr";

  const normalizeTrack = (track) => {
    if (!track || typeof track !== "object") {
      return null;
    }

    const rawCode = getTrackLanguageCode(track);
    const languageCode = normalizeLanguageCode(rawCode);

    return Object.freeze({
      languageCode,
      languageGroup: toLanguageGroup(languageCode),
      name: track.name && track.name.simpleText ? track.name.simpleText : "",
      kind: track.kind || "",
      isAuto: isAutoGenerated(track),
      baseUrl: track.baseUrl || "",
      vssId: track.vssId || "",
      isTranslatable: track.isTranslatable !== false
    });
  };

  const getAvailableTracks = (playerResponse) => {
    if (!playerResponse || typeof playerResponse !== "object") {
      return [];
    }

    const tracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    if (!Array.isArray(tracks)) {
      return [];
    }

    return tracks
      .map(normalizeTrack)
      .filter((track) => track && track.languageCode);
  };

  const matchesLanguage = (track, targetLanguage) => {
    const targetGroup = toLanguageGroup(targetLanguage);
    if (!targetGroup) {
      return false;
    }

    if (track.languageGroup === targetGroup) {
      return true;
    }

    if (targetGroup === LANGUAGE_GROUPS.ZH_HANT) {
      return track.languageGroup === "zh" && TRADITIONAL_CODES.has(track.languageCode);
    }

    if (targetGroup === LANGUAGE_GROUPS.ZH_HANS) {
      return track.languageGroup === "zh" && SIMPLIFIED_CODES.has(track.languageCode);
    }

    return false;
  };

  const pickTrack = (tracks, targetLanguage, preferAuto) => {
    const candidates = tracks.filter((track) => matchesLanguage(track, targetLanguage));
    if (candidates.length === 0) {
      return null;
    }

    const autoCandidates = candidates.filter((track) => track.isAuto);
    if (preferAuto && autoCandidates.length > 0) {
      return autoCandidates[0];
    }

    return candidates[0];
  };

  const toTlangCode = (language) => {
    if (!language || typeof language !== "string") {
      return "";
    }

    const trimmed = language.trim();
    if (!trimmed) {
      return "";
    }

    const normalized = normalizeLanguageCode(trimmed);
    if (!normalized) {
      return "";
    }

    if (normalized === "zh-hant" || normalized === "zh-tw" || normalized === "zh-hk") {
      return "zh-Hant";
    }

    if (normalized === "zh-hans" || normalized === "zh-cn" || normalized === "zh-sg") {
      return "zh-Hans";
    }

    return normalized;
  };

  const isTranslatable = (track) => track && track.isTranslatable !== false;

  const buildTranslatedTrack = (track, targetLanguage) => {
    if (!track || !track.baseUrl || !isTranslatable(track)) {
      return null;
    }

    const target = toTlangCode(targetLanguage);
    if (!target) {
      return null;
    }

    const url = new URL(track.baseUrl);
    url.searchParams.set("tlang", target);

    return Object.freeze({
      ...track,
      languageCode: target,
      languageGroup: toLanguageGroup(target),
      baseUrl: url.toString()
    });
  };

  const selectDualTracks = (tracks, settings) => {
    const safeTracks = Array.isArray(tracks) ? tracks : [];
    const primaryLang = settings && settings.primaryLang ? settings.primaryLang : "en";
    const secondaryLang = settings && settings.secondaryLang ? settings.secondaryLang : "zh-Hant";

    const primary = pickTrack(safeTracks, primaryLang, true);
    let secondary = pickTrack(safeTracks, secondaryLang, true);

    if (!secondary && primary && isTranslatable(primary)) {
      secondary = buildTranslatedTrack(primary, secondaryLang);
    }

    const reason = {
      primary: primary ? "selected" : "missing",
      secondary: secondary ? "selected" : "missing"
    };

    return { primary, secondary, reason };
  };

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
    let lastPreview = "";
    const attempts = [];
    for (const requestUrl of requestUrls) {
      const response = await fetch(requestUrl, {
        credentials: "include",
        cache: "no-store"
      });
      attempts.push({ url: requestUrl, status: response.status, length: -1 });
      if (!response.ok) {
        lastStatus = response.status;
        lastTriedUrl = requestUrl;
        // Do not continue hammering variants when already rate-limited.
        if (response.status === RATE_LIMIT_STATUS) {
          break;
        }
        continue;
      }

      const text = await response.text();
      attempts[attempts.length - 1].length = text.length;
      const cues = parseCaptionText(text);
      if (cues.length > 0) {
        return cues;
      }

      lastTriedUrl = requestUrl;
      lastPreview = text
        .slice(0, 180)
        .replace(/\s+/g, " ")
        .trim();
    }

    if (lastStatus !== null) {
      const error = new Error(`Failed to load captions: ${lastStatus}`);
      error.status = lastStatus;
      error.sourceUrl = url;
      error.lastTriedUrl = lastTriedUrl;
      error.attempts = attempts;
      throw error;
    }

    if (lastTriedUrl) {
      console.warn("DualSub: no cues parsed after trying caption formats", {
        sourceUrl: url,
        lastTriedUrl,
        preview: lastPreview,
        attempts
      });
    }

    return [];
  };

  const isAiTranslationEnabled = (settings) =>
    settings &&
    settings.translationProvider === "gemini" &&
    typeof settings.aiApiKey === "string" &&
    Boolean(settings.aiApiKey.trim()) &&
    typeof settings.aiModel === "string" &&
    Boolean(settings.aiModel.trim());

  const normalizeAiSourceText = (text) => {
    if (!text || typeof text !== "string") {
      return "";
    }
    return text
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  };

  const getEffectiveAiSourceLanguage = (settings) => {
    const aiSourceLang = normalizeLanguageCode(settings?.aiSourceLang || "");
    if (aiSourceLang && aiSourceLang !== "auto") {
      return aiSourceLang;
    }
    return normalizeLanguageCode(settings?.primaryLang || "");
  };

  const inferLanguageFromText = (text) => {
    if (!text || typeof text !== "string") {
      return "";
    }

    const han = (text.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || []).length;
    const hiragana = (text.match(/[\u3040-\u309F]/g) || []).length;
    const katakana = (text.match(/[\u30A0-\u30FF]/g) || []).length;
    const hangul = (text.match(/[\uAC00-\uD7AF]/g) || []).length;

    if (hangul > 0 && hangul >= han + hiragana + katakana) {
      return "ko";
    }
    if (hiragana + katakana > 0) {
      return "ja";
    }
    if (han > 0) {
      return "zh";
    }

    return "";
  };

  const areEquivalentTranslationLanguages = (sourceLang, targetLang) => {
    const sourceNormalized = normalizeLanguageCode(sourceLang);
    const targetNormalized = normalizeLanguageCode(targetLang);
    if (!sourceNormalized || !targetNormalized) {
      return false;
    }
    if (sourceNormalized === targetNormalized) {
      return true;
    }

    const sourceGroup = toLanguageGroup(sourceNormalized);
    const targetGroup = toLanguageGroup(targetNormalized);
    if (!sourceGroup || !targetGroup) {
      return false;
    }

    if (sourceGroup === "zh" || targetGroup === "zh") {
      return false;
    }

    return sourceGroup === targetGroup;
  };

  const shouldSkipAiTranslation = (sourceText, settings) => {
    if (!settings) {
      return false;
    }

    const targetLang = normalizeLanguageCode(settings.aiTargetLang || settings.secondaryLang || "");
    if (!targetLang) {
      return false;
    }

    const effectiveSourceLang = getEffectiveAiSourceLanguage(settings);
    if (areEquivalentTranslationLanguages(effectiveSourceLang, targetLang)) {
      return true;
    }

    const aiSourceLang = normalizeLanguageCode(settings.aiSourceLang || "");
    if (aiSourceLang === "auto") {
      const inferredSourceLang = inferLanguageFromText(sourceText);
      if (areEquivalentTranslationLanguages(inferredSourceLang, targetLang)) {
        return true;
      }
    }

    return false;
  };

  let aiDbPromise = null;
  const openAiDb = () => {
    if (aiDbPromise) {
      return aiDbPromise;
    }

    if (!globalThis.indexedDB || !globalThis.Promise) {
      aiDbPromise = Promise.resolve(null);
      return aiDbPromise;
    }

    aiDbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(AI_DB_NAME, AI_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(AI_DB_STORE)) {
            const store = db.createObjectStore(AI_DB_STORE, { keyPath: "key" });
            store.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch (error) {
        resolve(null);
      }
    });

    return aiDbPromise;
  };

  const loadAiTranslationFromDb = async (cacheKey) => {
    const db = await openAiDb();
    if (!db || !cacheKey) {
      return "";
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(AI_DB_STORE, "readonly");
        const store = tx.objectStore(AI_DB_STORE);
        const request = store.get(cacheKey);
        request.onsuccess = () => {
          const value = request.result && typeof request.result.translation === "string"
            ? request.result.translation
            : "";
          resolve(value);
        };
        request.onerror = () => resolve("");
      } catch (error) {
        resolve("");
      }
    });
  };

  const saveAiTranslationToDb = async (cacheKey, sourceText, translation, settings, videoId) => {
    const db = await openAiDb();
    if (!db || !cacheKey || !translation) {
      return;
    }

    const now = Date.now();
    const record = {
      key: cacheKey,
      videoId: videoId || "",
      model: settings?.aiModel || "",
      sourceLang: settings?.aiSourceLang || settings?.primaryLang || "",
      targetLang: settings?.aiTargetLang || settings?.secondaryLang || "",
      sourceText,
      translation,
      createdAt: now,
      updatedAt: now
    };

    const countAiRecords = async () =>
      new Promise((resolve) => {
        try {
          const tx = db.transaction(AI_DB_STORE, "readonly");
          const request = tx.objectStore(AI_DB_STORE).count();
          request.onsuccess = () => resolve(Number(request.result) || 0);
          request.onerror = () => resolve(0);
        } catch (error) {
          resolve(0);
        }
      });

    const deleteOldestAiRecords = async (deleteCount) =>
      new Promise((resolve) => {
        if (!Number.isFinite(deleteCount) || deleteCount <= 0) {
          resolve(0);
          return;
        }

        try {
          let deleted = 0;
          let settled = false;
          const tx = db.transaction(AI_DB_STORE, "readwrite");
          const store = tx.objectStore(AI_DB_STORE);
          const index = store.index("updatedAt");
          const request = index.openCursor(null, "next");

          const done = () => {
            if (settled) {
              return;
            }
            settled = true;
            resolve(deleted);
          };

          request.onsuccess = (event) => {
            const cursor = event?.target?.result;
            if (!cursor || deleted >= deleteCount) {
              return;
            }
            cursor.delete();
            deleted += 1;
            cursor.continue();
          };
          request.onerror = done;
          tx.oncomplete = done;
          tx.onerror = done;
          tx.onabort = done;
        } catch (error) {
          resolve(0);
        }
      });

    const pruneAiDbIfNeeded = async ({ force = false } = {}) => {
      const total = await countAiRecords();
      if (!force && total <= AI_DB_MAX_RECORDS) {
        return 0;
      }

      const target = Math.max(0, AI_DB_PRUNE_TARGET_RECORDS);
      const deleteCount = Math.max(0, total - target);
      if (deleteCount <= 0) {
        return 0;
      }

      return deleteOldestAiRecords(deleteCount);
    };

    const writeRecord = async () =>
      new Promise((resolve) => {
        try {
          let settled = false;
          const tx = db.transaction(AI_DB_STORE, "readwrite");
          tx.objectStore(AI_DB_STORE).put(record);

          const finish = (value) => {
            if (settled) {
              return;
            }
            settled = true;
            resolve(value);
          };

          tx.oncomplete = () => finish({ ok: true, quotaExceeded: false });
          tx.onerror = () => {
            const errorName = tx.error?.name || "";
            finish({
              ok: false,
              quotaExceeded: errorName === "QuotaExceededError" || errorName === "UnknownError"
            });
          };
          tx.onabort = () => {
            const errorName = tx.error?.name || "";
            finish({
              ok: false,
              quotaExceeded: errorName === "QuotaExceededError" || errorName === "UnknownError"
            });
          };
        } catch (error) {
          const errorName = error?.name || "";
          resolve({
            ok: false,
            quotaExceeded: errorName === "QuotaExceededError" || errorName === "UnknownError"
          });
        }
      });

    try {
      const firstAttempt = await writeRecord();
      if (firstAttempt.ok) {
        await pruneAiDbIfNeeded();
        return;
      }

      if (firstAttempt.quotaExceeded) {
        const deleted = await pruneAiDbIfNeeded({ force: true });
        if (deleted > 0) {
          const retry = await writeRecord();
          if (retry.ok) {
            return;
          }
        }
      }
    } catch (error) {
      // noop
    }
  };

  const loadAllAiTranslationsFromDb = async () => {
    const db = await openAiDb();
    if (!db) {
      return [];
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(AI_DB_STORE, "readonly");
        const store = tx.objectStore(AI_DB_STORE);

        if (typeof store.getAll === "function") {
          const request = store.getAll();
          request.onsuccess = () => {
            const rows = Array.isArray(request.result) ? request.result : [];
            resolve(rows);
          };
          request.onerror = () => resolve([]);
          return;
        }

        const rows = [];
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = (event) => {
          const cursor = event?.target?.result;
          if (!cursor) {
            resolve(rows);
            return;
          }
          rows.push(cursor.value);
          cursor.continue();
        };
        cursorRequest.onerror = () => resolve([]);
      } catch (error) {
        resolve([]);
      }
    });
  };

  const buildAiCacheKey = (sourceText, settings, videoId) => {
    if (!sourceText) {
      return "";
    }
    return JSON.stringify({
      v: videoId || "",
      m: settings?.aiModel || "",
      s: settings?.aiSourceLang || settings?.primaryLang || "",
      t: settings?.aiTargetLang || settings?.secondaryLang || "",
      q: sourceText
    });
  };

  const isPocketBaseEnabled = (settings) => {
    if (!settings) {
      return false;
    }
    return Boolean(
      typeof settings.pocketBaseUrl === "string" &&
      settings.pocketBaseUrl.trim() &&
      typeof settings.pocketBaseCollection === "string" &&
      settings.pocketBaseCollection.trim()
    );
  };

  const getPocketBaseTimedCollection = (settings) => {
    if (!settings) {
      return "";
    }
    if (typeof settings.pocketBaseTimedCollection === "string" && settings.pocketBaseTimedCollection.trim()) {
      return settings.pocketBaseTimedCollection.trim();
    }
    if (typeof settings.pocketBaseCollection === "string" && settings.pocketBaseCollection.trim()) {
      return settings.pocketBaseCollection.trim();
    }
    return "";
  };

  const loadTimedCaptionsFromPocketBase = async (videoId, settings) => {
    const normalizedVideoId = typeof videoId === "string" ? videoId.trim() : "";
    if (!normalizedVideoId) {
      return [];
    }

    const baseUrl = typeof settings?.pocketBaseUrl === "string" ? settings.pocketBaseUrl.trim() : "";
    const collection = getPocketBaseTimedCollection(settings);
    if (!baseUrl || !collection) {
      return [];
    }

    const perPage = 200;
    const maxPages = 20;
    const filter = `video_id="${escapePocketBaseFilterValue(normalizedVideoId)}"`;
    const fields = "video_id,start_sec,end_sec,source_text,translation,translation_source";
    const rows = [];

    let page = 1;
    while (page <= maxPages) {
      const endpoint =
        `${baseUrl}/api/collections/${encodeURIComponent(collection)}/records` +
        `?page=${page}&perPage=${perPage}&sort=start_sec&fields=${encodeURIComponent(fields)}` +
        `&filter=${encodeURIComponent(filter)}`;

      let response = null;
      try {
        response = await fetch(endpoint, {
          method: "GET",
          headers: getPocketBaseHeaders(settings)
        });
      } catch (error) {
        logPocketBaseErrorOnce("load-timed-network", {
          endpoint,
          collection,
          message: error && error.message ? error.message : String(error || "")
        });
        return rows;
      }

      if (!response.ok) {
        const message = await readPocketBaseError(response);
        logPocketBaseErrorOnce("load-timed", {
          status: response.status,
          endpoint,
          collection,
          message
        });
        return rows;
      }

      const payload = await response.json().catch(() => ({}));
      const items = Array.isArray(payload?.items) ? payload.items : [];
      for (const item of items) {
        const start = Number(item?.start_sec);
        const end = Number(item?.end_sec);
        rows.push({
          videoId: typeof item?.video_id === "string" ? item.video_id : normalizedVideoId,
          startTime: Number.isFinite(start) ? Math.max(0, start) : 0,
          endTime: Number.isFinite(end) ? Math.max(0, end) : 0,
          sourceText: typeof item?.source_text === "string" ? item.source_text : "",
          translation: typeof item?.translation === "string" ? item.translation : "",
          translationSource: typeof item?.translation_source === "string" ? item.translation_source : ""
        });
      }

      const totalPages = Number(payload?.totalPages);
      if (!Number.isFinite(totalPages) || page >= totalPages) {
        break;
      }
      page += 1;
    }

    return rows;
  };

  const escapePocketBaseFilterValue = (value) =>
    String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"");

  const getPocketBaseHeaders = (settings) => {
    const headers = {};
    if (settings && settings.pocketBaseToken) {
      headers.Authorization = `Bearer ${settings.pocketBaseToken}`;
    }
    return headers;
  };

  const decodePocketBaseUserIdFromToken = (token) => {
    if (!token || typeof token !== "string") {
      return "";
    }

    const segments = token.split(".");
    if (segments.length < 2) {
      return "";
    }

    const payloadSegment = segments[1];
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

    try {
      const payloadText = atob(padded);
      const payload = JSON.parse(payloadText);
      if (typeof payload?.id === "string" && payload.id.trim()) {
        return payload.id.trim();
      }
      if (typeof payload?.sub === "string" && payload.sub.trim()) {
        return payload.sub.trim();
      }
    } catch (error) {
      return "";
    }

    return "";
  };

  const getPocketBaseUserId = (settings) => {
    if (!settings) {
      return "";
    }
    if (typeof settings.pocketBaseUserId === "string" && settings.pocketBaseUserId.trim()) {
      return settings.pocketBaseUserId.trim();
    }
    if (typeof settings.pocketBaseToken === "string" && settings.pocketBaseToken.trim()) {
      return decodePocketBaseUserIdFromToken(settings.pocketBaseToken.trim());
    }
    return "";
  };

  const hashSourceText = (input) => {
    const text = typeof input === "string" ? input : String(input || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  };

  const readPocketBaseError = async (response) => {
    if (!response) {
      return "";
    }

    try {
      const data = await response.clone().json();
      if (typeof data?.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
      if (data && typeof data === "object") {
        return JSON.stringify(data);
      }
    } catch (error) {
      // noop
    }

    try {
      const text = await response.clone().text();
      return typeof text === "string" ? text.trim() : "";
    } catch (error) {
      return "";
    }
  };

  const logPocketBaseErrorOnce = (scope, details = {}) => {
    const key = `${scope}:${details?.status || ""}:${details?.message || ""}`;
    if (STATE.pocketBaseErrorCache.has(key)) {
      return;
    }
    STATE.pocketBaseErrorCache.add(key);
    console.warn("DualSub PocketBase request failed", {
      scope,
      ...details
    });
  };

  const loadAiTranslationFromPocketBase = async (cacheKey, settings) => {
    if (!isPocketBaseEnabled(settings) || !cacheKey) {
      return "";
    }

    const baseUrl = settings.pocketBaseUrl;
    const collection = settings.pocketBaseCollection;
    const filter = `cache_key="${escapePocketBaseFilterValue(cacheKey)}"`;
    const endpoint =
      `${baseUrl}/api/collections/${encodeURIComponent(collection)}/records` +
      `?perPage=1&fields=translation&filter=${encodeURIComponent(filter)}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: getPocketBaseHeaders(settings)
      });
      if (!response.ok) {
        const message = await readPocketBaseError(response);
        logPocketBaseErrorOnce("load", {
          status: response.status,
          endpoint,
          message
        });
        return "";
      }
      const payload = await response.json();
      const item = Array.isArray(payload?.items) ? payload.items[0] : null;
      return item && typeof item.translation === "string" ? item.translation.trim() : "";
    } catch (error) {
      return "";
    }
  };

  const saveAiTranslationToPocketBase = async (cacheKey, sourceText, translation, settings, videoId) => {
    if (!isPocketBaseEnabled(settings) || !cacheKey || !translation) {
      return;
    }

    const baseUrl = settings.pocketBaseUrl;
    const collection = settings.pocketBaseCollection;
    const endpoint = `${baseUrl}/api/collections/${encodeURIComponent(collection)}/records?upsert=cache_key`;

    const payload = {
      cache_key: cacheKey,
      video_id: videoId || "",
      source_lang: settings.aiSourceLang || settings.primaryLang || "",
      target_lang: settings.aiTargetLang || settings.secondaryLang || "",
      model: settings.aiModel || "",
      source_text_hash: hashSourceText(sourceText),
      updated_at: new Date().toISOString(),
      translation
    };

    const userId = getPocketBaseUserId(settings);
    if (userId) {
      payload.user = userId;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPocketBaseHeaders(settings)
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await readPocketBaseError(response);
        logPocketBaseErrorOnce("save", {
          status: response.status,
          endpoint,
          collection,
          message
        });
      }
    } catch (error) {
      logPocketBaseErrorOnce("save-network", {
        endpoint,
        collection,
        message: error && error.message ? error.message : String(error || "")
      });
    }
  };

  const saveTimedCaptionToPocketBase = async (entry, settings) => {
    if (!entry || (!entry.sourceText && !entry.translation)) {
      return;
    }

    const baseUrl = typeof settings?.pocketBaseUrl === "string" ? settings.pocketBaseUrl.trim() : "";
    const collection = getPocketBaseTimedCollection(settings);
    if (!baseUrl || !collection) {
      return;
    }
    const endpoint = `${baseUrl}/api/collections/${encodeURIComponent(collection)}/records`;

    const payload = {
      video_id: entry.videoId || "",
      start_sec: Number.isFinite(entry.startTime) ? Number(entry.startTime.toFixed(3)) : 0,
      end_sec: Number.isFinite(entry.endTime) ? Number(entry.endTime.toFixed(3)) : 0,
      source_text: entry.sourceText || "",
      translation: entry.translation || ""
    };

    if (entry.translationSource) {
      payload.translation_source = entry.translationSource;
    }

    const userId = getPocketBaseUserId(settings);
    if (userId) {
      payload.user = userId;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPocketBaseHeaders(settings)
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await readPocketBaseError(response);
        logPocketBaseErrorOnce("save-timed", {
          status: response.status,
          endpoint,
          collection,
          message
        });
      }
    } catch (error) {
      logPocketBaseErrorOnce("save-timed-network", {
        endpoint,
        collection,
        message: error && error.message ? error.message : String(error || "")
      });
    }
  };

  const resetAiState = ({ clearCache = false } = {}) => {
    if (STATE.aiQueueTimer) {
      clearTimeout(STATE.aiQueueTimer);
      STATE.aiQueueTimer = 0;
    }
    STATE.aiQueue = null;
    STATE.aiInFlight = false;
    STATE.aiDbLookup.clear();
    STATE.aiPending.clear();
    if (clearCache) {
      STATE.aiCache.clear();
      STATE.aiCacheSource.clear();
    }
  };

  const buildGeminiPrompt = (sourceText, settings) => {
    const sourceLang = settings.aiSourceLang && settings.aiSourceLang !== "auto"
      ? settings.aiSourceLang
      : settings.primaryLang || "auto";
    const targetLang = settings.aiTargetLang || settings.secondaryLang || "zh-Hant";

    return [
      `Translate this subtitle from ${sourceLang} to ${targetLang}.`,
      "Rules:",
      "- Return translation only.",
      "- Keep line breaks and punctuation.",
      "- No explanations.",
      "",
      sourceText
    ].join("\n");
  };

  const requestGeminiTranslation = async (sourceText, settings) => {
    const model = settings.aiModel.trim();
    const apiKey = settings.aiApiKey.trim();
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiPrompt(sourceText, settings) }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 220
        }
      })
    });

    if (!response.ok) {
      const error = new Error(`Gemini request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
    return text;
  };

  const flushAiQueue = async () => {
    if (STATE.aiInFlight) {
      return;
    }
    if (!isAiTranslationEnabled(STATE.settings)) {
      return;
    }
    const queued = STATE.aiQueue;
    if (!queued || !queued.cacheKey || !queued.sourceText) {
      return;
    }
    if (STATE.aiCache.has(queued.cacheKey) || STATE.aiPending.has(queued.cacheKey)) {
      STATE.aiQueue = null;
      return;
    }

    const elapsed = Date.now() - STATE.aiLastRequestAt;
    if (elapsed < AI_MIN_REQUEST_GAP_MS) {
      if (!STATE.aiQueueTimer) {
        STATE.aiQueueTimer = setTimeout(() => {
          STATE.aiQueueTimer = 0;
          flushAiQueue();
        }, AI_MIN_REQUEST_GAP_MS - elapsed);
      }
      return;
    }

    STATE.aiQueue = null;
    STATE.aiInFlight = true;
    STATE.aiLastRequestAt = Date.now();

    const { cacheKey, sourceText } = queued;
    console.log("DualSub Translation Source:", "gemini:request");
    const task = requestGeminiTranslation(sourceText, STATE.settings);
    STATE.aiPending.set(cacheKey, task);

    try {
      const translated = await task;
      if (translated) {
        STATE.aiCache.set(cacheKey, translated);
        STATE.aiCacheSource.set(cacheKey, "gemini");
        console.log("DualSub Translation Source:", "gemini");
        await Promise.all([
          saveAiTranslationToDb(cacheKey, sourceText, translated, STATE.settings, STATE.videoId),
          saveAiTranslationToPocketBase(cacheKey, sourceText, translated, STATE.settings, STATE.videoId)
        ]);
      }
    } catch (error) {
      console.warn("DualSub AI translation failed", {
        status: error && error.status ? error.status : null,
        message: error && error.message ? error.message : String(error || "")
      });
    } finally {
      STATE.aiPending.delete(cacheKey);
      STATE.aiInFlight = false;
      if (STATE.aiQueue) {
        flushAiQueue();
      }
    }
  };

  const queueAiTranslation = (sourceText) => {
    const normalized = normalizeAiSourceText(sourceText);
    if (!normalized) {
      return "";
    }

    if (!isAiTranslationEnabled(STATE.settings)) {
      return "";
    }

    const cacheKey = buildAiCacheKey(normalized, STATE.settings, STATE.videoId);
    if (!cacheKey) {
      return "";
    }

    if (shouldSkipAiTranslation(normalized, STATE.settings)) {
      STATE.aiCache.set(cacheKey, normalized);
      STATE.aiCacheSource.set(cacheKey, "skip:same-language");
      return normalized;
    }

    const minChars = Number.isFinite(STATE.settings.aiMinChars)
      ? STATE.settings.aiMinChars
      : DEFAULT_SETTINGS.aiMinChars;
    if (normalized.replace(/\s+/g, "").length < minChars) {
      return "";
    }

    if (STATE.aiCache.has(cacheKey)) {
      return STATE.aiCache.get(cacheKey) || "";
    }

    if (!STATE.aiDbLookup.has(cacheKey)) {
      const lookup = loadAiTranslationFromPocketBase(cacheKey, STATE.settings)
        .then(async (fromPocketBase) => {
          if (fromPocketBase) {
            STATE.aiCache.set(cacheKey, fromPocketBase);
            STATE.aiCacheSource.set(cacheKey, "cache:pocketbase");
            console.log("DualSub Translation Source:", "cache:pocketbase");
            await saveAiTranslationToDb(
              cacheKey,
              normalized,
              fromPocketBase,
              STATE.settings,
              STATE.videoId
            );
            return;
          }

          const fromLocalDb = await loadAiTranslationFromDb(cacheKey);
          if (fromLocalDb) {
            STATE.aiCache.set(cacheKey, fromLocalDb);
            STATE.aiCacheSource.set(cacheKey, "cache:indexeddb");
            console.log("DualSub Translation Source:", "cache:indexeddb");
            return;
          }

          if (!STATE.aiPending.has(cacheKey)) {
            STATE.aiQueue = { cacheKey, sourceText: normalized };
            if (!STATE.aiQueueTimer) {
              STATE.aiQueueTimer = setTimeout(() => {
                STATE.aiQueueTimer = 0;
                flushAiQueue();
              }, AI_QUEUE_DELAY_MS);
            }
          }
        })
        .finally(() => {
          STATE.aiDbLookup.delete(cacheKey);
        });
      STATE.aiDbLookup.set(cacheKey, lookup);
      return "";
    }

    if (!STATE.aiPending.has(cacheKey)) {
      STATE.aiQueue = { cacheKey, sourceText: normalized };
    }

    if (!STATE.aiQueueTimer) {
      STATE.aiQueueTimer = setTimeout(() => {
        STATE.aiQueueTimer = 0;
        flushAiQueue();
      }, AI_QUEUE_DELAY_MS);
    }

    return "";
  };

  const createElement = (tag, className) => {
    const el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    return el;
  };

  const setStyles = (element, styles) => {
    Object.keys(styles).forEach((key) => {
      element.style[key] = styles[key];
    });
  };

console.log("dualsub-yt: content-script loaded");

  const getBaseStyles = () => ({
    position: "absolute",
    left: "0",
    right: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    pointerEvents: "none",
    zIndex: "9999"
  });

  const getLineStyles = () => ({
    maxWidth: "90%",
    color: "#fff",
    textShadow: "0 2px 4px rgba(0, 0, 0, 0.85)",
    textAlign: "center",
    fontWeight: "600",
    padding: "2px 8px",
    borderRadius: "4px",
    background: "rgba(0, 0, 0, 0.35)"
  });

  const hexToRgba = (hexColor, opacity, fallback = "rgba(0, 0, 0, 0.35)") => {
    const normalized = normalizeHexColor(hexColor);
    if (!normalized) {
      return fallback;
    }

    const alpha = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 0.35;
    const r = Number.parseInt(normalized.slice(1, 3), 16);
    const g = Number.parseInt(normalized.slice(3, 5), 16);
    const b = Number.parseInt(normalized.slice(5, 7), 16);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      return fallback;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const applySettings = (overlay, settings) => {
    if (!overlay || !settings) {
      return;
    }

    const { root, primaryLine, secondaryLine } = overlay;
    const fontSize = settings.fontSize ? `${settings.fontSize}px` : "24px";
    const lineSpacing = settings.lineSpacing ? settings.lineSpacing : 1.1;
    const opacity = settings.opacity ? settings.opacity : 0.9;
    const textColor = normalizeHexColor(settings.subtitleTextColor) || DEFAULT_SETTINGS.subtitleTextColor;
    const backgroundColor = normalizeHexColor(settings.subtitleBackgroundColor) || DEFAULT_SETTINGS.subtitleBackgroundColor;
    const backgroundOpacity = Number.isFinite(settings.subtitleBackgroundOpacity)
      ? settings.subtitleBackgroundOpacity
      : DEFAULT_SETTINGS.subtitleBackgroundOpacity;
    const subtitleFontWeight = Number.isFinite(settings.subtitleFontWeight)
      ? settings.subtitleFontWeight
      : DEFAULT_SETTINGS.subtitleFontWeight;
    const subtitleBorderRadiusPx = Number.isFinite(settings.subtitleBorderRadiusPx)
      ? settings.subtitleBorderRadiusPx
      : DEFAULT_SETTINGS.subtitleBorderRadiusPx;
    const topOffsetPx = Number.isFinite(settings.topOffsetPx) ? settings.topOffsetPx : DEFAULT_SETTINGS.topOffsetPx;
    const bottomOffsetPx = Number.isFinite(settings.bottomOffsetPx)
      ? settings.bottomOffsetPx
      : DEFAULT_SETTINGS.bottomOffsetPx;
    const showTranslationOnly = settings.subtitleDisplayMode === "translated-only";

    root.style.opacity = `${opacity}`;
    root.style.bottom = settings.position === "top" ? "unset" : `${bottomOffsetPx}px`;
    root.style.top = settings.position === "top" ? `${topOffsetPx}px` : "unset";
    primaryLine.style.fontSize = fontSize;
    secondaryLine.style.fontSize = fontSize;
    primaryLine.style.color = textColor;
    secondaryLine.style.color = textColor;
    primaryLine.style.background = hexToRgba(backgroundColor, backgroundOpacity);
    secondaryLine.style.background = hexToRgba(backgroundColor, backgroundOpacity);
    primaryLine.style.fontWeight = `${Math.round(subtitleFontWeight)}`;
    secondaryLine.style.fontWeight = `${Math.round(subtitleFontWeight)}`;
    primaryLine.style.borderRadius = `${Math.max(0, Math.round(subtitleBorderRadiusPx))}px`;
    secondaryLine.style.borderRadius = `${Math.max(0, Math.round(subtitleBorderRadiusPx))}px`;
    primaryLine.style.display = showTranslationOnly ? "none" : "block";
    root.style.gap = `${Math.max(0, (lineSpacing - 1) * 16)}px`;
    STATE.dynamicBottomOffsetPx = Number.NaN;
  };

  const getVisibleControlBarHeight = (video) => {
    if (!video) {
      return 0;
    }

    const player = video.closest(".html5-video-player") || document.getElementById("movie_player");
    if (!player || player.classList.contains("ytp-autohide")) {
      return 0;
    }

    const controlBar = player.querySelector(".ytp-chrome-bottom");
    if (!controlBar) {
      return 0;
    }

    const style = window.getComputedStyle(controlBar);
    if (style.display === "none" || style.visibility === "hidden") {
      return 0;
    }

    const opacity = Number.parseFloat(style.opacity);
    if (Number.isFinite(opacity) && opacity <= CONTROL_BAR_MIN_OPACITY) {
      return 0;
    }

    const videoRect = video.getBoundingClientRect();
    const controlRect = controlBar.getBoundingClientRect();
    if (!videoRect || !controlRect) {
      return 0;
    }

    const overlap = videoRect.bottom - controlRect.top;
    if (!Number.isFinite(overlap) || overlap <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(overlap, videoRect.height));
  };

  const syncOverlayBottomOffsetWithControls = (overlay, settings, video) => {
    if (!overlay?.root || !settings || !video || settings.position === "top") {
      return;
    }

    const baseBottom = Number.isFinite(settings.bottomOffsetPx)
      ? settings.bottomOffsetPx
      : DEFAULT_SETTINGS.bottomOffsetPx;
    const controlBarHeight = getVisibleControlBarHeight(video);
    const dynamicBottom = Math.round(
      baseBottom + (controlBarHeight > 0 ? controlBarHeight + CONTROL_BAR_CLEARANCE_PX : 0)
    );

    if (STATE.dynamicBottomOffsetPx === dynamicBottom) {
      return;
    }

    overlay.root.style.bottom = `${dynamicBottom}px`;
    STATE.dynamicBottomOffsetPx = dynamicBottom;
  };

  const createOverlay = (container, settings) => {
    if (!container) {
      throw new Error("Overlay container is required");
    }

    console.log("dualsub-yt: content-script createOverlay", { settings });

    const root = createElement("div", "dualsub-overlay");
    const primaryLine = createElement("div", "dualsub-line primary");
    const secondaryLine = createElement("div", "dualsub-line secondary");

    setStyles(root, getBaseStyles());
    setStyles(primaryLine, getLineStyles());
    setStyles(secondaryLine, getLineStyles());

    root.appendChild(primaryLine);
    root.appendChild(secondaryLine);
    container.appendChild(root);

    const overlay = {
      root,
      primaryLine,
      secondaryLine
    };

    applySettings(overlay, settings || {});

    const update = (primaryText, secondaryText) => {
      if (primaryLine.textContent !== primaryText) {
        primaryLine.textContent = primaryText || "";
      }
      if (secondaryLine.textContent !== secondaryText) {
        secondaryLine.textContent = secondaryText || "";
      }
    };

    const destroy = () => {
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    };

    return {
      root,
      primaryLine,
      secondaryLine,
      update,
      destroy
    };
  };

  const waitFor = (getter, timeoutMs = 10000, intervalMs = 250) =>
    new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const value = getter();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(tick, intervalMs);
      };
      tick();
    });

  const getPlayerResponse = () => {
    const player = document.getElementById("movie_player");
    if (player && typeof player.getPlayerResponse === "function") {
      return player.getPlayerResponse();
    }

    if (globalThis.ytInitialPlayerResponse) {
      return globalThis.ytInitialPlayerResponse;
    }

    const raw = globalThis.ytplayer?.config?.args?.player_response;
    if (raw && typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch (error) {
        return null;
      }
    }

    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const text = script.textContent;
      if (!text || !text.includes("ytInitialPlayerResponse")) {
        continue;
      }

      const match = text.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]);
        } catch (error) {
          continue;
        }
      }
    }

    return null;
  };

  const getVideoElement = () => document.querySelector("video");

  const readLiveCaptionText = () => {
    const container = document.querySelector(".caption-window") ||
      document.querySelector(".ytp-caption-window-bottom");
    if (!container) {
      return "";
    }

    const segments = container.querySelectorAll(".ytp-caption-segment");
    if (!segments || segments.length === 0) {
      return container.textContent ? container.textContent.trim() : "";
    }

    const text = Array.from(segments)
      .map((node) => (node.textContent ? node.textContent.trim() : ""))
      .filter(Boolean)
      .join("\n");

    return text;
  };

  const startCaptionObserver = () => {
    const target = document.querySelector(".caption-window") ||
      document.querySelector(".ytp-caption-window-bottom");
    if (!target) {
      return null;
    }

    const observer = new MutationObserver(() => {
      const nextText = readLiveCaptionText();
      if (nextText !== STATE.liveCaptionText) {
        STATE.liveCaptionText = nextText;
        console.log("YouTubeCaption:", STATE.liveCaptionText);
      }
    });

    observer.observe(target, { childList: true, subtree: true, characterData: true });
    STATE.liveCaptionText = readLiveCaptionText();
    STATE.captionObserver = observer;
    return observer;
  };

  const stopCaptionObserver = () => {
    if (STATE.captionObserver) {
      STATE.captionObserver.disconnect();
      STATE.captionObserver = null;
    }
  };

  const getOverlayContainer = (video) => {
    if (!video) {
      return null;
    }

    const player = video.closest(".html5-video-player") || document.getElementById("movie_player");
    const container = player || video.parentElement;
    if (!container) {
      return null;
    }

    const computed = window.getComputedStyle(container);
    if (computed.position === "static") {
      container.style.position = "relative";
    }

    return container;
  };

  const loadCaptions = async (tracks, settings) => {
    const selection = selectDualTracks(tracks, settings);
    const useAiTranslation = isAiTranslationEnabled(settings);
    const fetchSafely = async (label, url) => {
      if (!url) {
        return { cues: [], error: null };
      }

      try {
        const cues = await fetchCaption(url);
        return { cues, error: null };
      } catch (error) {
        if (error && error.status === RATE_LIMIT_STATUS) {
          console.warn(`DualSub: ${label} captions rate-limited`, {
            sourceUrl: error.sourceUrl || url,
            lastTriedUrl: error.lastTriedUrl || url,
            attempts: error.attempts || []
          });
          return { cues: [], error };
        }

        console.warn(`DualSub: ${label} captions failed`, error);
        return { cues: [], error };
      }
    };

    // Primary text can be read from on-screen YouTube captions; skip fetching
    // auto English primary track to reduce timedtext calls and avoid 429 bursts.
    const shouldFetchPrimary =
      selection.primary &&
      !(selection.primary.isAuto && toLanguageGroup(settings?.primaryLang || "en") === LANGUAGE_GROUPS.ENGLISH);
    const shouldFetchSecondary = selection.secondary && !useAiTranslation;

    const [primaryResult, secondaryResult] = await Promise.all([
      shouldFetchPrimary ? fetchSafely("primary", selection.primary.baseUrl) : Promise.resolve({ cues: [], error: null }),
      shouldFetchSecondary
        ? fetchSafely("secondary", selection.secondary.baseUrl)
        : Promise.resolve({ cues: [], error: null })
    ]);

    const primaryCues = primaryResult.cues;
    const secondaryCues = secondaryResult.cues;
    const rateLimited =
      (primaryResult.error && primaryResult.error.status === RATE_LIMIT_STATUS) ||
      (secondaryResult.error && secondaryResult.error.status === RATE_LIMIT_STATUS);

    if (selection.primary && primaryCues.length === 0) {
      console.warn("DualSub: primary track selected but no parsed cues", selection.primary.baseUrl);
    }
    if (selection.secondary && secondaryCues.length === 0) {
      console.warn("DualSub: secondary track selected but no parsed cues", selection.secondary.baseUrl);
    }

    return {
      selection,
      cues: {
        primary: primaryCues,
        secondary: secondaryCues
      },
      meta: {
        rateLimited: Boolean(rateLimited)
      }
    };
  };

  const clearCaptionRetry = () => {
    if (STATE.captionRetryTimer) {
      clearTimeout(STATE.captionRetryTimer);
      STATE.captionRetryTimer = 0;
    }
  };

  const clearInitRetry = () => {
    if (STATE.initRetryTimer) {
      clearTimeout(STATE.initRetryTimer);
      STATE.initRetryTimer = 0;
    }
  };

  const scheduleInitRetry = () => {
    if (STATE.initRetryTimer || !isWatchPage()) {
      return;
    }

    console.warn(`DualSub: scheduling init retry in ${Math.round(INIT_RETRY_DELAY_MS / 1000)}s`);
    STATE.initRetryTimer = setTimeout(() => {
      STATE.initRetryTimer = 0;
      if (!isWatchPage() || STATE.cleanup) {
        return;
      }
      STATE.initialized = false;
      init();
    }, INIT_RETRY_DELAY_MS);
  };

  const startInitWatchdog = () => {
    if (STATE.initWatchdogTimer) {
      return;
    }

    STATE.initWatchdogTimer = setInterval(() => {
      if (!isWatchPage()) {
        return;
      }
      if (STATE.cleanup || STATE.startPromise) {
        return;
      }
      const elapsed = Date.now() - STATE.lastInitAttemptAt;
      if (elapsed < INIT_DEBOUNCE_MS) {
        return;
      }
      STATE.initialized = false;
      init();
    }, INIT_WATCHDOG_INTERVAL_MS);
  };

  const scheduleCaptionRetry = () => {
    if (!STATE.tracks.length || !STATE.settings) {
      return;
    }

    clearCaptionRetry();
    const delay = STATE.captionRetryDelayMs;
    console.warn(`DualSub: scheduling caption retry in ${Math.round(delay / 1000)}s`);

    STATE.captionRetryTimer = setTimeout(async () => {
      STATE.captionRetryTimer = 0;
      if (!STATE.initialized || !STATE.tracks.length || !STATE.settings) {
        return;
      }

      const refreshed = await loadCaptions(STATE.tracks, STATE.settings);
      STATE.cues = refreshed.cues;
      STATE.cueIndex = { primary: 0, secondary: 0 };

      if (refreshed.meta && refreshed.meta.rateLimited) {
        STATE.captionRetryDelayMs = Math.min(STATE.captionRetryDelayMs * 2, MAX_CAPTION_RETRY_DELAY_MS);
        scheduleCaptionRetry();
      } else {
        STATE.captionRetryDelayMs = BASE_CAPTION_RETRY_DELAY_MS;
      }
    }, delay);
  };

  const findActiveCue = (cues, time, startIndex) => {
    if (!Array.isArray(cues) || cues.length === 0) {
      return { cue: null, index: 0 };
    }

    let index = Math.min(Math.max(startIndex, 0), cues.length - 1);
    let cue = cues[index];

    if (!cue) {
      return { cue: null, index: 0 };
    }

    if (time < cue.start) {
      while (index > 0 && time < cues[index].start) {
        index -= 1;
      }
      cue = cues[index];
    } else if (time > cue.end) {
      while (index < cues.length - 1 && time > cues[index].end) {
        index += 1;
      }
      cue = cues[index];
    }

    if (time >= cue.start && time <= cue.end) {
      return { cue, index };
    }

    return { cue: null, index };
  };

  const normalizeTimedCaptionText = (text) => {
    if (!text || typeof text !== "string") {
      return "";
    }
    return text
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  };

  const toSafeCaptionTime = (time) => {
    if (!Number.isFinite(time) || time < 0) {
      return 0;
    }
    return time;
  };

  const pushTimedCaption = (entry) => {
    if (!entry || (!entry.sourceText && !entry.translation)) {
      return;
    }
    STATE.timedCaptions.push(entry);
    if (STATE.timedCaptions.length > TIMED_CAPTION_MAX_ENTRIES) {
      STATE.timedCaptions.shift();
    }
  };

  const closeActiveTimedCaption = (endTime) => {
    const active = STATE.activeTimedCaption;
    if (!active) {
      return;
    }

    const safeEnd = Math.max(active.startTime, toSafeCaptionTime(endTime));
    const duration = safeEnd - active.startTime;
    if (duration >= TIMED_CAPTION_MIN_DURATION_SECONDS) {
      const entry = {
        videoId: active.videoId,
        startTime: active.startTime,
        endTime: safeEnd,
        sourceText: active.sourceText,
        translation: active.translation,
        translationSource: active.translationSource
      };
      pushTimedCaption(entry);
      saveTimedCaptionToPocketBase(entry, STATE.settings);
    }

    STATE.activeTimedCaption = null;
  };

  const syncTimedCaptionTimeline = (time, sourceText, translation, translationSource) => {
    const safeTime = toSafeCaptionTime(time);
    const normalizedSource = normalizeTimedCaptionText(sourceText);
    const normalizedTranslation = normalizeTimedCaptionText(translation);
    const hasText = Boolean(normalizedSource || normalizedTranslation);
    const previousTime = STATE.lastTimedCaptionTime;
    const hasSeekGap =
      Number.isFinite(previousTime) &&
      Math.abs(safeTime - previousTime) > TIMED_CAPTION_SEEK_GAP_SECONDS;

    if (hasSeekGap && STATE.activeTimedCaption) {
      closeActiveTimedCaption(previousTime);
    }

    if (!hasText) {
      closeActiveTimedCaption(safeTime);
      STATE.lastTimedCaptionTime = safeTime;
      return;
    }

    if (!STATE.activeTimedCaption) {
      STATE.activeTimedCaption = {
        videoId: STATE.videoId || "",
        startTime: safeTime,
        endTime: safeTime,
        sourceText: normalizedSource,
        translation: normalizedTranslation,
        translationSource: translationSource || ""
      };
      STATE.lastTimedCaptionTime = safeTime;
      return;
    }

    const active = STATE.activeTimedCaption;
    if (active.sourceText === normalizedSource) {
      active.endTime = Math.max(active.endTime, safeTime);
      if (normalizedTranslation || !active.translation) {
        active.translation = normalizedTranslation;
      }
      if (translationSource) {
        active.translationSource = translationSource;
      }
      STATE.lastTimedCaptionTime = safeTime;
      return;
    }

    closeActiveTimedCaption(safeTime);
    STATE.activeTimedCaption = {
      videoId: STATE.videoId || "",
      startTime: safeTime,
      endTime: safeTime,
      sourceText: normalizedSource,
      translation: normalizedTranslation,
      translationSource: translationSource || ""
    };
    STATE.lastTimedCaptionTime = safeTime;
  };

  const getTimedCaptionsForExport = () => {
    const rows = STATE.timedCaptions.slice();
    const active = STATE.activeTimedCaption;
    if (active) {
      rows.push({
        ...active,
        endTime: Math.max(active.endTime, toSafeCaptionTime(STATE.lastTimedCaptionTime))
      });
    }

    return rows
      .filter((row) => row && (row.sourceText || row.translation))
      .map((row) => ({
        videoId: typeof row.videoId === "string" ? row.videoId : "",
        startTime: Number.isFinite(row.startTime) ? Math.max(0, row.startTime) : 0,
        endTime: Number.isFinite(row.endTime) ? Math.max(0, row.endTime) : 0,
        sourceText: typeof row.sourceText === "string" ? row.sourceText : "",
        translation: typeof row.translation === "string" ? row.translation : "",
        translationSource: typeof row.translationSource === "string" ? row.translationSource : ""
      }));
  };

  const mergeTimedCaptionRows = (...rowGroups) => {
    const merged = new Map();
    const toKey = (row) =>
      [
        row.videoId || "",
        Number.isFinite(row.startTime) ? row.startTime.toFixed(3) : "0.000",
        Number.isFinite(row.endTime) ? row.endTime.toFixed(3) : "0.000",
        row.sourceText || "",
        row.translation || ""
      ].join("|");

    for (const group of rowGroups) {
      if (!Array.isArray(group)) {
        continue;
      }
      for (const row of group) {
        if (!row || typeof row !== "object") {
          continue;
        }
        if (!row.sourceText && !row.translation) {
          continue;
        }
        merged.set(toKey(row), {
          videoId: typeof row.videoId === "string" ? row.videoId : "",
          startTime: Number.isFinite(row.startTime) ? Math.max(0, row.startTime) : 0,
          endTime: Number.isFinite(row.endTime) ? Math.max(0, row.endTime) : 0,
          sourceText: typeof row.sourceText === "string" ? row.sourceText : "",
          translation: typeof row.translation === "string" ? row.translation : "",
          translationSource: typeof row.translationSource === "string" ? row.translationSource : ""
        });
      }
    }

    return Array.from(merged.values()).sort(
      (left, right) => left.startTime - right.startTime || left.endTime - right.endTime
    );
  };

  const startRenderLoop = (video, overlay) => {
    const tick = () => {
      const time = video.currentTime || 0;

      // Poll live captions each tick as a fallback when MutationObserver
      // doesn't observe updates (YouTube frequently updates text nodes).
      try {
        const polled = readLiveCaptionText();
        if (polled !== STATE.liveCaptionText) {
          STATE.liveCaptionText = polled;
          console.log("YouTubeCaption:", STATE.liveCaptionText);
        }
      } catch (err) {
        // noop
      }

      const primaryResult = findActiveCue(STATE.cues.primary, time, STATE.cueIndex.primary);
      const secondaryResult = findActiveCue(STATE.cues.secondary, time, STATE.cueIndex.secondary);

      STATE.cueIndex.primary = primaryResult.index;
      STATE.cueIndex.secondary = secondaryResult.index;

      const primaryText = primaryResult.cue ? primaryResult.cue.text : (STATE.liveCaptionText || "");
      let secondaryText = secondaryResult.cue ? secondaryResult.cue.text : "";
      let translationSource = secondaryResult.cue ? "youtube" : "";

      if (!secondaryText && isAiTranslationEnabled(STATE.settings)) {
        const normalized = normalizeAiSourceText(primaryText);
        if (normalized) {
          const cacheKey = buildAiCacheKey(normalized, STATE.settings, STATE.videoId);
          const cached = cacheKey ? STATE.aiCache.get(cacheKey) : "";
          if (cached) {
            secondaryText = cached;
            translationSource = cacheKey ? STATE.aiCacheSource.get(cacheKey) || "cache:memory" : "cache:memory";
          } else {
            secondaryText = queueAiTranslation(normalized) || "";
            if (secondaryText) {
              translationSource = cacheKey ? STATE.aiCacheSource.get(cacheKey) || "cache:memory" : "cache:memory";
            }
          }
        }
      }

      const showTranslationOnly = STATE.settings?.subtitleDisplayMode === "translated-only";
      const primaryTextForDisplay = showTranslationOnly ? "" : primaryText;
      syncOverlayBottomOffsetWithControls(overlay, STATE.settings, video);
      overlay.update(primaryTextForDisplay, secondaryText);

      if (primaryText !== STATE.debugText.primary) {
        console.log("DualSub Primary:", primaryText);
        STATE.debugText.primary = primaryText;
      }
      if (secondaryText !== STATE.debugText.secondary) {
        console.log("DualSub Secondary:", secondaryText);
        STATE.debugText.secondary = secondaryText;
      }
      if (translationSource && translationSource !== STATE.debugText.translationSource) {
        console.log("DualSub Translation Source:", translationSource);
        STATE.debugText.translationSource = translationSource;
      } else if (!translationSource && STATE.debugText.translationSource) {
        STATE.debugText.translationSource = "";
      }

      syncTimedCaptionTimeline(time, primaryText, secondaryText, translationSource);

      if (globalThis.__dualsub_debug__) {
        // legacy debug panel behavior
        if (primaryText !== STATE.debugText.primary) {
          console.log("DualSub primary", primaryText);
          STATE.debugText.primary = primaryText;
        }
        if (secondaryText !== STATE.debugText.secondary) {
          STATE.debugText.secondary = secondaryText;
        }
      }

      if (globalThis.__dualsub_debug__ && (primaryText || secondaryText)) {
        const panel = document.querySelector(".dualsub-debug");
        if (panel) {
          panel.textContent =
            `tracks: ${STATE.tracks.length}\n` +
            `primary: ${primaryText || "(none)"}\n` +
            `secondary: ${secondaryText || "(none)"}`;
        }
      }
      STATE.rafId = requestAnimationFrame(tick);
    };

    STATE.rafId = requestAnimationFrame(tick);
  };

  const stopRenderLoop = () => {
    if (STATE.rafId) {
      cancelAnimationFrame(STATE.rafId);
      STATE.rafId = 0;
    }
  };

  const initOverlay = async () => {
    const settings = await loadSettings();
    STATE.settings = settings;
    STATE.videoId = getCurrentVideoId();
    resetAiState({ clearCache: true });

    const response = await waitFor(getPlayerResponse, 15000, 250);
    if (!response) {
      console.warn("DualSub: player response unavailable");
      if (globalThis.__dualsub_debug__) {
        updateDebugPanel("player response unavailable");
      }
      return null;
    }

    const tracks = getAvailableTracks(response);
    if (!tracks.length) {
      console.warn("DualSub: no caption tracks available");
      return null;
    }

    let debugPanel = null;
    const ensureDebugPanel = () => {
      if (!globalThis.__dualsub_debug__) {
        return null;
      }

      if (debugPanel) {
        return debugPanel;
      }

      const panel = document.createElement("div");
      panel.className = "dualsub-debug";
      panel.style.position = "fixed";
      panel.style.right = "12px";
      panel.style.bottom = "12px";
      panel.style.zIndex = "10000";
      panel.style.background = "rgba(0, 0, 0, 0.8)";
      panel.style.color = "#fff";
      panel.style.padding = "10px 12px";
      panel.style.borderRadius = "8px";
      panel.style.fontSize = "12px";
      panel.style.maxWidth = "320px";
      panel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      panel.style.whiteSpace = "pre-wrap";

      const close = document.createElement("button");
      close.textContent = "x";
      close.style.position = "absolute";
      close.style.top = "4px";
      close.style.right = "6px";
      close.style.background = "transparent";
      close.style.color = "#fff";
      close.style.border = "none";
      close.style.cursor = "pointer";
      close.addEventListener("click", () => {
        panel.remove();
        debugPanel = null;
      });

      panel.appendChild(close);
      document.body.appendChild(panel);
      debugPanel = panel;
      return panel;
    };

    const updateDebugPanel = (payload) => {
      const panel = ensureDebugPanel();
      if (!panel) {
        return;
      }
      panel.textContent = payload;
    };

    if (globalThis.__dualsub_debug__) {
      console.log("DualSub tracks", tracks);
      updateDebugPanel(`tracks: ${tracks.length}`);
    }

    STATE.playerResponse = response;
    STATE.tracks = tracks;

    const captions = await loadCaptions(tracks, settings);
    if (globalThis.__dualsub_debug__) {
      console.log("DualSub selection", captions.selection);
      updateDebugPanel(
        `tracks: ${tracks.length}\n` +
          `primary: ${captions.selection.primary ? captions.selection.primary.baseUrl : "none"}\n` +
          `secondary: ${captions.selection.secondary ? captions.selection.secondary.baseUrl : "none"}\n` +
          `cues: ${STATE.cues.primary.length}/${STATE.cues.secondary.length}`
      );
    }
    STATE.cues = captions.cues;
    STATE.cueIndex = { primary: 0, secondary: 0 };
    if (captions.meta && captions.meta.rateLimited) {
      scheduleCaptionRetry();
    } else {
      clearCaptionRetry();
      STATE.captionRetryDelayMs = BASE_CAPTION_RETRY_DELAY_MS;
    }

    const video = await waitFor(getVideoElement, 10000, 250);
    if (!video) {
      console.warn("DualSub: video element unavailable");
      return null;
    }

    const container = getOverlayContainer(video);
    if (!container) {
      console.warn("DualSub: overlay container unavailable");
      return null;
    }

    const overlayInstance = createOverlay(container, settings);
    applySettings(overlayInstance, settings);
    startCaptionObserver();
    startRenderLoop(video, overlayInstance);

    const onStorageChange = async (changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) {
        return;
      }

      const nextSettings = sanitizeSettings(changes[STORAGE_KEY].newValue);
      applySettings(overlayInstance, nextSettings);

      const languageChanged =
        nextSettings.primaryLang !== STATE.settings.primaryLang ||
        nextSettings.secondaryLang !== STATE.settings.secondaryLang;
      const aiSettingChanged =
        nextSettings.translationProvider !== STATE.settings.translationProvider ||
        nextSettings.aiModel !== STATE.settings.aiModel ||
        nextSettings.aiApiKey !== STATE.settings.aiApiKey ||
        nextSettings.aiSourceLang !== STATE.settings.aiSourceLang ||
        nextSettings.aiTargetLang !== STATE.settings.aiTargetLang ||
        nextSettings.aiMinChars !== STATE.settings.aiMinChars;

      STATE.settings = nextSettings;
      if (aiSettingChanged) {
        resetAiState({ clearCache: true });
      }

      if (languageChanged || aiSettingChanged) {
        const nextCaptions = await loadCaptions(STATE.tracks, nextSettings);
        STATE.cues = nextCaptions.cues;
        STATE.cueIndex = { primary: 0, secondary: 0 };
        if (nextCaptions.meta && nextCaptions.meta.rateLimited) {
          scheduleCaptionRetry();
        } else {
          clearCaptionRetry();
          STATE.captionRetryDelayMs = BASE_CAPTION_RETRY_DELAY_MS;
        }
      }
    };

    if (globalThis.browser?.storage?.onChanged) {
      browser.storage.onChanged.addListener(onStorageChange);
    }

    return () => {
      stopRenderLoop();
      stopCaptionObserver();
      clearCaptionRetry();
      resetAiState({ clearCache: true });
      if (globalThis.browser?.storage?.onChanged) {
        browser.storage.onChanged.removeListener(onStorageChange);
      }
      if (debugPanel && debugPanel.parentNode) {
        debugPanel.parentNode.removeChild(debugPanel);
        debugPanel = null;
      }
      overlayInstance.destroy();
    };
  };

  const init = async () => {
    if (!isWatchPage()) {
      clearInitRetry();
      return;
    }

    console.log("dualsub-yt: init called");

    const now = Date.now();
    if (now - STATE.lastInitAttemptAt < INIT_DEBOUNCE_MS) {
      return;
    }
    STATE.lastInitAttemptAt = now;

    if (STATE.initialized && STATE.cleanup) {
      return;
    }

    if (STATE.startPromise) {
      return;
    }

    STATE.initialized = true;
    STATE.startPromise = initOverlay()
      .then((cleanup) => {
        if (typeof cleanup === "function") {
          STATE.cleanup = cleanup;
          clearInitRetry();
          window.__dualsub__ = { version: "0.1.0" };
          return;
        }

        STATE.cleanup = null;
        STATE.initialized = false;
        scheduleInitRetry();
      })
      .catch((error) => {
        console.error("DualSub init failed", error);
        STATE.cleanup = null;
        STATE.initialized = false;
        scheduleInitRetry();
      })
      .finally(() => {
        STATE.startPromise = null;
      });
  };

  const reset = () => {
    if (STATE.cleanup) {
      STATE.cleanup();
      STATE.cleanup = null;
    }
    stopRenderLoop();
    clearInitRetry();
    closeActiveTimedCaption(STATE.lastTimedCaptionTime);
    STATE.videoId = "";
    STATE.timedCaptions = [];
    STATE.activeTimedCaption = null;
    STATE.lastTimedCaptionTime = Number.NaN;
    STATE.dynamicBottomOffsetPx = Number.NaN;
    STATE.initialized = false;
  };

  const handleNavigation = () => {
    reset();
    init();
  };

  const handleRuntimeMessage = (message, _sender, sendResponse) => {
    if (!message || message.type !== "dualsub_export_translations") {
      return undefined;
    }

    Promise.all([loadAllAiTranslationsFromDb(), loadSettings()])
      .then(async ([rows, latestSettings]) => {
        const localTimedCaptions = getTimedCaptionsForExport();
        const currentVideoId = STATE.videoId || getCurrentVideoId();
        const remoteTimedCaptions = await loadTimedCaptionsFromPocketBase(
          currentVideoId,
          latestSettings || STATE.settings
        );
        const timedCaptions = mergeTimedCaptionRows(remoteTimedCaptions, localTimedCaptions);
        const normalized = rows
          .filter((row) => row && typeof row === "object")
          .map((row) => ({
            key: typeof row.key === "string" ? row.key : "",
            videoId: typeof row.videoId === "string" ? row.videoId : "",
            model: typeof row.model === "string" ? row.model : "",
            sourceLang: typeof row.sourceLang === "string" ? row.sourceLang : "",
            targetLang: typeof row.targetLang === "string" ? row.targetLang : "",
            sourceText: typeof row.sourceText === "string" ? row.sourceText : "",
            translation: typeof row.translation === "string" ? row.translation : "",
            updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : 0
          }))
          .sort((left, right) => right.updatedAt - left.updatedAt);
        sendResponse({ ok: true, records: normalized, timedCaptions });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error && error.message ? error.message : "Failed to export translations."
        });
      });

    return true;
  };

  const runtimeApi = globalThis.browser?.runtime || globalThis.chrome?.runtime;
  if (runtimeApi?.onMessage?.addListener) {
    runtimeApi.onMessage.addListener(handleRuntimeMessage);
  }

  onReady(() => {
    init();
    startInitWatchdog();
  });
  window.addEventListener("load", init);
  window.addEventListener("pageshow", init);
  window.addEventListener("yt-navigate-finish", handleNavigation);
  window.addEventListener("popstate", handleNavigation);
})();
