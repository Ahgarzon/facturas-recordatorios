using System.Text.Json;

namespace Facturas.Api;

public static class DemoInboxEndpoints
{
    public static void AddDemoInbox(this IServiceCollection services, string mailpitUrl)
    {
        if (!Uri.TryCreate(mailpitUrl, UriKind.Absolute, out var baseAddress) ||
            baseAddress.Scheme is not ("http" or "https") || string.IsNullOrWhiteSpace(baseAddress.Host) ||
            baseAddress.AbsolutePath != "/" || baseAddress.UserInfo.Length > 0 ||
            baseAddress.Query.Length > 0 || baseAddress.Fragment.Length > 0)
            throw new InvalidOperationException("Demo__MailpitUrl debe indicar la URL base HTTP de la bandeja de pruebas.");

        services.AddHttpClient<DemoInbox>(client =>
        {
            client.BaseAddress = baseAddress;
            client.Timeout = TimeSpan.FromSeconds(5);
            client.MaxResponseContentBufferSize = 2 * 1024 * 1024;
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
    }

    public static void MapDemoInbox(this RouteGroupBuilder api)
    {
        var inbox = api.MapGroup("/demo-correos");
        inbox.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "private, no-store";
            try
            {
                return await next(context);
            }
            catch (OperationCanceledException) when (!context.HttpContext.RequestAborted.IsCancellationRequested)
            {
                return Results.Problem("La bandeja de pruebas tardó en responder.", statusCode: 504);
            }
            catch (Exception exception) when (exception is HttpRequestException or JsonException or IOException)
            {
                return Results.Problem("La bandeja de pruebas no está disponible.", statusCode: 502);
            }
        });

        inbox.MapGet("", async (DemoInbox service, IInvoiceStore store, CancellationToken cancellation) =>
            Results.Ok(await service.ListAsync(await store.ListAsync(cancellation), cancellation)));

        inbox.MapGet("/{id}", async (string id, DemoInbox service, IInvoiceStore store, CancellationToken cancellation) =>
        {
            var message = await service.OpenAsync(id, await store.ListAsync(cancellation), cancellation);
            return message is null ? Results.NotFound() : Results.Ok(message);
        });
    }
}
