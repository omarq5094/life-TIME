const CURRENT_USER_KEY = "life-countdown-current-user";
const STATE_PREFIX = "life-countdown-state:";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

let currentUser = null;
let state = null;
let tickTimer = null;

const el = {
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
  logoutButton: document.getElementById("logoutButton"),
  hardResetButton: document.getElementById("hardResetButton"),
  timeRemaining: document.getElementById("timeRemaining"),
  currentActivity: document.getElementById("currentActivity"),
  dayProgressBar: document.getElementById("dayProgressBar"),
  dayProgressLabel: document.getElementById("dayProgressLabel"),
  cycleStartLabel: document.getElementById("cycleStartLabel"),
  cycleEndLabel: document.getElementById("cycleEndLabel"),
  templateSelect: document.getElementById("templateSelect"),
  applyTemplateButton: document.getElementById("applyTemplateButton"),
  saveTemplateButton: document.getElementById("saveTemplateButton"),
  deleteTemplateButton: document.getElementById("deleteTemplateButton"),
  addActivityForm: document.getElementById("addActivityForm"),
  activityName: document.getElementById("activityName"),
  activityCategory: document.getElementById("activityCategory"),
  activityBudget: document.getElementById("activityBudget"),
  sleepEnabled: document.getElementById("sleepEnabled"),
  sleepStart: document.getElementById("sleepStart"),
  sleepEnd: document.getElementById("sleepEnd"),
  countdownPreset: document.getElementById("countdownPreset"),
  countdownEndTime: document.getElementById("countdownEndTime"),
  budgetTotal: document.getElementById("budgetTotal"),
  budgetAvailable: document.getElementById("budgetAvailable"),
  usedTotal: document.getElementById("usedTotal"),
  resetTodayButton: document.getElementById("resetTodayButton"),
  pauseAllButton: document.getElementById("pauseAllButton"),
  quickReport: document.getElementById("quickReport"),
  activityCount: document.getElementById("activityCount"),
  activitiesGrid: document.getElementById("activitiesGrid"),
  streakValue: document.getElementById("streakValue"),
  topActivity: document.getElementById("topActivity"),
  weekSummary: document.getElementById("weekSummary"),
  scoreValue: document.getElementById("scoreValue"),
  analysisGrid: document.getElementById("analysisGrid"),
  adviceList: document.getElementById("adviceList"),
  toast: document.getElementById("toast")
};

const defaultTemplates = {
  "يوم دوام": {
    locked: true,
    activities: [
      activitySeed("النوم", "sleep", 7.5, true),
      activitySeed("العمل", "productive", 8),
      activitySeed("المذاكرة", "productive", 2),
      activitySeed("النادي", "health", 1),
      activitySeed("العائلة", "social", 2),
      activitySeed("راحة", "rest", 2)
    ]
  },
  "يوم مذاكرة": {
    locked: true,
    activities: [
      activitySeed("النوم", "sleep", 8, true),
      activitySeed("مذاكرة عميقة", "productive", 5),
      activitySeed("مراجعة", "productive", 2),
      activitySeed("نادي", "health", 1),
      activitySeed("راحة", "rest", 2),
      activitySeed("سوشال", "consumption", 1)
    ]
  },
  "يوم إجازة": {
    locked: true,
    activities: [
      activitySeed("النوم", "sleep", 8, true),
      activitySeed("العائلة", "social", 4),
      activitySeed("ترفيه", "rest", 3),
      activitySeed("نادي", "health", 1),
      activitySeed("قراءة", "productive", 1.5)
    ]
  }
};

