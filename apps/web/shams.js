(() => {
  const state = {
    open: false,
    listening: false,
    speaking: false,
    history: []
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);

  const ensureStyles = () => {
    if (document.getElementById('arabisk-shams-style')) return;
    const link = document.createElement('link');
    link.id = 'arabisk-shams-style';
    link.rel = 'stylesheet';
    link.href = '/shams.css';
    document.head.appendChild(link);
  };

  const createUi = () => {
    if (document.getElementById('arabisk-shams-root')) return;
    const root = document.createElement('section');
    root.id = 'arabisk-shams-root';
    root.innerHTML = `
      <button class="shams-launcher" id="shams-launcher" type="button" aria-label="تحدث مع شمس" aria-expanded="false">
        <span class="shams-sun" aria-hidden="true">☀</span>
        <span class="shams-launcher-label">شمس</span>
      </button>
      <div class="shams-shell" id="shams-shell" hidden>
        <div class="shams-head">
          <div class="shams-identity">
            <span class="shams-avatar" aria-hidden="true">☀</span>
            <div>
              <strong>شمس</strong>
              <small>مساعدة ARABISK</small>
            </div>
          </div>
          <div class="shams-head-actions">
            <button id="shams-voice-toggle" type="button" class="shams-icon-button" aria-label="تفعيل الصوت">🔊</button>
            <button id="shams-close" type="button" class="shams-icon-button" aria-label="إغلاق">×</button>
          </div>
        </div>
        <div class="shams-messages" id="shams-messages" aria-live="polite"></div>
        <div class="shams-suggestions" id="shams-suggestions">
          <button type="button" data-shams-prompt="ساعديني أختار أكلي">✨ اختاري لي</button>
          <button type="button" data-shams-prompt="أريد حجز طاولة">📅 حجز طاولة</button>
          <button type="button" data-shams-prompt="افتحي المنيو">🍽 المنيو</button>
        </div>
        <div class="shams-input-row">
          <button id="shams-mic" type="button" class="shams-mic" aria-label="تحدث مع شمس">🎙️</button>
          <input id="shams-input" type="text" maxlength="1200" autocomplete="off" placeholder="قولي لشمس ماذا تحتاجين…" aria-label="رسالتك لشمس">
          <button id="shams-send" type="button" class="shams-send" aria-label="إرسال">➤</button>
        </div>
        <div class="shams-status" id="shams-status">يمكنك الكتابة أو التحدث مع شمس.</div>
      </div>
    `;
    document.body.appendChild(root);
  };

  const ui = () => ({
    root: document.getElementById('arabisk-shams-root'),
    launcher: document.getElementById('shams-launcher'),
    shell: document.getElementById('shams-shell'),
    messages: document.getElementById('shams-messages'),
    input: document.getElementById('shams-input'),
    send: document.getElementById('shams-send'),
    mic: document.getElementById('shams-mic'),
    status: document.getElementById('shams-status'),
    voiceToggle: document.getElementById('shams-voice-toggle'),
    close: document.getElementById('shams-close'),
    suggestions: document.getElementById('shams-suggestions')
  });

  const addMessage = (role, content, actions = []) => {
    const { messages } = ui();
    if (!messages) return;
    const item = document.createElement('div');
    item.className = 'shams-message ' + role;
    item.innerHTML = `
      <div class="shams-message-bubble">${esc(content).replace(/\\n/g,'<br>')}</div>
      ${Array.isArray(actions) && actions.length ? '<div class="shams-actions">' + actions.map(action => `
        <button type="button" data-shams-action="${esc(action?.url || '')}">${esc(action?.label || 'فتح')}</button>
      `).join('') + '</div>' : ''}
    `;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    state.history.push({ role, content: String(content || '').slice(0, 1200) });
    state.history = state.history.slice(-12);
    item.querySelectorAll('[data-shams-action]').forEach(button => {
      button.addEventListener('click', () => {
        const url = button.getAttribute('data-shams-action') || '/';
        if (/^\/(?!\/)/.test(url)) window.location.assign(url);
      });
    });
  };

  const setStatus = (message) => {
    const node = ui().status;
    if (node) node.textContent = message;
  };

  const setOpen = (open) => {
    state.open = open;
    const { shell, launcher } = ui();
    if (!shell || !launcher) return;
    shell.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!ui().messages?.children.length) {
        addMessage('assistant', 'أهلاً بك 🌞 أنا شمس، قولي لي ماذا تحتاج.');
      }
    }
  };

  const speak = (text) => {
    if (!state.speaking || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 900));
    utterance.lang = 'ar-AE';
    utterance.rate = 0.97;
    utterance.pitch = 1.02;
    utterance.onstart = () => setStatus('شمس تتحدث الآن…');
    utterance.onend = () => setStatus('يمكنك الكتابة أو التحدث مع شمس.');
    window.speechSynthesis.speak(utterance);
  };

  const send = async (forcedMessage = '') => {
    const { input, send: sendButton } = ui();
    const message = String(forcedMessage || input?.value || '').trim();
    if (!message) return;
    if (input) input.value = '';
    if (sendButton) sendButton.disabled = true;
    addMessage('user', message);
    setStatus('شمس تفكر…');

    try {
      const profileToken = window.ARABISK_PROFILE?.getToken?.() || '';
      const response = await fetch('/api/shams/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(profileToken ? { 'X-ARABISK-PROFILE-TOKEN': profileToken } : {})
        },
        body: JSON.stringify({
          message,
          history: state.history.slice(-11, -1)
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'تعذر تشغيل شمس الآن.');
      addMessage('assistant', data.reply || 'أنا هنا لمساعدتك.', data.actions || []);
      speak(data.reply || '');
      setStatus('جاهزة لك.');
    } catch (error) {
      addMessage('assistant', error.message || 'تعذر تشغيل شمس الآن.');
      setStatus('حدث خطأ بسيط، جرّب مرة أخرى.');
    } finally {
      if (sendButton) sendButton.disabled = false;
    }
  };

  const setupVoice = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const { mic } = ui();
    if (!mic) return;
    if (!SpeechRecognition) {
      mic.disabled = true;
      mic.title = 'المتصفح لا يدعم التعرف الصوتي هنا';
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-AE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      state.listening = true;
      mic.classList.add('is-listening');
      setStatus('شمس تستمع… تكلم الآن.');
    };
    recognition.onresult = (event) => {
      const phrase = event.results?.[0]?.[0]?.transcript?.trim() || '';
      if (phrase) void send(phrase);
    };
    recognition.onerror = () => {
      state.listening = false;
      mic.classList.remove('is-listening');
      setStatus('لم ألتقط الصوت. جرّب مرة أخرى.');
    };
    recognition.onend = () => {
      state.listening = false;
      mic.classList.remove('is-listening');
      if (!state.speaking) setStatus('يمكنك الكتابة أو التحدث مع شمس.');
    };

    mic.addEventListener('click', () => {
      if (state.listening) recognition.stop();
      else {
        setOpen(true);
        try { recognition.start(); } catch {}
      }
    });
  };

  const setup = () => {
    ensureStyles();
    createUi();
    const { launcher, close, send: sendButton, input, voiceToggle, suggestions } = ui();
    if (!launcher || !close || !sendButton || !input) return;

    state.speaking = 'speechSynthesis' in window;
    voiceToggle?.classList.toggle('is-active', state.speaking);
    voiceToggle?.addEventListener('click', () => {
      state.speaking = !state.speaking;
      voiceToggle.classList.toggle('is-active', state.speaking);
      voiceToggle.setAttribute('aria-pressed', String(state.speaking));
      if (!state.speaking && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    });
    launcher.addEventListener('click', () => setOpen(!state.open));
    launcher.addEventListener('click', () => {
      window.setTimeout(() => ui().mic?.click(), 0);
    });
    close.addEventListener('click', () => setOpen(false));
    sendButton.addEventListener('click', () => void send());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void send();
      }
    });
    suggestions?.addEventListener('click', event => {
      const button = event.target.closest('[data-shams-prompt]');
      if (button) void send(button.getAttribute('data-shams-prompt') || '');
    });
    setupVoice();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();

  window.ARABISK_SHAMS = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    send
  };
})();