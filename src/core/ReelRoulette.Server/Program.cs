using ReelRoulette.Server.Hosting;

var builder = WebApplication.CreateBuilder(args);
var runtimeOptions = ServerRuntimeOptions.FromConfiguration(builder.Configuration);
builder.WebHost.UseUrls(runtimeOptions.ListenUrl);
builder.Services.AddSingleton(runtimeOptions);
builder.Services.AddReelRouletteServer();

var app = builder.Build();
app.MapReelRouletteEndpoints(runtimeOptions);

app.Run();
