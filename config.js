// Configurazione dell'app. Compila CLIENT_ID dopo aver creato le credenziali
// OAuth su Google Cloud Console (vedi README.md).
const CONFIG = {
  // Es: "1234567890-abcxyz.apps.googleusercontent.com"
  CLIENT_ID: "323024863453-uee315cvufh6oogl4tqd0ei3m5jhtntc.apps.googleusercontent.com",

  // "all" = mostra TUTTI i calendari dell'account (tranne quelli elencati in
  // EXCLUDED_CALENDARS qui sotto). "single" = mostra solo CALENDAR_ID.
  CALENDAR_MODE: "all",

  // Usato solo se CALENDAR_MODE è "single". "primary" per il calendario
  // principale, oppure l'email di un calendario condiviso.
  CALENDAR_ID: "primary",

  // Usato solo se CALENDAR_MODE è "all": nomi dei calendari da escludere,
  // esattamente come compaiono nella lista calendari di Google (case
  // insensitive).
  EXCLUDED_CALENDARS: ["LR - PERSONAL", "FC - PERSONAL"],

  // Sola lettura: sufficiente per leggere gli eventi
  SCOPES: "https://www.googleapis.com/auth/calendar.readonly",

  // Auto-refresh eventi ogni 5 minuti
  REFRESH_INTERVAL_MS: 5 * 60 * 1000,

  // Rinnova il token questo tempo prima della scadenza (i token durano ~1h)
  TOKEN_REFRESH_MARGIN_MS: 5 * 60 * 1000,

  // Fascia oraria mostrata nella griglia settimanale (24h)
  CALENDAR_START_HOUR: 8,
  CALENDAR_END_HOUR: 20,
};
