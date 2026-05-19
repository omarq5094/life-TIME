const SUPABASE_URL = "https://ajqwioyahkmmvhmfetus.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_73l7upx07nFZ3dVu-s9KAQ_7wm7GNWa";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const STORAGE_KEY = "life-countdown-os-v3";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COUNTDOWN_END_TIME = "00:00";

const CATEGORY_META = {
  productive: { label: "Productive" },
  health: { label: "Health" },
  rest: { label: "Rest" },
  social: { label: "Social" },
  consumption: { label: "Consumption" },
  sleep: { label: "Sleep" },
};

const DEFAULT_ACTIVITIES = [
  { name: "النوم", hours: 7.5, category: "sleep", isSleepBlock: true },
  { name: "المذاكرة", hours: 4, category: "productive" },
  { name: "العمل", hours: 6, category: "productive" },
  { name: "السوشال", hours: 1.5, category: "consumption" },
  { name: "النادي", hours: 1, category: "health" },
  { name: "العائلة", hours: 2, category: "social" },
  { name: "الترفيه", hours: 2, category: "rest" },
];

const DEFAULT_TEMPLATES = {
  "يوم دوام": [
    { name: "النوم", hours: 7.5, category: "sleep", isSleepBlock: true },
    { name: "العمل", hours: 8, category: "productive" },
    { name: "المذاكرة", hours: 2, category: "productive" },
    { name: "النادي", hours: 1, category: "health" },
    { name: "العائلة", hours: 2, category: "social" },
    { name: "راحة", hours: 2, category: "rest" },
  ],
  "يوم مذاكرة": [
    { name: "النوم", hours: 8, category: "sleep", isSleepBlock: true },
    { name: "مذاكرة عميقة", hours: 5, category: "productive" },
    { name: "مراجعة", hours: 2, category: "productive" },
    { name: "نادي", hours: 1, category: "health" },
    { name: "راحة", hours: 2, category: "rest" },
    { name: "سوشال", hours: 1, category: "consumption" },
  ],
  "يوم إجازة": [
    { name: "النوم", hours: 8, category: "sleep", isSleepBlock: true },
    { name: "العائلة", hours: 4, category: "social" },
    { name: "ترفيه", hours: 3, category: "rest" },
    { name: "نادي", hours: 1, category: "health" },
    { name: "قراءة", hours: 1.5, category: "productive" },
  ],
};

const $ = (selector) => document.querySelector(selector);

let currentUser = null;
let saveTimer = null;
let isLoadingCloudState = false;

let state = loadState();

const elements = {
  dayCountdown: $("#dayCountdown"),
  dayProgress: $("#dayProgress"),
  liveActivity: $("#liveActivity"),
  statusDot: $("#statusDot"),
  activityList: $("#activityList"),
  template: $("#activityTemplate"),
  form: $("#activityForm"),
  nameInput: $("#activityName"),
  hoursInput: $("#activityHours"),
  categoryInput: $("#activityCategory"),
  allocatedHours: $("#allocatedHours"),
  freeHours: $("#freeHours"),
  dailyReport: $("#dailyReport"),
  streakValue: $("#streakValue"),
  topActivity: $("#topActivity"),
  weeklyTotal: $("#weeklyTotal"),
  pauseAllButton: $("#pauseAllButton"),
  resetDayButton: $("#resetDayButton"),
  countdownEndTimeForm: $("#countdownEndTimeForm"),
  countdownEndTimeInput: $("#countdownEndTime"),
  resetCycleInfo: $("#resetCycleInfo"),
  quickTimeButtons: document.querySelectorAll("[data-end-time]"),
  sleepEnabled: $("#sleepEnabled"),
  sleepStart: $("#sleepStart"),
  sleepEnd: $("#sleepEnd"),
  sleepSummary: $("#sleepSummary"),
  templateSelect: $("#templateSelect"),
  applyTemplateButton: $("#applyTemplateButton"),
  saveTemplateButton: $("#saveTemplateButton"),
  deleteTemplateButton: $("#deleteTemplateButton"),
  accountName: $("#accountName"),
  accountEmail: $("#accountEmail"),
  logoutButton: $("#logoutButton"),
};

function normalizeTime(value) {
  return /^\d{2}:\d{2}$/.test(value) ? value : DEFAULT_COUNTDOWN_END_TIME;
}

function getTimeParts(timeText) {
  const [hours, minutes] = normalizeTime(timeText).split(":").map(Number);
  return { hours, minutes };
}

