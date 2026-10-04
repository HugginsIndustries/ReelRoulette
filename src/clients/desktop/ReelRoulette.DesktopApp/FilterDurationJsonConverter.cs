using System;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ReelRoulette
{
    /// <summary>
    /// Reads a filter duration the way the server's filter parser does: a number is seconds, a string is a
    /// <see cref="TimeSpan"/> or else seconds, and anything unreadable is no duration. Writes the <c>HH:MM:SS</c> text form.
    /// </summary>
    public sealed class FilterDurationJsonConverter : JsonConverter<TimeSpan?>
    {
        public override TimeSpan? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Number:
                    return reader.TryGetDouble(out var seconds) ? FromSeconds(seconds) : null;
                case JsonTokenType.String:
                    var raw = reader.GetString()?.Trim();
                    if (string.IsNullOrEmpty(raw))
                    {
                        return null;
                    }

                    if (TimeSpan.TryParse(raw, CultureInfo.InvariantCulture, out var span))
                    {
                        return span;
                    }

                    return double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var numeric)
                        ? FromSeconds(numeric)
                        : null;
                default:
                    reader.Skip();
                    return null;
            }
        }

        public override void Write(Utf8JsonWriter writer, TimeSpan? value, JsonSerializerOptions options)
        {
            if (value.HasValue)
            {
                writer.WriteStringValue(value.Value.ToString("c", CultureInfo.InvariantCulture));
            }
            else
            {
                writer.WriteNullValue();
            }
        }

        private static TimeSpan? FromSeconds(double seconds)
        {
            try
            {
                return TimeSpan.FromSeconds(seconds);
            }
            catch (Exception ex) when (ex is OverflowException or ArgumentException)
            {
                return null;
            }
        }
    }
}
