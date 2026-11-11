/*
 * Neon Hop – Einstellungen.
 *
 * server: Adresse des Mehrspieler-Servers (Ordner server/, Anleitung in der README).
 *         Nach dem Einrichten hier eintragen, mit wss:// statt https://, z.B.
 *         'wss://neonhop-server.onrender.com'
 *         Leer lassen = Mehrspieler zeigt "noch nicht eingerichtet".
 */
window.NEONHOP_CONFIG = Object.assign({
  server: '',
}, window.NEONHOP_CONFIG || {});
