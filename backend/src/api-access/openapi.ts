import { HOOK_EVENTS, HOOK_SAMPLES } from './api-hooks.service';

type Obj = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Obj, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});
const body = (schema: Obj) => ({
  required: true,
  content: { 'application/json': { schema } },
});
const errors = {
  '400': { $ref: '#/components/responses/BadRequest' },
  '401': { $ref: '#/components/responses/Unauthorized' },
  '403': { $ref: '#/components/responses/Forbidden' },
};
const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};
const listParams = [
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  },
  {
    name: 'since',
    in: 'query',
    description: 'Solo lo cambiado después de esta fecha (ISO 8601).',
    schema: { type: 'string', format: 'date-time' },
  },
];

/**
 * Especificación OpenAPI 3.0 de la API de integraciones (HU65): CRM, REST
 * hooks para Zapier y Make, y el envío de mensajes de HU13.
 */
export function buildOpenApi(
  serverUrl = process.env.PUBLIC_API_URL || 'https://api.mayacrm.site',
): Obj {
  const contactSchema = (HOOK_SAMPLES['contact.created'] as { contact: Obj })
    .contact;
  return {
    openapi: '3.0.3',
    info: {
      title: 'Maya CRM — API de integraciones',
      version: '1.0.0',
      description:
        'Conecta Maya con Zapier, Make o tu propio sistema. Autentícate con `Authorization: Bearer <clave>` usando una clave de tipo "Automatización". ' +
        'Los avisos (REST hooks) llegan firmados en `X-Maya-Signature`: `sha256=` + HMAC-SHA256(sha256hex(clave), `<X-Maya-Timestamp>.<cuerpo>`). Si respondes 410 la suscripción se borra.',
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Cuenta' },
      { name: 'Contactos' },
      { name: 'Oportunidades' },
      { name: 'WhatsApp' },
      { name: 'Webhooks' },
    ],
    paths: {
      '/api/v1/me': {
        get: {
          tags: ['Cuenta'],
          operationId: 'me',
          summary: 'Prueba la clave',
          responses: { '200': json(ref('Me')), ...errors },
        },
      },
      '/api/v1/contacts': {
        get: {
          tags: ['Contactos'],
          operationId: 'listContacts',
          summary: 'Lista o busca contactos',
          parameters: [
            ...listParams,
            { name: 'email', in: 'query', schema: { type: 'string' } },
            { name: 'phone', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': json({ type: 'array', items: ref('Contact') }),
            ...errors,
          },
        },
        post: {
          tags: ['Contactos'],
          operationId: 'upsertContact',
          summary:
            'Crea o actualiza un contacto (busca por email y luego por teléfono)',
          requestBody: body(ref('ContactInput')),
          responses: {
            '200': json(ref('UpsertResult'), 'Actualizado'),
            '201': json(ref('UpsertResult'), 'Creado'),
            '409': { $ref: '#/components/responses/Conflict' },
            '429': { $ref: '#/components/responses/TooManyRequests' },
            ...errors,
          },
        },
      },
      '/api/v1/contacts/{id}': {
        get: {
          tags: ['Contactos'],
          operationId: 'getContact',
          summary: 'Un contacto',
          parameters: [idParam],
          responses: {
            '200': json(ref('Contact')),
            '404': { $ref: '#/components/responses/NotFound' },
            ...errors,
          },
        },
        patch: {
          tags: ['Contactos'],
          operationId: 'updateContact',
          summary: 'Actualiza un contacto',
          parameters: [idParam],
          requestBody: body(ref('ContactInput')),
          responses: {
            '200': json(ref('Contact')),
            '404': { $ref: '#/components/responses/NotFound' },
            ...errors,
          },
        },
      },
      '/api/v1/contacts/{id}/tags': {
        post: {
          tags: ['Contactos'],
          operationId: 'addTags',
          summary: 'Añade etiquetas',
          parameters: [idParam],
          requestBody: body({
            type: 'object',
            required: ['tags'],
            properties: {
              tags: { type: 'array', items: { type: 'string' }, maxItems: 30 },
            },
          }),
          responses: {
            '200': json(ref('Contact')),
            '404': { $ref: '#/components/responses/NotFound' },
            ...errors,
          },
        },
      },
      '/api/v1/leads': {
        get: {
          tags: ['Oportunidades'],
          operationId: 'listLeads',
          summary: 'Lista oportunidades',
          parameters: listParams,
          responses: {
            '200': json({ type: 'array', items: ref('Lead') }),
            ...errors,
          },
        },
        post: {
          tags: ['Oportunidades'],
          operationId: 'createLead',
          summary: 'Crea una oportunidad',
          requestBody: body(ref('LeadInput')),
          responses: { '201': json(ref('Lead'), 'Creada'), ...errors },
        },
      },
      '/api/v1/whatsapp/templates': {
        post: {
          tags: ['WhatsApp'],
          operationId: 'sendWhatsappTemplate',
          summary: 'Envía una plantilla aprobada de WhatsApp',
          parameters: [
            {
              name: 'Idempotency-Key',
              in: 'header',
              schema: { type: 'string', maxLength: 100 },
            },
          ],
          requestBody: body(ref('TemplateSend')),
          responses: {
            '201': json(ref('Message'), 'Enviado'),
            '200': json(ref('Message'), 'Repetido (misma Idempotency-Key)'),
            '422': { $ref: '#/components/responses/Unprocessable' },
            ...errors,
          },
        },
      },
      '/api/v1/hooks': {
        get: {
          tags: ['Webhooks'],
          operationId: 'listHooks',
          summary: 'Suscripciones de esta clave',
          responses: {
            '200': json({ type: 'array', items: ref('Hook') }),
            ...errors,
          },
        },
        post: {
          tags: ['Webhooks'],
          operationId: 'subscribeHook',
          summary: 'Suscribe una URL a un disparador (REST hook)',
          requestBody: body(ref('HookInput')),
          responses: { '201': json(ref('Hook'), 'Suscrita'), ...errors },
          callbacks: {
            evento: {
              '{$request.body#/targetUrl}': {
                post: {
                  summary: 'Aviso del disparador',
                  parameters: [
                    {
                      name: 'X-Maya-Event',
                      in: 'header',
                      required: true,
                      schema: { type: 'string' },
                    },
                    {
                      name: 'X-Maya-Timestamp',
                      in: 'header',
                      required: true,
                      schema: { type: 'string' },
                    },
                    {
                      name: 'X-Maya-Signature',
                      in: 'header',
                      required: true,
                      schema: { type: 'string' },
                    },
                  ],
                  requestBody: body(ref('HookPayload')),
                  responses: {
                    '200': { description: 'Recibido' },
                    '410': { description: 'Borra la suscripción' },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/hooks/{id}': {
        delete: {
          tags: ['Webhooks'],
          operationId: 'unsubscribeHook',
          summary: 'Borra una suscripción',
          parameters: [idParam],
          responses: {
            '200': json({
              type: 'object',
              properties: { deleted: { type: 'boolean' } },
            }),
            '404': { $ref: '#/components/responses/NotFound' },
            ...errors,
          },
        },
      },
      '/api/v1/hooks/samples/{event}': {
        get: {
          tags: ['Webhooks'],
          operationId: 'hookSample',
          summary: 'Ejemplo de la carga de un disparador',
          parameters: [
            {
              name: 'event',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: [...HOOK_EVENTS] },
            },
          ],
          responses: {
            '200': json({ type: 'array', items: ref('HookPayload') }),
            ...errors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Clave de API de tipo Automatización (`maya_…`).',
        },
      },
      responses: {
        BadRequest: json(ref('Error'), 'Datos no válidos'),
        Unauthorized: json(ref('Error'), 'Clave inválida o revocada'),
        Forbidden: json(
          ref('Error'),
          'La clave no es de tipo Automatización o la IP no está autorizada',
        ),
        NotFound: json(ref('Error'), 'No existe en tu empresa'),
        Conflict: json(
          ref('Error'),
          'Email o teléfono ya usados por otro contacto',
        ),
        Unprocessable: json(
          ref('Error'),
          'No se puede enviar (bloqueado, no contactar o sin plantilla)',
        ),
        TooManyRequests: json(
          ref('Error'),
          'Superaste el límite por minuto o por día',
        ),
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            statusCode: { type: 'integer' },
            message: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
            },
          },
        },
        Me: {
          type: 'object',
          properties: {
            accessId: { type: 'string' },
            name: { type: 'string' },
            tenantId: { type: 'string' },
            channel: { type: 'string' },
            account: { type: 'string' },
          },
        },
        Contact: {
          type: 'object',
          example: contactSchema,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            tags: { type: 'array', items: { type: 'string' } },
            source: { type: 'string' },
            ownerId: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time', nullable: true },
            updatedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ContactInput: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 120 },
            email: { type: 'string', format: 'email' },
            phone: {
              type: 'string',
              maxLength: 32,
              description: 'Con código de país, p. ej. +51987654321',
            },
            tags: { type: 'array', items: { type: 'string' }, maxItems: 30 },
            notes: { type: 'string', maxLength: 2000 },
          },
        },
        UpsertResult: {
          type: 'object',
          properties: { created: { type: 'boolean' }, contact: ref('Contact') },
        },
        Lead: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            value: { type: 'number' },
            currency: { type: 'string' },
            stage: { type: 'string' },
            status: { type: 'string', enum: ['open', 'won', 'lost'] },
            source: { type: 'string' },
            customerId: { type: 'string' },
            ownerId: { type: 'string', nullable: true },
            tags: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        LeadInput: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 200 },
            contactId: { type: 'string' },
            contact: ref('ContactInput'),
            value: { type: 'number', minimum: 0 },
            currency: { type: 'string', maxLength: 3 },
            stage: {
              type: 'string',
              description: 'Clave de la etapa; vacía = la primera',
            },
            ownerId: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
        TemplateSend: {
          type: 'object',
          required: ['template'],
          properties: {
            to: { type: 'string', description: 'Teléfono con código de país' },
            contactId: { type: 'string' },
            template: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                language: { type: 'string' },
                variables: { type: 'array', items: { type: 'string' } },
                headerText: { type: 'string' },
                headerMediaUrl: { type: 'string' },
              },
            },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string' },
            to: { type: 'string' },
            channel: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Hook: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            event: { type: 'string', enum: [...HOOK_EVENTS] },
            targetUrl: { type: 'string' },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        HookInput: {
          type: 'object',
          required: ['event', 'targetUrl'],
          properties: {
            event: { type: 'string', enum: [...HOOK_EVENTS] },
            targetUrl: {
              type: 'string',
              format: 'uri',
              description: 'https y pública',
            },
          },
        },
        HookPayload: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            event: { type: 'string', enum: [...HOOK_EVENTS] },
            occurredAt: { type: 'string', format: 'date-time' },
            data: { type: 'object', additionalProperties: true },
          },
          example: {
            id: 'sample',
            event: 'contact.created',
            occurredAt: '2026-11-24T15:00:00.000Z',
            data: HOOK_SAMPLES['contact.created'],
          },
        },
      },
    },
  };
}
