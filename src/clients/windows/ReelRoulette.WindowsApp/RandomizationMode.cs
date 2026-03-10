namespace ReelRoulette
{
    /// <summary>
    /// Selects how random media is chosen from the current eligible set.
    /// </summary>
    public enum RandomizationMode
    {
        PureRandom = 0,
        WeightedRandom = 1,
        SmartShuffle = 2,
        SpreadMode = 3,
        WeightedWithSpread = 4
    }
}
