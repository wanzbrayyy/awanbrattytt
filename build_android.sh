#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Environment Setup ---
echo ">>> Cleaning up previous build environment..."
# Remove apt lock files to prevent conflicts
sudo rm -f /var/lib/apt/lists/lock
sudo rm -f /var/cache/apt/archives/lock
sudo rm -f /var/lib/dpkg/lock*
sudo dpkg --configure -a

echo ">>> Updating package lists..."
sudo apt-get update -y

echo ">>> Checking and installing dependencies (unzip, curl, openjdk-17)..."
sudo apt-get install -y unzip curl openjdk-17-jdk

# --- Java Setup ---
echo ">>> Setting up JAVA_HOME..."
export JAVA_HOME=$(update-java-alternatives -l | grep '1.17' | head -n 1 | awk '{print $3}')
echo ">>> JAVA_HOME is set to ${JAVA_HOME}"

# --- Android SDK Setup ---
echo ">>> Setting up Android SDK..."
SDK_ROOT=/usr/lib/android-sdk
export ANDROID_HOME=${SDK_ROOT}
export PATH=$PATH:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools

# Ensure SDK directories exist and have correct permissions
# Use sudo to create directory, then chown to the current user
sudo mkdir -p ${ANDROID_HOME}
sudo chown -R $(whoami) ${ANDROID_HOME}

# Download and set up cmdline-tools if not present
if [ ! -f "${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager" ]; then
    echo ">>> Android command-line tools not found. Downloading and installing..."
    # Using a known stable version of cmdline-tools
    CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip"
    CMDLINE_ZIP="/tmp/cmdline-tools.zip"

    curl -s -L "${CMDLINE_TOOLS_URL}" -o "${CMDLINE_ZIP}"
    # Clear out old cmdline-tools to ensure a clean install
    rm -rf "${ANDROID_HOME}/cmdline-tools"
    mkdir -p "${ANDROID_HOME}/cmdline-tools"
    unzip -oq "${CMDLINE_ZIP}" -d "${ANDROID_HOME}/cmdline-tools"
    # The zip extracts to a 'cmdline-tools' folder, we rename it to 'latest'
    mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest"
    rm "${CMDLINE_ZIP}"
    echo ">>> Command-line tools installed."
fi

# Use sdkmanager to accept licenses and install required packages
echo ">>> Accepting SDK licenses..."
yes | sdkmanager --licenses > /dev/null
echo ">>> Installing SDK platforms and build-tools..."
# Install platform, build-tools, and platform-tools
sdkmanager "platforms;android-30" "build-tools;30.0.3" "platform-tools" > /dev/null
echo ">>> SDK setup complete."

# --- Gradle Setup ---
GRADLE_VERSION="8.4"
GRADLE_DIST_URL="https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"
GRADLE_ZIP_PATH="/tmp/gradle-${GRADLE_VERSION}-bin.zip"
GRADLE_EXTRACT_DIR="/tmp/gradle-dist"
GRADLE_HOME="${GRADLE_EXTRACT_DIR}/gradle-${GRADLE_VERSION}"

if [ ! -f "${GRADLE_HOME}/bin/gradle" ]; then
    echo ">>> Downloading and setting up Gradle ${GRADLE_VERSION}..."
    rm -f "${GRADLE_ZIP_PATH}"
    rm -rf "${GRADLE_EXTRACT_DIR}"
    curl -L -o "${GRADLE_ZIP_PATH}" "${GRADLE_DIST_URL}"
    mkdir -p "${GRADLE_EXTRACT_DIR}"
    unzip -q "${GRADLE_ZIP_PATH}" -d "${GRADLE_EXTRACT_DIR}"
    rm "${GRADLE_ZIP_PATH}"
    echo ">>> Gradle ${GRADLE_VERSION} is ready."
else
    echo ">>> Gradle ${GRADLE_VERSION} is already available."
fi

# --- Build Step ---
# Navigate to the Android project directory
cd android_rat_source

echo ">>> Starting Gradle build..."
# Memory settings are now in gradle.properties
"${GRADLE_HOME}/bin/gradle" clean assembleDebug --no-daemon --info --stacktrace

echo ">>> Build finished successfully!"
echo ">>> APK should be available at: app/build/outputs/apk/debug/app-debug.apk"
