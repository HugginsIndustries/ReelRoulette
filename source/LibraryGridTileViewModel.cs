namespace ReelRoulette;

public sealed class LibraryGridTileViewModel
{
    public LibraryItem Item { get; set; } = new();
    public double TileWidth { get; set; }
    public double TileHeight { get; set; }
}