function getCycleEnd(now = new Date(), endTime = DEFAULT_COUNTDOWN_END_TIME) {
  const { hours, minutes } = getTimeParts(endTime);
  const end = new Date(now);
  end.setHours(hours, minutes, 0, 0);

  if (now.getTime() >= end.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

function getCycleStart(now = new Date(), endTime = DEFAULT_COUNTDOWN_END_TIME) {
  const end = getCycleEnd(now, endTime);
  return new Date(end.getTime() - DAY_MS);
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cycleKey(date = new Date(), endTime = DEFAULT_COUNTDOWN_END_TIME) {
  const cycleStart = getCycleStart(date, endTime);
  return todayKey(cycleStart);
}

function formatArabicClock(timeText) {
  const { hours, minutes } = getTimeParts(timeText);
  const period = hours >= 12 ? "م" : "ص";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function timeToMinutes(timeText) {
  const { hours, minutes } = getTimeParts(timeText);
  return hours * 60 + minutes;
}

function sleepDurationMs(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const minutes = end > start ? end - start : 24 * 60 - start + end;
  return minutes * 60 * 1000;
}

function createActivity({ name, hours, category = "productive", isSleepBlock = false }) {
  const budgetMs = Math.round(Number(hours) * 60 * 60 * 1000);
  return {
    id: crypto.randomUUID(),
    name,
    category: CATEGORY_META[category] ? category : "productive",
    budgetMs,
    usedMs: 0,
    runningSince: null,
    warned: false,
    isSleepBlock,
  };
}

function sanitizeActivity(activity) {
  return {
    ...activity,
    id: activity.id || crypto.randomUUID(),
    category: CATEGORY_META[activity.category] ? activity.category : guessCategory(activity.name),
    usedMs: Number(activity.usedMs || 0),
    budgetMs: Number(activity.budgetMs || 0),
    runningSince: activity.runningSince || null,
    warned: Boolean(activity.warned),
    isSleepBlock: Boolean(activity.isSleepBlock || activity.category === "sleep" && activity.name === "النوم"),
  };
}

function guessCategory(name = "") {
  if (name.includes("نوم")) return "sleep";
  if (name.includes("نادي") || name.includes("صحة")) return "health";
  if (name.includes("عائلة")) return "social";
  if (name.includes("سوشال")) return "consumption";
  if (name.includes("ترفيه") || name.includes("راحة")) return "rest";
  return "productive";
}

function defaultSleepSettings() {
  return {
    enabled: true,
    start: "23:00",
    end: "06:30",
  };
}

function cloneTemplateItems(items) {
  return items.map((item) => ({
    name: item.name,
    hours: item.budgetMs ? item.budgetMs / 60 / 60 / 1000 : item.hours,
    category: item.category || guessCategory(item.name),
    isSleepBlock: Boolean(item.isSleepBlock),
  }));
}

function loadState() {
  const fallback = {
    day: cycleKey(new Date(), DEFAULT_COUNTDOWN_END_TIME),
    streak: 0,
    history: {},
    countdownEndTime: DEFAULT_COUNTDOWN_END_TIME,
    sleep: defaultSleepSettings(),
    templates: { ...DEFAULT_TEMPLATES },
    activities: DEFAULT_ACTIVITIES.map(createActivity),
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return normalizeState(fallback);
    return rolloverDay(normalizeState(saved));
  } catch {
    return normalizeState(fallback);
  }
}

function normalizeState(saved) {
  const normalized = {
    ...saved,
    countdownEndTime: normalizeTime(saved.countdownEndTime || DEFAULT_COUNTDOWN_END_TIME),
    history: saved.history || {},
    sleep: {
      ...defaultSleepSettings(),
      ...(saved.sleep || {}),
    },
    templates: {
      ...DEFAULT_TEMPLATES,
      ...(saved.templates || {}),
    },
    activities: Array.isArray(saved.activities) && saved.activities.length
      ? saved.activities.map(sanitizeActivity)
      : DEFAULT_ACTIVITIES.map(createActivity),
  };

  normalized.sleep.start = normalizeTime(normalized.sleep.start || "23:00");
  normalized.sleep.end = normalizeTime(normalized.sleep.end || "06:30");

  return syncSleepBlock(normalized, false);
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState() {
  saveLocalState();

  if (!isLoadingCloudState && currentUser) {
    scheduleCloudSave();
  }
}

function scheduleCloudSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStateToCloud, 550);
}

async function saveStateToCloud() {
  if (!currentUser) return;

  const payload = {
    user_id: currentUser.id,
    day_key: state.day,
    data: state,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseClient
    .from("user_day_state")
    .upsert(payload, { onConflict: "user_id,day_key" });

  if (error) {
    console.error("Cloud save failed:", error.message);
  }
}

async function loadStateFromCloud() {
  if (!currentUser) return;

  const currentDay = cycleKey(new Date(), state.countdownEndTime || DEFAULT_COUNTDOWN_END_TIME);

  const { data, error } = await supabaseClient
    .from("user_day_state")
    .select("data")
    .eq("user_id", currentUser.id)
    .eq("day_key", currentDay)
    .maybeSingle();

  if (error) {
    console.error("Cloud load failed:", error.message);
    return;
  }

  if (data?.data) {
    isLoadingCloudState = true;
    state = rolloverDay(normalizeState(data.data));
    saveLocalState();
    isLoadingCloudState = false;
  }
}

function rolloverDay(saved) {
  saved.countdownEndTime = normalizeTime(saved.countdownEndTime || DEFAULT_COUNTDOWN_END_TIME);
  const currentDay = cycleKey(new Date(), saved.countdownEndTime);
  if (saved.day === currentDay) return saved;

  const endedAt = Date.now();
  const previousActivities = saved.activities.map((activity) => {
    const liveMs = activity.runningSince ? endedAt - activity.runningSince : 0;
    return {
      ...activity,
      usedMs: activity.usedMs + liveMs,
      runningSince: null,
    };
  });

  const totalUsed = previousActivities.reduce((sum, activity) => sum + activity.usedMs, 0);
  const dashboard = buildDashboard(previousActivities, endedAt);

  saved.history = saved.history || {};
  saved.history[saved.day] = {
    totalUsed,
    dashboard,
    activities: previousActivities.map(({ name, category, budgetMs, usedMs, isSleepBlock }) => ({
      name,
      category,
      budgetMs,
      usedMs,
      isSleepBlock,
    })),
  };

  saved.streak = totalUsed > 0 ? (saved.streak || 0) + 1 : 0;
  saved.day = currentDay;
  saved.activities = previousActivities.map((activity) => ({
    ...activity,
    usedMs: 0,
    runningSince: null,
    warned: false,
  }));

  return syncSleepBlock(saved, false);
}

function currentUsed(activity, now = Date.now()) {
  return activity.usedMs + (activity.runningSince ? now - activity.runningSince : 0);
}

function formatTime(ms) {
  const sign = ms < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}:${seconds}`;
}

function formatHours(ms) {
  const hours = ms / 60 / 60 / 1000;
  return `${Number(hours.toFixed(hours % 1 === 0 ? 0 : 1))}h`;
}

function pauseAll() {
  const now = Date.now();
  state.activities = state.activities.map((activity) => {
    if (!activity.runningSince) return activity;
    return {
      ...activity,
      usedMs: activity.usedMs + (now - activity.runningSince),
      runningSince: null,
    };
  });
  saveState();
  render();
}

function startActivity(id) {
  const now = Date.now();
  state.activities = state.activities.map((activity) => {
    if (activity.id === id) {
      return {
        ...activity,
        runningSince: activity.runningSince ? null : now,
      };
    }

    if (!activity.runningSince) return activity;
    return {
      ...activity,
      usedMs: activity.usedMs + (now - activity.runningSince),
      runningSince: null,
    };
  });

  saveState();
  render();
}

function deleteActivity(id) {
  const activity = state.activities.find((item) => item.id === id);
  if (activity?.isSleepBlock) {
    alert("Sleep Block ثابت. عطّله من إعدادات النوم بدل الحذف.");
    return;
  }

  pauseAll();
  state.activities = state.activities.filter((item) => item.id !== id);
  saveState();
  render();
}

function resetDay() {
  if (!confirm("هل تريد تصفير استخدام اليوم الحالي؟")) return;
  state.activities = state.activities.map((activity) => ({
    ...activity,
    usedMs: 0,
    runningSince: null,
    warned: false,
  }));
  saveState();
  render();
}

function notifyOverBudget(activity) {
  if (activity.warned || currentUsed(activity) <= activity.budgetMs) return activity;

  const updated = { ...activity, warned: true };
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("تجاوزت الوقت المحدد", {
      body: `${activity.name} استهلك أكثر من الميزانية اليومية.`,
    });
  }
  return updated;
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function setCountdownEndTime(value) {
  const nextEndTime = normalizeTime(value);
  pauseAll();

  state.countdownEndTime = nextEndTime;
  state.day = cycleKey(new Date(), nextEndTime);
  state.activities = state.activities.map((activity) => ({
    ...activity,
    warned: false,
  }));

  saveState();
  render();
}

function syncSleepBlock(targetState = state, resetUsed = false) {
  const durationMs = sleepDurationMs(targetState.sleep.start, targetState.sleep.end);
  const sleepIndex = targetState.activities.findIndex((activity) => activity.isSleepBlock);

  if (!targetState.sleep.enabled) {
    if (sleepIndex >= 0) {
      targetState.activities[sleepIndex] = {
        ...targetState.activities[sleepIndex],
        isSleepBlock: false,
      };
    }
    return targetState;
  }

  const sleepActivity = {
    id: sleepIndex >= 0 ? targetState.activities[sleepIndex].id : crypto.randomUUID(),
    name: "النوم",
    category: "sleep",
    budgetMs: durationMs,
    usedMs: sleepIndex >= 0 && !resetUsed ? targetState.activities[sleepIndex].usedMs : 0,
    runningSince: sleepIndex >= 0 && !resetUsed ? targetState.activities[sleepIndex].runningSince : null,
    warned: false,
    isSleepBlock: true,
  };

  if (sleepIndex >= 0) {
    targetState.activities[sleepIndex] = sleepActivity;
  } else {
    targetState.activities.unshift(sleepActivity);
  }

  return targetState;
}

function updateSleepSettings() {
  pauseAll();

  state.sleep = {
    enabled: elements.sleepEnabled.checked,
    start: normalizeTime(elements.sleepStart.value || "23:00"),
    end: normalizeTime(elements.sleepEnd.value || "06:30"),
  };

  state = syncSleepBlock(state, false);
  saveState();
  render();
}

function getWeekTotal() {
  const entries = Object.entries(state.history || {}).slice(-6);
  const historyTotal = entries.reduce((sum, [, day]) => sum + day.totalUsed, 0);
  const todayTotal = state.activities.reduce((sum, activity) => sum + currentUsed(activity), 0);
  return historyTotal + todayTotal;
}

function buildReport(now) {
  const dashboard = buildDashboard(state.activities, now);
  if (dashboard.tracked === 0) return "ابدأ نشاطًا حتى يظهر التقرير بشكل حي.";

  if (dashboard.overBudgetCount > 0) {
    return `أعلى نشاط: ${dashboard.topActivity}. عندك ${dashboard.overBudgetCount} نشاط تجاوز الميزانية. الالتزام الآن ${dashboard.adherence}%.`;
  }

  return `تتبعت اليوم ${formatTime(dashboard.tracked)}. أعلى نشاط: ${dashboard.topActivity}. Productive الآن ${dashboard.productivePercent}%.`;
}

function buildDashboard(activities, now = Date.now()) {
  const rows = activities.map((activity) => ({
    name: activity.name,
    category: activity.category || "productive",
    budget: activity.budgetMs,
    used: currentUsed(activity, now),
  }));

  const tracked = rows.reduce((sum, row) => sum + row.used, 0);
  const planned = rows.reduce((sum, row) => sum + row.budget, 0);
  const withinBudget = rows.reduce((sum, row) => sum + Math.min(row.used, row.budget), 0);
  const overBudgetCount = rows.filter((row) => row.used > row.budget).length;
  const productiveUsed = rows
    .filter((row) => row.category === "productive" || row.category === "health")
    .reduce((sum, row) => sum + row.used, 0);
  const top = [...rows].sort((a, b) => b.used - a.used)[0];

  const categoryTotals = Object.keys(CATEGORY_META).map((key) => {
    const used = rows.filter((row) => row.category === key).reduce((sum, row) => sum + row.used, 0);
    const budget = rows.filter((row) => row.category === key).reduce((sum, row) => sum + row.budget, 0);
    return { key, label: CATEGORY_META[key].label, used, budget };
  }).filter((row) => row.used > 0 || row.budget > 0);

  return {
    tracked,
    planned,
    adherence: planned ? Math.round((withinBudget / planned) * 100) : 0,
    productivePercent: tracked ? Math.round((productiveUsed / tracked) * 100) : 0,
    overBudgetCount,
    unused: Math.max(0, planned - tracked),
    topActivity: top && top.used > 0 ? top.name : "-",
    categoryTotals,
  };
}

function isEditingCountdownEndTime() {
  return document.activeElement === elements.countdownEndTimeInput;
}

function isEditingSleep() {
  return document.activeElement === elements.sleepStart || document.activeElement === elements.sleepEnd;
}

function renderTemplates() {
  const selected = elements.templateSelect.value;
  elements.templateSelect.innerHTML = '<option value="">اختر Template</option>';

  Object.keys(state.templates || {}).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    elements.templateSelect.appendChild(option);
  });

  if (selected && state.templates[selected]) {
    elements.templateSelect.value = selected;
  }
}

function render() {
  const now = Date.now();
  state = rolloverDay(state);
  state = syncSleepBlock(state, false);
  state.activities = state.activities.map(notifyOverBudget);

  const nowDate = new Date(now);
  const cycleEnd = getCycleEnd(nowDate, state.countdownEndTime);
  const cycleStart = getCycleStart(nowDate, state.countdownEndTime);
  const elapsedDay = now - cycleStart.getTime();
  const remainingDay = cycleEnd.getTime() - now;
  const dayPercent = Math.min(100, Math.max(0, (elapsedDay / DAY_MS) * 100));
  const active = state.activities.find((activity) => activity.runningSince);

  elements.dayCountdown.textContent = formatTime(remainingDay);
  elements.dayProgress.style.width = `${dayPercent}%`;
  if (!isEditingCountdownEndTime()) {
    elements.countdownEndTimeInput.value = state.countdownEndTime;
  }
  elements.resetCycleInfo.textContent = `ينتهي العداد عند ${formatArabicClock(state.countdownEndTime)}، وبعدها يبدأ يوم تتبع جديد.`;
  elements.quickTimeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.endTime === state.countdownEndTime);
  });

  if (!isEditingSleep()) {
    elements.sleepEnabled.checked = Boolean(state.sleep.enabled);
    elements.sleepStart.value = state.sleep.start;
    elements.sleepEnd.value = state.sleep.end;
  }

  const sleepHours = sleepDurationMs(state.sleep.start, state.sleep.end);
  elements.sleepSummary.textContent = state.sleep.enabled
    ? `نومك المخطط ${formatHours(sleepHours)} من ${formatArabicClock(state.sleep.start)} إلى ${formatArabicClock(state.sleep.end)}.`
    : "Sleep Block غير مفعل.";

  elements.statusDot.classList.toggle("active", Boolean(active));
  elements.liveActivity.textContent = active
    ? `أنت الآن في: ${active.name} • ${formatTime(currentUsed(active, now))} مستخدم`
    : "لا يوجد نشاط يعمل الآن";

  elements.activityList.innerHTML = "";
  state.activities.forEach((activity) => {
    const used = currentUsed(activity, now);
    const remaining = activity.budgetMs - used;
    const percent = Math.min(999, Math.round((used / activity.budgetMs) * 100));
    const offset = 327 - Math.min(1, used / activity.budgetMs) * 327;
    const card = elements.template.content.firstElementChild.cloneNode(true);

    card.classList.toggle("active", Boolean(activity.runningSince));
    card.classList.toggle("over", remaining < 0);
    card.classList.toggle("sleep-card", Boolean(activity.isSleepBlock));
    card.querySelector("h3").textContent = activity.name;
    card.querySelector(".budget").textContent = `ميزانية ${formatHours(activity.budgetMs)}`;
    card.querySelector(".category-badge").textContent = CATEGORY_META[activity.category]?.label || "Productive";
    card.querySelector(".time-left").textContent = formatTime(remaining);
    card.querySelector(".fill").style.strokeDashoffset = offset;
    card.querySelector(".percent").textContent = `${percent}%`;
    card.querySelector(".start-button").textContent = activity.runningSince ? "Pause" : "Start";
    card.querySelector(".state-label").textContent = activity.runningSince
      ? "يعمل الآن"
      : remaining < 0
        ? "متجاوز"
        : "متوقف";

    const deleteButton = card.querySelector(".delete-button");
    deleteButton.disabled = Boolean(activity.isSleepBlock);
    deleteButton.title = activity.isSleepBlock ? "Sleep Block ثابت" : "حذف النشاط";
    deleteButton.addEventListener("click", () => deleteActivity(activity.id));

    card.querySelector(".start-button").addEventListener("click", () => {
      requestNotificationPermission();
      startActivity(activity.id);
    });

    elements.activityList.appendChild(card);
  });

  const allocated = state.activities.reduce((sum, activity) => sum + activity.budgetMs, 0);
  const free = DAY_MS - allocated;
  const top = [...state.activities].sort((a, b) => currentUsed(b, now) - currentUsed(a, now))[0];

  elements.allocatedHours.textContent = formatHours(allocated);
  elements.freeHours.textContent = formatHours(Math.max(0, free));
  elements.dailyReport.textContent = buildReport(now);
  elements.streakValue.textContent = state.streak || 0;
  elements.topActivity.textContent = top && currentUsed(top, now) > 0 ? top.name : "-";
  elements.weeklyTotal.textContent = formatHours(getWeekTotal());
  renderTemplates();
  saveLocalState();
}

function addActivityFromForm() {
  const name = elements.nameInput.value.trim();
  const hours = Number(elements.hoursInput.value);
  const category = elements.categoryInput.value;

  if (!name || !hours) return;

  const allocated = state.activities.reduce((sum, activity) => sum + activity.budgetMs, 0);
  const nextBudget = Math.round(hours * 60 * 60 * 1000);
  if (allocated + nextBudget > DAY_MS) {
    alert("مجموع الساعات يتجاوز 24 ساعة.");
    return;
  }

  state.activities.push(createActivity({ name, hours, category }));
  elements.form.reset();
  elements.categoryInput.value = "productive";
  saveState();
  render();
}

function saveCurrentTemplate() {
  const name = prompt("اكتب اسم الـ Template:");
  if (!name || !name.trim()) return;

  state.templates[name.trim()] = cloneTemplateItems(state.activities);
  saveState();
  render();
  elements.templateSelect.value = name.trim();
}

function applySelectedTemplate() {
  const name = elements.templateSelect.value;
  if (!name || !state.templates[name]) return alert("اختر Template أولًا.");
  if (!confirm(`تطبيق Template "${name}" سيصفّر استخدام اليوم الحالي. هل تريد المتابعة؟`)) return;

  pauseAll();
  state.activities = state.templates[name].map(createActivity);
  state = syncSleepBlock(state, true);
  saveState();
  render();
}

function deleteSelectedTemplate() {
  const name = elements.templateSelect.value;
  if (!name || !state.templates[name]) return alert("اختر Template أولًا.");
  if (DEFAULT_TEMPLATES[name]) return alert("هذا Template افتراضي. لا يمكن حذفه.");
  if (!confirm(`حذف Template "${name}"؟`)) return;

  delete state.templates[name];
  saveState();
  render();
}

async function loadProfile() {
  if (!currentUser) return;

  elements.accountEmail.textContent = currentUser.email || "-";

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("display_name")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile load failed:", error.message);
  }

  const fallbackName =
    currentUser.user_metadata?.display_name ||
    currentUser.email ||
    "مستخدم";

  elements.accountName.textContent = data?.display_name || fallbackName;
}

async function guardDashboard() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "index.html";
    return false;
  }

  currentUser = data.session.user;
  await loadProfile();
  await loadStateFromCloud();
  return true;
}

async function logout() {
  pauseAll();
  await saveStateToCloud();
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

async function initApp() {
  const allowed = await guardDashboard();
  if (!allowed) return;

  render();
  setInterval(render, 1000);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  addActivityFromForm();
});

elements.pauseAllButton.addEventListener("click", pauseAll);
elements.resetDayButton.addEventListener("click", resetDay);

elements.countdownEndTimeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setCountdownEndTime(elements.countdownEndTimeInput.value);
});

elements.countdownEndTimeInput.addEventListener("change", () => {
  setCountdownEndTime(elements.countdownEndTimeInput.value);
});

elements.countdownEndTimeInput.addEventListener("blur", () => {
  if (elements.countdownEndTimeInput.value !== state.countdownEndTime) {
    setCountdownEndTime(elements.countdownEndTimeInput.value);
  } else {
    render();
  }
});

elements.quickTimeButtons.forEach((button) => {
  button.addEventListener("click", () => setCountdownEndTime(button.dataset.endTime));
});

elements.sleepEnabled.addEventListener("change", updateSleepSettings);
elements.sleepStart.addEventListener("change", updateSleepSettings);
elements.sleepEnd.addEventListener("change", updateSleepSettings);
elements.sleepStart.addEventListener("blur", updateSleepSettings);
elements.sleepEnd.addEventListener("blur", updateSleepSettings);

elements.saveTemplateButton.addEventListener("click", saveCurrentTemplate);
elements.applyTemplateButton.addEventListener("click", applySelectedTemplate);
elements.deleteTemplateButton.addEventListener("click", deleteSelectedTemplate);
elements.logoutButton.addEventListener("click", logout);

initApp();
