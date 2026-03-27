namespace ReelRoulette
{
    /// <summary>
    /// Filter mode for media type selection (All, Videos Only, Photos Only).
    /// </summary>
    public enum MediaTypeFilter
    {
        /// <summary>
        /// Include both videos and photos.
        /// </summary>
        All = 0,

        /// <summary>
        /// Include only videos.
        /// </summary>
        VideosOnly = 1,

        /// <summary>
        /// Include only photos.
        /// </summary>
        PhotosOnly = 2
    }
}

