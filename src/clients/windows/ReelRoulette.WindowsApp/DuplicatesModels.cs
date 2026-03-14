using System;
using System.Collections.Generic;

namespace ReelRoulette
{
    public enum DuplicateScanScope
    {
        CurrentSource = 0,
        AllEnabledSources = 1,
        AllSources = 2
    }

    public class DuplicateScanResult
    {
        public List<DuplicateGroup> Groups { get; set; } = new List<DuplicateGroup>();
        public int ExcludedPending { get; set; }
        public int ExcludedFailed { get; set; }
        public int ExcludedStale { get; set; }
    }

    public class DuplicateGroup
    {
        public string Fingerprint { get; set; } = string.Empty;
        public List<DuplicateGroupItem> Items { get; set; } = new List<DuplicateGroupItem>();
    }

    public class DuplicateGroupItem
    {
        public string ItemId { get; set; } = string.Empty;
        public string FullPath { get; set; } = string.Empty;
        public string SourceId { get; set; } = string.Empty;
        public bool IsFavorite { get; set; }
        public bool IsBlacklisted { get; set; }
        public int PlayCount { get; set; }
        public DateTime? LastPlayedUtc { get; set; }
        public long? FileSizeBytes { get; set; }
        public DateTime? LastWriteTimeUtc { get; set; }
    }
}
