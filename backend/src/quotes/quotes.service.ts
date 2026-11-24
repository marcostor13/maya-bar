import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { Customer } from '../customers/customer.schema';
import { Lead } from '../leads/lead.schema';
import { LeadActivity } from '../leads/lead-activity.schema';
import { LeadsService } from '../leads/leads.service';
import { LeadStagesService } from '../leads/lead-stages.service';
import { Tenant } from '../tenants/tenant.schema';
import { WhatsAppAccount } from '../whatsapp-accounts/whatsapp-account.schema';
import { Conversation } from '../conversations/conversation.schema';
import { Message } from '../conversations/message.schema';
import { ConversationsService } from '../conversations/conversations.service';
import { WINDOW_MS } from '../conversations/wa-window';
import { MailService } from '../mail/mail.service';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../billing/mercadopago/mercadopago.client';
import { EventTicketsService } from '../event-tickets/event-tickets.service';
import {
  normalizeStoreUrl,
  WooStoreService,
} from '../ai-agents/store/woo-store.service';
import { assertPublicHost } from '../shared/network';
import { computeQuote, IGV_RATE } from './quote-calc';
import { renderQuotePdf } from './quote-pdf';
import { Product } from './product.schema';
import { Quote, type QuoteStatus } from './quote.schema';
import type { ProductDto, QuoteDto, SendQuoteDto } from './dto/quote.dto';

const refId = (v: unknown): string =>
  v && typeof v === 'object' && '_id' in v ? String(v._id) : String(v);

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/** Estados en los que la cotización ya se cerró. */
const CLOSED: QuoteStatus[] = ['accepted', 'rejected', 'paid'];

/**
 * Cotizaciones desde la oportunidad (HU68): catálogo propio, cálculo con IGV,
 * PDF con el logo, envío por WhatsApp o email, link público para aceptar o
 * pagar con el Mercado Pago de la empresa y oportunidad ganada al cerrar.
 */
