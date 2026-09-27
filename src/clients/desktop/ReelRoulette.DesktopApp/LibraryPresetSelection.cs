using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace ReelRoulette;

/// <summary>
/// Library-panel preset list and filter-dialog heading.
/// None is the default filter. A starred row is the unsaved filter and stays first.
/// </summary>
public static class LibraryPresetSelection
{
    public const string NoneLabel = "None";
    public const string StarredTag = "\u0000starred";

    public enum PresetPick
    {
        Keep,
        Default,
        Named
    }

    public readonly record struct PresetAnchor(string? BaseName, bool Starred)
    {
        public string Label => Starred ? $"{BaseName ?? NoneLabel}*" : (BaseName ?? NoneLabel);
    }

    public readonly record struct PresetListRow(string Label, string Tag);

    public static FilterState FilterStateForSelection(FilterPreset? preset)
    {
        if (preset == null)
        {
            return new FilterState();
        }

        var json = JsonSerializer.Serialize(preset.FilterState);
        return JsonSerializer.Deserialize<FilterState>(json) ?? new FilterState();
    }

    public static bool FiltersEqual(FilterState? left, FilterState? right)
    {
        return FilterSnapshot(left) == FilterSnapshot(right);
    }

    public static string FilterSnapshot(FilterState? filter)
    {
        return JsonSerializer.Serialize(filter ?? new FilterState());
    }

    public static bool SameFilterSnapshot(string? snapshot, FilterState? current)
    {
        return string.Equals(snapshot, FilterSnapshot(current), StringComparison.Ordinal);
    }

    public static FilterState CopyFilter(FilterState? filter)
    {
        return JsonSerializer.Deserialize<FilterState>(FilterSnapshot(filter)) ?? new FilterState();
    }

    /// <summary>
    /// None in the filter dialog keeps the working filter.
    /// A filter that still equals a saved preset stays on that preset; otherwise the base is cleared.
    /// </summary>
    public readonly record struct DialogPresetChoice(string? ActivePresetName, string SelectedPresetName);

    public static DialogPresetChoice AfterDialogNone(FilterState? current, IEnumerable<FilterPreset>? presets)
    {
        var anchor = Resolve(current, presets, previousBase: null);
        if (!anchor.Starred && !string.IsNullOrEmpty(anchor.BaseName))
        {
            return new DialogPresetChoice(anchor.BaseName, anchor.BaseName);
        }

        return new DialogPresetChoice(null, NoneLabel);
    }

    /// <summary>
    /// A saved preset whose filter equals the current one is selected.
    /// While <paramref name="holdNone"/> is set, the default filter stays on None
    /// even when a saved preset has that same filter.
    /// </summary>
    public static PresetAnchor Resolve(
        FilterState? current,
        IEnumerable<FilterPreset>? presets,
        string? previousBase,
        bool holdNone = false)
    {
        current ??= new FilterState();
        var catalog = (presets ?? []).Where(preset => !string.IsNullOrWhiteSpace(preset.Name)).ToList();

        if (holdNone && FiltersEqual(current, new FilterState()))
        {
            return new PresetAnchor(null, false);
        }

        var local = catalog.FirstOrDefault(preset => FiltersEqual(current, preset.FilterState));
        if (local != null)
        {
            return new PresetAnchor(local.Name, false);
        }

        if (FiltersEqual(current, new FilterState()))
        {
            return new PresetAnchor(null, false);
        }

        var existingBase = FindByName(catalog, previousBase);
        if (existingBase != null)
        {
            return new PresetAnchor(existingBase.Name, true);
        }

        return new PresetAnchor(null, true);
    }

    public static IReadOnlyList<PresetListRow> BuildRows(PresetAnchor anchor, IEnumerable<FilterPreset>? presets)
    {
        var rows = new List<PresetListRow>();
        if (anchor.Starred)
        {
            rows.Add(new PresetListRow(anchor.Label, StarredTag));
        }

        rows.Add(new PresetListRow(NoneLabel, NoneLabel));
        foreach (var preset in presets ?? [])
        {
            if (string.IsNullOrWhiteSpace(preset.Name))
            {
                continue;
            }

            rows.Add(new PresetListRow(preset.Name, preset.Name));
        }

        return rows;
    }

    public static string SelectedTag(PresetAnchor anchor)
    {
        return anchor.Starred ? StarredTag : (anchor.BaseName ?? NoneLabel);
    }

    public static string Heading(PresetAnchor anchor)
    {
        return $"Preset: {anchor.Label}";
    }

    public static PresetPick Pick(string? tag)
    {
        if (tag == StarredTag)
        {
            return PresetPick.Keep;
        }

        if (string.IsNullOrEmpty(tag) || tag == NoneLabel)
        {
            return PresetPick.Default;
        }

        return PresetPick.Named;
    }

    private static FilterPreset? FindByName(IEnumerable<FilterPreset> presets, string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return null;
        }

        return presets.FirstOrDefault(preset => string.Equals(preset.Name, name, StringComparison.OrdinalIgnoreCase));
    }
}
