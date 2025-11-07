(function () {
  const state = {
    lastDetectedLanguage: 'en'
  };

  const MESSAGE_SELECTORS = [
    '[data-testid="chat-message"]',
    '.chat-message',
    '.message-item',
    '.bubble',
    '.chat-content',
    '.shopee-chat-message',
    '.chat-message__text',
    '.message-list .text'
  ];

  const INPUT_SELECTORS = [
    'textarea',
    'input[type="text"]',
    'div[contenteditable="true"]'
  ];

  const ORIGINAL_ATTRIBUTE = 'data-ai-original-text';
  const STATUS_ATTRIBUTE = 'data-ai-translation-status';
  const PROCESS_INTERVAL_MS = 3000;

  const OUTGOING_KEYWORDS = [
    'self',
    'me',
    'seller',
    'outgoing',
    'right',
    'mine',
    'own',
    'user',
    'my'
  ];

  const INCOMING_KEYWORDS = ['incoming', 'buyer', 'left', 'other', 'friend'];

  function textIncludesKeyword(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
  }

  function isLikelyOutgoingFromAttributes(element) {
    if (!element) {
      return false;
    }

    if (element.getAttribute('data-is-self') === 'true') {
      return true;
    }

    const classText = element.className || '';
    const roleText = element.getAttribute('role') || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const dataOwner = element.getAttribute('data-owner') || '';
    const combined = `${classText} ${roleText} ${ariaLabel} ${dataOwner}`;

    return textIncludesKeyword(combined, OUTGOING_KEYWORDS);
  }

  function isLikelyIncomingFromAttributes(element) {
    if (!element) {
      return false;
    }

    if (element.getAttribute('data-is-self') === 'false') {
      return true;
    }

    const classText = element.className || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const dataFrom = element.getAttribute('data-from') || '';
    const combined = `${classText} ${ariaLabel} ${dataFrom}`;

    return textIncludesKeyword(combined, INCOMING_KEYWORDS);
  }

  function isRightAligned(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return false;
    }

    const bubbleRect = element.getBoundingClientRect();
    let container = element.closest('.message-list, .chat-content, .chat-messages, .chat-thread');
    if (!container) {
      container = element.parentElement;
    }

    if (!container || typeof container.getBoundingClientRect !== 'function') {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.left + containerRect.width / 2;

    return bubbleRect.left >= containerCenter;
  }

  function getMessageContainer(element) {
    if (!element) {
      return null;
    }

    return (
      element.closest('[data-testid="chat-message"], .chat-message, .message-item, .bubble, .chat-content, .shopee-chat-message') ||
      element
    );
  }

  function isIncomingMessage(element) {
    if (!element) {
      return false;
    }

    const container = getMessageContainer(element);

    if (isLikelyOutgoingFromAttributes(element) || isLikelyOutgoingFromAttributes(container)) {
      return false;
    }

    if (isLikelyIncomingFromAttributes(element) || isLikelyIncomingFromAttributes(container)) {
      return true;
    }

    return !isRightAligned(container);
  }

  function findMessageElements() {
    const elements = new Set();
    MESSAGE_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el || !el.innerText || el.innerText.trim().length === 0) {
          return;
        }

        const container = getMessageContainer(el);

        if (!isIncomingMessage(container)) {
          return;
        }

        if (container && container.innerText && container.innerText.trim().length > 0) {
          elements.add(container);
        }
      });
    });
    return Array.from(elements);
  }

  function ensureTranslationContainer(messageElement) {
    let container = messageElement.querySelector('.ai-translation');
    if (!container) {
      container = document.createElement('div');
      container.className = 'ai-translation';
      messageElement.appendChild(container);
    }
    return container;
  }

  function extractOriginalText(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.ai-translation').forEach((translation) => translation.remove());
    return clone.innerText.trim();
  }

  async function translateMessage(messageElement) {
    const storedOriginal = messageElement.getAttribute(ORIGINAL_ATTRIBUTE);
    const currentText = extractOriginalText(messageElement);
    const originalText = currentText;

    if (!originalText) {
      return;
    }

    const status = messageElement.getAttribute(STATUS_ATTRIBUTE);
    if (storedOriginal === currentText && (status === 'done' || status === 'skipped')) {
      return;
    }

    const translationContainer = ensureTranslationContainer(messageElement);
    translationContainer.textContent = '翻訳中…';

    try {
      const { translatedText, detectedSource } = await window.TranslatorService.translateText(originalText, 'ja');
      const isJapanese = detectedSource && detectedSource.startsWith('ja');
      if (!translatedText || isJapanese) {
        if (translationContainer && translationContainer.parentNode) {
          translationContainer.remove();
        }
        messageElement.setAttribute(STATUS_ATTRIBUTE, 'skipped');
        messageElement.setAttribute(ORIGINAL_ATTRIBUTE, originalText);
        return;
      }
      state.lastDetectedLanguage = detectedSource || state.lastDetectedLanguage;
      translationContainer.textContent = translatedText;
      translationContainer.setAttribute('data-source-language', detectedSource);
      messageElement.setAttribute(STATUS_ATTRIBUTE, 'done');
      messageElement.setAttribute(ORIGINAL_ATTRIBUTE, originalText);
    } catch (error) {
      translationContainer.textContent = '翻訳に失敗しました';
      console.error('Translation failed', error);
    }
  }

  function observeMessages() {
    const observer = new MutationObserver(() => {
      processMessages();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function processMessages() {
    const elements = findMessageElements();
    elements.forEach((el) => translateMessage(el));
  }

  function createMicrophoneButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-mic-button';
    button.title = '日本語で話すと相手の言語に翻訳されます';
    button.innerHTML = '\ud83c\udf99';
    return button;
  }

  function setInputValue(inputElement, text) {
    if (!inputElement) return;

    if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
      inputElement.value = text;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (inputElement.getAttribute('contenteditable') === 'true') {
      inputElement.textContent = text;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function attachMicrophone() {
    if (!window.SpeechHelper || !window.SpeechHelper.isSpeechSupported()) {
      console.warn('Speech recognition is not supported in this browser.');
      return;
    }

    const inputElement = INPUT_SELECTORS.map((selector) => document.querySelector(selector)).find(Boolean);

    if (!inputElement || inputElement.classList.contains('ai-mic-attached')) {
      return;
    }

    inputElement.classList.add('ai-mic-attached');
    const micButton = createMicrophoneButton();

    micButton.addEventListener('click', () => {
      try {
        const recognition = window.SpeechHelper.createRecognizer({ lang: 'ja-JP' });
        micButton.classList.add('recording');
        micButton.textContent = '\u23fa';

        recognition.addEventListener('result', async (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join('')
            .trim();

          if (!transcript) {
            return;
          }

          micButton.textContent = '\ud83c\udf99';
          micButton.classList.remove('recording');

          try {
            const targetLang = state.lastDetectedLanguage || 'en';
            const { translatedText } = await window.TranslatorService.translateText(transcript, targetLang, 'ja');
            setInputValue(inputElement, translatedText || transcript);
          } catch (error) {
            console.error('Voice translation failed', error);
          }
        });

        recognition.addEventListener('end', () => {
          micButton.textContent = '\ud83c\udf99';
          micButton.classList.remove('recording');
        });

        recognition.addEventListener('error', () => {
          micButton.textContent = '\ud83c\udf99';
          micButton.classList.remove('recording');
        });

        recognition.start();
      } catch (error) {
        console.error('Failed to start speech recognition', error);
      }
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'ai-mic-wrapper';
    inputElement.parentNode.insertBefore(wrapper, inputElement.nextSibling);
    wrapper.appendChild(micButton);
  }

  function observeInputArea() {
    const observer = new MutationObserver(() => {
      attachMicrophone();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    processMessages();
    observeMessages();
    attachMicrophone();
    observeInputArea();
    setInterval(processMessages, PROCESS_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
