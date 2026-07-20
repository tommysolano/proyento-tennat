# Guía de usuario — Plataforma CRM + WhatsApp

> Manual completo del sistema, **rol por rol**: qué puede hacer cada usuario, cómo lo hace y
> **dónde hacer clic** (los nombres de menú son exactamente los que aparecen en la barra lateral).
> Incluye los flujos nuevos: conectar WhatsApp (QR y API), plantillas, **automatizaciones que
> envían mensajes**, respuestas automáticas por palabra clave, recordatorios y envío masivo.
>
> Cómo leerlo: ve directo a **tu rol** (sección 3). Los procedimientos transversales (WhatsApp,
> plantillas, workflows, chat) están en la sección 4 y se enlazan desde cada rol.

## Índice

1. [Conceptos básicos](#1-conceptos-básicos)
2. [Roles: quién es quién](#2-roles-quién-es-quién)
3. [Guía por rol](#3-guía-por-rol)
   - [3.1 SUPERADMIN](#31-superadmin-dueño-de-la-plataforma)
   - [3.2 DISTRIBUIDOR](#32-distribuidor-revende-a-empresas)
   - [3.3 ADMIN de empresa](#33-admin-de-empresa)
   - [3.4 SUPERVISOR](#34-supervisor)
   - [3.5 CALLCENTER (Agente)](#35-callcenter-agente)
4. [Procedimientos transversales (paso a paso)](#4-procedimientos-transversales)
   - [4.1 Iniciar sesión](#41-iniciar-sesión-y-primeros-pasos)
   - [4.2 Conectar WhatsApp por QR](#42-conectar-whatsapp-por-qr-baileys)
   - [4.3 Conectar WhatsApp por API (Cloud/Meta)](#43-conectar-whatsapp-por-api-cloudmeta)
   - [4.4 Plantillas de WhatsApp (HSM)](#44-plantillas-de-whatsapp-hsm)
   - [4.5 El Inbox (chat)](#45-el-inbox-conversaciones)
   - [4.6 Contactos, oportunidades y pipeline](#46-crm-contactos-oportunidades-y-pipeline)
   - [4.7 Calendario y citas](#47-calendario-y-citas)
   - [4.8 Workflows (automatizaciones)](#48-workflows-automatizaciones)
   - [4.9 Envío masivo (difusión)](#49-envío-masivo-difusión)
   - [4.10 Marketing: formularios, landing, funnels](#410-marketing-formularios-landing-pages-funnels)
   - [4.11 Reputación: reseñas, cupones, referidos](#411-reputación-reseñas-cupones-referidos)
   - [4.12 Consentimiento y "no molestar" (DND)](#412-consentimiento-opt-out-y-dnd)
5. [Preguntas frecuentes y errores comunes](#5-preguntas-frecuentes)

---

## 1. Conceptos básicos

- **Empresa (tenant):** cada empresa cliente tiene sus propios contactos, chats, plantillas,
  workflows y números de WhatsApp. Nada se comparte entre empresas.
- **Módulos:** funciones que el plan de la empresa tiene habilitadas (WhatsApp, CRM, Calendario,
  Automatizaciones, Reputación…). Si un módulo está apagado, su menú no aparece y sus pantallas
  responden "no disponible". Quien activa módulos: el **Distribuidor** (o Superadmin).
- **Permisos:** dentro de una empresa, cada usuario tiene un rol con permisos. Ej.: un agente puede
  responder chats pero no borrar la conexión de WhatsApp.
- **Barra lateral (sidebar):** el menú de la izquierda cambia según tu rol. Este manual usa esos
  nombres exactos (ej. *Inbox y comunicación → Conversaciones*).
- **Estados de un mensaje saliente:** `en cola → enviado → entregado → leído`, o `fallido` /
  `bloqueado` (bloqueado = una regla de consentimiento/horario lo detuvo).

---

## 2. Roles: quién es quién

| Rol | Es | Ve principalmente | Alcance |
|---|---|---|---|
| **SUPERADMIN** | Dueño de la plataforma | Distribuidores, planes, módulos, facturación global, auditoría | Toda la plataforma |
| **DISTRIBUTOR** | Revende la plataforma a empresas | Sus empresas, planes, suscripciones, módulos, facturación, marca | Sus empresas |
| **ADMIN** | Dueño/administrador de una empresa | Todo lo de su empresa: inbox, CRM, WhatsApp, workflows, marketing, usuarios | Su empresa |
| **SUPERVISOR** | Jefe de equipo dentro de la empresa | Inbox del equipo, CRM, workflows, marketing, reputación, métricas de agentes | Su equipo |
| **CALLCENTER** | Agente / vendedor | Su inbox, sus contactos, sus tareas, su calendario | Lo asignado a él |

> La jerarquía de creación es: Superadmin → crea Distribuidores → cada Distribuidor crea Empresas y
> su ADMIN → el ADMIN crea Supervisores y Agentes (Callcenter).

---

## 3. Guía por rol

### 3.1 SUPERADMIN (dueño de la plataforma)

**Menú (sidebar):**
- **Inicio → Dashboard** (`/superadmin`): visión global de la plataforma.
- **Plataforma → Distribuidores**: alta/edición de distribuidores.
- **Plataforma → Planes de plataforma**: los planes que vendes a los distribuidores.
- **Plataforma → Módulos**: qué módulos existen y su disponibilidad.
- **Plataforma → Suscripciones / Facturación**: cobros a distribuidores.
- **Operación global → Operaciones** (`/ops`): salud del sistema, jobs, alertas.
- **Operación global → Auditoría**: registro de acciones sensibles.

**Tareas típicas:**
1. **Crear un distribuidor:** *Plataforma → Distribuidores → botón "Nuevo distribuidor"* → nombre,
   email del responsable, plan de plataforma → Guardar.
2. **Definir un plan de plataforma:** *Plataforma → Planes de plataforma → "Nuevo plan"* → nombre,
   precio, límites (contactos, mensajes, workflows) → Guardar.
3. **Habilitar/ver módulos:** *Plataforma → Módulos* → activar o revisar qué módulos están
   disponibles para asignar en los planes.
4. **Vigilar la salud:** *Operación global → Operaciones* → revisa jobs fallidos y alertas
   (webhooks, envíos). Aquí se detecta, por ejemplo, si el procesador de trabajos (JobWorker) está
   caído (síntoma: los mensajes no salen).

---

### 3.2 DISTRIBUIDOR (revende a empresas)

**Menú (sidebar):**
- **Inicio → Dashboard** (`/distributor/dashboard`).
- **Empresas y clientes → Empresas**: tus empresas cliente.
- **Empresas y clientes → Administradores**: los usuarios ADMIN de tus empresas.
- **Comercial → Planes comerciales / Suscripciones / Módulos autorizados**.
- **Facturación → Resumen financiero / Facturas / Pagos / Mi plataforma**.
- **Configuración → Marca / Preferencias / Onboarding**.

**Tareas típicas:**
1. **Dar de alta una empresa cliente:** *Empresas y clientes → Empresas → "Nueva empresa"* →
   nombre, datos, **plan comercial** → Guardar. Al crearla se genera su primer usuario **ADMIN**.
2. **Activar módulos a una empresa (¡clave!):** *Comercial → Módulos autorizados* → selecciona la
   empresa → activa **WhatsApp, Conversaciones (Inbox), CRM, Calendario, Automatizaciones/Workflows,
   Reputación**, etc. **Sin el módulo "WhatsApp" activo, la empresa no puede conectar números ni
   enviar.**
3. **Crear/editar planes comerciales:** *Comercial → Planes comerciales* → define límites y precio.
4. **Cobrar:** *Facturación → Facturas / Pagos*.
5. **Marca blanca:** *Configuración → Marca* → logo y colores que verán sus empresas.

> Checklist para que una empresa nueva pueda usar WhatsApp: (a) plan con módulos WhatsApp + Inbox +
> CRM + Automatizaciones activos; (b) el ADMIN de la empresa conecta el número (sección 4.2/4.3).

---

### 3.3 ADMIN de empresa

Es el rol más completo dentro de una empresa. **Menú (sidebar):**

- **Inicio → Dashboard** (`/admin/dashboard`): resumen de la empresa. Desde aquí, por pestañas
  (hash), se gestiona: **Usuarios**, **Roles y permisos**, **Plan contratado**, **Facturación**,
  **Configuración**, **Onboarding**.
- **Inbox y comunicación:** Conversaciones, Notificaciones, **Plantillas**, **Routing**, **Números
  de WhatsApp**, **Canales (avanzado)**, **Consentimiento y DND**.
- **CRM:** Resumen CRM, Contactos, Oportunidades, Pipeline, Tareas, Segmentos.
- **Calendario y reservas:** Calendario, Citas.
- **Automatización:** **Workflows**, **Ejecuciones**.
- **Marketing:** Resumen, Formularios, Landing pages, Funnels, Campañas, Integraciones, Respuestas,
  Analytics, Reportes.
- **Reputación:** Reseñas, Solicitudes, Testimonios, Widgets, Encuestas, Cupones, Referidos.
- **Administración (⚙):** Usuarios, Roles y permisos, Plan, Facturación, Operaciones, Configuración,
  Onboarding, **Calendario (ajustes)**, **Tags**, **Campos personalizados**, **Pipelines**,
  **Importar contactos**.

**Puesta en marcha recomendada (primer día):**
1. **Crear el equipo:** *Dashboard → pestaña Usuarios* → "Invitar/Crear usuario" → elige rol
   (SUPERVISOR o CALLCENTER), email y contraseña. → sección 4.1.
2. **Ajustar permisos si hace falta:** *Dashboard → Roles y permisos*.
3. **Conectar WhatsApp:** *Inbox y comunicación → Números de WhatsApp* (QR, sección 4.2) o
   *Canales (avanzado)* (API/Meta, sección 4.3).
4. **Cargar contactos:** *Administración → Importar contactos* (sección 4.6).
5. **Crear plantillas:** *Inbox y comunicación → Plantillas* (sección 4.4).
6. **Montar automatizaciones:** *Automatización → Workflows* (sección 4.8).
7. **(Opcional) Reglas de reparto:** *Inbox y comunicación → Routing* → a qué agente cae cada chat.

Todo el detalle de cada tarea está en la **sección 4**.

---

### 3.4 SUPERVISOR

Coordina al equipo. No administra la conexión de WhatsApp ni la facturación, pero sí opera el día a
día y las automatizaciones/marketing. **Menú (sidebar):**

- **Inicio → Supervisión** (`/supervisor/dashboard`): con pestañas **Agentes**, **Actividad**,
  **Métricas**.
- **Trabajo diario:** Inbox del equipo, Contactos del equipo, Oportunidades, Pipeline del equipo,
  Tareas, Calendario del equipo, Notificaciones.
- **Automatización y marketing:** Workflows, Ejecuciones, Formularios, Respuestas, Funnels,
  Campañas, Integraciones, Reportes.
- **Reputación:** Resumen, Reseñas del equipo, Solicitudes, Cupones, Referidos.

**Tareas típicas:**
1. **Ver la carga del equipo:** *Inicio → Supervisión → Agentes* → quién tiene más chats/tareas.
2. **Reasignar un chat:** *Trabajo diario → Inbox del equipo* → abre la conversación → menú de
   asignación → elige agente.
3. **Vigilar el pipeline:** *Trabajo diario → Pipeline del equipo* → arrastra oportunidades entre
   etapas.
4. **Crear/activar un workflow:** *Automatización y marketing → Workflows* (sección 4.8).
5. **Medir:** *Automatización y marketing → Reportes* y *Inicio → Supervisión → Métricas*.

> El Supervisor **no** ve "Números de WhatsApp" ni "Plantillas" (eso es del ADMIN). Si necesita una
> plantilla nueva, la pide al ADMIN.

---

### 3.5 CALLCENTER (Agente)

El vendedor/agente que atiende y da seguimiento. **Menú (sidebar):**

- **Inicio → Mi dashboard** (`/callcenter/dashboard`): pestañas **Gestión de contacto** y
  **Actividad**.
- **Trabajo diario:** **Mi inbox**, Mis contactos, **Seguimientos** (contactos con seguimiento
  para hoy), Mis oportunidades, Mis tareas, Mi calendario, Notificaciones.
- **Reputación:** Solicitar reseña, Mis reseñas, Cupones.

**Tareas típicas (lo que hará el 90% del tiempo):**
1. **Responder chats:** *Trabajo diario → Mi inbox* → clic en una conversación → escribe abajo →
   Enter para enviar. Adjuntar archivo con el clip 📎; insertar una plantilla con el botón de
   plantillas. → sección 4.5.
2. **Registrar/editar un contacto:** *Mis contactos* → clic en el contacto → edita datos, teléfono,
   email, etiqueta. → sección 4.6.
3. **Crear una oportunidad de venta:** desde el chat o desde *Mis oportunidades → "Nueva"*.
4. **Agendar una cita:** *Mi calendario* → clic en un hueco → completa cliente, servicio, hora →
   Guardar. → sección 4.7.
5. **Cerrar el día:** *Seguimientos* → contacta a los que tienen seguimiento hoy; *Mis tareas* →
   marca completadas.

> Un agente **solo ve lo asignado a él**. Si un chat no aparece, es porque está asignado a otra
> persona (pídeselo al Supervisor).

---

## 4. Procedimientos transversales

### 4.1 Iniciar sesión y primeros pasos

1. Abre la URL de la aplicación en el navegador.
2. En la pantalla de acceso escribe tu **email** y **contraseña** → botón **Entrar**.
3. Entrarás a **tu** dashboard según tu rol. Arriba a la derecha (Header) están tu nombre, las
   **notificaciones** (campana) y **Cerrar sesión**.
4. **Crear un usuario nuevo** (solo ADMIN): *Dashboard → pestaña Usuarios → "Crear usuario"* →
   nombre, email, contraseña temporal, **rol** (SUPERVISOR / CALLCENTER) → Guardar. Comparte esas
   credenciales con la persona; podrá cambiarlas luego.

### 4.2 Conectar WhatsApp por QR (Baileys)

> Método rápido (como WhatsApp Web): escaneas un QR con el teléfono. Ideal para empezar. Requisito:
> el Distribuidor debe tener activado el módulo **WhatsApp**, y la plataforma debe tener
> `WHATSAPP_QR_ENABLED=true` (lo configura el técnico/superadmin en el servidor).

Pasos (rol **ADMIN**):
1. Ve a **Inbox y comunicación → Números de WhatsApp**.
2. Clic en **"Nuevo / Conectar por QR"** (panel de sesiones QR) → ponle un **nombre** (ej.
   "Recepción") → Crear.
3. En la tarjeta de esa sesión, clic en **"Conectar"** / **"Ver QR"**. Aparecerá un **código QR**.
4. En el teléfono: **WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo** →
   escanea el QR de la pantalla.
5. El estado pasará por *Generando QR → Sincronizando → Conectado*. Cuando diga **Conectado** ya
   puedes recibir y enviar desde el Inbox.
6. Si el QR expira (dura ~60 s), pulsa **"Regenerar QR"**.

Gestión posterior (misma pantalla): **Desconectar** (pausa sin borrar la sesión), **Cerrar sesión /
Desvincular** (borra la autenticación; habrá que re-escanear), **Diagnóstico** (estado técnico).

> Notas importantes de QR:
> - El número **no admite plantillas de Meta**: por QR se envía **texto libre** (y en las
>   automatizaciones, si usas una plantilla, se manda su texto renderizado).
> - Si desvinculas desde el teléfono, el sistema lo detecta y marca la sesión como desconectada.
> - Mantén una sola conexión activa por número.

### 4.3 Conectar WhatsApp por API (Cloud/Meta)

> Método oficial de Meta (WhatsApp Business Cloud API). Permite **plantillas aprobadas** y mayor
> estabilidad. Requiere una cuenta de Meta Business, un número dado de alta en Meta y credenciales.

Pasos (rol **ADMIN**):
1. Ve a **Inbox y comunicación → Canales (avanzado)**.
2. Clic en **"Nuevo canal" → WhatsApp Cloud API**. Completa:
   - **Phone Number ID** (ID del número, lo da Meta).
   - **WhatsApp Business Account ID (WABA)** — campo "externalBusinessId".
   - **Access Token** (token permanente del sistema; se guarda **cifrado**).
   - **Verify Token** (una palabra que tú inventas; la usarás en el webhook).
   - **App Secret** (secreto de la app de Meta, para validar la firma de los webhooks).
3. Guarda. El sistema te mostrará la **URL de Webhook** con esta forma:
   `https://TU-SERVIDOR/api/webhooks/whatsapp/<ID-DEL-CANAL>`.
4. En **Meta (developers.facebook.com) → tu App → WhatsApp → Configuration → Webhooks**: pega esa
   URL y el **Verify Token**; suscríbete a los campos **messages**,
   **message_template_status_update** y **phone_number_quality_update**.
5. Vuelve a la plataforma y pulsa **"Probar conexión"** (testConnection). Si es correcta, verás el
   número verificado y el estado **Conectado**.
6. Marca el número como **predeterminado** ("número por defecto") si es el que usarán las campañas y
   automatizaciones.

> A partir de aquí, los mensajes entrantes crean contactos y conversaciones automáticamente, y
> puedes registrar **plantillas** (sección 4.4).

### 4.4 Plantillas de WhatsApp (HSM)

> Las plantillas son mensajes pre-aprobados por Meta. Son **obligatorias** para escribirle a alguien
> **fuera de la ventana de 24 h** (cuando el cliente no te ha escrito recientemente). Solo aplican a
> números **Cloud API**.

Crear y aprobar una plantilla (rol **ADMIN**), en **Inbox y comunicación → Plantillas**:
1. Clic en **"Nueva plantilla"**.
2. Rellena:
   - **Nombre** (se normaliza a `snake_case`, ej. `confirmacion_cita`).
   - **Idioma** (ej. `es`), **Categoría** (MARKETING / UTILITY / AUTHENTICATION).
   - **Cuerpo**: el texto. Usa variables con `{{1}}`, `{{2}}`… o nombradas `{{nombre}}`.
   - **Ejemplos de variables** (Meta los exige): un valor de muestra por variable.
   - **(Opcional) Cabecera**: texto, o **imagen/documento/video** (pega la **URL pública** del
     archivo). La imagen debe ser **JPG/PNG**; documento **PDF**; video **MP4**.
   - **(Opcional) Pie** y **Botones** (máx. 3: respuesta rápida, URL o teléfono).
3. Guarda (queda en estado **borrador**).
4. Clic en **"Enviar a Meta"** (registrar). El sistema **sube el archivo de cabecera a Meta** y
   registra la plantilla. Pasará a **pendiente**.
5. Cuando Meta la revise, el estado cambiará solo a **aprobada** (o **rechazada**, con el motivo).
   También puedes pulsar **"Sincronizar"** para refrescar el estado manualmente.
6. Una plantilla **aprobada** ya se puede usar en el chat, en workflows y en envíos masivos.

> Si Meta recategoriza tu plantilla a MARKETING, el sistema te avisa (impacta el costo por mensaje).

### 4.5 El Inbox (conversaciones)

En **Inbox y comunicación → Conversaciones** (ADMIN) / **Inbox del equipo** (Supervisor) / **Mi
inbox** (Agente):

- **Lista de chats** (izquierda): buscador, filtros (abiertos, sin asignar, míos…), y el
  contador de **no leídos**.
- **Conversación** (centro): historial de mensajes con estado de entrega (✓ enviado, ✓✓ entregado,
  ✓✓ azul leído). Abajo, el **compositor**:
  - Escribe y pulsa **Enter** para enviar (Shift+Enter = salto de línea).
  - **📎 Adjuntar**: imagen, documento, audio (nota de voz), video.
  - **Botón de plantillas**: inserta una plantilla aprobada (necesario fuera de las 24 h).
  - **Nota interna**: escribe una nota que **solo ve tu equipo** (no le llega al cliente).
- **Panel del contacto** (derecha): datos, etiquetas, oportunidad asociada, asignación. Desde aquí
  puedes **asignar el chat** a un agente, **etiquetar**, **crear tarea** o **crear oportunidad**.

Reglas útiles:
- El **no leído** de un chat **no** se borra al abrirlo; se borra cuando **respondes** (para no
  perder pendientes).
- Si intentas escribir texto libre y el cliente no te ha escrito en 24 h, el sistema **bloqueará**
  el mensaje y te pedirá usar una **plantilla**.
- Si el contacto pidió baja (escribió "STOP/BAJA") o no dio consentimiento, el envío se **bloquea**
  con el motivo.

### 4.6 CRM: contactos, oportunidades y pipeline

**Contactos** (*CRM → Contactos* / *Mis contactos*):
- **Crear:** botón **"Nuevo contacto"** → nombre, teléfono (con código de país), email, etiquetas,
  etapa de ciclo de vida → Guardar.
- **Importar en lote** (ADMIN): *Administración → Importar contactos* → sube un **CSV/Excel**,
  mapea las columnas (nombre, teléfono, email…) → Importar. La importación corre en segundo plano.
- **Ficha del contacto:** clic en un contacto → pestañas de actividad, conversaciones, notas,
  oportunidades, tareas. Botón **"Asignar"** para dárselo a un agente.
- **Etiquetas y campos personalizados** (ADMIN): *Administración → Tags* y *Campos personalizados*.

**Oportunidades** (*CRM → Oportunidades*): cada oportunidad es una venta potencial ligada a un
contacto, con **valor**, **etapa** y **pipeline**. Crear con **"Nueva oportunidad"**.

**Pipeline** (*CRM → Pipeline*): tablero **Kanban**. Arrastra las tarjetas entre columnas
(`nuevo → contactado → … → ganado/perdido`). Configurar las etapas: *Administración → Pipelines*
(ADMIN).

**Segmentos** (*CRM → Segmentos*): guarda grupos de contactos por criterios; se usan para el envío
masivo por etiqueta (sección 4.9).

### 4.7 Calendario y citas

En **Calendario** (todos los roles operativos) / ajustes en *Administración → Calendario* (ADMIN):
- **Agendar una cita:** clic en un hueco del calendario → elige **contacto/cliente**, **servicio**,
  **fecha y hora**, **responsable** → Guardar. La cita queda `programada`.
- **Confirmar / reprogramar / cancelar:** abre la cita → cambia su estado.
- **Recordatorios:** al crear la cita puedes fijar un **recordatorio** (X minutos antes). El
  recordatorio dispara un evento que una **automatización** puede usar para enviar un WhatsApp real
  al cliente (ver 4.8, ejemplo de recordatorio).
- **Enlaces de reserva pública** (ADMIN): permiten que un cliente reserve solo, desde una URL.

### 4.8 Workflows (automatizaciones)

> El corazón de la automatización: "cuando pase X, haz Y". Ahora los workflows **pueden enviar
> WhatsApp, plantillas y email**, esperar la respuesta del cliente y bifurcar según lo que conteste.

Dónde: **Automatización → Workflows** (ADMIN y SUPERVISOR). Para ver qué ha ejecutado cada uno:
**Automatización → Ejecuciones**.

**Crear un workflow:**
1. Clic en **"Nuevo workflow"**. Ponle **nombre**.
2. **Disparador (Trigger):** elige el evento que lo inicia. Ejemplos:
   - `Contacto creado`, `Etapa de oportunidad cambiada`, `Cita creada`,
     `Recordatorio de cita enviado`, `Mensaje inbound recibido`, `Formulario enviado`,
     `Reseña negativa recibida`, etc.
3. **(Opcional) Condiciones:** filtros para que solo actúe en ciertos casos. Se escriben con
   `campo` + `operador` + `valor`, sobre `event.*`, `entity.*` o `payload.*`. Ejemplos:
   - `payload.textNormalized` `contains` `hola` → dispara solo si el mensaje entrante contiene
     "hola" (matching por **palabra clave**; el texto ya llega en minúsculas y sin acentos).
   - `entity.status` `equals` `nuevo`.
4. **Acciones (en orden):** pulsa **"Añadir acción"**, elige el tipo y rellena su **configuración
   (en formato JSON)**. Acciones disponibles:

   | Acción | Qué hace | Config (JSON) ejemplo |
   |---|---|---|
   | `whatsapp.send` | Envía **texto o media** por WhatsApp al contacto | `{ "text": "Hola {{entity.name}}, gracias por escribir" }` |
   | `whatsapp.send_template` | Envía una **plantilla aprobada** | `{ "templateId": "<id>", "variables": { "1": "{{entity.name}}" } }` |
   | `email.send` | Envía un **email** (si hay proveedor configurado) | `{ "to": "{{entity.email}}", "subject": "Hola", "body": "<b>Hola</b>" }` |
   | `delay.wait_minutes` | Espera N minutos | `{ "minutes": 60 }` |
   | `delay.wait_until` | Espera hasta una fecha | `{ "until": "{{entity.startAt}}" }` |
   | `delay.wait_reply` | **Pausa hasta que el contacto responda** (o venza el timeout) | `{ "timeoutMinutes": 1440 }` |
   | `contact.add_tag` / `remove_tag` | Etiqueta el contacto | `{ "tagId": "<id>" }` |
   | `contact.update_status` / `..._lifecycle_stage` / `..._priority` | Cambia campos del contacto | `{ "status": "contactado" }` |
   | `contact.assign_user` | Asigna el contacto a un usuario | `{ "userId": "<id>" }` |
   | `opportunity.move_stage` / `mark_won` / `mark_lost` | Mueve o cierra la oportunidad | `{ "stageId": "<id>" }` |
   | `task.create` | Crea una tarea | `{ "title": "Llamar a {{entity.name}}", "userId": "<id>" }` |
   | `conversation.assign_user` / `close` / `add_internal_note` | Gestiona el chat | `{ "text": "Seguimiento hecho" }` |
   | `notification.create` / `alert.create` | Avisa a un usuario / crea alerta | `{ "title": "Nuevo lead" }` |

   > Variables: dentro de cualquier texto puedes usar `{{entity.campo}}` (datos de la entidad del
   > evento, p.ej. `{{entity.name}}`, `{{entity.startAt}}`), `{{payload.campo}}` (datos del evento,
   > p.ej. `{{payload.textNormalized}}`) o `{{event.campo}}`.
5. **Ajustes** (engranaje del workflow): "detener si una acción falla", "ejecutar una vez por
   entidad", "enfriamiento", "máximo por día". Por defecto se detiene ante un error real, pero un
   mensaje **bloqueado por consentimiento** NO cuenta como error (se registra como *omitido* y el
   flujo sigue).
6. **Activa** el workflow (interruptor **Activo**). Solo los activos se disparan.

**Ejemplo A — Bienvenida automática:**
Trigger `Contacto creado` → acción `whatsapp.send` con `{ "text": "¡Hola {{entity.name}}! Gracias
por contactarnos, ¿en qué te ayudamos?" }`.

**Ejemplo B — Bot de confirmación (sí/no):**
Trigger `Contacto creado` →
`whatsapp.send` `{ "text": "¿Confirmas tu cita? Responde sí o no" }` →
`delay.wait_reply` `{ "timeoutMinutes": 720 }` →
condición `payload.lastReply` `equals` `yes` →
`whatsapp.send` `{ "text": "¡Perfecto, te esperamos!" }`.
(Cuando el cliente responde, el sistema clasifica su respuesta en `payload.lastReply` =
`yes` | `no` | `other`.)

**Ejemplo C — Respuesta por palabra clave:**
Trigger `Mensaje inbound recibido` → condición `payload.textNormalized` `contains` `precio` →
`whatsapp.send` `{ "text": "Nuestros precios son…" }`.

**Ejemplo D — Recordatorio de cita real por WhatsApp:**
Trigger `Recordatorio de cita enviado` → acción `whatsapp.send_template` con la plantilla de
recordatorio y `{ "templateId": "<id>", "variables": { "1": "{{entity.title}}", "2": "{{entity.startAt}}" } }`.

**Diagnóstico:** en **Ejecuciones** ves cada corrida, sus acciones y por qué una se omitió o falló
(sin ventana de 24 h, contacto sin teléfono, plantilla no aprobada, canal desconectado…).

### 4.9 Envío masivo (difusión)

> Enviar una **plantilla aprobada** a muchos contactos a la vez, con **goteo** (para no saturar el
> número). Cada envío respeta el consentimiento/opt-out de cada contacto.

Dónde: **Marketing → Difusión masiva** (`/marketing/broadcasts`), roles **ADMIN** y **SUPERVISOR**
(requiere módulo WhatsApp y permiso de envío).

Paso a paso:
1. En **Nueva difusión** completa:
   - **Nombre** de la difusión.
   - **Plantilla aprobada** (el desplegable solo muestra plantillas de WhatsApp Cloud **aprobadas**;
     si está vacío, primero crea y aprueba una en *Plantillas*, sección 4.4).
   - **Audiencia — etiqueta:** elige una etiqueta (envía a todos los contactos con esa etiqueta), y/o
   - **Audiencia — contactos específicos:** selecciona uno o varios contactos de la lista
     (Ctrl/Cmd para multi-selección).
   - **Ritmo (contactos/minuto):** cuántos envíos por minuto (goteo). Por defecto 60.
   - **(Opcional) Variables de la plantilla (JSON):** ej. `{"1":"Promo de julio","2":"20%"}`.
2. Pulsa **"Previsualizar destinatarios"** para ver a cuántos contactos con teléfono alcanza.
3. Pulsa **"Crear difusión"** → queda como **Borrador**.
4. En la tarjeta de la difusión, pulsa **"Lanzar"** (te pedirá confirmación). Los envíos salen
   escalonados; cada uno pasa por las reglas de consentimiento y la ventana de 24 h (los que no
   cumplan quedan como *omitidos*, no fallan).
5. **Seguimiento en vivo:** la tarjeta muestra una barra de progreso y los contadores
   **Total / Enviados / Omitidos / Fallidos** (se actualizan solos). Puedes **"Cancelar"** una
   difusión en curso (los pendientes se descartan).

> Consejo: para envíos **recurrentes/automáticos** (no una sola ráfaga), usa un **workflow** con
> `whatsapp.send_template` disparado por el evento adecuado (sección 4.8). La Difusión masiva es
> para un envío puntual a una audiencia.

### 4.10 Marketing: formularios, landing pages, funnels

En **Marketing** (ADMIN y SUPERVISOR):
- **Formularios:** *Marketing → Formularios → "Nuevo"* → arrastra campos (nombre, email,
  teléfono…) → **Publicar**. Cada envío crea/actualiza un **contacto** y puede disparar workflows
  (trigger `Formulario enviado`). Respuestas en *Marketing → Respuestas*.
- **Landing pages** (ADMIN): *Marketing → Landing pages → "Nueva"* → editor visual → **Publicar**.
  Se sirve en una URL pública; sus visitas y conversiones alimentan reportes.
- **Funnels:** *Marketing → Funnels* → secuencia de pasos/páginas con seguimiento de conversión.
- **Campañas:** *Marketing → Campañas* → agrupador para **atribución** (presupuesto, formularios,
  landings y funnels asociados). Sirve para medir de dónde vienen los leads.
- **Integraciones / Reportes / Analytics:** conectar fuentes externas y medir resultados.

### 4.11 Reputación: reseñas, cupones, referidos

En **Reputación**:
- **Solicitudes:** *Reputación → Solicitudes → "Nueva solicitud"* (o desde el chat) → envía al
  cliente un enlace para dejar **reseña**.
- **Reseñas:** *Reputación → Reseñas* → aprueba/publica; una reseña negativa puede disparar un
  workflow (trigger `Reseña negativa recibida`) para alertar al equipo.
- **Testimonios / Widgets:** convierte reseñas en **testimonios** y muéstralos en tu web con un
  **widget** embebible.
- **Encuestas (NPS):** *Reputación → Encuestas* → mide satisfacción; un NPS bajo puede disparar un
  workflow.
- **Cupones:** *Reputación → Cupones* → emite y controla el canje de descuentos.
- **Referidos:** *Reputación → Referidos* → programa de "trae un amigo".

### 4.12 Consentimiento, opt-out y DND

En **Inbox y comunicación → Consentimiento y DND** (ADMIN y SUPERVISOR):
- Define el **horario silencioso** (no enviar de noche; se reprograma solo).
- Gestiona **listas de supresión** (contactos que no deben recibir nada).
- El sistema respeta automáticamente: si un cliente escribe **BAJA/STOP/CANCELAR**, se marca su
  opt-out y no volverá a recibir mensajes promocionales.
- Una acción de envío **comercial** requiere consentimiento `opted_in`; si no lo hay, el mensaje se
  **bloquea** (visible en el chat y en el registro del workflow).

---

## 5. Preguntas frecuentes

**"Envié un mensaje pero no salió / quedó en cola."**
Casi siempre es el **procesador de trabajos (JobWorker)** apagado o el **número desconectado**.
Verifica: (ADMIN) *Números de WhatsApp* → estado **Conectado**; (Superadmin) *Operaciones* → jobs.
Requiere `JOB_WORKER_ENABLED=true` en el servidor.

**"No me deja escribir texto libre, me pide una plantilla."**
Es la **ventana de 24 h** de WhatsApp: si el cliente no te ha escrito en las últimas 24 h, solo
puedes iniciar con una **plantilla aprobada** (sección 4.4).

**"El workflow no envió el WhatsApp."**
Mira *Automatización → Ejecuciones*. Motivos comunes: contacto sin teléfono, sin ventana de 24 h y
sin plantilla, plantilla no aprobada, número desconectado, o **falta consentimiento** (se registra
como *omitido*, no como error).

**"No veo el menú de WhatsApp / Plantillas."**
Solo el **ADMIN** ve *Números de WhatsApp*, *Canales* y *Plantillas*. Además el módulo **WhatsApp**
debe estar activado por el **Distribuidor** (sección 3.2).

**"Registrar la plantilla con imagen fallaba."**
Ya está resuelto: el sistema **sube la imagen a Meta** (no solo la URL). Usa **JPG/PNG** para
cabecera de imagen, **PDF** para documento, **MP4** para video.

**"¿Cómo conecto el email para que los workflows manden correos?"**
El técnico configura en el servidor `EMAIL_PROVIDER` (resend/sendgrid), `EMAIL_API_KEY` y
`EMAIL_FROM`. Sin eso, la acción `email.send` se registra como *omitida* (no rompe el flujo).

**"Un agente no ve un chat/contacto."**
Los agentes **CALLCENTER** solo ven lo **asignado a ellos**. El **Supervisor** o **ADMIN** puede
reasignarlo desde el Inbox o la ficha del contacto.

---

*Este manual refleja el sistema tras la implementación de: envío de WhatsApp/plantillas/email desde
workflows, respuestas por palabra clave y espera de respuesta (sí/no), subida real de imágenes de
cabecera a Meta, recordatorios de cita por WhatsApp y el motor de difusión por lista/etiqueta. Para
el detalle técnico de configuración y despliegue, ver `AUDITORIA_CRM_WHATSAPP.md`.*
