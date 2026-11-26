using Facturas.Api;
using Microsoft.Extensions.Logging.Abstractions;

namespace Facturas.Tests;

public sealed class ReminderProcessorTests
{
    private static readonly DateTime Now = new(2026, 11, 26, 15, 0, 0, DateTimeKind.Utc);
    private const string First = "primerrecordatorio";
    private const string Second = "segundorecordatorio";
    private const string Disabled = "desactivado";

    [Theory]
    [InlineData(First, Second, 1440)]
    [InlineData(Second, Disabled, null)]
    public async Task Accepted_mail_advances_the_expected_state_and_records_history(string status, string expected, int? delay)
    {
        var store = new InvoiceStoreStub(NewInvoice(status));
        var mail = new MailStub(MailResult.Accepted, () => Assert.Equal(status, store.Invoice.Status));
        var processing = NewProcessor(store, mail);

        var result = await processing.ProcessAsync("FAC-0101", 0, default);

        Assert.Equal("sent", result.Outcome);
        Assert.Equal(expected, store.Invoice.Status);
        Assert.Equal(1, store.Invoice.Revision);
        Assert.Null(store.Invoice.ActiveAttempt);
        Assert.Equal(delay is int minutes ? Now.AddMinutes(minutes) : (DateTime?)null, store.Invoice.NextReminderAt);
        var history = Assert.Single(store.Invoice.History);
        Assert.Equal(status, history.FromStatus);
        Assert.Equal(expected, history.ToStatus);
        Assert.Equal(result.MessageId, history.MessageId);
        Assert.Equal(Now, history.SentAt);
    }

    [Theory]
    [InlineData(Disabled, true, 0)]
    [InlineData(First, false, 0)]
    [InlineData(First, true, 1)]
    public async Task Ineligible_invoice_never_sends_mail(string status, bool due, int revision)
    {
        var invoice = NewInvoice(status);
        invoice.NextReminderAt = due ? Now : Now.AddMinutes(1);
        var store = new InvoiceStoreStub(invoice);
        var mail = new MailStub(MailResult.Accepted);

        var result = await NewProcessor(store, mail).ProcessAsync(invoice.Id, revision, default);

        Assert.Equal("skipped", result.Outcome);
        Assert.Equal(0, mail.Sends);
        Assert.Empty(store.Invoice.History);
    }

    [Fact]
    public async Task Known_rejection_keeps_status_and_schedules_retry()
    {
        var store = new InvoiceStoreStub(NewInvoice(First));

        var result = await NewProcessor(store, new MailStub(MailResult.Rejected))
            .ProcessAsync(store.Invoice.Id, 0, default);

        Assert.Equal("retry", result.Outcome);
        Assert.Equal(First, store.Invoice.Status);
        Assert.Equal(0, store.Invoice.Revision);
        Assert.Equal(Now.AddMinutes(15), store.Invoice.NextReminderAt);
        Assert.Equal(Now, store.Invoice.LastFailureAt);
        Assert.Null(store.Invoice.ActiveAttempt);
        Assert.Empty(store.Invoice.History);
    }

    [Fact]
    public async Task Unconfirmed_mail_pauses_for_review_and_cannot_send_again()
    {
        var store = new InvoiceStoreStub(NewInvoice(First));
        var mail = new MailStub(MailResult.Unconfirmed);
        var processing = NewProcessor(store, mail);

        var review = await processing.ProcessAsync(store.Invoice.Id, 0, default);
        var duplicate = await processing.ProcessAsync(store.Invoice.Id, 0, default);

        Assert.Equal("review", review.Outcome);
        Assert.Equal("skipped", duplicate.Outcome);
        Assert.Equal(1, mail.Sends);
        Assert.Equal(First, store.Invoice.Status);
        Assert.True(store.Invoice.ActiveAttempt?.ReviewRequired);
        Assert.Empty(store.Invoice.History);
    }

    [Fact]
    public async Task Persistence_failure_after_accepted_mail_keeps_the_claim_and_blocks_a_repeat()
    {
        var store = new InvoiceStoreStub(NewInvoice(First)) { CompleteFails = true };
        var mail = new MailStub(MailResult.Accepted);
        var processing = NewProcessor(store, mail);

        var review = await processing.ProcessAsync(store.Invoice.Id, 0, default);
        var duplicate = await processing.ProcessAsync(store.Invoice.Id, 0, default);

        Assert.Equal("review", review.Outcome);
        Assert.Equal("persistence_uncertain", review.Reason);
        Assert.Equal(review.MessageId, store.Invoice.ActiveAttempt?.MessageId);
        Assert.Equal("skipped", duplicate.Outcome);
        Assert.Equal(1, mail.Sends);
        Assert.Equal(First, store.Invoice.Status);
    }

    [Fact]
    public async Task Second_call_while_send_is_in_flight_skips_without_sending_again()
    {
        var store = new InvoiceStoreStub(NewInvoice(First));
        var mail = new BlockingMailStub();
        var processing = NewProcessor(store, mail);

        var first = processing.ProcessAsync(store.Invoice.Id, 0, default);
        await mail.Started.Task.WaitAsync(TimeSpan.FromSeconds(3));
        try
        {
            var second = await processing.ProcessAsync(store.Invoice.Id, 0, default);
            Assert.Equal("skipped", second.Outcome);
        }
        finally
        {
            mail.Complete.SetResult(MailResult.Accepted);
        }

        Assert.Equal("sent", (await first).Outcome);
        Assert.Equal(1, mail.Sends);
    }

