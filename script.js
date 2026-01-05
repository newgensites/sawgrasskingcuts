/* =========================================================
   VASEAN Barbershop Booking + Admin Desk
   - Static (GitHub Pages friendly)
   - LocalStorage-powered (no external database)
   - Booking sends a pre-filled SMS to SHOP_PHONE
   ========================================================= */

const CONFIG = {
  SHOP_NAME: "Sawgrass Kings Cuts",
  SHOP_PHONE_E164: "+17542452950", // main shop line
  SHOP_PHONE_DISPLAY: "(754) 245-2950", // shown on page
  SHOP_EMAIL: "info@sawgrasskingscuts.com",
  ADMIN_PIN: "1234", // <- change (client-side only)
  SLOT_MINUTES: 30,
  MAX_DAYS_AHEAD: 30,

  // Booking hours (24h). Edit to match shop schedule.
  HOURS_BY_DAY: {
    0: ["11:00", "15:00"],   // Sun
    1: ["10:00", "19:30"],   // Mon
    2: null,                  // Tue closed
    3: ["10:00", "19:30"],   // Wed
    4: ["10:00", "19:30"],   // Thu
    5: ["10:00", "20:00"],   // Fri
    6: ["10:00", "20:00"],   // Sat
  }
};

const LS = {
  barbers: "vb_barbers_v1",                 // [ {id, name, label, pin, active, createdAt} ]
  bookingsByBarber: "vb_bookings_by_barber_v1", // { barberId: [ bookingObj ] }
  overridesByBarber: "vb_overrides_by_barber_v1", // { barberId: { date: { dayOff, blocked } } }
  queueByBarber: "vb_queue_by_barber_v1",     // { barberId: [ queueItem ] }
  adminUnlocked: "vb_admin_unlocked_v1",
  barberUnlocked: "vb_barber_unlocked_v1",
  barberSession: "vb_barber_session_v1",
  gallery: "vb_gallery_v2",                   // [ {id, caption, imageData} ]
  legacyBookings: "vb_bookings_v2",
  legacyOverrides: "vb_overrides_v2",
  legacyQueue: "vb_queue_v2",
};

// older gallery keys that may contain photos from previous visits/devices
const LEGACY_GALLERY_KEYS = ["vb_gallery", "vb_photos", "vb_gallery_v0"];

const SYNC_KEYS = new Set([
  LS.bookingsByBarber,
  LS.overridesByBarber,
  LS.queueByBarber,
  LS.gallery,
  LS.barbers,
  LS.adminUnlocked,
  LS.barberUnlocked,
  LS.barberSession,
]);

/* ----------------- helpers ----------------- */
const $ = (sel) => document.querySelector(sel);

function pad(n){ return String(n).padStart(2,"0"); }

function sanitizePhoneDigits(phone){
  return (phone || "").replace(/\D/g, "");
}

