using ReelRoulette.Server.Hosting;
using ReelRoulette.Server.Services;
using ReelRoulette.Worker;

var builder = WebApplication.CreateBuilder(args);
var runtimeOptions = ServerRuntimeOptions.FromConfiguration(builder.Configuration);
var corsOrigins = new DynamicCorsOriginRegistry(runtimeOptions);
builder.WebHost.UseUrls(runtimeOptions.ListenUrl);
builder.Services.AddSingleton(corsOrigins);
builder.Services.AddCors(options =>
{
    options.AddPolicy(ServerHostComposition.WebClientCorsPolicyName, cors =>
    {
        cors.SetIsOriginAllowed(corsOrigins.IsAllowed);

        cors.WithMethods("GET", "POST", "OPTIONS")
            .WithHeaders("Content-Type", "Authorization", "Last-Event-ID");
        if (runtimeOptions.CorsAllowCredentials)
        {
            cors.AllowCredentials();
        }
    });
});

builder.Services.AddSingleton(runtimeOptions);
builder.Services.AddReelRouletteServer();
builder.Services.AddHostedService<WorkerLifecycleService>();

var app = builder.Build();
app.MapReelRouletteEndpoints(runtimeOptions);
corsOrigins.Start(
    app.Services.GetRequiredService<CoreSettingsService>(),
    app.Logger);
app.Lifetime.ApplicationStopping.Register(corsOrigins.Stop);

app.Lifetime.ApplicationStarted.Register(() =>
{
    app.Logger.LogInformation("ReelRoulette.Worker started on {ListenUrl} (legacy host compatibility mode).", runtimeOptions.ListenUrl);
});

app.Lifetime.ApplicationStopping.Register(() =>
{
    app.Logger.LogInformation("ReelRoulette.Worker is shutting down gracefully.");
});

app.Run();
