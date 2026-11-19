# Mesa de Solicitudes

Aplicación multi-tenant para que las filiales de un centro de servicios compartidos (compras, nómina, contabilidad) registren y sigan sus solicitudes. Resuelve tres problemas:

1. **Seguimiento:** cada filial consulta en cualquier momento el estado de sus solicitudes, también la que tiene 50.000.
2. **Proceso:** ninguna solicitud se salta el flujo *registrada → en atención → resuelta → cerrada*, y quien lo intenta recibe un mensaje que explica por qué.
3. **Confidencialidad:** una filial no puede listar, consultar ni modificar lo de otra, y ni siquiera puede saber si existe.

**Stack:** Node.js 22 + TypeScript (Fastify) · Angular 20 (zoneless, signals) · DynamoDB · Terraform (AWS) · GitHub Actions.
Las decisiones de diseño y el modelo de datos están en [DECISIONS.md](DECISIONS.md).

---

## Cómo correrlo

Requisito: Docker con Compose v2.

```bash
docker compose up --build
```

| Servicio | URL | Qué hace |
|---|---|---|
| Web | http://localhost:4200 | Angular servido por nginx, que además hace proxy de `/api` |
| API | http://localhost:3000/api/health | Fastify |
| DynamoDB Local | http://localhost:8010 | En memoria |

El servicio `init` crea la tabla y carga los datos de prueba antes de levantar la API: **50.000 solicitudes** para *Filial Andina*, en aproximadamente 1 minuto. La primera vez el build de las imágenes tarda unos minutos más. Los puertos se cambian con `WEB_PORT`, `API_PORT` y `DYNAMODB_PORT`.

### Usuarios de demostración

No hay proveedor de identidad en local: en la pantalla inicial eliges un usuario y la API emite un JWT firmado con su filial y su rol.

| Usuario | Rol | Filial | Para qué sirve |
|---|---|---|---|
| Laura | Filial | Andina | 50.000 solicitudes: filtros, búsqueda y paginación con volumen |
| Carlos | Filial | Caribe | 60 solicitudes con historial completo; confirmar o rechazar soluciones |
| Paula | Filial | Pacífico | Sin solicitudes: estado vacío |
| Sofía | Analista | Andina y Caribe | Atender y resolver; no tiene asignada Pacífico |

**Recorrido sugerido:**
1. Entra como **Laura**, filtra por *Resuelta*, busca `123` (se normaliza a `SOL-000123`) y abre el detalle.
2. Entra como **Sofía**, elige *Filial Caribe* y atiende una solicitud *Registrada*.
3. Entra como **Carlos** y confirma o rechaza una solicitud *Resuelta*.

Para ver el estado de error, detén la API (`docker compose stop api`) y pulsa *Reintentar*.

### Cargar datos de prueba

La carga es determinista (siempre genera los mismos datos) e idempotente (si ya existen, no hace nada). `--force` recarga.

```bash
docker compose run --rm init node dist/scripts/seed.js --tenant=andina --count=50000 --force
```

Desde el host, contra el DynamoDB del compose:

```powershell
cd api; npm ci
$env:DYNAMODB_ENDPOINT = "http://localhost:8010"
npm run seed -- --tenant=andina --count=50000
```

### Probar el aislamiento a mano

En PowerShell:

```powershell
$token = (Invoke-RestMethod -Method Post http://localhost:3000/api/dev/token -ContentType application/json -Body '{"userId":"carlos"}').token

curl.exe -s http://localhost:3000/api/requests/SOL-049000 -H "Authorization: Bearer $token"
# {"error":{"code":"REQUEST_NOT_FOUND","message":"La solicitud no existe."}}
# SOL-049000 existe en Andina; Caribe recibe lo mismo que si no existiera.

curl.exe -s "http://localhost:3000/api/requests?limit=1" -H "Authorization: Bearer $token" -H "X-Tenant-Id: andina"
# {"items":[{"tenantId":"caribe", ...
# Para un usuario de filial, la filial la decide el token, no el encabezado.
```

---

## API