function toE164(phone){
  const digits = sanitizePhoneDigits(phone);
  if(!digits) return null;
  if(digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if(digits.length === 10) return `+1${digits}`;
  return null;
}

function formatPhoneDisplay(phone){
  const digits = sanitizePhoneDigits(phone);
  if(digits.length === 11 && digits.startsWith("1")){
    const p = digits.slice(1);
    return `(${p.slice(0,3)}) ${p.slice(3,6)}-${p.slice(6)}`;
  }
  if(digits.length === 10){
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return phone || "Not set";
}

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function addDaysISO(iso, days){
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function dateToISO(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

const MIN_DATE = todayISO();
const MAX_DATE = addDaysISO(MIN_DATE, CONFIG.MAX_DAYS_AHEAD);
let calendarMonthISO = null; // YYYY-MM-01

function dayOfWeek(iso){
  return new Date(iso + "T00:00:00").getDay();
}

function monthStartISO(iso){
  const d = new Date(iso + "T00:00:00");
  d.setDate(1);
  return dateToISO(d);
}

function shiftMonthISO(monthISO, delta){
  const d = new Date(monthISO + "T00:00:00");
  d.setMonth(d.getMonth() + delta);
  return monthStartISO(dateToISO(d));
}

function isWithinRange(iso){
  return iso >= MIN_DATE && iso <= MAX_DATE;
}

function timeToMinutes(t){
  const [h,m]=t.split(":").map(Number);
  return h*60+m;
}

function minutesToTime(min){
  const h = Math.floor(min/60);
  const m = min%60;
  return `${pad(h)}:${pad(m)}`;
}

function formatTime12(timeHHMM){
  const [h, m] = timeHHMM.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${suffix}`;
}

function isPastSlot(dateISO, timeHHMM){
  const now = new Date();
  const dt = new Date(`${dateISO}T${timeHHMM}:00`);
  return dt.getTime() < now.getTime();
}

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return fallback;
    return JSON.parse(raw);
  }catch(e){
    return fallback;
  }
}

function saveJSON(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

function clampDateInputs(){
  const min = MIN_DATE;
  const max = MAX_DATE;
  ["#bDate","#qDate","#aDate"].forEach(id=>{
    const el = $(id);
    if(!el) return;
    el.min = min;
    el.max = max;
  });
}

/* ----------------- data ops ----------------- */
function uuid(){
  if(typeof crypto !== "undefined" && crypto.randomUUID){
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
}

function normalizeBookingArray(raw){
  if(Array.isArray(raw)) return raw;
  if(raw && typeof raw === "object"){
    const list = [];
    Object.entries(raw).forEach(([date, times])=>{
      Object.entries(times || {}).forEach(([time, val])=>{
        const status = val?.status === "confirmed" ? "approved" : (val?.status || "approved");
        list.push({
          id: val?.id || uuid(),
          name: val?.name || "",
          phone: val?.phone || "",
          service: val?.service || "Unknown",
          date,
          time,
          notes: val?.notes || "",
          status,
          createdAt: val?.createdAt || Date.now(),
        });
      });
    });
    return list;
  }
  return [];
}

function migrateLegacyGallery(raw){
  // If current gallery is empty, attempt to pull photos from legacy keys.
  const current = Array.isArray(raw) ? raw : [];
  if(current && current.length && typeof current[0] !== "string") return current;

  let photos = current;
  if(!photos.length){
    for(const key of LEGACY_GALLERY_KEYS){
      const legacy = loadJSON(key, null);
      if(Array.isArray(legacy) && legacy.length){
        photos = legacy;
        break;
      }
    }
  }

  if(Array.isArray(photos) && photos.length && typeof photos[0] === "string"){
    const normalized = photos.map((src, idx)=>({
      id: uuid(),
      caption: `Gallery ${idx + 1}`,
      imageData: src,
      createdAt: Date.now()
    }));
    saveJSON(LS.gallery, normalized);
    return normalized;
  }

  return photos || [];
}

function defaultBarbers(){
  const now = Date.now();
  const pins = ["1111", "2222", "3333", "4444"];
  const phones = ["7542452950", "7542452951", "7542452952", "7542452953"];
  return Array.from({ length: 4 }).map((_, idx)=>({
    id: `barber-${idx+1}`,
    name: `Barber ${idx+1}`,
    label: "",
    pin: pins[idx] || String(1000 + idx),
    phone: phones[idx] || "",
    active: true,
    createdAt: now + idx,
  }));
}

function enforceDefaultPins(barbers){
  const pinMap = {
    "barber-1": "1111",
    "barber-2": "2222",
    "barber-3": "3333",
    "barber-4": "4444",
  };
  const phoneMap = {
    "barber-1": "7542452950",
    "barber-2": "7542452951",
    "barber-3": "7542452952",
    "barber-4": "7542452953",
  };
  return (barbers || []).map(b=>{
    const next = { ...b };
    if(pinMap[b.id]) next.pin = pinMap[b.id];
    if(!next.phone && phoneMap[b.id]) next.phone = phoneMap[b.id];
    return next;
  });
}

function migrateLegacyStructures(){
  let barbers = enforceDefaultPins(loadJSON(LS.barbers, []));
  if(!Array.isArray(barbers) || barbers.length === 0){
    barbers = defaultBarbers();
    saveJSON(LS.barbers, barbers);
  }

  const defaultBarberId = barbers[0]?.id || "barber-1";

  let bookingsByBarber = loadJSON(LS.bookingsByBarber, null);
  if(!bookingsByBarber || typeof bookingsByBarber !== "object"){
    const legacyBookings = normalizeBookingArray(loadJSON(LS.legacyBookings, []));
    bookingsByBarber = { [defaultBarberId]: legacyBookings };
    saveJSON(LS.bookingsByBarber, bookingsByBarber);
  }

  let overridesByBarber = loadJSON(LS.overridesByBarber, null);
  if(!overridesByBarber || typeof overridesByBarber !== "object"){
    const legacyOverrides = loadJSON(LS.legacyOverrides, {});
    overridesByBarber = { [defaultBarberId]: legacyOverrides };
    saveJSON(LS.overridesByBarber, overridesByBarber);
  }

  let queueByBarber = loadJSON(LS.queueByBarber, null);
  if(!queueByBarber || typeof queueByBarber !== "object"){
    const legacyQueue = loadJSON(LS.legacyQueue, []);
    queueByBarber = { [defaultBarberId]: legacyQueue };
    saveJSON(LS.queueByBarber, queueByBarber);
  }

  return { barbers, bookingsByBarber, overridesByBarber, queueByBarber };
}

const state = {
  ...migrateLegacyStructures(),
  gallery: migrateLegacyGallery(loadJSON(LS.gallery, [])),
  barberSession: loadJSON(LS.barberSession, { barberId: null }),
  selected: {
    bookingBarberId: null,
    queueBarberId: null,
    adminBarberId: null,
  },
};

function setSyncStatus(connected){
  const el = $("#syncStatus");
  if(!el) return;
  el.textContent = connected ? "Connected" : "Offline/Local Mode";
  el.classList.toggle("ok", connected);
}

function showDbBanner() {
  // Firebase intentionally removed
  // No database banner needed
}

function getBarbers(){
  return Array.isArray(state.barbers) ? state.barbers : [];
}
function setBarbers(list, opts={ skipLocal:false }){
  state.barbers = Array.isArray(list) ? list : [];
  if(!opts.skipLocal) saveJSON(LS.barbers, state.barbers);
}

function getSelectedBarberId(kind="booking"){
  return state.selected?.[`${kind}BarberId`] || null;
}

function setSelectedBarberId(kind, id){
  if(!state.selected) state.selected = {};
  state.selected[`${kind}BarberId`] = id;
}

function getActiveBarberFallback(){
  const active = getBarbers().filter(b=> b.active !== false);
  return active[0]?.id || getBarbers()[0]?.id || "barber-1";
}

function getBookings(barberId){
  const map = state.bookingsByBarber || {};
  return map[barberId] || [];
}
function setBookings(list, barberId, opts={ skipLocal:false }){
  const map = state.bookingsByBarber || {};
  map[barberId] = Array.isArray(list) ? list : [];
  state.bookingsByBarber = { ...map };
  if(!opts.skipLocal) saveJSON(LS.bookingsByBarber, state.bookingsByBarber);
}

function getBookingMap(barberId){
  const map = {};
  getBookings(barberId).forEach(b=>{
    if(!b.date || !b.time) return;
    if(!map[b.date]) map[b.date] = {};
    map[b.date][b.time] = b;
  });
  return map;
}

function getOverrides(barberId){
  const map = state.overridesByBarber || {};
  return map[barberId] || {};
}
function setOverrides(o, barberId, opts={ skipLocal:false }){
  const map = state.overridesByBarber || {};
  map[barberId] = o || {};
  state.overridesByBarber = { ...map };
  if(!opts.skipLocal) saveJSON(LS.overridesByBarber, state.overridesByBarber);
}

function getQueue(barberId){
  const map = state.queueByBarber || {};
  return map[barberId] || [];
}
function setQueue(q, barberId, opts={ skipLocal:false }){
  const map = state.queueByBarber || {};
  map[barberId] = Array.isArray(q) ? q : [];
  state.queueByBarber = { ...map };
  if(!opts.skipLocal) saveJSON(LS.queueByBarber, state.queueByBarber);
}

/* ----------------- Gallery: shared repo + local fallback ----------------- */
function getLocalGalleryPhotos(){
  return Array.isArray(state.gallery) ? state.gallery : [];
}

async function getRepoGalleryPhotos(){
  try{
    const res = await fetch("assets/recent-work/recent-work.json?v=" + Date.now(), { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const images = await res.json();

    return (images || []).map((img, idx)=>({
      id: `repo-${idx}-${img?.src || ""}`,
      caption: img?.alt || `Recent work ${idx + 1}`,
      imageData: img?.src || "",
      createdAt: Date.now(),
      source: "repo"
    })).filter(x => x.imageData);
  }catch(err){
    console.warn("Repo gallery not available yet (recent-work.json missing or not deployed).", err);
    return [];
  }
}

async function getGalleryPhotos(){
  // Merge local (admin uploads on this device) + repo (global)
  const localPhotos = getLocalGalleryPhotos().map(p => ({ ...p, source: "local" }));
  const repoPhotos = await getRepoGalleryPhotos();

  // Local first so admin-added photos show up immediately on that device,
  // then global repo photos show for everyone.
  return [...localPhotos, ...repoPhotos].slice(0, 9);
}

function setGalleryPhotos(arr, opts={ skipLocal:false }){
  // Only affects LOCAL gallery (device-only). Repo gallery is controlled via GitHub commits.
  state.gallery = Array.isArray(arr) ? migrateLegacyGallery(arr) : [];
  if(!opts.skipLocal) saveJSON(LS.gallery, state.gallery);
}

function markTaken(dateISO, timeHHMM, bookingObj, barberId){
  const id = barberId || getSelectedBarberId();
  const bookings = getBookings(id).filter(b=> !(b.date === dateISO && b.time === timeHHMM));
  bookings.push(bookingObj || { id: uuid(), date: dateISO, time: timeHHMM, status: "approved" });
  setBookings(bookings, id);
}

function clearTaken(dateISO, timeHHMM, barberId){
  const id = barberId || getSelectedBarberId();
  const bookings = getBookings(id).filter(b=> !(b.date === dateISO && b.time === timeHHMM));
  setBookings(bookings, id);
}

function isApprovedBooking(booking){
  const status = booking?.status || "approved";
  return status !== "pending" && status !== "declined";
}

function isTaken(dateISO, timeHHMM, barberId){
  const id = barberId || getSelectedBarberId();
  return getBookings(id).some(b=> b.date === dateISO && b.time === timeHHMM && isApprovedBooking(b));
}

function isBlocked(dateISO, timeHHMM, barberId){
  const ov = getOverrides(barberId || getSelectedBarberId());
  const entry = ov && ov[dateISO];
  if(!entry) return false;
  if(entry.dayOff) return true;
  return (entry.blocked || []).includes(timeHHMM);
}

function isDayOff(dateISO, barberId){
  const ov = getOverrides(barberId || getSelectedBarberId());
  return Boolean(ov && ov[dateISO] && ov[dateISO].dayOff);
}

function normalizeTimestamp(val){
  if(val && typeof val.toMillis === "function") return val.toMillis();
  return val || Date.now();
}

function blockedSlotsToMap(blockedSlots){
  const map = {};
  (blockedSlots || []).forEach(slot=>{
    if(!slot?.date) return;
    if(!map[slot.date]) map[slot.date] = { dayOff:false, blocked:[] };
    if(slot.time === "DAY_OFF"){
      map[slot.date].dayOff = true;
    } else if(slot.time){
      map[slot.date].blocked.push(slot.time);
    }
  });
  Object.values(map).forEach(entry=> entry.blocked = (entry.blocked || []).sort());
  return map;
}

function mapToBlockedSlots(map){
  const slots = [];
  Object.entries(map || {}).forEach(([date, entry])=>{
    if(entry.dayOff) slots.push({ date, time: "DAY_OFF" });
    (entry.blocked || []).forEach(time=> slots.push({ date, time }));
  });
  return slots;
}

async function saveBookingRecord(booking){
  const payload = { ...booking };
  if(!payload.id) payload.id = uuid();
  if(!payload.createdAt) payload.createdAt = Date.now();
  const barberId = payload.barberId || getSelectedBarberId() || getActiveBarberFallback();
  payload.barberId = barberId;

  const list = getBookings(barberId).filter(b=> b.id !== payload.id);
  list.push(payload);
  setBookings(list, barberId);

  renderCalendar();
  refreshBookingPickers(payload.date);
}

async function updateBookingStatus(id, status){
  const map = state.bookingsByBarber || {};
  Object.entries(map).forEach(([barberId, list])=>{
    const idx = (list || []).findIndex(b=> b.id === id);
    if(idx !== -1){
      const updated = [...list];
      updated[idx] = { ...updated[idx], status };
      setBookings(updated, barberId);
    }
  });

  renderCalendar();
}

async function saveOverridesRemote(map, barberId){
  setOverrides(map, barberId || getSelectedBarberId("admin") || getActiveBarberFallback());
}

async function saveQueueItem(item){
  const payload = { ...item };
  if(!payload.id) payload.id = uuid();
  if(!payload.createdAt) payload.createdAt = Date.now();
  const barberId = payload.barberId || getSelectedBarberId("queue") || getActiveBarberFallback();
  payload.barberId = barberId;

  const next = getQueue(barberId).filter(q=> q.id !== payload.id);
  next.unshift(payload);
  setQueue(next, barberId);

  renderQueue();
}

async function updateQueueItem(id, changes){
  const map = state.queueByBarber || {};
  Object.entries(map).forEach(([barberId, list])=>{
    const idx = (list || []).findIndex(q=> q.id === id);
    if(idx !== -1){
      const updated = [...list];
      updated[idx] = { ...updated[idx], ...changes };
      setQueue(updated, barberId);
    }
  });

  renderQueue();
}

async function removeQueueItem(id){
  const map = state.queueByBarber || {};
  Object.entries(map).forEach(([barberId, list])=>{
    const next = (list || []).filter(q=> q.id !== id);
    setQueue(next, barberId);
  });

  renderQueue();
}

/* LOCAL gallery save/remove only affects THIS DEVICE */
async function saveGalleryItem(item){
  const payload = { ...item };
  if(!payload.id) payload.id = uuid();
  if(!payload.createdAt) payload.createdAt = Date.now();

  const localNow = getLocalGalleryPhotos();
  const next = [payload, ...localNow.filter(p=> p.id !== payload.id)].slice(0, 9);
  setGalleryPhotos(next);

  await renderGallery();
  await renderPhotoManager();
}

async function removeGalleryItem(id){
  const localNow = getLocalGalleryPhotos();
  const next = localNow.filter(p=> p.id !== id);
  setGalleryPhotos(next);

  await renderGallery();
  await renderPhotoManager();
}

/* ----------------- slots generation ----------------- */
function getHoursForDate(dateISO){
  const dow = dayOfWeek(dateISO);
  return CONFIG.HOURS_BY_DAY[dow] || null;
}

function generateSlots(dateISO){
  const hours = getHoursForDate(dateISO);
  if(!hours) return [];
  const [start,end] = hours.map(timeToMinutes);
  const slots = [];
  for(let m=start; m + CONFIG.SLOT_MINUTES <= end; m += CONFIG.SLOT_MINUTES){
    slots.push(minutesToTime(m));
  }
  return slots;
}

function availableSlots(dateISO, barberId){
  const slots = generateSlots(dateISO);
  return slots.filter(t=>{
    if(isPastSlot(dateISO,t)) return false;
    if(isBlocked(dateISO,t, barberId)) return false;
    if(isTaken(dateISO,t, barberId)) return false;
    return true;
  });
}

function takenSlots(dateISO, barberId){
  const slots = generateSlots(dateISO);
  return slots.filter(t=> isBlocked(dateISO,t, barberId) || isTaken(dateISO,t, barberId));
}

/* ----------------- UI: header links + mobile menu ----------------- */
function hydrateLinks(){
  const phoneHref = `tel:${CONFIG.SHOP_PHONE_E164}`;
  const smsHref = `sms:${CONFIG.SHOP_PHONE_E164}`;
  const emailHref = `mailto:${CONFIG.SHOP_EMAIL}`;

  $("#phoneLinkTop").textContent = CONFIG.SHOP_PHONE_DISPLAY;
  $("#phoneLinkTop").href = phoneHref;

  $("#emailLinkTop").textContent = CONFIG.SHOP_EMAIL;
  $("#emailLinkTop").href = emailHref;

  $("#phoneLinkContact").textContent = CONFIG.SHOP_PHONE_DISPLAY;
  $("#phoneLinkContact").href = phoneHref;

  $("#emailLinkContact").textContent = CONFIG.SHOP_EMAIL;
  $("#emailLinkContact").href = emailHref;

  $("#phoneLinkHero").textContent = CONFIG.SHOP_PHONE_DISPLAY;
  $("#phoneLinkHero").href = phoneHref;

  $("#emailLinkHero").textContent = CONFIG.SHOP_EMAIL;
  $("#emailLinkHero").href = emailHref;

  $("#smsLinkHero").href = smsHref;
  $("#textNowHero").href = smsHref;

  $("#callNowHero").href = phoneHref;
  $("#callNowCard").href = phoneHref;
  $("#callNowContact").href = phoneHref;

  renderSmsHint();
  $("#year").textContent = new Date().getFullYear();

  // hours summary text
  $("#hoursText").textContent = "Select a date to view hours + times.";
}

function renderSmsHint(){
  const el = $("#smsHint");
  if(!el) return;
  const barberId = getSelectedBarberId("booking");
  const barber = getBarbers().find(b=> b.id === barberId);
  const phone = formatPhoneDisplay(barber?.phone) || CONFIG.SHOP_PHONE_DISPLAY;
  if(barber){
    el.textContent = `Sends to ${barber.name} at ${phone}.`;
  } else {
    el.textContent = `Opens your text app and sends the request to ${CONFIG.SHOP_PHONE_DISPLAY}.`;
  }
}

function setupMobileMenu(){
  const btn = $("#hamburger");
  const menu = $("#mobileMenu");
  if(btn){
    btn.addEventListener("click", ()=>{
      const open = menu.classList.toggle("show");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  // close menu on click
  if(menu){
    menu.querySelectorAll("a").forEach(a=>{
      a.addEventListener("click", ()=> menu.classList.remove("show"));
    });
  }
}

function renderBarberOptions(selectEl, barbers, includeInactive=false){
  if(!selectEl) return;
  selectEl.innerHTML = "";
  const usable = includeInactive ? barbers : barbers.filter(b=> b.active !== false);
  if(!usable.length){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No barbers available";
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }
  selectEl.disabled = false;
  if(selectEl.id === "bBarber" || selectEl.id === "pinBarber"){
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a barber";
    selectEl.appendChild(placeholder);
  }
  usable.forEach(b=>{
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.label ? `${b.name} (${b.label})` : b.name;
    selectEl.appendChild(opt);
  });
}

function syncBarberSelections(){
  if(!getBarbers().length){
    setBarbers(defaultBarbers());
  }
  const barbers = getBarbers();
  const active = barbers.filter(b=> b.active !== false);

  if(getSelectedBarberId("booking") && !active.some(b=> b.id === getSelectedBarberId("booking"))){
    setSelectedBarberId("booking", null);
  }
  if(!getSelectedBarberId("queue") || !barbers.some(b=> b.id === getSelectedBarberId("queue"))){
    setSelectedBarberId("queue", barbers[0]?.id || null);
  }
  if(!getSelectedBarberId("admin") || !barbers.some(b=> b.id === getSelectedBarberId("admin"))){
    setSelectedBarberId("admin", barbers[0]?.id || null);
  }

  const unlocked = getUnlockedBarberId();
  if(unlocked){
    setSelectedBarberId("queue", unlocked);
    setSelectedBarberId("admin", unlocked);
  }

  const bookingSel = $("#bBarber");
  const queueSel = $("#qBarber");
  const adminSel = $("#aBarber");
  const barberDeskSel = $("#barberDeskBarber");

  renderBarberOptions(bookingSel, barbers);
  renderBarberOptions(queueSel, barbers, true);
  renderBarberOptions(adminSel, barbers, true);
  renderBarberOptions(barberDeskSel, barbers, true);

  if(bookingSel){ bookingSel.value = getSelectedBarberId("booking") || ""; }
  if(queueSel){ queueSel.value = getSelectedBarberId("queue") || ""; }
  if(adminSel){ adminSel.value = getSelectedBarberId("admin") || ""; }
  if(barberDeskSel){
    const unlocked = getUnlockedBarberId();
    barberDeskSel.value = unlocked || getSelectedBarberId("admin") || barbers[0]?.id || "";
  }

  renderSmsHint();
}

/* ----------------- UI: gallery ----------------- */
async function renderGallery(){
  const grid = $("#galleryGrid");
  const hint = $("#galleryHint");
  if(!grid) return;

  const photos = await getGalleryPhotos();
  grid.innerHTML = "";

  const items = photos.length ? photos : Array.from({ length: 6 }, ()=> null);

  items.forEach((photo, idx)=>{
    const cell = document.createElement("div");
    cell.className = "photo";

    if(photo){
      cell.classList.add("has-img");
      const img = document.createElement("img");
      img.src = photo.imageData;
      img.alt = `Recent cut ${idx + 1}`;
      cell.title = "Open full photo";
      cell.appendChild(img);
      cell.addEventListener("click", ()=> window.open(photo.imageData, "_blank"));
    } else {
      cell.textContent = "Photo Slot";
    }

    grid.appendChild(cell);
  });

  if(hint){
    hint.textContent = photos.length
      ? "Recent Work updates on all devices after you upload + commit photos to GitHub (assets/recent-work + recent-work.json). Tap to open."
      : "No uploads yet. Add photos to assets/recent-work and update recent-work.json.";
  }
}

async function renderPhotoManager(){
  const list = $("#photoList");
  if(!list) return;

  const photos = await getGalleryPhotos();
  list.innerHTML = "";

  if(photos.length === 0){
    const empty = document.createElement("div");
    empty.className = "muted tiny";
    empty.textContent = "No photos uploaded yet.";
    list.appendChild(empty);
    return;
  }

  photos.forEach((item, idx)=>{
    const isRepo = String(item?.id || "").startsWith("repo-") || item?.source === "repo";

    const row = document.createElement("div");
    row.className = "photo-row";
    row.innerHTML = `
      <div class="photo-thumb">${item?.imageData ? `<img src="${item.imageData}" alt="Recent work ${idx + 1}">` : ""}</div>
      <div class="photo-meta">
        <div class="tiny muted">Photo ${idx + 1}${isRepo ? " • (GitHub)" : ""}</div>
        <div class="photo-actions">
          <button class="ghost tiny-btn" data-act="open" data-idx="${idx}">Open</button>
          ${isRepo ? `<button class="ghost tiny-btn" disabled title="Repo photos are managed by editing assets/recent-work/recent-work.json and committing to GitHub.">Managed in GitHub</button>`
                  : `<button class="ghost danger tiny-btn" data-act="delete" data-idx="${idx}">Delete</button>`}
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const idx = Number(btn.getAttribute("data-idx"));
      const act = btn.getAttribute("data-act");
      const photosNow = await getGalleryPhotos();
      const item = photosNow[idx];

      if(typeof item === "undefined") return;

      if(act === "open"){
        window.open(item.imageData, "_blank");
      }

      if(act === "delete"){
        const isRepo = String(item?.id || "").startsWith("repo-") || item?.source === "repo";
        if(isRepo){
          alert("This photo is managed in GitHub (edit recent-work.json + commit).");
          return;
        }

        const ok = confirm("Delete this photo from Recent Work (this device only)?");
        if(ok){
          await removeGalleryItem(item.id);
          setPhotoUploadNote("Photo removed from Recent Work (local device).", true);
        }
      }
    });
  });
}

