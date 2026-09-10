/* Autenticazione OAuth + lettura eventi da Google Calendar + rendering
   del layout "oggi in grande / settimana compatta". Nessun framework. */

const DEBUG = new URLSearchParams(location.search).has("debug");

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let refreshTimer = null;

// Tentativi di riconnessione silenziosa (senza far comparire il pannello di
// login) prima di arrendersi e chiedere un click manuale. Il rinnovo del
// token ogni ~1h a volte fallisce al primo colpo (es. popup bloccata
// momentaneamente): ritentare con un piccolo ritardo risolve la maggior
// parte di questi casi senza intervento umano.
const SILENT_AUTH_RETRY_DELAYS_MS = [5000, 15000, 40000];
let silentAuthInProgress = false;
let silentAuthAttempt = 0;

const els = {
  dashboard: document.getElementById("dashboard"),
  authPanel: document.getElementById("authPanel"),
  authStatus: document.getElementById("authStatus"),
  connectBtn: document.getElementById("connectBtn"),
  todayList: document.getElementById("todayList"),
  todayEmpty: document.getElementById("todayEmpty"),
  calendarDaysHeader: document.getElementById("calendarDaysHeader"),
  calendarAlldayRow: document.getElementById("calendarAlldayRow"),
  calendarBody: document.getElementById("calendarBody"),
  calendarHoursCol: document.getElementById("calendarHoursCol"),
  updatedAt: document.getElementById("updatedAt"),
  debugLog: document.getElementById("debugLog"),
  clockTime: document.getElementById("clockTime"),
  clockDate: document.getElementById("clockDate"),
};

function log(msg) {
  console.log(msg);
  if (!DEBUG) return;
  els.debugLog.hidden = false;
  const line = document.createElement("div");
  const t = new Date().toLocaleTimeString("it-IT");
  line.textContent = `[${t}] ${msg}`;
  els.debugLog.prepend(line);
}

// ---------- Orologio ----------

function updateClock() {
  const now = new Date();
  els.clockTime.textContent = now.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  els.clockDate.textContent = now.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
setInterval(updateClock, 1000);
updateClock();

// ---------- Autenticazione (Google Identity Services) ----------

function waitForGis(callback) {
  if (window.google && google.accounts && google.accounts.oauth2) {
    callback();
  } else {
    setTimeout(() => waitForGis(callback), 100);
  }
}

function initGis() {
  if (CONFIG.CLIENT_ID.includes("INSERISCI_QUI")) {
    els.authStatus.textContent =
      "Configura CLIENT_ID in config.js prima di continuare (vedi README.md).";
    log("CLIENT_ID non configurato.");
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: onTokenResponse,
    error_callback: (err) => {
      log("Errore token client: " + JSON.stringify(err));

      if (silentAuthInProgress && silentAuthAttempt < SILENT_AUTH_RETRY_DELAYS_MS.length) {
        const delay = SILENT_AUTH_RETRY_DELAYS_MS[silentAuthAttempt];
        silentAuthAttempt++;
        log(`Nuovo tentativo di connessione silenziosa tra ${delay / 1000}s (${silentAuthAttempt}/${SILENT_AUTH_RETRY_DELAYS_MS.length})...`);
        setTimeout(() => {
          tokenClient.requestAccessToken({ prompt: "" });
        }, delay);
        return;
      }

      silentAuthInProgress = false;
      showAuthPanel();
    },
  });

  els.connectBtn.addEventListener("click", () => {
    // Va a schermo intero nello stesso click (gesto utente richiesto dal browser),
    // comodo se non stai usando la modalità kiosk del browser.
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    silentAuthInProgress = false;
    tokenClient.requestAccessToken({ prompt: "consent" });
  });

  requestSilentAuth();
}

function requestSilentAuth() {
  silentAuthInProgress = true;
  silentAuthAttempt = 0;
  log("Tentativo di connessione silenziosa...");
  tokenClient.requestAccessToken({ prompt: "" });
}

