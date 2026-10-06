using System.Security.Cryptography;

namespace ReelRoulette.Core.Tests;

/// <summary>
/// Every file under a folder, by relative path, with a hash of its bytes. Two equal snapshots mean
/// nothing was created, removed, or changed.
/// </summary>
internal static class FolderSnapshot
{
    public static SortedDictionary<string, string> Take(string directory)
    {
        var files = new SortedDictionary<string, string>(StringComparer.Ordinal);
        foreach (var path in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(directory, path).Replace('\\', '/');
            files[relative] = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));
        }

        return files;
    }
}
