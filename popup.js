// 加载并显示词汇列表
function loadWords() {
  chrome.storage.local.get(["knownWords"], function (result) {
    const knownWords = result.knownWords || [];
    displayWords(knownWords);
    document.getElementById("wordCount").textContent = knownWords.length;
  });
}

function displayWords(words) {
  const wordList = document.getElementById("wordList");
  wordList.innerHTML = "";

  if (words.length === 0) {
    wordList.innerHTML = "<p>No 単語 has been added yet.</p>";
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

  chrome.storage.local.get(["knownWords"], function (result) {
    const knownWords = result.knownWords || [];

    if (knownWords.includes(word)) {
      return;
    }

    knownWords.push(word);
    chrome.storage.local.set({ knownWords: knownWords }, function () {
      input.value = "";
      loadWords();
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "updateHighlight" });
      });
    });
  });
}

function deleteWord(word) {
  chrome.storage.local.get(["knownWords"], function (result) {
    const knownWords = result.knownWords || [];
    const index = knownWords.indexOf(word);

    if (index > -1) {
      knownWords.splice(index, 1);
      chrome.storage.local.set({ knownWords: knownWords }, function () {
        loadWords();
        chrome.tabs.query(
          { active: true, currentWindow: true },
          function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "updateHighlight" });
          }
        );
      });
    }
  });
}

function clearAllWords() {
  if (confirm("Are you sure you want to clear all 単語?")) {
    chrome.storage.local.set({ knownWords: [] }, function () {
      loadWords();
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "updateHighlight" });
      });
    });
  }
}

document.getElementById("addBtn").addEventListener("click", addWord);
document.getElementById("wordInput").addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    addWord();
  }
});
document.getElementById("clearAllBtn").addEventListener("click", clearAllWords);

loadWords();
