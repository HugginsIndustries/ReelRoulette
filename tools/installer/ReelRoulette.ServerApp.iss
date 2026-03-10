#define AppName "ReelRoulette Server"
#ifndef AppVersion
  #define AppVersion "dev"
#endif
#ifndef SourceDir
  #define SourceDir "artifacts\publish\serverapp-win-x64"
#endif
#ifndef OutputDir
  #define OutputDir "artifacts\packages\installer"
#endif
#ifndef SharedIconPath
  #define SharedIconPath "assets\HI.ico"
#endif

[Setup]
AppId={{6B651410-CCF3-46A2-9252-C3DAD500A784}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\ReelRoulette Server
DefaultGroupName=ReelRoulette Server
DisableDirPage=no
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=ReelRoulette-Server-{#AppVersion}-win-x64-setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile={#SharedIconPath}
UninstallDisplayIcon={app}\ReelRoulette.ServerApp.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\ReelRoulette Server"; Filename: "{app}\ReelRoulette.ServerApp.exe"; IconFilename: "{app}\ReelRoulette.ServerApp.exe"

[Run]
Filename: "{app}\ReelRoulette.ServerApp.exe"; Description: "Launch ReelRoulette Server"; Flags: nowait postinstall skipifsilent
