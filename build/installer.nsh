; Spindle in Windows' "Open with" for the songs it plays (ticket 124), never
; their default program: the types list it under OpenWithProgids and leave
; their own default alone. electron-builder's fileAssociations would set it.

!macro spindleType EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Spindle.Audio" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".${EXT}" ""
!macroend

!macro spindleUntype EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Spindle.Audio"
!macroend

!macro spindleTypes DO
  !insertmacro ${DO} "mp3"
  !insertmacro ${DO} "flac"
  !insertmacro ${DO} "ogg"
  !insertmacro ${DO} "oga"
  !insertmacro ${DO} "opus"
  !insertmacro ${DO} "m4a"
  !insertmacro ${DO} "aac"
  !insertmacro ${DO} "wav"
  !insertmacro ${DO} "ape"
  !insertmacro ${DO} "wv"
  !insertmacro ${DO} "wma"
  !insertmacro ${DO} "aif"
  !insertmacro ${DO} "aiff"
  !insertmacro ${DO} "cue"
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\Spindle.Audio" "" "Song"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Spindle.Audio\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Spindle.Audio\shell\open" "" "Play with ${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Spindle.Audio\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "${PRODUCT_NAME}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$appExe" "%1"'
  !insertmacro spindleTypes spindleType
  ; Explorer reads the types again
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro spindleTypes spindleUntype
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Spindle.Audio"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