function activitySeed(name, category, hours, isSleepBlock = false) {
  return {
    id: `${category}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    category,
    budgetMs: hours * HOUR_MS,
    usedMs: 0,
    runningSince: null,
    warned: false,
    isSleepBlock
  };
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function stateKey() {
  return `${STATE_PREFIX}${currentUser.email}`;
}

function defaultActivities() {
  return [
    activitySeed("النوم", "sleep", 7.5, true),
    activitySeed("المذاكرة", "productive", 4),
    activitySeed("العمل", "productive", 6),
    activitySeed("السوشال", "consumption", 1.5),
    activitySeed("النادي", "health", 1),
    activitySeed("العائلة", "social", 2),
    activitySeed("الترفيه", "rest", 2)
  ];
}

function defaultState() {
  return {
    day: getPersonalDayKey(),
    streak: 0,
    history: {},
    countdownEndTime: "00:00",
    sleep: {
      enabled: true,
      start: "23:00",
      end: "06:30"
    },
    templates: structuredCloneSafe(defaultTemplates),
    activities: defaultActivities()
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function readCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(stateKey());
    if (!raw) return defaultState();
    const loaded = JSON.parse(raw);
    return normalizeState(loaded);
  } catch (error) {
    showToast("تم إنشاء حالة جديدة لأن بيانات المتصفح كانت تالفة.");
    return defaultState();
  }
}

function normalizeState(loaded) {
  const fresh = defaultState();
  const merged = {
    ...fresh,
    ...loaded,
    sleep: { ...fresh.sleep, ...(loaded.sleep || {}) },
    templates: { ...fresh.templates, ...(loaded.templates || {}) },
    activities: Array.isArray(loaded.activities) ? loaded.activities : fresh.activities
  };

  merged.activities = merged.activities.map((activity) => ({
    warned: false,
    isSleepBlock: false,
    ...activity,
    runningSince: activity.runningSince || null,
    usedMs: Number(activity.usedMs) || 0,
    budgetMs: Number(activity.budgetMs) || HOUR_MS
  }));

  return merged;
}

function saveState() {
  try {
    localStorage.setItem(stateKey(), JSON.stringify(state));
  } catch (error) {
    showToast("تعذر حفظ البيانات في localStorage.");
  }
}

function parseTimeToDate(time, base = new Date()) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  const date = new Date(base);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function getCycleEnd(now = new Date(), endTime = state?.countdownEndTime || "00:00") {
  const end = parseTimeToDate(endTime, now);
  if (now.getTime() >= end.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}

function getCycleStart(now = new Date(), endTime = state?.countdownEndTime || "00:00") {
  return new Date(getCycleEnd(now, endTime).getTime() - DAY_MS);
}

function getPersonalDayKey(now = new Date(), endTime = "00:00") {
  return getCycleStart(now, endTime).toISOString().slice(0, 10);
}

function sleepBudgetMs(start, end) {
  const startDate = parseTimeToDate(start);
  const endDate = parseTimeToDate(end);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
  return endDate.getTime() - startDate.getTime();
}

function currentUsed(activity, now = Date.now()) {
  return activity.usedMs + (activity.runningSince ? now - activity.runningSince : 0);
}

function pauseAll({ shouldSave = true, shouldRender = true } = {}) {
  const now = Date.now();
  state.activities = state.activities.map((activity) => {
    if (!activity.runningSince) return activity;
    return {
      ...activity,
      usedMs: activity.usedMs + (now - activity.runningSince),
      runningSince: null
    };
  });
  if (shouldSave) saveState();
  if (shouldRender) render();
}

function startActivity(id) {
  const now = Date.now();

  state.activities = state.activities.map((activity) => {
    if (activity.id === id) {
      if (activity.runningSince) {
        return {
          ...activity,
          usedMs: activity.usedMs + (now - activity.runningSince),
          runningSince: null
        };
      }

      return {
        ...activity,
        runningSince: now
      };
    }

    if (activity.runningSince) {
      return {
        ...activity,
        usedMs: activity.usedMs + (now - activity.runningSince),
        runningSince: null
      };
    }

    return activity;
  });

  saveState();
  render();
}

function resetToday() {
  pauseAll({ shouldSave: false, shouldRender: false });
  state.activities = state.activities.map((activity) => ({
    ...activity,
    usedMs: 0,
    runningSince: null,
    warned: false
  }));
  saveState();
  render();
}

function hardReset() {
  try {
    localStorage.removeItem(stateKey());
  } catch (error) {
    showToast("تعذر حذف حالة المستخدم.");
  }
  state = defaultState();
  syncSleepBlock();
  saveState();
  render();
}

function logout() {
  pauseAll({ shouldSave: true, shouldRender: false });
  localStorage.removeItem(CURRENT_USER_KEY);
  window.location.href = "index.html";
}

function summarizeDay(now = Date.now()) {
  const totalUsed = state.activities.reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const byCategory = {};
  state.activities.forEach((activity) => {
    byCategory[activity.category] = (byCategory[activity.category] || 0) + currentUsed(activity, now);
  });
  return {
    date: state.day,
    totalUsed,
    byCategory,
    activities: state.activities.map((activity) => ({
      name: activity.name,
      category: activity.category,
      budgetMs: activity.budgetMs,
      usedMs: currentUsed(activity, now)
    }))
  };
}

function rolloverIfNeeded() {
  const currentDay = getPersonalDayKey(new Date(), state?.countdownEndTime || "00:00");
  if (!state || state.day === currentDay) return;

  pauseAll({ shouldSave: false, shouldRender: false });
  const summary = summarizeDay();
  state.history[state.day] = summary;
  if (summary.totalUsed > 0) state.streak = (Number(state.streak) || 0) + 1;
  state.day = currentDay;
  state.activities = state.activities.map((activity) => ({
    ...activity,
    usedMs: 0,
    runningSince: null,
    warned: false
  }));
  saveState();
}

function syncSleepBlock() {
  const sleepMs = sleepBudgetMs(state.sleep.start, state.sleep.end);
  const index = state.activities.findIndex((activity) => activity.isSleepBlock || activity.category === "sleep" && activity.name === "النوم");

  if (!state.sleep.enabled) {
    if (index >= 0) {
      state.activities[index] = { ...state.activities[index], isSleepBlock: false };
    }
    return;
  }

  if (index >= 0) {
    state.activities[index] = {
      ...state.activities[index],
      name: "النوم",
      category: "sleep",
      budgetMs: sleepMs,
      isSleepBlock: true
    };
    return;
  }

  state.activities.unshift({
    ...activitySeed("النوم", "sleep", sleepMs / HOUR_MS, true),
    budgetMs: sleepMs
  });
}

function applyTemplate(name) {
  const template = state.templates[name];
  if (!template) return;
  pauseAll({ shouldSave: false, shouldRender: false });
  state.activities = structuredCloneSafe(template.activities).map((activity) => ({
    ...activity,
    id: `${activity.category}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    usedMs: 0,
    runningSince: null,
    warned: false
  }));
  syncSleepBlock();
  saveState();
  render();
}

