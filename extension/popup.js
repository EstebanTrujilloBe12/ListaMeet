(() => {
  const api = new AttendanceApi(ATTENDANCE_CONFIG);
  const ui = {
    message: document.querySelector("#message"),
    signedOut: document.querySelector("#signed-out"),
    signedIn: document.querySelector("#signed-in"),
    login: document.querySelector("#login-form"),
    register: document.querySelector("#register-form"),
    showRegister: document.querySelector("#show-register"),
    showLogin: document.querySelector("#show-login"),
    name: document.querySelector("#user-name"),
    email: document.querySelector("#user-email"),
    logout: document.querySelector("#logout")
  };

  function message(text, isError = false) {
    ui.message.textContent = text;
    ui.message.classList.toggle("error", isError);
  }

  function renderUser(user) {
    ui.name.textContent = user.name;
    ui.email.textContent = user.email;
    ui.signedOut.hidden = true;
    ui.signedIn.hidden = false;
    message("Cuenta lista para registrar asistencia.");
  }

  async function authenticate(action) {
    try {
      const { user, token } = await action();
      await api.setToken(token);
      renderUser(user);
    } catch (error) { message(error.message || "No fue posible iniciar sesión", true); }
  }

  ui.login.addEventListener("submit", (event) => {
    event.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(ui.login));
    authenticate(() => api.login(email, password));
  });
  ui.register.addEventListener("submit", (event) => {
    event.preventDefault();
    const { name, email, password } = Object.fromEntries(new FormData(ui.register));
    authenticate(() => api.register(name, email, password));
  });
  ui.showRegister.addEventListener("click", () => { ui.login.hidden = true; ui.showRegister.hidden = true; ui.register.hidden = false; });
  ui.showLogin.addEventListener("click", () => { ui.register.hidden = true; ui.login.hidden = false; ui.showRegister.hidden = false; });
  ui.logout.addEventListener("click", async () => {
    await api.clearToken();
    ui.signedIn.hidden = true;
    ui.signedOut.hidden = false;
    message("Sesión cerrada.");
  });

  api.me().then(({ user }) => renderUser(user)).catch(() => api.clearToken());
})();
