using System;
using System.Text.Json;
using System.Text.Json.Serialization;
using ReelRoulette.Core.Filtering;

namespace ReelRoulette
{
    /// <summary>
    /// Reads a flag filter mode the way the server's filter parser does: a known name in any case is that mode, and
    /// anything else is no mode. Writes the mode's name.
    /// </summary>
    public sealed class FlagFilterModeJsonConverter : JsonConverter<FlagFilterModeValue?>
    {
        public override bool HandleNull => true;

        public override FlagFilterModeValue? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.String)
            {
                return FlagFilterModes.Parse(reader.GetString());
            }

            if (reader.TokenType is JsonTokenType.StartObject or JsonTokenType.StartArray)
            {
                reader.Skip();
            }

            return null;
        }

        public override void Write(Utf8JsonWriter writer, FlagFilterModeValue? value, JsonSerializerOptions options)
        {
            if (value.HasValue)
            {
                writer.WriteStringValue(FlagFilterModes.Name(value.Value));
            }
            else
            {
                writer.WriteNullValue();
            }
        }
    }
}
