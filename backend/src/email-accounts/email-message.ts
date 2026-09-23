import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';

/** Correo entrante ya interpretado, listo para la bandeja. */
export interface ParsedEmail {
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  from: string;
  fromName?: string;
  to: string[];
  subject: string;
  /** Solo lo nuevo: sin la cita del correo anterior ni la firma de móvil. */
  text: string;
  date: Date;
  /** Boletín, lista de correo o envío masivo. */
  bulk: boolean;
  /** Respuesta automática, rebote o remitente que no admite respuesta. */
  automated: boolean;
  attachments: {
    filename: string;
    contentType: string;
    content: Buffer;
    size: number;
  }[];
}

/** Adjuntos por encima de esto no se re-hospedan: se anotan en el texto. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export async function parseEmail(raw: Buffer | string): Promise<ParsedEmail> {
  const mail = await simpleParser(raw);
  const from = firstAddress(mail.from);
  const header = (name: string) => {
    const v = mail.headers.get(name);
    return typeof v === 'string' ? v : v ? JSON.stringify(v) : '';
  };

  const body = mail.text?.trim()
    ? mail.text
    : mail.html
      ? htmlToPlain(mail.html)
      : '';

  const skipped: string[] = [];
  const attachments = (mail.attachments ?? [])
    .filter((a) => a.contentDisposition !== 'inline' || !a.contentId)
    .filter((a) => {
      const ok = a.size <= MAX_ATTACHMENT_BYTES;
      if (!ok) skipped.push(a.filename ?? 'adjunto');
      return ok;
    })
    .slice(0, MAX_ATTACHMENTS)
    .map((a) => ({
      filename: a.filename || 'adjunto',
      contentType: a.contentType || 'application/octet-stream',
      content: a.content,
      size: a.size,
    }));

  let text = stripQuoted(body);
  if (skipped.length)
    text += `\n\n[Adjuntos demasiado grandes, no importados: ${skipped.join(', ')}]`;

  const precedence = header('precedence').toLowerCase();
  const autoSubmitted = header('auto-submitted').toLowerCase();
  return {
    messageId: mail.messageId,
    inReplyTo: mail.inReplyTo,
    references: toList(mail.references),
    from: from?.address?.toLowerCase() ?? '',
    fromName: from?.name || undefined,
    to: addresses(mail.to),
    subject: (mail.subject ?? '').trim(),
    text: text.trim(),
    date: mail.date ?? new Date(),
    bulk:
      // mailparser agrupa List-Id, List-Unsubscribe… bajo la clave `list`.
      mail.headers.has('list') ||
      mail.headers.has('list-id') ||
      mail.headers.has('list-unsubscribe') ||
      ['bulk', 'list', 'junk'].includes(precedence),
    automated:
      (!!autoSubmitted && autoSubmitted !== 'no') ||
      mail.headers.has('x-autoreply') ||
      mail.headers.has('x-autorespond') ||
      isNoReply(from?.address ?? ''),
    attachments,
  };
}

function firstAddress(a?: AddressObject | AddressObject[]) {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list.flatMap((x) => x.value)[0];
}

function addresses(a?: AddressObject | AddressObject[]): string[] {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list
    .flatMap((x) => x.value)
    .map((v) => v.address?.toLowerCase())
    .filter((v): v is string => !!v);
}

function toList(v: ParsedMail['references']): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Remitentes a los que un agente nunca debe contestar (bucles, rebotes). */
export function isNoReply(address: string): boolean {
  return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce[s]?)([+.@-]|$)/i.test(
    address,
  );
}

/**
 * Deja solo lo que el remitente escribió en este correo: corta en la línea
 * que introduce la cita ("El lun, ... escribió:", "On ... wrote:",
 * "-----Original Message-----", "De: ... Enviado:") y quita las líneas
 * citadas con ">".
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const markers = [
    /^\s*(el|on)\s.+(escribió|wrote|a écrit|schrieb)\s*:?\s*$/i,
    /^\s*-{2,}\s*(original message|mensaje original|forwarded message|mensaje reenviado)\s*-{2,}/i,
    /^\s*_{10,}\s*$/,
    /^\s*(de|from)\s*:\s*.+$/i,
  ];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "De:" solo cuenta como cita si le sigue un "Enviado:/Sent:/Date:".
    if (/^\s*(de|from)\s*:/i.test(line)) {
      const next = lines.slice(i + 1, i + 4).join('\n');
      if (/^\s*(enviado|sent|fecha|date)\s*:/im.test(next)) break;
      out.push(line);
      continue;
    }
    if (markers.slice(0, 3).some((m) => m.test(line))) break;
    // Gmail parte "El ... escribió:" en dos líneas cuando es largo.
    if (
      /^\s*(el|on)\s/i.test(line) &&
      /(escribió|wrote)\s*:\s*$/i.test(lines[i + 1] ?? '')
    )
      break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out
    .join('\n')
    .trim()
    .replace(/\n*(enviado desde mi|sent from my) [^\n]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToPlain(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Asunto de respuesta sin encadenar "Re: Re: RE:". */
export function replySubject(subject?: string): string {
  const base = (subject ?? '')
    .replace(/^\s*((re|rv|fw|fwd)\s*:\s*)+/i, '')
    .trim();
  return base ? `Re: ${base}` : '';
}

/** Cuerpo HTML simple a partir del texto: párrafos, saltos y firma. */
export function textToHtml(text: string, signature?: string): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const sig = signature?.trim()
    ? `<p style="color:#6b7280">${esc(signature.trim()).replace(/\n/g, '<br>')}</p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${paragraphs}${sig}</div>`;
}
