using ReelRoulette.Core.Library;

namespace ReelRoulette.LibraryArchive;

/// <summary>
/// Desktop library export/import. A transfer is one <c>library.db</c> checkpoint. Presets and
/// thumbnail revision, width, and height travel with that database. Settings, backups, and JPEG
/// files stay where they are.
/// </summary>
public static class LibraryArchiveMigration
{
    public const string ImportCompletedMessage =
        "Import completed. Start or restart the ReelRoulette server and resync this app to load the new library.";

    public const string ImportAlreadyInPlaceMessage =
        "The import is already in place. A cleanup step failed: ";

    public const string OverwriteConfirmationMessage =
        "This server already has library data. Importing will replace the library catalog. Continue?";

    public static string RoamingRoot =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ReelRoulette");

    public static bool LibraryExistsWithContentOnDisk(string roamingDirectory)
    {
        var databasePath = Path.Combine(roamingDirectory, LibraryCatalogStore.DatabaseFileName);
        return File.Exists(databasePath) &&
            LibraryCatalogStore.ReadDatabaseContent(databasePath) != LibraryCatalogStore.DatabaseContentRead.Empty;
    }

    public static bool TryReadSourceRootPaths(string databasePath, out IReadOnlyList<string> roots, out string? error)
    {
        roots = [];
        error = null;
        if (LibraryCatalogStore.ReadDatabaseContent(databasePath) == LibraryCatalogStore.DatabaseContentRead.Unreadable)
        {
            error = "The file is not a library database.";
            return false;
        }

        try
        {
            roots = LibraryCatalogStore.ReadSourceRootPaths(databasePath);
            return true;
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException)
        {
            error = "The file is not a library database.";
            return false;
        }
    }

    internal static Action<string>? BeforeDiscardingPreviousCatalog { get; set; }

    public static LibraryArchiveImportResult ImportDatabase(
        string databasePath,
        IReadOnlyDictionary<string, string> remap,
        IReadOnlySet<string> skippedRoots,
        bool force,
        string? roamingDirectory = null)
    {
        var roamingDir = string.IsNullOrWhiteSpace(roamingDirectory) ? RoamingRoot : roamingDirectory;
        var remapDict = new Dictionary<string, string>(remap, StringComparer.Ordinal);
        var skipped = new HashSet<string>(skippedRoots, StringComparer.Ordinal);

        if (LibraryCatalogStore.ReadDatabaseContent(databasePath) == LibraryCatalogStore.DatabaseContentRead.Unreadable)
        {
            return new LibraryArchiveImportResult
            {
                Accepted = false,
                Message = "The file is not a library database."
            };
        }

        if (!force && LibraryExistsWithContentOnDisk(roamingDir))
        {
            return new LibraryArchiveImportResult
            {
                Accepted = false,
                NeedsForceConfirmation = true,
                Message = "A non-empty library already exists. Confirm overwrite to replace it."
            };
        }

        var hadLiveCatalog = false;
        var importPlaced = false;
        try
        {
            hadLiveCatalog = LibraryCatalogStore.RecoverAndHasLiveDatabase(roamingDir);
            LibraryCatalogStore.PrepareIncomingFromFile(roamingDir, databasePath);
            var incoming = Path.Combine(roamingDir, LibraryCatalogStore.IncomingFileName);
            var remapResult = LibraryCatalogStore.RemapSources(incoming, remapDict, skipped);
            if (!remapResult.Success)
            {
                LibraryCatalogStore.DiscardIncoming(roamingDir);
                return new LibraryArchiveImportResult { Accepted = false, Message = remapResult.ErrorMessage };
            }

            LibraryCatalogStore.PublishIncoming(roamingDir, new LibraryCatalogReplaceOptions { RetainPrevious = true });
            importPlaced = true;
            BeforeDiscardingPreviousCatalog?.Invoke(roamingDir);
            LibraryCatalogStore.DiscardPrevious(roamingDir);
        }
        catch (Exception ex) when (!importPlaced && ex is LibraryCatalogNewerException or LibraryCatalogUnreadableException)
        {
            // A newer build's catalog files, and ones that could not be read to tell, are left exactly as
            // they are, including any incoming file.
            return new LibraryArchiveImportResult
            {
                Accepted = false,
                Message = $"Import failed: {ex.Message}"
            };
        }
        catch (Exception ex)
        {
            if (importPlaced)
            {
                LibraryCatalogStore.DiscardIncoming(roamingDir);
                return new LibraryArchiveImportResult
                {
                    Accepted = true,
                    Message = ImportAlreadyInPlaceMessage + ex.Message,
                    RestartRecommended = true
                };
            }

            var restoreErrors = new List<string>();
            var previousPath = Path.Combine(roamingDir, LibraryCatalogStore.PreviousFileName);
            var previousFileRemains = File.Exists(previousPath);
            if (previousFileRemains || !hadLiveCatalog)
            {
                try
                {
                    if (previousFileRemains)
                    {
                        LibraryCatalogStore.RestorePrevious(roamingDir);
                    }
                    else
                    {
                        LibraryCatalogStore.DeleteLiveDatabase(roamingDir);
                    }
                }
                catch (Exception restoreEx)
                {
                    restoreErrors.Add(restoreEx.Message);
                }
            }

            LibraryCatalogStore.DiscardIncoming(roamingDir);
            var failureMessage = $"Import failed: {ex.Message}";
            if (restoreErrors.Count > 0)
            {
                failureMessage += " The previous library data could not be restored: " + string.Join(" ", restoreErrors);
            }

            return new LibraryArchiveImportResult
            {
                Accepted = false,
                Message = failureMessage
            };
        }

        return new LibraryArchiveImportResult
        {
            Accepted = true,
            Message = ImportCompletedMessage,
            RestartRecommended = true
        };
    }
}

public sealed class LibraryArchiveImportResult
{
    public bool Accepted { get; set; }
    public string? Message { get; set; }
    public bool RestartRecommended { get; set; }
    public bool NeedsForceConfirmation { get; set; }
}