function showAuthPanel() {
  els.dashboard.hidden = true;
  els.authPanel.hidden = false;
}

function onTokenResponse(resp) {
  if (resp.error) {
    if (silentAuthInProgress && silentAuthAttempt < SILENT_AUTH_RETRY_DELAYS_MS.length) {
      const delay = SILENT_AUTH_RETRY_DELAYS_MS[silentAuthAttempt];
      silentAuthAttempt++;
      log(`Autenticazione fallita (${resp.error}), nuovo tentativo tra ${delay / 1000}s (${silentAuthAttempt}/${SILENT_AUTH_RETRY_DELAYS_MS.length})...`);
      setTimeout(() => {
        tokenClient.requestAccessToken({ prompt: "" });
      }, delay);
      return;
    }

    log("Autenticazione fallita: " + resp.error + " — usa il pulsante Connetti.");
    els.authStatus.textContent = "Connessione richiesta manualmente.";
    silentAuthInProgress = false;
    showAuthPanel();
    return;
  }

  silentAuthInProgress = false;
  accessToken = resp.access_token;
  tokenExpiresAt = Date.now() + Number(resp.expires_in) * 1000;

  els.authPanel.hidden = true;
  els.dashboard.hidden = false;
  log("Connesso a Google Calendar. Token valido fino a " +
      new Date(tokenExpiresAt).toLocaleTimeString("it-IT"));

  scheduleTokenRefresh();
  includedCalendars = null; // ricalcola la lista calendari su ogni nuova connessione
  fetchEvents();
}

function scheduleTokenRefresh() {
  clearTimeout(refreshTimer);
  const refreshIn = Math.max(
    tokenExpiresAt - Date.now() - CONFIG.TOKEN_REFRESH_MARGIN_MS,
    60 * 1000
  );
  refreshTimer = setTimeout(() => {
    log("Rinnovo automatico del token...");
    requestSilentAuth();
  }, refreshIn);
}

// ---------- Chiamate a Google Calendar API ----------

let includedCalendars = null; // [{ id, summary }]

function isoStartOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

async function apiGet(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchCalendarList() {
  const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
  url.searchParams.set("minAccessRole", "reader");
  url.searchParams.set("maxResults", "250");
  const data = await apiGet(url);
  return data.items || [];
}

async function resolveIncludedCalendars() {
  if (CONFIG.CALENDAR_MODE !== "all") {
    return [{ id: CONFIG.CALENDAR_ID, summary: "" }];
  }
  const calendars = await fetchCalendarList();
  const excluded = (CONFIG.EXCLUDED_CALENDARS || []).map((s) => s.trim().toLowerCase());
  const included = calendars.filter(
    (cal) => !excluded.includes((cal.summary || "").trim().toLowerCase())
  );
  log(`Calendari inclusi: ${included.map((c) => c.summary).join(", ")}`);
  return included.map((cal) => ({ id: cal.id, summary: cal.summary || "" }));
}

async function fetchCalendarEvents(calendarId, timeMin, timeMax) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");
  const data = await apiGet(url);
  return data.items || [];
}

function eventStartMs(ev) {
  return new Date(ev.start.dateTime || ev.start.date).getTime();
}

async function fetchEventsAcrossCalendars(calendars, timeMin, timeMax) {
  const results = await Promise.all(
    calendars.map(({ id, summary }) =>
      fetchCalendarEvents(id, timeMin, timeMax)
        .then((events) => events.map((ev) => ({ ...ev, _calendarName: summary })))
        .catch((err) => {
          if (err.message === "UNAUTHORIZED") throw err; // gestito dal chiamante (rinnovo token)
          log(`Errore sul calendario ${id}: ${err.message}`);
          return [];
        })
    )
  );
  return results.flat().sort((a, b) => eventStartMs(a) - eventStartMs(b));
}

