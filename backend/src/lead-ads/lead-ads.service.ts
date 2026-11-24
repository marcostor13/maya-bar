import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types, type QueryFilter } from 'mongoose';
import { MessengerAccount } from '../messenger-accounts/messenger-account.schema';
import { Customer } from '../customers/customer.schema';
import { Lead } from '../leads/lead.schema';
import { LeadActivity } from '../leads/lead-activity.schema';
import { LeadStagesService } from '../leads/lead-stages.service';
import { LeadsService } from '../leads/leads.service';
import { MetaGraphClient } from '../shared/meta-graph.client';
import { formatPhone, phoneDigits } from '../shared/phone';
import { emitAutomation } from '../automations/automation-bus';
import { isValidTarget, mapLead, type MetaFieldData } from './lead-ads-map';
import { LeadAdForm, LeadAdLead } from './lead-ads.schema';

/** Lead tal como lo devuelve `GET /{leadgen_id}`. */
interface GraphLead {
  id: string;
  created_time?: string;
  field_data?: MetaFieldData[];
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  is_organic?: boolean;
}

/** Cambio `leadgen` del webhook de Página. */
export interface LeadgenValue {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  ad_id?: string;
  adgroup_id?: string;
  created_time?: number;
}

const LEAD_FIELDS =
  'id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,is_organic';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 2 * 60_000;

/**
 * Meta Lead Ads → contactos y oportunidades (HU60). El webhook solo trae ids:
 * las respuestas se leen en Graph API con el token de la Página.
 */
@Injectable()
export class LeadAdsService {
  private readonly logger = new Logger(LeadAdsService.name);
  private retrying = false;

  constructor(
    @InjectModel(LeadAdForm.name) private forms: Model<LeadAdForm>,
    @InjectModel(LeadAdLead.name) private leadsLog: Model<LeadAdLead>,
    @InjectModel(MessengerAccount.name)
    private accounts: Model<MessengerAccount>,
    @InjectModel(Customer.name) private customers: Model<Customer>,
    @InjectModel(Lead.name) private leads: Model<Lead>,
    @InjectModel(LeadActivity.name) private activities: Model<LeadActivity>,
    private stages: LeadStagesService,
    private leadsService: LeadsService,
    private graph: MetaGraphClient,
  ) {}

  // ── Webhook ────────────────────────────────────────────────────────────

  /** Registra el lead (idempotente por `leadgen_id`) y lo procesa. Nunca lanza. */
  async handleWebhook(pageId: string, value: LeadgenValue): Promise<void> {
    const leadgenId = value.leadgen_id ? String(value.leadgen_id) : '';
    if (!leadgenId || !pageId) return;
    try {
      const account = await this.accounts
        .findOne({ pageId: String(pageId) })
        .exec();
      if (!account) {
        this.logger.warn(
          `[LeadAds] Página ${pageId} sin cuenta conectada — lead ${leadgenId} ignorado.`,
        );
        return;
      }
      let row: LeadAdLead;
      try {
        row = await this.leadsLog.create({
          tenantId: account.tenantId,
          accountId: account._id,
          leadgenId,
          pageId: String(pageId),
          formId: value.form_id ? String(value.form_id) : undefined,
          adId: value.ad_id ? String(value.ad_id) : undefined,
          adsetId: value.adgroup_id ? String(value.adgroup_id) : undefined,
          receivedAt: value.created_time
            ? new Date(Number(value.created_time) * 1000)
            : new Date(),
          status: account.active ? 'pending' : 'skipped',
          error: account.active ? undefined : 'Cuenta de la Página inactiva',
        });
      } catch (err) {
        if ((err as { code?: number }).code === 11000) return; // ya recibido
        throw err;
      }
      if (row.status === 'pending') await this.process(String(row._id));
    } catch (err) {
      this.logger.error(
        `[LeadAds] Error con el lead ${leadgenId}: ${String(err)}`,
      );
    }
  }

