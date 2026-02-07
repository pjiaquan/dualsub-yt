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

const applySettings = (overlay, settings) => {
  if (!overlay || !settings) {
    return;
  }

  const { root, primaryLine, secondaryLine } = overlay;
  const fontSize = settings.fontSize ? `${settings.fontSize}px` : "24px";
  const lineSpacing = settings.lineSpacing ? settings.lineSpacing : 1.1;
  const opacity = settings.opacity ? settings.opacity : 0.9;

  root.style.opacity = `${opacity}`;
  root.style.bottom = settings.position === "top" ? "unset" : "8%";
  root.style.top = settings.position === "top" ? "8%" : "unset";
  primaryLine.style.fontSize = fontSize;
  secondaryLine.style.fontSize = fontSize;
  root.style.gap = `${Math.max(0, (lineSpacing - 1) * 16)}px`;
};

const createOverlay = (container, settings) => {
  if (!container) {
    throw new Error("Overlay container is required");
  }

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

export { createOverlay, applySettings };
