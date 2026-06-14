namespace ReelRoulette.Core.Library;

public enum LibraryGridMediaType
{
    Video,
    Photo
}

public static class LibraryGridLayout
{
    public const double TargetRowHeight = 300d;
    public const double MinRowHeight = 200d;
    public const double MaxRowHeight = 400d;
    public const double HorizontalGap = 2d;
    public const double VerticalRowGap = 1d;
    public const double VisualRightGutterPx = 8d;
    public const double MinLayoutWidth = 280d;
    public const double MinAspectRatio = 0.25d;
    public const double MaxAspectRatio = 4.0d;
    public const double FallbackPhotoAspectRatio = 4d / 3d;
    public const double FallbackVideoAspectRatio = 16d / 9d;
    public const double FallbackHeight = 100d;

    public static double ComputeAvailableLayoutWidth(double measuredViewportWidth)
    {
        return Math.Max(MinLayoutWidth, measuredViewportWidth - VisualRightGutterPx);
    }

    public static double GetAspectRatio(
        double thumbnailWidth,
        double thumbnailHeight,
        LibraryGridMediaType mediaType)
    {
        if (thumbnailWidth > 0 && thumbnailHeight > 0)
        {
            return Math.Clamp(thumbnailWidth / thumbnailHeight, MinAspectRatio, MaxAspectRatio);
        }

        return mediaType == LibraryGridMediaType.Photo
            ? FallbackPhotoAspectRatio
            : FallbackVideoAspectRatio;
    }

    public static (double Width, double Height) GetFallbackThumbnailDimensions(LibraryGridMediaType mediaType)
    {
        var aspect = mediaType == LibraryGridMediaType.Photo
            ? FallbackPhotoAspectRatio
            : FallbackVideoAspectRatio;
        return (FallbackHeight * aspect, FallbackHeight);
    }

    public static LibraryGridLayoutResult BuildRows(
        IReadOnlyList<double> itemAspectRatios,
        int startIndex,
        int endExclusive,
        double layoutWidth)
    {
        var maxColumns = 1;
        var rows = new List<LibraryGridRowLayout>();

        var pendingAspects = new List<double>();
        var pendingItemIndexes = new List<int>();
        var pendingAspectSum = 0d;

        void AddRow(bool isLastRow)
        {
            if (pendingAspects.Count == 0)
            {
                return;
            }

            var rowHeight = isLastRow
                ? TargetRowHeight
                : (layoutWidth - ((pendingAspects.Count - 1) * HorizontalGap)) / Math.Max(0.01, pendingAspectSum);
            rowHeight = Math.Clamp(rowHeight, MinRowHeight, MaxRowHeight);

            var row = new LibraryGridRowLayout();
            var widths = pendingAspects.Select(aspect => Math.Max(1, aspect * rowHeight)).ToList();
            if (!isLastRow)
            {
                var widthDelta = layoutWidth - ((pendingAspects.Count - 1) * HorizontalGap) - widths.Sum();
                widths[^1] = Math.Max(1, widths[^1] + widthDelta);
            }

            for (var i = 0; i < pendingAspects.Count; i++)
            {
                row.Tiles.Add(new LibraryGridTileLayout
                {
                    TileWidth = widths[i],
                    TileHeight = rowHeight,
                    ItemIndex = pendingItemIndexes[i],
                    AspectRatioUsed = pendingAspects[i]
                });
            }

            row.StartItemIndex = pendingItemIndexes[0];
            row.EndItemIndexExclusive = pendingItemIndexes[^1] + 1;
            row.ItemCount = row.Tiles.Count;
            row.RowHeight = rowHeight;
            row.RowWidth = widths.Sum() + ((row.Tiles.Count - 1) * HorizontalGap);
            rows.Add(row);
            maxColumns = Math.Max(maxColumns, row.Tiles.Count);

            pendingAspects.Clear();
            pendingItemIndexes.Clear();
            pendingAspectSum = 0;
        }

        startIndex = Math.Clamp(startIndex, 0, itemAspectRatios.Count);
        endExclusive = Math.Clamp(endExclusive, startIndex, itemAspectRatios.Count);

        for (var itemIndex = startIndex; itemIndex < endExclusive; itemIndex++)
        {
            var aspect = itemAspectRatios[itemIndex];
            pendingAspects.Add(aspect);
            pendingItemIndexes.Add(itemIndex);
            pendingAspectSum += aspect;

            var projectedWidth = (pendingAspectSum * TargetRowHeight) + ((pendingAspects.Count - 1) * HorizontalGap);
            if (projectedWidth >= layoutWidth && pendingAspects.Count > 0)
            {
                AddRow(isLastRow: false);
            }
        }

        AddRow(isLastRow: true);
        return new LibraryGridLayoutResult(rows, maxColumns);
    }
}

public sealed class LibraryGridLayoutResult
{
    public LibraryGridLayoutResult(IReadOnlyList<LibraryGridRowLayout> rows, int maxColumns)
    {
        Rows = rows;
        MaxColumns = maxColumns;
    }

    public IReadOnlyList<LibraryGridRowLayout> Rows { get; }
    public int MaxColumns { get; }
}

public sealed class LibraryGridRowLayout
{
    public List<LibraryGridTileLayout> Tiles { get; } = [];
    public int StartItemIndex { get; set; } = -1;
    public int EndItemIndexExclusive { get; set; } = -1;
    public int ItemCount { get; set; }
    public double RowHeight { get; set; }
    public double RowWidth { get; set; }
}

public sealed class LibraryGridTileLayout
{
    public double TileWidth { get; set; }
    public double TileHeight { get; set; }
    public int ItemIndex { get; set; } = -1;
    public double AspectRatioUsed { get; set; }
}
