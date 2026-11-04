import type { AiTool, AiToolCall } from '../../ai/ai.service';
import {
  money,
  normalizeStoreUrl,
  StoreProduct,
  StoreProductFull,
  WooStoreService,
} from './woo-store.service';

/** Cómo se arma el link de pago de la tienda. */
export const STORE_CART_MODES = ['native', 'multi'] as const;
export type StoreCartMode = (typeof STORE_CART_MODES)[number];

export interface StorePhoto {
  url: string;
  name: string;
}

export interface StoreToolOptions {
  storeUrl: string;
  cartMode: StoreCartMode;
  /** Canal de la conversación, para medir las ventas del agente con UTM. */
  channel: string;
  /** Si el agente puede derivar: agrega la herramienta derivar_a_humano. */
  handoffEnabled: boolean;
}

const MAX_PHOTOS = 3;
const MAX_ITEMS = 20;

const SEARCH_TOOL: AiTool = {
  name: 'buscar_producto',
  description:
    'Busca productos en la tienda online y devuelve en tiempo real nombre, precio, stock, link e id. Úsala SIEMPRE que el cliente pregunte por un producto, su precio o disponibilidad, o para buscar alternativas por principio activo. Si preguntan por varios productos, llámala varias veces a la vez.',
  parameters: {
    type: 'object',
    properties: {
      consulta: {
        type: 'string',
        description:
          "Nombre comercial, principio activo y/o concentración. Ej: 'amoxicilina 500', 'dolopak'",
      },
    },
    required: ['consulta'],
  },
};

const PHOTO_TOOL: AiTool = {
  name: 'enviar_foto_producto',
  description:
    'Envía al cliente la foto del producto. Úsala cuando pregunta por un producto concreto, pide la foto o quiere confirmar que es el correcto. Con una sola foto, tu respuesta final viaja como su pie de foto, en el mismo mensaje: escribe tu respuesta normal (nombre, precio, stock, link y pregunta de cierre) y no menciones que enviaste la foto.',
  parameters: {
    type: 'object',
    properties: {
      producto_id: {
        type: 'integer',
        description: 'id devuelto por buscar_producto',
      },
    },
    required: ['producto_id'],
  },
};

const PAY_TOOL: AiTool = {
  name: 'generar_link_pago',
  description:
    'Genera el link que abre el checkout de la tienda con los productos y cantidades ya cargados. Úsala SOLO cuando el cliente ya quiere comprar o pagar, y después de reconfirmar el stock con buscar_producto en este mismo turno.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'id del producto devuelto por buscar_producto',
            },
            cantidad: { type: 'integer', minimum: 1, maximum: 99 },
          },
          required: ['id', 'cantidad'],
        },
      },
    },
    required: ['items'],
  },
};

const HANDOFF_TOOL: AiTool = {
  name: 'derivar_a_humano',
  description:
    'Pasa la conversación a un asesor humano con un resumen del caso. Úsala SOLO en los casos de derivación de tus instrucciones (reclamo, el cliente lo pide, etc.), nunca para terminar una respuesta. Después de usarla ya no podrás responder este chat: escribe en tu respuesta una frase avisándole al cliente.',
  parameters: {
    type: 'object',
    properties: {
      motivo: {
        type: 'string',
        enum: [
          'reclamo',
          'pedido_existente',
          'stock_tienda',
          'consulta_farmaceutica',
          'venta_corporativa',
          'producto_no_encontrado',
          'cliente_lo_pide',
          'otro',
        ],
      },
      resumen: {
        type: 'string',
        description:
          'Nombre del cliente, productos, qué se le informó y qué necesita',
      },
    },
    required: ['motivo', 'resumen'],
  },
};

/** Lo que ve el modelo de un producto: sin la URL de la foto ni datos internos. */
function forModel(p: StoreProductFull): StoreProduct {
  return {
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    precio_regular: p.precio_regular,
    disponible: p.disponible,
    stock_bajo: p.stock_bajo,
    requiere_receta: p.requiere_receta,
    link: p.link,
    tiene_foto: p.tiene_foto,
  };
}

/**
 * Herramientas de tienda para UNA respuesta del agente. Guarda los productos
 * que el modelo vio (el link de pago y la foto solo aceptan ids buscados en
 * este turno) y lo que hay que enviar al terminar: fotos y derivación.
 */
export class StoreToolSession {
  readonly tools: AiTool[];
  readonly photos: StorePhoto[] = [];
  handoff: { reason?: string } | null = null;

  private readonly seen = new Map<number, StoreProductFull>();
  private readonly base: string;

