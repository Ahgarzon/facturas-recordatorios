# Desplegar y verificar

## Arranque reproducible

Requisitos para el entorno completo: Docker con Compose v2 y Node.js 22 o superior para generar el archivo de configuración. Abre `ControlFacturas.sln` con Visual Studio 2026 y el SDK de .NET 10 para editar C# y ejecutar las pruebas en Test Explorer. La instancia completa usa la red y las credenciales de Compose.

Desde la raíz del repositorio:

```sh
node docker/create-env.mjs
docker compose up -d --build
docker compose run --rm n8n-setup
```

El primer comando escribe `.env` con claves aleatorias. Guarda ese archivo en el servidor privado. La clave de cifrado de n8n debe conservarse con su volumen para poder leer sus credenciales. El importador instala el flujo y vincula las dos credenciales de la demo. MongoDB y Mailpit conservan sus datos en volúmenes separados.

| Servicio | Dirección en la máquina que aloja el stack |
| --- | --- |
| Panel y API | `http://127.0.0.1:18080` |
| Editor n8n | `http://localhost:15678` |
| Mailpit | `http://127.0.0.1:18025` |

En el editor n8n, termina el alta inicial del usuario dueño del entorno. Abre **Facturas · Procesar recordatorios** y pulsa **Ejecutar flujo de trabajo**. También puedes ejecutarlo con la CLI:

```sh
docker compose run --rm --no-deps -T n8n execute --id facturasAvisos
```

Para activar la ejecución automática, publica el flujo desde el editor o con la CLI de n8n. El disparador configurado corresponde a las 8:15 a. m. de Colombia. Durante la revisión, se puede conservar en borrador para que las facturas pendientes estén disponibles hasta que alguien dispare la demo.

## Conectar una instancia de n8n existente

Levanta solo los servicios de la aplicación con `docker compose up -d --build mongo mailpit api`. Importa [el flujo](../n8n/recordatorios.json) en tu cuenta de n8n. Para esa instancia, configura:

- Una credencial MongoDB con el usuario `facturas_consulta`, acceso de lectura a `facturas` y una dirección privada que sea alcanzable desde n8n.
- Una credencial HTTP Header Auth con el encabezado `X-Workflow-Key` y el valor `WORKFLOW_KEY` de la configuración privada.
- La URL interna de la API en el nodo **Procesar aviso en C#**. Conserva la ruta `/api/internal/reminders/` y la expresión que añade el identificador de factura.

Ejecuta el disparador manual y abre Mailpit para verificar los avisos. Restringe a la red privada el tráfico desde n8n a MongoDB y a la ruta interna. El panel público de revisión solo necesita las rutas de lectura, con autenticación.

## Revisar el recorrido

Con una instalación nueva y el flujo aún sin ejecutar:

```sh
dotnet test ControlFacturas.sln
node scripts/verify-demo.mjs
```

La comprobación ejecuta n8n dos veces. Verifica tres clientes, el vínculo entre los correos capturados y sus transiciones, y que la segunda ejecución inmediata conserve el historial y la cantidad de correos. La misma comprobación está en GitHub Actions.

También puedes ejecutar el flujo manualmente y comparar el panel con Mailpit. La primera ejecución debe cambiar `FAC-0101` y `FAC-0103` a segundo recordatorio, y `FAC-0102` a desactivado. Las otras facturas quedan como estaban.

## VPS y acceso

Usa un proyecto Compose aislado. Los puertos de administración quedan en `127.0.0.1`. Para revisores, configura TLS y autenticación en el proxy frente al panel y restringe el destino a las rutas de lectura. [El ejemplo de Caddy](../ops/Caddyfile.example) es para un VPS donde ya usas Caddy o donde 80 y 443 están libres. Define `DEMO_DOMAIN` y `DEMO_PASSWORD_HASH` en el entorno privado de Caddy. Genera el hash con `caddy hash-password`. Si el VPS ya tiene otro proxy, aplica las reglas equivalentes en un dominio dedicado.

Conserva n8n y Mailpit en una sesión administrativa privada. Puedes abrirlos mediante un túnel SSH:

```sh
ssh -N -L 15678:127.0.0.1:15678 -L 18025:127.0.0.1:18025 usuario@tu-vps
```

Antes de compartir, comprueba que el panel pide acceso, que carga con una cuenta autorizada y que el proxy bloquea la ruta `/api/internal/`. La API también exige la llave de n8n para procesar facturas.

## Cambios y reversa

Después de editar la política, reconstruye solo la API con `docker compose up -d --build api`. Revisa `/api/statuses` y ejecuta un aviso sobre datos ficticios.

`docker compose down` detiene el entorno y conserva sus datos. Para repetir la primera corrida con datos nuevos, crea otro checkout y genera su propio `.env`. En ese archivo usa valores distintos a los del entorno de revisión:

```dotenv
COMPOSE_PROJECT_NAME=control-facturas-verificacion
APP_PORT=28080
N8N_PORT=25678
MAILPIT_PORT=28025
N8N_EDITOR_BASE_URL=http://localhost:25678
```

Levanta ese stack desde el checkout de verificación. Compose usará otros volúmenes y puertos, y dejará disponibles las facturas iniciales para probar otra vez.

Si una factura queda pendiente de revisión, busca el identificador del mensaje en Mailpit y contrasta el resultado con la reserva de esa factura antes de tocar el estado. Un operador con acceso a MongoDB puede conciliarlo usando el identificador de la reserva y la revisión. Registra la decisión de operación para conservar el historial.
