let knownWords = [];
let knownWordSet = new Set();
let interactionSettings = {
  clickAction: "search-reading",
  doubleClickAction: "mark-known",
  overlayColor: "#f87171",
  searchEngine: "google",
  searchKeyword: "読み方",
};
let isSiteEnabled = false;

const clickActionStorageKey = "clickAction";
const doubleClickActionStorageKey = "doubleClickAction";
const overlayColorStorageKey = "overlayColor";
const searchEngineStorageKey = "searchEngine";
const searchKeywordStorageKey = "searchKeyword";
const enabledHostsStorageKey = "enabledHosts";
const defaultClickAction = "search-reading";
const defaultDoubleClickAction = "mark-known";
const defaultOverlayColor = "#f87171";
const defaultSearchKeyword = "読み方";

const highlightName = "vocab-unknown";
const highlightColorVariableName = "--vocab-overlay-color";
const clickDelay = 220;
let tokenizerPromise = null;
let tokenizer = null;
let tokens = [];
let tokenIndex = new WeakMap();
let clickTimer = null;
let cursorFrame = 0;
let cursorIsPointer = false;

async function loadState() {
  const result = await getLocalStorage([
    "knownWords",
    "knownWordsInitialized",
    clickActionStorageKey,
    doubleClickActionStorageKey,
    overlayColorStorageKey,
    searchEngineStorageKey,
    searchKeywordStorageKey,
    enabledHostsStorageKey,
  ]);

  if (result.knownWordsInitialized) {
    setKnownWords(result.knownWords || []);
  } else {
    await setLocalStorage({
      knownWords: defaultKnownWords,
      knownWordsInitialized: true,
    });
    setKnownWords([...defaultKnownWords]);
  }

  interactionSettings = {
    clickAction: result[clickActionStorageKey] || defaultClickAction,
    doubleClickAction:
      result[doubleClickActionStorageKey] || defaultDoubleClickAction,
    overlayColor: result[overlayColorStorageKey] || defaultOverlayColor,
    searchEngine: result[searchEngineStorageKey] || defaultSearchEngine,
    searchKeyword: result[searchKeywordStorageKey] || defaultSearchKeyword,
  };

  const enabledHosts = result[enabledHostsStorageKey] || [];
  isSiteEnabled = enabledHosts.includes(window.location.hostname);
}

function setKnownWords(words) {
  knownWords = words;
  knownWordSet = new Set(words);
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

function shouldProcessTextNode(node) {
  if (!node.parentElement) return false;
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
  const ranges = [];

  document.documentElement.style.setProperty(
    highlightColorVariableName,
    interactionSettings.overlayColor
  );

  tokens.forEach(function (token) {
    if (isKnownToken(token.word, token.basic)) {
      return;
    }

    const range = document.createRange();
    range.setStart(token.node, token.startOffset);
    range.setEnd(token.node, token.endOffset);
    ranges.push(range);
  });

  if (ranges.length === 0) {
    CSS.highlights.delete(highlightName);
    return;
  }

  CSS.highlights.set(highlightName, new Highlight(...ranges));
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

function handleClick(event) {
  if (isEditableTarget(event.target)) {
    return;
  }

  const token = tokenAtPoint(event.clientX, event.clientY);
  if (token === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (clickTimer !== null) {
    clearTimeout(clickTimer);
  }

  clickTimer = window.setTimeout(function () {
    clickTimer = null;
    runAction(interactionSettings.clickAction, token.word);
  }, clickDelay);
}

function handleDoubleClick(event) {
  if (isEditableTarget(event.target)) {
    return;
  }

  const token = tokenAtPoint(event.clientX, event.clientY);
  if (token === null) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  if (clickTimer !== null) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  runAction(interactionSettings.doubleClickAction, token.word);
}

function runAction(action, word) {
  if (action === "mark-known") {
    addToKnownWords(word);
    return;
  }

  openSearch(word);
}

function renderHighlights() {
  tokens = isSiteEnabled && tokenizer !== null ? collectTokens(document.body) : [];
  tokenIndex = buildTokenIndex(tokens);
  applyHighlight();
}

async function addToKnownWords(word) {
  await loadState();
  const words = [...knownWords];
  if (words.includes(word)) {
    return;
  }

  words.push(word);
  await setLocalStorage({ knownWords: words });
  setKnownWords(words);
}

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if (
    !changes.knownWords &&
    !changes[clickActionStorageKey] &&
    !changes[doubleClickActionStorageKey] &&
    !changes[overlayColorStorageKey] &&
    !changes[searchEngineStorageKey] &&
    !changes[searchKeywordStorageKey] &&
    !changes[enabledHostsStorageKey]
  ) {
    return;
  }

  void (async function () {
    await loadState();

    if (changes[enabledHostsStorageKey]) {
      renderHighlights();
      return;
    }

    applyHighlight();
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
document.addEventListener("dblclick", handleDoubleClick, true);
document.addEventListener("pointermove", handlePointerMove, { passive: true });
document.addEventListener("pointerleave", function () {
  setPointerCursor(false);
});

void initializeHighlights();
