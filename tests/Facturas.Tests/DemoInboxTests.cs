using System.Net;
using System.Text;
using System.Text.Json;
using Facturas.Api;
using Microsoft.Extensions.DependencyInjection;

namespace Facturas.Tests;

public sealed class DemoInboxTests
{
    private const string Sender = "avisos@facturas.example.invalid";
    private const string Recipient = "paramo@facturas.example.invalid";
    private const string LinkedMessage = "factura-FAC-0101-0@facturas.example.invalid";

    [Fact]
    public async Task Inbox_only_lists_matching_demo_history_and_envelope()
    {
        var handler = new MailpitHandler(("api/v1/messages?limit=500",
            Mailbox(
                Summary("old-id", "different@example.invalid"),
                Summary("valid-id", LinkedMessage, read: true),
                Summary("foreign-recipient", LinkedMessage, to: "other@example.invalid"),
                Summary("different-sender", LinkedMessage, from: "other@example.invalid"),
                Summary("cc-message", LinkedMessage, cc: true),
                Summary("real-id", "real@example.invalid", to: "name@example.com"))));
        using var client = handler.CreateClient();
        var inbox = new DemoInbox(client, new());

        var emails = await inbox.ListAsync([Invoice(), Invoice("real@example.invalid", "name@example.com")], default);

        var email = Assert.Single(emails);
        Assert.Equal("valid-id", email.Id);
        Assert.Equal(LinkedMessage, email.MessageId);
        Assert.Equal("FAC-0101", email.InvoiceNumber);
        Assert.Equal(Sender, email.From);
        Assert.Equal([Recipient], email.To);
        Assert.True(email.Read);
        Assert.Equal(new DateTimeOffset(2026, 11, 26, 15, 0, 0, TimeSpan.Zero), email.ReceivedAt);
        Assert.DoesNotContain("text", JsonSerializer.Serialize(email, JsonSerializerOptions.Web));
    }

    [Fact]
    public async Task Opening_a_verified_email_returns_plain_text_and_its_marked_read_state()
    {
        var handler = new MailpitHandler(
            ("api/v1/messages?limit=500", Mailbox(Summary("valid-id", LinkedMessage))),
            ("api/v1/message/valid-id", $$"""
              {
                "ID": "valid-id",
                "MessageID": "<{{LinkedMessage}}>",
                "From": { "Address": "{{Sender}}" },
                "To": [{ "Address": "{{Recipient}}" }],
                "Text": "Texto de demostración.",
                "HTML": "<b>Debe omitirse</b>",
                "Attachments": [{ "FileName": "private-file.pdf" }]
              }
              """));
        using var client = handler.CreateClient();
        var inbox = new DemoInbox(client, new());

        var email = await inbox.OpenAsync("valid-id", [Invoice()], default);

        Assert.NotNull(email);
        Assert.True(email.Read);
        Assert.Equal("Texto de demostración.", email.Text);
        Assert.Equal(LinkedMessage, email.MessageId);
        var claims = JsonSerializer.Serialize(email, JsonSerializerOptions.Web);
        Assert.DoesNotContain("private-file", claims);
        Assert.DoesNotContain("Debe omitirse", claims);
        Assert.Equal(["api/v1/messages?limit=500", "api/v1/message/valid-id"], handler.Requests);
    }

    [Fact]
    public async Task Unlinked_email_is_never_opened_in_mailpit()
    {
        var handler = new MailpitHandler(("api/v1/messages?limit=500",
            Mailbox(Summary("unlinked", "foreign@example.invalid"))));
        using var client = handler.CreateClient();
        var inbox = new DemoInbox(client, new());

        Assert.Null(await inbox.OpenAsync("unlinked", [Invoice()], default));
        Assert.Null(await inbox.OpenAsync("latest", [Invoice()], default));
        Assert.Equal(["api/v1/messages?limit=500"], handler.Requests);
    }

    [Theory]
    [InlineData("file:///tmp/mail")]
    [InlineData("http://name:secret@mailpit:8025")]
    [InlineData("http://mailpit:8025/diferente")]
    [InlineData("http://mailpit:8025/?param=valor")]
    public void Demo_configuration_requires_an_http_origin(string url) =>
        Assert.Throws<InvalidOperationException>(() => new ServiceCollection().AddDemoInbox(url));

    private static Invoice Invoice(string messageId = LinkedMessage, string recipient = Recipient) => new()
    {
        Id = "FAC-0101",
        Customer = "Estudio Páramo",
        Email = recipient,
        Number = "FAC-0101",
        Status = "segundorecordatorio",
        History = [new("primerrecordatorio", "segundorecordatorio",
            new DateTime(2026, 11, 26, 15, 0, 0, DateTimeKind.Utc), messageId)]
    };

    private static string Mailbox(params string[] messages) => "{\"messages\":[" + string.Join(',', messages) + "]}";

    private static string Summary(string id, string messageId, string from = Sender, string to = Recipient,
        bool read = false, bool cc = false) =>
        JsonSerializer.Serialize(new
        {
            ID = id,
            MessageID = messageId,
            From = new { Address = from },
            To = new[] { new { Address = to } },
            Cc = cc ? new[] { new { Address = "extra@example.invalid" } } : [],
            Created = "2026-11-26T15:00:00.000Z",
            Subject = "Aviso de demostración",
            Read = read
        });

    private sealed class MailpitHandler(params (string Path, string Response)[] routes) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];

        public HttpClient CreateClient() => new(this) { BaseAddress = new("http://mailpit:8025") };

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal(HttpMethod.Get, request.Method);
            var path = request.RequestUri!.PathAndQuery.TrimStart('/');
            Requests.Add(path);
            var route = Assert.Single(routes, item => item.Path == path);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(route.Response, Encoding.UTF8, "application/json")
            });
        }
    }
}
