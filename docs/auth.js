const API_URL = "https://script.google.com/macros/s/AKfycbzXAOoiMRpIgju4RMIUZU2ywhJBdDxUFFDCkxi0Cwd1TkuUPIpVuKq9Nu1Cnm1zSqss/exec";
const CURRENT_USER_KEY = "life-countdown-current-user";

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const authForm = document.getElementById("authForm");
const nameField = document.getElementById("nameField");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitButton = document.getElementById("submitButton");
const authMessage = document.getElementById("authMessage");

let authMode = "login";

function setMessage(text, type = "") {
  if (!authMessage) return;
  authMessage.textContent = text;
  authMessage.className = `form-message ${type}`.trim();
}

function setMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  loginTab.classList.toggle("active", !isRegister);
  registerTab.classList.toggle("active", isRegister);
  loginTab.setAttribute("aria-selected", String(!isRegister));
  registerTab.setAttribute("aria-selected", String(isRegister));
  nameField.classList.toggle("hidden", !isRegister);
  nameInput.required = isRegister;
  submitButton.textContent = isRegister ? "إنشاء حساب" : "دخول";
  passwordInput.autocomplete = isRegister ? "new-password" : "current-password";
  setMessage("");
}

function saveCurrentUser(user) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
    user_id: user.user_id,
    name: user.name,
    email: user.email
  }));
}

async function submitAuth(event) {
  event.preventDefault();
  setMessage("جاري الاتصال...", "");
  submitButton.disabled = true;

  const payload = {
    action: authMode,
    email: emailInput.value.trim(),
    password: passwordInput.value
  };

  if (authMode === "register") {
    payload.name = nameInput.value.trim();
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!data.ok || !data.user) {
      throw new Error(data.message || "تعذر تنفيذ العملية.");
    }

    saveCurrentUser(data.user);
    setMessage("تم بنجاح. سيتم نقلك الآن...", "success");
    window.location.href = "dashboard.html";
  } catch (error) {
    setMessage(error.message || "حدث خطأ غير متوقع.", "error");
  } finally {
    submitButton.disabled = false;
  }
}

try {
  const existingUser = localStorage.getItem(CURRENT_USER_KEY);
  if (existingUser) {
    window.location.href = "dashboard.html";
  }
} catch (error) {
  setMessage("المتصفح يمنع الوصول إلى localStorage.", "error");
}

loginTab?.addEventListener("click", () => setMode("login"));
registerTab?.addEventListener("click", () => setMode("register"));
authForm?.addEventListener("submit", submitAuth);
