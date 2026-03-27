#define AppName "ReelRoulette Desktop"
#ifndef AppVersion
  #define AppVersion "dev"
#endif
#ifndef SourceDir
  #define SourceDir "artifacts\publish\desktop-win-x64"
#endif
#ifndef OutputDir
  #define OutputDir "artifacts\packages\installer"
#endif
#ifndef SharedIconPath
  #define SharedIconPath "assets\HI.ico"
#endif

[Setup]
AppId={{A7F8ED18-EBDE-4A35-9A88-5F2E452D9E8A}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\ReelRoulette Desktop
DefaultGroupName=ReelRoulette Desktop
DisableDirPage=no
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=ReelRoulette-Desktop-{#AppVersion}-win-x64-setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile={#SharedIconPath}
UninstallDisplayIcon={app}\ReelRoulette.DesktopApp.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Tasks]
Name: "desktopicon"; Description: "Create Desktop Shortcut"

[Icons]
Name: "{autoprograms}\ReelRoulette Desktop"; Filename: "{app}\ReelRoulette.DesktopApp.exe"; IconFilename: "{app}\ReelRoulette.DesktopApp.exe"
Name: "{autodesktop}\ReelRoulette Desktop"; Filename: "{app}\ReelRoulette.DesktopApp.exe"; IconFilename: "{app}\ReelRoulette.DesktopApp.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\ReelRoulette.DesktopApp.exe"; Description: "Launch ReelRoulette Desktop"; Flags: nowait postinstall skipifsilent
