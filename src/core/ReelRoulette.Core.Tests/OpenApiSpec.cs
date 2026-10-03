using System.Text.Json;
using System.Text.RegularExpressions;
using Xunit;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// Reads route and schema property names from shared/api/openapi.yaml by indentation, and checks
/// server responses against them with the serializer options ASP.NET uses for minimal API results.
/// </summary>
internal static class OpenApiSpec
{
    private static readonly Regex PathLine = new(@"^  (/\S*):\s*$", RegexOptions.Compiled);
    private static readonly Regex MethodLine = new(@"^    (get|post|put|patch|delete):\s*$", RegexOptions.Compiled);
    private static readonly Regex SchemaPropertyLine = new(@"^        ([A-Za-z0-9_]+):\s*$", RegexOptions.Compiled);

    public static JsonSerializerOptions ServerJsonOptions { get; } =
        new Microsoft.AspNetCore.Http.Json.JsonOptions().SerializerOptions;

    public static string RepoPath(params string[] relativeSegments)
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", ".."));
        return Path.Combine([root, .. relativeSegments]);
    }

    public static string[] ReadLines()
    {
        return File.ReadAllLines(RepoPath("shared", "api", "openapi.yaml"));
    }

    /// <summary>Returns "METHOD /path" for every operation under <c>paths:</c>.</summary>
    public static SortedSet<string> ReadOperations()
    {
        var operations = new SortedSet<string>(StringComparer.Ordinal);
        string? currentPath = null;
        var inPaths = false;
        foreach (var line in ReadLines())
        {
            if (line == "paths:")
            {
                inPaths = true;
                continue;
            }

            if (inPaths && line.Length > 0 && !char.IsWhiteSpace(line[0]))
            {
                break;
            }

            if (!inPaths)
            {
                continue;
            }

            var pathMatch = PathLine.Match(line);
            if (pathMatch.Success)
            {
                currentPath = pathMatch.Groups[1].Value;
                continue;
            }

            var methodMatch = MethodLine.Match(line);
            if (methodMatch.Success && currentPath != null)
            {
                operations.Add($"{methodMatch.Groups[1].Value.ToUpperInvariant()} {currentPath}");
            }
        }

        return operations;
    }

    /// <summary>Returns the property names listed under <c>components.schemas.{name}.properties</c>.</summary>
    public static SortedSet<string> ReadSchemaProperties(string schemaName)
    {
        var lines = ReadLines();
        var schemasIndex = Array.IndexOf(lines, "  schemas:");
        Assert.True(schemasIndex >= 0, "openapi.yaml has no components.schemas section.");

        var start = Array.IndexOf(lines, $"    {schemaName}:", schemasIndex);
        Assert.True(start >= 0, $"openapi.yaml has no schema named {schemaName}.");

        var properties = new SortedSet<string>(StringComparer.Ordinal);
        var inProperties = false;
        for (var i = start + 1; i < lines.Length; i++)
        {
            var line = lines[i];
            if (line.Length == 0)
            {
                continue;
            }

            var indent = line.Length - line.TrimStart().Length;
            if (indent <= 4)
            {
                break;
            }

            if (indent == 6)
            {
                inProperties = line == "      properties:";
                continue;
            }

            if (inProperties)
            {
                var propertyMatch = SchemaPropertyLine.Match(line);
                if (propertyMatch.Success)
                {
                    properties.Add(propertyMatch.Groups[1].Value);
                }
            }
        }

        return properties;
    }

    public static JsonElement SerializeAsServer<T>(T value)
    {
        return JsonSerializer.SerializeToElement(value, ServerJsonOptions);
    }

    public static void AssertMatchesSchema(JsonElement json, string schemaName)
    {
        Assert.Equal(JsonValueKind.Object, json.ValueKind);
        var returned = new SortedSet<string>(json.EnumerateObject().Select(property => property.Name), StringComparer.Ordinal);
        var specified = ReadSchemaProperties(schemaName);
        Assert.True(
            returned.SetEquals(specified),
            $"{schemaName}: server returns [{string.Join(", ", returned)}] but the spec lists [{string.Join(", ", specified)}].");
    }
}