@Injectable()
export class QuotesService implements OnModuleInit {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    @InjectModel(Product.name) private products: Model<Product>,
    @InjectModel(Quote.name) private quotes: Model<Quote>,
    @InjectModel(Lead.name) private leadModel: Model<Lead>,
    @InjectModel(LeadActivity.name) private activities: Model<LeadActivity>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(WhatsAppAccount.name)
    private waAccounts: Model<WhatsAppAccount>,
    @InjectModel(Conversation.name) private convs: Model<Conversation>,
    @InjectModel(Message.name) private msgs: Model<Message>,
    private leads: LeadsService,
    private stages: LeadStagesService,
    private conversations: ConversationsService,
    private mail: MailService,
    private mp: MercadoPagoClient,
    private tickets: EventTicketsService,
    private woo: WooStoreService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.tickets.registerPaymentHandler('quo', (tenantId, payment) =>
      this.applyPayment(tenantId, payment),
    );
  }

  private base(key: 'PUBLIC_API_URL' | 'FRONTEND_URL') {
    return (this.config.get<string>(key) || '').replace(/\/$/, '');
  }

  publicUrl(q: Quote) {
    return `${this.base('FRONTEND_URL')}/q/${q.publicToken}`;
  }

  pdfUrl(q: Quote) {
    return `${this.base('PUBLIC_API_URL')}/public/quotes/${q.publicToken}/pdf`;
  }

  // ── Catálogo ───────────────────────────────────────────────────────────

  listProducts(tenantId: string, all = false) {
    return this.products
      .find({
        tenantId: new Types.ObjectId(tenantId),
        ...(all ? {} : { active: true }),
      })
      .sort({ name: 1 })
      .lean()
      .exec();
  }

  createProduct(tenantId: string, dto: ProductDto) {
    return this.products.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name.trim(),
      price: dto.price,
      taxIncluded: dto.taxIncluded ?? true,
      unit: dto.unit?.trim() || 'unidad',
      active: dto.active ?? true,
    });
  }

  async updateProduct(tenantId: string, id: string, dto: Partial<ProductDto>) {
    const p = await this.products
      .findOneAndUpdate(
        { _id: this.oid(id), tenantId: new Types.ObjectId(tenantId) },
        { $set: dto },
        { new: true },
      )
      .exec();
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  async removeProduct(tenantId: string, id: string) {
    const r = await this.products
      .deleteOne({ _id: this.oid(id), tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!r.deletedCount) throw new NotFoundException('Producto no encontrado');
    return { ok: true };
  }

  /** Trae los productos de una tienda WooCommerce; los ya importados se actualizan. */
  async importWoo(tenantId: string, storeUrl: string) {
    const base = normalizeStoreUrl(storeUrl);
    await assertPublicHost(new URL(base).hostname);
    let items: Awaited<ReturnType<WooStoreService['listAll']>>;
    try {
      items = await this.woo.listAll(base);
    } catch {
      throw new BadGatewayException(
        'La tienda no respondió. Revisa la URL y que tenga WooCommerce activo.',
      );
    }
    const tid = new Types.ObjectId(tenantId);
    let created = 0;
    let updated = 0;
    for (const it of items) {
      const r = await this.products
        .updateOne(
          { tenantId: tid, source: 'woocommerce', externalId: String(it.id) },
          {
            $set: { name: it.nombre, price: it.precioNum },
            $setOnInsert: { taxIncluded: true, unit: 'unidad', active: true },
          },
          { upsert: true },
        )
        .exec();
      if (r.upsertedCount) created++;
      else if (r.modifiedCount) updated++;
    }
    return { total: items.length, created, updated };
  }

  // ── Cotizaciones ───────────────────────────────────────────────────────

  async listByLead(
    tenantId: string,
    userId: string,
    role: string,
    leadId: string,
  ) {
    await this.leads.findOne(leadId, tenantId, userId, role);
    return this.quotes
      .find({
        tenantId: new Types.ObjectId(tenantId),
        leadId: this.oid(leadId),
      })
      .sort({ seq: -1 })
      .lean()
      .exec();
  }

  async get(tenantId: string, userId: string, role: string, id: string) {
    const q = await this.find(tenantId, id);
    await this.leads.findOne(String(q.leadId), tenantId, userId, role);
    return q;
  }

  async create(tenantId: string, userId: string, role: string, dto: QuoteDto) {
    const lead = await this.leads.findOne(dto.leadId, tenantId, userId, role);
    const tid = new Types.ObjectId(tenantId);
    const body = this.build(dto);
    for (let attempt = 0; attempt < 3; attempt++) {
      const last = await this.quotes
        .findOne({ tenantId: tid })
        .sort({ seq: -1 })
        .select('seq')
        .lean()
        .exec();
      const seq = (last?.seq ?? 0) + 1;
      try {
        return await this.quotes.create({
          ...body,
          tenantId: tid,
          leadId: lead._id,
          customerId: lead.customerId
            ? this.oid(refId(lead.customerId))
            : undefined,
          seq,
          number: `COT-${String(seq).padStart(4, '0')}`,
          publicToken: randomBytes(18).toString('base64url'),
          createdBy: new Types.ObjectId(userId),
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw new ConflictException('No se pudo numerar la cotización; reintenta');
  }

  async update(
    tenantId: string,
    userId: string,
    role: string,
    id: string,
    dto: QuoteDto,
  ) {
    const q = await this.get(tenantId, userId, role, id);
    if (CLOSED.includes(q.status))
      throw new ConflictException(
        'La cotización ya se cerró y no se puede editar',
      );
    Object.assign(q, this.build(dto));
    return q.save();
  }

  async remove(tenantId: string, userId: string, role: string, id: string) {
    const q = await this.get(tenantId, userId, role, id);
    if (CLOSED.includes(q.status))
      throw new ConflictException('No se puede borrar una cotización cerrada');
    await q.deleteOne();
    return { ok: true };
  }

  /** Ítems con sus totales y los totales de la cotización. */
  private build(dto: QuoteDto) {
    const igvRate = dto.igvRate ?? IGV_RATE;
    const items = dto.items.map((i) => ({
      productId: i.productId ? this.oid(i.productId) : undefined,
      name: i.name.trim(),
      unit: i.unit?.trim() || 'unidad',
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountPct: i.discountPct ?? 0,
      taxIncluded: i.taxIncluded ?? true,
    }));
    const t = computeQuote(items, igvRate);
    return {
      items: items.map((i, n) => ({ ...i, ...t.lines[n] })),
      igvRate,
      subtotal: t.subtotal,
      discount: t.discount,
      igv: t.igv,
      total: t.total,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      notes: dto.notes?.trim() || undefined,
      payOnline: dto.payOnline ?? false,
    };
  }

  // ── PDF ────────────────────────────────────────────────────────────────

  async pdf(q: Quote): Promise<Buffer> {
    const [tenant, customer] = await Promise.all([
      this.tenants.findById(q.tenantId).lean().exec(),
      q.customerId ? this.customers.findById(q.customerId).lean().exec() : null,
    ]);
    return renderQuotePdf({
      number: q.number,
      createdAt: (q as unknown as { createdAt?: Date }).createdAt ?? new Date(),
      validUntil: q.validUntil,
      currency: q.currency,
      igvRate: q.igvRate,
      items: q.items,
      subtotal: q.subtotal,
      discount: q.discount,
      igv: q.igv,
      total: q.total,
      notes: q.notes,
      company: {
        name: tenant?.name ?? 'Empresa',
        logo: await this.fetchLogo(tenant?.branding?.logo),
        color: tenant?.branding?.primaryColor,
      },
      customer: {
        name: customer?.name ?? 'Cliente',
        email: customer?.email,
        phone: customer?.phone,
      },
      publicUrl: this.publicUrl(q),
    });
  }

  /** Logo PNG o JPG de la empresa; sin él, el PDF lleva el nombre. */
  private async fetchLogo(url?: string): Promise<Buffer | null> {
    if (!url || !/^https:\/\//i.test(url)) return null;
    try {
      await assertPublicHost(new URL(url).hostname);
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/image\/(png|jpe?g)/i.test(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length < 2_000_000 ? buf : null;
    } catch {
      return null;
    }
  }

  // ── Envío ──────────────────────────────────────────────────────────────

  async send(
    tenantId: string,
    userId: string,
    role: string,
    id: string,
    dto: SendQuoteDto,
  ) {
    const q = await this.get(tenantId, userId, role, id);
    if (CLOSED.includes(q.status))
      throw new ConflictException('La cotización ya se cerró');
    const customer = q.customerId
      ? await this.customers.findById(q.customerId).lean().exec()
      : null;
    if (!customer)
      throw new BadRequestException('La oportunidad no tiene contacto');
    const tenant = await this.tenants.findById(q.tenantId).lean().exec();
    const company = tenant?.name ?? 'Tu proveedor';
    const intro =
      dto.message?.trim() ||
      `Hola ${customer.name.split(' ')[0]}, te comparto la cotización ${q.number} de ${company} por S/ ${q.total.toFixed(2)}.`;

    if (dto.channel === 'email') {
      if (!customer.email)
        throw new BadRequestException('El contacto no tiene email');
      const pay = q.payOnline ? ' o pagarla en línea' : '';
      await this.mail.sendHtml({
        to: customer.email,
        subject: `Cotización ${q.number} · ${company}`,
        fromName: company,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">
<p>${esc(intro)}</p>
<p style="font-size:22px;font-weight:700;margin:20px 0">Total: S/ ${q.total.toFixed(2)}</p>
<p><a href="${this.publicUrl(q)}" style="background:#4F46E5;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;display:inline-block">Ver cotización</a></p>
<p style="color:#6B7280;font-size:13px">Desde el link puedes aceptarla${pay}. También puedes <a href="${this.pdfUrl(q)}">descargar el PDF</a>.</p>
</div>`,
        text: `${intro}\nVer cotización: ${this.publicUrl(q)}\nPDF: ${this.pdfUrl(q)}`,
      });
    } else {
      await this.sendWhatsApp(q, customer, intro);
    }

    q.sentVia = Array.from(new Set([...(q.sentVia ?? []), dto.channel]));
    q.sentAt = new Date();
    if (q.status === 'draft') q.status = 'sent';
    await q.save();
    await this.logActivity(
      q,
      `Cotización ${q.number} enviada por ${dto.channel === 'email' ? 'email' : 'WhatsApp'}`,
      userId,
    );
    return q;
  }

  /** PDF como documento en el chat del contacto; necesita la ventana de 24 h abierta. */
  private async sendWhatsApp(q: Quote, customer: Customer, intro: string) {
    const phone = (customer.phone ?? '').replace(/\D/g, '');
    if (phone.length < 8)
      throw new BadRequestException('El contacto no tiene teléfono');
    const conv = await this.convs
      .findOne({ tenantId: q.tenantId, channel: 'whatsapp', contact: phone })
      .sort({ lastMessageAt: -1 })
      .exec();
    const account = await this.waAccounts
      .findOne({
        tenantId: q.tenantId,
        active: true,
        ...(conv ? { _id: conv.accountId } : { provider: 'cloudapi' }),
      })
      .lean()
      .exec();
    if (!account)
      throw new BadRequestException('No hay una cuenta de WhatsApp activa');
    if (conv?.blocked)
      throw new ConflictException('El contacto está bloqueado');
    let windowOpen = account.provider !== 'cloudapi';
    if (!windowOpen && conv) {
      const last = await this.msgs
        .findOne({ conversationId: conv._id, direction: 'in' })
        .sort({ at: -1 })
        .select('at')
        .lean()
        .exec();
      windowOpen =
        !!last && Date.now() - new Date(last.at).getTime() < WINDOW_MS;
    }
    if (!windowOpen)
      throw new ConflictException(
        'La ventana de 24 h de WhatsApp está cerrada: envíala por email o escribe primero al cliente con una plantilla.',
      );
    const r = await this.conversations.sendExternal({
      tenantId: String(q.tenantId),
      channel: 'whatsapp',
      accountId: String(account._id),
      contact: phone,
      type: 'document',
      text: `${intro}\nVer y aceptar: ${this.publicUrl(q)}`,
      mediaUrl: this.pdfUrl(q),
      filename: `Cotizacion-${q.number}.pdf`,
      author: 'human',
      customerId: customer._id,
    });
    if (r.message.status === 'failed')
      throw new BadGatewayException(
        `WhatsApp rechazó el envío: ${r.message.error ?? 'error desconocido'}`,
      );
  }

  // ── Público ────────────────────────────────────────────────────────────

  async findPublic(token: string) {
    const q = await this.quotes.findOne({ publicToken: token }).exec();
    if (!q) throw new NotFoundException('Cotización no encontrada');
    return q;
  }

  /** Lo que ve el cliente en el link; la primera visita la marca como vista. */
  async publicView(token: string) {
    const q = await this.findPublic(token);
    if (q.status === 'sent' || q.status === 'draft') {
      q.status = 'viewed';
      q.viewedAt = new Date();
      await q.save();
    }
    const [tenant, customer, connected] = await Promise.all([
      this.tenants.findById(q.tenantId).lean().exec(),
      q.customerId ? this.customers.findById(q.customerId).lean().exec() : null,
      this.tickets.status(String(q.tenantId)).then((s) => s.connected),
    ]);
    return {
      number: q.number,
      status: q.status,
      currency: q.currency,
      items: q.items.map((i) => ({
        name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountPct: i.discountPct,
        total: i.total,
      })),
      igvRate: q.igvRate,
      subtotal: q.subtotal,
      discount: q.discount,
      igv: q.igv,
      total: q.total,
      validUntil: q.validUntil ?? null,
      expired: this.expired(q),
      notes: q.notes ?? '',
      createdAt: (q as unknown as { createdAt?: Date }).createdAt,
      canPay: q.payOnline && connected && q.total > 0,
      company: {
        name: tenant?.name ?? '',
        logo: tenant?.branding?.logo ?? '',
        color: tenant?.branding?.primaryColor ?? '',
      },
      customerName: customer?.name ?? '',
      pdfUrl: this.pdfUrl(q),
    };
  }

  private expired(q: Quote) {
    if (!q.validUntil) return false;
    // Vale hasta el final de ese día.
    return q.validUntil.getTime() + 86_400_000 <= Date.now();
  }

  private assertOpen(q: Quote) {
    if (q.status === 'paid' || q.status === 'accepted')
      throw new ConflictException('Esta cotización ya fue aceptada');
    if (q.status === 'rejected')
      throw new ConflictException('Esta cotización fue rechazada');
    if (this.expired(q))
      throw new ConflictException('Esta cotización venció; pide una nueva');
  }

  async accept(token: string) {
    const q = await this.findPublic(token);
    this.assertOpen(q);
    const won = await this.quotes
      .findOneAndUpdate(
        { _id: q._id, status: { $nin: CLOSED } },
        { $set: { status: 'accepted', acceptedAt: new Date() } },
        { new: true },
      )
      .exec();
    if (won) await this.closeLead(won, 'aceptada por el cliente');
    return { status: 'accepted' };
  }

  async reject(token: string, reason?: string) {
    const q = await this.findPublic(token);
    this.assertOpen(q);
    const r = await this.quotes
      .findOneAndUpdate(
        { _id: q._id, status: { $nin: CLOSED } },
        {
          $set: {
            status: 'rejected',
            rejectedAt: new Date(),
            rejectReason: reason?.trim() || undefined,
          },
        },
        { new: true },
      )
      .exec();
    if (r)
      await this.logActivity(
        r,
        `Cotización ${r.number} rechazada por el cliente${reason ? ` — ${reason.trim()}` : ''}`,
      );
    return { status: 'rejected' };
  }

  /** Checkout Pro en la cuenta de la empresa por el total de la cotización. */
  async pay(token: string) {
    const q = await this.findPublic(token);
    this.assertOpen(q);
    if (!q.payOnline || q.total <= 0)
      throw new BadRequestException('Esta cotización no se paga en línea');
    const seller = await this.tickets.sellerToken(q.tenantId);
    const customer = q.customerId
      ? await this.customers.findById(q.customerId).lean().exec()
      : null;
    const back = (pago: string) => `${this.publicUrl(q)}?pago=${pago}`;
    try {
      const pref = await this.mp.createPreferenceFor(
        seller,
        {
          items: [
            {
              id: q.number,
              title: `Cotización ${q.number}`,
              quantity: 1,
              unit_price: q.total,
              currency_id: q.currency || 'PEN',
            },
          ],
          ...(customer?.email
            ? { payer: { name: customer.name, email: customer.email } }
            : {}),
          external_reference: `quo:${String(q._id)}`,
          notification_url: this.tickets.notificationUrl(),
          back_urls: {
            success: back('ok'),
            pending: back('pendiente'),
            failure: back('error'),
          },
          auto_return: 'approved',
        },
        `quo-${String(q._id)}-${q.total}`,
      );
      return { initPoint: pref.init_point };
    } catch (err) {
      this.logger.error(
        `Preferencia de la cotización ${q.number}: ${String(err)}`,
      );
      throw new BadGatewayException(
        'No se pudo iniciar el pago; intenta de nuevo',
      );
    }
  }

  /** Aviso de Mercado Pago (vía el webhook de HU67) para `quo:<id>`. */
  async applyPayment(tenantId: Types.ObjectId, payment: MpPayment) {
    const id = /^quo:([a-f0-9]{24})$/.exec(
      payment.external_reference ?? '',
    )?.[1];
    if (!id || payment.status !== 'approved') return;
    const q = await this.quotes
      .findOneAndUpdate(
        { _id: id, tenantId, status: { $ne: 'paid' } },
        {
          $set: {
            status: 'paid',
            paidAt: new Date(),
            mpPaymentId: String(payment.id),
          },
        },
        { new: false },
      )
      .exec();
    if (!q) return;
    // Si ya estaba aceptada, la oportunidad ya está ganada.
    if (q.status !== 'accepted') {
      q.status = 'paid';
      await this.closeLead(q, 'pagada en línea');
    } else await this.logActivity(q, `Cotización ${q.number} pagada en línea`);
  }

  /** La oportunidad pasa a la etapa ganada con el monto de la cotización. */
  private async closeLead(q: Quote, how: string) {
    const tenantId = String(q.tenantId);
    const stages = await this.stages.list(tenantId);
    const won = stages.find((s) => s.outcome === 'won');
    await this.leadModel
      .updateOne(
        { _id: q.leadId, tenantId: q.tenantId },
        { $set: { value: q.total } },
      )
      .exec();
    if (won) {
      const lead = await this.leadModel
        .findById(q.leadId)
        .select('stage')
        .lean()
        .exec();
      if (lead && lead.stage !== won.key)
        await this.leads.move(
          String(q.leadId),
          tenantId,
          String(q.createdBy ?? ''),
          'TENANT_ADMIN',
          { stage: won.key },
        );
    }
    await this.logActivity(
      q,
      `Cotización ${q.number} ${how} · S/ ${q.total.toFixed(2)}`,
    );
  }

  private async logActivity(q: Quote, title: string, userId?: string) {
    await this.activities.create({
      tenantId: q.tenantId,
      leadId: q.leadId,
      type: 'system',
      title,
      at: new Date(),
      ...(userId ? { createdBy: new Types.ObjectId(userId) } : {}),
    });
  }

  private async find(tenantId: string, id: string) {
    const q = await this.quotes
      .findOne({ _id: this.oid(id), tenantId: new Types.ObjectId(tenantId) })
      .exec();
    if (!q) throw new NotFoundException('Cotización no encontrada');
    return q;
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('No encontrado');
    return new Types.ObjectId(id);
  }
}
