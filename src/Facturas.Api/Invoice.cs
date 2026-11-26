namespace Facturas.Api;

public sealed class Invoice
{
    public required string Id { get; init; }
    public required string Customer { get; init; }
    public required string Email { get; init; }
    public required string Number { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "COP";
    public required string Status { get; set; }
    public DateTime? NextReminderAt { get; set; }
    public int Revision { get; set; }
    public List<ReminderEvent> History { get; set; } = [];
    public ReminderAttempt? ActiveAttempt { get; set; }
    public DateTime? LastFailureAt { get; set; }
}

public sealed record ReminderEvent(
    string FromStatus,
    string ToStatus,
    DateTime SentAt,
    string MessageId);

public sealed record ReminderAttempt(
    string Token,
    DateTime StartedAt,
    string MessageId,
    string ToStatus,
    int? DelayMinutes,
    bool ReviewRequired = false);
