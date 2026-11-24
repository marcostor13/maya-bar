import PDFDocument from 'pdfkit';

export interface QuotePdfData {
  number: string;
  createdAt: Date;
  validUntil?: Date | null;
  currency: string;
  igvRate: number;
  items: {
    name: string;
    unit?: string;
    quantity: number;
    unitPrice: number;
    discountPct?: number;
    total: number;
  }[];
  subtotal: number;
  discount: number;
  igv: number;
  total: number;
  notes?: string;
  company: { name: string; logo?: Buffer | null; color?: string };
  customer: { name: string; email?: string; phone?: string };
  /** Link público para aceptarla o pagarla. */
  publicUrl?: string;
}

const money = (currency: string, n: number) =>
  `${currency === 'PEN' ? 'S/' : currency} ${n.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const day = (d: Date) =>
  d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Lima',
  });

/** PDF de la cotización con el logo de la empresa (HU68). */
export function renderQuotePdf(q: QuotePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const color = /^#[0-9a-f]{6}$/i.test(q.company.color ?? '')
      ? q.company.color!
      : '#4F46E5';
    const left = 48;
    const width = doc.page.width - 96;

    // Cabecera: logo (si es PNG o JPG) y datos de la cotización.
    let logoOk = false;
    if (q.company.logo) {
      try {
        doc.image(q.company.logo, left, 40, { fit: [140, 56] });
        logoOk = true;
      } catch {
        logoOk = false;
      }
    }
    if (!logoOk)
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor(color)
        .text(q.company.name, left, 52, { width: 260 });
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#111827')
      .text('COTIZACIÓN', left, 44, { width, align: 'right' })
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#4B5563')
      .text(q.number, { width, align: 'right' })
      .text(`Fecha: ${day(q.createdAt)}`, { width, align: 'right' });
    if (q.validUntil)
      doc.text(`Válida hasta: ${day(q.validUntil)}`, { width, align: 'right' });

    // Cliente.
    let y = 130;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .strokeColor('#E5E7EB')
      .stroke();
    y += 12;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#6B7280')
      .text('PARA', left, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(q.customer.name, left, y + 14);
    const contact = [q.customer.email, q.customer.phone]
      .filter(Boolean)
      .join(' · ');
    if (contact)
      doc.font('Helvetica').fontSize(10).fillColor('#4B5563').text(contact);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#6B7280')
      .text('DE', left + width / 2, y);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#111827')
      .text(q.company.name, left + width / 2, y + 14, { width: width / 2 });

    // Tabla.
    y = 210;
    const cols = [
      { t: 'Descripción', w: width * 0.44, a: 'left' as const },
      { t: 'Cant.', w: width * 0.1, a: 'right' as const },
      { t: 'P. unit.', w: width * 0.16, a: 'right' as const },
      { t: 'Dscto.', w: width * 0.1, a: 'right' as const },
      { t: 'Importe', w: width * 0.2, a: 'right' as const },
    ];
    const row = (vals: string[], bold = false, fill?: string) => {
      const h = Math.max(
        20,
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(10)
          .heightOfString(vals[0], { width: cols[0].w - 12 }) + 10,
      );
      if (y + h > doc.page.height - 160) {
        doc.addPage();
        y = 48;
      }
      if (fill) doc.rect(left, y, width, h).fill(fill);
      let x = left;
      vals.forEach((v, i) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(10)
          .fillColor(fill === color ? '#FFFFFF' : '#111827')
          .text(v, x + 6, y + 5, { width: cols[i].w - 12, align: cols[i].a });
        x += cols[i].w;
      });
      y += h;
    };
    row(
      cols.map((c) => c.t),
      true,
      color,
    );
    q.items.forEach((it, i) =>
      row(
        [
          it.unit && it.unit !== 'unidad' ? `${it.name} (${it.unit})` : it.name,
          String(it.quantity),
          money(q.currency, it.unitPrice),
          it.discountPct ? `${it.discountPct}%` : '—',
          money(q.currency, it.total),
        ],
        false,
        i % 2 ? '#F9FAFB' : undefined,
      ),
    );

    // Totales.
    y += 12;
    const totals: [string, number][] = [['Subtotal (sin IGV)', q.subtotal]];
    if (q.discount > 0) totals.push(['Descuentos aplicados', -q.discount]);
    totals.push([`IGV (${q.igvRate}%)`, q.igv]);
    for (const [label, n] of totals) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#4B5563')
        .text(label, left + width * 0.5, y, {
          width: width * 0.3,
          align: 'right',
        })
        .text(money(q.currency, n), left + width * 0.8, y, {
          width: width * 0.2 - 6,
          align: 'right',
        });
      y += 16;
    }
    doc.rect(left + width * 0.5, y, width * 0.5, 26).fill(color);
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#FFFFFF')
      .text('TOTAL', left + width * 0.5, y + 7, {
        width: width * 0.3,
        align: 'right',
      })
      .text(money(q.currency, q.total), left + width * 0.8, y + 7, {
        width: width * 0.2 - 6,
        align: 'right',
      });
    y += 44;

    if (q.notes) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#6B7280')
        .text('CONDICIONES Y NOTAS', left, y);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#374151')
        .text(q.notes, left, y + 14, { width });
      y = doc.y + 12;
    }
    if (q.publicUrl) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#374151')
        .text('Acéptala o págala en línea: ', left, y, { continued: true })
        .fillColor(color)
        .text(q.publicUrl, { link: q.publicUrl, underline: true });
    }
    doc.end();
  });
}