    [Fact]
    public async Task A_configured_intermediate_state_uses_its_own_delay()
    {
        const string additionalNotice = "avisoadicional";
        var settings = NewSettings();
        settings.StatusLabels[additionalNotice] = "Aviso adicional";
        settings.Rules[Second] = Rule(additionalNotice, 1440);
        settings.Rules[additionalNotice] = Rule(Disabled);
        var store = new InvoiceStoreStub(NewInvoice(Second));

        var result = await NewProcessor(store, new MailStub(MailResult.Accepted), settings)
            .ProcessAsync(store.Invoice.Id, 0, default);

        Assert.Equal(additionalNotice, result.Status);
        Assert.Equal(Now.AddDays(1), store.Invoice.NextReminderAt);
    }

    [Fact]
    public void Policy_rejects_cycles_that_prevent_a_terminal_status()
    {
        var settings = NewSettings();
        settings.Rules[Second] = Rule(First, 1440);

        Assert.Throws<ArgumentException>(() => new ReminderPolicy(settings));
    }

    private static ReminderProcessor NewProcessor(InvoiceStoreStub store, IReminderMail mail, ReminderSettings? settings = null) =>
        new(store, mail, new ReminderPolicy(settings ?? NewSettings()), new FixedClock(), NullLogger<ReminderProcessor>.Instance);

    private static Invoice NewInvoice(string status) => new()
    {
        Id = "FAC-0101",
        Customer = "Cliente de prueba",
        Email = "demo@example.invalid",
        Number = "FAC-0101",
        Amount = 123000,
        Status = status,
        NextReminderAt = Now.AddMinutes(-1)
    };

    private static ReminderSettings NewSettings() => new()
    {
        StatusLabels = new() { [First] = "Primero", [Second] = "Segundo", [Disabled] = "Desactivado" },
        Rules = new() { [First] = Rule(Second, 1440), [Second] = Rule(Disabled) }
    };

    private static ReminderRule Rule(string to, int? delay = null) => new()
    {
        ToStatus = to, Subject = "Asunto", Body = "Cuerpo", DelayMinutes = delay
    };

    private sealed class FixedClock : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(Now);
    }

    private sealed class MailStub(MailResult result, Action? duringSend = null) : IReminderMail
    {
        public int Sends { get; private set; }

        public Task<MailResult> SendAsync(Invoice invoice, ReminderRule rule, string messageId, CancellationToken cancellation)
        {
            Sends++;
            duringSend?.Invoke();
            return Task.FromResult(result);
        }
    }

    private sealed class BlockingMailStub : IReminderMail
    {
        public int Sends { get; private set; }
        public TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource<MailResult> Complete { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task<MailResult> SendAsync(Invoice invoice, ReminderRule rule, string messageId, CancellationToken cancellation)
        {
            Sends++;
            Started.SetResult();
            return Complete.Task;
        }
    }

    private sealed class InvoiceStoreStub(Invoice invoice) : IInvoiceStore
    {
        public Invoice Invoice { get; } = invoice;
        public bool CompleteFails { get; init; }

        public Task<IReadOnlyList<Invoice>> ListAsync(CancellationToken cancellation) =>
            Task.FromResult<IReadOnlyList<Invoice>>([Invoice]);

        public Task<Invoice?> FindAsync(string id, CancellationToken cancellation) =>
            Task.FromResult<Invoice?>(Invoice.Id == id ? Invoice : null);

        public Task<bool> TryClaimAsync(Invoice item, ReminderAttempt attempt, CancellationToken cancellation)
        {
            Invoice.ActiveAttempt = attempt;
            return Task.FromResult(true);
        }

        public Task<bool> CompleteAsync(Invoice item, ReminderAttempt attempt, ReminderEvent activity,
            DateTime? nextReminderAt, CancellationToken cancellation)
        {
            if (CompleteFails)
                throw new InvalidOperationException();

            Invoice.Status = activity.ToStatus;
            Invoice.NextReminderAt = nextReminderAt;
            Invoice.Revision++;
            Invoice.History.Add(activity);
            Invoice.ActiveAttempt = null;
            return Task.FromResult(true);
        }

        public Task<bool> RetryAsync(Invoice item, ReminderAttempt attempt, DateTime observedAt,
            DateTime nextReminderAt, CancellationToken cancellation)
        {
            Invoice.NextReminderAt = nextReminderAt;
            Invoice.LastFailureAt = observedAt;
            Invoice.ActiveAttempt = null;
            return Task.FromResult(true);
        }

        public Task MarkForReviewAsync(Invoice item, ReminderAttempt attempt, CancellationToken cancellation)
        {
            Invoice.ActiveAttempt = attempt with { ReviewRequired = true };
            return Task.CompletedTask;
        }
    }
}