function addBarberFromAdmin(){
  const barbers = [...getBarbers()];
  const name = prompt("New barber name", `Barber ${barbers.length + 1}`);
  if(!name) return;
  const id = `barber-${uuid()}`;
  const phoneInput = prompt("Barber phone (digits only, used for booking texts)", "");
  const phone = sanitizePhoneDigits(phoneInput || "");
  barbers.push({ id, name: name.trim(), label: "", pin: String(1000 + barbers.length), phone, active: true, createdAt: Date.now() });
  setBarbers(barbers);
  setSelectedBarberId("booking", id);
  setSelectedBarberId("queue", id);
  setSelectedBarberId("admin", id);
  syncBarberSelections();
  renderBarberManager();
  refreshAllAfterBarberChange();
}

function setPhotoUploadNote(msg, ok=false){
  const el = $("#photoUploadNote");
  if(!el) return;
  el.textContent = msg || "";
  el.classList.toggle("ok", Boolean(ok));
  el.classList.toggle("error", Boolean(msg && !ok));
}

function handlePhotoFile(file, sourceLabel){
  if(!file){
    setPhotoUploadNote("No file selected.", false);
    return;
  }
  if(!file.type.startsWith("image/")){
    alert("Please choose an image file.");
    setPhotoUploadNote("Only image files are supported.", false);
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e)=>{
    const item = {
      id: uuid(),
      caption: sourceLabel || "Gallery upload",
      imageData: e.target.result,
      createdAt: Date.now(),
      source: "local"
    };
    await saveGalleryItem(item);
    setPhotoUploadNote(`${sourceLabel || "Upload"} added to gallery (local device). To sync across devices, add images to assets/recent-work and update recent-work.json.`, true);
  };
  reader.readAsDataURL(file);
}

