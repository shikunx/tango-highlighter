let knownWordSet = new Set();
let interactionSettings = {
  overlayColor: "#f87171",
  searchEngine: "google",
  searchKeyword: "読み方",
};
let isSiteEnabled = false;

const overlayColorStorageKey = "overlayColor";
const searchEngineStorageKey = "searchEngine";
const searchKeywordStorageKey = "searchKeyword";
const enabledHostsStorageKey = "enabledHosts";
const defaultOverlayColor = "#f87171";
const defaultSearchKeyword = "読み方";

const highlightNames = ["vocab-unknown-a", "vocab-unknown-b"];
const highlightColorVariableName = "--vocab-overlay-color";
const bubbleGap = 8;
const bubbleViewportPadding = 8;
let tokenizerPromise = null;
let tokenizer = null;
let tokens = [];
let tokenIndex = new WeakMap();
let cursorFrame = 0;
let cursorIsPointer = false;
let bubbleHost = null;
let bubbleElement = null;
let bubbleToken = null;
let bubbleRange = null;
let bubbleFrame = 0;

async function loadState() {
  const result = await getLocalStorage([
    "knownWords",
    "knownWordsInitialized",
    overlayColorStorageKey,
    searchEngineStorageKey,
    searchKeywordStorageKey,
    enabledHostsStorageKey,
  ]);

  if (result.knownWordsInitialized) {
    const stored = result.knownWords;
    let text = typeof stored === "string" ? stored : "";
    // One-time migration from the old string-array format.
    if (Array.isArray(stored)) {
      text = stored.join("\n");
      await setLocalStorage({ knownWords: text });
    }
    setKnownWords(text);
  } else {
    await setLocalStorage({
      knownWords: defaultKnownWords,
      knownWordsInitialized: true,
    });
    setKnownWords(defaultKnownWords);
  }

  interactionSettings = {
    overlayColor: result[overlayColorStorageKey] || defaultOverlayColor,
    searchEngine: result[searchEngineStorageKey] || defaultSearchEngine,
    searchKeyword: result[searchKeywordStorageKey] || defaultSearchKeyword,
  };

  const enabledHosts = result[enabledHostsStorageKey] || [];
  isSiteEnabled = enabledHosts.includes(window.location.hostname);
}

function setKnownWords(text) {
  knownWordSet = new Set(text ? text.split("\n") : []);
}

function isKnownToken(surface, basic) {
  if (knownWordSet.has(surface)) {
    return true;
  }

  // Kuromoji emits "*" as basic_form for tokens without a dictionary form,
  // so only consult it for inflected words.
  return Boolean(basic) && basic !== "*" && knownWordSet.has(basic);
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
    tagName === "IFRAME" ||
    tagName === "RT" ||
    tagName === "RP"
  );
}

// Aozora pages declare no lang at all, so an undeclared context stays eligible.
// Only an explicit, different language is a reason to skip.
function isJapaneseLangContext(element) {
  const holder = element.closest("[lang]");
  if (holder === null) {
    return true;
  }

  const lang = holder.getAttribute("lang").trim();
  if (lang === "") {
    return true;
  }

  return /^ja($|-)/i.test(lang);
}

