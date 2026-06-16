# Permisos por Rol — BAR / Maya Platform

> Última actualización: 2026-05-21

---

## Roles del sistema

| Rol | Descripción |
|-----|-------------|
| `SUPERADMIN` | Administrador de plataforma. Gestiona empresas (tenants). Sin acceso a datos operativos de cada tenant. |
| `TENANT_ADMIN` | Administrador de empresa. Acceso completo a todos los recursos de su tenant. Único que puede gestionar usuarios. |
| `MANAGER` | Gerente operacional. Gestiona locales, menú, pedidos, reservas, CRM y configuración. Sin gestión de usuarios. |
| `HOST` | Hostess / recepcionista. Ve pedidos y reservas, no puede modificar configuración. |
| `SERVER` | Mesero. Gestiona pedidos (avanzar estado). Sin acceso a configuración. |
| `KITCHEN` | Personal de cocina. Ve pedidos de cocina (KDS), puede avanzar estado y hacer 86 de ítems. |
| `BAR` | Personal de bar. Igual que KITCHEN pero para estación de bar. |
| `MARKETING` | Marketing / CRM. Accede a eventos, clientes, campañas, listas y dashboard. Sin acceso operativo. |

---

## Grupos de roles (backend)

Definidos en `backend/src/auth/permissions.ts`:

| Constante | Roles incluidos | Uso |
|-----------|----------------|-----|
| `MANAGE_ROLES` | TENANT_ADMIN, MANAGER | Crear/editar locales, menú, eventos. Cancelar pedidos. |
| `OPERATIONAL_ROLES` | TENANT_ADMIN, MANAGER, HOST, SERVER, KITCHEN, BAR | Ver pedidos y reservas. |
| `AVAILABILITY_ROLES` | TENANT_ADMIN, MANAGER, KITCHEN, BAR | Activar/desactivar disponibilidad de ítems (86). |
| `ADVANCE_ORDER_ROLES` | TENANT_ADMIN, MANAGER, SERVER, KITCHEN, BAR | Avanzar estado de pedidos. |
| `ADMIN_ONLY` | TENANT_ADMIN | Archivar locales. |
| `CRM_ROLES` | TENANT_ADMIN, MANAGER, MARKETING | Clientes, campañas, eventos, listas, email. |

---

## Matriz de permisos — Frontend (rutas)

| Ruta | SUPERADMIN | TENANT_ADMIN | MANAGER | HOST | SERVER | KITCHEN | BAR | MARKETING |
|------|:----------:|:------------:|:-------:|:----:|:------:|:-------:|:---:|:---------:|
| `/admin/tenants` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dashboard` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/locals` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/menu` | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `/orders` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `/kds` | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `/reservations` | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `/events` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/customers` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/campaigns` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/lists` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/settings` | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/users` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/change-password` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/q/:localId/:table` | público | público | público | público | público | público | público | público |
| `/track/:orderId` | público | público | público | público | público | público | público | público |
| `/book/:localId` | público | público | público | público | público | público | público | público |
| `/book/confirm/:token` | público | público | público | público | público | público | público | público |

> **❌ redirige a:** SUPERADMIN → `/admin/tenants` · Otros → `/dashboard`

---

## Matriz de permisos — Backend (endpoints)

### Auth

| Endpoint | Acceso |
|----------|--------|
| `POST /auth/login` | Público |
| `POST /auth/register` | Público (crea tenant + TENANT_ADMIN) |
| `POST /auth/forgot-password` | Público |
| `POST /auth/reset-password` | Público (con código) |
| `PATCH /auth/change-password` | Cualquier usuario autenticado |

### Tenants

| Endpoint | SUPERADMIN | Otros |
|----------|:----------:|:-----:|
| `GET /tenants` | ✅ (todos) | ❌ 403 |
| `POST /tenants` | ✅ | ❌ 403 |
| `PATCH /tenants/:id` | ✅ | ❌ 403 |
| `GET /tenants/me` | ✅ | ✅ |
| `PATCH /tenants/me` | ✅ | ✅ |

### Usuarios

