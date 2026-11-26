# Diseño de la prueba

## Recorrido

`n8n → MongoDB (lectura) → API C# → Mailpit (SMTP) → MongoDB (actualización)`

La interfaz React consulta el resumen de MongoDB a través de la misma API. Las transiciones viven en C#. n8n maneja el disparo y la consulta inicial, con un usuario MongoDB de solo lectura. La API comprueba de nuevo la elegibilidad de cada factura antes de usar su propia credencial de escritura.

En modo de prueba, el identificador de mensaje conecta el historial con una captura efectiva de Mailpit. La API de la bandeja devuelve el texto y los metadatos de los avisos ficticios vinculados. La apertura muestra el contenido y registra la lectura en el buzón de prueba. El acceso de revisión se limita a esa vista y al resumen de facturas.

| Estado actual | Correo de la demo | Estado al aceptar SMTP |
| --- | --- | --- |
| `primerrecordatorio` | La factura pasa a segundo recordatorio. | `segundorecordatorio` |
| `segundorecordatorio` | La factura se desactiva. | `desactivado` |
| `desactivado` | Se omite. | `desactivado` |

`desactivado` es un estado de la factura en la prueba. Los datos son ficticios y el servidor SMTP los guarda en una bandeja de pruebas. La demora entre avisos es configurable. Los datos de arranque incluyen clientes en ambos estados elegibles para demostrar las dos transiciones en una ejecución.

## Decisiones comprobables

- **MongoDB y concurrencia.** Una actualización condicional reserva la factura por identificador, revisión y elegibilidad. Una segunda ejecución con la misma revisión se omite. Al aceptar SMTP, el estado y su entrada de historial se escriben juntos en el mismo documento. El identificador del mensaje conecta el historial con la bandeja.
- **Fallo de envío.** Un fallo confirmado permite reintentar después de una espera. Si la respuesta SMTP se pierde o la escritura posterior queda en duda, la reserva queda para reconciliar. SMTP y MongoDB son sistemas distintos: la aceptación de transporte indica que SMTP recibió el mensaje. En la demo, Mailpit permite buscar el identificador para reconciliar un resultado ambiguo.
- **Extensión.** `reminders.json` contiene la tabla de transiciones, los textos y las demoras. El proveedor SMTP y la persistencia son dependencias del procesador. Las pruebas unitarias pueden usar implementaciones controladas para demostrar qué ocurre entre la reserva, el envío y la escritura.
- **Alcance.** Una solución de Visual Studio, una API, una colección de facturas, una vista de resumen y un flujo importable. El montaje se ejecuta con Compose para que ingeniería pueda repetirlo con sus propias credenciales y datos de prueba.

## Evidencia para los cinco criterios

| Criterio | Dónde revisarlo |
| --- | --- |
| Código limpio y SOLID | Servicio de procesamiento, política de estados y adaptadores de infraestructura en `src/Facturas.Api`. |
| Documentación y arquitectura | Este documento y la guía de despliegue. |
| Pruebas unitarias | `tests/Facturas.Tests`, ejecutable con `dotnet test` o Test Explorer. |
| Inyección de dependencias | Registro de repositorio, SMTP y reloj al arrancar la API. |
| Frontend | `web/`, listado de facturas, estados e historial en React. |

## Operación

La API atiende la lectura del panel y valida una credencial para ejecutar los avisos. El proxy de una demo alojada solo debe publicar la interfaz y sus lecturas. La base, n8n y Mailpit quedan en la red del proyecto o en bucles locales para administración. El entorno de revisión se comparte de forma privada.