  /** Lee el lead en Meta y crea o actualiza contacto y oportunidad. */
  async process(id: string): Promise<LeadAdLead | null> {
    const now = new Date();
    const row = await this.leadsLog
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          status: { $in: ['pending', 'failed'] },
          $or: [
            { lockedUntil: { $exists: false } },
            { lockedUntil: { $lt: now } },
          ],
        },
        {
          $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
          $inc: { attempts: 1 },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!row) return null;
    try {
      const account = await this.accounts.findById(row.accountId).exec();
      if (!account?.pageAccessToken)
        throw new Error('La Página no tiene token de acceso');
      const data = await this.graph.get<GraphLead>(`/${row.leadgenId}`, {
        accessToken: account.pageAccessToken,
        params: { fields: LEAD_FIELDS },
      });
      const formId = data.form_id ?? row.formId;
      const form = formId
        ? await this.ensureForm(row.tenantId, account, formId)
        : null;
      const set: Partial<LeadAdLead> = {
        formId,
        formName: form?.name,
        adId: data.ad_id ?? row.adId,
        adName: data.ad_name,
        adsetId: data.adset_id ?? row.adsetId,
        adsetName: data.adset_name,
        campaignId: data.campaign_id,
        campaignName: data.campaign_name,
      };
      if (form && !form.active) {
        await this.finish(row, {
          ...set,
          status: 'skipped',
          error: 'Formulario en pausa',
        });
        return this.leadsLog.findById(row._id).exec();
      }
      const mapped = mapLead(data.field_data ?? [], form?.mapping ?? {});
      if (!mapped.phone && !mapped.email && !mapped.name)
        throw new Error('El lead no trae nombre, teléfono ni email');
      const { customer, created } = await this.upsertContact(
        row.tenantId,
        mapped,
        {
          adId: set.adId,
          adName: set.adName,
          campaignName: set.campaignName,
          at: row.receivedAt,
        },
      );
      let leadId: Types.ObjectId | undefined;
      if (form?.createLead !== false)
        leadId = await this.createLead(row.tenantId, customer, set);
      await this.finish(row, {
        ...set,
        status: 'processed',
        customerId: customer._id,
        leadId,
        existingContact: !created,
        error: undefined,
      });
      if (form)
        await this.forms
          .updateOne(
            { _id: form._id },
            { $inc: { leadsCount: 1 }, $set: { lastLeadAt: row.receivedAt } },
          )
          .exec();
      if (created)
        emitAutomation({
          type: 'contact_created',
          tenantId: String(row.tenantId),
          customerId: String(customer._id),
        });
      if (leadId)
        emitAutomation({
          type: 'lead_created',
          tenantId: String(row.tenantId),
          leadId: String(leadId),
          customerId: String(customer._id),
          unassigned: true,
        });
    } catch (err) {
      const message = this.errorText(err);
      await this.leadsLog
        .updateOne(
          { _id: row._id },
          {
            $set: { status: 'failed', error: message },
            $unset: { lockedUntil: '' },
          },
        )
        .exec();
      this.logger.warn(
        `[LeadAds] Lead ${row.leadgenId} fallido (intento ${row.attempts}): ${message}`,
      );
    }
    return this.leadsLog.findById(row._id).exec();
  }

  private async finish(row: LeadAdLead, set: Partial<LeadAdLead>) {
    const unset: Record<string, ''> = { lockedUntil: '' };
    if (set.error === undefined) unset.error = '';
    const clean = Object.fromEntries(
      Object.entries(set).filter(([, v]) => v !== undefined),
    );
    await this.leadsLog
      .updateOne({ _id: row._id }, { $set: clean, $unset: unset })
      .exec();
  }

  private errorText(err: unknown): string {
    const e = err as {
      message?: string;
      response?: { data?: { error?: { message?: string } } };
    };
    return (e.response?.data?.error?.message ?? e.message ?? String(err)).slice(
      0,
      300,
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async retryFailed(): Promise<number> {
    if (this.retrying) return 0;
    this.retrying = true;
    let n = 0;
    try {
      const due = await this.leadsLog
        .find({
          status: { $in: ['failed', 'pending'] },
          attempts: { $lt: MAX_ATTEMPTS },
          receivedAt: { $gt: new Date(Date.now() - 7 * 86400_000) },
        })
        .select('_id')
        .limit(100)
        .lean()
        .exec();
      for (const d of due)
        if ((await this.process(String(d._id)))?.status === 'processed') n++;
    } catch (err) {
      this.logger.error(`[LeadAds] Reintentos: ${String(err)}`);
    } finally {
      this.retrying = false;
    }
    return n;
  }

  // ── Contacto y oportunidad ─────────────────────────────────────────────

  private async upsertContact(
    tenantId: Types.ObjectId,
    m: ReturnType<typeof mapLead>,
    ad: { adId?: string; adName?: string; campaignName?: string; at: Date },
  ): Promise<{ customer: Customer; created: boolean }> {
    const phone = m.phone ? formatPhone(m.phone) : undefined;
    const digits = m.phone ? phoneDigits(m.phone) : '';
    const or: QueryFilter<Customer>[] = [];
    if (digits)
      or.push({
        phone: new RegExp(`^\\+?\\s*${digits.split('').join('\\s*')}$`),
      });
    if (m.email) or.push({ email: m.email });
    const existing = or.length
      ? await this.customers.findOne({ tenantId, $or: or }).exec()
      : null;
    const referral = ad.adId
      ? {
          adId: ad.adId,
          sourceType: 'lead_ad',
          headline: ad.adName,
          body: ad.campaignName,
          at: ad.at,
        }
      : undefined;
    if (existing) {
      // Completa lo que falta; no pisa lo que el equipo ya cargó.
      const set: Record<string, unknown> = {};
      if (!existing.name && m.name) set.name = m.name;
      if (!existing.phone && phone) set.phone = phone;
      if (!existing.email && m.email) set.email = m.email;
      if (!existing.adReferral && referral) set.adReferral = referral;
      for (const [k, v] of Object.entries(m.customFields))
        if (existing.customFields?.[k] === undefined)
          set[`customFields.${k}`] = v;
      if (Object.keys(set).length)
        await this.customers
          .updateOne({ _id: existing._id }, { $set: set })
          .exec();
      return { customer: existing, created: false };
    }
    const customer = await this.customers.create({
      tenantId,
      name: m.name || m.email || phone || 'Lead de anuncio',
      email: m.email,
      phone,
      tags: [],
      source: 'lead_ads',
      sourceLabel: ad.campaignName
        ? `Lead Ads · ${ad.campaignName}`
        : 'Lead Ads',
      adReferral: referral,
      customFields: m.customFields,
    });
    return { customer, created: true };
  }

  private async createLead(
    tenantId: Types.ObjectId,
    customer: Customer,
    ad: Partial<LeadAdLead>,
  ): Promise<Types.ObjectId> {
    const tid = String(tenantId);
    const stage = await this.stages.defaultKey(tid);
    const top = await this.leads
      .findOne({ tenantId, stage })
      .sort({ position: 1 })
      .select({ position: 1 })
      .exec();
    const lead = await this.leads.create({
      tenantId,
      customerId: customer._id,
      title: `${customer.name}${ad.formName ? ` · ${ad.formName}` : ''}`.slice(
        0,
        200,
      ),
      stage,
      status: 'open',
      value: 0,
      currency: 'PEN',
      priority: 'medium',
      source: 'lead_ads',
      tags: [],
      lastActivityAt: new Date(),
      position: (top?.position ?? 0) - 1,
    });
    const where = [
      ad.adName && `anuncio "${ad.adName}"`,
      ad.campaignName && `campaña "${ad.campaignName}"`,
    ]
      .filter(Boolean)
      .join(', ');
    await this.activities.create({
      tenantId,
      leadId: lead._id,
      type: 'system',
      title: `Oportunidad creada desde Meta Lead Ads${where ? ` (${where})` : ''}`,
      at: new Date(),
    });
    await this.activities.create({
      tenantId,
      leadId: lead._id,
      type: 'assignment',
      title: 'Queda sin asignar',
      at: new Date(),
    });
    void this.leadsService.notifyUnassigned(tid, lead);
    return lead._id;
  }

  // ── Formularios ────────────────────────────────────────────────────────

  /** Alta automática del formulario la primera vez que llega un lead suyo. */
  private async ensureForm(
    tenantId: Types.ObjectId,
    account: MessengerAccount,
    formId: string,
  ) {
    const found = await this.forms.findOne({ tenantId, formId }).exec();
    if (found) return found;
    let name: string | undefined;
    let questions: { key: string; label?: string }[] = [];
    try {
      const f = await this.graph.get<{
        name?: string;
        questions?: { key: string; label?: string }[];
      }>(`/${formId}`, {
        accessToken: account.pageAccessToken,
        params: { fields: 'name,questions' },
      });
      name = f.name;
      questions = (f.questions ?? []).map((q) => ({
        key: q.key,
        label: q.label,
      }));
    } catch {
      /* sin nombre: se completa al sincronizar */
    }
    return this.forms
      .findOneAndUpdate(
        { tenantId, formId },
        {
          $setOnInsert: {
            tenantId,
            formId,
            accountId: account._id,
            pageId: account.pageId,
            name,
            questions,
            mapping: {},
            createLead: true,
            active: true,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
  }

  listForms(tenantId: string) {
    return this.forms
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ lastLeadAt: -1, createdAt: -1 })
      .lean()
      .exec();
  }

  /** Trae de Meta los formularios de todas las Páginas conectadas. */
  async syncForms(tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const accounts = await this.accounts
      .find({ tenantId: tid, active: true, pageId: { $exists: true } })
      .exec();
    if (!accounts.length)
      throw new BadRequestException(
        'Conecta primero una Página de Facebook en Messenger.',
      );
    const errors: string[] = [];
    let synced = 0;
    for (const a of accounts) {
      if (!a.pageAccessToken) continue;
      try {
        const res = await this.graph.get<{
          data?: {
            id: string;
            name?: string;
            questions?: { key: string; label?: string }[];
          }[];
        }>(`/${a.pageId}/leadgen_forms`, {
          accessToken: a.pageAccessToken,
          params: { fields: 'id,name,status,questions', limit: '100' },
        });
        for (const f of res.data ?? []) {
          await this.forms
            .updateOne(
              { tenantId: tid, formId: f.id },
              {
                $set: {
                  name: f.name,
                  questions: (f.questions ?? []).map((q) => ({
                    key: q.key,
                    label: q.label,
                  })),
                  pageId: a.pageId,
                  accountId: a._id,
                },
                $setOnInsert: {
                  tenantId: tid,
                  formId: f.id,
                  mapping: {},
                  createLead: true,
                  active: true,
                },
              },
              { upsert: true },
            )
            .exec();
          synced++;
        }
      } catch (err) {
        errors.push(`${a.pageName ?? a.label}: ${this.errorText(err)}`);
      }
    }
    return { synced, errors, forms: await this.listForms(tenantId) };
  }

  async updateForm(
    tenantId: string,
    id: string,
    input: {
      mapping?: Record<string, string>;
      createLead?: boolean;
      active?: boolean;
    },
  ) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Formulario no encontrado');
    const set: Record<string, unknown> = {};
    if (input.mapping !== undefined) {
      if (typeof input.mapping !== 'object' || input.mapping === null)
        throw new BadRequestException('Mapeo no válido');
      const entries = Object.entries(input.mapping).filter(
        ([k]) => k && k.length <= 200 && !k.includes('.') && !k.startsWith('$'),
      );
      for (const [, v] of entries)
        if (!isValidTarget(String(v)))
          throw new BadRequestException(`Destino no válido: ${String(v)}`);
      set.mapping = Object.fromEntries(entries.map(([k, v]) => [k, String(v)]));
    }
    if (input.createLead !== undefined) set.createLead = !!input.createLead;
    if (input.active !== undefined) set.active = !!input.active;
    const form = await this.forms
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), tenantId: new Types.ObjectId(tenantId) },
        { $set: set },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (!form) throw new NotFoundException('Formulario no encontrado');
    return form;
  }

  // ── Bitácora y reporte ─────────────────────────────────────────────────

  recent(tenantId: string, limit = 50) {
    return this.leadsLog
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ receivedAt: -1 })
      .limit(Math.min(limit, 200))
      .select('-lockedUntil')
      .populate('customerId', 'name phone email')
      .lean()
      .exec();
  }

  async retry(tenantId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Lead no encontrado');
    const row = await this.leadsLog
      .findOne({
        _id: new Types.ObjectId(id),
        tenantId: new Types.ObjectId(tenantId),
      })
      .exec();
    if (!row) throw new NotFoundException('Lead no encontrado');
    if (row.status !== 'failed')
      throw new BadRequestException('Solo se reintentan los fallidos.');
    return this.process(id);
  }

  /** Contactos, oportunidades y ganadas por anuncio: Lead Ads y click-to-WhatsApp. */
  report(tenantId: string) {
    return this.customers
      .aggregate<{
        _id: string;
        name?: string;
        contacts: number;
        fromLeadAds: number;
        fromWhatsapp: number;
        opportunities: number;
        won: number;
      }>([
        {
          $match: {
            tenantId: new Types.ObjectId(tenantId),
            'adReferral.adId': { $exists: true, $ne: null },
          },
        },
        {
          $lookup: {
            from: 'leads',
            localField: '_id',
            foreignField: 'customerId',
            as: 'l',
            pipeline: [{ $project: { status: 1 } }],
          },
        },
        {
          $group: {
            _id: '$adReferral.adId',
            name: { $first: '$adReferral.headline' },
            contacts: { $sum: 1 },
            fromLeadAds: {
              $sum: { $cond: [{ $eq: ['$source', 'lead_ads'] }, 1, 0] },
            },
            fromWhatsapp: {
              $sum: { $cond: [{ $eq: ['$source', 'whatsapp'] }, 1, 0] },
            },
            opportunities: { $sum: { $size: '$l' } },
            won: {
              $sum: {
                $size: {
                  $filter: {
                    input: '$l',
                    cond: { $eq: ['$$this.status', 'won'] },
                  },
                },
              },
            },
          },
        },
        { $sort: { contacts: -1 } },
        { $limit: 200 },
      ])
      .exec();
  }
}
