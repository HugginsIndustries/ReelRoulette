using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace ReelRoulette;

public static class ClientLogRelay
{
    private static readonly HttpClient HttpClient = new();
    private static readonly object Lock = new();
    private static string _baseUrl = "http://localhost:45123";

    public static void SetBaseUrl(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return;
        }

        lock (Lock)
        {
            _baseUrl = baseUrl.TrimEnd('/');
        }
    }

    public static void Log(string source, string message, string level = "info")
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

#pragma warning disable CS4014
        Task.Run(async () =>
        {
            try
            {
                string url;
                lock (Lock)
                {
                    url = $"{_baseUrl}/api/logs/client";
                }

                var payload = new CoreClientLogRequest
                {
                    Source = source,
                    Level = level,
                    Message = LogSanitizer.Sanitize(message)
                };
                var json = JsonSerializer.Serialize(payload);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");
                using var response = await HttpClient.PostAsync(url, content).ConfigureAwait(false);
                _ = response.IsSuccessStatusCode;
            }
            catch
            {
                // Logging failures must never interrupt app flow.
            }
        });
#pragma warning restore CS4014
    }
}
