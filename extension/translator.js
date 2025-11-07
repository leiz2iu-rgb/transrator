(function () {
  const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

  async function translateText(text, targetLanguage = 'ja', sourceLanguage = 'auto') {
    if (!text || !text.trim()) {
      return { translatedText: '', detectedSource: sourceLanguage };
    }

    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLanguage,
      tl: targetLanguage,
      dt: 't',
      q: text
    });

    const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Translation request failed: ${response.status}`);
    }

    const data = await response.json();
    const translatedText = data?.[0]?.map((item) => item?.[0]).join('') ?? '';
    const detectedSource = data?.[2] ?? sourceLanguage;

    return { translatedText, detectedSource };
  }

  window.TranslatorService = {
    translateText
  };
})();
