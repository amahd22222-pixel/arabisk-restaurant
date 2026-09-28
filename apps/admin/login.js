(() => {
  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const button = form?.querySelector('button[type="submit"]');
  if (!form || !error || !button) return;

  fetch('/auth/session', { cache: 'no-store' })
    .then((response) => { if (response.ok) window.location.replace('/dashboard'); })
    .catch(() => {});

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('login-username')?.value.trim() || '';
    const password = document.getElementById('login-password')?.value || '';
    button.disabled = true;
    error.textContent = 'جارٍ التحقق…';

    try {
      const response = await fetch('/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? 'اسم المستخدم أو كلمة المرور غير صحيحة.' : (data.message || 'تعذر التحقق من بيانات الدخول.'));
      window.location.replace('/dashboard');
    } catch (loginError) {
      error.textContent = loginError.message;
    } finally {
      button.disabled = false;
    }
  });
})();
