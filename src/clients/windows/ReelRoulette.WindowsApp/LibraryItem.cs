using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using Avalonia.Media.Imaging;

namespace ReelRoulette
{
    /// <summary>
    /// Represents a single video file in the library with all its metadata.
    /// </summary>
    public class LibraryItem : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler? PropertyChanged;

        private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }

        private bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
        {
            if (EqualityComparer<T>.Default.Equals(field, value))
            {
                return false;
            }

            field = value;
            OnPropertyChanged(propertyName);
            return true;
        }

        /// <summary>
        /// Stable item identity for path changes (rename/move).
        /// </summary>
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        /// <summary>
        /// Reference to the LibrarySource that contains this item.
        /// </summary>
        [JsonPropertyName("sourceId")]
        public string SourceId { get; set; } = string.Empty;

        /// <summary>
        /// Absolute file path.
        /// </summary>
        [JsonPropertyName("fullPath")]
        public string FullPath { get; set; } = string.Empty;

        /// <summary>
        /// Path relative to the source root.
        /// </summary>
        [JsonPropertyName("relativePath")]
        public string RelativePath { get; set; } = string.Empty;

        /// <summary>
        /// File name (without path).
        /// </summary>
        [JsonPropertyName("fileName")]
        public string FileName { get; set; } = string.Empty;

        /// <summary>
        /// Duration of the video. Null if unknown.
        /// </summary>
        [JsonPropertyName("duration")]
        public TimeSpan? Duration { get; set; }

        /// <summary>
        /// Whether the video has audio. Null if unknown.
        /// </summary>
        [JsonPropertyName("hasAudio")]
        public bool? HasAudio { get; set; }

        /// <summary>
        /// Integrated loudness in LUFS, if available.
        /// </summary>
        [JsonPropertyName("integratedLoudness")]
        public double? IntegratedLoudness { get; set; }

        /// <summary>
        /// Peak volume in dB, if available.
        /// </summary>
        [JsonPropertyName("peakDb")]
        public double? PeakDb { get; set; }

        /// <summary>
        /// Whether this item is marked as a favorite.
        /// </summary>
        private bool _isFavorite;

        [JsonPropertyName("isFavorite")]
        public bool IsFavorite
        {
            get => _isFavorite;
            set
            {
                if (SetField(ref _isFavorite, value))
                {
                    OnPropertyChanged(nameof(HasGridStateIndicator));
                }
            }
        }

        /// <summary>
        /// Whether this item is blacklisted.
        /// </summary>
        private bool _isBlacklisted;

        [JsonPropertyName("isBlacklisted")]
        public bool IsBlacklisted
        {
            get => _isBlacklisted;
            set
            {
                if (SetField(ref _isBlacklisted, value))
                {
                    OnPropertyChanged(nameof(HasGridStateIndicator));
                }
            }
        }

        [JsonIgnore]
        public bool HasGridStateIndicator => IsFavorite || IsBlacklisted;

        /// <summary>
        /// Number of times this video has been played.
        /// </summary>
        [JsonPropertyName("playCount")]
        public int PlayCount { get; set; }

        /// <summary>
        /// UTC timestamp of when this video was last played. Null if never played.
        /// </summary>
        [JsonPropertyName("lastPlayedUtc")]
        public DateTime? LastPlayedUtc { get; set; }

        /// <summary>
        /// List of tags assigned to this item.
        /// </summary>
        [JsonPropertyName("tags")]
        public List<string> Tags { get; set; } = new List<string>();

        /// <summary>
        /// Type of media (Video or Photo). Defaults to Video for backward compatibility.
        /// </summary>
        [JsonPropertyName("mediaType")]
        public MediaType MediaType { get; set; } = MediaType.Video;

        /// <summary>
        /// Full-file fingerprint hash (SHA-256).
        /// </summary>
        [JsonPropertyName("fingerprint")]
        public string? Fingerprint { get; set; }

        /// <summary>
        /// Fingerprint algorithm name (e.g. SHA-256).
        /// </summary>
        [JsonPropertyName("fingerprintAlgorithm")]
        public string FingerprintAlgorithm { get; set; } = "SHA-256";

        /// <summary>
        /// Fingerprint format/schema version.
        /// </summary>
        [JsonPropertyName("fingerprintVersion")]
        public int FingerprintVersion { get; set; } = 1;

        /// <summary>
        /// Cached file size in bytes.
        /// </summary>
        [JsonPropertyName("fileSizeBytes")]
        public long? FileSizeBytes { get; set; }

        /// <summary>
        /// Cached file last-write timestamp in UTC.
        /// </summary>
        [JsonPropertyName("lastWriteTimeUtc")]
        public DateTime? LastWriteTimeUtc { get; set; }

        /// <summary>
        /// Last time fingerprinting was attempted/completed.
        /// </summary>
        [JsonPropertyName("fingerprintLastUtc")]
        public DateTime? FingerprintLastUtc { get; set; }

        /// <summary>
        /// Fingerprint state for background processing and UI.
        /// </summary>
        [JsonPropertyName("fingerprintStatus")]
        public FingerprintStatus FingerprintStatus { get; set; } = FingerprintStatus.Pending;

        private string _thumbnailPath = string.Empty;
        private Bitmap? _thumbnailBitmap;

        [JsonIgnore]
        public string ThumbnailPath
        {
            get => _thumbnailPath;
            set
            {
                if (string.Equals(_thumbnailPath, value, StringComparison.Ordinal))
                {
                    return;
                }

                _thumbnailBitmap?.Dispose();
                _thumbnailPath = value ?? string.Empty;
                _thumbnailBitmap = null;
                OnPropertyChanged();
                OnPropertyChanged(nameof(ThumbnailBitmap));
            }
        }

        [JsonIgnore]
        public Bitmap? ThumbnailBitmap
        {
            get
            {
                if (_thumbnailBitmap != null)
                {
                    return _thumbnailBitmap;
                }

                if (string.IsNullOrWhiteSpace(_thumbnailPath))
                {
                    return null;
                }

                try
                {
                    _thumbnailBitmap = new Bitmap(_thumbnailPath);
                }
                catch
                {
                    _thumbnailBitmap = null;
                }

                return _thumbnailBitmap;
            }
        }

        private double _thumbnailWidth;

        [JsonIgnore]
        public double ThumbnailWidth
        {
            get => _thumbnailWidth;
            set => SetField(ref _thumbnailWidth, value);
        }

        private double _thumbnailHeight;

        [JsonIgnore]
        public double ThumbnailHeight
        {
            get => _thumbnailHeight;
            set => SetField(ref _thumbnailHeight, value);
        }
    }
}

