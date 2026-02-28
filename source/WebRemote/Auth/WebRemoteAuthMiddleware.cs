using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace ReelRoulette.WebRemote.Auth
{
    /// <summary>
    /// Middleware that enforces shared-token auth when enabled.
    /// Checks HttpOnly cookie (set by /api/pair) or Authorization header / query param for token.
    /// </summary>
    public class WebRemoteAuthMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly string? _sharedToken;
        private const string CookieName = "rr_paired";

        public WebRemoteAuthMiddleware(RequestDelegate next, string? sharedToken)
        {
            _next = next;
            _sharedToken = sharedToken;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            // If no token configured, allow all (auth effectively disabled)
            if (string.IsNullOrEmpty(_sharedToken))
            {
                await _next(context);
                return;
            }

            // Allow /api/pair without auth (it's the pairing flow)
            if (context.Request.Path.StartsWithSegments("/api/pair"))
            {
                await _next(context);
                return;
            }

            // Allow static UI assets so user can load the pairing page
            var path = context.Request.Path.Value ?? "";
            if (path == "/" || path == "/index.html" || path == "/app.css" || path == "/app.js")
            {
                await _next(context);
                return;
            }

            // Check cookie first (set by pairing)
            if (context.Request.Cookies.TryGetValue(CookieName, out var cookieValue) &&
                string.Equals(cookieValue, _sharedToken, StringComparison.Ordinal))
            {
                await _next(context);
                return;
            }

            // Check Authorization header: Bearer {token}
            var authHeader = context.Request.Headers.Authorization.ToString();
            if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                var token = authHeader["Bearer ".Length..].Trim();
                if (string.Equals(token, _sharedToken, StringComparison.Ordinal))
                {
                    await _next(context);
                    return;
                }
            }

            // Check query param: ?token=...
            var queryToken = context.Request.Query["token"].ToString();
            if (!string.IsNullOrEmpty(queryToken) && string.Equals(queryToken, _sharedToken, StringComparison.Ordinal))
            {
                await _next(context);
                return;
            }

            context.Response.StatusCode = 401;
            await context.Response.WriteAsync("Unauthorized");
        }

        /// <summary>
        /// Cookie name used for pairing (for setting the cookie in /api/pair).
        /// </summary>
        public static string AuthCookieName => CookieName;
    }
}
