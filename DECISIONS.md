# Decisiones de diseño

## Modelo de datos: DynamoDB, tabla única

| Entidad | PK | SK | GSI1PK / GSI1SK |
|---|---|---|---|
| Solicitud | `TENANT#<filial>` | `REQ#<folio>` | `TENANT#<filial>#ST#<estado>` / `<createdAt>#<folio>` |
| Evento (historial) | `TENANT#<filial>` | `EVT#<folio>#<versión>` | — |
| Contador de folios | `TENANT#<filial>` | `COUNTER` | — |

La solicitud guarda `subject`, `description`, `category`, `status`, `version`, fechas y autor. El folio (`SOL-000123`) es secuencial por filial (contador atómico): es legible y su orden coincide con el de creación. Todo comparte la partición de la filial, así que un cambio de estado y su evento van en una sola transacción.

## 1. Seguimiento con 50.000 solicitudes

**Solución:** cada lectura es un `Query` sobre la partición de la filial, o sobre GSI1 si hay filtro de estado, con `Limit` y un cursor firmado (HMAC) ligado a filial y filtro. Buscar por folio es un `GetItem`. La página 200 responde igual que la primera (p95 menor a 85 ms).
**Descartado:** offset con total exacto, porque recorre los datos. `FilterExpression` por estado, porque lee cientos de ítems para devolver 25.

## 2. El proceso no se respeta

**Solución:** las transiciones son datos (acción → origen, destino y rol) que evalúa la función pura `transition()`, en este orden: cerrada (409), rol (403) y etapa (409). El cambio se guarda con `TransactWriteItems`, condicionado a la `version` leída, lo que cubre también el caso ABA. Si se rechaza, no se escribe nada.
**Descartado:** validar en el frontend, porque se salta. Condicionar solo por el estado, porque no detecta ABA.

## 3. Una filial ve lo de otra

**Solución:** la filial sale solo del JWT firmado y forma parte de la PK. El repositorio no tiene métodos sin filial.
- Si un usuario de filial envía otra filial, se ignora. El analista solo opera las filiales asignadas.
- Una solicitud ajena, inexistente o mal formada recibe el mismo 404, byte a byte.
- Un mismo contrato de pruebas HTTP corre en memoria y contra DynamoDB Local.

**Descartado:** una tabla por filial, porque multiplica la operación. Filtrar después de leer, porque un olvido provoca una fuga. Encabezados de identidad sin firma, porque son falsificables.

## Infraestructura

**Solución:** Terraform con ECS Fargate en subredes privadas detrás de un ALB que solo acepta tráfico de CloudFront; el frontend va en S3 privado con `/api/*` en el mismo dominio. Se usa la misma imagen que en local. Cognito con atributos no editables y el secreto del cursor write-only.
**Descartado:** Lambda, porque Fargate da paridad con local. Páginas de error de CloudFront, porque convertirían el 404 de la API en un 200.

## Supuestos y criterios parciales

- Las 50.000 solicitudes de volumen no traen historial; lo creado por la API sí lo trae.
- El detalle muestra el historial y las acciones que calcula el backend. Va más allá del mínimo, pero demuestra los problemas 2 y 3 sin reglas en el frontend.
- En AWS la API valida tokens de Cognito, pero el frontend sigue usando el login de desarrollo. No hay pantalla de creación (el endpoint existe).

## Mejoras detectadas, no construidas

- Notificar a la filial en cada cambio (Streams → EventBridge → correo).
- Motivo obligatorio al rechazar una solución.
- SLA por etapa.
- Aislamiento también por IAM (`dynamodb:LeadingKeys`).
- Búsqueda por texto (OpenSearch) y conteos por estado.
