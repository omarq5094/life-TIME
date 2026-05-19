const API_URL = "https://script.google.com/macros/s/AKfycbzXAOoiMRpIgju4RMIUZU2ywhJBdDxUFFDCkxi0Cwd1TkuUPIpVuKq9Nu1Cnm1zSqss/exec";
const USER_KEY = "life-countdown-user";

const authForm = document.querySelector("#authForm");
const nameField = document.querySelector("#nameField");
const displayNameInput = document.querySelector("#displayName");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const authSubmitButton = document.querySelector("#authSubmitButton");
const authMessage = document.querySelector("#authMessage");
const showLoginButton = document.querySelector("#showLoginButton");
const showRegisterButton = document.querySelector("#showRegisterButton");

let authMode = "login";

function setMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";

  nameField.classList.toggle("hidden", !isRegister);
  displayNameInput.required = isRegister;
  authSubmitButton.textContent = isRegister ? "إنشاء حساب" : "دخول";

  showLoginButton.classList.toggle("active", !isRegister);
  showRegisterButton.classList.toggle("active", isRegister);
  authMessage.textContent = "";
}

function showMessage(message, type = "info") {
  authMessage.textContent = message;
  authMessage.dataset.type = type;
}

async function apiRequest(payload) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("تعذر قراءة رد السيرفر. تأكد من نشر Google Apps Script كـ Web App.");
  }
}

function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: user.user_id || user.id,
    user_id: user.user_id || user.id,
    name: user.name || user.display_name || "مستخدم",
    email: user.email,
  }));
}

function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function redirectIfLoggedIn() {
  const user = getSavedUser();
  if (user?.id || user?.user_id) {
    window.location.href = "dashboard.html";
  }
}

showLoginButton.addEventListener("click", () => setMode("login"));
showRegisterButton.addEventListener("click", () => setMode("register"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const displayName = displayNameInput.value.trim();

  authSubmitButton.disabled = true;
  showMessage("جار التنفيذ...");

  try {
    const payload = authMode === "register"
      ? {
          action: "register",
          name: displayName,
          email,
          password,
        }
      : {
          action: "login",
          email,
          password,
        };

    const result = await apiRequest(payload);

    if (!result.ok) {
      throw new Error(result.message || "تعذر تنفيذ العملية.");
    }

    saveUser(result.user);
    window.location.href = "dashboard.html";
  } catch (error) {
    showMessage(error.message || "صار خطأ غير متوقع.", "error");
  } finally {
    authSubmitButton.disabled = false;
  }
});

redirectIfLoggedIn();
