# AR-PAYROLL - Contexto para Antigravity

## Resumen

Aplicación de gestión laboral y liquidación de sueldos para Argentina. La
arquitectura activa es un monorepo con:

- API Fastify + PostgreSQL.
- PostgreSQL con FORCE RLS y sesiones propias.
- Cliente de escritorio React/Tauri.
- Contratos compartidos con Zod.
- Supabase como base de datos operativa.

El proyecto conserva archivos históricos de una aplicación Next.js, pero el
flujo activo se encuentra en `apps/api`, `apps/desktop`, `packages/contracts` y
`prisma/migrations`.

## Cambios realizados

### Autenticación y usuarios

- Se creó un usuario maestro con rol `OWNER`.
- El OWNER puede listar y crear usuarios desde la sección **Usuarios**.
- Los usuarios nuevos reciben rol `ADMIN` en el espacio de trabajo activo.
- Se agregó registro público separado por espacio:
  - `CR. Alejandro Leal` (`estudio-papa`)
  - `CR. Jorge Lopez` (`estudio-socio`)
- El registro solicita nombre, apellido, usuario y contraseña.
- El login acepta correo electrónico o nombre de usuario.
- Las contraseñas se almacenan con scrypt; nunca deben guardarse en el código,
  documentación o respuestas.
- La interfaz muestra `Hola Cr. Nombre Apellido` luego del login.

### Aislamiento de información

- Cada usuario tiene membresías por espacio de trabajo.
- Las consultas usan sesiones firmadas y contexto RLS.
- Papá y socio no pueden consultar datos del otro espacio.
- La conexión de ejecución usa el rol `app_tenant_user`, sin `BYPASSRLS`.
- `DATABASE_ADMIN_URL` se usa únicamente para migraciones administrativas.
- Las conexiones y secretos se mantienen en `.env`, que no debe versionarse.

### Vacaciones

Se agregó el módulo de vacaciones en:

- `apps/api/src/services/employee.service.ts`
- `apps/desktop/src/components/VacationWorkspace.tsx`
- `apps/desktop/src/lib/apiClient.ts`

Reglas implementadas:

- 14, 21, 28 o 35 días corridos según antigüedad.
- Temporada ordinaria del 1 de octubre al 30 de abril.
- Inicio en lunes o día hábil siguiente según corresponda.
- Validación de solapamientos.
- Máximo de **dos períodos de vacaciones por empleado por año**.
- Listado filtrable por empresa y año.

### Limpieza de datos

- Se eliminaron los datos operativos de clientes en Supabase:
  empresas, empleados, vacaciones, liquidaciones, recibos, documentos,
  importaciones y auditoría operativa.
- Se conservaron usuarios, espacios de trabajo, roles y catálogos globales.
- Las cuentas de prueba rápida fueron eliminadas de la base y de la interfaz.

### Navegación

- La primera sección después del login es **Inicio**.
- Se eliminaron las credenciales precargadas y botones de cuentas demo.
- La pantalla inicial tiene dos acciones principales:
  - **Iniciar sesión**
  - **Registrarse**

## Migraciones

Las migraciones se aplican en orden con:

```powershell
npm run db:migrate
```

Migraciones relevantes:

- `0001_initial_schema`: esquema inicial de 41 tablas.
- `0002_rls_and_immutability_triggers`: RLS, sesiones y triggers.
- `0003_vacations_reporting`: índice de vacaciones.
- `0004_supabase_pgcrypto_schema`: compatibilidad HMAC con Supabase.
- `0005_managed_users`: usuarios administrables y usernames.
- `0006_clear_client_data`: limpieza de datos operativos de clientes.
- `0007_registration_and_workspace_names`: registro por espacio, rol ADMIN,
  reparación de membresías y nombres de los espacios.

## Comandos principales

```powershell
npm run dev
npm run dev:api
npm run dev:desktop
npm run db:migrate
npm run build:contracts
npm run build:api
npm run build:desktop
npm run test
```

## Validaciones realizadas

- Build de contratos: correcto.
- Build de API: correcto.
- Build de escritorio: correcto.
- Login del OWNER contra Supabase: `200`.
- Listado de usuarios autenticado: `200`.
- Registro público por espacio: `201`.
- Verificación de rol de aplicación: `bypass_rls=false`.
- Datos operativos principales en Supabase: cero registros después de la
  limpieza.

## Archivos principales

- `apps/api/src/server.ts`: rutas Fastify.
- `apps/api/src/services/auth.service.ts`: autenticación y sesiones.
- `apps/api/src/services/user.service.ts`: usuarios y registro.
- `apps/api/src/services/employee.service.ts`: empleados y vacaciones.
- `apps/desktop/src/App.tsx`: navegación, login, registro y saludo.
- `apps/desktop/src/components/VacationWorkspace.tsx`: interfaz de vacaciones.
- `packages/contracts/src/index.ts`: esquemas compartidos.
- `scripts/create-master-user.ts`: provisionamiento del OWNER.
- `prisma/migrations/`: esquema y cambios de base de datos.

## Notas para continuar

- No volver a agregar credenciales de prueba en la interfaz.
- No conectar la API con el usuario administrador de PostgreSQL; usar el rol
  de aplicación para conservar RLS.
- Para crear usuarios manualmente, seleccionar siempre el espacio correcto.
- Para cambiar reglas de negocio de vacaciones, actualizar la validación del
  servicio y agregar una prueba focalizada.