async function fetchEvents() {
  try {
    if (!includedCalendars) {
      includedCalendars = await resolveIncludedCalendars();
    }

    const [todayEvents, weekEvents] = await Promise.all([
      fetchEventsAcrossCalendars(includedCalendars, isoStartOfDay(0), isoStartOfDay(1)),
      fetchEventsAcrossCalendars(includedCalendars, isoStartOfDay(0), isoStartOfDay(7)),
    ]);

    renderToday(todayEvents);
    renderCalendarWeek(weekEvents);

    const now = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    els.updatedAt.textContent = `Aggiornato alle ${now}`;
    log(`Fetch OK: ${todayEvents.length} oggi, ${weekEvents.length} settimana (${includedCalendars.length} calendari).`);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") {
      log("Token scaduto o non valido, richiedo un nuovo token...");
      requestSilentAuth();
      return;
    }
    log("Errore nel recupero eventi: " + err.message);
  }
}

// ---------- Rendering ----------

function formatEventTime(event) {
  if (event.start.date) return "Tutto il giorno";
  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  const fmt = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function isEventNow(event) {
  if (!event.start.dateTime || !event.end.dateTime) return false;
  const now = Date.now();
  return new Date(event.start.dateTime).getTime() <= now &&
         now < new Date(event.end.dateTime).getTime();
}

function renderToday(events) {
  els.todayList.innerHTML = "";

  if (events.length === 0) {
    els.todayEmpty.hidden = false;
    return;
  }
  els.todayEmpty.hidden = true;

  for (const ev of events) {
    const li = document.createElement("li");
    li.className = "event-card" + (isEventNow(ev) ? " is-current" : "");

    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = formatEventTime(ev);

    const title = document.createElement("span");
    title.className = "event-title";
    title.textContent = ev.summary || "(senza titolo)";

    li.appendChild(time);
    li.appendChild(title);

    if (ev._calendarName) {
      const calTag = document.createElement("span");
      calTag.className = "event-calendar-tag";
      calTag.textContent = ev._calendarName;
      li.appendChild(calTag);
    }

    if (isEventNow(ev)) {
      const tag = document.createElement("span");
      tag.className = "event-tag";
      tag.textContent = "In corso";
      li.appendChild(tag);
    }

    els.todayList.appendChild(li);
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildCalendarSkeleton() {
  const startHour = CONFIG.CALENDAR_START_HOUR;
  const endHour = CONFIG.CALENDAR_END_HOUR;
  const hours = endHour - startHour;
  const todayKey = new Date().toDateString();

  // Intestazione giorni (prima cella vuota, sopra la colonna delle ore)
  els.calendarDaysHeader.innerHTML = "";
  els.calendarDaysHeader.appendChild(document.createElement("div"));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const key = d.toDateString();
    const isToday = key === todayKey;
    days.push({ date: d, key, isToday });

    const cell = document.createElement("div");
    cell.className = "calendar-day-header" + (isToday ? " is-today" : "");

    const name = document.createElement("span");
    name.className = "calendar-day-header-name";
    name.textContent = d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");

    const num = document.createElement("span");
    num.className = "calendar-day-header-num";
    num.textContent = d.getDate();

    cell.appendChild(name);
    cell.appendChild(num);
    els.calendarDaysHeader.appendChild(cell);
  }

  // Colonna delle ore
  els.calendarHoursCol.innerHTML = "";
  for (let h = startHour; h < endHour; h++) {
    const label = document.createElement("div");
    label.className = "calendar-hour-label";
    label.textContent = `${String(h).padStart(2, "0")}:00`;
    els.calendarHoursCol.appendChild(label);
  }

  // Colonne dei giorni (rimuove quelle della render precedente)
  els.calendarBody
    .querySelectorAll(".calendar-day-col")
    .forEach((el) => el.remove());

  const dayColEls = days.map((day) => {
    const col = document.createElement("div");
    col.className = "calendar-day-col" + (day.isToday ? " is-today" : "");
    col.style.backgroundSize = `100% ${100 / hours}%`;
    els.calendarBody.appendChild(col);
    return col;
  });

  return { days, dayColEls, startHour, endHour };
}

function renderCalendarWeek(events) {
  const { days, dayColEls, startHour, endHour } = buildCalendarSkeleton();
  const rangeStartMin = startHour * 60;
  const rangeEndMin = endHour * 60;
  const rangeMin = rangeEndMin - rangeStartMin;

  els.calendarAlldayRow.innerHTML = "";
  els.calendarAlldayRow.appendChild(document.createElement("div"));
  const alldayCells = days.map(() => {
    const cell = document.createElement("div");
    cell.className = "calendar-allday-cell";
    els.calendarAlldayRow.appendChild(cell);
    return cell;
  });
  let hasAllday = false;

  const fmt = (d) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  for (const ev of events) {
    const isAllDay = !!ev.start.date;
    const rawStart = ev.start.dateTime || ev.start.date;
    const dayIndex = days.findIndex((d) => d.key === new Date(rawStart).toDateString());
    if (dayIndex === -1) continue;

    if (isAllDay) {
      hasAllday = true;
      const chip = document.createElement("div");
      chip.className = "calendar-allday-chip";
      chip.textContent = ev.summary || "(senza titolo)";
      alldayCells[dayIndex].appendChild(chip);
      continue;
    }

    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end.dateTime);
    const startMin = clamp(start.getHours() * 60 + start.getMinutes(), rangeStartMin, rangeEndMin);
    const endMin = clamp(end.getHours() * 60 + end.getMinutes(), rangeStartMin, rangeEndMin);
    if (endMin <= startMin) continue; // fuori dalla fascia oraria visualizzata

    const durationMin = endMin - startMin;
    const heightPct = (durationMin / rangeMin) * 100;

    const block = document.createElement("div");
    block.className = "calendar-event";
    block.style.top = `${((startMin - rangeStartMin) / rangeMin) * 100}%`;
    // Altezza minima garantita (in vh, non in %): il blocco mostra sempre
    // titolo + una riga di sottotitolo, quindi serve spazio per due righe
    // indipendentemente dalla durata reale dell'evento.
    block.style.height = `max(${heightPct}%, 3.6vh)`;

    const title = document.createElement("span");
    title.className = "calendar-event-title";
    title.textContent = ev.summary || "(senza titolo)";
    block.appendChild(title);

    // Sotto i 45 minuti non c'è spazio per orario + calendario leggibili:
    // meglio mostrare solo il nome del calendario (l'orario si intuisce
    // dalla posizione nel riquadro).
    const subtitle = document.createElement("span");
    subtitle.className = "calendar-event-time";
    subtitle.textContent = durationMin >= 45
      ? [`${fmt(start)} – ${fmt(end)}`, ev._calendarName].filter(Boolean).join(" · ")
      : ev._calendarName || "";
    if (subtitle.textContent) block.appendChild(subtitle);

    dayColEls[dayIndex].appendChild(block);
  }

  els.calendarAlldayRow.hidden = !hasAllday;

  // Linea "adesso" nella colonna di oggi
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIndex = days.findIndex((d) => d.isToday);
  if (todayIndex !== -1 && nowMin >= rangeStartMin && nowMin <= rangeEndMin) {
    const line = document.createElement("div");
    line.className = "calendar-now-line";
    line.style.top = `${((nowMin - rangeStartMin) / rangeMin) * 100}%`;
    dayColEls[todayIndex].appendChild(line);
  }
}

// ---------- Avvio ----------

if ("serviceWorker" in navigator) {
  // Necessario perché Chrome consideri la pagina installabile come app.
  navigator.serviceWorker.register("sw.js").catch((err) => log("Service worker non registrato: " + err.message));
}

waitForGis(initGis);
setInterval(() => {
  if (accessToken) fetchEvents();
}, CONFIG.REFRESH_INTERVAL_MS);