function saveCurrentTemplate() {
  const name = prompt("اسم الـ Template الجديد:");
  if (!name) return;
  state.templates[name.trim()] = {
    locked: false,
    activities: state.activities.map((activity) => ({
      ...activity,
      usedMs: 0,
      runningSince: null,
      warned: false
    }))
  };
  saveState();
  render();
}

function deleteTemplate() {
  const name = el.templateSelect?.value;
  if (!name || !state.templates[name]) return;
  if (state.templates[name].locked) {
    showToast("لا يمكن حذف Templates الافتراضية.");
    return;
  }
  delete state.templates[name];
  saveState();
  render();
}

function addActivity(event) {
  event.preventDefault();
  const name = el.activityName.value.trim();
  const hours = Number(el.activityBudget.value);
  if (!name || !hours) return;
  state.activities.push(activitySeed(name, el.activityCategory.value, hours));
  saveState();
  el.addActivityForm.reset();
  render();
}

function deleteActivity(id) {
  const activity = state.activities.find((item) => item.id === id);
  if (!activity) return;
  if (activity.isSleepBlock && state.sleep.enabled) {
    showToast("Sleep Block ثابت. عطّله من إعدادات النوم بدل الحذف.");
    return;
  }
  if (activity.runningSince) {
    startActivity(id);
  }
  state.activities = state.activities.filter((item) => item.id !== id);
  saveState();
  render();
}