  constructor(
    private readonly store: WooStoreService,
    private readonly opts: StoreToolOptions,
  ) {
    this.base = normalizeStoreUrl(opts.storeUrl);
    this.tools = [
      SEARCH_TOOL,
      PHOTO_TOOL,
      PAY_TOOL,
      ...(opts.handoffEnabled ? [HANDOFF_TOOL] : []),
    ];
  }

  run = async (call: AiToolCall): Promise<unknown> => {
    const text = (k: string) => {
      const v = call.input[k];
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    };
    switch (call.name) {
      case 'buscar_producto':
        return this.search(text('consulta'));
      case 'enviar_foto_producto':
        return this.photo(Number(call.input.producto_id));
      case 'generar_link_pago':
        return this.paymentLink(call.input.items);
      case 'derivar_a_humano':
        return this.derive(text('motivo'), text('resumen'));
      default:
        return { error: `Herramienta desconocida: ${call.name}` };
    }
  };

  private async search(query: string) {
    if (!query.trim()) return { error: 'consulta vacía' };
    try {
      const items = await this.store.search(this.base, query);
      items.forEach((p) => this.seen.set(p.id, p));
      return items.length
        ? { productos: items.map(forModel) }
        : { productos: [], nota: 'Sin resultados para esa búsqueda.' };
    } catch {
      return {
        error: 'web_no_responde',
        link_busqueda: `${this.base}/?s=${encodeURIComponent(query)}&post_type=product`,
      };
    }
  }

  private photo(id: number) {
    const p = this.seen.get(id);
    if (!p)
      return {
        enviado: false,
        motivo:
          'Busque el producto con buscar_producto antes de enviar su foto.',
      };
    if (!p.foto) return { enviado: false, motivo: 'sin_foto' };
    if (this.photos.some((f) => f.url === p.foto))
      return { enviado: false, motivo: 'ya_enviada' };
    if (this.photos.length >= MAX_PHOTOS)
      return { enviado: false, motivo: 'máximo 3 fotos por respuesta' };
    this.photos.push({ url: p.foto, name: p.nombre });
    return {
      enviado: true,
      nota: 'La foto sale con tu respuesta final como pie de foto. Escribe tu respuesta normal y no menciones que enviaste la foto.',
    };
  }

  private paymentLink(raw: unknown) {
    const items = (Array.isArray(raw) ? raw : [])
      .map((i: { id?: unknown; cantidad?: unknown }) => ({
        id: Number(i?.id),
        qty: Math.min(99, Math.max(1, Math.trunc(Number(i?.cantidad) || 1))),
      }))
      .filter((i) => Number.isInteger(i.id) && i.id > 0)
      .slice(0, MAX_ITEMS);
    if (!items.length) return { error: 'Indique al menos un producto.' };

    const errores: string[] = [];
    for (const i of items) {
      const p = this.seen.get(i.id);
      if (!p)
        errores.push(
          `El id ${i.id} no salió de buscar_producto en este turno: búsquelo de nuevo.`,
        );
      else if (!p.disponible) errores.push(`${p.nombre} está agotado.`);
    }
    if (errores.length) return { error: errores };

    const resumen = items.map((i) => {
      const p = this.seen.get(i.id)!;
      return `${i.qty} × ${p.nombre} – ${money(p.precioNum * i.qty, p.moneda)}`;
    });
    const utm = `utm_source=agente_ia&utm_medium=${encodeURIComponent(this.opts.channel)}`;

    if (this.opts.cartMode === 'multi') {
      const pedido = items.map((i) => `${i.id}:${i.qty}`).join(',');
      return { link: `${this.base}/?fc_pedido=${pedido}&${utm}`, resumen };
    }
    // Sin el snippet de la tienda, WooCommerce solo carga un producto por link.
    const links = items.map(
      (i) =>
        `${this.base}/checkout/?add-to-cart=${i.id}&quantity=${i.qty}&${utm}`,
    );
    return items.length === 1
      ? { link: links[0], resumen }
      : {
          links,
          resumen,
          nota: 'Esta tienda carga un producto por link: cada link agrega su producto al carrito. Pídale al cliente que los abra en orden desde el mismo navegador; el último ya muestra el pedido completo.',
        };
  }

  private derive(motivo: string, resumen: string) {
    if (!this.opts.handoffEnabled) return { error: 'derivación no disponible' };
    const reason = [motivo, resumen].filter(Boolean).join(': ');
    this.handoff ??= { reason: reason || undefined };
    return { derivado: true };
  }
}
