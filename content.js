let knownWords = [];

const unknownWorkdClassName = "vocab-unknown";

function loadKnownWords(callback) {
  chrome.storage.local.get(["knownWords"], function (result) {
    knownWords = result.knownWords || [];
    if (callback) callback();
  });
}

function isKnownWord(word) {
  return knownWords.includes(word);
}

function highlightUnknownWords() {
  const highlightedElements = document.querySelectorAll(
    `.${unknownWorkdClassName}`
  );
  highlightedElements.forEach((el) => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    }
  });

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (!node.parentElement) return NodeFilter.FILTER_REJECT;
        const tagName = node.parentElement.tagName;
        if (
          tagName === "SCRIPT" ||
          tagName === "STYLE" ||
          tagName === "NOSCRIPT" ||
          tagName === "IFRAME"
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        if (node.parentElement.classList.contains("vocab-unknown")) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const nodesToProcess = [];
  let node;
  let nodeCount = 0;
  const MAX_NODES = 5000;

  while ((node = walker.nextNode()) && nodeCount < MAX_NODES) {
    nodesToProcess.push(node);
    nodeCount++;
  }

  const BATCH_SIZE = 50;
  let currentIndex = 0;

  function processBatch() {
    const endIndex = Math.min(currentIndex + BATCH_SIZE, nodesToProcess.length);

    for (let i = currentIndex; i < endIndex; i++) {
      processTextNode(nodesToProcess[i]);
    }

    currentIndex = endIndex;

    if (currentIndex < nodesToProcess.length) {
      if (window.requestIdleCallback) {
        requestIdleCallback(processBatch, { timeout: 1000 });
      } else {
        setTimeout(processBatch, 0);
      }
    }
  }

  processBatch();
}

function processTextNode(textNode) {
  if (!textNode.parentNode) return;
  const text = textNode.textContent;
  const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  const segments = segmenter.segment(text);
  const words = Array.from(segments, (segment) => segment.segment);
  if (!words) return;
  console.log(words);

  let hasUnknown = false;
  for (let word of words) {
    if (!isKnownWord(word)) {
      hasUnknown = true;
      break;
    }
  }

  if (!hasUnknown) return;

  const fragment = document.createDocumentFragment();

  for (let word of words) {
    if (isKnownWord(word) || !word.trim().replace(/[\x00-\x7F]/g, "")) {
      fragment.appendChild(document.createTextNode(word));
    } else {
      const span = document.createElement("span");
      span.className = "vocab-unknown";
      span.textContent = word;
      span.style.cursor = "pointer";
      span.title = "点击标记为已认识";
      span.addEventListener("click", function (e) {
        e.preventDefault();
        addToKnownWords(word);
      });
      fragment.appendChild(span);
    }
  }

  if (textNode.parentNode) {
    textNode.parentNode.replaceChild(fragment, textNode);
  }
}

function addToKnownWords(word) {
  chrome.storage.local.get(["knownWords"], function (result) {
    const words = result.knownWords || [];
    if (!words.includes(word)) {
      words.push(word);
      chrome.storage.local.set({ knownWords: words }, function () {
        knownWords = words;
        highlightUnknownWords();
      });
    }
  });
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "updateHighlight") {
    loadKnownWords(highlightUnknownWords);
  }
});

loadKnownWords(function () {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", highlightUnknownWords);
  } else {
    highlightUnknownWords();
  }
});

const observer = new MutationObserver(function (mutations) {
  let shouldUpdate = false;
  mutations.forEach(function (mutation) {
    if (mutation.addedNodes.length > 0) {
      shouldUpdate = true;
    }
  });
  if (shouldUpdate) {
    highlightUnknownWords();
  }
});
