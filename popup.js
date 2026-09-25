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

let currentTabHost = null;

async function loadStoredWords() {
  const result = await getLocalStorage(["knownWords", "knownWordsInitialized"]);
  if (result.knownWordsInitialized) {
    return result.knownWords || [];
  }

  await setLocalStorage({
    knownWords: defaultKnownWords,
    knownWordsInitialized: true,
  });
  return [...defaultKnownWords];
}

async function loadInteractionSettings() {
  const result = await getLocalStorage([
    clickActionStorageKey,
    doubleClickActionStorageKey,
    overlayColorStorageKey,
    searchEngineStorageKey,
    searchKeywordStorageKey,
  ]);

  return {
    clickAction: result[clickActionStorageKey] || defaultClickAction,
    doubleClickAction:
      result[doubleClickActionStorageKey] || defaultDoubleClickAction,
    overlayColor: result[overlayColorStorageKey] || defaultOverlayColor,
    searchEngine: result[searchEngineStorageKey] || defaultSearchEngine,
    searchKeyword: result[searchKeywordStorageKey] || defaultSearchKeyword,
  };
}

function renderSearchEngineOptions() {
  const searchEngineSelect = document.getElementById("searchEngine");
  searchEngineSelect.innerHTML = "";

  searchEngineOptions.forEach(function (option) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    searchEngineSelect.appendChild(optionElement);
  });
}

async function loadEnabledHosts() {
  const result = await getLocalStorage([enabledHostsStorageKey]);
  return result[enabledHostsStorageKey] || [];
}

async function loadCurrentSite() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.url) {
      document.getElementById("siteStatus").textContent = "Current site: unavailable";
      document.getElementById("toggleSiteBtn").disabled = true;
      return;
    }

    const url = new URL(activeTab.url);
    if (!url.hostname) {
      document.getElementById("siteStatus").textContent = "Current site: unsupported";
      document.getElementById("toggleSiteBtn").disabled = true;
      return;
    }

    currentTabHost = url.hostname;
    document.getElementById("siteStatus").textContent = `Current site: ${currentTabHost}`;
    document.getElementById("toggleSiteBtn").disabled = false;

    const enabledHosts = await loadEnabledHosts();
    updateSiteToggleButton(enabledHosts.includes(currentTabHost));
}

function updateSiteToggleButton(isEnabled) {
  document.getElementById("toggleSiteBtn").textContent = isEnabled
    ? "Disable on this site"
    : "Enable on this site";
}

async function toggleCurrentSite() {
  if (!currentTabHost) {
    return;
  }

  const enabledHosts = await loadEnabledHosts();
  const isEnabled = enabledHosts.includes(currentTabHost);
  const nextHosts = isEnabled
    ? enabledHosts.filter(function (host) {
        return host !== currentTabHost;
      })
    : [...enabledHosts, currentTabHost];

  await setLocalStorage({ [enabledHostsStorageKey]: nextHosts });
  updateSiteToggleButton(!isEnabled);
}

async function saveInteractionSettings() {
  const clickAction = document.getElementById("clickAction").value;
  const doubleClickAction = document.getElementById("doubleClickAction").value;
  const overlayColor = document.getElementById("overlayColor").value;
  const searchEngine = document.getElementById("searchEngine").value;
  const searchKeyword = document.getElementById("searchKeyword").value.trim();

  await setLocalStorage({
    [clickActionStorageKey]: clickAction,
    [doubleClickActionStorageKey]: doubleClickAction,
    [overlayColorStorageKey]: overlayColor,
    [searchEngineStorageKey]: searchEngine,
    [searchKeywordStorageKey]: searchKeyword || defaultSearchKeyword,
  });
}

async function loadSettings() {
  const settings = await loadInteractionSettings();
  document.getElementById("clickAction").value = settings.clickAction;
  document.getElementById("doubleClickAction").value =
    settings.doubleClickAction;
  document.getElementById("searchEngine").value = settings.searchEngine;
  document.getElementById("searchKeyword").value = settings.searchKeyword;
  document.getElementById("overlayColor").value = settings.overlayColor;
}

// 加载并显示词汇列表
async function loadWords() {
  const knownWords = await loadStoredWords();
  displayWords(knownWords);
  document.getElementById("wordCount").textContent = knownWords.length;
}

function displayWords(words) {
  const wordList = document.getElementById("wordList");
  wordList.innerHTML = "";

  if (words.length === 0) {
    wordList.innerHTML = "<p>No known words added yet.</p>";
    return;
  }

  words.forEach((word) => {
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = word;
    deleteBtn.addEventListener("click", function () {
      deleteWord(word);
    });
    wordList.appendChild(deleteBtn);
  });
}

async function addWord() {
  const input = document.getElementById("wordInput");
  const word = input.value.trim();

  if (!word) {
    return;
  }

  const knownWords = await loadStoredWords();
  if (knownWords.includes(word)) {
    return;
  }

  knownWords.push(word);
  await setLocalStorage({ knownWords: knownWords });
  input.value = "";
  loadWords();
}

async function deleteWord(word) {
  const knownWords = await loadStoredWords();
  const index = knownWords.indexOf(word);

  if (index > -1) {
    knownWords.splice(index, 1);
    await setLocalStorage({ knownWords: knownWords });
    loadWords();
  }
}

async function clearAllWords() {
  if (confirm("Are you sure you want to clear all known words?")) {
    await setLocalStorage({ knownWords: [] });
    loadWords();
  }
}

function formatExportTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

async function exportWords() {
  const knownWords = await loadStoredWords();
  const blob = new Blob([knownWords.join("\n")], {
    type: "text/plain",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = formatExportTimestamp(new Date());
  link.href = url;
  link.download = `tango-highlighter-known-words-${timestamp}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function importWords(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
    void (async function () {
      try {
        if (typeof reader.result !== "string") {
          throw new Error("Imported file must be plain text.");
        }

        const importedWords = reader.result
          .split(/\r?\n/)
          .map(function (word) {
            return word.trim();
          });
        const uniqueWords = [...new Set(importedWords.filter(Boolean))];

        const confirmed = confirm(
          `Replace all known words with ${uniqueWords.length} imported words?`
        );
        if (!confirmed) {
          document.getElementById("importFileInput").value = "";
          return;
        }

        await setLocalStorage({
          knownWords: uniqueWords,
          knownWordsInitialized: true,
        });
        loadWords();
        document.getElementById("importFileInput").value = "";
      } catch (error) {
        alert(error.message);
        document.getElementById("importFileInput").value = "";
      }
    })();
  };
  reader.readAsText(file);
}

document.getElementById("addBtn").addEventListener("click", addWord);
document.getElementById("wordInput").addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.isComposing) {
    addWord();
  }
});
document.getElementById("toggleSiteBtn").addEventListener("click", toggleCurrentSite);
document.getElementById("clickAction").addEventListener("change", saveInteractionSettings);
document
  .getElementById("doubleClickAction")
  .addEventListener("change", saveInteractionSettings);
document.getElementById("searchEngine").addEventListener("change", saveInteractionSettings);
document.getElementById("searchKeyword").addEventListener("input", saveInteractionSettings);
document.getElementById("overlayColor").addEventListener("input", saveInteractionSettings);
document.getElementById("importBtn").addEventListener("click", function () {
  document.getElementById("importFileInput").click();
});
document
  .getElementById("importFileInput")
  .addEventListener("change", importWords);
document.getElementById("exportBtn").addEventListener("click", exportWords);
document.getElementById("clearAllBtn").addEventListener("click", clearAllWords);

renderSearchEngineOptions();
loadWords();
loadSettings();
void loadCurrentSite();
