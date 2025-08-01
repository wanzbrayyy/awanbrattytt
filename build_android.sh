#!/bin/bash

# Exit on any error
set -e

echo ">>> Setting up Android SDK..."

# Define SDK root
SDK_ROOT=/usr/lib/android-sdk

# Ensure SDK directories exist and have correct permissions
sudo mkdir -p ${SDK_ROOT}
sudo chown -R $(whoami) ${SDK_ROOT}

# Download and set up cmdline-tools if not present
if [ ! -f "${SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager" ]; then
    echo ">>> Android command-line tools not found. Downloading and installing..."
    CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
    CMDLINE_ZIP="/tmp/cmdline-tools.zip"

    curl -s -L "${CMDLINE_TOOLS_URL}" -o "${CMDLINE_ZIP}"
    mkdir -p "${SDK_ROOT}/cmdline-tools"
    unzip -oq "${CMDLINE_ZIP}" -d "${SDK_ROOT}/cmdline-tools"
    mv "${SDK_ROOT}/cmdline-tools/cmdline-tools" "${SDK_ROOT}/cmdline-tools/latest"
    rm "${CMDLINE_ZIP}"
    echo ">>> Command-line tools installed."
fi

# Use sdkmanager to accept licenses and install required packages
# The 'yes' command automatically accepts all licenses.
yes | ${SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager --licenses > /dev/null
echo ">>> Installing SDK platform 30 and build-tools 34.0.0..."
${SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager "platforms;android-30" "build-tools;34.0.0" > /dev/null

echo ">>> SDK setup complete."
echo ">>> Starting Gradle build..."

# Define Gradle version and paths
GRADLE_VERSION="8.4"
GRADLE_ZIP="/tmp/gradle-${GRADLE_VERSION}-bin.zip"
GRADLE_UNZIP_DIR="/tmp/gradle-unzipped"
GRADLE_HOME="${GRADLE_UNZIP_DIR}/gradle-${GRADLE_VERSION}"

# Download and unzip Gradle if not already present
if [ ! -f "${GRADLE_HOME}/bin/gradle" ]; then
    echo ">>> Gradle not found. Downloading and installing..."
    curl -s -L "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" -o "${GRADLE_ZIP}"
    # Clean up old dir before unzipping
    rm -rf "${GRADLE_UNZIP_DIR}"
    mkdir -p "${GRADLE_UNZIP_DIR}"
    unzip -oq "${GRADLE_ZIP}" -d "${GRADLE_UNZIP_DIR}"
    rm "${GRADLE_ZIP}"
    echo ">>> Gradle installed."
fi

# Change to the android source directory and run the build
cd android_rat_source
"${GRADLE_HOME}/bin/gradle" clean assembleDebug

echo ">>> Build finished. APK should be at: android_rat_source/app/build/outputs/apk/debug/app-debug.apk"
