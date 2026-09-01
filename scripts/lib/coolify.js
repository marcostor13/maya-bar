'use strict';

/** Cliente mínimo de la API v1 de Coolify. */
class Coolify {
  constructor({ url, token }) {
    this.url = url.replace(/\/+$/, '');
    this.token = token;
  }

  async request(method, path, body) {
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* respuesta no-JSON: se reporta el texto crudo */
    }
    if (!res.ok) {
      throw new Error(
        `Coolify ${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`,
      );
    }
    return json;
  }

  get = (p) => this.request('GET', p);
  post = (p, b) => this.request('POST', p, b);
  patch = (p, b) => this.request('PATCH', p, b);

  applications = () => this.get('/api/v1/applications');
  application = (uuid) => this.get(`/api/v1/applications/${uuid}`);
  projects = () => this.get('/api/v1/projects');
  servers = () => this.get('/api/v1/servers');
  githubApps = () => this.get('/api/v1/github-apps');

  createPrivateGithubApp = (body) =>
    this.post('/api/v1/applications/private-github-app', body);

  updateApplication = (uuid, body) =>
    this.patch(`/api/v1/applications/${uuid}`, body);

  envs = (uuid) => this.get(`/api/v1/applications/${uuid}/envs`);

  /**
   * Crea o actualiza una variable. Coolify usa POST para crear y PATCH para
   * modificar, y nombra los flags `is_buildtime`/`is_runtime` (sin guion bajo
   * entre "build" y "time", a diferencia de lo que devuelve el GET de la app).
   */
  upsertEnv(uuid, key, value, { exists = false, buildtime = true } = {}) {
    const body = {
      key,
      value,
      is_buildtime: buildtime,
      is_runtime: true,
      is_preview: false,
    };
    return this.request(
      exists ? 'PATCH' : 'POST',
      `/api/v1/applications/${uuid}/envs`,
      body,
    );
  }

  deploy = (uuid, force = false) =>
    this.post(`/api/v1/deploy?uuid=${uuid}&force=${force ? 'true' : 'false'}`);
}

module.exports = { Coolify };
