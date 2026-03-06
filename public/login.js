// Check if already logged in
(async () => {
  try {
    const resp = await fetch('/api/auth/me');
    if (resp.ok) {
      window.location.href = '/';
    }
  } catch (e) { /* not logged in */ }
})();

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('btnLogin');

  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'กำลังเข้าสู่ระบบ...';

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();

    if (resp.ok && data.success) {
      window.location.href = '/';
    } else {
      errorEl.textContent = data.error || 'เข้าสู่ระบบไม่สำเร็จ';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'เข้าสู่ระบบ';
  }
}
