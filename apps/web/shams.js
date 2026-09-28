(() => {
  'use strict';

  const SESSION_KEY = 'ARABISK_SHAMS_SESSION_V1';
  const DIALECT_KEY = 'ARABISK_SHAMS_DIALECT_V1';
  const SILENCE_FLUSH_MS = 2200;
  const DUPLICATE_TRANSCRIPT_WINDOW_MS = 2500;

  const state = {
    listening: false,
    speaking: false,
    busy: false,
    conversationActive: false,
    history: [],
    recognition: null,
    voiceEnabled: true,
    restartTimer: null,
    silenceTimer: null,
    transcriptBuffer: '',
    restartAttempts: 0,
    sessionId: '',
    dialect: 'gulf',
    greetedThisVisit: false,
    lastFinalTranscript: '',
    lastFinalTranscriptAt: 0
  };

  function saveVoiceContinuity() {
    try {
      sessionStorage.setItem(VOICE_CONTINUITY_KEY, JSON.stringify({
        savedAt: Date.now(),
        history: state.history.slice(-12),
        dialect: state.dialect,
        greetedThisVisit: state.greetedThisVisit
      }));
    } catch {}
  }

  function restoreVoiceContinuity() {
    try {
      const raw = sessionStorage.getItem(VOICE_CONTINUITY_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || Date.now() - Number(saved.savedAt || 0) > VOICE_CONTINUITY_TTL_MS) {
        sessionStorage.removeItem(VOICE_CONTINUITY_KEY);
        return;
      }
      if (Array.isArray(saved.history)) {
        state.history = saved.history
          .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
          .slice(-12);
      }
      if (RECOGNITION_LANGUAGES[saved.dialect]) state.dialect = saved.dialect;
      state.greetedThisVisit = Boolean(saved.greetedThisVisit);
    } catch {}
  }

  const RECOGNITION_LANGUAGES = Object.freeze({
    gulf: 'ar-AE',
    egyptian: 'ar-EG',
    syrian: 'ar-SY',
    lebanese: 'ar-LB'
  });

  function detectInitialDialect() {
    try {
      const stored = localStorage.getItem(DIALECT_KEY);
      if (stored && RECOGNITION_LANGUAGES[stored]) return stored;
    } catch {}

    const locale = String(navigator.language || '').toLowerCase();
    if (locale.startsWith('ar-eg')) return 'egyptian';
    if (locale.startsWith('ar-sy')) return 'syrian';
    if (locale.startsWith('ar-lb')) return 'lebanese';
    return 'gulf';
  }

  function rememberDialect(dialect) {
    if (!RECOGNITION_LANGUAGES[dialect]) return;
    try { localStorage.setItem(DIALECT_KEY, dialect); } catch {}
  }

  function detectDialectFromText(value) {
    const raw = String(value || '')
      .toLocaleLowerCase('ar')
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/ـ/g, '');

    const lebanese = /(هيدا|هيدي|هال|شو|وين|كتير|فيك|فينا|عنجد|كرمال)/.test(raw);
    const syrian = /(هلق|هلأ|لسا|شلون|شو|وين|كتير|بدي|مو|هيك|مشان)/.test(raw);
    const egyptian = /(عايز|عاوز|نفسي|ايه|إيه|فين|دلوقتي|دلوقت|كده|ليه|مش|احنا|اوي|ازاي)/.test(raw);

    if (lebanese && !egyptian) return 'lebanese';
    if (syrian && !egyptian) return 'syrian';
    if (egyptian) return 'egyptian';
    return 'gulf';
  }

  const rootId = 'arabisk-shams-root';
  const launcherId = 'shams-launcher';

  function getSessionId() {
    try {
      let value = localStorage.getItem(SESSION_KEY);
      if (!value) {
        value = crypto.randomUUID?.() || ('shams-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        localStorage.setItem(SESSION_KEY, value);
      }
      return value;
    } catch {
      return 'shams-' + Date.now();
    }
  }

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
    root.innerHTML =
      '<button id="' + launcherId + '" class="shams-launcher shams-voice-only" type="button" ' +
      'aria-label="تحدث مع شمس" aria-pressed="false" title="تحدث مع شمس">' +
      '<span class="shams-sun" aria-hidden="true">☀</span>' +
      '<span class="shams-launcher-label" aria-hidden="true">شمس</span>' +
      '</button>' +
      '<div class="shams-voice-error" id="shams-voice-error" aria-live="polite"></div>';
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
    launcher.classList.toggle('is-active', state.conversationActive);
    launcher.setAttribute('aria-pressed', String(Boolean(state.listening)));
    launcher.title =
      mode === 'listening' ? 'شمس تستمع إليك' :
      mode === 'speaking' ? 'شمس تتحدث' :
      mode === 'thinking' ? 'شمس تفكر' :
      state.conversationActive ? 'شمس متصلة بالمحادثة' :
      'تحدث مع شمس';
  }

  function showError(message) {
    const node = ui().error;
    if (!node) return;
    node.textContent = String(message || '');
    node.classList.toggle('has-error', Boolean(message));
    window.clearTimeout(showError.timer);
    if (message) {
      showError.timer = window.setTimeout(() => {
        node.textContent = '';
        node.classList.remove('has-error');
      }, 5000);
    }
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.speaking = false;
  }

  function pickArabicVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    const preferredLang = RECOGNITION_LANGUAGES[state.dialect] || 'ar-AE';
    return voices.find(v => String(v.lang || '').toLowerCase() === preferredLang.toLowerCase()) ||
      voices.find(v => String(v.lang || '').toLowerCase().startsWith(preferredLang.slice(0, 2).toLowerCase() + '-')) ||
      voices.find(v => /^ar(-|_)/i.test(v.lang)) ||
      voices.find(v => /arabic|العربي|عربي/i.test(v.name)) ||
      null;
  }

  async function speak(text) {
    if (!state.voiceEnabled) return false;

    const cleanText = String(text || '')
      .replace(/[\n\r]+/g, '. ')
      .replace(/[\*_\#>]/g, '')
      .trim()
      .slice(0, 900);

    if (!cleanText || !('speechSynthesis' in window)) return false;

    stopSpeaking();

    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(Boolean(value));
      };

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = RECOGNITION_LANGUAGES[state.dialect] || 'ar-AE';
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
        finish(true);
      };

      utterance.onerror = () => {
        state.speaking = false;
        if (!state.busy && !state.listening) setVisual('idle');
        finish(false);
      };

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.speak(utterance);
      } catch {
        finish(false);
      }
    });
  }

  function readCart() {
    try {
      const items = window.ARABISK_CART?.getItems?.();
      if (!Array.isArray(items)) return [];
      return items.slice(0, 20).map(item => ({
        id: String(item.id || ''),
        nameAr: String(item.nameAr || item.nameEn || ''),
        price: Number(item.price || 0),
        quantity: Number(item.qty || 1)
      })).filter(item => item.id);
    } catch {
      return [];
    }
  }

  async function performActions(actions) {
    if (!Array.isArray(actions)) return;

    for (const action of actions.slice(0, 4)) {
      if (action?.type === 'cart.add') {
        const product = action.product;
        const quantity = Number(action.quantity || 1);
        if (product?.id && window.ARABISK_CART?.add) {
          await (window.ARABISK_CART.ready?.() || Promise.resolve());
          window.ARABISK_CART.add(product, quantity);
        }
        continue;
      }

      if (action?.type === 'navigate' && /^\/(?!\/)/.test(String(action.url || ''))) {
        await new Promise(resolve => window.setTimeout(resolve, 500));
        window.location.assign(action.url);
        return;
      }
    }
  }

  function clearSilenceTimer() {
    window.clearTimeout(state.silenceTimer);
    state.silenceTimer = null;
  }

  async function flushTranscript() {
    clearSilenceTimer();
    const phrase = state.transcriptBuffer.trim();
    state.transcriptBuffer = '';
    if (!phrase || state.busy || state.speaking) return;
    state.listening = false;
    try { state.recognition?.stop(); } catch {}
    await sendMessage(phrase);
  }

  function scheduleTranscriptFlush(delay = SILENCE_FLUSH_MS) {
    clearSilenceTimer();
    if (!state.transcriptBuffer.trim()) return;
    state.silenceTimer = window.setTimeout(() => {
      void flushTranscript();
    }, Math.max(900, Math.min(3000, Number(delay) || 1600)));
  }

  function scheduleListeningRestart(delay = 300) {
    if (!state.conversationActive || state.busy || state.speaking) return;
    window.clearTimeout(state.restartTimer);

    state.restartTimer = window.setTimeout(() => {
      if (!state.conversationActive || state.busy || state.speaking || state.listening) return;
      const recognition = state.recognition;
      if (!recognition) return;

      try {
        recognition.start();
        state.restartAttempts = 0;
      } catch (error) {
        state.restartAttempts += 1;
        if (state.restartAttempts <= 6) {
          scheduleListeningRestart(Math.min(2500, 250 * state.restartAttempts));
        } else {
          showError('شمس جاهزة. اضغط عليها للمتابعة.');
          state.restartAttempts = 0;
          state.conversationActive = false;
          setVisual('idle');
        }
      }
    }, delay);
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
          history: state.history.slice(-10),
          sessionId: state.sessionId,
          page: window.location.pathname || '/',
          dialect: state.dialect,
          cart: readCart(),
          client: {
            surface: window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
              ? 'installed-pwa'
              : 'browser',
            serviceWorkerControlled: Boolean(window.navigator.serviceWorker?.controller)
          }
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'تعذر تشغيل شمس الآن.');

      const reply = String(data.reply || 'أنا معك.').trim();
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: reply });
      state.history = state.history.slice(-12);
      saveVoiceContinuity();

      await speak(reply);
      await performActions(data.actions);
    } catch (error) {
      showError(error?.message || 'تعذر تشغيل شمس الآن.');
      await speak(error?.message || 'تعذر تشغيل شمس الآن. حاول مرة أخرى.');
    } finally {
      state.busy = false;
      if (!state.listening && !state.speaking) {
        setVisual('idle');
        scheduleListeningRestart(350);
      }
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
    recognition.lang = RECOGNITION_LANGUAGES[state.dialect] || 'ar-AE';
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.continuous = true;

    recognition.onstart = () => {
      state.listening = true;
      state.restartAttempts = 0;
      showError('');
      setVisual('listening');
    };

    recognition.onresult = event => {
      clearSilenceTimer();

      let finalText = '';
      let interimText = '';

      for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim() || '';
        if (result?.isFinal) finalText += (finalText ? ' ' : '') + transcript;
        else interimText += (interimText ? ' ' : '') + transcript;
      }

      const observed = (finalText || interimText).trim();
      if (observed) {
        const detected = detectDialectFromText(observed);
        if (detected !== state.dialect) {
          state.dialect = detected;
          rememberDialect(detected);
          if (state.recognition) state.recognition.lang = RECOGNITION_LANGUAGES[detected] || 'ar-AE';
        }
      }

      if (finalText) {
        const now = Date.now();
        const normalizedFinal = finalText.toLocaleLowerCase('ar').replace(/\s+/g, ' ').trim();
        const duplicate =
          normalizedFinal &&
          normalizedFinal === state.lastFinalTranscript &&
          now - state.lastFinalTranscriptAt <= DUPLICATE_TRANSCRIPT_WINDOW_MS;
        if (!duplicate) {
          state.lastFinalTranscript = normalizedFinal;
          state.lastFinalTranscriptAt = now;
          state.transcriptBuffer = (state.transcriptBuffer + ' ' + finalText).trim();
          scheduleTranscriptFlush(SILENCE_FLUSH_MS);
        }
      }
    };

    recognition.onerror = event => {
      state.listening = false;
      const code = String(event?.error || '');
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        state.conversationActive = false;
        showError('اسمح بالميكروفون من إعدادات المتصفح حتى تسمعك شمس.');
        setVisual('error');
        return;
      }
      if (code !== 'aborted' && code !== 'no-speech') {
        showError('لم ألتقط الصوت بوضوح. شمس جاهزة للمحاولة مرة أخرى.');
      }
      if (state.conversationActive && !state.busy && !state.speaking) scheduleListeningRestart(300);
      else if (!state.busy && !state.speaking) setVisual('idle');
    };

    recognition.onend = () => {
      state.listening = false;
      if (state.transcriptBuffer.trim() && !state.busy && !state.speaking) {
        scheduleTranscriptFlush(900);
        return;
      }
      if (state.conversationActive && !state.busy && !state.speaking) {
        scheduleListeningRestart(300);
      } else if (!state.busy && !state.speaking) {
        setVisual('idle');
      }
    };

    state.recognition = recognition;
    return recognition;
  }

  function unlockAudio() {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.resume();
      const warmup = new SpeechSynthesisUtterance('');
      warmup.lang = 'ar-AE';
      warmup.volume = 0;
      window.speechSynthesis.speak(warmup);
    } catch {}
  }

  async function startConversationFromUserGesture() {
    const { launcher } = ui();
    const recognition = state.recognition || setupRecognition();
    if (!recognition) return;

    state.conversationActive = true;
    state.restartAttempts = 0;
    showError('');
    stopSpeaking();
    unlockAudio();

    try {
      if (!state.greetedThisVisit && state.voiceEnabled) {
        state.greetedThisVisit = true;
        await speak('أهلاً بيك في ARABISK. أنا شمس، معاك. قول لي تحب تعمل إيه وأنا أساعدك.');
      }

      recognition.lang = RECOGNITION_LANGUAGES[state.dialect] || 'ar-AE';
      recognition.start();
      launcher?.classList.add('is-listening');
    } catch (error) {
      if (!/already started|recognition has already started/i.test(String(error?.message || ''))) {
        showError('تعذر تشغيل الميكروفون. اضغط شمس مرة أخرى.');
        setVisual('error');
      }
    }
  }

  function stopConversation() {
    state.conversationActive = false;
    window.clearTimeout(state.restartTimer);
    clearSilenceTimer();
    state.transcriptBuffer = '';
    state.lastFinalTranscript = '';
    state.lastFinalTranscriptAt = 0;
    try { state.recognition?.abort(); } catch {}
    state.listening = false;
    stopSpeaking();
    setVisual('idle');
  }

  function toggleVoice() {
    if (state.listening || state.conversationActive) {
      stopConversation();
      return;
    }
    startConversationFromUserGesture();
  }

  function setup() {
    ensureStyles();
    createUi();

    const { launcher } = ui();
    if (!launcher) return;

    state.sessionId = getSessionId();
    state.dialect = detectInitialDialect();
    state.voiceEnabled = 'speechSynthesis' in window;
    setupRecognition();
    if (!state.voiceEnabled) {
      showError('الصوت غير متاح في هذا المتصفح.');
      setVisual('error');
    }

    launcher.addEventListener('click', toggleVoice);
    window.addEventListener('pagehide', saveVoiceContinuity);
    window.addEventListener('beforeunload', saveVoiceContinuity);
  }

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.addEventListener('voiceschanged', () => window.speechSynthesis.getVoices());
    } catch {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }

  window.ARABISK_SHAMS = {
    open: () => startConversationFromUserGesture(),
    close: stopConversation,
    send: sendMessage
  };
})();
