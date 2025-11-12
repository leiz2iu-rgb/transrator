(function () {
  const MESSAGE_LIST_SELECTORS = [
    '[data-testid="chat-message-list"]',
    '[data-testid="message-list"]',
    '[data-testid="chat-room"]',
    '.chatroom-message-list',
    '.message-list',
    '.chat-messages',
    '.chat-thread',
    '.shopee-chatroom__messages',
    '.stardust-chat-room__messages'
  ];

  const MESSAGE_ITEM_SELECTORS = [
    '[data-testid="chat-message"]',
    '[data-testid="message-item"]',
    '.chat-message',
    '.message-item',
    '.bubble',
    '.chat-content',
    '.shopee-chat-message',
    '.chat-message__text'
  ];

  const MESSAGE_TEXT_SELECTORS = [
    '[data-testid="message-text"]',
    '.chat-message-text',
    '.chat-bubble__text',
    '.message-text',
    '.bubble-text',
    '.shopee-chat-message__bubble',
    '.chat-content',
    '.chat-bubble',
    '.chat-message__text',
    '.chat-message'
  ];

  const INPUT_SELECTORS = [
    'textarea',
    'input[type="text"]',
    'div[contenteditable="true"]'
  ];

  const ORIGINAL_ATTRIBUTE = 'data-ai-original-text';
  const STATUS_ATTRIBUTE = 'data-ai-translation-status';
  const PROCESS_INTERVAL_MS = 3000;
  const THREAD_CHECK_INTERVAL_MS = 2000;

  const MESSAGE_ITEM_SELECTOR = MESSAGE_ITEM_SELECTORS.join(', ');
  const MESSAGE_LIST_SELECTOR = MESSAGE_LIST_SELECTORS.join(', ');

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
    if (!text) {
      return false;
    }

    const lower = text.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
  }

  function isLikelyOutgoingFromAttributes(element) {
    if (!element) {
      return false;
    }

    if (element.getAttribute && element.getAttribute('data-is-self') === 'true') {
      return true;
    }

    const classText = element.className || '';
    const roleText = element.getAttribute ? element.getAttribute('role') || '' : '';
    const ariaLabel = element.getAttribute ? element.getAttribute('aria-label') || '' : '';
    const dataOwner = element.getAttribute ? element.getAttribute('data-owner') || '' : '';
    const combined = `${classText} ${roleText} ${ariaLabel} ${dataOwner}`;

    return textIncludesKeyword(combined, OUTGOING_KEYWORDS);
  }

  function isLikelyIncomingFromAttributes(element) {
    if (!element) {
      return false;
    }

    if (element.getAttribute && element.getAttribute('data-is-self') === 'false') {
      return true;
    }

    const classText = element.className || '';
    const ariaLabel = element.getAttribute ? element.getAttribute('aria-label') || '' : '';
    const dataFrom = element.getAttribute ? element.getAttribute('data-from') || '' : '';
    const combined = `${classText} ${ariaLabel} ${dataFrom}`;

    return textIncludesKeyword(combined, INCOMING_KEYWORDS);
  }

  function getMessageContainer(element) {
    if (!element) {
      return null;
    }

    const container = getClosestMessageElement(element);
    return container instanceof HTMLElement ? container : null;
  }

  function isRightAligned(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return false;
    }

    const bubbleRect = element.getBoundingClientRect();
    let container = null;

    try {
      container = element.closest(MESSAGE_LIST_SELECTOR);
    } catch (error) {
      container = null;
    }

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

  function isIncomingMessage(element) {
    const container = getMessageContainer(element);

    if (!container) {
      return false;
    }

    if (isLikelyOutgoingFromAttributes(element) || isLikelyOutgoingFromAttributes(container)) {
      return false;
    }

    if (isLikelyIncomingFromAttributes(element) || isLikelyIncomingFromAttributes(container)) {
      return true;
    }

    return !isRightAligned(container);
  }

  const state = {
    lastDetectedLanguage: 'en',
    messageList: null,
    messageObserver: null,
    listObserver: null,
    rescanTimer: null,
    threadTimer: null,
    currentThreadKey: null
  };

  const pendingRequests = new Map();

  function getThreadKey() {
    return `${location.pathname}::${location.search}`;
  }

  function matchesMessageSelector(element) {
    return MESSAGE_ITEM_SELECTORS.some((selector) => {
      try {
        return element.matches(selector);
      } catch (error) {
        return false;
      }
    });
  }

  function getClosestMessageElement(node) {
    if (!(node instanceof HTMLElement)) {
      return null;
    }

    if (matchesMessageSelector(node)) {
      return node;
    }

    try {
      return node.closest(MESSAGE_ITEM_SELECTOR);
    } catch (error) {
      return null;
    }
  }

  function findMessageList() {
    return MESSAGE_LIST_SELECTORS.map((selector) => document.querySelector(selector)).find(Boolean);
  }

  function collectMessageElements(root) {
    const elements = new Set();

    MESSAGE_ITEM_SELECTORS.forEach((selector) => {
      root.querySelectorAll(selector).forEach((element) => {
        if (!(element instanceof HTMLElement)) {
          return;
        }

        if (!element.innerText || element.innerText.trim().length === 0) {
          return;
        }

        const container = getMessageContainer(element);
        if (!container || !isIncomingMessage(container)) {
          return;
        }

        elements.add(container);
      });
    });

    return Array.from(elements);
  }

  function getMessageContentElement(messageElement) {
    for (const selector of MESSAGE_TEXT_SELECTORS) {
      let candidate = null;
      try {
        if (messageElement.matches(selector)) {
          candidate = messageElement;
        }
      } catch (error) {
        candidate = null;
      }

      if (!candidate) {
        candidate = messageElement.querySelector(selector);
      }

      if (candidate && candidate instanceof HTMLElement && candidate.innerText && candidate.innerText.trim()) {
        return candidate;
      }
    }

    return messageElement instanceof HTMLElement ? messageElement : null;
  }

  function extractTextContent(element) {
    if (!element) {
      return '';
    }

    const clone = element.cloneNode(true);
    clone.querySelectorAll('.ai-translation-wrapper, .ai-translation, .ai-original-text, .ai-translation-toolbar').forEach((node) =>
      node.remove()
    );
    return clone.innerText ? clone.innerText.trim() : '';
  }

  function applyVisibilityState(wrapper) {
    const toggle = wrapper.querySelector('.ai-translation-toggle');
    const translation = wrapper.querySelector('.ai-translation');
    const original = wrapper.querySelector('.ai-original-text');
    const showingOriginal = wrapper.classList.contains('ai-translation-wrapper--show-original');

    if (toggle) {
      toggle.textContent = showingOriginal ? '訳文を表示' : '原文を表示';
    }

    if (translation) {
      translation.setAttribute('aria-hidden', showingOriginal ? 'true' : 'false');
    }

    if (original) {
      original.setAttribute('aria-hidden', showingOriginal ? 'false' : 'true');
    }
  }

  function ensureTranslationUI(messageElement) {
    const contentElement = getMessageContentElement(messageElement);
    if (!contentElement) {
      return null;
    }

    let wrapper = contentElement.querySelector('.ai-translation-wrapper');
    if (wrapper) {
      return wrapper;
    }

    wrapper = document.createElement('div');
    wrapper.className = 'ai-translation-wrapper';

    const toolbar = document.createElement('div');
    toolbar.className = 'ai-translation-toolbar';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'ai-translation-toggle';
    toggleButton.textContent = '原文を表示';
    toggleButton.addEventListener('click', () => {
      wrapper.classList.toggle('ai-translation-wrapper--show-original');
      applyVisibilityState(wrapper);
    });

    toolbar.appendChild(toggleButton);

    const translation = document.createElement('div');
    translation.className = 'ai-translation';
    translation.setAttribute('aria-live', 'polite');

    const original = document.createElement('div');
    original.className = 'ai-original-text';
    original.setAttribute('aria-hidden', 'true');

    wrapper.appendChild(toolbar);
    wrapper.appendChild(translation);
    wrapper.appendChild(original);
    contentElement.appendChild(wrapper);

    applyVisibilityState(wrapper);

    return wrapper;
  }

  function updateOriginalText(wrapper, originalText) {
    const original = wrapper.querySelector('.ai-original-text');
    if (original) {
      original.textContent = originalText;
    }
    applyVisibilityState(wrapper);
  }

  function setWrapperState(wrapper, stateName) {
    wrapper.classList.remove('ai-translation-wrapper--pending', 'ai-translation-wrapper--error');
    if (stateName) {
      wrapper.classList.add(`ai-translation-wrapper--${stateName}`);
    }
  }

  function setPending(wrapper) {
    const translation = wrapper.querySelector('.ai-translation');
    if (translation) {
      translation.textContent = '翻訳中…';
      translation.removeAttribute('data-source-language');
    }
    setWrapperState(wrapper, 'pending');
    applyVisibilityState(wrapper);
  }

  function setTranslation(wrapper, translatedText, detectedSource) {
    const translation = wrapper.querySelector('.ai-translation');
    if (translation) {
      translation.textContent = translatedText;
      if (detectedSource) {
        translation.setAttribute('data-source-language', detectedSource);
      } else {
        translation.removeAttribute('data-source-language');
      }
    }
    setWrapperState(wrapper);
    applyVisibilityState(wrapper);
  }

  function setError(wrapper) {
    const translation = wrapper.querySelector('.ai-translation');
    if (translation) {
      translation.textContent = '翻訳に失敗しました';
      translation.removeAttribute('data-source-language');
    }
    setWrapperState(wrapper, 'error');
    applyVisibilityState(wrapper);
  }

  function removeTranslationUI(messageElement) {
    const contentElement = getMessageContentElement(messageElement);
    if (!contentElement) {
      return;
    }

    const wrapper = contentElement.querySelector('.ai-translation-wrapper');
    if (wrapper && wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }

  function cancelPendingTranslation(messageElement) {
    const controller = pendingRequests.get(messageElement);
    if (controller) {
      controller.abort();
      pendingRequests.delete(messageElement);
    }
  }

  async function translateMessage(messageElement) {
    if (!messageElement || !(messageElement instanceof HTMLElement)) {
      return;
    }

    if (!isIncomingMessage(messageElement)) {
      cancelPendingTranslation(messageElement);
      removeTranslationUI(messageElement);
      messageElement.removeAttribute(STATUS_ATTRIBUTE);
      messageElement.removeAttribute(ORIGINAL_ATTRIBUTE);
      return;
    }

    if (!window.TranslatorService || typeof window.TranslatorService.translateText !== 'function') {
      return;
    }

    const contentElement = getMessageContentElement(messageElement);
    if (!contentElement) {
      return;
    }

    const originalText = extractTextContent(contentElement);
    if (!originalText) {
      return;
    }

    const storedOriginal = messageElement.getAttribute(ORIGINAL_ATTRIBUTE);
    const status = messageElement.getAttribute(STATUS_ATTRIBUTE);

    if (storedOriginal === originalText && (status === 'done' || status === 'skipped')) {
      return;
    }

    cancelPendingTranslation(messageElement);

    const wrapper = ensureTranslationUI(messageElement);
    if (!wrapper) {
      return;
    }

    messageElement.setAttribute(ORIGINAL_ATTRIBUTE, originalText);
    messageElement.setAttribute(STATUS_ATTRIBUTE, 'pending');
    updateOriginalText(wrapper, originalText);
    setPending(wrapper);

    let controller = null;
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      pendingRequests.set(messageElement, controller);
    }

    try {
      const { translatedText, detectedSource } = await window.TranslatorService.translateText(
        originalText,
        'ja',
        'auto',
        controller ? controller.signal : undefined
      );

      if (messageElement.getAttribute(ORIGINAL_ATTRIBUTE) !== originalText) {
        return;
      }

      const isJapanese = detectedSource && detectedSource.startsWith('ja');
      const isSameText = translatedText && translatedText.trim() === originalText.trim();

      if (!translatedText || isJapanese || isSameText) {
        removeTranslationUI(messageElement);
        messageElement.setAttribute(STATUS_ATTRIBUTE, 'skipped');
        return;
      }

      state.lastDetectedLanguage = detectedSource || state.lastDetectedLanguage;

      setTranslation(wrapper, translatedText, detectedSource);
      messageElement.setAttribute(STATUS_ATTRIBUTE, 'done');
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return;
      }
      console.error('Translation failed', error);
      if (messageElement.getAttribute(ORIGINAL_ATTRIBUTE) !== originalText) {
        return;
      }
      setError(wrapper);
      messageElement.setAttribute(STATUS_ATTRIBUTE, 'error');
    } finally {
      if (controller) {
        pendingRequests.delete(messageElement);
      }
    }
  }

  function processMessagesFromList(root) {
    if (!root) {
      return;
    }

    const elements = collectMessageElements(root);
    elements.forEach((element) => translateMessage(element));
  }

  function processAllMessages() {
    const root = state.messageList || findMessageList();
    if (!root) {
      return;
    }
    processMessagesFromList(root);
  }

  function handleMutations(mutations) {
    const elements = new Set();

    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          const messageElement = getClosestMessageElement(node);
          if (messageElement) {
            elements.add(messageElement);
          }

          if (node instanceof HTMLElement) {
            node.querySelectorAll(MESSAGE_ITEM_SELECTOR).forEach((child) => {
              elements.add(child);
            });
          }
        });
      }

      if (mutation.type === 'characterData' && mutation.target) {
        const parent = mutation.target.parentElement;
        const messageElement = parent ? getClosestMessageElement(parent) : null;
        if (messageElement) {
          elements.add(messageElement);
        }
      }
    });

    elements.forEach((element) => translateMessage(element));
  }

  function detachMessageObserver() {
    if (state.messageObserver) {
      state.messageObserver.disconnect();
      state.messageObserver = null;
    }
    state.messageList = null;
  }

  function resetMessageProcessing() {
    if (state.messageList) {
      state.messageList.querySelectorAll('.ai-translation-wrapper').forEach((node) => node.remove());
      state.messageList
        .querySelectorAll(`[${STATUS_ATTRIBUTE}]`)
        .forEach((element) => {
          element.removeAttribute(STATUS_ATTRIBUTE);
          element.removeAttribute(ORIGINAL_ATTRIBUTE);
        });
    }

    detachMessageObserver();

    if (state.listObserver) {
      state.listObserver.disconnect();
      state.listObserver = null;
    }

    if (pendingRequests.size) {
      pendingRequests.forEach((controller) => {
        try {
          controller.abort();
        } catch (error) {
          // ignore abort errors
        }
      });
      pendingRequests.clear();
    }

    if (window.TranslatorService && typeof window.TranslatorService.clearTranslationCache === 'function') {
      window.TranslatorService.clearTranslationCache();
    }

    watchForMessageList();
  }

  function attachToMessageList(list) {
    if (!list || state.messageList === list) {
      return;
    }

    detachMessageObserver();

    state.messageList = list;
    state.messageObserver = new MutationObserver(handleMutations);
    state.messageObserver.observe(list, {
      childList: true,
      subtree: true,
      characterData: true
    });

    processMessagesFromList(list);
  }

  function watchForMessageList() {
    const existing = findMessageList();
    if (existing) {
      attachToMessageList(existing);
      return;
    }

    if (state.listObserver) {
      return;
    }

    state.listObserver = new MutationObserver(() => {
      const list = findMessageList();
      if (list) {
        if (state.listObserver) {
          state.listObserver.disconnect();
          state.listObserver = null;
        }
        attachToMessageList(list);
      }
    });

    state.listObserver.observe(document.body, { childList: true, subtree: true });
  }

  function checkThread() {
    const nextThreadKey = getThreadKey();
    if (state.currentThreadKey !== nextThreadKey) {
      state.currentThreadKey = nextThreadKey;
      resetMessageProcessing();
    }

    if (state.messageList && !document.contains(state.messageList)) {
      resetMessageProcessing();
    }
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
    if (!inputElement) {
      return;
    }

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
            const { translatedText } = await window.TranslatorService.translateText(
              transcript,
              targetLang,
              'ja'
            );
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
    state.currentThreadKey = getThreadKey();
    watchForMessageList();
    processAllMessages();
    attachMicrophone();
    observeInputArea();

    if (state.rescanTimer) {
      clearInterval(state.rescanTimer);
    }
    state.rescanTimer = setInterval(processAllMessages, PROCESS_INTERVAL_MS);

    if (state.threadTimer) {
      clearInterval(state.threadTimer);
    }
    state.threadTimer = setInterval(checkThread, THREAD_CHECK_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
