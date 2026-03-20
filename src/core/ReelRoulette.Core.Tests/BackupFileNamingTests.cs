using ReelRoulette.Core.Storage;
using Xunit;

namespace ReelRoulette.Core.Tests;

public sealed class BackupFileNamingTests
{
    [Fact]
    public void FormatForBackupSuffix_NegativeOffset_EncodesWith_m_Prefix()
    {
        var dto = new DateTimeOffset(2026, 3, 14, 15, 10, 30, TimeSpan.FromHours(-8));
        Assert.Equal("2026-03-14_15-10-30_m0800", BackupFileNaming.FormatForBackupSuffix(dto));
    }

    [Fact]
    public void FormatForBackupSuffix_PositiveOffset_EncodesWith_p_Prefix()
    {
        var dto = new DateTimeOffset(2026, 3, 14, 23, 5, 1, TimeSpan.FromHours(9));
        Assert.Equal("2026-03-14_23-05-01_p0900", BackupFileNaming.FormatForBackupSuffix(dto));
    }

    [Fact]
    public void FormatForBackupSuffix_FractionalHourOffset_EncodesHoursAndMinutes()
    {
        var dto = new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.FromHours(5) + TimeSpan.FromMinutes(30));
        Assert.Equal("2026-06-01_12-00-00_p0530", BackupFileNaming.FormatForBackupSuffix(dto));
    }

    [Fact]
    public void FormatForBackupSuffix_UtcZeroOffset_Encodes_p0000()
    {
        var dto = new DateTimeOffset(2025, 12, 29, 23, 7, 12, TimeSpan.Zero);
        Assert.Equal("2025-12-29_23-07-12_p0000", BackupFileNaming.FormatForBackupSuffix(dto));
    }

    [Fact]
    public void GetFileOrderingUtcTimestamp_MatchesMaxOfCreationAndLastWriteUtc()
    {
        var temp = Path.Combine(Path.GetTempPath(), "reel-backup-order-" + Guid.NewGuid().ToString("N"));
        File.WriteAllText(temp, "a");
        try
        {
            var fi = new FileInfo(temp);
            var expected = fi.CreationTimeUtc >= fi.LastWriteTimeUtc ? fi.CreationTimeUtc : fi.LastWriteTimeUtc;
            Assert.Equal(expected, BackupFileNaming.GetFileOrderingUtcTimestamp(fi));
        }
        finally
        {
            try
            {
                File.Delete(temp);
            }
            catch
            {
                // best-effort cleanup
            }
        }
    }
}
