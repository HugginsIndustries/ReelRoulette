using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using ReelRoulette.Core.Library;

namespace ReelRoulette;

public sealed class LibraryItemViewModel : INotifyPropertyChanged, IDisposable
{
    private LibraryItem _item;
    private Bitmap? _thumbnailBitmap;
    private double _thumbnailWidth;
    private double _thumbnailHeight;
    private bool _hasThumbnail;
    private bool _isSelected;
    private int _thumbnailLoadGeneration;

    public LibraryItemViewModel(LibraryItem item)
    {
        _item = item ?? throw new ArgumentNullException(nameof(item));
        ApplyThumbnailProjectionFromItem(item);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public LibraryItem Item
    {
        get => _item;
        set
        {
            if (ReferenceEquals(_item, value))
            {
                return;
            }

            _item = value ?? throw new ArgumentNullException(nameof(value));
            OnPropertyChanged(nameof(Id));
            OnPropertyChanged(nameof(SourceId));
            OnPropertyChanged(nameof(FullPath));
            OnPropertyChanged(nameof(RelativePath));
            OnPropertyChanged(nameof(FileName));
            OnPropertyChanged(nameof(IsFavorite));
            OnPropertyChanged(nameof(IsBlacklisted));
            OnPropertyChanged(nameof(HasGridStateIndicator));
            OnPropertyChanged(nameof(MediaType));
            ApplyThumbnailProjectionFromItem(_item);
        }
    }

    public string Id => Item.Id;
    public string SourceId => Item.SourceId;
    public string FullPath => Item.FullPath;
    public string RelativePath => Item.RelativePath;
    public string FileName => Item.FileName;
    public MediaType MediaType => Item.MediaType;

    public bool IsFavorite
    {
        get => Item.IsFavorite;
        set
        {
            if (Item.IsFavorite == value)
            {
                return;
            }

            Item.IsFavorite = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasGridStateIndicator));
        }
    }

    public bool IsBlacklisted
    {
        get => Item.IsBlacklisted;
        set
        {
            if (Item.IsBlacklisted == value)
            {
                return;
            }

            Item.IsBlacklisted = value;
            OnPropertyChanged();
            OnPropertyChanged(nameof(HasGridStateIndicator));
        }
    }

    public bool HasGridStateIndicator => IsFavorite || IsBlacklisted;

    public bool IsSelected
    {
        get => _isSelected;
        set => SetField(ref _isSelected, value);
    }

    public bool HasThumbnail
    {
        get => _hasThumbnail;
        private set => SetField(ref _hasThumbnail, value);
    }

    public Bitmap? ThumbnailBitmap
    {
        get => _thumbnailBitmap;
        private set
        {
            if (ReferenceEquals(_thumbnailBitmap, value))
            {
                return;
            }

            _thumbnailBitmap?.Dispose();
            _thumbnailBitmap = value;
            OnPropertyChanged();
        }
    }

    public double ThumbnailWidth
    {
        get => _thumbnailWidth;
        private set => SetField(ref _thumbnailWidth, value);
    }

    public double ThumbnailHeight
    {
        get => _thumbnailHeight;
        private set => SetField(ref _thumbnailHeight, value);
    }

    /// <summary>
    /// Replaces projection item data and clears the cached thumbnail only when identity or thumbnail metadata changed.
    /// Returns true when layout-affecting thumbnail dimensions changed.
    /// </summary>
    public bool SyncFromProjectionItem(LibraryItem item)
    {
        if (item == null)
        {
            throw new ArgumentNullException(nameof(item));
        }

        var previousWidth = ThumbnailWidth;
        var previousHeight = ThumbnailHeight;
        var shouldClearThumbnail =
            !string.Equals(_item.Id, item.Id, StringComparison.OrdinalIgnoreCase) ||
            _item.HasThumbnail != item.HasThumbnail ||
            _item.ThumbnailWidth != item.ThumbnailWidth ||
            _item.ThumbnailHeight != item.ThumbnailHeight;

        Item = item;

        if (shouldClearThumbnail)
        {
            ClearThumbnailBitmap();
        }

        return Math.Abs(previousWidth - ThumbnailWidth) > 0.01 ||
               Math.Abs(previousHeight - ThumbnailHeight) > 0.01;
    }

    public void ApplyThumbnailProjectionFromItem(LibraryItem item)
    {
        HasThumbnail = item.HasThumbnail;
        if (item.ThumbnailWidth is > 0 && item.ThumbnailHeight is > 0)
        {
            ThumbnailWidth = item.ThumbnailWidth.Value;
            ThumbnailHeight = item.ThumbnailHeight.Value;
            return;
        }

        var mediaType = item.MediaType == MediaType.Photo
            ? LibraryGridMediaType.Photo
            : LibraryGridMediaType.Video;
        var fallback = LibraryGridLayout.GetFallbackThumbnailDimensions(mediaType);
        ThumbnailWidth = fallback.Width;
        ThumbnailHeight = fallback.Height;
    }

    public double GetThumbnailAspectRatio()
    {
        var mediaType = MediaType == MediaType.Photo
            ? LibraryGridMediaType.Photo
            : LibraryGridMediaType.Video;
        return LibraryGridLayout.GetAspectRatio(ThumbnailWidth, ThumbnailHeight, mediaType);
    }

    public void ClearThumbnailBitmap()
    {
        Interlocked.Increment(ref _thumbnailLoadGeneration);
        ThumbnailBitmap = null;
    }

    public async Task LoadThumbnailAsync(HttpClient httpClient, string? coreServerBaseUrl, CancellationToken cancellationToken = default)
    {
        if (!HasThumbnail || string.IsNullOrWhiteSpace(Id) || string.IsNullOrWhiteSpace(coreServerBaseUrl))
        {
            return;
        }

        if (_thumbnailBitmap != null)
        {
            return;
        }

        var uri = BuildThumbnailUri(coreServerBaseUrl, Id);
        if (string.IsNullOrWhiteSpace(uri))
        {
            return;
        }

        var loadGeneration = Volatile.Read(ref _thumbnailLoadGeneration);
        try
        {
            await using var stream = await httpClient.GetStreamAsync(uri, cancellationToken).ConfigureAwait(false);
            using var memoryStream = new MemoryStream();
            await stream.CopyToAsync(memoryStream, cancellationToken).ConfigureAwait(false);
            memoryStream.Position = 0;
            var bitmap = new Bitmap(memoryStream);
            if (loadGeneration != Volatile.Read(ref _thumbnailLoadGeneration))
            {
                bitmap.Dispose();
                return;
            }

            if (Dispatcher.UIThread.CheckAccess())
            {
                ThumbnailBitmap = bitmap;
            }
            else
            {
                await Dispatcher.UIThread.InvokeAsync(() => ThumbnailBitmap = bitmap);
            }
        }
        catch
        {
            // Keep placeholder visible when thumbnail is unavailable.
        }
    }

    public void Dispose()
    {
        ClearThumbnailBitmap();
    }

    private static string BuildThumbnailUri(string coreServerBaseUrl, string itemId)
    {
        if (string.IsNullOrWhiteSpace(coreServerBaseUrl) || string.IsNullOrWhiteSpace(itemId))
        {
            return string.Empty;
        }

        if (!Uri.TryCreate(coreServerBaseUrl, UriKind.Absolute, out var baseUri))
        {
            return string.Empty;
        }

        var builder = new UriBuilder(baseUri)
        {
            Path = $"/api/thumbnail/{Uri.EscapeDataString(itemId)}",
            Query = string.Empty
        };
        return builder.Uri.AbsoluteUri;
    }

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
}