function bindUploadControl(btnId, inputId, label){
  const btn = $(btnId);
  const input = $(inputId);
  if(btn && input){
    btn.addEventListener("click", (e)=>{ e.preventDefault(); input.click(); });
    input.addEventListener("change", ()=>{
      handlePhotoFile(input.files[0], label);
      input.value = "";
    });
  }
}

/* ----------------- UI: booking form ----------------- */
function selectDate(dateISO){
  if(!getSelectedBarberId("booking")) return;
  $("#bDate").value = dateISO;
  hydrateBookingTimes(dateISO);
  renderCalendar();
}

function renderCalendar(){
  if(!calendarMonthISO) calendarMonthISO = monthStartISO(MIN_DATE);

  const daysWrap = $("#calDays");
  const monthLabel = $("#calMonth");
  const prevBtn = $("#calPrev");
  const nextBtn = $("#calNext");
  const tzLabel = $("#calTimezone");
  const calCard = document.querySelector(".calendar-card");
  const barberId = getSelectedBarberId("booking");
  const hasBarber = Boolean(barberId);
  const minMonth = monthStartISO(MIN_DATE);
  const maxMonth = monthStartISO(MAX_DATE);

  if(calCard){ calCard.classList.toggle("is-disabled", !hasBarber); }

  if(!hasBarber){
    if(monthLabel) monthLabel.textContent = "Select a barber";
    if(tzLabel) tzLabel.textContent = "";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    daysWrap.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "cal-empty muted tiny";
    empty.textContent = "Select a barber to see availability.";
    daysWrap.appendChild(empty);
    return;
  }
  const base = new Date(calendarMonthISO + "T00:00:00");
  monthLabel.textContent = base.toLocaleString(undefined, { month: "long", year: "numeric" });
  if(tzLabel){
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
    tzLabel.textContent = `Times shown in ${tz}.`;
  }
  prevBtn.disabled = calendarMonthISO <= minMonth;
  nextBtn.disabled = calendarMonthISO >= maxMonth;

  daysWrap.innerHTML = "";
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selected = $("#bDate").value;

  for(let i=0;i<firstDow;i++) daysWrap.appendChild(document.createElement("div"));

  for(let day=1; day<=daysInMonth; day++){
    const iso = `${year}-${pad(month+1)}-${pad(day)}`;
    const dayEl = document.createElement("div");
    dayEl.className = "cal-day";
    dayEl.dataset.date = iso;

    const inRange = isWithinRange(iso);
    const hours = getHoursForDate(iso);
    const dayOff = isDayOff(iso, barberId);
    const hasHours = Boolean(hours) && !dayOff;
    const openCount = hasHours ? availableSlots(iso, barberId).length : 0;
    const takenCount = hasHours ? takenSlots(iso, barberId).length : 0;

    let meta = hasHours ? `${openCount} open` : (dayOff ? "Day off" : "Closed");
    let statusClass = "status-off";
    let clickable = inRange && hasHours;

    if(!inRange){
      dayEl.classList.add("disabled");
      meta = "Out of range";
      statusClass = "status-out";
    } else if(!hasHours){
      dayEl.classList.add("closed","disabled");
      statusClass = "status-off";
    } else if(openCount === 0){
      dayEl.classList.add("full");
      statusClass = "status-full";
      meta = takenCount ? `Full (${takenCount} taken)` : "Full";
    } else if(dayOff){
      statusClass = "status-off";
    } else {
      statusClass = "status-open";
    }

    if(selected === iso) dayEl.classList.add("selected");
    dayEl.classList.add(statusClass);

    const weekday = new Date(`${iso}T00:00:00`).toLocaleString(undefined, { weekday: "short" });
    dayEl.setAttribute("aria-label", `${weekday} ${day}: ${meta}`);

    dayEl.innerHTML = `
      <div class="cal-date">
        <div class="cal-num-badge">${day}</div>
        <div class="cal-weekday">${weekday}</div>
      </div>
      <div class="cal-meta">${meta}</div>
    `;

    if(clickable){
      dayEl.addEventListener("click", ()=> selectDate(iso));
    }

    daysWrap.appendChild(dayEl);
  }
}

