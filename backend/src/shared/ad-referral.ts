/**
 * Anuncio del que salió un chat (Click-to-WhatsApp).
 *
 * Meta manda estos datos en `messages[0].referral` y SOLO en el primer mensaje
 * que el cliente escribe tras pulsar el anuncio. Si no se guardan en ese
 * instante se pierden para siempre, y sin `ctwaClid` ninguna conversión
 * posterior se puede atribuir a la campaña que la pagó.
 */
export interface AdReferral {
  /** Identificador del clic. Es lo que Meta necesita para atribuir la conversión. */
  ctwaClid?: string;
  /** Id del anuncio o de la publicación de origen (`source_id`). */
  adId?: string;
  /** 'ad' o 'post'. */
  sourceType?: string;
  sourceUrl?: string;
  /** Titular y cuerpo del anuncio: sirven para reconocerlo sin abrir Meta. */
  headline?: string;
  body?: string;
  /** Cuándo entró el chat por ese anuncio. */
  at?: Date;
}

/** ¿Trae algo aprovechable? Un referral sin clic no sirve para atribuir. */
export function hasAttribution(referral?: AdReferral | null): boolean {
  return !!referral?.ctwaClid || !!referral?.adId;
}
