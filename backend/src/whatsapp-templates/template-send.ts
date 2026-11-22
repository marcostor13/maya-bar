import { UnprocessableEntityException } from '@nestjs/common';
import type { TemplateHeader } from '../whatsapp/whatsapp.service';

/** Lo que hace falta de una plantilla guardada para enviarla. */
export interface SendableTemplate {
  name: string;
  language: string;
  status: string;
  body?: string;
  headerType?: string;
  headerText?: string;
  headerMediaUrl?: string;
}

/** Plantilla lista para `sendCloudApiTemplate` y su texto ya rellenado. */
export interface ResolvedTemplate {
  text: string;
  send: {
    name: string;
    language: string;
    variables: string[];
    header?: TemplateHeader;
  };
}

/** Número de variables `{{n}}` distintas que pide un texto de plantilla. */
export function templateVariableCount(text: string | undefined): number {
  const nums = [...(text ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) =>
    Number(m[1]),
  );
  return nums.length ? Math.max(...nums) : 0;
}

export function renderTemplate(text: string, vars: string[]): string {
  return text.replace(
    /\{\{\s*(\d+)\s*\}\}/g,
    (whole, n: string) => vars[Number(n) - 1] ?? whole,
  );
}

export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Valida lo que Meta rechazaría (no aprobada, variables que faltan, cabecera
 * sin su dato) y arma el envío. Los mensajes nombran los campos de quien llama
 * (`fields`), porque la API y la bandeja los llaman distinto.
 */
export function resolveTemplateSend(
  template: SendableTemplate,
  input: { variables?: string[]; headerText?: string; headerMediaUrl?: string },
  fields = {
    variables: '"variables"',
    headerText: '"template.headerText"',
    headerMediaUrl: '"template.headerMediaUrl"',
  },
): ResolvedTemplate {
  if (template.status !== 'APPROVED')
    throw new UnprocessableEntityException(
      `La plantilla "${template.name}" no está aprobada por Meta (estado: ${template.status}).`,
    );

  const variables = (input.variables ?? []).map((v) => v.trim());
  const needed = templateVariableCount(template.body);
  if (variables.length !== needed || variables.some((v) => !v))
    throw new UnprocessableEntityException(
      `La plantilla "${template.name}" necesita ${needed} variable(s) no vacías en ${fields.variables}; recibió ${variables.length}.`,
    );

  let header: TemplateHeader | undefined;
  const format = template.headerType?.toUpperCase();
  if (format === 'TEXT' && templateVariableCount(template.headerText) > 0) {
    if (!input.headerText?.trim())
      throw new UnprocessableEntityException(
        `La cabecera de la plantilla tiene una variable: envía ${fields.headerText}.`,
      );
    header = { format, text: input.headerText.trim() };
  } else if (format && format !== 'TEXT') {
    const mediaUrl = input.headerMediaUrl?.trim() || template.headerMediaUrl;
    if (!mediaUrl || !isHttps(mediaUrl))
      throw new UnprocessableEntityException(
        `La plantilla lleva un archivo en la cabecera: envía ${fields.headerMediaUrl} (https).`,
      );
    header = { format, mediaUrl };
  }

  return {
    text: renderTemplate(template.body ?? '', variables),
    send: {
      name: template.name,
      language: template.language,
      variables,
      header,
    },
  };
}
