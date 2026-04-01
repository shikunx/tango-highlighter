let knownWords = [];
let interactionSettings = {
  clickAction: "search-reading",
  doubleClickAction: "mark-known",
  overlayColor: "#f87171",
};
let isSiteEnabled = false;

const clickActionStorageKey = "clickAction";
const doubleClickActionStorageKey = "doubleClickAction";
const overlayColorStorageKey = "overlayColor";
const enabledHostsStorageKey = "enabledHosts";
const defaultClickAction = "search-reading";
const defaultDoubleClickAction = "mark-known";
const defaultOverlayColor = "#f87171";

const unknownWordClassName = "vocab-unknown";
const overlayClassName = "vocab-overlay";
const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

function loadKnownWords(callback) {
  chrome.storage.local.get(["knownWords", "knownWordsInitialized"], function (result) {
    if (result.knownWordsInitialized) {
      knownWords = result.knownWords || [];
      if (callback) callback();
      return;
    }

    chrome.storage.local.set(
      {
        knownWords: defaultKnownWords,
        knownWordsInitialized: true,
      },
      function () {
        knownWords = [...defaultKnownWords];
        if (callback) callback();
      }
    );
  });
}

function loadInteractionSettings(callback) {
  chrome.storage.local.get(
    [clickActionStorageKey, doubleClickActionStorageKey, overlayColorStorageKey],
    function (result) {
      interactionSettings = {
        clickAction: result[clickActionStorageKey] || defaultClickAction,
        doubleClickAction:
          result[doubleClickActionStorageKey] || defaultDoubleClickAction,
        overlayColor: result[overlayColorStorageKey] || defaultOverlayColor,
      };
      if (callback) callback();
    }
  );
}

function loadSiteEnabledState(callback) {
  chrome.storage.local.get([enabledHostsStorageKey], function (result) {
    const enabledHosts = result[enabledHostsStorageKey] || [];
    isSiteEnabled = enabledHosts.includes(window.location.hostname);
    if (callback) callback();
  });
}

function isKnownWord(word) {
  return knownWords.includes(word);
}

function isJapaneseWord(word) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(word);
}

function isIgnorableElement(element) {
  const tagName = element.tagName;
  return (
    tagName === "SCRIPT" ||
    tagName === "STYLE" ||
    tagName === "NOSCRIPT" ||
    tagName === "IFRAME"
  );
}

function shouldProcessTextNode(node) {
  if (!node.parentElement) return false;
  if (node.parentElement.closest(`.${overlayClassName}`)) return false;
  if (isIgnorableElement(node.parentElement)) return false;
  if (!node.textContent.trim()) return false;
  return true;
}

function collectTextNodes(root) {
  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      return shouldProcessTextNode(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  return textNodes;
}

function collectUnknownTokens(root) {
  const textNodes = collectTextNodes(root);
  const tokens = [];

  textNodes.forEach(function (textNode) {
    const text = textNode.textContent;
    const segments = segmenter.segment(text);
    let currentOffset = 0;

    for (const segment of segments) {
      const word = segment.segment;
      const startOffset = currentOffset;
      const endOffset = startOffset + word.length;
      currentOffset = endOffset;

      if (!word.trim()) {
        continue;
      }

      if (!isJapaneseWord(word)) {
        continue;
      }

      if (isKnownWord(word)) {
        continue;
      }

      tokens.push({
        word: word,
        node: textNode,
        startOffset: startOffset,
        endOffset: endOffset,
      });
    }
  });

  return tokens;
}

function removeOverlay() {
  const existingOverlay = document.querySelector(`.${overlayClassName}`);
  if (existingOverlay) {
    existingOverlay.remove();
  }
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.className = overlayClassName;
  overlay.style.setProperty("--vocab-overlay-color", interactionSettings.overlayColor);
  document.body.appendChild(overlay);
  return overlay;
}

function openGoogleSearch(word) {
  window.open(
    `https://www.google.com/search?q=${encodeURIComponent(`${word} 読み方`)}`,
    "_blank"
  );
}

function getActionLabel(action, word) {
  if (action === "mark-known") {
    return `mark \"${word}\" as known`;
  }

  return "search reading";
}

function runAction(action, word) {
  if (action === "mark-known") {
    addToKnownWords(word);
    return;
  }

  openGoogleSearch(word);
}

function createHighlightBoxes(token, overlay) {
  const range = document.createRange();
  range.setStart(token.node, token.startOffset);
  range.setEnd(token.node, token.endOffset);

  const rects = Array.from(range.getClientRects());
  rects.forEach(function (rect) {
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const box = document.createElement("button");
    let clickTimer = null;
    box.type = "button";
    box.className = unknownWordClassName;
    box.dataset.word = token.word;
    box.style.left = `${window.scrollX + rect.left}px`;
    box.style.top = `${window.scrollY + rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    box.title = `Click: ${getActionLabel(
      interactionSettings.clickAction,
      token.word
    )} | Double-click: ${getActionLabel(
      interactionSettings.doubleClickAction,
      token.word
    )}`;
    box.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (clickTimer !== null) {
        clearTimeout(clickTimer);
      }

      clickTimer = window.setTimeout(function () {
        clickTimer = null;
        runAction(interactionSettings.clickAction, token.word);
      }, 220);
    });
    box.addEventListener("dblclick", function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }

      runAction(interactionSettings.doubleClickAction, token.word);
    });
    overlay.appendChild(box);
  });
}

function renderHighlights() {
  removeOverlay();

  if (!isSiteEnabled) {
    return;
  }

  const overlay = createOverlay();
  const tokens = collectUnknownTokens(document.body);

  tokens.forEach(function (token) {
    createHighlightBoxes(token, overlay);
  });
}

function addToKnownWords(word) {
  loadKnownWords(function () {
    const words = [...knownWords];
    if (words.includes(word)) {
      return;
    }

    words.push(word);
    chrome.storage.local.set({ knownWords: words }, function () {
      knownWords = words;
      renderHighlights();
    });
  });
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "updateHighlight") {
    loadKnownWords(function () {
      loadInteractionSettings(function () {
        loadSiteEnabledState(renderHighlights);
      });
    });
  }
});

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if (
    !changes.knownWords &&
    !changes[clickActionStorageKey] &&
    !changes[doubleClickActionStorageKey] &&
    !changes[overlayColorStorageKey] &&
    !changes[enabledHostsStorageKey]
  ) {
    return;
  }

  loadKnownWords(function () {
    loadInteractionSettings(function () {
      loadSiteEnabledState(renderHighlights);
    });
  });
});

function initializeHighlights() {
  loadKnownWords(function () {
    loadInteractionSettings(function () {
      loadSiteEnabledState(function () {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", renderHighlights);
        } else {
          renderHighlights();
        }
      });
    });
  });
}

initializeHighlights();

window.addEventListener("resize", renderHighlights);
window.addEventListener("scroll", renderHighlights, { passive: true });
