(() => {
  const storageKey = "attendance-auth-token";
  const state = {
    token: localStorage.getItem(storageKey) || "",
    user: null,
    sessionId: null,
    session: null,
    sessions: [],
    courses: [],
    students: [],
    studentsCourseId: null,
    editingCourseId: null,
    editingStudentId: null,
    attendanceExpanded: false,
    unmatchedExpanded: false,
    expandedCourseIds: new Set(),
    socket: null
  };

  const ui = {
    toast: document.querySelector("#toast"), auth: document.querySelector("#auth-shell"), app: document.querySelector("#app-shell"),
    login: document.querySelector("#login-form"), register: document.querySelector("#register-form"), showRegister: document.querySelector("#show-register"), showLogin: document.querySelector("#show-login"),
    sidebarName: document.querySelector("#sidebar-name"), userInitial: document.querySelector("#user-initial"), logout: document.querySelector("#logout-button"), menuToggle: document.querySelector("#menu-toggle"), backdrop: document.querySelector("#menu-backdrop"),
    currentStatus: document.querySelector("#current-status"), currentStatusDetail: document.querySelector("#current-status-detail"), metricAttended: document.querySelector("#metric-attended"), metricUnmatched: document.querySelector("#metric-unmatched"),
    startClass: document.querySelector("#start-class-form"), startCourseSelect: document.querySelector("#start-course-select"),
    sessionPanel: document.querySelector("#session-panel"), emptySession: document.querySelector("#empty-session"), classSelect: document.querySelector("#class-select"), sessionState: document.querySelector("#session-state"), sessionName: document.querySelector("#session-name"), sessionMeta: document.querySelector("#session-meta"), finish: document.querySelector("#finish-button"), pdf: document.querySelector("#download-pdf"), csv: document.querySelector("#download-csv"),
    registered: document.querySelector("#summary-registered"), attended: document.querySelector("#summary-attended"), absent: document.querySelector("#summary-absent"), connected: document.querySelector("#summary-connected"), officialCount: document.querySelector("#official-count"), officialToggle: document.querySelector("#official-toggle"), officialToggleLabel: document.querySelector("#official-toggle-label"), officialTable: document.querySelector("#official-table-wrap"), attendanceBody: document.querySelector("#attendance-body"), unmatchedPanel: document.querySelector("#unmatched-panel"), unmatchedCount: document.querySelector("#unmatched-count"), unmatchedToggle: document.querySelector("#unmatched-toggle"), unmatchedToggleLabel: document.querySelector("#unmatched-toggle-label"), unmatchedTable: document.querySelector("#unmatched-table-wrap"), unmatchedBody: document.querySelector("#unmatched-body"),
    history: document.querySelector("#classes-history"), studentsBody: document.querySelector("#students-body"), rosterDescription: document.querySelector("#roster-description"), studentsCourseSelect: document.querySelector("#students-course-select"),
    addCourse: document.querySelector("#add-course-button"), courseModal: document.querySelector("#course-modal"), courseForm: document.querySelector("#course-form"), courseTitle: document.querySelector("#course-modal-title"), courseSubmit: document.querySelector("#course-submit"), workbookField: document.querySelector("#workbook-field"),
    addStudent: document.querySelector("#add-student-button"), studentModal: document.querySelector("#student-modal"), studentForm: document.querySelector("#student-form"), studentTitle: document.querySelector("#student-modal-title"), studentSubmit: document.querySelector("#student-submit")
  };

  function notify(message, error = false) {
    ui.toast.textContent = message;
    ui.toast.className = `show${error ? " error" : ""}`;
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => { ui.toast.className = ""; }, 3800);
  }
  function formatDate(value) {
    return value ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
  }
  function formatDuration(seconds) {
    const value = Number(seconds || 0);
    return [Math.floor(value / 3600), Math.floor(value % 3600 / 60), Math.floor(value % 60)].map((item) => String(item).padStart(2, "0")).join(":");
  }
  function initials(name) {
    return String(name || "U").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  }
  function makeCell(content, className = "") {
    const cell = document.createElement("td");
    cell.className = className;
    if (content instanceof Node) cell.append(content); else cell.textContent = content;
    return cell;
  }
  function actionButton(text, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", handler);
    return button;
  }
  function connectionCell(row) {
    const intervals = Number(row.intervals || 0);
    if (!intervals) return "-";
    const label = `${intervals} ${intervals === 1 ? "conexión" : "conexiones"}`;
    if (intervals === 1) return label;

    const detail = document.createElement("details");
    detail.className = "connection-detail";
    const summary = document.createElement("summary");
    summary.textContent = `${label} · ${intervals - 1} ${intervals - 1 === 1 ? "reingreso" : "reingresos"}`;
    detail.append(summary);
    const history = Array.isArray(row.connectionHistory) ? row.connectionHistory : [];
    if (history.length) {
      const list = document.createElement("ul");
      history.forEach((connection, index) => {
        const item = document.createElement("li");
        item.textContent = `${index + 1}. ${formatDate(connection.joinedAt)} - ${connection.leftAt ? formatDate(connection.leftAt) : "Conectado ahora"} (${formatDuration(connection.totalSeconds)})`;
        list.append(item);
      });
      detail.append(list);
    }
    return detail;
  }
  async function responseData(response) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) signOut(false);
      throw new Error(payload.error || `Error ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }
  function api(path, options = {}) {
    return fetch(`/api${path}`, { ...options, headers: { authorization: `Bearer ${state.token}`, ...options.headers } }).then(responseData);
  }
  function auth(path, payload) {
    return fetch(`/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).then(responseData);
  }

  function setView(view) {
    let visibleView = null;
    document.querySelectorAll(".view").forEach((element) => {
      const active = element.id === `view-${view}`;
      element.hidden = !active;
      element.classList.toggle("active-view", active);
      if (active) visibleView = element;
    });
    if (visibleView) {
      visibleView.classList.remove("view-enter");
      void visibleView.offsetWidth;
      visibleView.classList.add("view-enter");
    }
    document.querySelectorAll(".nav-link").forEach((element) => element.classList.toggle("active", element.dataset.view === view));
    ui.app.classList.remove("menu-open");
    ui.menuToggle.setAttribute("aria-expanded", "false");
    if (view === "classes") renderHistory();
    if (view === "students") loadStudents().catch((error) => notify(error.message, true));
  }
  function showAuthenticated(user) {
    state.user = user;
    ui.sidebarName.textContent = user.name;
    ui.userInitial.textContent = initials(user.name);
    const openApp = () => {
      ui.auth.hidden = true;
      ui.auth.classList.remove("scene-out");
      ui.app.hidden = false;
      ui.app.classList.remove("scene-in");
      void ui.app.offsetWidth;
      ui.app.classList.add("scene-in");
      setView("meet");
    };
    if (ui.auth.hidden) openApp();
    else {
      ui.auth.classList.add("scene-out");
      window.setTimeout(openApp, 360);
    }
  }
  function signOut(notifyUser = true) {
    state.socket?.disconnect();
    state.socket = null;
    state.token = "";
    state.user = null;
    state.session = null;
    state.sessionId = null;
    state.sessions = [];
    state.courses = [];
    state.students = [];
    state.studentsCourseId = null;
    localStorage.removeItem(storageKey);
    ui.app.hidden = true;
    ui.auth.hidden = false;
    if (notifyUser) notify("Sesion cerrada.");
  }
  async function authenticate(action) {
    try {
      const { user, token } = await action();
      state.token = token;
      localStorage.setItem(storageKey, token);
      showAuthenticated(user);
      await refreshCourses();
      await refreshClasses();
      connectSocket();
      notify(`Bienvenido, ${user.name}.`);
    } catch (error) {
      notify(error.message || "No fue posible iniciar sesion", true);
    }
  }
  function switchAuthForm(showRegister) {
    const outgoing = showRegister ? ui.login : ui.register;
    const incoming = showRegister ? ui.register : ui.login;
    if (outgoing.hidden) return;
    outgoing.classList.remove("auth-enter");
    outgoing.classList.add("auth-leave");
    window.setTimeout(() => {
      outgoing.hidden = true;
      outgoing.classList.remove("auth-leave");
      incoming.hidden = false;
      incoming.classList.remove("auth-enter");
      void incoming.offsetWidth;
      incoming.classList.add("auth-enter");
      const focusField = incoming.querySelector("input");
      focusField?.focus();
    }, 220);
  }

  function attendanceRow(row, unmatched = false) {
    const tr = document.createElement("tr");
    if (!unmatched) tr.append(makeCell(row.studentCode || "-", "code-cell"));
    const student = document.createElement("div");
    student.className = "student-cell";
    const name = document.createElement("strong");
    name.textContent = row.studentName;
    student.append(name);
    if (!unmatched && row.program) {
      const program = document.createElement("small");
      program.textContent = row.program;
      program.title = row.program;
      student.append(program);
    }
    tr.append(makeCell(student));
    const badge = document.createElement("span");
    badge.className = `badge ${row.attended ? "present" : "absent"}`;
    badge.textContent = row.attended ? "Si asistio" : "No asistio";
    tr.append(makeCell(badge), makeCell(formatDate(row.firstJoinedAt), "time-cell"), makeCell(formatDate(row.lastLeftAt), "time-cell"), makeCell(formatDuration(row.connectedSeconds), "duration"), makeCell(connectionCell(row), "connections-cell"));
    return tr;
  }
  function renderClassSelect() {
    ui.classSelect.replaceChildren();
    state.sessions.forEach((session) => ui.classSelect.add(new Option(`${session.courseName} - ${formatDate(session.startedAt)}`, session.id)));
    ui.classSelect.value = state.sessionId || "";
  }
  function setAttendanceExpanded(expanded) {
    state.attendanceExpanded = expanded;
    ui.officialTable.hidden = !expanded;
    ui.officialToggle.setAttribute("aria-expanded", String(expanded));
    ui.officialToggleLabel.textContent = expanded ? "Ocultar estudiantes" : "Ver estudiantes";
    ui.officialToggle.querySelector("b").textContent = expanded ? "▴" : "▾";
  }
  function setUnmatchedExpanded(expanded) {
    state.unmatchedExpanded = expanded;
    ui.unmatchedTable.hidden = !expanded;
    ui.unmatchedToggle.setAttribute("aria-expanded", String(expanded));
    ui.unmatchedToggleLabel.textContent = expanded ? "Ocultar registros" : "Ver registros";
    ui.unmatchedToggle.querySelector("b").textContent = expanded ? "▴" : "▾";
  }
  function renderSession(session) {
    const sessionChanged = state.session?.id !== session?.id;
    state.session = session;
    if (!session) {
      ui.sessionPanel.hidden = true;
      ui.emptySession.hidden = false;
      ui.currentStatus.textContent = "Sin clase activa";
      ui.currentStatusDetail.textContent = "Inicia asistencia desde la extension.";
      ui.metricAttended.textContent = "0 / 0";
      ui.metricUnmatched.textContent = "0";
      return;
    }
    ui.emptySession.hidden = true;
    ui.sessionPanel.hidden = false;
    ui.sessionState.textContent = session.status === "active" ? "CLASE EN CURSO" : "CLASE FINALIZADA";
    ui.sessionName.textContent = session.courseName;
    ui.sessionMeta.textContent = `Codigo Meet: ${session.meetCode} - Inicio: ${formatDate(session.startedAt)}`;
    ui.currentStatus.textContent = session.status === "active" ? "Clase en curso" : "Ultima clase finalizada";
    ui.currentStatusDetail.textContent = `${session.courseName} - ${formatDate(session.startedAt)}`;
    ui.metricAttended.textContent = `${session.statistics.attended} / ${session.statistics.registered}`;
    ui.metricUnmatched.textContent = String(session.statistics.unmatched);
    ui.registered.textContent = session.statistics.registered;
    ui.attended.textContent = session.statistics.attended;
    ui.absent.textContent = session.statistics.absent;
    ui.connected.textContent = session.statistics.connected;
    ui.officialCount.textContent = `${session.statistics.registered} estudiantes`;
    ui.attendanceBody.replaceChildren(...session.attendance.map((row) => attendanceRow(row)));
    ui.unmatchedPanel.hidden = !session.unmatched.length;
    ui.unmatchedCount.textContent = `${session.unmatched.length} registros`;
    ui.unmatchedBody.replaceChildren(...session.unmatched.map((row) => attendanceRow(row, true)));
    if (sessionChanged) {
      state.attendanceExpanded = false;
      state.unmatchedExpanded = false;
    }
    setAttendanceExpanded(state.attendanceExpanded);
    setUnmatchedExpanded(state.unmatchedExpanded);
    ui.finish.hidden = session.status !== "active";
  }
  async function loadClass(sessionId = state.sessionId) {
    if (!sessionId) return renderSession(null);
    const { session } = await api(`/classes/${encodeURIComponent(sessionId)}`);
    renderSession(session);
  }
  async function refreshClasses(preferredId) {
    const { sessions } = await api("/classes");
    state.sessions = sessions;
    const selectedStillExists = state.sessionId && sessions.some((session) => session.id === state.sessionId);
    const newestActiveSession = sessions.find((session) => session.status === "active");
    state.sessionId = preferredId || newestActiveSession?.id || (selectedStillExists ? state.sessionId : sessions[0]?.id || null);
    renderClassSelect();
    await loadClass(state.sessionId);
    renderHistory();
  }
  function renderCourseOptions() {
    const render = (select, selectedId, placeholder) => {
      select.replaceChildren();
      if (!state.courses.length) select.add(new Option(placeholder, ""));
      state.courses.forEach((course) => select.add(new Option(`${course.name} - ${course.courseCode}`, course.id)));
      select.value = selectedId ? String(selectedId) : (state.courses[0] ? String(state.courses[0].id) : "");
    };
    render(ui.startCourseSelect, ui.startCourseSelect.value, "Primero agrega una clase");
    if (!state.courses.some((course) => Number(course.id) === Number(state.studentsCourseId))) state.studentsCourseId = state.courses[0]?.id || null;
    render(ui.studentsCourseSelect, state.studentsCourseId, "No hay clases registradas");
    ui.addStudent.disabled = !state.courses.length;
  }
  async function refreshCourses() {
    const { courses } = await api("/courses");
    state.courses = courses;
    renderCourseOptions();
    renderHistory();
  }

  function openCourseModal(course = null) {
    state.editingCourseId = course?.id || null;
    ui.courseForm.reset();
    ui.courseForm.elements.name.value = course?.name || "";
    ui.courseForm.elements.courseCode.value = course?.courseCode || "";
    ui.courseTitle.textContent = course ? "Editar clase" : "Agregar clase";
    ui.courseSubmit.textContent = course ? "Guardar cambios" : "Guardar clase y estudiantes";
    ui.workbookField.hidden = Boolean(course);
    ui.courseForm.elements.workbook.required = !course;
    ui.courseModal.hidden = false;
    ui.courseForm.elements.name.focus();
  }
  function closeCourseModal() {
    ui.courseModal.hidden = true;
    state.editingCourseId = null;
    ui.courseForm.reset();
  }
  function openStudentModal(student = null) {
    if (!state.studentsCourseId) return notify("Primero agrega o selecciona una clase.", true);
    state.editingStudentId = student?.id || null;
    ui.studentForm.reset();
    ui.studentForm.elements.studentCode.value = student?.studentCode || "";
    ui.studentForm.elements.fullName.value = student?.fullName || "";
    ui.studentForm.elements.program.value = student?.program || "";
    ui.studentForm.elements.institutionalEmail.value = student?.institutionalEmail || "";
    ui.studentTitle.textContent = student ? "Editar estudiante" : "Agregar estudiante";
    ui.studentSubmit.textContent = student ? "Guardar cambios" : "Guardar estudiante";
    ui.studentModal.hidden = false;
    ui.studentForm.elements.fullName.focus();
  }
  function closeStudentModal() {
    ui.studentModal.hidden = true;
    state.editingStudentId = null;
    ui.studentForm.reset();
  }
  async function removeCourse(course) {
    const warning = `Eliminar la clase \"${course.name}\" borrara sus ${course.studentCount} estudiantes y ${course.sessionCount} sesiones de asistencia. Esta accion no se puede deshacer.`;
    if (!window.confirm(warning)) return;
    try {
      const deletedSession = state.sessions.some((session) => Number(session.courseId) === Number(course.id) && session.id === state.sessionId);
      await api(`/courses/${encodeURIComponent(course.id)}`, { method: "DELETE" });
      if (deletedSession) state.sessionId = null;
      await refreshCourses();
      await refreshClasses();
      await loadStudents();
      notify("Clase eliminada.");
    } catch (error) {
      notify(error.message, true);
    }
  }
  function renderHistory() {
    ui.history.replaceChildren();
    if (!state.courses.length) {
      ui.history.innerHTML = '<section class="empty-state"><span>O</span><h2>Aun no hay clases registradas</h2><p>Pulsa "Agregar clase", escribe su nombre e ID y carga el Excel de estudiantes.</p></section>';
      return;
    }
    state.courses.forEach((course) => {
      const sessions = state.sessions.filter((session) => Number(session.courseId) === Number(course.id));
      const sessionsExpanded = state.expandedCourseIds.has(course.id);
      const card = document.createElement("section");
      card.className = "course-history";
      const header = document.createElement("div");
      header.className = "course-history-header";
      const info = document.createElement("div");
      const title = document.createElement("h2");
      title.textContent = `${course.name} - ${course.courseCode}`;
      const meta = document.createElement("span");
      meta.textContent = `${course.studentCount} estudiantes - ${sessions.length} sesion${sessions.length === 1 ? "" : "es"}`;
      info.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "course-header-actions";
      const sessionLabel = `${sessionsExpanded ? "Ocultar" : "Ver"} ${sessions.length} ${sessions.length === 1 ? "sesión" : "sesiones"} ${sessionsExpanded ? "▴" : "▾"}`;
      const sessionToggle = actionButton(sessionLabel, "button button-outline session-list-toggle", () => {
        if (state.expandedCourseIds.has(course.id)) state.expandedCourseIds.delete(course.id);
        else state.expandedCourseIds.add(course.id);
        renderHistory();
      });
      sessionToggle.disabled = !sessions.length;
      actions.append(
        sessionToggle,
        actionButton("Editar", "button button-outline", () => openCourseModal(course)),
        actionButton("Eliminar", "button button-danger", () => removeCourse(course))
      );
      header.append(info, actions);
      card.append(header);
      const list = document.createElement("div");
      list.className = "history-list";
      list.hidden = !sessionsExpanded;
      if (!sessions.length) {
        const empty = document.createElement("div");
        empty.className = "history-row";
        empty.textContent = "Aun no hay sesiones de asistencia para esta clase.";
        list.append(empty);
      }
      sessions.forEach((session) => {
        const button = document.createElement("button");
        button.className = "history-row";
        button.type = "button";
        const name = document.createElement("strong");
        name.textContent = session.status === "active" ? "En curso ahora" : "Sesion registrada";
        const date = document.createElement("span");
        date.textContent = formatDate(session.startedAt);
        const status = document.createElement("span");
        status.textContent = session.status === "active" ? "Activa" : "Finalizada";
        const open = document.createElement("span");
        open.className = "open-class";
        open.textContent = "Abrir ->";
        button.append(name, date, status, open);
        button.addEventListener("click", async () => {
          state.sessionId = session.id;
          renderClassSelect();
          await loadClass();
          setView("meet");
        });
        list.append(button);
      });
      card.append(list);
      ui.history.append(card);
    });
  }
  async function loadStudents() {
    if (!state.studentsCourseId) {
      state.students = [];
      ui.rosterDescription.textContent = "Primero agrega una clase y carga su Excel.";
      ui.studentsBody.replaceChildren();
      return;
    }
    const { course, students } = await api(`/students?courseId=${encodeURIComponent(state.studentsCourseId)}`);
    state.students = students;
    ui.rosterDescription.textContent = `${students.length} estudiantes de ${course.name} - ${course.courseCode}. Las coincidencias de Meet son estrictas.`;
    ui.studentsBody.replaceChildren(...students.map((student) => {
      const tr = document.createElement("tr");
      const actions = document.createElement("div");
      actions.append(
        actionButton("Editar", "row-action", () => openStudentModal(student)),
        actionButton("Eliminar", "row-action delete", () => removeStudent(student))
      );
      tr.append(makeCell(student.studentCode, "code-cell"), makeCell(student.fullName), makeCell(student.program), makeCell(student.institutionalEmail), makeCell(actions));
      return tr;
    }));
  }
  async function removeStudent(student) {
    if (!window.confirm(`Eliminar a \"${student.fullName}\" del padron de esta clase?`)) return;
    try {
      await api(`/students/${encodeURIComponent(student.id)}`, { method: "DELETE" });
      await refreshCourses();
      await loadStudents();
      notify("Estudiante eliminado.");
    } catch (error) {
      notify(error.message, true);
    }
  }
  function connectSocket() {
    state.socket?.disconnect();
    state.socket = io({ auth: { token: state.token } });
    state.socket.on("connect_error", (error) => notify(`Tiempo real no disponible: ${error.message}`, true));
    state.socket.on("attendance:changed", (session) => { if (session.id === state.sessionId) renderSession(session); });
    state.socket.on("class:started", (session) => {
      refreshClasses(session.id).catch((error) => notify(error.message, true));
    });
    state.socket.on("classes:changed", () => refreshClasses().catch((error) => notify(error.message, true)));
    state.socket.on("courses:changed", () => refreshCourses().then(() => loadStudents()).catch((error) => notify(error.message, true)));
  }
  async function downloadReport(extension) {
    if (!state.sessionId) return;
    try {
      const response = await fetch(`/api/attendance/classes/${state.sessionId}/export${extension}`, { headers: { authorization: `Bearer ${state.token}` } });
      if (!response.ok) throw new Error("No fue posible descargar el reporte");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `asistencia-${state.sessionId}${extension}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      notify(error.message, true);
    }
  }

  ui.login.addEventListener("submit", (event) => {
    event.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(ui.login));
    authenticate(() => auth("/login", { email, password }));
  });
  ui.register.addEventListener("submit", (event) => {
    event.preventDefault();
    const { name, email, password } = Object.fromEntries(new FormData(ui.register));
    authenticate(() => auth("/register", { name, email, password }));
  });
  ui.showRegister.addEventListener("click", () => switchAuthForm(true));
  ui.showLogin.addEventListener("click", () => switchAuthForm(false));
  document.querySelectorAll(".password-toggle").forEach((button) => button.addEventListener("click", () => {
    const input = button.parentElement.querySelector("input");
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    button.textContent = hidden ? "Ocultar" : "Mostrar";
  }));
  ui.logout.addEventListener("click", () => signOut());
  ui.menuToggle.addEventListener("click", () => {
    const open = ui.app.classList.toggle("menu-open");
    ui.menuToggle.setAttribute("aria-expanded", String(open));
  });
  ui.backdrop.addEventListener("click", () => ui.app.classList.remove("menu-open"));
  document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-view-link]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    setView(link.dataset.viewLink);
  }));
  ui.startClass.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const { session } = await api("/classes/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(ui.startClass))) });
      ui.startClass.reset();
      await refreshClasses(session.id);
      notify("Clase iniciada correctamente.");
    } catch (error) {
      notify(error.message, true);
    }
  });
  ui.classSelect.addEventListener("change", () => {
    state.sessionId = ui.classSelect.value || null;
    loadClass().catch((error) => notify(error.message, true));
  });
  ui.officialToggle.addEventListener("click", () => setAttendanceExpanded(!state.attendanceExpanded));
  ui.unmatchedToggle.addEventListener("click", () => setUnmatchedExpanded(!state.unmatchedExpanded));
  ui.finish.addEventListener("click", async () => {
    if (!state.sessionId || !window.confirm("Finalizar la clase? Se cerraran los intervalos abiertos.")) return;
    try {
      const { session } = await api(`/classes/${state.sessionId}/finish`, { method: "POST" });
      renderSession(session);
      await refreshClasses(session.id);
      notify("Clase finalizada.");
    } catch (error) {
      notify(error.message, true);
    }
  });
  ui.pdf.addEventListener("click", () => downloadReport(".pdf"));
  ui.csv.addEventListener("click", () => downloadReport(""));
  ui.addCourse.addEventListener("click", () => openCourseModal());
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeCourseModal));
  document.querySelectorAll("[data-close-student-modal]").forEach((button) => button.addEventListener("click", closeStudentModal));
  ui.courseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(ui.courseForm);
    try {
      if (state.editingCourseId) {
        await api(`/courses/${encodeURIComponent(state.editingCourseId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: form.get("name"), courseCode: form.get("courseCode") })
        });
        closeCourseModal();
        await refreshCourses();
        await refreshClasses();
        notify("Clase actualizada.");
        return;
      }
      const workbook = form.get("workbook");
      if (!(workbook instanceof File) || !workbook.size) throw new Error("Selecciona el Excel de estudiantes.");
      if (!workbook.name.toLowerCase().endsWith(".xlsx")) throw new Error("El archivo debe ser un Excel .xlsx.");
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${state.token}`,
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-course-name": encodeURIComponent(form.get("name")),
          "x-course-code": encodeURIComponent(form.get("courseCode"))
        },
        body: await workbook.arrayBuffer()
      });
      const payload = await responseData(response);
      state.studentsCourseId = payload.course.id;
      closeCourseModal();
      await refreshCourses();
      await refreshClasses();
      await loadStudents();
      notify(`Clase creada con ${payload.course.students} estudiantes.`);
      setView("classes");
    } catch (error) {
      notify(error.message, true);
    }
  });
  ui.studentsCourseSelect.addEventListener("change", () => {
    state.studentsCourseId = ui.studentsCourseSelect.value || null;
    loadStudents().catch((error) => notify(error.message, true));
  });
  ui.addStudent.addEventListener("click", () => openStudentModal());
  ui.studentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const form = Object.fromEntries(new FormData(ui.studentForm));
      const path = state.editingStudentId ? `/students/${encodeURIComponent(state.editingStudentId)}` : "/students";
      await api(path, {
        method: state.editingStudentId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, courseId: state.studentsCourseId })
      });
      const editing = Boolean(state.editingStudentId);
      closeStudentModal();
      await refreshCourses();
      await loadStudents();
      notify(editing ? "Estudiante actualizado." : "Estudiante agregado.");
    } catch (error) {
      notify(error.message, true);
    }
  });
  (async () => {
    if (!state.token) return;
    try {
      const { user } = await api("/auth/me");
      showAuthenticated(user);
      await refreshCourses();
      await refreshClasses();
      connectSocket();
    } catch {
      signOut(false);
    }
  })();
})();