function goToMonth(delta){
  const minMonth = monthStartISO(MIN_DATE);
  const maxMonth = monthStartISO(MAX_DATE);
  const next = shiftMonthISO(calendarMonthISO, delta);
  if(next < minMonth || next > maxMonth) return;
  calendarMonthISO = next;
  renderCalendar();
}

function hydrateBookingTimes(dateISO){
  const sel = $("#bTime");
  sel.innerHTML = "";
  $("#takenChips").innerHTML = "";
  const barberId = getSelectedBarberId("booking");

  renderSmsHint();

  const sendBtn = $("#sendBookingText");
  if(sendBtn) sendBtn.disabled = !barberId;

  if(!barberId){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select a barber first";
    sel.appendChild(opt);
    sel.disabled = true;
    $("#takenText").textContent = "";
    $("#takenChips").innerHTML = "";
    $("#barberHint").textContent = "Select a barber to see availability.";
    return;
  }
  sel.disabled = false;
  $("#barberHint").textContent = "";

  if(!dateISO){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select a date first";
    sel.appendChild(opt);
    $("#takenText").textContent = "";
    $("#takenChips").innerHTML = "";
    return;
  }

  const hours = getHoursForDate(dateISO);
  $("#hoursText").textContent = hours
    ? `${formatTime12(hours[0])} – ${formatTime12(hours[1])}`
    : "Closed on this day.";

  if(!hours){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Closed on this day";
    sel.appendChild(opt);
    $("#takenText").textContent = "";
    $("#takenChips").innerHTML = "";
    return;
  }

  const open = availableSlots(dateISO, barberId);
  const taken = takenSlots(dateISO, barberId);

  if(open.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No open times — pick another date";
    sel.appendChild(opt);
  } else {
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Select a time";
    sel.appendChild(opt0);

    open.forEach(t=>{
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = formatTime12(t);
      sel.appendChild(opt);
    });
  }

  $("#takenText").textContent = taken.length
    ? `Taken/blocked for this date:`
    : `No taken times yet for this date.`;

  if(taken.length){
    const chipRow = $("#takenChips");
    taken.forEach(t=>{
      const chip = document.createElement("span");
      chip.className = "chip mini";
      chip.textContent = formatTime12(t);
      chipRow.appendChild(chip);
    });
  }
}

async function sendBookingSMS(){
  const barberId = getSelectedBarberId("booking");
  const name = $("#bName").value.trim();
  const phone = $("#bPhone").value.trim();
  const service = $("#bService").value;
  const date = $("#bDate").value;
  const time = $("#bTime").value;
  const notes = $("#bNotes").value.trim();

  if(!barberId){
    alert("Please select a barber first.");
    return;
  }

  if(!name || !phone || !date || !time){
    alert("Please fill Name, Phone, Date, and Time.");
    return;
  }

  // re-check availability right before sending
  if(isPastSlot(date,time) || isBlocked(date,time, barberId) || isTaken(date,time, barberId)){
    alert("That time is no longer available. Please pick another slot.");
    hydrateBookingTimes(date);
    return;
  }

  const bookingId = uuid();
  const bookingPayload = {
    id: bookingId,
    name,
    phone,
    service,
    date,
    time,
    notes,
    barberId,
    status: "pending",
    createdAt: Date.now(),
  };

  // ensure the queue view is scoped to the same barber as the booking
  setSelectedBarberId("queue", barberId);
  const queueSelect = $("#qBarber");
  if(queueSelect) queueSelect.value = barberId;

  await saveBookingRecord(bookingPayload);
  await saveQueueItem({
    id: bookingId,
    name,
    phone,
    requestedService: service,
    date,
    time,
    notes,
    barberId,
    status: "pending",
    createdAt: bookingPayload.createdAt,
  });

  const msg =
`Booking Request — ${CONFIG.SHOP_NAME}
Name: ${name}
Phone: ${phone}
Service: ${service}
Barber: ${getBarbers().find(b=>b.id===barberId)?.name || "Barber"}
Date/Time: ${date} @ ${formatTime12(time)}
Notes: ${notes || "N/A"}

Please confirm if this time is available.`;

  const targetBarber = getBarbers().find(b=> b.id === barberId);
  const smsNumber = toE164(targetBarber?.phone) || CONFIG.SHOP_PHONE_E164;
  const smsUrl = `sms:${smsNumber}?&body=${encodeURIComponent(msg)}`;
  window.location.href = smsUrl;
}

/* ----------------- Admin: lock/unlock ----------------- */
function getUnlockedBarberId(){
  const session = state.barberSession || loadJSON(LS.barberSession, { barberId:null });
  const id = session?.barberId || null;
  if(id && getBarbers().some(b=> b.id === id)) return id;
  return null;
}

function setBarberSession(barberId){
  state.barberSession = { barberId: barberId || null };
  saveJSON(LS.barberSession, state.barberSession);
}

function isAdminUnlocked(){
  return localStorage.getItem(LS.adminUnlocked) === "true";
}

function setAdminUnlocked(val){
  if(val){
    localStorage.setItem(LS.adminUnlocked, "true");
  } else {
    localStorage.removeItem(LS.adminUnlocked);
  }
  applyAdminLock();
}

