using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using Avalonia.Media.Imaging;

namespace ReelRoulette;

public sealed class LibraryItemViewModel : INotifyPropertyChanged, IDisposable
{
    private LibraryItem _item;
    private string _thumbnailPath = string.Empty;
    private Bitmap? _thumbnailBitmap;
    private double _thumbnailWidth;
    private double _thumbnailHeight;

    public LibraryItemViewModel(LibraryItem item)
    {
        _item = item ?? throw new ArgumentNullException(nameof(item));
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

    public double ThumbnailWidth
    {
        get => _thumbnailWidth;
        set => SetField(ref _thumbnailWidth, value);
    }

    public double ThumbnailHeight
    {
        get => _thumbnailHeight;
        set => SetField(ref _thumbnailHeight, value);
    }

    public void Dispose()
    {
        _thumbnailBitmap?.Dispose();
        _thumbnailBitmap = null;
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
