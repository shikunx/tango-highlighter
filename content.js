let knownWords = [];
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

const unknownWordClassName = "vocab-unknown";
const overlayClassName = "vocab-overlay";
let tokenizerPromise = null;
let tokenizer = null;

async function loadKnownWords() {
  const result = await getLocalStorage(["knownWords", "knownWordsInitialized"]);
  if (result.knownWordsInitialized) {
    knownWords = result.knownWords || [];
    return;
  }

  await setLocalStorage({
    knownWords: defaultKnownWords,
    knownWordsInitialized: true,
  });
  knownWords = [...defaultKnownWords];
}

async function loadInteractionSettings() {
  const result = await getLocalStorage([
    clickActionStorageKey,
    doubleClickActionStorageKey,
    overlayColorStorageKey,
    searchEngineStorageKey,
    searchKeywordStorageKey,
  ]);

  interactionSettings = {
    clickAction: result[clickActionStorageKey] || defaultClickAction,
    doubleClickAction:
      result[doubleClickActionStorageKey] || defaultDoubleClickAction,
    overlayColor: result[overlayColorStorageKey] || defaultOverlayColor,
    searchEngine: result[searchEngineStorageKey] || defaultSearchEngine,
    searchKeyword: result[searchKeywordStorageKey] || defaultSearchKeyword,
  };
}

async function loadSiteEnabledState() {
  const result = await getLocalStorage([enabledHostsStorageKey]);
  const enabledHosts = result[enabledHostsStorageKey] || [];
  isSiteEnabled = enabledHosts.includes(window.location.hostname);
}

function isKnownToken(surface, basic) {
  if (knownWords.includes(surface)) {
    return true;
  }

  // Kuromoji emits "*" as basic_form for tokens without a dictionary form,
  // so only consult it for inflected words.
  return Boolean(basic) && basic !== "*" && knownWords.includes(basic);
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

function getTokenizer() {
  if (tokenizerPromise === null) {
    tokenizerPromise = (async function () {
      const kuromoji = await import(chrome.runtime.getURL("vendor/kuromoji/build/index.mjs"));
      const loader = {
        loadArrayBuffer: async function (filename) {
          const response = await fetch(chrome.runtime.getURL(`vendor/kuromoji/dict/${filename}`));
          if (!response.ok) {
            throw new Error(`Failed to fetch ${filename}, status: ${response.status}`);
          }
          const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
          return new Response(decompressed).arrayBuffer();
        },
      };
      tokenizer = await new kuromoji.TokenizerBuilder({ loader: loader }).build();
      return tokenizer;
    })();
  }

  return tokenizerPromise;
}

function collectUnknownTokens(root) {
  const textNodes = collectTextNodes(root);
  const tokens = [];

  textNodes.forEach(function (textNode) {
    const text = textNode.textContent;
    const segments = tokenizer.tokenize(text).map(function (item) {
      return {
        segment: item.surface_form,
        basic: item.basic_form,
      };
    });
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

      if (isKnownToken(word, basic)) {
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

function openSearch(word) {
  const queryText = `${word} ${interactionSettings.searchKeyword}`.trim();
  const query = encodeURIComponent(queryText);
  const searchUrl = buildSearchEngineUrl(interactionSettings.searchEngine, query);
  window.open(searchUrl, "_blank");
}

function getActionLabel(action, word) {
  if (action === "mark-known") {
    return `mark \"${word}\" as known`;
  }

  return `search \"${interactionSettings.searchKeyword}\" with ${getSearchEngineLabel(
    interactionSettings.searchEngine
  )}`;
}

function runAction(action, word) {
  if (action === "mark-known") {
    addToKnownWords(word);
    return;
  }

  openSearch(word);
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
    box.addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    box.dataset.searchEngine = interactionSettings.searchEngine;
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

let renderGeneration = 0;

async function renderHighlights() {
  const generation = ++renderGeneration;

  removeOverlay();

  if (!isSiteEnabled || tokenizer === null) {
    return;
  }

  const overlay = createOverlay();
  const tokens = collectUnknownTokens(document.body);
  const BATCH_SIZE = 20;

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    // A newer render supersedes this one mid-batch; stop appending to the stale overlay.
    if (generation !== renderGeneration) {
      return;
    }

    const batch = tokens.slice(i, i + BATCH_SIZE);
    await new Promise(function (resolve) {
      requestAnimationFrame(function () {
        batch.forEach(function (token) {
          createHighlightBoxes(token, overlay);
        });
        resolve();
      });
    });
    if (globalThis.scheduler?.yield) {
      await scheduler.yield();
    }
  }
}

async function addToKnownWords(word) {
  await loadKnownWords();
  const words = [...knownWords];
  if (words.includes(word)) {
    return;
  }

  words.push(word);
  await setLocalStorage({ knownWords: words });
  knownWords = words;
  renderHighlights();
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "updateHighlight") {
    void (async function () {
      await loadKnownWords();
      await loadInteractionSettings();
      await loadSiteEnabledState();
      renderHighlights();
    })();
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
    !changes[searchEngineStorageKey] &&
    !changes[searchKeywordStorageKey] &&
    !changes[enabledHostsStorageKey]
  ) {
    return;
  }

  void (async function () {
    await loadKnownWords();
    await loadInteractionSettings();
    await loadSiteEnabledState();
    renderHighlights();
  })();
});

async function initializeHighlights() {
  await loadKnownWords();
  await loadInteractionSettings();
  await loadSiteEnabledState();
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

void initializeHighlights();

let renderScheduled = false;

function scheduleRenderHighlights() {
  if (renderScheduled) {
    return;
  }

  renderScheduled = true;
  requestAnimationFrame(function () {
    renderScheduled = false;
    void renderHighlights();
  });
}

window.addEventListener("resize", scheduleRenderHighlights);