function applyBarberLockToSelectors(){
  const sessionBarberId = getUnlockedBarberId();
  const deskSel = $("#barberDeskBarber");
  const queueSel = $("#qBarber");
  const adminSel = $("#aBarber");
  const bookingSel = $("#bBarber");

  if(sessionBarberId){
    setSelectedBarberId("booking", sessionBarberId);
    setSelectedBarberId("queue", sessionBarberId);
    setSelectedBarberId("admin", sessionBarberId);
  }

  [deskSel, queueSel, adminSel].forEach(sel=>{
    if(!sel) return;
    if(sessionBarberId){
      sel.value = sessionBarberId;
      sel.disabled = true;
      sel.setAttribute("aria-disabled", "true");
    } else {
      sel.disabled = false;
      sel.removeAttribute("aria-disabled");
    }
  });

  if(bookingSel && sessionBarberId){
    bookingSel.value = sessionBarberId;
  }

  if(bookingSel){
    bookingSel.disabled = Boolean(sessionBarberId);
    if(sessionBarberId){
      bookingSel.setAttribute("aria-disabled", "true");
    } else {
      bookingSel.removeAttribute("aria-disabled");
    }
  }
}

function applyAdminLock(){
  const locked = !isAdminUnlocked();
  document.querySelectorAll("[data-admin]").forEach(el=>{
    el.classList.toggle("is-locked", locked);
  });
  const pinNote = $("#pinNote");
  const lockBtn = $("#lockAdmin");
  const lockStatus = $("#lockStatus");

  lockBtn.disabled = locked;
  lockBtn.setAttribute("aria-pressed", (!locked).toString());

  lockStatus.textContent = locked
    ? "Admin desk locked."
    : "Admin desk unlocked on this device.";
  lockStatus.classList.toggle("ok", !locked);

  pinNote.textContent = locked
    ? "Enter the admin passcode to manage barbers and photos."
    : "Admin tools are unlocked on this device.";
}

function unlockAdmin(){
  const pin = $("#adminPinInput").value.trim();
  if(pin === String(CONFIG.ADMIN_PIN).trim()){
    setAdminUnlocked(true);
    $("#adminPinInput").value = "";
    $("#pinNote").textContent = "Admin tools unlocked.";
  } else {
    $("#pinNote").textContent = "Wrong admin passcode.";
  }
}

/* ----------------- Barber Desk (separate access) ----------------- */
function isBarberUnlocked(){
  return localStorage.getItem(LS.barberUnlocked) === "true" && Boolean(getUnlockedBarberId());
}

function setBarberUnlocked(val, barberId=null){
  if(val && barberId){
    localStorage.setItem(LS.barberUnlocked, "true");
    setBarberSession(barberId);
  } else {
    localStorage.removeItem(LS.barberUnlocked);
    setBarberSession(null);
  }
  applyBarberLock();
}

function applyBarberLock(){
  const locked = !isBarberUnlocked();
  document.querySelectorAll("[data-barber]").forEach(el=>{
    el.classList.toggle("is-locked", locked);
  });

  const lockStatus = $("#barberLockStatus");
  const lockNote = $("#barberLockNote");
  const lockBtn = $("#lockBarberDesk");
  const sessionBarber = getBarbers().find(b=> b.id === getUnlockedBarberId());

  if(lockBtn){
    lockBtn.disabled = locked;
    lockBtn.setAttribute("aria-pressed", (!locked).toString());
  }

  if(lockStatus){
    lockStatus.textContent = locked ? "Barber desk locked." : `Unlocked for ${sessionBarber?.name || "Barber"}.`;
    lockStatus.classList.toggle("ok", !locked);
  }

  if(lockNote){
    lockNote.textContent = locked
      ? "Select your name and enter your passcode to manage your queue + calendar."
      : "This desk is unlocked for the selected barber on this device.";
  }

  applyBarberLockToSelectors();
}

function unlockBarberDesk(){
  const barberId = $("#barberDeskBarber").value;
  const passcode = $("#barberPasscodeInput").value.trim();
  const note = $("#barberLockNote");
  const target = getBarbers().find(b=> b.id === barberId);

  if(!target){
    if(note) note.textContent = "Choose your barber profile first.";
    return;
  }

  if(passcode === String(target.pin || "").trim()){
    setBarberUnlocked(true, barberId);
    setSelectedBarberId("booking", barberId);
    setSelectedBarberId("queue", barberId);
    setSelectedBarberId("admin", barberId);
    syncBarberSelections();
    refreshAllAfterBarberChange();
    $("#barberPasscodeInput").value = "";
    if(note) note.textContent = `${target.name}'s tools are unlocked.`;
  } else {
    if(note) note.textContent = "Wrong passcode for that barber.";
  }
}

