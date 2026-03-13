using System.Collections.Generic;

namespace ReelRoulette;

public sealed class LibraryGridRowViewModel
{
    public List<LibraryGridTileViewModel> Items { get; set; } = new();
    public int StartItemIndex { get; set; } = -1;
    public int EndItemIndexExclusive { get; set; } = -1;
    public int ItemCount { get; set; }
    public double RowHeight { get; set; }
    public double RowWidth { get; set; }
    public string FirstItemKey { get; set; } = string.Empty;
}
