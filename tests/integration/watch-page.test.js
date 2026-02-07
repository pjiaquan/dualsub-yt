import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAvailableTracks, selectDualTracks } from "../../src/captions/selector.js";
import { createOverlay } from "../../src/renderer/overlay.js";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const ensureDocument = () => {
  if (typeof document !== "undefined") {
    return;
  }

  const createElement = (tag) => {
    const element = {
      tagName: tag.toUpperCase(),
      style: {},
      className: "",
      children: [],
      textContent: "",
      parentNode: null,
      appendChild(child) {
        child.parentNode = element;
        element.children.push(child);
      },
      removeChild(child) {
        element.children = element.children.filter((item) => item !== child);
        child.parentNode = null;
      }
    };

    element.classList = {
      contains(name) {
        return element.className.split(/\s+/).filter(Boolean).includes(name);
      }
    };

    return element;
  };

  globalThis.document = {
    body: createElement("body"),
    createElement
  };
};

const readFixture = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fixturePath = path.join(__dirname, "..", "fixtures", "youtube-player-response.json");
  const raw = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(raw);
};

const run = () => {
  const playerResponse = readFixture();
  const tracks = getAvailableTracks(playerResponse);
  assert(tracks.length > 0, "expected tracks from fixture");

  const selection = selectDualTracks(tracks, {
    primaryLang: "en",
    secondaryLang: "zh-Hant"
  });
  assert(selection.primary, "expected primary track from fixture");
  assert(selection.secondary, "expected secondary track from fixture");

  ensureDocument();
  const container = document.createElement("div");
  document.body.appendChild(container);

  const overlay = createOverlay(container, {
    fontSize: 20,
    position: "bottom",
    opacity: 0.9,
    lineSpacing: 1.1
  });

  overlay.update("Hello", "World");
  assert(overlay.root.parentNode === container, "overlay not attached to container");
  assert(overlay.primaryLine.textContent === "Hello", "primary text not set");
  assert(overlay.secondaryLine.textContent === "World", "secondary text not set");

  overlay.destroy();
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }
};

export { run };
