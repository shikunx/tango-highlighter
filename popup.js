const clickActionStorageKey = "clickAction";
const doubleClickActionStorageKey = "doubleClickAction";
const defaultClickAction = "search-reading";
const defaultDoubleClickAction = "mark-known";

function loadStoredWords(callback) {
  chrome.storage.local.get(["knownWords", "knownWordsInitialized"], function (result) {
    if (result.knownWordsInitialized) {
      callback(result.knownWords || []);
      return;
    }

    chrome.storage.local.set(
      {
        knownWords: defaultKnownWords,
        knownWordsInitialized: true,
      },
      function () {
        callback([...defaultKnownWords]);
      }
    );
  });
}

function loadInteractionSettings(callback) {
  chrome.storage.local.get(
    [clickActionStorageKey, doubleClickActionStorageKey],
    function (result) {
      callback({
        clickAction: result[clickActionStorageKey] || defaultClickAction,
        doubleClickAction:
          result[doubleClickActionStorageKey] || defaultDoubleClickAction,
      });
    }
  );
}

function saveInteractionSettings() {
  const clickAction = document.getElementById("clickAction").value;
  const doubleClickAction = document.getElementById("doubleClickAction").value;

  chrome.storage.local.set(
    {
      [clickActionStorageKey]: clickAction,
      [doubleClickActionStorageKey]: doubleClickAction,
    },
    function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "updateHighlight" });
      });
    }
  );
}

function loadSettings() {
  loadInteractionSettings(function (settings) {
    document.getElementById("clickAction").value = settings.clickAction;
    document.getElementById("doubleClickAction").value =
      settings.doubleClickAction;
  });
}

// 加载并显示词汇列表
function loadWords() {
  loadStoredWords(function (knownWords) {
    displayWords(knownWords);
    document.getElementById("wordCount").textContent = knownWords.length;
  });
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
    deleteBtn.onclick = () => deleteWord(word);
    wordList.appendChild(deleteBtn);
  });
}

function addWord() {
  const input = document.getElementById("wordInput");
  const word = input.value.trim();

  if (!word) {
    return;
  }

  loadStoredWords(function (knownWords) {
    if (knownWords.includes(word)) {
      return;
    }

    knownWords.push(word);
    chrome.storage.local.set({ knownWords: knownWords }, function () {
      input.value = "";
      loadWords();
      notifyActiveTab();
    });
  });
}

function deleteWord(word) {
  loadStoredWords(function (knownWords) {
    const index = knownWords.indexOf(word);

    if (index > -1) {
      knownWords.splice(index, 1);
      chrome.storage.local.set({ knownWords: knownWords }, function () {
        loadWords();
        notifyActiveTab();
      });
    }
  });
}

function notifyActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "updateHighlight" });
  });
}

function clearAllWords() {
  if (confirm("Are you sure you want to clear all known words?")) {
    chrome.storage.local.set({ knownWords: [] }, function () {
      loadWords();
      notifyActiveTab();
    });
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

function exportWords() {
  loadStoredWords(function (knownWords) {
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
  });
}

function importWords(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = function () {
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

      chrome.storage.local.set(
        {
          knownWords: uniqueWords,
          knownWordsInitialized: true,
        },
        function () {
          loadWords();
          notifyActiveTab();
          document.getElementById("importFileInput").value = "";
        }
      );
    } catch (error) {
      alert(error.message);
      document.getElementById("importFileInput").value = "";
    }
  };
  reader.readAsText(file);
}

document.getElementById("addBtn").addEventListener("click", addWord);
document.getElementById("wordInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    addWord();
  }
});
document.getElementById("clickAction").addEventListener("change", saveInteractionSettings);
document
  .getElementById("doubleClickAction")
  .addEventListener("change", saveInteractionSettings);
document.getElementById("importBtn").addEventListener("click", function () {
  document.getElementById("importFileInput").click();
});
document
  .getElementById("importFileInput")
  .addEventListener("change", importWords);
document.getElementById("exportBtn").addEventListener("click", exportWords);
document.getElementById("clearAllBtn").addEventListener("click", clearAllWords);

loadWords();
loadSettings();
