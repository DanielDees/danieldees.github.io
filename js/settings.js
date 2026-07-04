/* ---------------- persisted settings ----------------
   One storage key, one reader. scene.js needs the saved graphics quality at
   module evaluation (antialias is fixed at renderer construction, before
   ui.js has loaded), so the key and the parse live here instead of ui.js —
   nobody re-derives the key or re-implements the read. */
export const SETTINGS_KEY="noclip_settings_v1";
export function readSettings(){
  try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null"); }
  catch(e){ return null; }
}
