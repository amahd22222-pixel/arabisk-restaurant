(() => {
  'use strict';

  const state = {
    listening: false,
    speaking: false,
    busy: false,
    history: [],
    recognition: null,
    voiceEnabled: true
  };

  const rootId = 'arabisk-shams-root';
  const launcherId = 'shams-launcher';

  function ensureStyles() {
    if (document.getElementById('arabisk-shams-style')) return;
    const link = document.createElement('link');
    link.id = 'arabisk-shams-style';
    link.rel = 'stylesheet';
    link.href = '/shams.css';
    document.head.appendChild(link);
  }

  function createUi() {
    if (document.getElementById(rootId)) return;
    const root = document.createElement('section');
    root.id = rootId;
    root.setAttribute('aria-label', 'شمس — المساعدة الصوتية');
    root.innerHTML = `
      <button id="${launcherId}" class="shams-launcher shams-voice-only" type="button"
        aria-label="تحدث مع شمس" aria-pressed="false" title="تحدث مع شمس">
        <span class="shams-sun" aria-hidden="true">☀</span>
        <span class="shams-launcher-label" aria-hidden="true">شمس</span>
      </button>
      <div class="shams-voice-error" id="shams-voice-error" aria-live="polite"></div>
    `;
    document.body.appendChild(root);
  }

  function ui() {
    return {
      root: document.getElementById(rootId),
      launcher: document.getElementById(launcherId),
      error: document.getElementById('shams-voice-error')
    };
  }

  function setVisual(mode) {
    const { launcher } = ui();
    if (!launcher) return;
    launcher.classList.toggle('is-listening', mode === 'listening');
    launcher.classList.toggle('is-speaking', mode === 'speaking');
    launcher.classList.toggle('is-thinking', mode === 'thinking');
    launcher.classList.toggle('is-error', mode === 'error');
    launcher.setAttribute('aria-pressed', String(Boolean(state.listening)));
    launcher.title =
      mode === 'listening' ? 'شمس تستمع إليك' :
      mode === 'speaking' ? 'شمس تتحدث' :
      mode === 'thinking' ? 'شمس تفكر' :
      'تحدث مع شمس';
  }

  function showError(message) {
    const node = ui().error;
    if (!node) return;
    node.textContent = String(message || '');
    node.classList.toggle('has-error', Boolean(message));
    window.clearTimeout(showError.timer);
    if (message) showError.timer = window.setTimeout(() => {
      node.textContent = '';
      node.classList.remove('has-error');
    }, 5000);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.speaking = false;
  }

  function pickArabicVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v => /^ar(-|_)/i.test(v.lang)) ||
      voices.find(v => /arabic|العربي/i.test(v.name)) ||
      null;
  }

  function speak(text) {
    if (!state.voiceEnabled || !('speechSynthesis' in window)) return Promise.resolve();
    const cleanText = String(text || '')
      .replace(/[\n\r]+/g, '. ')
      .replace(/[\*_\`#>]/g, '')
      .trim()
      .slice(0, 900);

    if (!cleanText) return Promise.resolve();

    stopSpeaking();

    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ar-AE';
      utterance.rate = 0.96;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      const voice = pickArabicVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        state.speaking = true;
        setVisual('speaking');
      };
      utterance.onend = () => {
        state.speaking = false;
        if (!state.busy && !state.listening) setVisual('idle');
        resolve();
      };
      utterance.onerror = () => {
        state.speaking = false;
        if (!state.busy && !state.listening) setVisual('idle');
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  async function performActions(actions) {
    if (!Array.isArray(actions)) return;
    const action = actions.find(item => /^\/(?!\/)/.test(String(item?.url || '')));
    if (!action) return;
    await new Promise(resolve => window.setTimeout(resolve, 600));
    window.location.assign(action.url);
  }

  async function sendMessage(message) {
    const text = String(message || '').trim();
    if (!text || state.busy) return;

    state.busy = true;
    setVisual('thinking');

    try {
      const profileToken = window.ARABISK_PROFILE?.getToken?.() || '';
      const response = await fetch('/api/shams/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(profileToken ? { 'X-ARABISK-PROFILE-TOKEN': profileToken } : {})
        },
        body: JSON.stringify({
          message: text,
          history: state.history.slice(-10)
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'تعذر تشغيل شمس الآن.');
      }

      const reply = String(data.reply || 'أنا هنا لمساعدتك.').trim();

      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: reply });
      state.history = state.history.slice(-12);

      await speak(reply);
      await performActions(data.actions);
    } catch (error) {
      showError(error?.message || 'تعذر تشغيل شمس الآن.');
      await speak(error?.message || 'تعذر تشغيل شمس الآن. حاول مرة أخرى.');
    } finally {
      state.busy = false;
      if (!state.listening && !state.speaking) setVisual('idle');
    }
  }

  function setupRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showError('التحدث الصوتي غير مدعوم في هذا المتصفح.');
      setVisual('error');
      return null;
    }

    const recognition = new Recognition();
    recognition.lang = 'ar-AE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      state.listening = true;
      showError('');
      setVisual('listening');
    };

    recognition.onresult = event => {
      const phrase = event.results?.[0]?.[0]?.transcript?.trim() || '';
      state.listening = false;
      if (phrase) void sendMessage(phrase);
    };

    recognition.onerror = event => {
      state.listening = false;
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        showError('اسمح بالميكروفون من إعدادات المتصفح حتى تسمعك شمس.');
      } else if (event?.error !== 'aborted' && event?.error !== 'no-speech') {
        showError('لم ألتقط الصوت بوضوح. اضغط شمس وتحدث مرة أخرى.');
      }
      if (!state.busy && !state.speaking) setVisual(event?.error === 'not-allowed' ? 'error' : 'idle');
    };

    recognition.onend = () => {
      state.listening = false;
      if (!state.busy && !state.speaking) setVisual('idle');
    };

    state.recognition = recognition;
    return recognition;
  }

  function startListeningFromUserGesture() {
    const { launcher } = ui();
    const recognition = state.recognition || setupRecognition();
    if (!recognition) return;

    stopSpeaking();
    showError('');

    // Critical: start() is called directly from the actual button click.
    // Delaying this call with setTimeout can cause browsers to reject microphone activation.
    try {
      recognition.start();
      launcher?.classList.add('is-listening');
    } catch (error) {
      if (!/already started|recognition has already started/i.test(String(error?.message || ''))) {
        showError('تعذر تشغيل الميكروفون. اضغط مرة أخرى.');
        setVisual('error');
      }
    }
  }

  function stopListening() {
    try { state.recognition?.stop(); } catch {}
    state.listening = false;
    setVisual('idle');
  }

  function toggleVoice() {
    if (state.listening) {
      stopListening();
      return;
    }

    if (state.speaking) {
      stopSpeaking();
      setVisual('idle');
      return;
    }

    startListeningFromUserGesture();
  }

  function setup() {
    ensureStyles();
    createUi();

    const { launcher } = ui();
    if (!launcher) return;

    state.voiceEnabled = 'speechSynthesis' in window;
    setupRecognition();

    // Keep the microphone activation inside the real click handler.
    launcher.addEventListener('click', toggleVoice);

    if (!state.voiceEnabled) {
      showError('الصوت غير متاح في هذا المتصفح.');
      setVisual('error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }

  window.ARABISK_SHAMS = {
    open: () => startListeningFromUserGesture(),
    close: () => {
      stopListening();
      stopSpeaking();
    },
    send: sendMessage
  };
})();