function updateSleep() {
  state.sleep.enabled = Boolean(el.sleepEnabled.checked);
  state.sleep.start = el.sleepStart.value || "23:00";
  state.sleep.end = el.sleepEnd.value || "06:30";
  syncSleepBlock();
  saveState();
  render();
}

function updateCountdownEnd() {
  const value = el.countdownEndTime.value || "00:00";
  state.countdownEndTime = value;
  state.day = getPersonalDayKey(new Date(), value);
  saveState();
  render();
}

function formatMs(ms, options = {}) {
  const sign = ms < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(ms / 1000));
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  const seconds = absolute % 60;
  if (options.short) {
    if (hours) return `${sign}${hours}h ${minutes}m`;
    if (minutes) return `${sign}${minutes}m`;
    return `${sign}${seconds}s`;
  }
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTime(date) {
  return date.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
}

function percent(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function renderTemplates() {
  if (!el.templateSelect) return;
  const selected = el.templateSelect.value;
  el.templateSelect.innerHTML = Object.keys(state.templates)
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}${state.templates[name].locked ? " • ثابت" : ""}</option>`)
    .join("");
  if (state.templates[selected]) el.templateSelect.value = selected;
}

function renderSettings() {
  if (el.sleepEnabled) el.sleepEnabled.checked = state.sleep.enabled;
  if (el.sleepStart) el.sleepStart.value = state.sleep.start;
  if (el.sleepEnd) el.sleepEnd.value = state.sleep.end;
  if (el.countdownEndTime) el.countdownEndTime.value = state.countdownEndTime;
  if (el.countdownPreset) {
    const presets = ["00:00", "06:00", "08:00"];
    el.countdownPreset.value = presets.includes(state.countdownEndTime) ? state.countdownEndTime : "custom";
  }
}

function renderCounter(nowDate = new Date()) {
  const cycleEnd = getCycleEnd(nowDate);
  const cycleStart = new Date(cycleEnd.getTime() - DAY_MS);
  const remaining = cycleEnd.getTime() - nowDate.getTime();
  const elapsed = DAY_MS - remaining;
  const running = state.activities.find((activity) => activity.runningSince);

  setText(el.timeRemaining, formatMs(remaining));
  setText(el.currentActivity, running ? running.name : "متوقف");
  setText(el.dayProgressLabel, `${Math.round(percent(elapsed, DAY_MS))}%`);
  setText(el.cycleStartLabel, formatTime(cycleStart));
  setText(el.cycleEndLabel, formatTime(cycleEnd));
  if (el.dayProgressBar) el.dayProgressBar.style.width = `${percent(elapsed, DAY_MS)}%`;
}

function renderSummary(now = Date.now()) {
  const totalBudget = state.activities.reduce((sum, activity) => sum + activity.budgetMs, 0);
  const totalUsed = state.activities.reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const available = DAY_MS - totalBudget;
  setText(el.budgetTotal, formatMs(totalBudget, { short: true }));
  setText(el.budgetAvailable, formatMs(available, { short: true }));
  setText(el.usedTotal, formatMs(totalUsed, { short: true }));
  setText(el.activityCount, `${state.activities.length} نشاط`);

  const top = [...state.activities].sort((a, b) => currentUsed(b, now) - currentUsed(a, now))[0];
  setText(el.streakValue, state.streak || 0);
  setText(el.topActivity, top && currentUsed(top, now) > 0 ? top.name : "-");
  setText(el.weekSummary, formatMs(weekTotal(), { short: true }));

  const productive = state.activities
    .filter((activity) => activity.category === "productive" || activity.category === "health")
    .reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const consumption = state.activities
    .filter((activity) => activity.category === "consumption")
    .reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const tracked = totalUsed || 1;
  setText(el.quickReport, totalUsed ? `إنتاجي/صحي ${Math.round(productive / tracked * 100)}%، استهلاك ${Math.round(consumption / tracked * 100)}%، والمتتبع ${formatMs(totalUsed, { short: true })}.` : "ابدأ نشاطًا لترى التقرير.");
}

function weekTotal() {
  const entries = Object.values(state.history || {});
  return entries.slice(-7).reduce((sum, day) => sum + (day.totalUsed || 0), 0);
}

function renderActivities(now = Date.now()) {
  if (!el.activitiesGrid) return;
  el.activitiesGrid.innerHTML = state.activities.map((activity) => {
    const used = currentUsed(activity, now);
    const remaining = activity.budgetMs - used;
    const usage = percent(used, activity.budgetMs);
    const over = used > activity.budgetMs;
    const status = over ? "متجاوز" : activity.runningSince ? "يعمل الآن" : "متوقف";
    maybeNotify(activity, used);

    return `
      <article class="activity-card ${over ? "over" : ""}">
        <div class="activity-top">
          <div>
            <h3 class="activity-title">${escapeHtml(activity.name)}</h3>
            <span class="badge">${escapeHtml(activity.category)}</span>
          </div>
          <span class="status ${activity.runningSince ? "running" : ""} ${over ? "over" : ""}">${status}</span>
        </div>
        <div class="ring-row">
          <div class="ring" style="--value:${Math.min(360, usage * 3.6)}deg" data-label="${Math.round(usage)}%"></div>
          <div class="activity-meta">
            <span>الميزانية ${formatMs(activity.budgetMs, { short: true })}</span>
            <strong>${formatMs(remaining, { short: true })}</strong>
          </div>
        </div>
        <div class="activity-bar"><span style="width:${Math.min(100, usage)}%"></span></div>
        <div class="activity-actions">
          <button class="${activity.runningSince ? "warning-button" : "primary-button"}" data-action="start" data-id="${activity.id}" type="button">${activity.runningSince ? "Pause" : "Start"}</button>
          <button class="danger-button" data-action="delete" data-id="${activity.id}" type="button">حذف</button>
        </div>
      </article>
    `;
  }).join("");
}

function buildAnalysis(now = Date.now()) {
  const tracked = state.activities.reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const sleep = state.activities.find((activity) => activity.category === "sleep" || activity.isSleepBlock);
  const sleepUsed = sleep ? currentUsed(sleep, now) : 0;
  const sleepRatio = sleep && sleep.budgetMs ? sleepUsed / sleep.budgetMs : 0;
  const studyTerms = ["مذاكرة", "مراجعة", "قراءة", "دراسة", "تعلم"];
  const study = state.activities
    .filter((activity) => studyTerms.some((term) => activity.name.includes(term)))
    .reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const productive = state.activities
    .filter((activity) => activity.category === "productive" || activity.category === "health")
    .reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const consumption = state.activities
    .filter((activity) => activity.category === "consumption")
    .reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const restSocial = state.activities
    .filter((activity) => activity.category === "rest" || activity.category === "social")
    .reduce((sum, activity) => sum + currentUsed(activity, now), 0);
  const overBudget = state.activities.filter((activity) => currentUsed(activity, now) > activity.budgetMs);
  const budgetTotal = state.activities.reduce((sum, activity) => sum + activity.budgetMs, 0);

  let sleepText = "لم يبدأ تتبع النوم بعد.";
  let sleepGood = false;
  if (sleepUsed > 0 && sleep) {
    if (sleepRatio < 0.8) sleepText = "النوم أقل من 80% من المخطط.";
    else if (sleepRatio <= 1.15) {
      sleepText = "النوم ضمن نطاق جيد.";
      sleepGood = true;
    } else sleepText = "النوم أكثر من 115% من المخطط.";
  }

  let score = 0;
  if (tracked > 0) {
    score = 50;
    if (sleepGood) score += 15;
    if (productive / tracked >= 0.45) score += 20;
    if (consumption / tracked <= 0.2) score += 10;
    if (!overBudget.length) score += 10;
    if (budgetTotal <= DAY_MS) score += 5;
  }

  const advice = [];
  if (!tracked) advice.push("ابدأ نشاط 10 دقائق.");
  if (sleepUsed > 0 && sleepRatio < 0.8) advice.push("النوم أقل من المخطط.");
  if (tracked && productive / tracked < 0.45) advice.push("شغل جلسة 25 دقيقة.");
  if (tracked && consumption / tracked > 0.2) advice.push("أوقف السوشال مؤقتًا.");
  if (overBudget.length) advice.push("راجع الميزانية للأنشطة المتجاوزة.");
  if (!advice.length) advice.push("اليوم متوازن.");

  return {
    score: Math.min(100, score),
    cards: [
      ["النوم", sleepText],
      ["المذاكرة", `${formatMs(study, { short: true })} من وقت التعلم والمراجعة.`],
      ["Productive", `${tracked ? Math.round(productive / tracked * 100) : 0}% من الوقت المتتبع.`],
      ["Consumption", `${tracked ? Math.round(consumption / tracked * 100) : 0}% من الوقت المتتبع.`],
      ["الراحة / العائلة", `${formatMs(restSocial, { short: true })} مسجلة للراحة والعلاقات.`],
      ["Over Budget", `${overBudget.length} نشاط متجاوز.`]
    ],
    advice
  };
}

function renderAnalysis(now = Date.now()) {
  const analysis = buildAnalysis(now);
  setText(el.scoreValue, analysis.score);
  if (el.analysisGrid) {
    el.analysisGrid.innerHTML = analysis.cards.map(([title, body]) => `
      <article class="analysis-card">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(body)}</p>
      </article>
    `).join("");
  }
  if (el.adviceList) {
    el.adviceList.innerHTML = analysis.advice.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }
}

function render() {
  if (!state) return;
  rolloverIfNeeded();
  const now = Date.now();
  renderTemplates();
  renderSettings();
  renderCounter(new Date(now));
  renderSummary(now);
  renderActivities(now);
  renderAnalysis(now);
}

function setText(node, text) {
  if (node) node.textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add("show");
  window.setTimeout(() => el.toast.classList.remove("show"), 2800);
}

function maybeNotify(activity, used) {
  if (used <= activity.budgetMs || activity.warned) return;
  activity.warned = true;
  saveState();

  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("تجاوزت الوقت المحدد", {
      body: `${activity.name} تجاوز الميزانية`
    });
  } catch (error) {
    // Notifications are optional and should never break tracking.
  }
}

function bindEvents() {
  el.logoutButton?.addEventListener("click", logout);
  el.hardResetButton?.addEventListener("click", hardReset);
  el.resetTodayButton?.addEventListener("click", resetToday);
  el.pauseAllButton?.addEventListener("click", () => pauseAll());
  el.applyTemplateButton?.addEventListener("click", () => applyTemplate(el.templateSelect.value));
  el.saveTemplateButton?.addEventListener("click", saveCurrentTemplate);
  el.deleteTemplateButton?.addEventListener("click", deleteTemplate);
  el.addActivityForm?.addEventListener("submit", addActivity);

  el.sleepEnabled?.addEventListener("change", updateSleep);
  el.sleepStart?.addEventListener("change", updateSleep);
  el.sleepEnd?.addEventListener("change", updateSleep);

  el.countdownPreset?.addEventListener("change", () => {
    if (el.countdownPreset.value !== "custom") {
      el.countdownEndTime.value = el.countdownPreset.value;
      updateCountdownEnd();
    }
  });
  el.countdownEndTime?.addEventListener("change", updateCountdownEnd);

  el.activitiesGrid?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "start") startActivity(id);
    if (button.dataset.action === "delete") deleteActivity(id);
  });
}

function init() {
  currentUser = readCurrentUser();
  if (!currentUser || !currentUser.email) {
    window.location.href = "index.html";
    return;
  }

  setText(el.userName, currentUser.name || "مستخدم");
  setText(el.userEmail, currentUser.email);
  state = loadState();
  syncSleepBlock();
  rolloverIfNeeded();
  saveState();
  bindEvents();
  render();
  tickTimer = window.setInterval(render, 1000);
}

window.addEventListener("beforeunload", () => {
  if (state) saveState();
  if (tickTimer) window.clearInterval(tickTimer);
});

init();
