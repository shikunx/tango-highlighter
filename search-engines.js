const defaultSearchEngine = "google";

const searchEngineOptions = [
  { value: "google", label: "Google" },
  { value: "google-japan", label: "Google Japan" },
  { value: "duckduckgo", label: "DuckDuckGo" },
  { value: "bing", label: "Bing" },
  { value: "yahoo-japan", label: "Yahoo! Japan" },
  { value: "goo", label: "goo" },
  { value: "baidu", label: "Baidu" },
  { value: "sogou", label: "Sogou" },
  { value: "brave", label: "Brave Search" },
];

function getSearchEngineLabel(searchEngine) {
  const matchedOption = searchEngineOptions.find(function (option) {
    return option.value === searchEngine;
  });

  return matchedOption ? matchedOption.label : "Google";
}

function buildSearchEngineUrl(searchEngine, query) {
  if (searchEngine === "google-japan") {
    return `https://www.google.co.jp/search?q=${query}`;
  }

  if (searchEngine === "duckduckgo") {
    return `https://duckduckgo.com/?q=${query}`;
  }

  if (searchEngine === "bing") {
    return `https://www.bing.com/search?q=${query}`;
  }

  if (searchEngine === "yahoo-japan") {
    return `https://search.yahoo.co.jp/search?p=${query}`;
  }

  if (searchEngine === "goo") {
    return `https://search.goo.ne.jp/web.jsp?MT=${query}`;
  }

  if (searchEngine === "baidu") {
    return `https://www.baidu.com/s?wd=${query}`;
  }

  if (searchEngine === "sogou") {
    return `https://www.sogou.com/web?query=${query}`;
  }

  if (searchEngine === "brave") {
    return `https://search.brave.com/search?q=${query}`;
  }

  return `https://www.google.com/search?q=${query}`;
}
