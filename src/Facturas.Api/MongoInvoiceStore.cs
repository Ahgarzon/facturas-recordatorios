using MongoDB.Bson;
using MongoDB.Driver;

namespace Facturas.Api;

public sealed class MongoInvoiceStore(IMongoDatabase database) : IInvoiceStore
{
    private readonly IMongoCollection<Invoice> _invoices = database.GetCollection<Invoice>("invoices");

    public async Task<IReadOnlyList<Invoice>> ListAsync(CancellationToken cancellation) =>
        await _invoices.Find(FilterDefinition<Invoice>.Empty).SortBy(invoice => invoice.Number).ToListAsync(cancellation);

    public async Task<Invoice?> FindAsync(string id, CancellationToken cancellation) =>
        await _invoices.Find(invoice => invoice.Id == id).FirstOrDefaultAsync(cancellation);

    public async Task<bool> TryClaimAsync(Invoice invoice, ReminderAttempt attempt, CancellationToken cancellation)
    {
        var filter = VersionOf(invoice) & Builders<Invoice>.Filter.Eq(item => item.ActiveAttempt, null) &
            Builders<Invoice>.Filter.Lte(item => item.NextReminderAt, attempt.StartedAt);
        var update = Builders<Invoice>.Update.Set(item => item.ActiveAttempt, attempt);
        return (await _invoices.UpdateOneAsync(filter, update, cancellationToken: cancellation)).ModifiedCount == 1;
    }

    public async Task<bool> CompleteAsync(Invoice invoice, ReminderAttempt attempt, ReminderEvent activity,
        DateTime? nextReminderAt, CancellationToken cancellation)
    {
        // Updating the status, history and claim together keeps the invoice internally consistent.
        var update = Builders<Invoice>.Update
            .Set(item => item.Status, activity.ToStatus)
            .Set(item => item.NextReminderAt, nextReminderAt)
            .Push(item => item.History, activity)
            .Inc(item => item.Revision, 1)
            .Unset(item => item.ActiveAttempt)
            .Unset(item => item.LastFailureAt);
        return (await _invoices.UpdateOneAsync(ClaimOf(invoice, attempt), update,
            cancellationToken: cancellation)).ModifiedCount == 1;
    }

    public async Task<bool> RetryAsync(Invoice invoice, ReminderAttempt attempt, DateTime observedAt,
        DateTime nextReminderAt, CancellationToken cancellation)
    {
        var update = Builders<Invoice>.Update
            .Set(item => item.LastFailureAt, observedAt)
            .Set(item => item.NextReminderAt, nextReminderAt)
            .Unset(item => item.ActiveAttempt);
        return (await _invoices.UpdateOneAsync(ClaimOf(invoice, attempt), update,
            cancellationToken: cancellation)).ModifiedCount == 1;
    }

    public async Task MarkForReviewAsync(Invoice invoice, ReminderAttempt attempt, CancellationToken cancellation) =>
        await _invoices.UpdateOneAsync(ClaimOf(invoice, attempt),
            Builders<Invoice>.Update.Set(item => item.ActiveAttempt!.ReviewRequired, true), cancellationToken: cancellation);

    public async Task SeedDemoAsync(DateTime now, CancellationToken cancellation)
    {
        var seed = new[]
        {
            DemoInvoice("FAC-0101", "Estudio Páramo", "paramo", 245000, "primerrecordatorio", now.AddDays(-1)),
            DemoInvoice("FAC-0102", "Bufete Arrayán", "arrayan", 378000, "segundorecordatorio", now.AddDays(-1)),
            DemoInvoice("FAC-0103", "Oficina Cedro", "cedro", 164500, "primerrecordatorio", now.AddDays(-1)),
            DemoInvoice("FAC-0104", "Estudio Páramo", "paramo", 122000, "primerrecordatorio", now.AddDays(3)),
            DemoInvoice("FAC-0105", "Bufete Arrayán", "arrayan", 90000, "desactivado", null),
            DemoInvoice("FAC-0106", "Oficina Cedro", "cedro", 562000, "segundorecordatorio", now.AddDays(2))
        };

        await _invoices.Indexes.CreateOneAsync(
            new CreateIndexModel<Invoice>(CreateIndexKeys(), new CreateIndexOptions { Name = "reminder_due" }),
            cancellationToken: cancellation);

        var upserts = seed.Select(invoice =>
        {
            var document = invoice.ToBsonDocument();
            document.Remove("_id");
            return new UpdateOneModel<Invoice>(Builders<Invoice>.Filter.Eq(item => item.Id, invoice.Id),
                new BsonDocument("$setOnInsert", document)) { IsUpsert = true };
        });
        await _invoices.BulkWriteAsync(upserts, cancellationToken: cancellation);
    }

    private static IndexKeysDefinition<Invoice> CreateIndexKeys() =>
        Builders<Invoice>.IndexKeys.Ascending(item => item.ActiveAttempt).Ascending(item => item.NextReminderAt);

    private static Invoice DemoInvoice(string number, string customer, string mailbox, decimal amount,
        string status, DateTime? nextReminderAt) => new()
    {
        Id = number,
        Number = number,
        Customer = customer,
        Email = $"{mailbox}@facturas.example.invalid",
        Amount = amount,
        Status = status,
        NextReminderAt = nextReminderAt
    };

    private static FilterDefinition<Invoice> VersionOf(Invoice invoice) =>
        Builders<Invoice>.Filter.Where(item =>
            item.Id == invoice.Id && item.Revision == invoice.Revision && item.Status == invoice.Status);

    private static FilterDefinition<Invoice> ClaimOf(Invoice invoice, ReminderAttempt attempt) =>
        VersionOf(invoice) & Builders<Invoice>.Filter.Eq(item => item.ActiveAttempt!.Token, attempt.Token);
}
