/*
 * Este módulo es el único punto acoplado al DOM de Google Meet. Mantén los
 * selectores aquí; Google puede modificarlos sin aviso y varían por idioma.
 */
const MEET_SELECTORS = {
  peopleButtons: [
    'button[aria-label*="people" i]',
    'button[aria-label*="personas" i]',
    'button[aria-label*="participants" i]',
    'button[aria-label*="participantes" i]'
  ],
  participantItems: [
    '[data-participant-id]',
    '[data-requested-participant-id]'
  ],
  participantLists: [
    '[aria-label*="participants" i] [role="list"]',
    '[aria-label*="participantes" i] [role="list"]',
    '[aria-label*="people" i] [role="list"]',
    '[aria-label*="personas" i] [role="list"]'
  ]
};

const MEET_CONTROL_TEXT = /(?:frame_person|visual_effects|more_vert|reencuadrar|fondos y efectos|m[aá]s opciones para|more options for)/i;

function cleanParticipantName(rawName) {
  const name = String(rawName || "").replace(/\s+/g, " ").trim();
  // Nunca convierte etiquetas de los controles de Meet en participantes.
  if (!name || MEET_CONTROL_TEXT.test(name)) return null;

  const words = name.split(" ");
  // Meet a veces repite el texto del nombre en dos o más nodos del mismo ítem.
  for (let size = 2; size <= Math.floor(words.length / 2); size += 1) {
    if (words.length % size !== 0) continue;
    const first = words.slice(0, size).join(" ").toLocaleLowerCase("es-CO");
    const repeated = words.every((word, index) => word.toLocaleLowerCase("es-CO") === words[index % size].toLocaleLowerCase("es-CO"));
    if (repeated) return words.slice(0, size).join(" ");
  }
  return name;
}

class MeetParticipantObserver {
  constructor({ onJoin, onLeave, onSnapshot }) {
    this.onJoin = onJoin;
    this.onLeave = onLeave;
    this.onSnapshot = onSnapshot;
    this.participants = new Map();
    this.mutationObserver = null;
    this.pendingScan = null;
  }

  start() {
    this.openPeoplePanel();
    this.mutationObserver = new MutationObserver(() => this.scheduleScan());
    this.mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    this.scan();
  }

  stop() {
    this.mutationObserver?.disconnect();
    window.clearTimeout(this.pendingScan);
    this.mutationObserver = null;
  }

  openPeoplePanel() {
    const button = MEET_SELECTORS.peopleButtons
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    button?.click();
  }

  scheduleScan() {
    window.clearTimeout(this.pendingScan);
    this.pendingScan = window.setTimeout(() => this.scan(), 700);
  }

  scan() {
    const result = this.readParticipants();
    // Si el panel no está disponible, no se interpretan las ausencias como salidas.
    if (!result.ready) return;

    const current = result.participants;
    for (const [id, participant] of current) {
      if (!this.participants.has(id)) this.onJoin?.(participant);
    }
    for (const [id, participant] of this.participants) {
      if (!current.has(id)) this.onLeave?.(participant);
    }

    this.participants = current;
    this.onSnapshot?.([...current.values()]);
  }

  readParticipants() {
    let items = MEET_SELECTORS.participantItems.flatMap((selector) => [...document.querySelectorAll(selector)]);
    if (items.length === 0) {
      const list = MEET_SELECTORS.participantLists
        .map((selector) => document.querySelector(selector))
        .find(Boolean);
      if (!list) return { ready: false, participants: new Map() };
      items = [...list.querySelectorAll('[role="listitem"]')];
    }

    const participants = new Map();
    for (const item of items) {
      const participant = this.toParticipant(item);
      if (participant) participants.set(participant.id, participant);
    }
    return { ready: true, participants };
  }

  toParticipant(item) {
    const nestedName = item.querySelector("[data-participant-name]")?.getAttribute("data-participant-name");
    const rawName = item.getAttribute("data-participant-name") || nestedName || item.getAttribute("aria-label") || item.innerText;
    const name = cleanParticipantName(rawName);
    if (!name) return null;

    const id = item.getAttribute("data-participant-id")
      || item.getAttribute("data-requested-participant-id")
      || `name:${name.toLocaleLowerCase()}`;

    return { id, name: name.slice(0, 255) };
  }
}
