(function () {
  const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
  const cache = new Map();

  function buildCacheKey(text, targetLanguage, sourceLanguage) {
    return `${sourceLanguage}:${targetLanguage}:${text}`;
  }

  async function translateText(text, targetLanguage = 'ja', sourceLanguage = 'auto', signal) {
    const trimmed = typeof text === 'string' ? text.trim() : '';

    if (!trimmed) {
      return { translatedText: '', detectedSource: sourceLanguage };
    }

    const cacheKey = buildCacheKey(trimmed, targetLanguage, sourceLanguage);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLanguage,
      tl: targetLanguage,
      dt: 't',
      q: trimmed
    });

    const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`, { signal });

    if (!response.ok) {
      throw new Error(`Translation request failed: ${response.status}`);
    }

    const data = await response.json();
    const rows = Array.isArray(data?.[0]) ? data[0] : [];
    const translatedText = rows
      .map((item) => (Array.isArray(item) ? item[0] ?? '' : ''))
      .join('');
    const detectedSource = typeof data?.[2] === 'string' ? data[2] : sourceLanguage;

    const result = { translatedText, detectedSource };
    cache.set(cacheKey, result);

    return result;
  }

  function clearTranslationCache() {
    cache.clear();
  }

  window.TranslatorService = {
    translateText,
    clearTranslationCache
  };
})();