function shouldProcessTextNode(node) {
  if (!node.parentElement) return false;
  if (isIgnorableElement(node.parentElement)) return false;
  if (!isJapaneseLangContext(node.parentElement)) return false;
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

function getTokenizer() {
  if (tokenizerPromise === null) {
    tokenizerPromise = (async function () {
      const vibrato = await import(chrome.runtime.getURL("vendor/vibrato/pkg/vibrato_wasm.js"));
      const wasmResponse = await fetch(chrome.runtime.getURL("vendor/vibrato/pkg/vibrato_wasm_bg.wasm"));
      if (!wasmResponse.ok) {
        throw new Error(`Failed to fetch wasm, status: ${wasmResponse.status}`);
      }
      await vibrato.default(await wasmResponse.arrayBuffer());

      const dictResponse = await fetch(chrome.runtime.getURL("vendor/vibrato/dict/system.dic.zst"));
      if (!dictResponse.ok) {
        throw new Error(`Failed to fetch dictionary, status: ${dictResponse.status}`);
      }
      const dictBytes = new Uint8Array(await dictResponse.arrayBuffer());
      const rawTokenizer = vibrato.Vibrato.from_zstd(dictBytes);
      tokenizer = {
        tokenize: function (text) {
          return rawTokenizer.tokenize(text).map(function (token) {
            // IPADIC feature CSV column 7 is the base form; unknown words carry "*".
            const parts = token.feature.split(",");
            return {
              segment: token.surface,
              basic: parts.length > 6 ? parts[6] : "*",
            };
          });
        },
      };
      return tokenizer;
    })();
  }

  return tokenizerPromise;
}

function collectTokens(root) {
  const textNodes = collectTextNodes(root);
  const collected = [];

  textNodes.forEach(function (textNode) {
    const text = textNode.textContent;
    const segments = tokenizer.tokenize(text);
    let currentOffset = 0;

    for (const segment of segments) {
      const word = segment.segment;
      const basic = segment.basic;
      const startOffset = currentOffset;
      const endOffset = startOffset + word.length;
      currentOffset = endOffset;

      if (!word.trim()) {
        continue;
      }

      if (!isJapaneseWord(word)) {
        continue;
      }

      collected.push({
        word: word,
        basic: basic,
        node: textNode,
        startOffset: startOffset,
        endOffset: endOffset,
      });
    }
  });

  return collected;
}

function buildTokenIndex(collected) {
  const index = new WeakMap();

  collected.forEach(function (token) {
    const nodeTokens = index.get(token.node);
    if (nodeTokens) {
      nodeTokens.push(token);
      return;
    }

    index.set(token.node, [token]);
  });

  return index;
}

function applyHighlight() {
  const groups = [[], []];

  document.documentElement.style.setProperty(
    highlightColorVariableName,
    interactionSettings.overlayColor
  );

  // Tints alternate by the index across all tokens, not just unknown ones:
  // indexing only unknown words shifts every later tint whenever a word is
  // marked known, repainting the whole page. Two directly adjacent unknown
  // tokens have no room for another token between them, so their indexes
  // always differ by one and their tints always differ.
  let tokenOrdinal = 0;
  tokens.forEach(function (token) {
    const unknown = !isKnownToken(token.word, token.basic);

    if (unknown) {
      const range = document.createRange();
      range.setStart(token.node, token.startOffset);
      range.setEnd(token.node, token.endOffset);
      groups[tokenOrdinal % groups.length].push(range);
    }

    tokenOrdinal += 1;
  });

  highlightNames.forEach(function (name, groupIndex) {
    const ranges = groups[groupIndex];

    if (ranges.length === 0) {
      CSS.highlights.delete(name);
      return;
    }

    CSS.highlights.set(name, new Highlight(...ranges));
  });
}

function openSearch(word) {
  const queryText = `${word} ${interactionSettings.searchKeyword}`.trim();
  const query = encodeURIComponent(queryText);
  const searchUrl = buildSearchEngineUrl(interactionSettings.searchEngine, query);
  window.open(searchUrl, "_blank");
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable]"));
}

