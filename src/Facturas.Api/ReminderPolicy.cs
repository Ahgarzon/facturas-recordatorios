namespace Facturas.Api;

public sealed class ReminderPolicy
{
    private readonly IReadOnlyDictionary<string, ReminderRule> _rules;

    public ReminderPolicy(ReminderSettings settings)
    {
        if (settings.RetryMinutes is < 1 or > 1440 || settings.Rules.Count == 0)
            throw new ArgumentException("Configura al menos una regla y un reintento de 1 a 1440 minutos.");

        foreach (var (status, rule) in settings.Rules)
        {
            var hasNextRule = settings.Rules.ContainsKey(rule.ToStatus);
            if (!settings.StatusLabels.ContainsKey(status) ||
                !settings.StatusLabels.ContainsKey(rule.ToStatus) ||
                string.IsNullOrWhiteSpace(rule.Subject) ||
                string.IsNullOrWhiteSpace(rule.Body) ||
                (hasNextRule && rule.DelayMinutes is not (>= 1 and <= 525600)) ||
                (!hasNextRule && rule.DelayMinutes is not null))
                throw new ArgumentException($"Revisa el destino, el correo y la espera de '{status}'.");

            var visited = new HashSet<string> { status };
            var next = rule.ToStatus;
            while (settings.Rules.TryGetValue(next, out var nextRule))
            {
                if (!visited.Add(next))
                    throw new ArgumentException($"Hay un ciclo de recordatorios desde '{status}'.");
                next = nextRule.ToStatus;
            }
        }

        _rules = new Dictionary<string, ReminderRule>(settings.Rules, StringComparer.Ordinal);
        StatusLabels = new Dictionary<string, string>(settings.StatusLabels, StringComparer.Ordinal);
        RetryDelay = TimeSpan.FromMinutes(settings.RetryMinutes);
    }

    public TimeSpan RetryDelay { get; }
    public IReadOnlyDictionary<string, string> StatusLabels { get; }
    public ReminderRule? RuleFor(string status) => _rules.GetValueOrDefault(status);
}

public sealed class ReminderSettings
{
    public Dictionary<string, ReminderRule> Rules { get; init; } = new(StringComparer.Ordinal);
    public Dictionary<string, string> StatusLabels { get; init; } = new(StringComparer.Ordinal);
    public int RetryMinutes { get; init; } = 15;
}

public sealed record ReminderRule
{
    public string ToStatus { get; init; } = "";
    public string Subject { get; init; } = "";
    public string Body { get; init; } = "";
    public int? DelayMinutes { get; init; }
}
