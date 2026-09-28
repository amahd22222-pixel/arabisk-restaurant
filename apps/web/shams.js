(() => {
  'use strict';

  const SESSION_KEY = 'ARABISK_SHAMS_SESSION_V1';

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
    dialect: 'gulf'
  };

  const RECOGNITION_LANGUAGES = Object.freeze({
    gulf: 'ar-AE',
    egyptian: 'ar-EG',
    syrian: 'ar-SY',
    lebanese: 'ar-LB'
  });

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

  function scheduleTranscriptFlush(delay = 1600) {
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
          cart: readCart()
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'تعذر تشغيل شمس الآن.');

      const reply = String(data.reply || 'أنا معك.').trim();
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
          if (state.recognition) state.recognition.lang = RECOGNITION_LANGUAGES[detected] || 'ar-AE';
        }
      }

      if (finalText) {
        state.transcriptBuffer = (state.transcriptBuffer + ' ' + finalText).trim();
        scheduleTranscriptFlush(1700);
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
        scheduleTranscriptFlush(700);
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

  function startConversationFromUserGesture() {
    const { launcher } = ui();
    const recognition = state.recognition || setupRecognition();
    if (!recognition) return;

    state.conversationActive = true;
    state.restartAttempts = 0;
    showError('');
    stopSpeaking();
    unlockAudio();

    try {
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
    state.voiceEnabled = 'speechSynthesis' in window;
    setupRecognition();
    if (!state.voiceEnabled) {
      showError('الصوت غير متاح في هذا المتصفح.');
      setVisual('error');
    }

    launcher.addEventListener('click', toggleVoice);
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
