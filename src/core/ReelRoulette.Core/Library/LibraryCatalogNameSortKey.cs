using System.Runtime.CompilerServices;

namespace ReelRoulette.Core.Library;

/// <summary>
/// The stored file name sort key. Comparing two keys byte by byte orders the names like
/// <see cref="StringComparer.OrdinalIgnoreCase"/> (see <see cref="Compute"/>), so SQLite can sort names
/// with an index instead of a managed collation.
/// </summary>
public static class LibraryCatalogNameSortKey
{
    /// <summary>
    /// Raise this when the output of <see cref="Compute"/> changes, including when a .NET update changes
    /// its casing table. The refresh pipeline recomputes every stored key when the version stored in the
    /// catalog differs.
    /// </summary>
    public const int Version = 1;

    /// <summary>
    /// OrdinalIgnoreCase uppercases each code point and compares them in order. Above U+FFFF it takes the
    /// uppercase from .NET's built-in Unicode table, and below it from the system's ICU, as
    /// <see cref="char.ToUpperInvariant(char)"/> does everywhere. The key uses the built-in table for
    /// every code point, so it is the same whatever the ICU version, and differs from OrdinalIgnoreCase
    /// only on a letter that the ICU or the table is too old to know. The table keeps U+0131 (dotless i)
    /// and U+017F (long s) apart from I and S, as OrdinalIgnoreCase does. Each code point, including a
    /// lone surrogate, is written in the UTF-8 bit layout, whose bytes compare in code point order. UTF-16
    /// order would put supplementary characters such as emoji before U+E000-U+FFFF, where
    /// OrdinalIgnoreCase puts them after.
    /// </summary>
    public static byte[] Compute(string fileName)
    {
        ArgumentNullException.ThrowIfNull(fileName);
        var bytes = new List<byte>(fileName.Length + 8);
        for (var i = 0; i < fileName.Length; i++)
        {
            var current = fileName[i];
            uint codePoint = current;
            if (char.IsHighSurrogate(current) && i + 1 < fileName.Length && char.IsLowSurrogate(fileName[i + 1]))
            {
                codePoint = (uint)char.ConvertToUtf32(current, fileName[i + 1]);
                i++;
            }

            Append(bytes, (int)BuiltInToUpper(null, codePoint));
        }

        return bytes.ToArray();
    }

    /// <summary>
    /// .NET's built-in simple uppercase mapping. It is internal, and every public uppercase method uses ICU.
    /// </summary>
    [UnsafeAccessor(UnsafeAccessorKind.StaticMethod, Name = "ToUpper")]
    private static extern uint BuiltInToUpper(
        [UnsafeAccessorType("System.Globalization.CharUnicodeInfo, System.Private.CoreLib")] object? declaringType,
        uint codePoint);

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
