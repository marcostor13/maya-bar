import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiService, type AiApiKeys } from '../ai/ai.service';
import { SettingsService } from '../settings/settings.service';
import { ProspectSearch } from './prospect-search.schema';
import {
  Prospect,
  ProspectPerson,
  ProspectResearch,
  ResearchStep,
} from './prospect.schema';
import {
  PlaceCandidate,
  WebsiteReport,
  domainOf,
  errorText,
  hunterDomainSearch,
  normalizeUrl,
  placeDetails,
  placesTextSearch,
  runPageSpeed,
  scrapeWebsite,
  serperPlaces,
  serperSearch,
  extractSocial,
  extractEmails,
  type SearchResult,
} from './prospecting-sources';

/** Llamadas a la IA: generosas, porque la salida es JSON largo. */
const AI_MAX_TOKENS = 8000;
const AI_TIMEOUT_MS = 4 * 60_000;
/** Candidatos que se puntúan por llamada a la IA. */
const SCORE_CHUNK = 25;

export interface ProspectingKeys {
  places?: string;
  pageSpeed?: string;
  serper?: string;
  hunter?: string;
  ai: AiApiKeys;
}

@Injectable()
export class ProspectingResearchService {
  private readonly logger = new Logger(ProspectingResearchService.name);

  constructor(
    @InjectModel(ProspectSearch.name)
    private searchModel: Model<ProspectSearch>,
    @InjectModel(Prospect.name) private prospectModel: Model<Prospect>,
    private ai: AiService,
    private settings: SettingsService,
  ) {}

  async keys(tenantId: string): Promise<ProspectingKeys> {
    const cfg = await this.settings.get(tenantId);
    return {
      places: cfg?.googlePlacesApiKey?.trim() || undefined,
      // PageSpeed también acepta la key de Google Places si tiene la API habilitada.
      pageSpeed: cfg?.pageSpeedApiKey?.trim() || undefined,
      serper: cfg?.serperApiKey?.trim() || undefined,
      hunter: cfg?.hunterApiKey?.trim() || undefined,
      ai: {
        deepseek: cfg?.deepseekApiKey,
        claude: cfg?.claudeApiKey,
        openai: cfg?.openaiApiKey,
        gemini: cfg?.geminiApiKey,
      },
    };
  }

  private async askJson<T>(
    keys: ProspectingKeys,
    system: string,
    user: string,
  ): Promise<T> {
    const text = await this.ai.chatMessages(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        apiKeys: keys.ai,
        maxTokens: AI_MAX_TOKENS,
        temperature: 0.3,
        timeoutMs: AI_TIMEOUT_MS,
      },
    );
    return this.ai.parseJson<T>(text);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Fase 1: búsqueda de empresas
  // ──────────────────────────────────────────────────────────────────────

