import {
  isNoReply,
  parseEmail,
  replySubject,
  stripQuoted,
  textToHtml,
} from './email-message';

const crlf = (lines: string[]) => lines.join('\r\n');

describe('parseEmail', () => {
  it('lee remitente, asunto, hilo y deja solo lo nuevo de una respuesta de Gmail', async () => {
    const raw = crlf([
      'From: "Ana Ruiz" <Ana@Cliente.pe>',
      'To: ventas@acme.pe',
      'Subject: Re: Cotización de la web',
      'Message-ID: <abc@cliente.pe>',
      'In-Reply-To: <out1@acme.pe>',
      'References: <first@acme.pe> <out1@acme.pe>',
      'Date: Tue, 22 Sep 2026 10:00:00 -0500',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Perfecto, ¿podemos vernos el jueves?',
      '',
      'El mar, 22 sept 2026 a las 9:00, Ventas <ventas@acme.pe> escribió:',
      '> Te envío la propuesta.',
      '> Saludos',
    ]);
    const e = await parseEmail(raw);
    expect(e).toMatchObject({
      from: 'ana@cliente.pe',
      fromName: 'Ana Ruiz',
      to: ['ventas@acme.pe'],
      subject: 'Re: Cotización de la web',
      messageId: '<abc@cliente.pe>',
      inReplyTo: '<out1@acme.pe>',
      references: ['<first@acme.pe>', '<out1@acme.pe>'],
      text: 'Perfecto, ¿podemos vernos el jueves?',
      bulk: false,
      automated: false,
    });
    expect(e.date.toISOString()).toBe('2026-09-22T15:00:00.000Z');
  });

  it('usa el HTML cuando no hay parte de texto y extrae adjuntos', async () => {
    const raw = crlf([
      'From: cliente@empresa.com',
      'Subject: Factura',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="XX"',
      '',
      '--XX',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<html><head><style>p{}</style></head><body><p>Hola&nbsp;equipo</p><p>Adjunto la <b>factura</b></p></body></html>',
      '--XX',
      'Content-Type: application/pdf; name="factura.pdf"',
      'Content-Disposition: attachment; filename="factura.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('%PDF-1.4 falso').toString('base64'),
      '--XX--',
    ]);
    const e = await parseEmail(raw);
    expect(e.text).toBe('Hola equipo\nAdjunto la factura');
    expect(e.attachments).toHaveLength(1);
    expect(e.attachments[0]).toMatchObject({
      filename: 'factura.pdf',
      contentType: 'application/pdf',
    });
    expect(e.attachments[0].content.toString()).toBe('%PDF-1.4 falso');
  });

  it('marca boletines y respuestas automáticas', async () => {
    const bulk = await parseEmail(
      crlf([
        'From: news@tienda.com',
        'List-Unsubscribe: <mailto:x@y>',
        'Subject: Ofertas',
        '',
        'hola',
      ]),
    );
    expect(bulk.bulk).toBe(true);
    const auto = await parseEmail(
      crlf([
        'From: ana@cliente.pe',
        'Auto-Submitted: auto-replied',
        'Subject: Fuera de la oficina',
        '',
        'vuelvo el lunes',
      ]),
    );
    expect(auto.automated).toBe(true);
    const bounce = await parseEmail(
      crlf(['From: MAILER-DAEMON@mx.acme.pe', 'Subject: Undelivered', '', 'x']),
    );
    expect(bounce.automated).toBe(true);
  });
});

describe('stripQuoted', () => {
  it('corta en la cita de Outlook (De: … Enviado:)', () => {
    const text =
      'Gracias, lo reviso.\n\nDe: Ventas <ventas@acme.pe>\nEnviado: martes\nPara: Ana\nAsunto: Propuesta\n\nTexto viejo';
    expect(stripQuoted(text)).toBe('Gracias, lo reviso.');
  });

  it('no corta un "De:" que es parte del mensaje', () => {
    expect(stripQuoted('De: mi parte, todo bien.\nSaludos')).toBe(
      'De: mi parte, todo bien.\nSaludos',
    );
  });

  it('corta en "On … wrote:" partido en dos líneas y quita la firma del móvil', () => {
    const text =
      'Sí, confirmo.\n\nEnviado desde mi iPhone\n\nOn Tue, Sep 22, 2026 at 9:00 AM Ventas\n<ventas@acme.pe> wrote:\n> antes';
    expect(stripQuoted(text)).toBe('Sí, confirmo.');
  });

  it('corta en mensaje original o reenviado', () => {
    expect(
      stripQuoted('Mira esto\n---------- Forwarded message ---------\nFrom: x'),
    ).toBe('Mira esto');
    expect(stripQuoted('Ok\n-----Original Message-----\nblah')).toBe('Ok');
  });
});

describe('utilidades', () => {
  it('replySubject no encadena prefijos', () => {
    expect(replySubject('Re: RE: Fw: Propuesta')).toBe('Re: Propuesta');
    expect(replySubject('Propuesta')).toBe('Re: Propuesta');
    expect(replySubject('')).toBe('');
  });

  it('isNoReply reconoce remitentes automáticos', () => {
    for (const a of [
      'noreply@x.com',
      'no-reply@x.com',
      'do-not-reply@x.com',
      'mailer-daemon@x.com',
      'bounces+123@x.com',
    ])
      expect(isNoReply(a)).toBe(true);
    for (const a of ['ana@x.com', 'norberto@x.com', 'replyto@x.com'])
      expect(isNoReply(a)).toBe(false);
  });

  it('textToHtml escapa el contenido y añade la firma', () => {
    const html = textToHtml(
      'Hola <b>Ana</b>\nlínea 2\n\nPárrafo "2"',
      'Juan\nVentas',
    );
    expect(html).toContain('<p>Hola &lt;b&gt;Ana&lt;/b&gt;<br>línea 2</p>');
    expect(html).toContain('<p>Párrafo &quot;2&quot;</p>');
    expect(html).toContain('Juan<br>Ventas');
    expect(html).not.toContain('<b>Ana');
  });
});
