import { EventEmitter } from 'events';

/**
 * Hechos del CRM que pueden disparar una automatización (HU58). Es un bus de
 * módulo, sin inyección: así los servicios que ya existen avisan con una línea
 * y sin depender del módulo de automatizaciones.
 */
export type AutomationEvent =
  | {
      type: 'form_submitted';
      tenantId: string;
      customerId: string;
      formId: string;
    }
  | {
      type: 'contact_created';
      tenantId: string;
      customerId: string;
      formId?: string;
    }
  | {
      type: 'lead_created';
      tenantId: string;
      leadId: string;
      customerId: string;
      unassigned: boolean;
    }
  | {
      type: 'tag_added';
      tenantId: string;
      customerIds: string[];
      tags: string[];
    }
  | {
      type: 'stage_changed';
      tenantId: string;
      customerId: string;
      leadId: string;
      stage: string;
    }
  | {
      type: 'email_opened' | 'email_clicked';
      tenantId: string;
      customerId: string;
      campaignId: string;
      url?: string;
    }
  | {
      /** El puntaje del contacto cambió (HU70). */
      type: 'score_changed';
      tenantId: string;
      customerId: string;
      score: number;
      previous: number;
    }
  | {
      type: 'event_registered';
      tenantId: string;
      eventId: string;
      registrationId: string;
      name: string;
      email?: string;
      phone?: string;
    };

const bus = new EventEmitter();
bus.setMaxListeners(20);

/** Avisa sin bloquear ni fallar: un error del motor nunca tumba al emisor. */
export function emitAutomation(event: AutomationEvent): void {
  try {
    bus.emit('event', event);
  } catch {
    /* el oyente registra sus errores */
  }
}

export function onAutomationEvent(
  listener: (event: AutomationEvent) => void,
): () => void {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}
