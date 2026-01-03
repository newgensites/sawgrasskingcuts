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

const API_BASE = "/api";

const LS = {
  bookings: "vb_bookings_v1",     // { "YYYY-MM-DD": { "HH:MM": bookingObj } }
  overrides: "vb_overrides_v1",   // { "YYYY-MM-DD": { dayOff: bool, blocked: ["HH:MM"] } }
  queue: "vb_queue_v1",           // [ {id,...} ]
  adminUnlocked: "vb_admin_unlocked_v1",
  gallery: "vb_gallery_v1",
};

const SYNC_KEYS = new Set([LS.bookings, LS.overrides, LS.queue, LS.gallery]);

async function persistState(key, data){
  if(typeof fetch === "undefined") return;
  try{
    await fetch(`${API_BASE}/state/${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  }catch(err){
    console.warn("Unable to sync with server", err);
  }
}

async function syncFromServer(){
  if(typeof fetch === "undefined") return;
  try{
    const res = await fetch(`${API_BASE}/state`);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if(data.bookings) setBookings(data.bookings, { sync:false });
    if(data.overrides) setOverrides(data.overrides, { sync:false });
    if(data.queue) setQueue(data.queue, { sync:false });
    if(data.gallery) setGalleryPhotos(data.gallery, { sync:false });
  }catch(err){
    console.warn("Unable to load state from server", err);
  }
}

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
function getBookings(){
  return loadJSON(LS.bookings, {});
}
function setBookings(b, opts={ sync:true }){
  saveJSON(LS.bookings, b);
  if(opts.sync !== false) persistState("bookings", b);
}
function getOverrides(){
  return loadJSON(LS.overrides, {});
}
function setOverrides(o, opts={ sync:true }){
  saveJSON(LS.overrides, o);
  if(opts.sync !== false) persistState("overrides", o);
}
function getQueue(){
  return loadJSON(LS.queue, []);
}
function setQueue(q, opts={ sync:true }){
  saveJSON(LS.queue, q);
  if(opts.sync !== false) persistState("queue", q);
}

function getGalleryPhotos(){
  return loadJSON(LS.gallery, []);
}
function setGalleryPhotos(arr, opts={ sync:true }){
  saveJSON(LS.gallery, arr);
  if(opts.sync !== false) persistState("gallery", arr);
}

function markTaken(dateISO, timeHHMM, bookingObj){
  const bookings = getBookings();
  if(!bookings[dateISO]) bookings[dateISO] = {};
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
  return Boolean(bookings && bookings[dateISO] && bookings[dateISO][timeHHMM]);
}

function isBlocked(dateISO, timeHHMM){
  const ov = getOverrides();
  const entry = ov && ov[dateISO];
  if(!entry) return false;
  if(entry.dayOff) return true;
  return (entry.blocked || []).includes(timeHHMM);
}

function isDayOff(dateISO){
  const ov = getOverrides();
  return Boolean(ov && ov[dateISO] && ov[dateISO].dayOff);
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

  $("#smsHint").textContent = `Opens your text app and sends the request to ${CONFIG.SHOP_PHONE_DISPLAY}.`;
  $("#year").textContent = new Date().getFullYear();

  // hours summary text
  $("#hoursText").textContent = "Select a date to view hours + times.";
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

/* ----------------- UI: gallery ----------------- */
function renderGallery(){
  const grid = $("#galleryGrid");
  const hint = $("#galleryHint");
  if(!grid) return;

  const photos = getGalleryPhotos();
  grid.innerHTML = "";

  const items = photos.length ? photos : Array.from({ length: 6 }, ()=> null);

  items.forEach((src, idx)=>{
    const cell = document.createElement("div");
    cell.className = "photo";

    if(src){
      cell.classList.add("has-img");
      const img = document.createElement("img");
      img.src = src;
      img.alt = `Recent cut ${idx + 1}`;
      cell.title = "Open full photo";
      cell.appendChild(img);
      cell.addEventListener("click", ()=> window.open(src, "_blank"));
    } else {
      cell.textContent = "Photo Slot";
    }

    grid.appendChild(cell);
  });

  if(hint){
    hint.textContent = photos.length
      ? "Recent uploads are saved on this device. Tap to open."
      : "No uploads yet. Add fresh cuts in the admin desk.";
  }
}

function renderPhotoManager(){
  const list = $("#photoList");
  if(!list) return;

  const photos = getGalleryPhotos();
  list.innerHTML = "";

  if(photos.length === 0){
    const empty = document.createElement("div");
    empty.className = "muted tiny";
    empty.textContent = "No photos uploaded yet.";
    list.appendChild(empty);
    return;
  }

  photos.forEach((src, idx)=>{
    const row = document.createElement("div");
    row.className = "photo-row";
    row.innerHTML = `
      <div class="photo-thumb">${src ? `<img src="${src}" alt="Recent work ${idx + 1}">` : ""}</div>
      <div class="photo-meta">
        <div class="tiny muted">Photo ${idx + 1}</div>
        <div class="photo-actions">
          <button class="ghost tiny-btn" data-act="open" data-idx="${idx}">Open</button>
          <button class="ghost danger tiny-btn" data-act="delete" data-idx="${idx}">Delete</button>
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const idx = Number(btn.getAttribute("data-idx"));
      const act = btn.getAttribute("data-act");
      const photosNow = getGalleryPhotos();
      const src = photosNow[idx];

      if(typeof src === "undefined") return;

      if(act === "open"){
        window.open(src, "_blank");
      }

      if(act === "delete"){
        const ok = confirm("Delete this photo from Recent Work?");
        if(ok){
          photosNow.splice(idx,1);
          setGalleryPhotos(photosNow);
          renderGallery();
          renderPhotoManager();
          setPhotoUploadNote("Photo removed from Recent Work.", true);
        }
      }
    });
  });
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
  reader.onload = (e)=>{
    const photos = getGalleryPhotos();
    photos.unshift(e.target.result);
    setGalleryPhotos(photos.slice(0, 9));
    renderGallery();
    renderPhotoManager();
    setPhotoUploadNote(`${sourceLabel || "Upload"} added to gallery.`, true);
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
  const minMonth = monthStartISO(MIN_DATE);
  const maxMonth = monthStartISO(MAX_DATE);

  const base = new Date(calendarMonthISO + "T00:00:00");
  monthLabel.textContent = base.toLocaleString(undefined, { month: "long", year: "numeric" });
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
    const dayOff = isDayOff(iso);
    const hasHours = Boolean(hours) && !dayOff;
    const openCount = hasHours ? availableSlots(iso).length : 0;
    const takenCount = hasHours ? takenSlots(iso).length : 0;

    let meta = hasHours ? `${openCount} open` : (dayOff ? "Day off" : "Closed");
    let dotClass = "dot-closed";

    if(!inRange){
      dayEl.classList.add("disabled");
      meta = "Out of range";
    } else if(!hasHours){
      dayEl.classList.add("closed","disabled");
    } else if(openCount === 0){
      dayEl.classList.add("full");
      dotClass = "dot-full";
      meta = takenCount ? `Full (${takenCount} taken)` : "Full";
    } else {
      dotClass = "dot-open";
    }

    if(selected === iso) dayEl.classList.add("selected");

    dayEl.innerHTML = `
      <div class="cal-row">
        <div class="cal-num">${day}</div>
        <span class="dot ${dotClass}"></span>
      </div>
      <div class="cal-meta">${meta}</div>
    `;

    if(inRange && hasHours){
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
Date/Time: ${date} @ ${formatTime12(time)}
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
    const when = `${item.date} @ ${formatTime12(item.time)}`;

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
    id: (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()),
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
      const ov2 = getOverrides();
      if(!ov2[dateISO]) ov2[dateISO] = { dayOff:false, blocked:[] };
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
  if(!ov[dateISO]) ov[dateISO] = { dayOff:false, blocked:[] };
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
    opt.textContent = formatTime12(t);
    sel.appendChild(opt);
  });
}

