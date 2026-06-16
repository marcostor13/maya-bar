# Usuarios de la plataforma — BAR / Maya

> Generado: 2026-05-22 · Fuente: MongoDB `bar-db`

---

## Plataforma (sin tenant)

| Nombre | Email | Rol | Estado |
|--------|-------|-----|--------|
| Super Admin | admin@bar.com | `SUPERADMIN` | Activo |

> Contraseña inicial: `B4r$uper#2026!` — generada en bootstrap si no existe.

---

## Tenant: Restaurantes el Pacífico

| Nombre | Email | Rol | Estado |
|--------|-------|-----|--------|
| Marcos Torres | marcostor13@gmail.com | `TENANT_ADMIN` | Activo |
| Gerencia | gerencia@gmail.com | `MANAGER` | Activo |
| Hostess 1 | hostess@gmail.com | `HOST` | Activo |
| Mesero | mesero@gmail.com | `SERVER` | Activo |
| Cocina | cocina@gmail.com | `KITCHEN` | Activo |
| bar | bar@gmail.com | `BAR` | Activo |
| marketing | marketing@gmail.com | `MARKETING` | Activo |

---

## Resumen

| Rol | Cantidad |
|-----|----------|
| SUPERADMIN | 1 |
| TENANT_ADMIN | 1 |
| MANAGER | 1 |
| HOST | 1 |
| SERVER | 1 |
| KITCHEN | 1 |
| BAR | 1 |
| MARKETING | 1 |
| **Total** | **8** |

---

> Para descripción de permisos por rol ver [permissions.md](permissions.md).
