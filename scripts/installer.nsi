Unicode true
!include "MUI2.nsh"
!include "x64.nsh"
!define APP_NAME "Shanti Vikasa"
!define APP_VERSION "1.0.3"
!ifndef APP_DIR
 !define APP_DIR "../release/windows-app"
!endif
!ifndef APP_FILES
 !define APP_FILES "${APP_DIR}/*.*"
!endif
!ifndef OUTPUT_FILE
 !define OUTPUT_FILE "../release/ShantiVikasa-Setup-1.0.3.exe"
!endif
!ifndef APP_ICON
 !define APP_ICON "../public/shanti.ico"
!endif
Name "${APP_NAME} Shop Register"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\ShantiVikasa"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 32
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "1.0.3.0"
VIAddVersionKey /LANG=1033 "ProductName" "Shanti Vikasa Shop Register"
VIAddVersionKey /LANG=1033 "FileDescription" "Shanti Vikasa Windows Installer"
VIAddVersionKey /LANG=1033 "FileVersion" "1.0.3"
VIAddVersionKey /LANG=1033 "ProductVersion" "1.0.3"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Shanti Vikasa"
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to Shanti Vikasa"
!define MUI_WELCOMEPAGE_TEXT "Install your shop register on this computer.$\r$\n$\r$\nIncludes the product catalog, images, and saved receipt snapshot. Works offline. Connect your website to synchronize inventory, photos, and receipts.$\r$\n$\r$\nThis installer is for 64-bit Windows 10 or Windows 11."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\ShantiVikasa.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Open Shanti Vikasa"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function .onInit
 ${IfNot} ${RunningX64}
  MessageBox MB_OK|MB_ICONSTOP "This app requires 64-bit Windows 10 or Windows 11."
  Abort
 ${EndIf}
FunctionEnd
Function EnsureAppClosed
 IfFileExists "$INSTDIR\ShantiVikasa.exe" 0 done
 retry:
 ClearErrors
 FileOpen $0 "$INSTDIR\ShantiVikasa.exe" a
 IfErrors locked
 FileClose $0
 Goto done
 locked:
 MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close Shanti Vikasa before installing this update, then select Retry." IDRETRY retry
 Abort
 done:
FunctionEnd
Section "Install"
 SetShellVarContext current
 Call EnsureAppClosed
 SetOutPath "$INSTDIR"
 File /r "${APP_FILES}"
 FileOpen $0 "$INSTDIR\.shanti-install" w
 FileWrite $0 "ShantiVikasa-1.0.3"
 FileClose $0
 WriteUninstaller "$INSTDIR\Uninstall.exe"
 CreateDirectory "$SMPROGRAMS\Shanti Vikasa"
 CreateShortCut "$SMPROGRAMS\Shanti Vikasa\Shanti Vikasa.lnk" "$INSTDIR\ShantiVikasa.exe" "" "$INSTDIR\shanti.ico"
 CreateShortCut "$DESKTOP\Shanti Vikasa.lnk" "$INSTDIR\ShantiVikasa.exe" "" "$INSTDIR\shanti.ico"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa" "DisplayName" "Shanti Vikasa Shop Register"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa" "DisplayVersion" "1.0.3"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa" "UninstallString" '"$INSTDIR\Uninstall.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa" "DisplayIcon" "$INSTDIR\shanti.ico"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa" "InstallLocation" "$INSTDIR"
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa" "NoModify" 1
 WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa" "NoRepair" 1
SectionEnd
Section "Uninstall"
 SetShellVarContext current
 IfFileExists "$INSTDIR\.shanti-install" 0 refuse
 retry:
 ClearErrors
 FileOpen $0 "$INSTDIR\ShantiVikasa.exe" a
 IfErrors locked
 FileClose $0
 Goto remove
 locked:
 MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close Shanti Vikasa before uninstalling, then select Retry." IDRETRY retry
 Abort
 remove:
 Delete "$DESKTOP\Shanti Vikasa.lnk"
 Delete "$SMPROGRAMS\Shanti Vikasa\Shanti Vikasa.lnk"
 RMDir "$SMPROGRAMS\Shanti Vikasa"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ShantiVikasa"
 RMDir /r "$INSTDIR"
 MessageBox MB_OK "The app was removed. Your database and backups have been kept in AppData\Roaming\ShantiVikasa."
 Goto done
 refuse:
 MessageBox MB_OK|MB_ICONSTOP "The installation marker was not found. Uninstall from the original application folder."
 Abort
 done:
SectionEnd
