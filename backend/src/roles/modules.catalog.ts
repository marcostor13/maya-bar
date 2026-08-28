/**
 * Catálogo de módulos de la plataforma. Vive en el código, no en la base de
 * datos, porque cada entrada corresponde a una ruta y unos controladores que
 * existen: un módulo no se puede inventar desde una pantalla.
 *
 * Lo que sí es configurable por empresa es qué roles acceden a cada uno, y eso
 * vive en la colección `roles`.
 */

export interface PlatformModule {
  /** Clave estable; es lo que se guarda en `roles.modules`. */
  key: string;
  /** Cómo se llama para quien administra. */
  label: string;
  /** Grupo del menú lateral, para agrupar la matriz igual que la navegación. */
  group: 'Operaciones' | 'Clientes' | 'Gestión' | 'Mi actividad';
  /** Ruta del frontend, para que el guard sepa qué proteger. */
  route: string;
}

const ALL_MODULES: PlatformModule[] = [
  // Operaciones
  { key: 'dashboard', label: 'Dashboard', group: 'Operaciones', route: 'dashboard' },
  { key: 'locals', label: 'Mis Locales', group: 'Operaciones', route: 'locals' },
  { key: 'menu', label: 'Menú', group: 'Operaciones', route: 'menu' },
  { key: 'orders', label: 'Pedidos', group: 'Operaciones', route: 'orders' },
  { key: 'kds', label: 'KDS', group: 'Operaciones', route: 'kds' },
  { key: 'reservations', label: 'Reservas', group: 'Operaciones', route: 'reservations' },
  { key: 'events', label: 'Eventos', group: 'Operaciones', route: 'events' },

  // Clientes
  { key: 'customers', label: 'Clientes', group: 'Clientes', route: 'customers' },
  { key: 'lists', label: 'Listas', group: 'Clientes', route: 'lists' },
  { key: 'forms', label: 'Formularios', group: 'Clientes', route: 'forms' },
  { key: 'campaigns', label: 'Campañas', group: 'Clientes', route: 'campaigns' },
  { key: 'templates', label: 'Plantillas', group: 'Clientes', route: 'plantillas' },
  { key: 'ai-agents', label: 'Agentes IA', group: 'Clientes', route: 'ai-agents' },
  { key: 'inbox', label: 'Conversaciones', group: 'Clientes', route: 'inbox' },

  // Mi actividad (impulsadores)
  { key: 'impulsador-panel', label: 'Mi Panel', group: 'Mi actividad', route: 'impulsador' },
  { key: 'visits', label: 'Visitas', group: 'Mi actividad', route: 'visitas' },
  { key: 'my-guests', label: 'Mis Asistentes', group: 'Mi actividad', route: 'mis-asistentes' },

  // Gestión
  { key: 'users', label: 'Usuarios', group: 'Gestión', route: 'users' },
  { key: 'settings', label: 'Configuración', group: 'Gestión', route: 'settings' },
];

/**
 * Módulos de hostelería retirados al reposicionar el producto como CRM de
 * ventas y marketing. No se borran: el código, los esquemas y los datos siguen
 * intactos, simplemente dejan de ofrecerse. Vaciar esta lista los devuelve.
 *
 * El filtro se aplica también sobre los roles ya guardados en base de datos
 * (`RolesService.accessFor`), porque las empresas existentes tienen estas
 * claves persistidas y de otro modo les seguirían apareciendo en el menú.
 */
export const HIDDEN_MODULES: readonly string[] = [
  'menu',
  'orders',
  'kds',
  'reservations',
];

export function isHiddenModule(key: string): boolean {
  return HIDDEN_MODULES.includes(key);
}

/** Quita del listado los módulos retirados. */
export function visibleModules(keys: string[]): string[] {
  return keys.filter((k) => !isHiddenModule(k));
}

export const MODULES: PlatformModule[] = ALL_MODULES.filter(
  (m) => !isHiddenModule(m.key),
);

export const MODULE_KEYS = MODULES.map((m) => m.key);

/**
 * Módulos que el administrador conserva siempre. Sin esta barandilla, quitarse
 * `users` deja la empresa sin acceso a la pantalla que permitiría revertirlo.
 */
export const ADMIN_LOCKED_MODULES = ['users', 'settings'];

/**
 * Matriz de partida: exactamente los accesos que tenía la plataforma cuando los
 * roles estaban fijos en el código. Es lo que se siembra por empresa, para que
 * el día del despliegue nadie note ningún cambio.
 *
 * Derivada de `shell.ts` (visibilidad del menú) y de los `roleGuard` de
 * `app.routes.ts`.
 */
const RAW_DEFAULT_ROLE_MODULES: Record<string, string[]> = {
  TENANT_ADMIN: MODULE_KEYS.filter((k) => k !== 'impulsador-panel' && k !== 'my-guests'),
  MANAGER: [
    'dashboard', 'locals', 'menu', 'orders', 'kds', 'reservations', 'events',
    'customers', 'lists', 'forms', 'campaigns', 'templates', 'ai-agents', 'inbox',
    'visits',
  ],
  MARKETING: [
    'dashboard', 'events',
    'customers', 'lists', 'forms', 'campaigns', 'ai-agents', 'inbox',
  ],
  HOST: ['dashboard', 'orders', 'reservations'],
  SERVER: ['dashboard', 'orders'],
  KITCHEN: ['dashboard', 'menu', 'orders', 'kds'],
  BAR: ['dashboard', 'menu', 'orders', 'kds'],
  IMPULSADOR: [
    'impulsador-panel', 'visits', 'events', 'my-guests', 'inbox',
    'customers', 'lists', 'campaigns',
  ],
};

export const DEFAULT_ROLE_MODULES: Record<string, string[]> = Object.fromEntries(
  Object.entries(RAW_DEFAULT_ROLE_MODULES).map(([role, mods]) => [
    role,
    visibleModules(mods),
  ]),
);

/** Etiquetas de los roles del sistema, para la pantalla de administración. */
export const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  MARKETING: 'Marketing',
  HOST: 'Anfitrión',
  SERVER: 'Mesero',
  KITCHEN: 'Cocina',
  BAR: 'Barra',
  IMPULSADOR: 'Impulsador',
};

export const SYSTEM_ROLES = Object.keys(DEFAULT_ROLE_MODULES);

/**
 * Acciones que se pueden restringir dentro de un módulo. `view` no está aquí
 * porque ya lo concede la pertenencia al módulo: si un rol no tiene el módulo,
 * no ve nada.
 *
 * El mapeo con HTTP es directo, así que el guard puede deducir la acción sin
 * anotar cada endpoint: POST crea, PATCH/PUT edita, DELETE borra, GET consulta.
 */
export const ACTIONS = ['create', 'edit', 'delete'] as const;
export type ModuleAction = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<string, string> = {
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
};

/** Verbo HTTP a acción. `GET` devuelve null: consultar no se restringe aparte. */
export function actionForMethod(method: string): ModuleAction | null {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PATCH':
    case 'PUT':
      return 'edit';
    case 'DELETE':
      return 'delete';
    default:
      return null;
  }
}
