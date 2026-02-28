using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ReelRoulette
{
    public class FingerprintProgressSnapshot
    {
        public int Completed { get; set; }
        public int TotalEligible { get; set; }
        public int Pending { get; set; }
        public int Failed { get; set; }
        public int InProgress { get; set; }
        public bool IsRunning { get; set; }
    }

    public class FingerprintOnDemandResult
    {
        public int ProcessedCount { get; set; }
        public int RemainingQueued { get; set; }
        public bool BudgetExhausted { get; set; }
    }

    public class FingerprintCoordinator
    {
        private readonly ConcurrentQueue<string> _queue = new ConcurrentQueue<string>();
        private readonly HashSet<string> _queuedSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly object _queueLock = new object();
        private readonly FileFingerprintService _service;
        private readonly Action<string> _log;
        private readonly Action<string, FileFingerprintResult> _applyResult;
        private readonly Action _checkpointSave;

        private int _completed;
        private int _failed;
        private int _inProgress;
        private int _totalEligible;
        private bool _running;
        private Task? _workerTask;
        private DateTime _lastLogUtc = DateTime.MinValue;
        private DateTime _lastCheckpointUtc = DateTime.MinValue;
        private int _sinceCheckpoint;
        private readonly TimeSpan _logInterval = TimeSpan.FromSeconds(5);
        private readonly TimeSpan _checkpointInterval = TimeSpan.FromSeconds(30);
        private const int CheckpointEveryCount = 50;

        public event Action<FingerprintProgressSnapshot>? ProgressUpdated;

        public FingerprintCoordinator(
            FileFingerprintService service,
            Action<string> log,
            Action<string, FileFingerprintResult> applyResult,
            Action checkpointSave)
        {
            _service = service;
            _log = log;
            _applyResult = applyResult;
            _checkpointSave = checkpointSave;
        }

        public void Enqueue(string itemPath)
        {
            if (string.IsNullOrWhiteSpace(itemPath))
            {
                return;
            }

            lock (_queueLock)
            {
                if (_queuedSet.Add(itemPath))
                {
                    _queue.Enqueue(itemPath);
                    _totalEligible++;
                }
            }

            EnsureWorkerRunning();
            EmitProgress();
        }

        public void EnqueueMany(IEnumerable<string> itemPaths)
        {
            foreach (var path in itemPaths)
            {
                Enqueue(path);
            }
        }

        public FingerprintProgressSnapshot GetSnapshot()
        {
            int pending;
            lock (_queueLock)
            {
                pending = _queue.Count;
            }

            return new FingerprintProgressSnapshot
            {
                Completed = _completed,
                TotalEligible = _totalEligible,
                Pending = pending,
                Failed = _failed,
                InProgress = _inProgress,
                IsRunning = _running
            };
        }

        public FingerprintOnDemandResult ComputeOnDemand(IEnumerable<string> itemPaths, int maxFiles, TimeSpan maxDuration)
        {
            var start = DateTime.UtcNow;
            int processed = 0;
            var paths = itemPaths.Where(path => !string.IsNullOrWhiteSpace(path)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            foreach (var path in paths)
            {
                if (processed >= maxFiles || DateTime.UtcNow - start >= maxDuration)
                {
                    return new FingerprintOnDemandResult
                    {
                        ProcessedCount = processed,
                        RemainingQueued = paths.Count - processed,
                        BudgetExhausted = true
                    };
                }

                ProcessItem(path);
                processed++;
            }

            return new FingerprintOnDemandResult
            {
                ProcessedCount = processed,
                RemainingQueued = Math.Max(0, paths.Count - processed),
                BudgetExhausted = false
            };
        }

        private void EnsureWorkerRunning()
        {
            if (_running)
            {
                return;
            }

            _running = true;
            _workerTask = Task.Run(WorkerLoop);
        }

        private void WorkerLoop()
        {
            try
            {
                while (true)
                {
                    if (!_queue.TryDequeue(out var itemPath) || string.IsNullOrWhiteSpace(itemPath))
                    {
                        break;
                    }

                    lock (_queueLock)
                    {
                        _queuedSet.Remove(itemPath);
                    }

                    ProcessItem(itemPath);
                }
            }
            finally
            {
                _running = false;
                EmitProgress();
            }
        }

        private void ProcessItem(string itemPath)
        {
            Interlocked.Increment(ref _inProgress);
            try
            {
                var result = _service.ComputeFingerprint(itemPath);
                _applyResult(itemPath, result);

                if (result.Error != null)
                {
                    Interlocked.Increment(ref _failed);
                }
                else
                {
                    Interlocked.Increment(ref _completed);
                }

                _sinceCheckpoint++;
                MaybeCheckpoint();
                MaybeLogProgress();
            }
            catch (Exception ex)
            {
                Interlocked.Increment(ref _failed);
                _log($"FingerprintCoordinator: ERROR processing item {itemPath} - {ex.Message}");
            }
            finally
            {
                Interlocked.Decrement(ref _inProgress);
                EmitProgress();
            }
        }

        private void MaybeCheckpoint()
        {
            var now = DateTime.UtcNow;
            if (_sinceCheckpoint >= CheckpointEveryCount || now - _lastCheckpointUtc >= _checkpointInterval)
            {
                _checkpointSave();
                _sinceCheckpoint = 0;
                _lastCheckpointUtc = now;
            }
        }

        private void MaybeLogProgress()
        {
            var now = DateTime.UtcNow;
            if (now - _lastLogUtc < _logInterval)
            {
                return;
            }

            _lastLogUtc = now;
            var snapshot = GetSnapshot();
            _log($"FingerprintCoordinator: Progress {snapshot.Completed}/{snapshot.TotalEligible}, pending={snapshot.Pending}, failed={snapshot.Failed}, inProgress={snapshot.InProgress}");
        }

        private void EmitProgress()
        {
            ProgressUpdated?.Invoke(GetSnapshot());
        }
    }
}
