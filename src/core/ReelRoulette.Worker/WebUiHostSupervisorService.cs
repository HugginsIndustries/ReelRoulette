using System.Diagnostics;
using System.Linq;
using ReelRoulette.Server.Contracts;
using ReelRoulette.Server.Services;

namespace ReelRoulette.Worker;

public sealed class WebUiHostSupervisorService : IHostedService, IDisposable
{
    private readonly ILogger<WebUiHostSupervisorService> _logger;
    private readonly CoreSettingsService _settings;
    private readonly IHostEnvironment _environment;
    private readonly SemaphoreSlim _sync = new(1, 1);
    private readonly object _ownedPidSync = new();
    private readonly HashSet<int> _ownedWebHostPids = new();
    private readonly string _pidLedgerPath = Path.Combine(Path.GetTempPath(), "reelroulette-webhost-pids.txt");
    private Process? _webHostProcess;
    private string? _currentListenUrl;
    private string? _currentDeployRootPath;
    private string? _currentManifestPath;
    private bool _disposed;

    public WebUiHostSupervisorService(
        ILogger<WebUiHostSupervisorService> logger,
        CoreSettingsService settings,
        IHostEnvironment environment)
    {
        _logger = logger;
        _settings = settings;
        _environment = environment;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        RecoverOrphanedWebHostProcesses();
        _settings.WebRuntimeSettingsChanged += OnWebRuntimeSettingsChanged;
        await ReconcileAsync(_settings.GetWebRuntimeSettings(), "startup", cancellationToken);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _settings.WebRuntimeSettingsChanged -= OnWebRuntimeSettingsChanged;
        var lockTaken = false;
        try
        {
            await _sync.WaitAsync(CancellationToken.None);
            lockTaken = true;
            await StopProcessAsync(CancellationToken.None);
            await StopOwnedProcessesBestEffortAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WebHost shutdown encountered an error.");
        }
        finally
        {
            if (lockTaken)
            {
                _sync.Release();
            }
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _settings.WebRuntimeSettingsChanged -= OnWebRuntimeSettingsChanged;
        _sync.Dispose();
        _webHostProcess?.Dispose();
    }

    private void OnWebRuntimeSettingsChanged(WebRuntimeSettingsSnapshot snapshot)
    {
#pragma warning disable CS4014
        ReconcileAsync(CloneSettings(snapshot), "settings-updated", CancellationToken.None);
#pragma warning restore CS4014
    }

    private async Task ReconcileAsync(WebRuntimeSettingsSnapshot snapshot, string reason, CancellationToken cancellationToken)
    {
        await _sync.WaitAsync(cancellationToken);
        try
        {
            var desiredListenUrl = BuildListenUrl(snapshot);
            var desiredDeployRootPath = ResolveDeployRootPath();
            var desiredManifestPath = Path.Combine(desiredDeployRootPath, "active-manifest.json");
            if (!snapshot.Enabled)
            {
                if (_webHostProcess is { HasExited: false })
                {
                    _logger.LogInformation("Web UI runtime disabled ({Reason}); stopping WebHost.", reason);
                }

                await StopProcessAsync(cancellationToken);
                _currentListenUrl = null;
                _currentDeployRootPath = null;
                _currentManifestPath = null;
                return;
            }

            var isRunning = _webHostProcess is { HasExited: false };
            var needsRestart = !isRunning ||
                               !string.Equals(_currentListenUrl, desiredListenUrl, StringComparison.OrdinalIgnoreCase) ||
                               !string.Equals(_currentDeployRootPath, desiredDeployRootPath, StringComparison.OrdinalIgnoreCase) ||
                               !string.Equals(_currentManifestPath, desiredManifestPath, StringComparison.OrdinalIgnoreCase);
            if (!needsRestart)
            {
                return;
            }

            await StopProcessAsync(cancellationToken);
            if (!File.Exists(desiredManifestPath))
            {
                _logger.LogWarning(
                    "WebHost not started ({Reason}) because active manifest was not found at {ManifestPath}. Publish and activate a web version first.",
                    reason,
                    desiredManifestPath);
                _currentListenUrl = desiredListenUrl;
                _currentDeployRootPath = desiredDeployRootPath;
                _currentManifestPath = desiredManifestPath;
                return;
            }

            var dllPath = ResolveWebHostDllPath();
            if (string.IsNullOrWhiteSpace(dllPath))
            {
                _logger.LogWarning("WebHost DLL not found; cannot start Web UI runtime.");
                return;
            }

            var process = StartWebHostProcess(dllPath, desiredListenUrl, desiredDeployRootPath);
            _webHostProcess = process;
            _currentListenUrl = desiredListenUrl;
            _currentDeployRootPath = desiredDeployRootPath;
            _currentManifestPath = desiredManifestPath;
            _logger.LogInformation(
                "WebHost started ({Reason}) on {ListenUrl} with deploy root {DeployRootPath} (manifest: {ManifestPath}).",
                reason,
                desiredListenUrl,
                desiredDeployRootPath,
                desiredManifestPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reconcile Web UI runtime process.");
        }
        finally
        {
            _sync.Release();
        }
    }

    private string BuildListenUrl(WebRuntimeSettingsSnapshot snapshot)
    {
        var port = snapshot.Port > 0 ? snapshot.Port : 51234;
        var host = snapshot.BindOnLan ? "0.0.0.0" : "localhost";
        return $"http://{host}:{port}";
    }

    private string ResolveDeployRootPath()
    {
        var envOverride = Environment.GetEnvironmentVariable("REELROULETTE_WEB_DEPLOY_ROOT");
        if (!string.IsNullOrWhiteSpace(envOverride))
        {
            return Path.GetFullPath(envOverride);
        }

        var repoRoot = FindRepositoryRoot();
        if (!string.IsNullOrWhiteSpace(repoRoot))
        {
            var deployRootCandidate = Path.Combine(repoRoot, ".web-deploy");
            if (Directory.Exists(deployRootCandidate))
            {
                return deployRootCandidate;
            }
        }

        return Path.GetFullPath(Path.Combine(_environment.ContentRootPath, ".web-deploy"));
    }

    private string? FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(_environment.ContentRootPath);
        while (directory != null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "ReelRoulette.sln")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }

    private string? ResolveWebHostDllPath()
    {
        var config = _environment.IsDevelopment() ? "Debug" : "Release";
        var candidate = Path.GetFullPath(Path.Combine(
            _environment.ContentRootPath,
            "..",
            "..",
            "clients",
            "web",
            "ReelRoulette.WebHost",
            "bin",
            config,
            "net9.0",
            "ReelRoulette.WebHost.dll"));
        if (File.Exists(candidate))
        {
            return candidate;
        }

        var fallback = Path.GetFullPath(Path.Combine(
            _environment.ContentRootPath,
            "..",
            "..",
            "clients",
            "web",
            "ReelRoulette.WebHost",
            "bin",
            "Debug",
            "net9.0",
            "ReelRoulette.WebHost.dll"));
        return File.Exists(fallback) ? fallback : null;
    }

    private Process StartWebHostProcess(string dllPath, string listenUrl, string deployRootPath)
    {
        var info = new ProcessStartInfo
        {
            FileName = "dotnet",
            Arguments =
                $"\"{dllPath}\" --WebDeployment:ListenUrl={listenUrl} --WebDeployment:DeployRootPath=\"{deployRootPath}\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        var process = new Process
        {
            StartInfo = info,
            EnableRaisingEvents = true
        };
        process.OutputDataReceived += (_, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
            {
                _logger.LogInformation("WebHost: {Line}", e.Data);
            }
        };
        process.ErrorDataReceived += (_, e) =>
        {
            if (!string.IsNullOrWhiteSpace(e.Data))
            {
                _logger.LogWarning("WebHost: {Line}", e.Data);
            }
        };
        process.Exited += (_, _) =>
        {
            _logger.LogWarning("WebHost process exited with code {ExitCode}.", process.ExitCode);
            UntrackOwnedProcess(process.Id);
            if (ReferenceEquals(_webHostProcess, process))
            {
                _webHostProcess = null;
            }
        };

        process.Start();
        TrackOwnedProcess(process.Id);
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private async Task StopProcessAsync(CancellationToken cancellationToken)
    {
        if (_webHostProcess == null)
        {
            return;
        }

        var process = _webHostProcess;
        _webHostProcess = null;
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                await process.WaitForExitAsync(cancellationToken);
                _logger.LogInformation("WebHost process stopped.");
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("WebHost shutdown cancellation requested; finishing with best-effort cleanup.");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to stop WebHost process cleanly.");
        }
        finally
        {
            process.Dispose();
        }

        await StopOwnedProcessesBestEffortAsync(cancellationToken);
    }

    private static WebRuntimeSettingsSnapshot CloneSettings(WebRuntimeSettingsSnapshot source)
    {
        // Keep event-path snapshots immutable across async reconcile.
        return new WebRuntimeSettingsSnapshot
        {
            Enabled = source.Enabled,
            Port = source.Port,
            BindOnLan = source.BindOnLan,
            LanHostname = source.LanHostname,
            AuthMode = source.AuthMode,
            SharedToken = source.SharedToken
        };
    }

    private void RecoverOrphanedWebHostProcesses()
    {
        foreach (var pid in ReadPidLedger())
        {
            TryStopPidBestEffort(pid, "startup-orphan-cleanup");
        }

        lock (_ownedPidSync)
        {
            _ownedWebHostPids.Clear();
            PersistPidLedgerUnsafe();
        }
    }

    private async Task StopOwnedProcessesBestEffortAsync(CancellationToken cancellationToken)
    {
        int[] snapshot;
        lock (_ownedPidSync)
        {
            snapshot = _ownedWebHostPids.ToArray();
        }

        foreach (var pid in snapshot)
        {
            await TryStopPidAsync(pid, cancellationToken);
        }

        lock (_ownedPidSync)
        {
            PersistPidLedgerUnsafe();
        }
    }

    private async Task TryStopPidAsync(int pid, CancellationToken cancellationToken)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            if (process.HasExited)
            {
                UntrackOwnedProcess(pid);
                return;
            }

            process.Kill(entireProcessTree: true);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(5));
            await process.WaitForExitAsync(timeout.Token);
            _logger.LogInformation("Cleaned owned WebHost process {Pid}.", pid);
            UntrackOwnedProcess(pid);
        }
        catch (InvalidOperationException)
        {
            UntrackOwnedProcess(pid);
        }
        catch (ArgumentException)
        {
            UntrackOwnedProcess(pid);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Timed out waiting for owned WebHost process {Pid} shutdown; continuing.", pid);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to cleanup owned WebHost process {Pid}.", pid);
        }
    }

    private void TryStopPidBestEffort(int pid, string reason)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            if (process.HasExited)
            {
                return;
            }

            process.Kill(entireProcessTree: true);
            if (!process.WaitForExit(5000))
            {
                _logger.LogWarning("Timed out stopping stale WebHost process {Pid} during {Reason}.", pid, reason);
            }
            else
            {
                _logger.LogInformation("Stopped stale WebHost process {Pid} during {Reason}.", pid, reason);
            }
        }
        catch (InvalidOperationException)
        {
        }
        catch (ArgumentException)
        {
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed stopping stale WebHost process {Pid} during {Reason}.", pid, reason);
        }
    }

    private IEnumerable<int> ReadPidLedger()
    {
        try
        {
            if (!File.Exists(_pidLedgerPath))
            {
                return [];
            }

            return File.ReadAllLines(_pidLedgerPath)
                .Select(line => int.TryParse(line, out var pid) ? pid : -1)
                .Where(pid => pid > 0)
                .Distinct()
                .ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read WebHost PID ledger at {Path}.", _pidLedgerPath);
            return [];
        }
    }

    private void TrackOwnedProcess(int pid)
    {
        lock (_ownedPidSync)
        {
            _ownedWebHostPids.Add(pid);
            PersistPidLedgerUnsafe();
        }
    }

    private void UntrackOwnedProcess(int pid)
    {
        lock (_ownedPidSync)
        {
            if (_ownedWebHostPids.Remove(pid))
            {
                PersistPidLedgerUnsafe();
            }
        }
    }

    private void PersistPidLedgerUnsafe()
    {
        try
        {
            var directory = Path.GetDirectoryName(_pidLedgerPath);
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.WriteAllLines(_pidLedgerPath, _ownedWebHostPids.Select(pid => pid.ToString()));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist WebHost PID ledger at {Path}.", _pidLedgerPath);
        }
    }
}
