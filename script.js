/* =========================================================
   VASEAN Barbershop Booking + Admin Desk
   - Static (GitHub Pages friendly)
   - Uses localStorage for:
     - confirmed bookings (taken times)
     - date/time overrides (blocked times)
     - request queue
   - Booking sends a pre-filled SMS to SHOP_PHONE
   ========================================================= */

const CONFIG = {
  SHOP_NAME: "Sawgrass Kings Cuts",
  SHOP_PHONE_E164: "+19546260836", // main shop line
  SHOP_PHONE_DISPLAY: "(954) 626-0836", // shown on page
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
  bookings: "vb_bookings_v1",     // { "YYYY-MM-DD": { "HH:MM": bookingObj } }
  overrides: "vb_overrides_v1",   // { "YYYY-MM-DD": { dayOff: bool, blocked: ["HH:MM"] } }
  queue: "vb_queue_v1",           // [ {id,...} ]
  adminUnlocked: "vb_admin_unlocked_v1"
};

/* ----------------- helpers ----------------- */
const $ = (sel) => document.querySelector(sel);

function pad(n){ return String(n).padStart(2,"0"); }

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function addDaysISO(iso, days){
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function dayOfWeek(iso){
  return new Date(iso + "T00:00:00").getDay();
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
  const min = todayISO();
  const max = addDaysISO(min, CONFIG.MAX_DAYS_AHEAD);
  ["#bDate","#qDate","#aDate"].forEach(id=>{
    const el = $(id);
    if(!el) return;
    el.min = min;
    el.max = max;
  });
}

/* ----------------- data ops ----------------- */
function getBookings(){
  return loadJSON(LS.bookings, {});
}
function setBookings(b){
  saveJSON(LS.bookings, b);
}
function getOverrides(){
  return loadJSON(LS.overrides, {});
}
function setOverrides(o){
  saveJSON(LS.overrides, o);
}
function getQueue(){
  return loadJSON(LS.queue, []);
}
function setQueue(q){
  saveJSON(LS.queue, q);
}

function markTaken(dateISO, timeHHMM, bookingObj){
  const bookings = getBookings();
  bookings[dateISO] ||= {};
  bookings[dateISO][timeHHMM] = bookingObj || { taken:true };
  setBookings(bookings);
}

function clearTaken(dateISO, timeHHMM){
  const bookings = getBookings();
  if(bookings[dateISO] && bookings[dateISO][timeHHMM]){
    delete bookings[dateISO][timeHHMM];
    if(Object.keys(bookings[dateISO]).length===0) delete bookings[dateISO];
    setBookings(bookings);
  }
}

function isTaken(dateISO, timeHHMM){
  const bookings = getBookings();
  return Boolean(bookings?.[dateISO]?.[timeHHMM]);
}

function isBlocked(dateISO, timeHHMM){
  const ov = getOverrides();
  const entry = ov?.[dateISO];
  if(!entry) return false;
  if(entry.dayOff) return true;
  return (entry.blocked || []).includes(timeHHMM);
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

function availableSlots(dateISO){
  const slots = generateSlots(dateISO);
  return slots.filter(t=>{
    if(isPastSlot(dateISO,t)) return false;
    if(isBlocked(dateISO,t)) return false;
    if(isTaken(dateISO,t)) return false;
    return true;
  });
}

function takenSlots(dateISO){
  const slots = generateSlots(dateISO);
  return slots.filter(t=> isBlocked(dateISO,t) || isTaken(dateISO,t));
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
  $("#emailRequest").href = emailHref;

  $("#smsHint").textContent = `Opens your text app and sends the request to ${CONFIG.SHOP_PHONE_DISPLAY}.`;
  $("#year").textContent = new Date().getFullYear();

  // hours summary text
  $("#hoursText").textContent = "Select a date to view hours + times.";
}

function setupMobileMenu(){
  const btn = $("#hamburger");
  const menu = $("#mobileMenu");
  btn?.addEventListener("click", ()=>{
    const open = menu.classList.toggle("show");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  // close menu on click
  menu?.querySelectorAll("a").forEach(a=>{
    a.addEventListener("click", ()=> menu.classList.remove("show"));
  });
}

/* ----------------- UI: booking form ----------------- */
function hydrateBookingTimes(dateISO){
  const sel = $("#bTime");
  sel.innerHTML = "";

  if(!dateISO){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select a date first";
    sel.appendChild(opt);
    $("#takenText").textContent = "";
    return;
  }

  const hours = getHoursForDate(dateISO);
  $("#hoursText").textContent = hours ? `${hours[0]} – ${hours[1]}` : "Closed on this day.";

  if(!hours){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Closed on this day";
    sel.appendChild(opt);
    $("#takenText").textContent = "";
    return;
  }

  const open = availableSlots(dateISO);
  const taken = takenSlots(dateISO);

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
      opt.textContent = t;
      sel.appendChild(opt);
    });
  }

  $("#takenText").textContent = taken.length
    ? `Taken/blocked for this date: ${taken.join(", ")}`
    : `No taken times yet for this date.`;
}

/* ----------------- UI: booking calendar ----------------- */
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let calendarMonth = null; // Date at start of month

function isWithinBookingRange(iso){
  const min = todayISO();
  const max = addDaysISO(min, CONFIG.MAX_DAYS_AHEAD);
  return iso >= min && iso <= max;
}

function selectBookingDate(iso){
  const input = $("#bDate");
  input.value = iso;
  hydrateBookingTimes(iso);
  renderBookingCalendar();
}

function renderBookingCalendar(){
  if(!calendarMonth) calendarMonth = new Date();
  const grid = $("#calendarDays");
  const label = $("#calLabel");
  if(!grid || !label) return;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const selectedISO = $("#bDate")?.value;

  label.textContent = calendarMonth.toLocaleString(undefined, { month:"long", year:"numeric" });
  grid.innerHTML = "";

  WEEKDAYS.forEach(d=>{
    const div = document.createElement("div");
    div.className = "day-name";
    div.textContent = d;
    grid.appendChild(div);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // empty slots before first day
  for(let i=0;i<firstDay;i++){
    const div = document.createElement("div");
    grid.appendChild(div);
  }

  for(let day=1; day<=daysInMonth; day++){
    const iso = `${year}-${pad(month+1)}-${pad(day)}`;
    const dayDiv = document.createElement("button");
    dayDiv.type = "button";
    dayDiv.className = "day";
    dayDiv.innerHTML = `<span class="date">${day}</span><span class="status"></span>`;

    const statusEl = dayDiv.querySelector(".status");
    const within = isWithinBookingRange(iso);
    const hours = within ? getHoursForDate(iso) : null;
    const open = within && hours ? availableSlots(iso) : [];
    const taken = within && hours ? takenSlots(iso) : [];
    const isToday = iso === todayISO();

    if(!within){
      dayDiv.classList.add("unavailable");
      statusEl.textContent = "Out of range";
      dayDiv.disabled = true;
    } else if(!hours){
      dayDiv.classList.add("closed", "unavailable");
      statusEl.textContent = "Closed";
      dayDiv.disabled = true;
    } else if(open.length > 0){
      dayDiv.classList.add("available");
      statusEl.textContent = `${open.length} open`;
    } else if(taken.length > 0){
      dayDiv.classList.add("full");
      statusEl.textContent = "Unavailable";
      dayDiv.disabled = true;
    } else {
      dayDiv.classList.add("unavailable");
      statusEl.textContent = "Unavailable";
      dayDiv.disabled = true;
    }

    if(isToday) dayDiv.classList.add("today");
    if(selectedISO === iso) dayDiv.classList.add("selected");

    if(!dayDiv.disabled){
      dayDiv.addEventListener("click", ()=> selectBookingDate(iso));
    }

    grid.appendChild(dayDiv);
  }
}

function changeCalendarMonth(delta){
  if(!calendarMonth) calendarMonth = new Date();
  calendarMonth.setMonth(calendarMonth.getMonth() + delta, 1);
  renderBookingCalendar();
}

function sendBookingSMS(){
  const name = $("#bName").value.trim();
  const phone = $("#bPhone").value.trim();
  const service = $("#bService").value;
  const date = $("#bDate").value;
  const time = $("#bTime").value;
  const notes = $("#bNotes").value.trim();

  if(!name || !phone || !date || !time){
    alert("Please fill Name, Phone, Date, and Time.");
    return;
  }

  // re-check availability right before sending
  if(isPastSlot(date,time) || isBlocked(date,time) || isTaken(date,time)){
    alert("That time is no longer available. Please pick another slot.");
    hydrateBookingTimes(date);
    return;
  }

  const msg =
`Booking Request — ${CONFIG.SHOP_NAME}
Name: ${name}
Phone: ${phone}
Service: ${service}
Date/Time: ${date} @ ${time}
Notes: ${notes || "N/A"}

Please confirm if this time is available.`;

  const smsUrl = `sms:${CONFIG.SHOP_PHONE_E164}?&body=${encodeURIComponent(msg)}`;
  window.location.href = smsUrl;
}

/* ----------------- Admin: lock/unlock ----------------- */
function isAdminUnlocked(){
  return localStorage.getItem(LS.adminUnlocked) === "true";
}
function setAdminUnlocked(val){
  localStorage.setItem(LS.adminUnlocked, val ? "true" : "false");
  applyAdminLock();
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
    : "Admin tools unlocked on this device.";
  lockStatus.classList.toggle("ok", !locked);

  pinNote.textContent = locked
    ? "Locked. Enter PIN to unlock."
    : "Unlocked on this device (localStorage).";
}

function unlockAdmin(){
  const pin = $("#pinInput").value.trim();
  if(pin === CONFIG.ADMIN_PIN){
    setAdminUnlocked(true);
    $("#pinInput").value = "";
  } else {
    $("#pinNote").textContent = "Wrong PIN.";
  }
}

/* ----------------- Admin: queue ----------------- */
function renderQueue(){
  const tbody = $("#queueTable");
  const q = getQueue();
  tbody.innerHTML = "";

  if(q.length === 0){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">No queued requests yet.</td>`;
    tbody.appendChild(tr);
    return;
  }

  q.forEach(item=>{
    const tr = document.createElement("tr");
    const when = `${item.date} @ ${item.time}`;

    const statusChip =
      item.status === "confirmed" ? `<span class="chip ok">Confirmed</span>` :
      item.status === "declined" ? `<span class="chip no">Declined</span>` :
      `<span class="chip pending">Pending</span>`;

    tr.innerHTML = `
      <td>
        <div style="font-weight:900">${escapeHtml(item.name)}</div>
        <div class="muted tiny">${escapeHtml(item.phone)} • ${escapeHtml(item.service)}</div>
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
  const name = $("#qName").value.trim();
  const phone = $("#qPhone").value.trim();
  const service = $("#qService").value;
  const date = $("#qDate").value;
  const time = $("#qTime").value;
  const notes = $("#qNotes").value.trim();

  if(!name || !phone || !date || !time){
    alert("Fill Name, Phone, Date, and Time.");
    return;
  }

  const q = getQueue();
  q.unshift({
    id: crypto?.randomUUID?.() || String(Date.now()),
    name, phone, service, date, time, notes,
    status: "pending",
    createdAt: Date.now()
  });
  setQueue(q);

  // clear
  $("#qName").value = "";
  $("#qPhone").value = "";
  $("#qNotes").value = "";
  renderQueue();
}

function handleQueueAction(act, id){
  const q = getQueue();
  const idx = q.findIndex(x=>x.id===id);
  if(idx === -1) return;

  const item = q[idx];

  if(act === "confirm"){
    // mark time as taken (confirmed booking)
    if(isBlocked(item.date, item.time) || isTaken(item.date, item.time)){
      alert("That slot is already blocked/taken. Choose a different time.");
      return;
    }
    markTaken(item.date, item.time, {
      name: item.name,
      phone: item.phone,
      service: item.service,
      notes: item.notes || "",
      status: "confirmed",
      confirmedAt: Date.now()
    });
    q[idx].status = "confirmed";
    setQueue(q);
    renderQueue();
    refreshBookingPickers(item.date);
    alert("Confirmed and saved to calendar (taken).");
  }

  if(act === "decline"){
    q[idx].status = "declined";
    setQueue(q);
    renderQueue();
  }

  if(act === "remove"){
    q.splice(idx,1);
    setQueue(q);
    renderQueue();
  }
}

/* ----------------- Admin: availability editor ----------------- */
function hydrateAdminTimes(dateISO){
  const grid = $("#aTimes");
  grid.innerHTML = "";

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

  const ov = getOverrides();
  const entry = ov?.[dateISO] || { dayOff:false, blocked:[] };
  $("#aDayOff").checked = Boolean(entry.dayOff);

  const slots = generateSlots(dateISO);
  slots.forEach(t=>{
    const pill = document.createElement("div");
    pill.className = "time-pill";
    pill.textContent = t;

    const disabled = entry.dayOff || entry.blocked.includes(t);
    if(disabled) pill.classList.add("selected");

    pill.addEventListener("click", ()=>{
      // toggle blocked time (only if not dayOff)
      if($("#aDayOff").checked) return;
      const ov2 = getOverrides();
      ov2[dateISO] ||= { dayOff:false, blocked:[] };
      const b = new Set(ov2[dateISO].blocked || []);
      if(b.has(t)) b.delete(t); else b.add(t);
      ov2[dateISO].blocked = Array.from(b).sort();
      setOverrides(ov2);
      hydrateAdminTimes(dateISO);
      refreshBookingPickers(dateISO);
    });

    grid.appendChild(pill);
  });
}

function saveDayOffToggle(dateISO){
  const ov = getOverrides();
  ov[dateISO] ||= { dayOff:false, blocked:[] };
  ov[dateISO].dayOff = $("#aDayOff").checked;
  if(ov[dateISO].dayOff){
    // if day off, no need to keep individual blocks
    ov[dateISO].blocked = ov[dateISO].blocked || [];
  }
  setOverrides(ov);
  hydrateAdminTimes(dateISO);
  refreshBookingPickers(dateISO);
}

function clearOverridesForDate(dateISO){
  const ov = getOverrides();
  if(ov[dateISO]){
    delete ov[dateISO];
    setOverrides(ov);
  }
  hydrateAdminTimes(dateISO);
  refreshBookingPickers(dateISO);
}

function refreshBookingPickers(dateISO){
  // refresh booking form + admin queue time picker if same date
  if($("#bDate").value === dateISO) hydrateBookingTimes(dateISO);
  if($("#qDate").value === dateISO) hydrateQueueTimes(dateISO);
  renderBookingCalendar();
}

function hydrateQueueTimes(dateISO){
  const sel = $("#qTime");
  sel.innerHTML = "";
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

  const open = availableSlots(dateISO);
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
    opt.textContent = t;
    sel.appendChild(opt);
  });
}

/* ----------------- misc ----------------- */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[s]));
}

/* ----------------- init ----------------- */
function init(){
  hydrateLinks();
  setupMobileMenu();
  clampDateInputs();

  // defaults
  const min = todayISO();
  $("#bDate").value = min;
  $("#qDate").value = min;
  $("#aDate").value = min;
  calendarMonth = new Date(min + "T00:00:00");

  hydrateBookingTimes(min);
  hydrateQueueTimes(min);
  hydrateAdminTimes(min);
  renderBookingCalendar();

  // listeners
  $("#bDate").addEventListener("change", (e)=>{
    hydrateBookingTimes(e.target.value);
    calendarMonth = new Date(e.target.value + "T00:00:00");
    renderBookingCalendar();
  });
  $("#calPrev").addEventListener("click", ()=> changeCalendarMonth(-1));
  $("#calNext").addEventListener("click", ()=> changeCalendarMonth(1));
  $("#sendBookingText").addEventListener("click", (e)=>{ e.preventDefault(); sendBookingSMS(); });

  // admin lock/unlock
  $("#unlockAdmin").addEventListener("click", unlockAdmin);
  $("#lockAdmin").addEventListener("click", ()=> setAdminUnlocked(false));
  $("#pinInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") unlockAdmin(); });

  // queue
  $("#addToQueue").addEventListener("click", (e)=>{ e.preventDefault(); addToQueue(); });
  $("#qDate").addEventListener("change", (e)=> hydrateQueueTimes(e.target.value));

  // availability editor
  $("#aDate").addEventListener("change", (e)=> hydrateAdminTimes(e.target.value));
  $("#aDayOff").addEventListener("change", ()=> saveDayOffToggle($("#aDate").value));
  $("#clearOverrides").addEventListener("click", (e)=>{ e.preventDefault(); clearOverridesForDate($("#aDate").value); });

  $("#saveOverrides").addEventListener("click", (e)=>{
    e.preventDefault();
    $("#adminSaveNote").textContent = "Saved.";
    setTimeout(()=> $("#adminSaveNote").textContent = "", 1200);
    refreshBookingPickers($("#aDate").value);
  });

  // apply lock state
  applyAdminLock();
  renderQueue();
}

document.addEventListener("DOMContentLoaded", init);
