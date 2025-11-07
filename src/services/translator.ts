export interface TranslateResponse {
  translatedText: string;
  detectedSource: string;
}

export interface TranslateOptions {
  targetLanguage?: string;
  sourceLanguage?: string;
  signal?: AbortSignal;
}

const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const cache = new Map<string, TranslateResponse>();

function buildCacheKey(text: string, targetLanguage: string, sourceLanguage: string): string {
  return `${sourceLanguage}:${targetLanguage}:${text}`;
}

async function requestTranslation(
  text: string,
  targetLanguage: string,
  sourceLanguage: string,
  signal?: AbortSignal
): Promise<TranslateResponse> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { translatedText: '', detectedSource: sourceLanguage };
  }

  const cacheKey = buildCacheKey(trimmed, targetLanguage, sourceLanguage);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
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

  const data: unknown = await response.json();
  const rows = Array.isArray((data as any)?.[0]) ? (data as any)[0] : [];
  const translatedText = rows
    .map((item: unknown) => (Array.isArray(item) ? item[0] ?? '' : ''))
    .join('');
  const detectedSource = typeof (data as any)?.[2] === 'string' ? (data as any)[2] : sourceLanguage;

  const result: TranslateResponse = { translatedText, detectedSource };
  cache.set(cacheKey, result);

  return result;
}

export async function translateText(
  text: string,
  targetLanguage = 'ja',
  sourceLanguage = 'auto',
  signal?: AbortSignal
): Promise<TranslateResponse> {
  return requestTranslation(text, targetLanguage, sourceLanguage, signal);
}

export async function translate(
  text: string,
  options: TranslateOptions = {}
): Promise<TranslateResponse> {
  const { targetLanguage = 'ja', sourceLanguage = 'auto', signal } = options;
  return requestTranslation(text, targetLanguage, sourceLanguage, signal);
}

export function clearTranslationCache(): void {
  cache.clear();
}
