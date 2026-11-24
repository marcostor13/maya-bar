import type {
  AutomationStep,
  AutomationTrigger,
  SendWindow,
} from './automation-steps';

export interface AutomationTemplate {
  key: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  steps: Omit<AutomationStep, 'id'>[];
  exitOnReply: boolean;
  sendWindow?: SendWindow;
}

/** Secuencias listas para usar (HU58). Se copian y se editan. */
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: 'form-followup',
    name: 'Seguimiento de lead del formulario (3 toques)',
    description:
      'WhatsApp al instante, email al día siguiente y un último WhatsApp a los 3 días. Sale si responde.',
    trigger: { type: 'form_submitted' },
    exitOnReply: true,
    sendWindow: { from: 8, to: 21 },
    steps: [
      {
        type: 'whatsapp',
        text: 'Hola {nombre}, gracias por escribirnos en {empresa}. ¿En qué te podemos ayudar?',
      },
      { type: 'wait', minutes: 24 * 60 },
      {
        type: 'email',
        subject: '{nombre}, seguimos atentos a tu consulta',
        text: 'Hola {nombre},\n\nVimos tu mensaje y queremos ayudarte. Responde este correo o escríbenos por WhatsApp cuando quieras.\n\nEl equipo de {empresa}',
      },
      { type: 'wait', minutes: 2 * 24 * 60 },
      {
        type: 'whatsapp',
        text: 'Hola {nombre}, ¿pudiste revisar la información? Si quieres te llamamos.',
      },
      {
        type: 'reminder',
        title: 'Llamar al lead del formulario',
        dueMinutes: 60,
      },
    ],
  },
  {
    key: 'event-reminder',
    name: 'Recordatorio de evento 24 h antes',
    description:
      'Confirma la inscripción y recuerda el evento un día antes por WhatsApp y email.',
    trigger: { type: 'event_registered' },
    exitOnReply: false,
    steps: [
      { type: 'wait', hoursBeforeEvent: 24 },
      {
        type: 'whatsapp',
        text: 'Hola {nombre}, te recordamos que mañana es el evento. ¡Te esperamos!',
      },
      {
        type: 'email',
        subject: 'Mañana nos vemos, {nombre}',
        text: 'Hola {nombre},\n\nTe recordamos que mañana es el evento al que te inscribiste. Lleva tu código de entrada.\n\n{empresa}',
      },
    ],
  },
  {
    key: 'reactivation-30',
    name: 'Reactivación a los 30 días',
    description:
      'Si un contacto lleva 30 días sin responder, le escribe de nuevo y lo marca para el equipo.',
    trigger: { type: 'no_reply', hours: 30 * 24 },
    exitOnReply: true,
    sendWindow: { from: 9, to: 20 },
    steps: [
      {
        type: 'whatsapp',
        text: 'Hola {nombre}, hace tiempo que no hablamos. ¿Te podemos ayudar en algo?',
      },
      { type: 'wait', minutes: 3 * 24 * 60 },
      {
        type: 'condition',
        condition: 'not_replied',
        otherwise: 'exit',
      },
      { type: 'tag', tag: 'inactivo' },
    ],
  },
];
