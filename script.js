const CONTACT = {
  phoneDisplay: "(850) 000-0000",
  phoneE164: "+18500000000",
  email: "hello@sawgrasscuts.com"
};

const anchors = {
  topPhone: document.getElementById("topPhone"),
  heroCall: document.getElementById("heroCall"),
  cardPhone: document.getElementById("cardPhone"),
  cardEmail: document.getElementById("cardEmail"),
  heroBook: document.getElementById("heroBook"),
  ctaCall: document.getElementById("ctaCall"),
  contactPhone: document.getElementById("contactPhone"),
  contactText: document.getElementById("contactText"),
  contactEmail: document.getElementById("contactEmail"),
};

function hydrateContactLinks(){
  const tel = `tel:${CONTACT.phoneE164}`;
  const sms = `sms:${CONTACT.phoneE164}`;
  const mail = `mailto:${CONTACT.email}`;

  anchors.topPhone.href = tel;
  anchors.topPhone.textContent = CONTACT.phoneDisplay;

  anchors.heroCall.href = sms;
  anchors.cardPhone.href = sms;
  anchors.cardPhone.textContent = CONTACT.phoneDisplay;

  anchors.cardEmail.href = mail;
  anchors.cardEmail.textContent = CONTACT.email;

  anchors.ctaCall.href = tel;
  anchors.contactPhone.href = tel;
  anchors.contactPhone.textContent = CONTACT.phoneDisplay;

  anchors.contactText.href = sms;
  anchors.contactText.textContent = CONTACT.phoneDisplay;

  anchors.contactEmail.href = mail;
  anchors.contactEmail.textContent = CONTACT.email;
}

function setupNavToggle(){
  const menu = document.getElementById("menuBtn");
  const nav = document.getElementById("navLinks");
  menu.addEventListener("click", ()=>{
    const open = nav.classList.toggle("open");
    menu.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function setupForm(){
  const form = document.getElementById("bookingForm");
  const note = document.getElementById("formNote");
  const today = new Date().toISOString().slice(0,10);
  form.elements.date.min = today;

  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const data = new FormData(form);
    const body = [
      `Name: ${data.get("name")}`,
      `Phone: ${data.get("phone")}`,
      `Service: ${data.get("service")}`,
      `Preferred date: ${data.get("date")}`,
      `Preferred time: ${data.get("time") || "Any"}`,
      "",
      `Notes: ${data.get("notes") || "None"}`
    ].join("%0A");

    const mailto = `mailto:${CONTACT.email}?subject=Booking%20Request%20-%20Sawgrass%20King%20Cuts&body=${body}`;
    window.location.href = mailto;
    note.textContent = "Thanks! Opening your email app so you can send the request.";
  });
}

function setYear(){
  const yearEl = document.getElementById("year");
  yearEl.textContent = new Date().getFullYear();
}

hydrateContactLinks();
setupNavToggle();
setupForm();
setYear();
