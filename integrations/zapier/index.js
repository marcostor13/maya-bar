'use strict';
/**
 * App privada de Zapier para Maya CRM (HU65). Se publica con la CLI:
 *   npm i -g zapier-platform-cli && zapier login && zapier register "Maya CRM" && zapier push
 * La URL base se cambia con la variable de entorno MAYA_API_URL (zapier env:set).
 */
const BASE = process.env.MAYA_API_URL || 'https://api.mayacrm.site';

const authentication = {
  type: 'custom',
  fields: [{ key: 'apiKey', label: 'Clave de API (tipo Automatización)', required: true, type: 'password', helpText: 'Créala en Maya → Integraciones → Nuevo acceso → Uso: Automatización.' }],
  test: { url: `${BASE}/api/v1/me` },
  connectionLabel: '{{json.name}}',
};

const addAuth = (request, z, bundle) => {
  request.headers = request.headers || {};
  request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
  return request;
};

const handleErrors = (response, z) => {
  if (response.status >= 400) {
    const msg = response.json && response.json.message;
    throw new z.errors.Error(Array.isArray(msg) ? msg.join('; ') : msg || `Error ${response.status}`, 'MayaError', response.status);
  }
  return response;
};

/** Disparador REST hook: Zapier suscribe al activar el Zap y desuscribe al apagarlo. */
const hookTrigger = (key, event, noun, label, description) => ({
  key,
  noun,
  display: { label, description },
  operation: {
    type: 'hook',
    performSubscribe: async (z, bundle) =>
      (await z.request({ url: `${BASE}/api/v1/hooks`, method: 'POST', body: { event, targetUrl: bundle.targetUrl } })).data,
    performUnsubscribe: async (z, bundle) =>
      (await z.request({ url: `${BASE}/api/v1/hooks/${bundle.subscribeData.id}`, method: 'DELETE' })).data,
    perform: (z, bundle) => {
      const p = bundle.cleanedRequest || {};
      return [{ id: p.id, event: p.event, occurredAt: p.occurredAt, ...(p.data || {}) }];
    },
    performList: async (z, bundle) =>
      (await z.request({ url: `${BASE}/api/v1/hooks/samples/${event}` })).data.map((p) => ({ id: p.id, event: p.event, occurredAt: p.occurredAt, ...p.data })),
  },
});

const contactFields = [
  { key: 'name', label: 'Nombre' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono (con código de país)' },
  { key: 'tags', label: 'Etiquetas', list: true },
  { key: 'notes', label: 'Notas', type: 'text' },
];

const create = (key, noun, label, description, inputFields, perform) => ({
  key,
  noun,
  display: { label, description },
  operation: { inputFields, perform },
});

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  beforeRequest: [addAuth],
  afterResponse: [handleErrors],
  triggers: {
    contact_created: hookTrigger('contact_created', 'contact.created', 'Contacto', 'Contacto nuevo', 'Cuando se crea un contacto en Maya.'),
    form_submitted: hookTrigger('form_submitted', 'form.submitted', 'Formulario', 'Formulario enviado', 'Cuando alguien envía un formulario de Maya.'),
    lead_stage_changed: hookTrigger('lead_stage_changed', 'lead.stage_changed', 'Oportunidad', 'Oportunidad cambia de etapa', 'Cuando una oportunidad pasa a otra etapa del embudo.'),
    message_received: hookTrigger('message_received', 'message.received', 'Mensaje', 'Mensaje entrante', 'Cuando un contacto escribe por WhatsApp, Instagram, Messenger o correo.'),
    event_registered: hookTrigger('event_registered', 'event.registered', 'Registro', 'Registro a evento', 'Cuando alguien se registra a un evento.'),
  },
  creates: {
    upsert_contact: create('upsert_contact', 'Contacto', 'Crear o actualizar contacto', 'Busca por email y luego por teléfono; si no existe, lo crea.', contactFields, async (z, bundle) =>
      (await z.request({ url: `${BASE}/api/v1/contacts`, method: 'POST', body: bundle.inputData })).data.contact),
    create_lead: create('create_lead', 'Oportunidad', 'Crear oportunidad', 'Crea una oportunidad para un contacto (se crea si no existe).', [
      { key: 'title', label: 'Título', required: true },
      { key: 'value', label: 'Monto', type: 'number' },
      { key: 'currency', label: 'Moneda (PEN, USD…)' },
      { key: 'stage', label: 'Etapa (clave)' },
      { key: 'contactId', label: 'ID del contacto' },
      { key: 'email', label: 'Email del contacto (si no hay ID)' },
      { key: 'phone', label: 'Teléfono del contacto (si no hay ID)' },
      { key: 'name', label: 'Nombre del contacto (si no hay ID)' },
    ], async (z, bundle) => {
      const d = bundle.inputData;
      const body = { title: d.title, value: d.value, currency: d.currency, stage: d.stage };
      if (d.contactId) body.contactId = d.contactId;
      else body.contact = { name: d.name, email: d.email, phone: d.phone };
      return (await z.request({ url: `${BASE}/api/v1/leads`, method: 'POST', body })).data;
    }),
    add_tag: create('add_tag', 'Etiqueta', 'Añadir etiqueta', 'Añade etiquetas a un contacto.', [
      { key: 'contactId', label: 'ID del contacto', required: true },
      { key: 'tags', label: 'Etiquetas', list: true, required: true },
    ], async (z, bundle) =>
      (await z.request({ url: `${BASE}/api/v1/contacts/${bundle.inputData.contactId}/tags`, method: 'POST', body: { tags: bundle.inputData.tags } })).data),
    send_whatsapp_template: create('send_whatsapp_template', 'Mensaje', 'Enviar plantilla de WhatsApp', 'Envía una plantilla aprobada por la cuenta de la clave.', [
      { key: 'to', label: 'Teléfono (con código de país)' },
      { key: 'contactId', label: 'ID del contacto (si no hay teléfono)' },
      { key: 'name', label: 'Nombre de la plantilla', required: true },
      { key: 'language', label: 'Idioma (es, es_PE…)' },
      { key: 'variables', label: 'Variables {{1}}, {{2}}…', list: true },
    ], async (z, bundle) => {
      const d = bundle.inputData;
      return (await z.request({
        url: `${BASE}/api/v1/whatsapp/templates`,
        method: 'POST',
        headers: { 'Idempotency-Key': bundle.meta && bundle.meta.zap ? `zap-${bundle.meta.zap.id}-${Date.now()}` : undefined },
        body: { to: d.to, contactId: d.contactId, template: { name: d.name, language: d.language, variables: d.variables } },
      })).data;
    }),
  },
};
