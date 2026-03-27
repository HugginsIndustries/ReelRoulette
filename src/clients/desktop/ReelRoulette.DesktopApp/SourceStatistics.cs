using System;

namespace ReelRoulette
{
    public class SourceStatistics
    {
        public int TotalVideos { get; set; }
        public int TotalPhotos { get; set; }
        public int TotalMedia { get; set; }
        public int VideosWithAudio { get; set; }
        public int VideosWithoutAudio { get; set; }
        public TimeSpan TotalDuration { get; set; }
        public TimeSpan? AverageDuration { get; set; }

        public string TotalDurationFormatted
        {
            get
            {
                if (TotalDuration == TimeSpan.Zero)
                {
                    return "0m";
                }

                if (TotalDuration.TotalHours >= 1)
                {
                    return $"{(int)TotalDuration.TotalHours}h {TotalDuration.Minutes}m";
                }

                return $"{TotalDuration.Minutes}m";
            }
        }
    }
}