/* ----------------- Admin: queue ----------------- */
function renderQueue(){
  const tbody = $("#queueTable");
  const barberId = getSelectedBarberId("queue") || getActiveBarberFallback();
  const q = getQueue(barberId);
  tbody.innerHTML = "";

  if(!barberId){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">Select a barber to manage the queue.</td>`;
    tbody.appendChild(tr);
    return;
  }

  if(q.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">No queued requests yet for this barber.</td>`;
    tbody.appendChild(tr);
    return;
  }

  q.forEach(item=>{
    const tr = document.createElement("tr");
    const when = item.date && item.time ? `${item.date} @ ${formatTime12(item.time)}` : "—";
    const service = item.requestedService || item.service || "Request";

    const statusChip =
      item.status === "approved" ? `<span class="chip ok">Approved</span>` :
      item.status === "declined" ? `<span class="chip no">Declined</span>` :
      `<span class="chip pending">Pending</span>`;

    tr.innerHTML = `
      <td>
        <div style="font-weight:900">${escapeHtml(item.name)}</div>
        <div class="muted tiny">${escapeHtml(item.phone)} • ${escapeHtml(service)}</div>
        <div class="muted tiny">${escapeHtml(item.notes || "")}</div>
      </td>
      <td>${escapeHtml(when)}</td>
      <td>${statusChip}</td>
      <td class="right">
        <div class="row-actions">
          <button class="btn" data-act="confirm" data-id="${item.id}">Confirm</button>
          <button class="ghost" data-act="decline" data-id="${item.id}">Decline</button>
          <button class="ghost" data-act="remove" data-id="${item.id}">Remove</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // actions
  tbody.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");
      handleQueueAction(act, id);
    });
  });
}

function addToQueue(){
  const barberId = $("#qBarber").value || getSelectedBarberId("queue") || getActiveBarberFallback();
  const name = $("#qName").value.trim();
  const phone = $("#qPhone").value.trim();
  const service = $("#qService").value;
  const date = $("#qDate").value;
  const time = $("#qTime").value;
  const notes = $("#qNotes").value.trim();

  if(!barberId){
    alert("Select a barber first.");
    return;
  }

  if(!name || !phone || !date || !time){
    alert("Fill Name, Phone, Date, and Time.");
    return;
  }

  const entry = {
    id: uuid(),
    name,
    phone,
    requestedService: service,
    service,
    date,
    time,
    notes,
    barberId,
    status: "pending",
    createdAt: Date.now()
  };
  saveQueueItem(entry);

  // clear
  $("#qName").value = "";
  $("#qPhone").value = "";
  $("#qNotes").value = "";
  renderQueue();
}

async function handleQueueAction(act, id){
  let item = null;
  let barberId = null;
  Object.entries(state.queueByBarber || {}).forEach(([bId, list])=>{
    if(item) return;
    const idx = (list || []).findIndex(x=> x.id === id);
    if(idx !== -1){
      item = list[idx];
      barberId = bId;
    }
  });

  if(!item){
    return;
  }

  barberId = item.barberId || barberId || getSelectedBarberId("queue") || getActiveBarberFallback();

  if(act === "confirm"){
    // mark time as taken (confirmed booking)
    if(isBlocked(item.date, item.time, barberId) || isTaken(item.date, item.time, barberId)){
      alert("That slot is already blocked/taken. Choose a different time.");
      return;
    }
    const existingBooking = getBookings(barberId).find(b=> b.id === item.id);
    const bookingPayload = existingBooking || {
      id: item.id,
      name: item.name,
      phone: item.phone,
      service: item.requestedService || item.service,
      date: item.date,
      time: item.time,
      notes: item.notes || "",
      barberId,
      status: "approved",
      createdAt: item.createdAt || Date.now(),
    };
    await saveBookingRecord({ ...bookingPayload, status: "approved", barberId });
    await updateQueueItem(item.id, { status: "approved" });
    refreshBookingPickers(item.date);
    alert("Confirmed and saved to calendar (taken).");
  }

  if(act === "decline"){
    await updateQueueItem(item.id, { status: "declined" });
    await updateBookingStatus(item.id, "declined");
  }

  if(act === "remove"){
    await removeQueueItem(item.id);
    await updateBookingStatus(item.id, "declined");
  }
}

/* ----------------- Admin: availability editor ----------------- */
function hydrateAdminTimes(dateISO){
  const grid = $("#aTimes");
  grid.innerHTML = "";
  const barberId = getSelectedBarberId("admin") || getActiveBarberFallback();
  if(!barberId){
    grid.innerHTML = `<div class="muted tiny">Select a barber.</div>`;
    return;
  }

  if(!dateISO){
    grid.innerHTML = `<div class="muted tiny">Pick a date.</div>`;
    return;
  }

  const hours = getHoursForDate(dateISO);
  if(!hours){
    grid.innerHTML = `<div class="muted tiny">Closed on this day (no slots).</div>`;
    $("#aDayOff").checked = true;
    return;
  }

  const ov = getOverrides(barberId);
  const entry = (ov && ov[dateISO]) ? ov[dateISO] : { dayOff:false, blocked:[] };
  $("#aDayOff").checked = Boolean(entry.dayOff);

  const slots = generateSlots(dateISO);
  slots.forEach(t=>{
    const pill = document.createElement("div");
    pill.className = "time-pill";
    pill.textContent = formatTime12(t);

    const disabled = entry.dayOff || entry.blocked.includes(t);
    if(disabled) pill.classList.add("selected");

    pill.addEventListener("click", ()=>{
      // toggle blocked time (only if not dayOff)
      if($("#aDayOff").checked) return;
      const ov2 = getOverrides(barberId);
      if(!ov2[dateISO]) ov2[dateISO] = { dayOff:false, blocked:[] };
      const b = new Set(ov2[dateISO].blocked || []);
      if(b.has(t)) b.delete(t); else b.add(t);
      ov2[dateISO].blocked = Array.from(b).sort();
      saveOverridesRemote(ov2, barberId);
      hydrateAdminTimes(dateISO);
      refreshBookingPickers(dateISO);
    });

    grid.appendChild(pill);
  });
}

function saveDayOffToggle(dateISO){
  const barberId = getSelectedBarberId("admin") || getActiveBarberFallback();
  const ov = getOverrides(barberId);
  if(!ov[dateISO]) ov[dateISO] = { dayOff:false, blocked:[] };
  ov[dateISO].dayOff = $("#aDayOff").checked;
  if(ov[dateISO].dayOff){
    // if day off, no need to keep individual blocks
    ov[dateISO].blocked = ov[dateISO].blocked || [];
  }
  saveOverridesRemote(ov, barberId);
  hydrateAdminTimes(dateISO);
  refreshBookingPickers(dateISO);
}

function clearOverridesForDate(dateISO){
  const barberId = getSelectedBarberId("admin") || getActiveBarberFallback();
  const ov = getOverrides(barberId);
  if(ov[dateISO]){
    delete ov[dateISO];
    saveOverridesRemote(ov, barberId);
  }
  hydrateAdminTimes(dateISO);
  refreshBookingPickers(dateISO);
}

function refreshBookingPickers(dateISO){
  // refresh booking form + admin queue time picker if same date
  if($("#bDate").value === dateISO) hydrateBookingTimes(dateISO);
  if($("#qDate").value === dateISO) hydrateQueueTimes(dateISO);
}

function hydrateQueueTimes(dateISO){
  const sel = $("#qTime");
  sel.innerHTML = "";
  const barberId = getSelectedBarberId("queue");
  if(!barberId){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select a barber first";
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  if(!dateISO){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select a date first";
    sel.appendChild(opt);
    return;
  }

  const hours = getHoursForDate(dateISO);
  if(!hours){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Closed on this day";
    sel.appendChild(opt);
    return;
  }

  const open = availableSlots(dateISO, barberId);
  if(open.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No open times";
    sel.appendChild(opt);
    return;
  }

  open.forEach(t=>{
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = formatTime12(t);
    sel.appendChild(opt);
  });
}

function markDayAvailableFromQueue(){
  const dateISO = $("#qDate").value;
  const barberId = getSelectedBarberId("queue") || getActiveBarberFallback();
  if(!dateISO){
    alert("Pick a date first.");
    return;
  }

  const ov = getOverrides(barberId);
  if(ov[dateISO]){
    delete ov[dateISO];
    saveOverridesRemote(ov, barberId);
  }

  $("#aDate").value = dateISO;
  $("#aBarber").value = barberId;
  setSelectedBarberId("admin", barberId);
  hydrateAdminTimes(dateISO);
  refreshBookingPickers(dateISO);
}

function refreshAllAfterBarberChange(){
  renderCalendar();
  const bDate = $("#bDate").value;
  const qDate = $("#qDate").value;
  const aDate = $("#aDate").value;
  if(bDate) hydrateBookingTimes(bDate);
  if(qDate) hydrateQueueTimes(qDate);
  if(aDate) hydrateAdminTimes(aDate);
  renderQueue();
}

/* ----------------- misc ----------------- */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[s]));
}

function renderBarberManager(){
  const list = $("#barberList");
  if(!list) return;
  const barbers = getBarbers();
  list.innerHTML = "";

  if(!barbers.length){
    const empty = document.createElement("div");
    empty.className = "muted tiny";
    empty.textContent = "No barbers yet. Add one to start booking.";
    list.appendChild(empty);
    return;
  }

  barbers.forEach((b, idx)=>{
    const row = document.createElement("div");
    row.className = "barber-row";
    const statusText = b.active === false ? "Inactive" : "Active";
    const phoneText = b.phone ? formatPhoneDisplay(b.phone) : "No phone saved";
    row.innerHTML = `
      <div class="barber-main">
        <div class="barber-name">${escapeHtml(b.name)}</div>
        <div class="muted tiny">${escapeHtml(statusText)}${b.label ? ` • ${escapeHtml(b.label)}` : ""}</div>
        <div class="muted tiny">Phone: ${escapeHtml(phoneText)} • Passcode: ${escapeHtml(b.pin || "Not set")}</div>
      </div>
      <div class="barber-controls">
        <button class="ghost tiny-btn" data-act="up" data-idx="${idx}">↑</button>
        <button class="ghost tiny-btn" data-act="down" data-idx="${idx}">↓</button>
        <button class="ghost tiny-btn" data-act="toggle" data-idx="${idx}">${b.active === false ? "Activate" : "Deactivate"}</button>
        <button class="ghost tiny-btn" data-act="rename" data-idx="${idx}">Rename</button>
        <button class="ghost tiny-btn" data-act="phone" data-idx="${idx}">Set Phone</button>
        <button class="ghost tiny-btn" data-act="pin" data-idx="${idx}">Set PIN</button>
        <button class="ghost danger tiny-btn" data-act="delete" data-idx="${idx}">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.getAttribute("data-act");
      const idx = Number(btn.getAttribute("data-idx"));
      const barbersNow = [...getBarbers()];
      const target = barbersNow[idx];
      if(!target) return;

      if(act === "rename"){
        const nextName = prompt("Barber name", target.name);
        if(nextName){
          barbersNow[idx] = { ...target, name: nextName.trim() };
          setBarbers(barbersNow);
          syncBarberSelections();
          renderBarberManager();
          refreshAllAfterBarberChange();
        }
      }

      if(act === "toggle"){
        barbersNow[idx] = { ...target, active: target.active === false };
        setBarbers(barbersNow);
        syncBarberSelections();
        renderBarberManager();
        refreshAllAfterBarberChange();
      }

      if(act === "phone"){
        const nextPhone = prompt("Enter phone for this barber (digits only)", target.phone || "");
        if(nextPhone !== null){
          const cleaned = sanitizePhoneDigits(nextPhone);
          barbersNow[idx] = { ...target, phone: cleaned };
          setBarbers(barbersNow);
          renderBarberManager();
          renderSmsHint();
        }
      }

      if(act === "pin"){
        const nextPin = prompt("Set a 4-digit passcode for this barber", target.pin || "");
        if(nextPin){
          const cleaned = nextPin.replace(/\D/g, "").slice(0,4);
          if(cleaned.length < 4){
            alert("Please enter a 4-digit code.");
            return;
          }
          barbersNow[idx] = { ...target, pin: cleaned };
          setBarbers(barbersNow);
          renderBarberManager();
          syncBarberSelections();
        }
      }

      if(act === "up" && idx > 0){
        [barbersNow[idx-1], barbersNow[idx]] = [barbersNow[idx], barbersNow[idx-1]];
        setBarbers(barbersNow);
        syncBarberSelections();
        renderBarberManager();
        refreshAllAfterBarberChange();
      }

      if(act === "down" && idx < barbersNow.length - 1){
        [barbersNow[idx+1], barbersNow[idx]] = [barbersNow[idx], barbersNow[idx+1]];
        setBarbers(barbersNow);
        syncBarberSelections();
        renderBarberManager();
        refreshAllAfterBarberChange();
      }

      if(act === "delete"){
        const confirmRemove = confirm(`Remove ${target.name} from the selector?`);
        if(!confirmRemove) return;
        const deleteData = confirm("Delete this barber's bookings/overrides/queue? (Cancel to archive data)");

        barbersNow.splice(idx,1);
        setBarbers(barbersNow);

        if(deleteData){
          const bookingsMap = { ...(state.bookingsByBarber || {}) };
          const ovMap = { ...(state.overridesByBarber || {}) };
          const queueMap = { ...(state.queueByBarber || {}) };
          delete bookingsMap[target.id];
          delete ovMap[target.id];
          delete queueMap[target.id];
          state.bookingsByBarber = bookingsMap;
          state.overridesByBarber = ovMap;
          state.queueByBarber = queueMap;
          saveJSON(LS.bookingsByBarber, bookingsMap);
          saveJSON(LS.overridesByBarber, ovMap);
          saveJSON(LS.queueByBarber, queueMap);
        }

        syncBarberSelections();
        renderBarberManager();
        refreshAllAfterBarberChange();
      }
    });
  });
}

