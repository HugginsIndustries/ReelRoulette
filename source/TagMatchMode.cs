namespace ReelRoulette
{
    /// <summary>
    /// Defines how multiple selected tags should be matched when filtering.
    /// </summary>
    public enum TagMatchMode
    {
        /// <summary>
        /// Match items that have ALL selected tags (AND logic).
        /// </summary>
        And = 0,

        /// <summary>
        /// Match items that have ANY of the selected tags (OR logic).
        /// </summary>
        Or = 1
    }
}

