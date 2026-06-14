!macro customUnInstall
  IfSilent keepUserData
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to remove your Rest Stop configuration and saved backup profiles from this computer?$\r$\n$\r$\nChoose No to keep them for a future reinstall." IDYES removeUserData IDNO keepUserData

  removeUserData:
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif

  keepUserData:
!macroend
