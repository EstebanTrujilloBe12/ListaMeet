(() => {
  const api = new AttendanceApi(ATTENDANCE_CONFIG);
  const meetCode = window.location.pathname.split("/").filter(Boolean)[0] || "unknown";
  const storageKey = `attendance-session:${meetCode}`;
  let sessionId = null;
  let observer = null;
  let syncTimer = null;
  let resolveCoursePicker = null;

  const root = document.createElement("section");
  root.id = "meet-attendance-control";
  root.innerHTML = `
    <button id="meet-attendance-toggle" type="button">Iniciar asistencia</button>
    <span id="meet-attendance-status" aria-live="polite">Sin registrar</span>
    <section id="meet-course-picker" hidden role="dialog" aria-modal="false" aria-labelledby="meet-course-picker-title">
      <div class="meet-picker-heading">
        <div><strong id="meet-course-picker-title">Selecciona una clase</strong><span>Elige el grupo al que corresponde esta reunión.</span></div>
        <button id="meet-course-picker-close" type="button" aria-label="Cerrar selector">×</button>
      </div>
      <div id="meet-course-list" class="meet-course-list"></div>
    </section>
  `;
  document.documentElement.append(root);

  const button = root.querySelector("#meet-attendance-toggle");
  const status = root.querySelector("#meet-attendance-status");
  const picker = root.querySelector("#meet-course-picker");
  const courseList = root.querySelector("#meet-course-list");
  const closePickerButton = root.querySelector("#meet-course-picker-close");

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }
  function setPickerOpen(open) {
    picker.hidden = !open;
    root.classList.toggle("is-selecting", open);
  }
  function closeCoursePicker(course = null) {
    if (!resolveCoursePicker) return;
    const resolve = resolveCoursePicker;
    resolveCoursePicker = null;
    setPickerOpen(false);
    resolve(course);
  }
  function chooseCourse(courses) {
    return new Promise((resolve) => {
      resolveCoursePicker = resolve;
      courseList.replaceChildren(...courses.map((course) => {
        const courseButton = document.createElement("button");
        courseButton.type = "button";
        courseButton.className = "meet-course-option";
        const name = document.createElement("strong");
        name.textContent = course.name;
        const details = document.createElement("span");
        details.textContent = `${course.courseCode} · ${course.studentCount} estudiante${Number(course.studentCount) === 1 ? "" : "s"}`;
        courseButton.append(name, details);
        courseButton.addEventListener("click", () => closeCoursePicker(course));
        return courseButton;
      }));
      setPickerOpen(true);
      root.querySelector(".meet-course-option")?.focus();
    });
  }
  async function safely(action) {
    try {
      await action();
    } catch (error) {
      console.error("[Asistencia Meet]", error);
      setStatus(error.message || "No se pudo conectar con el servidor", true);
    }
  }
  function createObserver() {
    return new MeetParticipantObserver({
      onJoin: (participant) => safely(() => api.sendEvent(sessionId, "join", participant)),
      onLeave: (participant) => safely(() => api.sendEvent(sessionId, "leave", participant)),
      onSnapshot: (participants) => {
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => safely(() => api.sync(sessionId, participants)), 1_000);
      }
    });
  }
  async function startAttendance() {
    if (!await api.getToken()) throw new Error("Inicia sesión desde el icono de la extensión antes de comenzar");
    button.disabled = true;
    try {
      const { courses } = await api.listCourses();
      if (!courses.length) throw new Error("Primero agrega una clase y su Excel desde el panel web");
      const course = await chooseCourse(courses);
      if (!course) {
        setStatus("Sin registrar");
        return;
      }
      setStatus("Creando clase...");
      const result = await api.startClass(course.id, meetCode);
      sessionId = result.session.id;
      await chrome.storage.local.set({ [storageKey]: sessionId });
      observer = createObserver();
      observer.start();
      button.textContent = "Finalizar asistencia";
      setStatus(`Registrando: ${course.name}`);
    } finally {
      button.disabled = false;
    }
  }
  async function finishAttendance() {
    if (!window.confirm("¿Finalizar la asistencia de esta clase?")) return;
    observer?.stop();
    window.clearTimeout(syncTimer);
    await api.finishClass(sessionId);
    await chrome.storage.local.remove(storageKey);
    sessionId = null;
    observer = null;
    button.textContent = "Iniciar asistencia";
    setStatus("Clase finalizada");
  }

  button.addEventListener("click", () => safely(() => sessionId ? finishAttendance() : startAttendance()));
  closePickerButton.addEventListener("click", () => closeCoursePicker());
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCoursePicker(); });

  chrome.storage.local.get(storageKey).then(async (stored) => {
    if (!stored[storageKey]) return;
    if (!await api.getToken()) {
      setStatus("Inicia sesión desde el icono de la extensión para recuperar la sesión", true);
      return;
    }
    sessionId = stored[storageKey];
    observer = createObserver();
    observer.start();
    button.textContent = "Finalizar asistencia";
    setStatus("Sesión recuperada; registrando participantes");
  });
})();
