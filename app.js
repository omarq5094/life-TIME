const STORAGE_KEY = "life-countdown-os-v2";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COUNTDOWN_END_TIME = "00:00";

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

const DEFAULT_ACTIVITIES = [
  { name: "النوم", hours: 7.5 },
  { name: "المذاكرة", hours: 4 },
  { name: "العمل", hours: 6 },
  { name: "السوشال", hours: 1.5 },
  { name: "النادي", hours: 1 },
  { name: "العائلة", hours: 2 },
  { name: "الترفيه", hours: 2 },
];

const $ = (selector) => document.querySelector(selector);

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
};

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createActivity({ name, hours }) {
  const budgetMs = Math.round(Number(hours) * 60 * 60 * 1000);
  return {
    id: crypto.randomUUID(),
    name,
    budgetMs,
    usedMs: 0,
    runningSince: null,
    warned: false,
  };
}

function loadState() {
  const fallback = {
    day: cycleKey(new Date(), DEFAULT_COUNTDOWN_END_TIME),
    streak: 0,
    history: {},
    countdownEndTime: DEFAULT_COUNTDOWN_END_TIME,
    activities: DEFAULT_ACTIVITIES.map(createActivity),
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return fallback;
    saved.countdownEndTime = normalizeTime(saved.countdownEndTime || DEFAULT_COUNTDOWN_END_TIME);
    saved.history = saved.history || {};
    return rolloverDay(saved);
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  saved.history = saved.history || {};
  saved.history[saved.day] = {
    totalUsed,
    activities: previousActivities.map(({ name, budgetMs, usedMs }) => ({ name, budgetMs, usedMs })),
  };

  saved.streak = totalUsed > 0 ? (saved.streak || 0) + 1 : 0;
  saved.day = currentDay;
  saved.activities = previousActivities.map((activity) => ({
    ...activity,
    usedMs: 0,
    runningSince: null,
    warned: false,
  }));

  return saved;
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

function deleteActivity(id) {
  pauseAll();
  state.activities = state.activities.filter((activity) => activity.id !== id);
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

function getWeekTotal() {
  const entries = Object.entries(state.history || {}).slice(-6);
  const historyTotal = entries.reduce((sum, [, day]) => sum + day.totalUsed, 0);
  const todayTotal = state.activities.reduce((sum, activity) => sum + currentUsed(activity), 0);
  return historyTotal + todayTotal;
}

function buildReport(now) {
  const usedActivities = [...state.activities]
    .map((activity) => ({
      name: activity.name,
      used: currentUsed(activity, now),
      budget: activity.budgetMs,
    }))
    .filter((activity) => activity.used > 0)
    .sort((a, b) => b.used - a.used);

  if (!usedActivities.length) return "ابدأ نشاطًا حتى يظهر التقرير بشكل حي.";

  const top = usedActivities[0];
  const exceeded = usedActivities.filter((activity) => activity.used > activity.budget);
  const tracked = usedActivities.reduce((sum, activity) => sum + activity.used, 0);

  if (exceeded.length) {
    return `أكثر وقت راح على ${top.name} (${formatTime(top.used)}). عندك ${exceeded.length} نشاط تجاوز الميزانية.`;
  }

  return `تتبعت اليوم ${formatTime(tracked)}. أعلى نشاط حتى الآن: ${top.name} بنسبة ${Math.round((top.used / top.budget) * 100)}%.`;
}

function isEditingCountdownEndTime() {
  return document.activeElement === elements.countdownEndTimeInput;
}

function render() {
  const now = Date.now();
  state = rolloverDay(state);
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
    card.querySelector("h3").textContent = activity.name;
    card.querySelector(".budget").textContent = `ميزانية ${formatHours(activity.budgetMs)}`;
    card.querySelector(".time-left").textContent = formatTime(remaining);
    card.querySelector(".fill").style.strokeDashoffset = offset;
    card.querySelector(".percent").textContent = `${percent}%`;
    card.querySelector(".start-button").textContent = activity.runningSince ? "Pause" : "Start";
    card.querySelector(".state-label").textContent = activity.runningSince
      ? "يعمل الآن"
      : remaining < 0
        ? "متجاوز"
        : "متوقف";
    card.querySelector(".start-button").addEventListener("click", () => {
      requestNotificationPermission();
      startActivity(activity.id);
    });
    card.querySelector(".delete-button").addEventListener("click", () => deleteActivity(activity.id));

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

  saveState();
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = elements.nameInput.value.trim();
  const hours = Number(elements.hoursInput.value);
  if (!name || !hours) return;

  const allocated = state.activities.reduce((sum, activity) => sum + activity.budgetMs, 0);
  const nextBudget = Math.round(hours * 60 * 60 * 1000);
  if (allocated + nextBudget > DAY_MS) {
    alert("مجموع الساعات يتجاوز 24 ساعة.");
    return;
  }

  state.activities.push(createActivity({ name, hours }));
  elements.form.reset();
  saveState();
  render();
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

render();
setInterval(render, 1000);
