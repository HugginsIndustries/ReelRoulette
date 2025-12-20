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
        private bool _volumeNormOff;
        private bool _volumeNormSimple;
        private bool _volumeNormLibrary;
        private bool _volumeNormAdvanced;

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
            _volumeNormOff = true;
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

        // Volume normalization properties
        public bool VolumeNormOff
        {
            get => _volumeNormOff;
            set
            {
                if (value)
                {
                    _volumeNormOff = true;
                    _volumeNormSimple = false;
                    _volumeNormLibrary = false;
                    _volumeNormAdvanced = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(VolumeNormSimple));
                    OnPropertyChanged(nameof(VolumeNormLibrary));
                    OnPropertyChanged(nameof(VolumeNormAdvanced));
                }
            }
        }

        public bool VolumeNormSimple
        {
            get => _volumeNormSimple;
            set
            {
                if (value)
                {
                    _volumeNormOff = false;
                    _volumeNormSimple = true;
                    _volumeNormLibrary = false;
                    _volumeNormAdvanced = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(VolumeNormOff));
                    OnPropertyChanged(nameof(VolumeNormLibrary));
                    OnPropertyChanged(nameof(VolumeNormAdvanced));
                }
            }
        }

        public bool VolumeNormLibrary
        {
            get => _volumeNormLibrary;
            set
            {
                if (value)
                {
                    _volumeNormOff = false;
                    _volumeNormSimple = false;
                    _volumeNormLibrary = true;
                    _volumeNormAdvanced = false;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(VolumeNormOff));
                    OnPropertyChanged(nameof(VolumeNormSimple));
                    OnPropertyChanged(nameof(VolumeNormAdvanced));
                }
            }
        }

        public bool VolumeNormAdvanced
        {
            get => _volumeNormAdvanced;
            set
            {
                if (value)
                {
                    _volumeNormOff = false;
                    _volumeNormSimple = false;
                    _volumeNormLibrary = false;
                    _volumeNormAdvanced = true;
                    OnPropertyChanged();
                    OnPropertyChanged(nameof(VolumeNormOff));
                    OnPropertyChanged(nameof(VolumeNormSimple));
                    OnPropertyChanged(nameof(VolumeNormLibrary));
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
            VolumeNormalizationMode volumeNormMode)
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
            _volumeNormOff = false;
            _volumeNormSimple = false;
            _volumeNormLibrary = false;
            _volumeNormAdvanced = false;
            
            switch (volumeNormMode)
            {
                case VolumeNormalizationMode.Off:
                    _volumeNormOff = true;
                    break;
                case VolumeNormalizationMode.Simple:
                    _volumeNormSimple = true;
                    break;
                case VolumeNormalizationMode.LibraryAware:
                    _volumeNormLibrary = true;
                    break;
                case VolumeNormalizationMode.Advanced:
                    _volumeNormAdvanced = true;
                    break;
            }
            
            OnPropertyChanged(nameof(VolumeNormOff));
            OnPropertyChanged(nameof(VolumeNormSimple));
            OnPropertyChanged(nameof(VolumeNormLibrary));
            OnPropertyChanged(nameof(VolumeNormAdvanced));
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

        public VolumeNormalizationMode GetVolumeNormalizationMode()
        {
            if (_volumeNormOff) return VolumeNormalizationMode.Off;
            if (_volumeNormSimple) return VolumeNormalizationMode.Simple;
            if (_volumeNormLibrary) return VolumeNormalizationMode.LibraryAware;
            if (_volumeNormAdvanced) return VolumeNormalizationMode.Advanced;
            return VolumeNormalizationMode.Off;
        }

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

