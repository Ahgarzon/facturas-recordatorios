using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Facturas.Api;
using MongoDB.Bson;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Driver;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("reminders.json", optional: false, reloadOnChange: false);
var workflowKey = builder.Configuration["Workflow:Key"];
if (string.IsNullOrWhiteSpace(workflowKey) || workflowKey.Length < 24)
    throw new InvalidOperationException("Configura Workflow__Key con al menos 24 caracteres.");

ConventionRegistry.Register("facturas", new ConventionPack { new CamelCaseElementNameConvention() },
    type => type.Namespace == typeof(Invoice).Namespace);

builder.Services.AddProblemDetails();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(new ReminderPolicy(builder.Configuration.GetRequiredSection("Reminders").Get<ReminderSettings>()!));
builder.Services.AddSingleton(builder.Configuration.GetRequiredSection("Smtp").Get<SmtpSettings>()!);
builder.Services.AddSingleton<IMongoDatabase>(_ =>
{
    var connection = MongoClientSettings.FromConnectionString(builder.Configuration["Mongo:ConnectionString"]);
    connection.ServerSelectionTimeout = TimeSpan.FromSeconds(5);
    return new MongoClient(connection).GetDatabase(builder.Configuration["Mongo:Database"]);
});
builder.Services.AddSingleton<MongoInvoiceStore>();
builder.Services.AddSingleton<IInvoiceStore>(services => services.GetRequiredService<MongoInvoiceStore>());
builder.Services.AddSingleton<IReminderMail, SmtpReminderMail>();
builder.Services.AddScoped<ReminderProcessor>();

var demoSeed = builder.Configuration.GetValue<bool>("Demo:Seed");
var mailpitUrl = demoSeed ? builder.Configuration["Demo:MailpitUrl"] : null;
var demoInboxEnabled = !string.IsNullOrWhiteSpace(mailpitUrl);
if (demoInboxEnabled)
    builder.Services.AddDemoInbox(mailpitUrl!);

var app = builder.Build();
app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles();

var api = app.MapGroup("/api");
if (demoInboxEnabled)
    api.MapDemoInbox();

api.MapGet("/health", async (IMongoDatabase database, CancellationToken cancellation) =>
{
    try
    {
        await database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: cancellation);
        return Results.Ok(new { status = "ok" });
    }
    catch (Exception exception) when (exception is MongoException or TimeoutException)
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
});
api.MapGet("/statuses", (ReminderPolicy policy) => policy.StatusLabels);
api.MapGet("/invoices", async (IInvoiceStore store, TimeProvider clock, CancellationToken cancellation) =>
{
    var now = clock.GetUtcNow().UtcDateTime;
    var invoices = await store.ListAsync(cancellation);
    return invoices.Select(invoice => new
    {
        invoice.Id,
        invoice.Customer,
        invoice.Number,
        invoice.Amount,
        invoice.Currency,
        invoice.Status,
        invoice.NextReminderAt,
        invoice.History,
        invoice.LastFailureAt,
        reviewRequired = invoice.ActiveAttempt is { } attempt &&
            (attempt.ReviewRequired || now - attempt.StartedAt >= ReminderProcessor.ReviewAfter),
        reviewMessageId = invoice.ActiveAttempt?.MessageId
    });
});

var expectedKey = Encoding.UTF8.GetBytes(workflowKey);
api.MapPost("/internal/reminders/{id}", async (HttpRequest request, string id, ReminderRequest input,
    ReminderProcessor processor, CancellationToken cancellation) =>
{
    var key = Encoding.UTF8.GetBytes(request.Headers["X-Workflow-Key"].ToString());
    if (!CryptographicOperations.FixedTimeEquals(expectedKey, key))
        return Results.Unauthorized();

    if (input.Revision < 0)
        return Results.BadRequest(new { error = "La revisión debe ser un número entero no negativo." });

    return Results.Ok(await processor.ProcessAsync(id, input.Revision, cancellation));
});

if (demoSeed)
{
    var clock = app.Services.GetRequiredService<TimeProvider>();
    using var startup = new CancellationTokenSource(TimeSpan.FromSeconds(20));
    await app.Services.GetRequiredService<MongoInvoiceStore>().SeedDemoAsync(clock.GetUtcNow().UtcDateTime, startup.Token);
}

await app.RunAsync();

public sealed record ReminderRequest([property: JsonRequired] int Revision);
