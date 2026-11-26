# Control de facturas

Demo privada de recordatorios de facturación. El panel muestra facturas de tres clientes ficticios y permite seguir cada cambio hasta su correo de prueba.

- **n8n** selecciona los avisos vencidos en MongoDB y ejecuta el proceso para cada factura.
- **C# y .NET 10** resuelven la transición, envían el correo, y registran el nuevo estado cuando SMTP acepta el mensaje.
- **React** presenta el estado y el historial. **Mailpit** captura los mensajes.

## Revisar la entrega

1. [Arquitectura y criterios de evaluación](docs/ARQUITECTURA.md)
2. [Despliegue y comprobaciones](docs/DESPLIEGUE.md)

Abre `ControlFacturas.sln` en Visual Studio 2026 para recorrer la API y sus pruebas unitarias. La configuración de los avisos está en [reminders.json](src/Facturas.Api/reminders.json). El flujo de n8n está en [recordatorios.json](n8n/recordatorios.json).

El repositorio, el despliegue y la bandeja de pruebas se comparten con las personas autorizadas para revisar la entrega.
