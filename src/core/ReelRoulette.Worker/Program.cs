using ReelRoulette.Server.Hosting;
using ReelRoulette.Worker;

var builder = WebApplication.CreateBuilder(args);
var runtimeOptions = ServerRuntimeOptions.FromConfiguration(builder.Configuration);
builder.WebHost.UseUrls(runtimeOptions.ListenUrl);
builder.Services.AddCors(options =>
{
    options.AddPolicy(ServerHostComposition.WebClientCorsPolicyName, cors =>
    {
        if (runtimeOptions.CorsAllowedOrigins.Length > 0)
        {
            cors.WithOrigins(runtimeOptions.CorsAllowedOrigins);
        }

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

app.Lifetime.ApplicationStarted.Register(() =>
{
    app.Logger.LogInformation("ReelRoulette.Worker started on {ListenUrl}", runtimeOptions.ListenUrl);
});

app.Lifetime.ApplicationStopping.Register(() =>
{
    app.Logger.LogInformation("ReelRoulette.Worker is shutting down gracefully.");
});

app.Run();
