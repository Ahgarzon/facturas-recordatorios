using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using MimeKit;

namespace Facturas.Api;

public sealed class DemoInbox(HttpClient client, SmtpSettings smtp)
{
    private const string MailboxPath = "api/v1/messages?limit=500";
    private readonly string _sender = MailboxAddress.Parse(smtp.From).Address;

    public async Task<IReadOnlyList<DemoEmail>> ListAsync(IReadOnlyList<Invoice> invoices, CancellationToken cancellation)
    {
        var links = invoices.Where(invoice => invoice.Email.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase))
            .SelectMany(invoice => invoice.History.Select(entry =>
                (entry.MessageId, invoice.Email, invoice.Number)))
            .ToLookup(entry => entry.MessageId, StringComparer.Ordinal);
        if (links.Count == 0)
            return [];

        var mailbox = await GetAsync<MailpitMailbox>(MailboxPath, cancellation)
            ?? throw new JsonException("Mailpit devolvió una bandeja vacía en lugar de un objeto.");
        if (mailbox.Messages is null)
            throw new JsonException("La bandeja de Mailpit no contiene la lista de mensajes.");

        var emails = new List<DemoEmail>();
        foreach (var message in mailbox.Messages)
        {
            if (message.Id is not { } id || !IsMessageId(id) || message.Created is not { } receivedAt)
                continue;

            var messageId = NormalizeMessageId(message.MessageId);
            var candidates = links[messageId].Take(2).ToArray();
            if (candidates.Length != 1 ||
                !MatchesEnvelope(message, candidates[0].Email, out var sender, out var recipient))
                continue;

            emails.Add(new(id, messageId, candidates[0].Number, message.Subject ?? "", sender,
                [recipient], receivedAt, message.Read));
        }

        return emails;
    }

    public async Task<DemoEmail?> OpenAsync(string id, IReadOnlyList<Invoice> invoices, CancellationToken cancellation)
    {
        if (!IsMessageId(id))
            return null;

        // Mailpit marks a message as read on GET. Verify the summary before asking for its detail.
        var summary = (await ListAsync(invoices, cancellation)).FirstOrDefault(email => email.Id == id);
        if (summary is null)
            return null;

        var detail = await GetAsync<MailpitMessage>($"api/v1/message/{Uri.EscapeDataString(id)}", cancellation,
            optional: true);
        if (detail is null || detail.Id != summary.Id || NormalizeMessageId(detail.MessageId) != summary.MessageId ||
            !MatchesEnvelope(detail, summary.To[0], out _, out _))
            return null;

        return summary with { Read = true, Text = detail.Text ?? "" };
    }

    private bool MatchesEnvelope(MailpitMessage message, string expectedRecipient, out string sender, out string recipient)
    {
        sender = message.From?.Address ?? "";
        recipient = message.To is [{ Address: { } address }] ? address : "";
        return string.Equals(sender, _sender, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(recipient, expectedRecipient, StringComparison.OrdinalIgnoreCase) &&
            message.Cc is not { Length: > 0 } &&
            message.Bcc is not { Length: > 0 };
    }

    private static bool IsMessageId(string value) => value.Length is > 0 and <= 64 &&
        !string.Equals(value, "latest", StringComparison.OrdinalIgnoreCase) &&
        value.All(character => char.IsAsciiLetterOrDigit(character) || character is '_' or '-');

    private static string NormalizeMessageId(string? value) => value?.Trim().Trim('<', '>') ?? "";

    private async Task<T?> GetAsync<T>(string path, CancellationToken cancellation, bool optional = false)
    {
        using var response = await client.GetAsync(path, cancellation);
        if (optional && response.StatusCode == HttpStatusCode.NotFound)
            return default;

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(cancellation);
    }

    private sealed record MailpitMailbox(MailpitMessage[]? Messages);

    private sealed record MailpitMessage(
        [property: JsonPropertyName("ID")] string? Id,
        [property: JsonPropertyName("MessageID")] string? MessageId,
        string? Subject,
        MailpitAddress? From,
        MailpitAddress[]? To,
        MailpitAddress[]? Cc,
        MailpitAddress[]? Bcc,
        DateTimeOffset? Created,
        bool Read,
        string? Text);

    private sealed record MailpitAddress(string? Address);
}

public sealed record DemoEmail(
    string Id,
    string MessageId,
    string InvoiceNumber,
    string Subject,
    string From,
    string[] To,
    DateTimeOffset ReceivedAt,
    bool Read,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Text = null);
