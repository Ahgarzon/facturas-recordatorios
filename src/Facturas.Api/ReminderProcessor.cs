namespace Facturas.Api;

public sealed class ReminderProcessor(
    IInvoiceStore store,
    IReminderMail mail,
    ReminderPolicy policy,
    TimeProvider clock,
    ILogger<ReminderProcessor> logger)
{
    public static readonly TimeSpan ReviewAfter = TimeSpan.FromMinutes(2);

    public async Task<ReminderResult> ProcessAsync(string id, int revision, CancellationToken cancellation)
    {
        var invoice = await store.FindAsync(id, cancellation);
        var now = clock.GetUtcNow().UtcDateTime;
        if (invoice is null || invoice.Revision != revision ||
            invoice.NextReminderAt is not DateTime due || due > now || invoice.ActiveAttempt is not null)
            return new("skipped", id, invoice?.Status, "not_due_or_already_processed");

        var rule = policy.RuleFor(invoice.Status);
        if (rule is null)
            return new("skipped", id, invoice.Status, "no_rule");

        var attempt = new ReminderAttempt(
            Guid.NewGuid().ToString("N"), now, $"factura-{invoice.Id}-{revision}@facturas.example.invalid",
            rule.ToStatus, rule.DelayMinutes);

        if (!await store.TryClaimAsync(invoice, attempt, cancellation))
            return new("skipped", id, invoice.Status, "already_claimed");

        // A disconnected HTTP caller must not interrupt persistence after SMTP accepts the message.
        using var operation = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        var outcome = await mail.SendAsync(invoice, rule, attempt.MessageId, operation.Token);

        using var persist = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var observedAt = clock.GetUtcNow().UtcDateTime;
        try
        {
            switch (outcome)
            {
                case MailResult.Accepted:
                    var activity = new ReminderEvent(invoice.Status, rule.ToStatus, observedAt, attempt.MessageId);
                    DateTime? nextReminder = rule.DelayMinutes is int minutes ? observedAt.AddMinutes(minutes) : null;
                    if (await store.CompleteAsync(invoice, attempt, activity, nextReminder, persist.Token))
                    {
                        logger.LogInformation("Factura {InvoiceId} cambió de {FromStatus} a {ToStatus}. Mensaje {MessageId}",
                            id, invoice.Status, rule.ToStatus, attempt.MessageId);
                        return new("sent", id, rule.ToStatus, MessageId: attempt.MessageId);
                    }
                    break;
                case MailResult.Rejected:
                    if (await store.RetryAsync(invoice, attempt, observedAt, observedAt + policy.RetryDelay, persist.Token))
                    {
                        logger.LogWarning("Correo rechazado para factura {InvoiceId}. Próximo intento {NextAttempt}",
                            id, observedAt + policy.RetryDelay);
                        return new("retry", id, invoice.Status, "smtp_not_accepted", attempt.MessageId);
                    }
                    break;
                case MailResult.Unconfirmed:
                    await store.MarkForReviewAsync(invoice, attempt, persist.Token);
                    break;
            }
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "No fue posible persistir el resultado del intento {MessageId}", attempt.MessageId);
        }

        logger.LogWarning("Revisar factura {InvoiceId}, mensaje {MessageId}, resultado SMTP {MailOutcome}",
            id, attempt.MessageId, outcome);
        return new("review", id, invoice.Status,
            outcome == MailResult.Unconfirmed ? "smtp_uncertain" : "persistence_uncertain", attempt.MessageId);
    }
}

public sealed record ReminderResult(
    string Outcome,
    string Id,
    string? Status,
    string? Reason = null,
    string? MessageId = null);

public enum MailResult { Accepted, Rejected, Unconfirmed }

public interface IReminderMail
{
    Task<MailResult> SendAsync(Invoice invoice, ReminderRule rule, string messageId, CancellationToken cancellation);
}

public interface IInvoiceStore
{
    Task<IReadOnlyList<Invoice>> ListAsync(CancellationToken cancellation);
    Task<Invoice?> FindAsync(string id, CancellationToken cancellation);
    Task<bool> TryClaimAsync(Invoice invoice, ReminderAttempt attempt, CancellationToken cancellation);
    Task<bool> CompleteAsync(Invoice invoice, ReminderAttempt attempt, ReminderEvent activity,
        DateTime? nextReminderAt, CancellationToken cancellation);
    Task<bool> RetryAsync(Invoice invoice, ReminderAttempt attempt, DateTime observedAt,
        DateTime nextReminderAt, CancellationToken cancellation);
    Task MarkForReviewAsync(Invoice invoice, ReminderAttempt attempt, CancellationToken cancellation);
}
