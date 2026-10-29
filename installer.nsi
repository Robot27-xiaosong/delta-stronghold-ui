; ============================================================
; Delta Stronghold UI v3.0.0 - Installer
; By Bilibili 我是小宋awa | Made with AI
; ============================================================

!include "MUI2.nsh"

; --- 基本信息 ---
!define APPNAME "Delta Stronghold UI"
!define APPNAMENOSPACE "DeltaStrongholdUI"
!define VERSION "3.0.0"
!define EXENAME "DeltaStrongholdUI.exe"
!define PUBLISHER "Bilibili xiaosong_awa"
!define SOURCEDIR "C:\Users\pc\Doubao\chats\2026-08-21\new-chat\delta-stronghold-v3\dist\win-unpacked"
!define OUTFILE "C:\Users\pc\Doubao\chats\2026-08-21\new-chat\delta-stronghold-v3\dist\DeltaStrongholdUI-Setup-v3.0.0.exe"

; --- MUI2 设置 ---
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Are you sure you want to cancel the installation?"
!define MUI_WELCOMEPAGE_TITLE "Welcome to Delta Stronghold UI v3.0.0"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Delta Stronghold UI.$\r$\n$\r$\nDelta Force Stronghold UI Component - Electron Desktop Edition.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "Delta Stronghold UI has been successfully installed.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Run Delta Stronghold UI now"
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_UNABORTWARNING
!define MUI_UNCONFIRMPAGE_TEXT_TOP "Are you sure you want to completely remove Delta Stronghold UI and all of its components?"

; --- 页面 ---
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; --- 语言 ---
!insertmacro MUI_LANGUAGE "English"

; --- 安装信息 ---
Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES\${APPNAME}"
RequestExecutionLevel admin
ShowInstDetails show
ShowUnInstDetails show
BrandingText "By Bilibili xiaosong_awa | v${VERSION}"

; ============================================================
; 安装 Section
; ============================================================
Section "Install" SecInstall
  SectionIn RO

  SetOutPath $INSTDIR
  File /r "${SOURCEDIR}\*.*"

  ; 开始菜单快捷方式
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\Uninstall.lnk" "$INSTDIR\uninstall.exe"

  ; 桌面快捷方式
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"

  ; 卸载程序
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; 注册表卸载信息
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAMENOSPACE}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAMENOSPACE}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAMENOSPACE}" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAMENOSPACE}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAMENOSPACE}" "InstallLocation" "$INSTDIR"
SectionEnd

; ============================================================
; 卸载 Section
; ============================================================
Section "un.Uninstall"
  ; 删除文件
  RMDir /r "$INSTDIR"

  ; 删除快捷方式
  Delete "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Uninstall.lnk"
  RMDir "$SMPROGRAMS\${APPNAME}"
  Delete "$DESKTOP\${APPNAME}.lnk"

  ; 删除注册表
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAMENOSPACE}"
SectionEnd
