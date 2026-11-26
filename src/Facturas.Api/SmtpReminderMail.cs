using System.Globalization;
using MailKit;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace Facturas.Api;

public sealed class SmtpReminderMail(SmtpSettings settings, ILogger<SmtpReminderMail> logger) : IReminderMail
{
    public async Task<MailResult> SendAsync(Invoice invoice, ReminderRule rule, string messageId,
        CancellationToken cancellation)
    {
        var attempted = false;
        using var client = new SmtpClient();
        try
        {
            var amount = invoice.Amount.ToString("N0", CultureInfo.GetCultureInfo("es-CO"));
            var message = new MimeMessage
            {
                MessageId = messageId,
                Subject = $"{rule.Subject} · {invoice.Number}",
                Body = new TextPart("plain")
                {
                    Text = $"Hola, {invoice.Customer}.\n\n{rule.Body}\n\nFactura: {invoice.Number}\nValor: {amount} {invoice.Currency}\n"
                }
            };
            message.From.Add(MailboxAddress.Parse(settings.From));
            message.To.Add(new MailboxAddress(invoice.Customer, invoice.Email));

            var security = settings.UseStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.None;
            await client.ConnectAsync(settings.Host, settings.Port, security, cancellation);

            attempted = true;
            var result = await client.SendAsync(message, cancellation);
            return result.AcceptedRecipients.Count == 1 ? MailResult.Accepted : MailResult.Rejected;
        }
        catch (SmtpCommandException exception) when ((int)exception.StatusCode is >= 400 and <= 599)
        {
            logger.LogWarning("Respuesta SMTP {StatusCode} para factura {InvoiceId}", (int)exception.StatusCode, invoice.Id);
            return MailResult.Rejected;
        }
        catch (Exception exception)
        {
            logger.LogWarning("Error SMTP {ErrorType} en factura {InvoiceId}", exception.GetType().Name, invoice.Id);
            return attempted ? MailResult.Unconfirmed : MailResult.Rejected;
        }
    }
}

public sealed record SmtpSettings
{
    public string Host { get; init; } = "localhost";
    public int Port { get; init; } = 1025;
    public string From { get; init; } = "avisos@facturas.example.invalid";
    public bool UseStartTls { get; init; }
}
