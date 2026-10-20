; Changing the icon filename on each release avoids reusing Explorer's cached
; icon for the unchanged application executable. Only refresh existing links:
; respect installer options and shortcuts deliberately removed by the user.
!macro markNotesRefreshShortcutIcon LINK
  ${if} ${FileExists} "${LINK}"
    CreateShortCut "${LINK}" "$appExe" "" "$INSTDIR\resources\icon-${VERSION}.ico" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "${LINK}" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x2000, i 0x1005, w "${LINK}", p 0)'
  ${endif}
!macroend

!macro customInstall
  !insertmacro markNotesRefreshShortcutIcon "$newDesktopLink"
  !insertmacro markNotesRefreshShortcutIcon "$newStartMenuLink"
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
