using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace ReelRoulette.WebRemote
{
    /// <summary>
    /// Serves static files from embedded resources or disk (for development).
    /// </summary>
    public static class StaticFileResponder
    {
        private static readonly Assembly Assembly = typeof(StaticFileResponder).Assembly;
        private const string UiNamespace = "ReelRoulette.WebRemote.ui";

        private static readonly (string Ext, string Mime)[] MimeTypes = new[]
        {
            (".html", "text/html"),
            (".htm", "text/html"),
            (".css", "text/css"),
            (".js", "application/javascript"),
            (".ico", "image/x-icon"),
            (".png", "image/png"),
            (".jpg", "image/jpeg"),
            (".jpeg", "image/jpeg"),
            (".svg", "image/svg+xml"),
        };

        public static string GetMimeType(string path)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            foreach (var entry in MimeTypes)
            {
                if (entry.Ext == ext) return entry.Mime;
            }
            return "application/octet-stream";
        }

        /// <summary>
        /// Tries to serve a static file. Returns true if handled.
        /// Checks disk path first (web-remote-dev), then embedded resources.
        /// </summary>
        public static async Task<bool> TryServeAsync(HttpContext context, string path)
        {
            path = path.TrimStart('/');
            if (string.IsNullOrEmpty(path)) path = "index.html";

            var diskPath = Path.Combine(AppContext.BaseDirectory, "web-remote-dev", path.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(diskPath))
            {
                context.Response.ContentType = GetMimeType(path);
                await context.Response.SendFileAsync(diskPath);
                return true;
            }

            var resourceName = UiNamespace + "." + path.Replace('/', '.');
            await using var stream = Assembly.GetManifestResourceStream(resourceName);
            if (stream == null) return false;

            context.Response.ContentType = GetMimeType(path);
            await stream.CopyToAsync(context.Response.Body);
            return true;
        }
    }
}
