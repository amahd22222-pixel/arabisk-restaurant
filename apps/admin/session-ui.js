const logout = document.getElementById('logout');

logout?.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    await fetch('/auth/logout', { method: 'POST', cache: 'no-store' });
  } finally {
    window.location.replace('/login');
  }
});
