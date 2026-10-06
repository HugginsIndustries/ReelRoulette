namespace ReelRoulette.Core.Library;

/// <summary>
/// The stored file name sort key. Comparing two keys byte by byte gives the same order as
/// <see cref="StringComparer.OrdinalIgnoreCase"/> on the names, so SQLite can sort names with an index
/// instead of a managed collation.
/// </summary>
public static class LibraryCatalogNameSortKey
{
    /// <summary>
    /// Raise this when <see cref="Compute"/> changes. The refresh pipeline recomputes every stored key
    /// when the version stored in the catalog differs.
    /// </summary>
    public const int Version = 1;

    /// <summary>
    /// OrdinalIgnoreCase compares code point by code point, after uppercasing each one only where it
    /// treats the uppercase as equal. That is not always <see cref="char.ToUpperInvariant(char)"/>: it
    /// keeps U+017F (long s) apart from S. Each code point, including a lone surrogate, is written in the
    /// UTF-8 bit layout, whose bytes compare in code point order. UTF-16 order would put supplementary
    /// characters such as emoji before U+E000-U+FFFF, where OrdinalIgnoreCase puts them after.
    /// </summary>
    public static byte[] Compute(string fileName)
    {
        ArgumentNullException.ThrowIfNull(fileName);
        var bytes = new List<byte>(fileName.Length + 8);
        for (var i = 0; i < fileName.Length; i++)
        {
            var current = fileName[i];
            int codePoint;
            if (char.IsHighSurrogate(current) && i + 1 < fileName.Length && char.IsLowSurrogate(fileName[i + 1]))
            {
                var pair = fileName.Substring(i, 2);
                var upper = pair.ToUpperInvariant();
                var folded = upper.Length == 2 &&
                             char.IsSurrogatePair(upper[0], upper[1]) &&
                             string.Equals(pair, upper, StringComparison.OrdinalIgnoreCase)
                    ? upper
                    : pair;
                codePoint = char.ConvertToUtf32(folded[0], folded[1]);
                i++;
            }
            else
            {
                var upper = char.ToUpperInvariant(current);
                codePoint = upper != current &&
                            string.Equals(current.ToString(), upper.ToString(), StringComparison.OrdinalIgnoreCase)
                    ? upper
                    : current;
            }

            Append(bytes, codePoint);
        }

        return bytes.ToArray();
    }

    private static void Append(List<byte> bytes, int codePoint)
    {
        if (codePoint < 0x80)
        {
            bytes.Add((byte)codePoint);
        }
        else if (codePoint < 0x800)
        {
            bytes.Add((byte)(0xC0 | (codePoint >> 6)));
            bytes.Add((byte)(0x80 | (codePoint & 0x3F)));
        }
        else if (codePoint < 0x10000)
        {
            bytes.Add((byte)(0xE0 | (codePoint >> 12)));
            bytes.Add((byte)(0x80 | ((codePoint >> 6) & 0x3F)));
            bytes.Add((byte)(0x80 | (codePoint & 0x3F)));
        }
        else
        {
            bytes.Add((byte)(0xF0 | (codePoint >> 18)));
            bytes.Add((byte)(0x80 | ((codePoint >> 12) & 0x3F)));
            bytes.Add((byte)(0x80 | ((codePoint >> 6) & 0x3F)));
            bytes.Add((byte)(0x80 | (codePoint & 0x3F)));
        }
    }
}