| Endpoint | TENANT_ADMIN | Otros |
|----------|:------------:|:-----:|
| `GET /users` | ✅ | ❌ 403 |
| `POST /users` | ✅ (solo STAFF_ROLES) | ❌ 403 |
| `PATCH /users/:id` | ✅ | ❌ 403 |
| `DELETE /users/:id` | ✅ (no puede desactivar TENANT_ADMIN) | ❌ 403 |

> **STAFF_ROLES creables:** MANAGER, HOST, SERVER, KITCHEN, BAR, MARKETING

### Locales

| Endpoint | SUPERADMIN | TENANT_ADMIN | MANAGER | Resto |
|----------|:----------:|:------------:|:-------:|:-----:|
| `GET /locals` | ✅ todos | ✅ tenant | ✅ tenant | ✅ tenant |
| `GET /locals/:id` | ✅ | ✅ | ✅ | ✅ |
| `POST /locals` | ✅ | ✅ | ✅ | ❌ |
| `PATCH /locals/:id` | ✅ | ✅ | ✅ | ❌ |
| `POST /locals/:id/clone` | ✅ | ✅ | ✅ | ❌ |
| `DELETE /locals/:id` (archivar) | ✅ | ✅ | ❌ | ❌ |

### Menú

| Endpoint | TENANT_ADMIN | MANAGER | KITCHEN | BAR | Resto |
|----------|:------------:|:-------:|:-------:|:---:|:-----:|
| `GET /menu/categories` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /menu/items` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /menu/categories` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `PATCH /menu/categories/reorder` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `PATCH /menu/categories/:id` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `DELETE /menu/categories/:id` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `POST /menu/items` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `PATCH /menu/items/reorder` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `PATCH /menu/items/:id` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `DELETE /menu/items/:id` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `PATCH /menu/items/:id/availability` (86) | ✅ | ✅ | ✅ | ✅ | ❌ |

### Pedidos

| Endpoint | TENANT_ADMIN | MANAGER | HOST | SERVER | KITCHEN | BAR |
|----------|:------------:|:-------:|:----:|:------:|:-------:|:---:|
| `GET /orders` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /orders/tables` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PATCH /orders/:id/status` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| `DELETE /orders/:id` (cancelar) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

> Endpoints públicos: `POST /public/orders`, `GET /public/orders/:id`, `/public/menu`, `call-waiter`, `call-bill`

> **HOST en pedidos:** Solo lectura — puede ver la cola pero no avanzar ni cancelar.

### Reservas

