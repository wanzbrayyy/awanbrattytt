#!/bin/sh
echo "Testing script..."
app_path="./"
# Line 75 from original clean script
APP_HOME=${app_path%"${app_path##*/}"}  # leaves a trailing /; empty if no leading path
echo "APP_HOME is: $APP_HOME"

# Line 90 from original clean script
case "$( uname )" in
  Darwin* ) echo "macOS" ;;
  *) echo "Other OS" ;;
esac
echo "Test complete."