  async runSearch(search: ProspectSearch): Promise<void> {
    const tenantId = String(search.tenantId);
    const keys = await this.keys(tenantId);
    const progress = (text: string) =>
      this.searchModel
        .updateOne({ _id: search._id }, { $set: { progress: text } })
        .exec();

    await progress('Definiendo el cliente ideal y las búsquedas…');
    const plan = await this.askJson<{
      idealProfile?: string;
      queries?: string[];
    }>(
      keys,
      'Eres un estratega de desarrollo de negocio B2B. Respondes solo JSON válido.',
      `Una empresa quiere encontrar clientes potenciales.

SERVICIOS QUE OFRECE:
${search.services}

CLIENTE IDEAL (según la empresa): ${search.idealCustomer || 'no especificado'}
SECTORES A PRIORIZAR: ${search.industries.join(', ') || 'los que mejor encajen'}
ZONA: ${search.location || 'no especificada'}

Devuelve:
{
  "idealProfile": "2-4 frases: qué tipo de negocio necesita estos servicios y qué señales lo delatan",
  "queries": ["6 a 8 búsquedas cortas para Google Maps, tipo '<tipo de negocio> en <zona>'"]
}
Las búsquedas deben ser tipos de negocio concretos que compran estos servicios, siempre con la zona.`,
    );
    const queries = (plan.queries ?? [])
      .map((q) => String(q).trim())
      .filter(Boolean)
      .slice(0, 8);
    await this.searchModel
      .updateOne(
        { _id: search._id },
        { $set: { queries, idealProfile: plan.idealProfile ?? '' } },
      )
      .exec();

    // Empresas ya prospectadas en este tenant: no se repiten.
    const known = await this.prospectModel
      .find({ tenantId: search.tenantId }, { placeId: 1, domain: 1, name: 1 })
      .lean()
      .exec();
    const seen = new Set<string>();
    for (const p of known) {
      if (p.placeId) seen.add(`p:${p.placeId}`);
      if (p.domain) seen.add(`d:${p.domain}`);
      seen.add(`n:${p.name.toLowerCase()}`);
    }

    const target = search.maxResults * 2;
    const candidates: PlaceCandidate[] = [];
    const sources = new Set<string>();
    const add = (list: PlaceCandidate[]) => {
      for (const c of list) {
        const ids = [
          c.placeId ? `p:${c.placeId}` : '',
          domainOf(c.website) ? `d:${domainOf(c.website)}` : '',
          `n:${c.name.toLowerCase()}`,
        ].filter(Boolean);
        if (ids.some((id) => seen.has(id))) continue;
        ids.forEach((id) => seen.add(id));
        candidates.push(c);
        sources.add(c.source);
      }
    };

    const errors: string[] = [];
    for (const [i, query] of queries.entries()) {
      if (candidates.length >= target) break;
      await progress(
        `Buscando empresas (${i + 1}/${queries.length}): ${query}`,
      );
      try {
        if (keys.places) add(await placesTextSearch(query, keys.places));
        else if (keys.serper) add(await serperPlaces(query, keys.serper));
      } catch (err) {
        errors.push(errorText(err));
        this.logger.warn(`Búsqueda "${query}" falló: ${errorText(err)}`);
      }
    }

    // Sin fuentes (o sin resultados) la IA propone empresas conocidas.
    if (!candidates.length) {
      if ((keys.places || keys.serper) && errors.length === queries.length)
        throw new Error(`Las fuentes de búsqueda fallaron: ${errors[0]}`);
      await progress('Pidiendo a la IA empresas candidatas…');
      add(await this.aiCandidates(keys, search, plan.idealProfile ?? ''));
    }

    await progress(
      `Evaluando ${candidates.length} empresas contra tus servicios…`,
    );
    const scored = await this.scoreCandidates(keys, search, candidates);
    const top = scored
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, search.maxResults);

    if (top.length)
      await this.prospectModel.insertMany(
        top.map((c) => ({
          tenantId: search.tenantId,
          searchId: search._id,
          createdBy: search.createdBy,
          name: c.name,
          website: normalizeUrl(c.website),
          domain: domainOf(c.website),
          phone: c.phone,
          address: c.address,
          industry: c.industry || c.category,
          description: c.description,
          source: c.source,
          placeId: c.placeId,
          rating: c.rating,
          reviewsCount: c.reviewsCount,
          mapsUrl: c.mapsUrl,
          fitScore: c.fitScore,
          fitReason: c.fitReason,
          status: 'new',
          research: { state: 'idle' },
          material: { state: 'idle' },
        })),
      );