| Endpoint | TENANT_ADMIN | MANAGER | HOST | Resto |
|----------|:------------:|:-------:|:----:|:-----:|
| `GET /reservations` | ✅ | ✅ | ✅ | ❌ |
| `PATCH /reservations/:id/status` | ✅ | ✅ | ❌ | ❌ |
| `GET /reservations/config` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /reservations/config` | ✅ | ✅ | ❌ | ❌ |

> Endpoints públicos: disponibilidad, crear reserva, confirmar por token.

### Eventos

| Endpoint | TENANT_ADMIN | MANAGER | MARKETING | Resto |
|----------|:------------:|:-------:|:---------:|:-----:|
| `GET /events` | ✅ | ✅ | ✅ | ❌ |
| `POST /events` | ✅ | ✅ | ❌ | ❌ |
| `PATCH /events/:id` | ✅ | ✅ | ❌ | ❌ |
| `DELETE /events/:id` | ✅ | ✅ | ❌ | ❌ |
| `GET /events/:id/registrations` | ✅ | ✅ | ✅ | ❌ |
| `POST /events/:id/check-in` | ✅ | ✅ | ✅ | ❌ |
| `POST /events/:id/ai/*` (copy, social, email) | ✅ | ✅ | ❌ | ❌ |

> Endpoints públicos: ver evento, registrarse en evento.

### Clientes (CRM)

| Endpoint | TENANT_ADMIN | MANAGER | MARKETING | Resto |
|----------|:------------:|:-------:|:---------:|:-----:|
| `GET /customers` | ✅ | ✅ | ✅ | ❌ |
| `POST /customers` | ✅ | ✅ | ✅ | ❌ |
| `PATCH /customers/:id` | ✅ | ✅ | ✅ | ❌ |
| `POST /customers/sync` | ✅ | ✅ | ✅ | ❌ |
| `GET /customers/export` (CSV) | ✅ | ✅ | ✅ | ❌ |
| `DELETE /customers/:id` | ✅ | ✅ | ❌ | ❌ |

### Campañas

| Endpoint | TENANT_ADMIN | MANAGER | MARKETING | Resto |
|----------|:------------:|:-------:|:---------:|:-----:|
| `GET /campaigns` | ✅ | ✅ | ✅ | ❌ |
| `POST /campaigns` | ✅ | ✅ | ✅ | ❌ |
| `POST /campaigns/:id/send` | ✅ | ✅ | ✅ | ❌ |
| `GET /campaigns/:id/preview` | ✅ | ✅ | ✅ | ❌ |
| `PATCH /campaigns/:id` | ✅ | ✅ | ✅ | ❌ |
| `DELETE /campaigns/:id` | ✅ | ✅ | ❌ | ❌ |

---

## Navegación lateral (sidebar) por rol

| Sección | Item | Roles que lo ven |
|---------|------|-----------------|
| PLATAFORMA | Empresas | SUPERADMIN |
| OPERACIONES | Dashboard | TENANT_ADMIN, MANAGER, HOST, SERVER, KITCHEN, BAR, MARKETING |
| OPERACIONES | Mis Locales | TENANT_ADMIN, MANAGER |
| OPERACIONES | Menú | TENANT_ADMIN, MANAGER, KITCHEN, BAR |
| OPERACIONES | Reservas | TENANT_ADMIN, MANAGER, HOST |
| OPERACIONES | Pedidos | TENANT_ADMIN, MANAGER, HOST, SERVER, KITCHEN, BAR |
| OPERACIONES | KDS | TENANT_ADMIN, MANAGER, KITCHEN, BAR |
| CRM | Eventos | TENANT_ADMIN, MANAGER, MARKETING |
| CRM | Clientes | TENANT_ADMIN, MANAGER, MARKETING |
| CRM | Campañas | TENANT_ADMIN, MANAGER, MARKETING |
| CRM | Listas | TENANT_ADMIN, MANAGER, MARKETING |
| GESTIÓN | Configuración | TENANT_ADMIN, MANAGER |
| GESTIÓN | Usuarios | TENANT_ADMIN |

---

## Modelo de usuario (MongoDB)

```
User {
  email            string    (único, requerido)
  password         string    (hash bcrypt)
  name             string
  role             UserRole  (default: 'SERVER')
  tenantId         ObjectId  (ref: Tenant, indexed)
  localIds         ObjectId[] (ref: Local — multilocal)
  isActive         boolean   (default: true)
  mustChangePassword boolean (default: false)
  resetPasswordCode  string
  resetPasswordExpires Date
}
```

---

## Flujos de seguridad

### Contraseña temporal
1. TENANT_ADMIN crea un usuario → se genera password `Tmp@<8hex>`
2. El campo `mustChangePassword: true` queda en el documento del usuario
3. Al iniciar sesión, el JWT incluye `mustChangePassword: true`
4. `authGuard` intercepta cualquier ruta y redirige a `/change-password`
5. El usuario establece su nueva contraseña → backend resetea el flag → emite nuevo JWT
6. La sesión se actualiza y el usuario navega normalmente

### Multitenancy
- Todos los recursos (locales, menú, pedidos, usuarios, CRM) están filtrados por `tenantId`
- Un usuario solo puede ver/modificar datos de su propio tenant
- SUPERADMIN no tiene `tenantId` — accede cross-tenant solo en endpoints específicos

### Jerarquía de guards (frontend)
```
authGuard (¿autenticado? ¿mustChangePassword?)
  └─ roleGuard (¿rol correcto para esta ruta?)
```

### Jerarquía de validación (backend)
```
JwtAuthGuard (¿token válido?)
  └─ assertRole() (¿rol permitido?)  ← SUPERADMIN siempre pasa
    └─ tenantId scope (¿recurso del mismo tenant?)
```

### Credencial inicial SUPERADMIN
- Email: `admin@bar.com`
- Password: `B4r$uper#2026!`
- Creado automáticamente en bootstrap si no existe
