using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace ReelRoulette
{
    public partial class SettingsDialog : Window, INotifyPropertyChanged
    {
        private bool _wasApplied = false;
        
        // Playback behavior
        private bool _loopEnabled;
        private bool _autoPlayNext;
        private bool _noRepeatMode;
        
        // Timer interval
        private decimal _timerIntervalSeconds;
        
        // Photo display duration
        private int _photoDisplayDurationSeconds = 5;
        
        // Seek step
        private bool _seekStepFrame;
        private bool _seekStep1s;
        private bool _seekStep5s;
        private bool _seekStep10s;
        
        // Volume step
        private bool _volumeStep1;
        private bool _volumeStep2;
        private bool _volumeStep5;
        
        // Volume normalization
        private bool _volumeNormalizationEnabled;
        private double _maxReductionDb;
        private double _maxBoostDb;
        private bool _baselineAutoMode;
        private double _baselineOverrideLUFS;

        public SettingsDialog()
        {
            InitializeComponent();
            DataContext = this;
            
            // Set defaults
            _loopEnabled = true;
            _autoPlayNext = true;
            _noRepeatMode = true;
            _timerIntervalSeconds = 300;
            _seekStep5s = true;
            _volumeStep5 = true;
            _volumeNormalizationEnabled = false;
            _maxReductionDb = 15.0;
            _maxBoostDb = 5.0;
            _baselineAutoMode = true;
            _baselineOverrideLUFS = -23.0;
        }

        public bool WasApplied => _wasApplied;

        // Playback behavior properties
        public bool LoopEnabled
        {
            get => _loopEnabled;
            set
            {
                if (_loopEnabled != value)
                {
                    _loopEnabled = value;
                    OnPropertyChanged();
                }
            }
        }

        public bool AutoPlayNext
        {
            get => _autoPlayNext;
            set
            {
                if (_autoPlayNext != value)
                {
                    _autoPlayNext = value;
                    OnPropertyChanged();
                }
            }
        }

        public bool NoRepeatMode
        {
            get => _noRepeatMode;
            set
            {
                if (_noRepeatMode != value)
                {
                    _noRepeatMode = value;
                    OnPropertyChanged();
                }
            }
        }

        // Timer interval property
        public decimal TimerIntervalSeconds
        {
            get => _timerIntervalSeconds;
            set
            {
                if (_timerIntervalSeconds != value)
                {
                    _timerIntervalSeconds = value;
                    OnPropertyChanged();
                }
            }
        }

        // Seek step properties
        public bool SeekStepFrame
        {
            get => _seekStepFrame;
            set
            {
                if (value)
                {
                    _seekStepFrame = true;
                    _seekStep1s = false;
                    _seekStep5s = false;
                    _seekStep10s = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(SeekStep1s));
                    OnPropertyChanged(nameof(SeekStep5s));
                    OnPropertyChanged(nameof(SeekStep10s));
                }
            }
        }

        public bool SeekStep1s
        {
            get => _seekStep1s;
            set
            {
                if (value)
                {
                    _seekStepFrame = false;
                    _seekStep1s = true;
                    _seekStep5s = false;
                    _seekStep10s = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(SeekStepFrame));
                    OnPropertyChanged(nameof(SeekStep5s));
                    OnPropertyChanged(nameof(SeekStep10s));
                }
            }
        }

        public bool SeekStep5s
        {
            get => _seekStep5s;
            set
            {
                if (value)
                {
                    _seekStepFrame = false;
                    _seekStep1s = false;
                    _seekStep5s = true;
                    _seekStep10s = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(SeekStepFrame));
                    OnPropertyChanged(nameof(SeekStep1s));
                    OnPropertyChanged(nameof(SeekStep10s));
                }
            }
        }

        public bool SeekStep10s
        {
            get => _seekStep10s;
            set
            {
                if (value)
                {
                    _seekStepFrame = false;
                    _seekStep1s = false;
                    _seekStep5s = false;
                    _seekStep10s = true;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(SeekStepFrame));
                    OnPropertyChanged(nameof(SeekStep1s));
                    OnPropertyChanged(nameof(SeekStep5s));
                }
            }
        }

        // Volume step properties
        public bool VolumeStep1
        {
            get => _volumeStep1;
            set
            {
                if (value)
                {
                    _volumeStep1 = true;
                    _volumeStep2 = false;
                    _volumeStep5 = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(VolumeStep2));
                    OnPropertyChanged(nameof(VolumeStep5));
                }
            }
        }

        public bool VolumeStep2
        {
            get => _volumeStep2;
            set
            {
                if (value)
                {
                    _volumeStep1 = false;
                    _volumeStep2 = true;
                    _volumeStep5 = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(VolumeStep1));
                    OnPropertyChanged(nameof(VolumeStep5));
                }
            }
        }

        public bool VolumeStep5
        {
            get => _volumeStep5;
            set
            {
                if (value)
                {
                    _volumeStep1 = false;
                    _volumeStep2 = false;
                    _volumeStep5 = true;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(VolumeStep1));
                    OnPropertyChanged(nameof(VolumeStep2));
                }
            }
        }

        // Volume normalization property
        public bool VolumeNormalizationEnabled
        {
            get => _volumeNormalizationEnabled;
            set
            {
                if (_volumeNormalizationEnabled != value)
                {
                    _volumeNormalizationEnabled = value;
                    OnPropertyChanged();
                }
            }
        }

        public double MaxReductionDb
        {
            get => _maxReductionDb;
            set
            {
                if (Math.Abs(_maxReductionDb - value) > 0.01)
                {
                    _maxReductionDb = value;
                    OnPropertyChanged();
                }
            }
        }

        public double MaxBoostDb
        {
            get => _maxBoostDb;
            set
            {
                if (Math.Abs(_maxBoostDb - value) > 0.01)
                {
                    _maxBoostDb = value;
                    OnPropertyChanged();
                }
            }
        }

        public bool BaselineAutoMode
        {
            get => _baselineAutoMode;
            set
            {
                if (_baselineAutoMode != value)
                {
                    _baselineAutoMode = value;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(BaselineManualMode));
                }
            }
        }

        public bool BaselineManualMode
        {
            get => !_baselineAutoMode;
            set
            {
                if (_baselineAutoMode == value) // inverted logic
                {
                    _baselineAutoMode = !value;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(BaselineAutoMode));
                }
            }
        }

        public double BaselineOverrideLUFS
        {
            get => _baselineOverrideLUFS;
            set
            {
                if (Math.Abs(_baselineOverrideLUFS - value) > 0.01)
                {
                    _baselineOverrideLUFS = value;
                    OnPropertyChanged();
                }
            }
        }

        // Photo display duration property
        public int PhotoDisplayDurationSeconds
        {
            get => _photoDisplayDurationSeconds;
            set
            {
                if (_photoDisplayDurationSeconds != value)
                {
                    _photoDisplayDurationSeconds = value;
                    OnPropertyChanged();
                }
            }
        }

        // Image scaling
        private ImageScalingMode _imageScalingMode = ImageScalingMode.Auto;
        private int _fixedImageMaxWidth = 3840;
        private int _fixedImageMaxHeight = 2160;
        
        // Missing file behavior
        private MissingFileBehavior _missingFileBehavior = MissingFileBehavior.AlwaysShowDialog;
        
        // Backup settings
        private bool _backupLibraryEnabled = true;
        private int _minimumBackupGapMinutes = 15;
        private int _numberOfBackups = 10;

        // Image scaling mode properties
        public bool ImageScalingOff
        {
            get => _imageScalingMode == ImageScalingMode.Off;
            set
            {
                if (value)
                {
                    _imageScalingMode = ImageScalingMode.Off;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(ImageScalingAuto));
                    OnPropertyChanged(nameof(ImageScalingFixed));
                }
            }
        }

        public bool ImageScalingAuto
        {
            get => _imageScalingMode == ImageScalingMode.Auto;
            set
            {
                if (value)
                {
                    _imageScalingMode = ImageScalingMode.Auto;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(ImageScalingOff));
                    OnPropertyChanged(nameof(ImageScalingFixed));
                }
            }
        }

        public bool ImageScalingFixed
        {
            get => _imageScalingMode == ImageScalingMode.Fixed;
            set
            {
                if (value)
                {
                    _imageScalingMode = ImageScalingMode.Fixed;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(ImageScalingOff));
                    OnPropertyChanged(nameof(ImageScalingAuto));
                }
            }
        }

        // Fixed image max dimensions
        public int FixedImageMaxWidth
        {
            get => _fixedImageMaxWidth;
            set
            {
                if (_fixedImageMaxWidth != value)
                {
                    _fixedImageMaxWidth = value;
                    OnPropertyChanged();
                }
            }
        }

        public int FixedImageMaxHeight
        {
            get => _fixedImageMaxHeight;
            set
            {
                if (_fixedImageMaxHeight != value)
                {
                    _fixedImageMaxHeight = value;
                    OnPropertyChanged();
                }
            }
        }

        public ImageScalingMode ImageScalingMode => _imageScalingMode;

        // Missing file behavior properties
        public bool MissingFileBehaviorAlwaysShowDialog
        {
            get => _missingFileBehavior == MissingFileBehavior.AlwaysShowDialog;
            set
            {
                if (value)
                {
                    _missingFileBehavior = MissingFileBehavior.AlwaysShowDialog;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(MissingFileBehaviorAlwaysRemoveFromLibrary));
                }
            }
        }

        public bool MissingFileBehaviorAlwaysRemoveFromLibrary
        {
            get => _missingFileBehavior == MissingFileBehavior.AlwaysRemoveFromLibrary;
            set
            {
                if (value)
                {
                    _missingFileBehavior = MissingFileBehavior.AlwaysRemoveFromLibrary;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(MissingFileBehaviorAlwaysShowDialog));
                }
            }
        }

        public MissingFileBehavior MissingFileBehavior => _missingFileBehavior;

        // Backup settings properties
        public bool BackupLibraryEnabled
        {
            get => _backupLibraryEnabled;
            set
            {
                if (_backupLibraryEnabled != value)
                {
                    _backupLibraryEnabled = value;
                    OnPropertyChanged();
                }
            }
        }

        public int MinimumBackupGapMinutes
        {
            get => _minimumBackupGapMinutes;
            set
            {
                if (_minimumBackupGapMinutes != value)
                {
                    _minimumBackupGapMinutes = value;
                    OnPropertyChanged();
                }
            }
        }

        public int NumberOfBackups
        {
            get => _numberOfBackups;
            set
            {
                if (_numberOfBackups != value)
                {
                    _numberOfBackups = value;
                    OnPropertyChanged();
                }
            }
        }

        // Helper methods to get/set from AppSettings-like structure
        public void LoadFromSettings(
            bool loopEnabled,
            bool autoPlayNext,
            bool noRepeatMode,
            double? intervalSeconds,
            string? seekStep,
            int volumeStep,
            bool volumeNormalizationEnabled,
            double maxReductionDb = 15.0,
            double maxBoostDb = 5.0,
            bool baselineAutoMode = true,
            double baselineOverrideLUFS = -23.0,
            int photoDisplayDurationSeconds = 5,
            ImageScalingMode imageScalingMode = ImageScalingMode.Auto,
            int fixedImageMaxWidth = 3840,
            int fixedImageMaxHeight = 2160,
            MissingFileBehavior missingFileBehavior = MissingFileBehavior.AlwaysShowDialog,
            bool backupLibraryEnabled = true,
            int minimumBackupGapMinutes = 15,
            int numberOfBackups = 10)
        {
            // Set backing fields directly and notify
            _loopEnabled = loopEnabled;
            _autoPlayNext = autoPlayNext;
            _noRepeatMode = noRepeatMode;
            
            // Notify UI of changes
            OnPropertyChanged(nameof(LoopEnabled));
            OnPropertyChanged(nameof(AutoPlayNext));
            OnPropertyChanged(nameof(NoRepeatMode));
            
            // Timer interval
            if (intervalSeconds.HasValue)
            {
                _timerIntervalSeconds = (decimal)intervalSeconds.Value;
            }
            else
            {
                _timerIntervalSeconds = 300; // Default 5 minutes
            }
            OnPropertyChanged(nameof(TimerIntervalSeconds));
            
            // Seek step
            _seekStepFrame = false;
            _seekStep1s = false;
            _seekStep5s = false;
            _seekStep10s = false;
            
            switch (seekStep)
            {
                case "frame":
                    _seekStepFrame = true;
                    break;
                case "1s":
                    _seekStep1s = true;
                    break;
                case "10s":
                    _seekStep10s = true;
                    break;
                default: // "5s" or null
                    _seekStep5s = true;
                    break;
            }
            
            OnPropertyChanged(nameof(SeekStepFrame));
            OnPropertyChanged(nameof(SeekStep1s));
            OnPropertyChanged(nameof(SeekStep5s));
            OnPropertyChanged(nameof(SeekStep10s));
            
            // Volume step
            _volumeStep1 = false;
            _volumeStep2 = false;
            _volumeStep5 = false;
            
            switch (volumeStep)
            {
                case 1:
                    _volumeStep1 = true;
                    break;
                case 2:
                    _volumeStep2 = true;
                    break;
                default: // 5 or other
                    _volumeStep5 = true;
                    break;
            }
            
            OnPropertyChanged(nameof(VolumeStep1));
            OnPropertyChanged(nameof(VolumeStep2));
            OnPropertyChanged(nameof(VolumeStep5));
            
            // Volume normalization
            _volumeNormalizationEnabled = volumeNormalizationEnabled;
            OnPropertyChanged(nameof(VolumeNormalizationEnabled));
            
            _maxReductionDb = maxReductionDb;
            OnPropertyChanged(nameof(MaxReductionDb));
            
            _maxBoostDb = maxBoostDb;
            OnPropertyChanged(nameof(MaxBoostDb));
            
            _baselineAutoMode = baselineAutoMode;
            OnPropertyChanged(nameof(BaselineAutoMode));
            OnPropertyChanged(nameof(BaselineManualMode));
            
            _baselineOverrideLUFS = baselineOverrideLUFS;
            OnPropertyChanged(nameof(BaselineOverrideLUFS));
            
            // Photo display duration
            _photoDisplayDurationSeconds = photoDisplayDurationSeconds;
            OnPropertyChanged(nameof(PhotoDisplayDurationSeconds));
            
            // Image scaling
            _imageScalingMode = imageScalingMode;
            _fixedImageMaxWidth = fixedImageMaxWidth;
            _fixedImageMaxHeight = fixedImageMaxHeight;
            
            OnPropertyChanged(nameof(ImageScalingOff));
            OnPropertyChanged(nameof(ImageScalingAuto));
            OnPropertyChanged(nameof(ImageScalingFixed));
            OnPropertyChanged(nameof(FixedImageMaxWidth));
            OnPropertyChanged(nameof(FixedImageMaxHeight));
            
            // Missing file behavior
            _missingFileBehavior = missingFileBehavior;
            OnPropertyChanged(nameof(MissingFileBehaviorAlwaysShowDialog));
            OnPropertyChanged(nameof(MissingFileBehaviorAlwaysRemoveFromLibrary));
            
            // Backup settings
            _backupLibraryEnabled = backupLibraryEnabled;
            _minimumBackupGapMinutes = minimumBackupGapMinutes;
            _numberOfBackups = numberOfBackups;
            OnPropertyChanged(nameof(BackupLibraryEnabled));
            OnPropertyChanged(nameof(MinimumBackupGapMinutes));
            OnPropertyChanged(nameof(NumberOfBackups));
        }

        public string GetSeekStep()
        {
            if (_seekStepFrame) return "frame";
            if (_seekStep1s) return "1s";
            if (_seekStep10s) return "10s";
            return "5s";
        }

        public int GetVolumeStep()
        {
            if (_volumeStep1) return 1;
            if (_volumeStep2) return 2;
            return 5;
        }

        public bool GetVolumeNormalizationEnabled()
        {
            return _volumeNormalizationEnabled;
        }

        public double GetMaxReductionDb() => _maxReductionDb;
        public double GetMaxBoostDb() => _maxBoostDb;
        public bool GetBaselineAutoMode() => _baselineAutoMode;
        public double GetBaselineOverrideLUFS() => _baselineOverrideLUFS;

        public bool GetBackupLibraryEnabled() => _backupLibraryEnabled;
        public int GetMinimumBackupGapMinutes() => _minimumBackupGapMinutes;
        public int GetNumberOfBackups() => _numberOfBackups;

        private bool ValidateSettings()
        {
            // Validate timer interval
            if (_timerIntervalSeconds < 1 || _timerIntervalSeconds > 3600)
            {
                // Clamp to valid range
                _timerIntervalSeconds = Math.Max(1, Math.Min(3600, _timerIntervalSeconds));
                OnPropertyChanged(nameof(TimerIntervalSeconds));
                return false;
            }
            
            // Validate photo display duration
            if (_photoDisplayDurationSeconds < 1 || _photoDisplayDurationSeconds > 3600)
            {
                return false;
            }
            
            // Validate fixed image dimensions
            if (_fixedImageMaxWidth < 100 || _fixedImageMaxWidth > 16384)
            {
                return false;
            }
            if (_fixedImageMaxHeight < 100 || _fixedImageMaxHeight > 16384)
            {
                return false;
            }
            
            // Validate backup settings
            if (_minimumBackupGapMinutes < 1 || _minimumBackupGapMinutes > 60)
            {
                return false;
            }
            if (_numberOfBackups < 1 || _numberOfBackups > 30)
            {
                return false;
            }
            
            return true;
        }

        private void ApplyButton_Click(object? sender, RoutedEventArgs e)
        {
            if (ValidateSettings())
            {
                _wasApplied = true;
            }
        }

        private void OKButton_Click(object? sender, RoutedEventArgs e)
        {
            if (ValidateSettings())
            {
                _wasApplied = true;
                Close(true);
            }
        }

        private void CancelButton_Click(object? sender, RoutedEventArgs e)
        {
            _wasApplied = false;
            Close(false);
        }

        public new event PropertyChangedEventHandler? PropertyChanged;

        protected virtual void OnPropertyChanged([CallerMemberName] string? propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}

