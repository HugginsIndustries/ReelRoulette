using System.Collections.Generic;

namespace ReelRoulette;

public sealed class LibraryGridRowViewModel
{
    public List<LibraryGridTileViewModel> Items { get; set; } = new();
}
