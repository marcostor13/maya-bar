/**
 * Todos los sitios donde un usuario queda referenciado. Es el mapa que usa el
 * borrado para reasignar antes de eliminar: sin esto, borrar a alguien deja
 * documentos apuntando a un usuario inexistente.
 *
 * `customers.createdBy` es el caso delicado: además de indicar el autor, forma
 * parte de los índices únicos `email_tenant_owner_unique` y
 * `phone_tenant_owner_unique`, y gobierna `isOwnerScoped` (un impulsador solo ve
 * su propia agenda). Un contacto huérfano seguiría ocupando su hueco en el
 * índice sin aparecer en la vista de nadie.
 */
export interface UserReference {
  /** Nombre de la colección en Mongo. */
  collection: string;
  /** Campo que guarda el id del usuario. */
  field: string;
  /** Cómo se llama esto para quien administra. */
  label: string;
}

export const USER_REFERENCES: UserReference[] = [
  { collection: 'customers', field: 'createdBy', label: 'Contactos' },
  { collection: 'visits', field: 'impulsadorId', label: 'Visitas' },
  {
    collection: 'eventregistrations',
    field: 'impulsadorId',
    label: 'Registros a eventos',
  },
  { collection: 'contactlists', field: 'createdBy', label: 'Listas' },
  { collection: 'contactforms', field: 'createdBy', label: 'Formularios' },
  { collection: 'events', field: 'createdBy', label: 'Eventos' },
  {
    collection: 'contactsources',
    field: 'createdBy',
    label: 'Fuentes de importación',
  },
  { collection: 'aiagents', field: 'createdBy', label: 'Agentes IA' },
  {
    collection: 'externalimpulsadores',
    field: 'createdBy',
    label: 'Impulsadores externos',
  },
  {
    collection: 'conversations',
    field: 'takenOverBy',
    label: 'Conversaciones atendidas',
  },
  { collection: 'messages', field: 'sentBy', label: 'Mensajes enviados' },
];

/** Lo que se le muestra al administrador antes de confirmar un borrado. */
export interface DeletionImpact {
  userId: string;
  name: string;
  email: string;
  role: string;
  /** Solo las colecciones con al menos un registro. */
  items: { collection: string; label: string; count: number }[];
  total: number;
}
