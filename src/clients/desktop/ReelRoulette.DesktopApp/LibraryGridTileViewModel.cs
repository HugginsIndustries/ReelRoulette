namespace ReelRoulette;

public sealed class LibraryGridTileViewModel
{
    public LibraryItemViewModel Item { get; set; } = new(new LibraryItem());
    public double TileWidth { get; set; }
    public double TileHeight { get; set; }
    public int ItemIndex { get; set; } = -1;
    public double AspectRatioUsed { get; set; }
    public string ItemKey { get; set; } = string.Empty;
}
