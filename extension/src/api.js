class AttendanceApi {
  constructor({ apiBaseUrl, apiBaseUrlStorageKey }) {
    this.defaultBaseUrl = this.normalizeBaseUrl(apiBaseUrl);
    this.baseUrlStorageKey = apiBaseUrlStorageKey;
  }

  normalizeBaseUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) throw new Error("Escribe la URL del servidor");
    let url;
    try { url = new URL(raw); }
    catch { throw new Error("La URL del servidor no es válida"); }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("La URL debe comenzar con http:// o https://");
    }
    url.search = "";
    url.hash = "";
    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname.endsWith("/api") ? pathname : `${pathname}/api`;
    return url.toString().replace(/\/$/, "");
  }

  async getBaseUrl() {
    const stored = await chrome.storage.local.get(this.baseUrlStorageKey);
    return stored[this.baseUrlStorageKey]
      ? this.normalizeBaseUrl(stored[this.baseUrlStorageKey])
      : this.defaultBaseUrl;
  }

  async setBaseUrl(value) {
    const baseUrl = this.normalizeBaseUrl(value);
    await chrome.storage.local.set({ [this.baseUrlStorageKey]: baseUrl });
    return baseUrl;
  }

  async getToken() {
    const { attendanceAuthToken } = await chrome.storage.local.get("attendanceAuthToken");
    return attendanceAuthToken || null;
  }

  async setToken(token) {
    await chrome.storage.local.set({ attendanceAuthToken: token });
  }

  async clearToken() {
    await chrome.storage.local.remove("attendanceAuthToken");
  }

  async publicRequest(path, payload) {
    const baseUrl = await this.getBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "content-type": "application/json"
      },
      method: "POST",
      body: JSON.stringify(payload)
    });
    return this.readResponse(response);
  }

  async request(path, options = {}) {
    const [token, baseUrl] = await Promise.all([this.getToken(), this.getBaseUrl()]);
    if (!token) throw new Error("Inicia sesión desde el icono de la extensión");
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
        ...options.headers
      }
    });
    return this.readResponse(response);
  }

  async readResponse(response) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) await this.clearToken();
      throw new Error(payload.error || `La API respondió ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  login(email, password) {
    return this.publicRequest("/auth/login", { email, password });
  }

  register(name, email, password) {
    return this.publicRequest("/auth/register", { name, email, password });
  }

  me() {
    return this.request("/auth/me", { method: "GET" });
  }

  listCourses() {
    return this.request("/courses", { method: "GET" });
  }

  startClass(courseId, meetCode) {
    return this.request("/classes/start", {
      method: "POST",
      body: JSON.stringify({ courseId, meetCode })
    });
  }

  finishClass(sessionId) {
    return this.request(`/classes/${encodeURIComponent(sessionId)}/finish`, {
      method: "POST"
    });
  }

  sendEvent(sessionId, type, participant) {
    return this.request("/attendance/events", {
      method: "POST",
      body: JSON.stringify({ sessionId, type, participant, occurredAt: new Date().toISOString() })
    });
  }

  sync(sessionId, participants) {
    return this.request("/attendance/sync", {
      method: "POST",
      body: JSON.stringify({ sessionId, participants, occurredAt: new Date().toISOString() })
    });
  }
}
