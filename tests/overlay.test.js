import { createOverlay, applySettings } from "../src/renderer/overlay.js";

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

const setupDom = () => {
  ensureDocument();
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
};

const teardownDom = (container) => {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
};

const run = () => {
  const container = setupDom();
  const overlay = createOverlay(container, {
    fontSize: 22,
    position: "bottom",
    opacity: 0.8,
    lineSpacing: 1.2
  });

  assert(overlay.root.classList.contains("dualsub-overlay"), "overlay root missing class");
  assert(overlay.primaryLine.classList.contains("dualsub-line"), "primary line missing class");
  assert(overlay.secondaryLine.classList.contains("dualsub-line"), "secondary line missing class");

  overlay.update("Hello", "World");
  assert(overlay.primaryLine.textContent === "Hello", "primary text not updated");
  assert(overlay.secondaryLine.textContent === "World", "secondary text not updated");

  applySettings(overlay, { fontSize: 18, position: "top", opacity: 0.5, lineSpacing: 1.0 });
  assert(overlay.root.style.top !== "", "top position not applied");

  overlay.destroy();
  teardownDom(container);
};

export { run };
