using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace ReelRoulette.WebRemote
{
    /// <summary>
    /// Streams media files over HTTP with Range support for seeking.
    /// </summary>
    public static class MediaStreamer
    {
        private const int BufferSize = 81920; // 80 KB

        /// <summary>
        /// Gets the MIME type for a file path.
        /// </summary>
        public static string GetContentType(string fullPath)
        {
            var ext = Path.GetExtension(fullPath).ToLowerInvariant();
            return ext switch
            {
                ".mp4" => "video/mp4",
                ".mkv" => "video/x-matroska",
                ".avi" => "video/x-msvideo",
                ".mov" => "video/quicktime",
                ".wmv" => "video/x-ms-wmv",
                ".webm" => "video/webm",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".gif" => "image/gif",
                ".webp" => "image/webp",
                ".bmp" => "image/bmp",
                _ => "application/octet-stream"
            };
        }

        /// <summary>
        /// Streams the file to the response with Range support.
        /// Handles Range header and responds with 206 Partial Content when appropriate.
        /// </summary>
        public static async Task StreamFileAsync(HttpContext context, string fullPath, string contentType)
        {
            if (!File.Exists(fullPath))
            {
                context.Response.StatusCode = 404;
                await context.Response.WriteAsync("File not found");
                return;
            }

            var fileInfo = new FileInfo(fullPath);
            var fileLength = fileInfo.Length;
            context.Response.ContentType = contentType;

            var rangeHeader = context.Request.Headers.Range.ToString();
            if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes="))
            {
                // Parse Range: bytes=start-end
                var range = rangeHeader["bytes=".Length..].Trim();
                var parts = range.Split('-');
                long start = 0, end = fileLength - 1;
                if (parts.Length >= 1 && !string.IsNullOrEmpty(parts[0]))
                    long.TryParse(parts[0].Trim(), out start);
                if (parts.Length >= 2 && !string.IsNullOrEmpty(parts[1]))
                    long.TryParse(parts[1].Trim(), out end);

                start = Math.Max(0, Math.Min(start, fileLength - 1));
                end = Math.Max(start, Math.Min(end, fileLength - 1));
                var contentLength = end - start + 1;

                context.Response.StatusCode = 206;
                context.Response.Headers.ContentLength = contentLength;
                context.Response.Headers.ContentRange = $"bytes {start}-{end}/{fileLength}";
                context.Response.Headers.AcceptRanges = "bytes";

                await using var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize, true);
                stream.Seek(start, SeekOrigin.Begin);
                var remaining = contentLength;
                var buffer = new byte[Math.Min(BufferSize, remaining)];
                while (remaining > 0)
                {
                    var toRead = (int)Math.Min(buffer.Length, remaining);
                    var read = await stream.ReadAsync(buffer.AsMemory(0, toRead));
                    if (read == 0) break;
                    await context.Response.Body.WriteAsync(buffer.AsMemory(0, read));
                    remaining -= read;
                }
                return;
            }

            // No Range header - stream entire file
            context.Response.Headers.ContentLength = fileLength;
            context.Response.Headers.AcceptRanges = "bytes";

            await using var fullStream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, BufferSize, true);
            await fullStream.CopyToAsync(context.Response.Body);
        }
    }
}