    await this.searchModel
      .updateOne(
        { _id: search._id },
        {
          $set: {
            status: 'done',
            found: top.length,
            sources: [...sources],
            progress: '',
            error: top.length ? undefined : 'No se encontraron empresas nuevas',
          },
          $unset: { lockedUntil: 1 },
        },
      )
      .exec();
  }

  private async aiCandidates(
    keys: ProspectingKeys,
    search: ProspectSearch,
    idealProfile: string,
  ): Promise<PlaceCandidate[]> {
    const res = await this.askJson<{
      companies?: {
        name?: string;
        website?: string;
        industry?: string;
        city?: string;
        description?: string;
      }[];
    }>(
      keys,
      'Eres un investigador de mercado. Solo mencionas empresas reales que conoces con certeza. Respondes solo JSON válido.',
      `Perfil de cliente ideal: ${idealProfile}
Servicios que se le venderían: ${search.services.slice(0, 2000)}
Zona: ${search.location || 'cualquiera'}

Lista hasta ${Math.min(search.maxResults * 2, 40)} empresas REALES de esa zona que encajen. Si no conoces la web con certeza, déjala vacía.
{"companies":[{"name":"","website":"","industry":"","city":"","description":"una frase"}]}`,
    );
    return (res.companies ?? [])
      .filter((c) => c.name)
      .map((c) => ({
        name: String(c.name),
        website: c.website || undefined,
        category: c.industry,
        address: c.city,
        description: c.description,
        source: 'ai' as const,
      }));
  }

  private async scoreCandidates(
    keys: ProspectingKeys,
    search: ProspectSearch,
    candidates: PlaceCandidate[],
  ): Promise<
    (PlaceCandidate & {
      fitScore: number;
      fitReason?: string;
      industry?: string;
    })[]
  > {
    const out: (PlaceCandidate & {
      fitScore: number;
      fitReason?: string;
      industry?: string;
    })[] = [];
    for (let i = 0; i < candidates.length; i += SCORE_CHUNK) {
      const chunk = candidates.slice(i, i + SCORE_CHUNK);
      const list = chunk
        .map(
          (c, j) =>
            `${j}. ${c.name} | ${c.category ?? ''} | ${c.address ?? ''} | web: ${c.website ? 'sí' : 'NO'} | reseñas: ${c.reviewsCount ?? '?'} (${c.rating ?? '?'}★)${c.description ? ` | ${c.description}` : ''}`,
        )
        .join('\n');
      let scores: {
        i?: number;
        score?: number;
        reason?: string;
        industry?: string;
      }[] = [];
      try {
        const res = await this.askJson<{ scores?: typeof scores }>(
          keys,
          'Eres un analista de ventas B2B que califica prospectos. Respondes solo JSON válido.',
          `SERVICIOS QUE VENDEMOS:
${search.services.slice(0, 3000)}

CLIENTE IDEAL: ${search.idealCustomer || 'no especificado'}

Califica de 0 a 100 qué tan probable es que cada empresa necesite y pueda pagar estos servicios. Considera señales como no tener web, pocas reseñas, sector, tamaño aparente.
${list}

{"scores":[{"i":0,"score":80,"industry":"sector corto","reason":"una frase concreta de por qué encaja o no"}]}`,
        );
        scores = res.scores ?? [];
      } catch (err) {
        this.logger.warn(`Puntuación de candidatos falló: ${errorText(err)}`);
      }
      chunk.forEach((c, j) => {
        const s = scores.find((x) => Number(x.i) === j);
        out.push({
          ...c,
          fitScore: Math.max(
            0,
            Math.min(100, Math.round(Number(s?.score ?? 50))),
          ),
          fitReason: s?.reason,
          industry: s?.industry,
        });
      });
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Fase 2: investigación exhaustiva de una empresa
  // ──────────────────────────────────────────────────────────────────────

  async runResearch(prospect: Prospect): Promise<void> {
    const tenantId = String(prospect.tenantId);
    const keys = await this.keys(tenantId);
    const steps: ResearchStep[] = [];
    const data: Partial<ProspectResearch> = {};
    const save = (patch: Record<string, unknown>) =>
      this.prospectModel
        .updateOne({ _id: prospect._id }, { $set: patch })
        .exec();
    const step = async (
      key: string,
      label: string,
      run: () => Promise<string | undefined | void>,
      skipReason?: string,
    ) => {
      if (skipReason) {
        steps.push({ key, label, status: 'skipped', detail: skipReason });
        return;
      }
      try {
        const detail = await run();
        steps.push({ key, label, status: 'ok', detail: detail || undefined });
      } catch (err) {
        steps.push({ key, label, status: 'failed', detail: errorText(err) });
      }
      await save({ 'research.steps': steps });
    };

    // Una página de Facebook o Instagram no es web propia: se trata como red.
    let website = domainOf(prospect.website) ? prospect.website : undefined;
    const searchResults: SearchResult[] = [];
    const city = prospect.address?.split(',').slice(-2).join(',').trim() ?? '';

    // 1. Ficha de Google Maps: reseñas, horario, valoración.
    await step(
      'place',
      'Ficha de Google Maps',
      async () => {
        const details = await placeDetails(
          prospect.placeId as string,
          keys.places as string,
        );
        data.place = details as unknown as Record<string, unknown>;
        return `${details.reviewsCount ?? 0} reseñas · ${details.rating ?? '—'}★`;
      },
      !prospect.placeId
        ? 'Empresa sin ficha de Google Maps'
        : !keys.places
          ? 'Falta la API key de Google Places'
          : undefined,
    );

    // 2. Búsqueda en Google: web propia, redes, prensa.
    await step(
      'search',
      'Búsqueda en Google',
      async () => {
        const results = await serperSearch(
          `"${prospect.name}" ${city}`,
          keys.serper as string,
          10,
        );
        searchResults.push(...results);
        if (!website) {
          const own = results.find((r) => domainOf(r.link));
          if (own) website = normalizeUrl(new URL(own.link).origin);
        }
        return `${results.length} resultados`;
      },
      keys.serper ? undefined : 'Falta la API key de Serper',
    );

    // 3. Personas: perfiles de LinkedIn asociados a la empresa.
    const linkedinPeople: SearchResult[] = [];
    await step(
      'people_search',
      'Personas en LinkedIn',
      async () => {
        const results = await serperSearch(
          `site:linkedin.com/in "${prospect.name}" (gerente OR director OR fundador OR CEO OR dueño OR owner)`,
          keys.serper as string,
          10,
        );
        linkedinPeople.push(...results);
        return `${results.length} perfiles`;
      },
      keys.serper ? undefined : 'Falta la API key de Serper',
    );

    // 4. Sitio web: contenido, tecnología, contacto y redes.
    let site: WebsiteReport | undefined;
    await step(
      'website',
      'Análisis del sitio web',
      async () => {
        site = await scrapeWebsite(website as string);
        data.website = site as unknown as Record<string, unknown>;
        if (!site.reachable)
          throw new Error(site.error || 'La web no responde');
        return `${site.pagesVisited.length} páginas · ${site.technologies.slice(0, 4).join(', ') || 'sin tecnologías detectadas'}`;
      },
      website ? undefined : 'La empresa no tiene web conocida',
    );

    // 5. Rendimiento y SEO técnico.
    await step(
      'pagespeed',
      'PageSpeed (móvil y escritorio)',
      async () => {
        const target = site?.finalUrl || website || '';
        const [mobile, desktop] = await Promise.allSettled([
          runPageSpeed(target, 'mobile', keys.pageSpeed || keys.places),
          runPageSpeed(target, 'desktop', keys.pageSpeed || keys.places),
        ]);
        if (mobile.status === 'rejected' && desktop.status === 'rejected')
          throw mobile.reason;
        data.pageSpeed = {
          mobile: mobile.status === 'fulfilled' ? mobile.value : undefined,
          desktop: desktop.status === 'fulfilled' ? desktop.value : undefined,
        };
        const m =
          mobile.status === 'fulfilled' ? mobile.value.performance : undefined;
        return `Rendimiento móvil ${m ?? '—'}/100`;
      },
      website && site?.reachable ? undefined : 'Sin web accesible que medir',
    );

    // 6. Correos y personas del dominio.
    const domain = domainOf(website);
    const people: ProspectPerson[] = [];
    await step(
      'hunter',
      'Correos y personas (Hunter)',
      async () => {
        const res = await hunterDomainSearch(
          domain as string,
          keys.hunter as string,
        );
        for (const p of res.people)
          people.push({
            ...p,
            source: 'hunter',
            notes: p.confidence ? `Confianza ${p.confidence}%` : undefined,
          });
        data.emails = res.genericEmails;
        return `${res.people.length} personas · ${res.genericEmails.length} correos genéricos`;
      },
      !domain
        ? 'Sin dominio propio'
        : keys.hunter
          ? undefined
          : 'Falta la API key de Hunter',
    );

    // Consolidar contacto y redes de todas las fuentes.
    const social = [
      ...(site?.social ?? []),
      ...extractSocial(prospect.website ?? ''),
      ...extractSocial(searchResults.map((r) => r.link).join(' ')),
    ].filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i);
    const emails = [
      ...new Set([
        ...(site?.emails ?? []),
        ...(data.emails ?? []),
        ...extractEmails(searchResults.map((r) => r.snippet ?? '').join(' ')),
      ]),
    ];
    const phones = [
      ...new Set(
        [...(site?.phones ?? []), prospect.phone].filter(Boolean) as string[],
      ),
    ];

    // 7. Síntesis con IA.
    let ai: Record<string, unknown> = {};
    await step('ai', 'Síntesis con IA', async () => {
      ai = await this.synthesize(keys, prospect, {
        site,
        place: data.place,
        pageSpeed: data.pageSpeed,
        social,
        emails,
        phones,
        searchResults,
        linkedinPeople,
        people,
      });
      return undefined;
    });
    if (!Object.keys(ai).length)
      throw new Error(
        steps.find((s) => s.key === 'ai')?.detail ||
          'La IA no devolvió la síntesis',
      );

    const aiPeople = Array.isArray(ai.people)
      ? (ai.people as ProspectPerson[])
      : [];
    const mergedPeople = [...people];
    for (const p of aiPeople) {
      if (!p?.name) continue;
      const existing = mergedPeople.find(
        (x) => x.name.toLowerCase() === String(p.name).toLowerCase(),
      );
      if (existing) {
        existing.role ||= p.role;
        existing.linkedin ||= p.linkedin;
      } else
        mergedPeople.push({
          name: String(p.name),
          role: p.role,
          linkedin: p.linkedin,
          email: p.email,
          source: p.source || 'ia',
          notes: p.notes,
        });
    }
    delete ai.people;

    const patch: Record<string, unknown> = {
      'research.state': 'done',
      'research.finishedAt': new Date(),
      'research.error': null,
      'research.steps': steps,
      'research.place': data.place ?? null,
      'research.website': data.website ?? null,
      'research.pageSpeed': data.pageSpeed ?? null,
      'research.social': social,
      'research.searchResults': searchResults.slice(0, 10),
      'research.emails': emails,
      'research.phones': phones,
      'research.people': mergedPeople.slice(0, 15),
      'research.ai': ai,
      'research.lockedUntil': null,
    };
    // Rellena los datos de contacto de la ficha si estaban vacíos.
    if (!prospect.website && website) {
      patch.website = website;
      patch.domain = domainOf(website);
    }
    if (!prospect.email && emails[0]) patch.email = emails[0];
    if (!prospect.phone && phones[0]) patch.phone = phones[0];
    if (!prospect.industry && typeof ai.industry === 'string')
      patch.industry = ai.industry;
    if (typeof ai.fitScore === 'number')
      patch.fitScore = Math.max(0, Math.min(100, Math.round(ai.fitScore)));
    await save(patch);
  }

  private async synthesize(
    keys: ProspectingKeys,
    prospect: Prospect,
    input: {
      site?: WebsiteReport;
      place?: Record<string, unknown>;
      pageSpeed?: Record<string, unknown>;
      social: { network: string; url: string }[];
      emails: string[];
      phones: string[];
      searchResults: SearchResult[];
      linkedinPeople: SearchResult[];
      people: ProspectPerson[];
    },
  ): Promise<Record<string, unknown>> {
    const search = prospect.searchId
      ? await this.searchModel.findById(prospect.searchId).lean().exec()
      : null;
    const site = input.site;
    const siteSummary = site
      ? JSON.stringify({
          url: site.finalUrl,
          https: site.https,
          respuestaMs: site.responseMs,
          titulo: site.title,
          metaDescripcion: site.description,
          responsive: site.hasViewport,
          openGraph: site.hasOpenGraph,
          schemaOrg: site.hasSchemaOrg,
          h1: site.h1Count,
          imagenesSinAlt: `${site.imagesWithoutAlt}/${site.images}`,
          palabras: site.wordCount,
          copyright: site.copyrightYear,
          tecnologias: site.technologies,
          formularioContacto: site.hasContactForm,
          blog: site.hasBlog,
          tienda: site.hasEcommerce,
        })
      : 'No tiene web o no respondió.';

    return this.askJson<Record<string, unknown>>(
      keys,
      'Eres un analista de inteligencia comercial. Investigas empresas para preparar una venta consultiva. Nunca inventas datos: si algo no aparece en la información, lo dices. Respondes solo JSON válido en español.',
      `EMPRESA: ${prospect.name}
Sector: ${prospect.industry ?? '—'} · Dirección: ${prospect.address ?? '—'}
Teléfono: ${prospect.phone ?? '—'} · Web: ${prospect.website ?? site?.finalUrl ?? '—'}
Google Maps: ${prospect.rating ?? '—'}★ con ${prospect.reviewsCount ?? 0} reseñas

NUESTROS SERVICIOS:
${search?.services?.slice(0, 2500) ?? 'No especificados'}

FICHA DE GOOGLE MAPS:
${input.place ? JSON.stringify(input.place).slice(0, 3500) : 'No disponible'}

SITIO WEB (técnico):
${siteSummary}

CONTENIDO DE LA WEB:
${site?.excerpt?.slice(0, 7000) ?? '—'}

PAGESPEED:
${input.pageSpeed ? JSON.stringify(input.pageSpeed).slice(0, 2500) : 'No medido'}

REDES SOCIALES ENCONTRADAS: ${input.social.map((s) => s.url).join(', ') || 'ninguna'}
CORREOS: ${input.emails.join(', ') || 'ninguno'} · TELÉFONOS: ${input.phones.join(', ') || 'ninguno'}

RESULTADOS DE GOOGLE:
${input.searchResults.map((r) => `- ${r.title} (${r.link}): ${r.snippet ?? ''}`).join('\n') || '—'}

PERFILES DE LINKEDIN:
${input.linkedinPeople.map((r) => `- ${r.title} (${r.link}): ${r.snippet ?? ''}`).join('\n') || '—'}

PERSONAS YA IDENTIFICADAS:
${input.people.map((p) => `- ${p.name}, ${p.role ?? ''} ${p.email ?? ''}`).join('\n') || '—'}

Devuelve este JSON:
{
  "summary": "qué hace la empresa, a quién vende y cómo, en 3-4 frases",
  "industry": "sector corto",
  "sizeEstimate": "micro | pequeña | mediana | grande, con la señal que lo indica",
  "yearsActive": "si se deduce, si no null",
  "valueProposition": "cómo se presenta ante sus clientes",
  "digitalMaturity": 0-100,
  "fitScore": 0-100 (qué tan buen cliente sería para nuestros servicios),
  "fitReason": "por qué",
  "strengths": ["fortalezas de su presencia digital y negocio"],
  "weaknesses": ["debilidades concretas detectadas, con el dato que lo demuestra"],
  "painPoints": ["problemas probables que nuestros servicios resuelven"],
  "opportunities": ["oportunidades concretas para venderle"],
  "reviewsInsight": "qué dicen sus clientes en las reseñas (elogios y quejas), o null",
  "socialPresence": "evaluación de sus redes: en cuáles está y qué tan activo parece",
  "decisionMakers": "quién probablemente decide la compra",
  "people": [{"name":"","role":"","linkedin":"url o null","source":"linkedin | web | google","notes":"qué se sabe"}],
  "approach": "cómo recomiendas abordarlos: canal, momento y ángulo",
  "talkingPoints": ["temas para abrir conversación, basados en datos reales"],
  "risks": ["objeciones o señales de que no comprarán"]
}
En "people" incluye SOLO personas que aparezcan en la información con nombre real.`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // Fase 3: material de alto valor
  // ──────────────────────────────────────────────────────────────────────

  async runMaterial(prospect: Prospect): Promise<void> {
    const keys = await this.keys(String(prospect.tenantId));
    const search = prospect.searchId
      ? await this.searchModel.findById(prospect.searchId).lean().exec()
      : null;
    const r = prospect.research ?? { state: 'idle' };
    const site = r.website as WebsiteReport | undefined;
    const research = {
      empresa: {
        nombre: prospect.name,
        sector: prospect.industry,
        direccion: prospect.address,
        web: prospect.website,
        googleMaps: { rating: prospect.rating, reseñas: prospect.reviewsCount },
      },
      analisis: r.ai,
      web: site
        ? {
            alcanzable: site.reachable,
            https: site.https,
            responsive: site.hasViewport,
            titulo: site.title,
            metaDescripcion: site.description,
            schemaOrg: site.hasSchemaOrg,
            openGraph: site.hasOpenGraph,
            imagenesSinAlt: `${site.imagesWithoutAlt}/${site.images}`,
            copyright: site.copyrightYear,
            tecnologias: site.technologies,
            formularioContacto: site.hasContactForm,
            blog: site.hasBlog,
            tienda: site.hasEcommerce,
          }
        : 'sin web',
      pageSpeed: r.pageSpeed,
      redes: r.social,
      reseñas: (r.place as { reviews?: unknown[] } | undefined)?.reviews?.slice(
        0,
        5,
      ),
      personas: r.people?.slice(0, 5),
    };

    const result = await this.askJson<{
      diagnosis?: Record<string, unknown>;
      plan?: Record<string, unknown>;
      outreach?: Record<string, unknown>;
    }>(
      keys,
      'Eres un consultor senior de marketing y transformación digital. Preparas material de alto valor para abrir una relación comercial: útil por sí mismo aunque el prospecto no compre. Basas cada hallazgo en datos de la investigación, sin inventar cifras. Respondes solo JSON válido en español.',
      `NUESTROS SERVICIOS:
${search?.services?.slice(0, 3000) ?? 'No especificados'}

INVESTIGACIÓN DEL PROSPECTO:
${JSON.stringify(research).slice(0, 14000)}

${prospect.material?.instructions ? `INDICACIONES DEL VENDEDOR: ${prospect.material.instructions}\n` : ''}
Genera:
{
  "diagnosis": {
    "score": 0-100,
    "headline": "titular del diagnóstico, directo y concreto",
    "summary": "resumen ejecutivo de 4-6 frases",
    "areas": [
      {"area": "Sitio web | Velocidad y experiencia móvil | SEO y visibilidad en Google | Google Maps y reseñas | Redes sociales | Conversión y captación | Medición y analítica | Reputación",
       "score": 0-100, "status": "good | warning | critical",
       "findings": ["hallazgo con el dato que lo prueba"],
       "recommendations": ["acción concreta"]}
    ]
  },
  "plan": {
    "vision": "cómo se vería su presencia digital ideal en 6-12 meses",
    "quickWins": ["mejoras de impacto inmediato y bajo costo"],
    "initiatives": [{"title":"","description":"","impact":"alto | medio | bajo","effort":"alto | medio | bajo","timeline":"ej. 2-4 semanas"}],
    "kpis": ["indicadores para medir la mejora"],
    "suggestedServices": [{"service":"uno de nuestros servicios","why":"qué problema suyo resuelve","outcome":"resultado esperado"}],
    "extraIdeas": ["ideas creativas adicionales que no piden, pero les ayudarían"]
  },
  "outreach": {
    "emailSubject": "asunto que invite a abrir, sin clickbait",
    "email": "correo en frío de máx. 150 palabras que aporte valor (un hallazgo del diagnóstico) y proponga enviar el diagnóstico completo o una llamada de 15 min",
    "whatsapp": "mensaje corto y humano de máx. 60 palabras",
    "linkedin": "nota de conexión de máx. 280 caracteres",
    "callScript": "guion breve para una llamada: apertura, pregunta de descubrimiento, valor, cierre",
    "followUps": ["2 mensajes de seguimiento, espaciados, cada uno aportando algo nuevo"]
  }
}
Incluye de 5 a 8 áreas en el diagnóstico. Firma los mensajes como [Tu nombre].`,
    );

    await this.prospectModel
      .updateOne(
        { _id: prospect._id },
        {
          $set: {
            'material.state': 'done',
            'material.generatedAt': new Date(),
            'material.error': null,
            'material.diagnosis': result.diagnosis ?? {},
            'material.plan': result.plan ?? {},
            'material.outreach': result.outreach ?? {},
            'material.lockedUntil': null,
          },
        },
      )
      .exec();
  }
}