function tokenAtPoint(x, y) {
  if (typeof document.caretPositionFromPoint !== "function") {
    return null;
  }

  const position = document.caretPositionFromPoint(x, y);
  if (!position || position.offsetNode.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const nodeTokens = tokenIndex.get(position.offsetNode);
  if (!nodeTokens) {
    return null;
  }

  // A caret on the right half of a character lands after it, so the previous
  // offset also has to be tried before deciding the click missed.
  const offsets = [position.offset, position.offset - 1];
  for (const offset of offsets) {
    const token = nodeTokens.find(function (candidate) {
      return (
        offset >= candidate.startOffset &&
        offset < candidate.endOffset &&
        !isKnownToken(candidate.word, candidate.basic)
      );
    });

    if (token) {
      return token;
    }
  }

  return null;
}

function setPointerCursor(enabled) {
  if (enabled === cursorIsPointer) {
    return;
  }

  cursorIsPointer = enabled;
  document.documentElement.style.cursor = enabled ? "pointer" : "";
}

function handlePointerMove(event) {
  if (cursorFrame !== 0) {
    return;
  }

  const x = event.clientX;
  const y = event.clientY;

  cursorFrame = requestAnimationFrame(function () {
    cursorFrame = 0;
    setPointerCursor(tokenAtPoint(x, y) !== null);
  });
}

function ensureBubble() {
  if (bubbleHost !== null) {
    return;
  }

  bubbleHost = document.createElement("div");
  bubbleHost.style.cssText =
    "all: initial; position: fixed; top: 0; left: 0; z-index: 2147483647;";

  // Styles live in a shadow root so page rules cannot restyle the bubble.
  const shadow = bubbleHost.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .bubble { display: flex; gap: 4px; padding: 4px; border-radius: 4px; background: #222; }
    .bubble[hidden] { display: none; }
    button { min-height: 40px; padding: 0 12px; border: 0; border-radius: 4px; background: transparent; color: #fff; font: 16px sans-serif; cursor: pointer; white-space: nowrap; }
    button:active { background: rgba(255, 255, 255, 0.18); }
  `;

  bubbleElement = document.createElement("div");
  bubbleElement.className = "bubble";
  bubbleElement.hidden = true;

  [
    ["search", "Search"],
    ["mark-known", "Mark as known"],
  ].forEach(function (entry) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = entry[0];
    button.textContent = entry[1];
    bubbleElement.appendChild(button);
  });

  bubbleElement.addEventListener("click", handleBubbleClick);
  shadow.append(style, bubbleElement);
}

function handleBubbleClick(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const token = bubbleToken;
  hideWordBubble();

  if (token === null) {
    return;
  }

  if (button.dataset.action === "mark-known") {
    addToKnownWords(token.word);
    return;
  }

  openSearch(token.word);
}

function showWordBubble(token) {
  ensureBubble();

  bubbleToken = token;
  bubbleRange = document.createRange();
  bubbleRange.setStart(token.node, token.startOffset);
  bubbleRange.setEnd(token.node, token.endOffset);

  if (bubbleHost.parentNode === null) {
    document.body.append(bubbleHost);
  }

  bubbleElement.hidden = false;
  placeBubble();
}

function hideWordBubble() {
  bubbleToken = null;
  bubbleRange = null;

  if (bubbleElement !== null) {
    bubbleElement.hidden = true;
  }
}

function placeBubble() {
  if (bubbleRange === null) {
    return;
  }

  const rects = Array.from(bubbleRange.getClientRects()).filter(function (rect) {
    return rect.width > 0 && rect.height > 0;
  });

  if (rects.length === 0) {
    hideWordBubble();
    return;
  }

  const first = rects[0];
  const last = rects[rects.length - 1];
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  if (
    last.bottom < 0 ||
    first.top > viewportHeight ||
    last.right < 0 ||
    first.left > viewportWidth
  ) {
    hideWordBubble();
    return;
  }

  const width = bubbleElement.offsetWidth;
  const height = bubbleElement.offsetHeight;
  let left = last.left + last.width / 2 - width / 2;
  let top = last.bottom + bubbleGap;

  if (top + height > viewportHeight - bubbleViewportPadding) {
    top = first.top - bubbleGap - height;
  }

  left = Math.min(
    Math.max(left, bubbleViewportPadding),
    viewportWidth - width - bubbleViewportPadding
  );
  top = Math.min(
    Math.max(top, bubbleViewportPadding),
    viewportHeight - height - bubbleViewportPadding
  );

  bubbleHost.style.left = `${left}px`;
  bubbleHost.style.top = `${top}px`;
}

function scheduleBubblePlacement() {
  if (bubbleRange === null || bubbleFrame !== 0) {
    return;
  }

  bubbleFrame = requestAnimationFrame(function () {
    bubbleFrame = 0;
    placeBubble();
  });
}

function handleClick(event) {
  if (bubbleHost !== null && event.composedPath().includes(bubbleHost)) {
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  const token = tokenAtPoint(event.clientX, event.clientY);
  if (token === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  showWordBubble(token);
}

function handleOutsidePointerDown(event) {
  if (bubbleRange === null) {
    return;
  }

  if (bubbleHost !== null && event.composedPath().includes(bubbleHost)) {
    return;
  }

  hideWordBubble();
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    hideWordBubble();
  }
}

function renderHighlights() {
  hideWordBubble();
  tokens = isSiteEnabled && tokenizer !== null ? collectTokens(document.body) : [];
  tokenIndex = buildTokenIndex(tokens);
  applyHighlight();
}

async function addToKnownWords(word) {
  await loadState();
  if (knownWordSet.has(word)) {
    return;
  }

  knownWordSet.add(word);
  const words = Array.from(knownWordSet).join("\n");
  await setLocalStorage({ knownWords: words });
}

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if (
    !changes.knownWords &&
    !changes[overlayColorStorageKey] &&
    !changes[searchEngineStorageKey] &&
    !changes[searchKeywordStorageKey] &&
    !changes[enabledHostsStorageKey]
  ) {
    return;
  }

  void (async function () {
    await loadState();
    // Re-collect on every change: cached offsets go stale once the page edits
    // its own text, and a stale offset throws when the range is rebuilt.
    renderHighlights();
  })();
});

async function initializeHighlights() {
  if (!("highlights" in CSS) || typeof Highlight !== "function") {
    return;
  }

  await loadState();

  try {
    await getTokenizer();
  } catch (error) {
    console.error("Failed to initialize tokenizer:", error);
    return;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderHighlights);
  } else {
    renderHighlights();
  }
}

document.addEventListener("click", handleClick, true);
document.addEventListener("pointerdown", handleOutsidePointerDown, true);
document.addEventListener("keydown", handleKeyDown);
document.addEventListener("pointermove", handlePointerMove, { passive: true });
document.addEventListener("pointerleave", function () {
  setPointerCursor(false);
});
// Capture phase so scrolling inside nested containers also repositions the bubble.
document.addEventListener("scroll", scheduleBubblePlacement, {
  capture: true,
  passive: true,
});
window.addEventListener("resize", scheduleBubblePlacement, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", scheduleBubblePlacement, {
    passive: true,
  });
  window.visualViewport.addEventListener("scroll", scheduleBubblePlacement, {
    passive: true,
  });
}

void initializeHighlights();
