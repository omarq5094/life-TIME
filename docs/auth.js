const SUPABASE_URL = "https://ajqwioyahkmmvhmfetus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_73l7upx07nFZ3dVu-s9KAQ_7wm7GNWa";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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

async function redirectIfLoggedIn() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    window.location.href = "dashboard.html";
  }
}

showLoginButton.addEventListener("click", () => setMode("login"));
showRegisterButton.addEventListener("click", () => setMode("register"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const displayName = displayNameInput.value.trim();

  authSubmitButton.disabled = true;
  showMessage("جار التنفيذ...");

  try {
    if (authMode === "register") {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        await supabaseClient.from("profiles").upsert({
          id: data.user.id,
          display_name: displayName,
        });
      }

      if (data.session) {
        window.location.href = "dashboard.html";
        return;
      }

      showMessage("تم إنشاء الحساب. إذا كان تأكيد البريد مفعّلًا، افتح Email وفعّل الحساب.", "success");
      return;
    }

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    window.location.href = "dashboard.html";
  } catch (error) {
    showMessage(error.message || "صار خطأ غير متوقع.", "error");
  } finally {
    authSubmitButton.disabled = false;
  }
});

redirectIfLoggedIn();
