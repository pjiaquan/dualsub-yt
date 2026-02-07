import {
  getAvailableTracks,
  selectDualTracks,
  normalizeLanguageCode,
  toLanguageGroup
} from "../src/captions/selector.js";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = () => {
  const playerResponse = {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            languageCode: "en",
            kind: "asr",
            baseUrl: "https://example.com/en-auto",
            isTranslatable: true
          },
          {
            languageCode: "zh-Hant",
            kind: "asr",
            baseUrl: "https://example.com/zh-hant-auto"
          },
          {
            languageCode: "en",
            baseUrl: "https://example.com/en-manual"
          }
        ]
      }
    }
  };

  const tracks = getAvailableTracks(playerResponse);
  assert(tracks.length === 3, "expected 3 tracks");

  const selection = selectDualTracks(tracks, {
    primaryLang: "en",
    secondaryLang: "zh-Hant"
  });
  assert(selection.primary && selection.primary.baseUrl.includes("en-auto"), "primary should be auto en");
  assert(
    selection.secondary && selection.secondary.baseUrl.includes("zh-hant-auto"),
    "secondary should be auto zh-hant"
  );

  const fallbackSelection = selectDualTracks(tracks, {
    primaryLang: "en",
    secondaryLang: "fr"
  });
  assert(fallbackSelection.primary, "primary should still be selected");
  assert(fallbackSelection.secondary, "secondary should use translation fallback");
  assert(
    fallbackSelection.secondary.baseUrl.includes("tlang=fr"),
    "secondary should include translation param"
  );

  const fallbackTracks = tracks.filter((track) => track.languageCode !== "zh-hant");
  const fallbackCaseSelection = selectDualTracks(fallbackTracks, {
    primaryLang: "en",
    secondaryLang: "zh-Hant"
  });
  assert(fallbackCaseSelection.secondary, "secondary should use translation fallback");
  assert(
    fallbackCaseSelection.secondary.baseUrl.includes("tlang=zh-Hant"),
    "secondary should preserve canonical zh-Hant casing"
  );

  const missingTranslatableFlagTracks = getAvailableTracks({
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          {
            languageCode: "en",
            kind: "asr",
            baseUrl: "https://example.com/en-auto-no-flag"
          }
        ]
      }
    }
  });
  const missingTranslatableFlagSelection = selectDualTracks(missingTranslatableFlagTracks, {
    primaryLang: "en",
    secondaryLang: "zh-Hant"
  });
  assert(missingTranslatableFlagSelection.primary, "primary should be selected when translatable flag missing");
  assert(
    missingTranslatableFlagSelection.secondary &&
      missingTranslatableFlagSelection.secondary.baseUrl.includes("tlang=zh-Hant"),
    "secondary should fallback to translated zh-Hant when translatable flag missing"
  );

  assert(normalizeLanguageCode("ZH_Hant") === "zh-hant", "normalize language code failed");
  assert(toLanguageGroup("zh-TW") === "zh-hant", "traditional code should map to zh-hant");
};

export { run };
