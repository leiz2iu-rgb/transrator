(function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function isSpeechSupported() {
    return Boolean(SpeechRecognition);
  }

  function createRecognizer({ lang = 'ja-JP', interimResults = false } = {}) {
    if (!SpeechRecognition) {
      throw new Error('Speech recognition is not supported in this browser.');
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = 1;

    return recognition;
  }

  window.SpeechHelper = {
    isSpeechSupported,
    createRecognizer
  };
})();
