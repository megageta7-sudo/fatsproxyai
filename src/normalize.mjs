const adobeCategories = [
  "animals", "buildings and architecture", "business", "drinks", "the environment", 
  "states of mind", "food", "graphic resources", "hobbies and leisure", "industry", 
  "landscape", "lifestyle", "people", "plants and flowers", "culture and religion", 
  "science", "social issues", "sports", "technology", "transport", "travel"
];

export function stripThinking(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

export function cleanMarkdown(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/^[\s\-*•#>]+/g, "") // Strip leading markdown bullets/quotes/hashes
    .replace(/^\*+|\*+$/g, "")    // Strip leading/trailing asterisks
    .replace(/^["']+|["']+$/g, "") // Strip leading/trailing quotes
    .replace(/\s+/g, " ")
    .trim();
}

function stripCodeFence(text) {
  return String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function extractJson(text) {
  const cleaned = stripCodeFence(stripThinking(text));
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Provider returned invalid JSON");
  }
}

function normalizeCategory(value) {
  const lower = cleanMarkdown(String(value || "")).toLowerCase();
  return adobeCategories.includes(lower) ? lower : "business";
}

function normalizeKeywords(value, settings = {}) {
  const maxKeywords = Number(settings.keywordCount || settings.maxKeywordsNum || 49);
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  
  const rawRemove = Array.isArray(settings.removeKeywords) ? settings.removeKeywords : String(settings.removeKeywords || "").split(",");
  const removeSet = new Set(
    rawRemove.map(k => cleanMarkdown(String(k)).toLowerCase()).filter(Boolean)
  );

  const seen = new Set();
  const initialKeywords = [];
  
  // 1. Filter out duplicates and removeKeywords
  for (const item of raw) {
    let keyword = cleanMarkdown(String(item)).toLowerCase();
    // Strip any lingering bullet numbering like "1. keyword" or leading symbols
    keyword = keyword.replace(/^[\d\.\-*•]+\s*/, "").replace(/[*_`]/g, "").trim();
    
    if (!keyword || removeSet.has(keyword) || seen.has(keyword)) continue;
    seen.add(keyword);
    initialKeywords.push(keyword);
  }

  // 2. Add addKeywords
  const rawAdd = Array.isArray(settings.addKeywords) ? settings.addKeywords : String(settings.addKeywords || "").split(",");
  const addKeywords = rawAdd
    .map(k => cleanMarkdown(String(k)).toLowerCase().replace(/^[\d\.\-*•]+\s*/, "").replace(/[*_`]/g, "").trim())
    .filter(k => k && !seen.has(k));

  let combined = [];
  if (addKeywords.length > 0) {
    const pos = settings.keywordPosition || "Back";
    if (pos === "Front") {
      combined = [...addKeywords, ...initialKeywords];
    } else if (pos === "Custom") {
      const idx = Math.min(Math.max(0, Number(settings.positionNumber || 0)), initialKeywords.length);
      combined = [
        ...initialKeywords.slice(0, idx),
        ...addKeywords,
        ...initialKeywords.slice(idx)
      ];
    } else {
      combined = [...initialKeywords, ...addKeywords];
    }
  } else {
    combined = initialKeywords;
  }

  // 3. Enforce max length
  return combined.slice(0, maxKeywords);
}

export function normalizeMetadata(providerText, settings = {}) {
  let data;
  const sanitizedText = stripThinking(String(providerText || "")).trim();

  try {
    data = typeof providerText === "string" ? extractJson(sanitizedText) : providerText;
  } catch (e) {
    // Fallback for plain text responses (detect labeled format)
    const text = sanitizedText;
    
    // Robust regex matching for labeled formats (handles **TITLE:**, * **Title:**, # Title:, etc.)
    const titleMatch = text.match(/(?:^|\n)(?:[-*•#\s]*)(?:\*\*)?TITLE(?:\*\*)?[:\-]\s*(.*?)(?=\n(?:[-*•#\s]*)(?:\*\*)?(?:KEYWORDS|CATEGORY|TAGS|FILE_TYPE)|\n\n|$)/is);
    const kwMatch = text.match(/(?:^|\n)(?:[-*•#\s]*)(?:\*\*)?(?:KEYWORDS|TAGS)(?:\*\*)?[:\-]\s*(.*?)(?=\n(?:[-*•#\s]*)(?:\*\*)?(?:CATEGORY|TITLE|FILE_TYPE)|\n\n|$)/is);
    const catMatch = text.match(/(?:^|\n)(?:[-*•#\s]*)(?:\*\*)?CATEGORY(?:\*\*)?[:\-]\s*(.*?)(?=\n(?:[-*•#\s]*)(?:\*\*)?(?:KEYWORDS|TITLE|FILE_TYPE)|\n\n|$)/is);
    const ftMatch = text.match(/(?:^|\n)(?:[-*•#\s]*)(?:\*\*)?FILE_TYPE(?:\*\*)?[:\-]\s*(.*?)(?=\n|$)/is);

    if (titleMatch || kwMatch) {
      const rawTitle = titleMatch ? cleanMarkdown(titleMatch[1]) : cleanMarkdown(text.slice(0, 200));
      const rawKw = kwMatch ? kwMatch[1].split(",").map(k => cleanMarkdown(k)).filter(Boolean) : [];
      const rawCat = catMatch ? cleanMarkdown(catMatch[1]).toLowerCase() : "business";
      
      const keywords = normalizeKeywords(rawKw, settings);
      const category = normalizeCategory(rawCat);
      const fileTypeFlag = ftMatch ? ftMatch[1].toLowerCase().includes("illustration") : false;
      const legacyResult = `${rawTitle}&&${keywords.join(", ")}&&${category}&&false&&${fileTypeFlag}`;

      return {
        result: legacyResult,
        title: rawTitle.slice(0, 200),
        keywords,
        category,
        peopleOrProperty: false,
        fileTypeFlag,
        legacyResult
      };
    }

    const fallbackTitle = cleanMarkdown(text.slice(0, 200));
    const fallbackKeywords = normalizeKeywords(text.split(","), settings);
    const legacyResult = `${fallbackTitle}&&${fallbackKeywords.join(", ")}&&business&&false&&false`;

    return {
      result: legacyResult,
      title: fallbackTitle,
      keywords: fallbackKeywords,
      category: "business",
      peopleOrProperty: false,
      fileTypeFlag: false,
      legacyResult
    };
  }
  
  const start = String(settings.startText || "").trim();
  const end = String(settings.endText || "").trim();
  let baseTitle = cleanMarkdown(String(data.title || ""));
  
  let title = baseTitle;
  if (start) title = start + " " + title;
  if (end) title = title + " " + end;
  title = cleanMarkdown(title).slice(0, 200);

  const keywords = normalizeKeywords(data.keywords, settings);
  const category = normalizeCategory(data.category);
  const peopleOrProperty = Boolean(data.peopleOrProperty);
  const fileTypeFlag = Boolean(data.fileTypeFlag);

  if (!title && keywords.length === 0) {
    throw new Error("Generated content is empty");
  }

  const legacyResult = `${title}&&${keywords.join(", ")}&&${category}&&${peopleOrProperty}&&${fileTypeFlag}`;

  return {
    result: legacyResult, // For backward compatibility with extension background.js
    title,
    keywords,
    category,
    peopleOrProperty,
    fileTypeFlag,
    legacyResult,
    description: data?.description || "",
    main_tag: data?.main_tag || "",
    supporting_tags: data?.supporting_tags || [],
    mature: data?.mature || false
  };
}