Todas las rutas, salvo `/api/health` y `/api/dev/*` (solo en local), exigen `Authorization: Bearer <jwt>`. El analista indica la filial con `X-Tenant-Id`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/requests?status=&limit=&cursor=` | Lista de la filial, más recientes primero → `{ items, nextCursor }` |
| `GET` | `/api/requests/:folio` | Detalle, con las `availableActions` del usuario |
| `GET` | `/api/requests/:folio/history` | Historial de cambios de estado |
| `POST` | `/api/requests` | Registrar `{ subject, description, category }` → queda en `REGISTERED` |
| `POST` | `/api/requests/:folio/actions` | `{ action: START \| RESOLVE \| CONFIRM \| REJECT }` |
| `GET` | `/api/me` | Usuario y filiales |
| `GET/POST` | `/api/dev/users`, `/api/dev/token` | Solo en local: usuarios de prueba y emisión de JWT |

Los errores siempre tienen la forma `{ "error": { "code", "message" } }`:

| HTTP | Código | Cuándo |
|---|---|---|
| 404 | `REQUEST_NOT_FOUND` | No existe **o es de otra filial** (indistinguibles a propósito) |
| 409 | `INVALID_TRANSITION` | Intento de saltarse una etapa |
| 409 | `REQUEST_CLOSED` | La solicitud está cerrada |
| 409 | `CONCURRENT_MODIFICATION` | Otra persona la cambió al mismo tiempo |
| 403 | `ROLE_NOT_ALLOWED` | P. ej. el analista intenta confirmar en nombre de la filial |
| 403 | `TENANT_NOT_ASSIGNED` | El analista pide una filial que no tiene asignada |
| 400 | `VALIDATION_ERROR` / `INVALID_CURSOR` | Parámetros inválidos, o cursor alterado o de otra filial |
| 401 | `UNAUTHENTICATED` | Sin token, o con un token inválido o vencido |

---

## Rendimiento con 50.000 solicitudes

`npm run bench` (en `api/`) mide la API completa por HTTP (JWT + Fastify + DynamoDB), con 50 mediciones por escenario sobre la filial de 50.000 solicitudes:

| Escenario | p50 (ms) | p95 (ms) |
|---|---:|---:|
| Primera página (25, más recientes) | 35.8 | 57.5 |
| Filtro `estado=REGISTERED` | 31.5 | 48.9 |
| Filtro `estado=IN_PROGRESS` | 50.5 | 84.2 |
| Filtro `estado=RESOLVED` | 45.7 | 59.3 |
| Filtro `estado=CLOSED` | 46.2 | 63.9 |
| Página 200 por cursor (~5.000 registros adelante) | 46.8 | 58.8 |
| Buscar por folio | 35.3 | 51.4 |

Entorno: Windows 11, DynamoDB Local 3.3.2 en Docker Desktop y API en Node 22. DynamoDB Local es bastante más lento que el servicio real, así que estas cifras son una cota superior. Lo importante es que **la página 200 cuesta lo mismo que la primera**: ninguna consulta recorre la filial completa.

---

## Pruebas y calidad

| Paquete | Comando | Qué demuestra |
|---|---|---|
| `api` | `npm run lint` | ESLint + `tsc --noEmit` |
| `api` | `npm test` | Máquina de estados (cada regla), casos de uso, identidad, configuración y contrato HTTP con repositorio en memoria (78 pruebas) |
| `api` | `npm run test:int` con `DYNAMODB_ENDPOINT` | **El mismo contrato HTTP y el repositorio contra DynamoDB Local**: aislamiento, transacciones y concurrencia reales (22 pruebas) |
| `web` | `npm run lint` · `npm run test:ci` · `npm run build` | angular-eslint (incluye accesibilidad), y pruebas de la pantalla y del interceptor: lista, vacío, error con reintento, filtro y encabezados (11 pruebas) |
| `infra` | `terraform test` · `terraform plan` | 6 pruebas con AWS simulado y un plan de 51 recursos sin cuenta de AWS |

El pipeline [`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre todo lo anterior en cada PR y en cada push a `develop`/`main`, con DynamoDB Local como *service container*, y además construye las imágenes Docker.

**Dónde está cada criterio:**
- **Proceso:** `api/test/domain/state-machine.test.ts` (una prueba o más por regla) y `api/test/app/request-service.test.ts` (la solicitud queda intacta tras un rechazo; bloqueo optimista).
- **Aislamiento:** `api/test/http/api-contract.ts`, sección "Problema 3": listar, consultar, modificar, historial, cursor ajeno y respuesta idéntica a la de una solicitud inexistente. Corre en memoria y contra DynamoDB.
- **Pantalla:** `web/src/app/requests/requests-page.spec.ts`.

---

## Infraestructura en AWS

```
CloudFront ─┬─ /*      → S3 privado (Angular)
            └─ /api/*  → ALB (solo CloudFront) → ECS Fargate (subredes privadas, 2–6 tareas)
                                                  ├─ DynamoDB (tabla única + GSI1)
                                                  ├─ Secrets Manager (secreto del cursor)
                                                  └─ Cognito (JWKS)
```

Se valida sin cuenta de AWS:

```powershell
cd infra
terraform init -backend=false
terraform test
$env:AWS_ACCESS_KEY_ID = "offline"; $env:AWS_SECRET_ACCESS_KEY = "offline"
terraform plan -var offline_plan=true -refresh=false
```

`offline_plan` solo desactiva las verificaciones de credenciales del provider; no se usa para desplegar.

### Desarrollo sin Docker para la API y la web

```powershell
docker compose up -d dynamodb init
```

En una terminal, la API en `:3000`:

```powershell
cd api; $env:DYNAMODB_ENDPOINT = "http://localhost:8010"; npm run dev
```

En otra terminal, la web en http://localhost:4200, con proxy a `:3000`:

```powershell
cd web; npm start
```

### Si `npm ci` falla en el build con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

Ocurre cuando la red o el antivirus inspecciona TLS. Crea un archivo `.env` con la ruta del certificado raíz, por ejemplo `EXTRA_CA_CERT=C:/ruta/ca.pem`. Se usa como *build secret* y no queda dentro de las imágenes.

---

## Cómo trabajé

Cada parte entró por una rama propia y un Pull Request hacia `develop`, con *merge commit* para que el historial muestre la secuencia. `main` solo recibe versiones estables desde `develop`. Desde el PR del CI, ninguna integración entra sin los checks en verde.

| PR | Paso | Decisión principal |
|---|---|---|
| #1 | Proyecto de la API | TypeScript estricto, Vitest con pruebas unitarias y de integración separadas |
| #2 | Modelo del dominio | Folio legible por filial (`SOL-000123`) y campo `version` para bloqueo optimista |
| #3 | Máquina de estados | El proceso como datos; validación en orden cerrada → rol → etapa |
| #4 | Casos de uso | La filial sale del token; el analista solo opera filiales asignadas (403 claro si no) |
| #5 | Cursor firmado | HMAC ligado a filial y filtro, en lugar de exponer la posición en base64 |
| #6 | Repositorio DynamoDB | Tabla única; GSI por filial y estado en lugar de `FilterExpression` |
| #7 | API HTTP | JWT firmado en lugar de encabezados de identidad; se quitó un comentario opcional que no estaba pedido |
| #8 | Volumen y benchmark | Historial solo para las filiales pequeñas, para mantener la carga en 1 minuto |
| #9–#11 | Frontend | Angular zoneless con signals; token en `sessionStorage`; detalle con historial y acciones |
| #12 | Docker Compose | DynamoDB en memoria (en disco la carga tardaba unos 25 minutos); **ningún secreto fijo en el código** |
| #13 | Infraestructura | Terraform con ECS Fargate, subredes privadas y CloudFront; secreto del cursor write-only |
| #14 | CI | Lint, pruebas, Terraform y build de imágenes en cada PR |

**Lo que cambió al revisar:**
- **Secretos de desarrollo:** al revisar el compose antes de subirlo, encontré secretos de desarrollo escritos en el código. Ahora se generan al arrancar, y en AWS son obligatorios.
- **Errores de CloudFront:** al diseñar CloudFront descarté las páginas de error personalizadas, porque convertían el 404 de una solicitud ajena en un 200 con HTML. Una prueba de Terraform lo impide.

---

## Qué dejé por fuera y por qué

| Fuera de alcance | Por qué |
|---|---|
| Login real en el frontend (Cognito) | En AWS la API ya valida tokens de Cognito y la infraestructura define el user pool; el formulario de login quedó fuera por tiempo. En local se usa el login de desarrollo |
| Pantalla para crear solicitudes | El endpoint existe y está probado; la pantalla pedida es la de seguimiento |
| Búsqueda por texto libre (asunto) | En DynamoDB sería un `Scan` disfrazado. Lo correcto es OpenSearch, desproporcionado para este alcance |
| Conteos por estado ("Resueltas: 1.234") | DynamoDB no cuenta de forma barata; requiere contadores agregados con Streams |
| Notificaciones y motivo obligatorio al rechazar | Son mejoras valiosas, pero el negocio no las pidió (ver DECISIONS.md) |
| Historial para las 50.000 solicitudes de volumen | Duplicaría el tiempo de carga; las filiales pequeñas y lo creado por la API sí tienen historial |
| Persistencia de DynamoDB Local entre reinicios | En disco la carga tarda unos 25 minutos; en memoria 1 minuto, y `init` recarga de forma idempotente |
| Despliegue continuo (CD) y estado remoto de Terraform | El objetivo era validar la infraestructura sin cuenta. El despliegue sería: push de la imagen a ECR, `terraform apply` con backend en S3 y `aws s3 sync` del build |
| SLA, adjuntos y comentarios de conversación | Fuera del núcleo de los tres problemas |