function markDayAvailableFromQueue(){
  const dateISO = $("#qDate").value;
  if(!dateISO){
    alert("Pick a date first.");
    return;
  }

  const ov = getOverrides();
  if(ov[dateISO]){
    delete ov[dateISO];
    setOverrides(ov);
  }

  $("#aDate").value = dateISO;
  hydrateAdminTimes(dateISO);
  refreshBookingPickers(dateISO);
}

/* ----------------- misc ----------------- */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[s]));
}

function onStorageSync(e){
  if(!SYNC_KEYS.has(e.key)) return;

  // photos
  if(e.key === LS.gallery){
    renderGallery();
    renderPhotoManager();
    return;
  }

  // queue only
  if(e.key === LS.queue){
    renderQueue();
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
  window.addEventListener("storage", onStorageSync);
}

/* ----------------- init ----------------- */
async function init(){
  hydrateLinks();
  setupMobileMenu();
  await syncFromServer();
  renderGallery();
  renderPhotoManager();
  clampDateInputs();

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
  $("#sendBookingText").addEventListener("click", (e)=>{ e.preventDefault(); sendBookingSMS(); });
  $("#calPrev").addEventListener("click", (e)=>{ e.preventDefault(); goToMonth(-1); });
  $("#calNext").addEventListener("click", (e)=>{ e.preventDefault(); goToMonth(1); });

  // admin lock/unlock
  $("#unlockAdmin").addEventListener("click", unlockAdmin);
  $("#lockAdmin").addEventListener("click", ()=> setAdminUnlocked(false));
  $("#pinInput").addEventListener("keydown", (e)=>{ if(e.key==="Enter") unlockAdmin(); });

  // queue
  $("#addToQueue").addEventListener("click", (e)=>{ e.preventDefault(); addToQueue(); });
  $("#qDate").addEventListener("change", (e)=> hydrateQueueTimes(e.target.value));
  $("#markDayAvailable").addEventListener("click", (e)=>{ e.preventDefault(); markDayAvailableFromQueue(); });

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

  // gallery uploads
  bindUploadControl("#btnTakePhoto", "#inputTakePhoto", "Photo");
  bindUploadControl("#btnUploadFile", "#inputUploadFile", "Upload");
  bindUploadControl("#btnCameraRoll", "#inputCameraRoll", "Camera roll");

  // cross-tab sync so edits mirror instantly everywhere
  setupStorageSync();

  // apply lock state
  applyAdminLock();
  renderQueue();
}

document.addEventListener("DOMContentLoaded", init);