async function onStorageSync(e){
  if(!SYNC_KEYS.has(e.key)) return;

  if(e.key === LS.barbers){
    setBarbers(loadJSON(LS.barbers, []), { skipLocal:true });
    syncBarberSelections();
    renderBarberManager();
  }

  if(e.key === LS.bookingsByBarber){
    state.bookingsByBarber = loadJSON(LS.bookingsByBarber, {});
  }

  if(e.key === LS.overridesByBarber){
    state.overridesByBarber = loadJSON(LS.overridesByBarber, {});
  }

  if(e.key === LS.queueByBarber){
    state.queueByBarber = loadJSON(LS.queueByBarber, {});
    renderQueue();
  }

  if(e.key === LS.gallery){
    setGalleryPhotos(loadJSON(LS.gallery, []), { skipLocal:true });
    await renderGallery();
    await renderPhotoManager();
    return;
  }

  if(e.key === LS.barberUnlocked || e.key === LS.barberSession){
    state.barberSession = loadJSON(LS.barberSession, { barberId:null });
    applyBarberLock();
    return;
  }

  if(e.key === LS.adminUnlocked){
    applyAdminLock();
    return;
  }

  // bookings/overrides impact calendar + pickers
  const bDate = $("#bDate").value;
  const qDate = $("#qDate").value;
  const aDate = $("#aDate").value;

  renderCalendar();
  if(bDate) hydrateBookingTimes(bDate);
  if(qDate) hydrateQueueTimes(qDate);
  if(aDate) hydrateAdminTimes(aDate);
}

function setupStorageSync(){
  window.addEventListener("storage", (e)=>{ onStorageSync(e); });
}

/* ----------------- init ----------------- */
async function init(){
  hydrateLinks();
  setupMobileMenu();
  await renderGallery();
  await renderPhotoManager();
  syncBarberSelections();
  renderBarberManager();
  clampDateInputs();

  showDbBanner("");
  setSyncStatus(true);

  // defaults
  const min = MIN_DATE;
  $("#bDate").value = min;
  $("#qDate").value = min;
  $("#aDate").value = min;

  hydrateBookingTimes(min);
  hydrateQueueTimes(min);
  hydrateAdminTimes(min);
  calendarMonthISO = monthStartISO(min);
  renderCalendar();

  // listeners
  $("#bDate").addEventListener("change", (e)=> hydrateBookingTimes(e.target.value));
  $("#bBarber").addEventListener("change", (e)=>{ setSelectedBarberId("booking", e.target.value); refreshAllAfterBarberChange(); renderSmsHint(); });
  $("#sendBookingText").addEventListener("click", (e)=>{ e.preventDefault(); sendBookingSMS(); });
  $("#calPrev").addEventListener("click", (e)=>{ e.preventDefault(); goToMonth(-1); });
  $("#calNext").addEventListener("click", (e)=>{ e.preventDefault(); goToMonth(1); });

  // barber desk lock/unlock
  $("#unlockBarberDesk").addEventListener("click", unlockBarberDesk);
  $("#lockBarberDesk").addEventListener("click", ()=> setBarberUnlocked(false));
  $("#barberPasscodeInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") unlockBarberDesk(); });
  $("#barberDeskBarber").addEventListener("change", (e)=>{ setSelectedBarberId("admin", e.target.value); applyBarberLockToSelectors(); });

  // admin lock/unlock
  $("#unlockAdmin").addEventListener("click", unlockAdmin);
  $("#lockAdmin").addEventListener("click", ()=> setAdminUnlocked(false));
  $("#adminPinInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") unlockAdmin(); });

  // queue
  $("#addToQueue").addEventListener("click", (e)=>{ e.preventDefault(); addToQueue(); });
  $("#qDate").addEventListener("change", (e)=> hydrateQueueTimes(e.target.value));
  $("#qBarber").addEventListener("change", (e)=>{ setSelectedBarberId("queue", e.target.value); refreshAllAfterBarberChange(); });
  $("#markDayAvailable").addEventListener("click", (e)=>{ e.preventDefault(); markDayAvailableFromQueue(); });

  // availability editor
  $("#aDate").addEventListener("change", (e)=> hydrateAdminTimes(e.target.value));
  $("#aBarber").addEventListener("change", (e)=>{ setSelectedBarberId("admin", e.target.value); refreshAllAfterBarberChange(); });
  $("#aDayOff").addEventListener("change", ()=> saveDayOffToggle($("#aDate").value));
  $("#clearOverrides").addEventListener("click", (e)=>{ e.preventDefault(); clearOverridesForDate($("#aDate").value); });

  $("#saveOverrides").addEventListener("click", (e)=>{
    e.preventDefault();
    $("#adminSaveNote").textContent = "Saved.";
    setTimeout(()=> $("#adminSaveNote").textContent = "", 1200);
    refreshBookingPickers($("#aDate").value);
  });

  // gallery uploads (local device only)
  bindUploadControl("#btnTakePhoto", "#inputTakePhoto", "Photo");
  bindUploadControl("#btnUploadFile", "#inputUploadFile", "Upload");
  bindUploadControl("#btnCameraRoll", "#inputCameraRoll", "Camera roll");

  // barbers
  $("#addBarber").addEventListener("click", (e)=>{ e.preventDefault(); addBarberFromAdmin(); });

  // cross-tab sync so edits mirror instantly everywhere
  setupStorageSync();

  // apply lock state
  applyBarberLock();
  applyAdminLock();
  renderQueue();
}

document.addEventListener("DOMContentLoaded", init);
