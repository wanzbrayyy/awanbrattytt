#!/bin/bash

set -e

# --- Environment Setup ---
# This part is still needed to install Java and the Android SDK
echo ">>> Cleaning up previous build environment..."
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
JAVA_PATH=$(update-java-alternatives -l | grep '1.17' | head -n 1 | awk '{print $3}')
if [ -z "$JAVA_PATH" ]; then
  echo "Java 17 not found, trying to find any installed JDK"
  JAVA_PATH=$(update-java-alternatives -l | head -n 1 | awk '{print $3}')
fi
export JAVA_HOME=$JAVA_PATH
echo ">>> JAVA_HOME is set to ${JAVA_HOME}"


# --- Android SDK Setup ---
# This part is also still needed
echo ">>> Setting up Android SDK..."
SDK_ROOT=/usr/lib/android-sdk
export ANDROID_HOME=${SDK_ROOT}
export PATH=$PATH:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools

sudo mkdir -p ${ANDROID_HOME}
sudo chown -R $(whoami) ${ANDROID_HOME}

if [ ! -f "${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager" ]; then
    echo ">>> Android command-line tools not found. Downloading and installing..."
    CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip"
    CMDLINE_ZIP="/tmp/cmdline-tools.zip"
    curl -s -L "${CMDLINE_TOOLS_URL}" -o "${CMDLINE_ZIP}"
    rm -rf "${ANDROID_HOME}/cmdline-tools"
    mkdir -p "${ANDROID_HOME}/cmdline-tools"
    unzip -oq "${CMDLINE_ZIP}" -d "${ANDROID_HOME}/cmdline-tools"
    mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest"
    rm "${CMDLINE_ZIP}"
    echo ">>> Command-line tools installed."
fi

echo ">>> Accepting SDK licenses..."
yes | sdkmanager --licenses > /dev/null
echo ">>> Installing SDK platforms and build-tools..."
sdkmanager "platforms;android-30" "build-tools;30.0.3" "platform-tools" > /dev/null
echo ">>> SDK setup complete."

# --- Build Step ---
# Navigate to the Android project directory
cd android_rat_source

echo ">>> Making gradlew executable..."
chmod +x ./gradlew

echo ">>> Starting Gradle build with wrapper..."
# Use the Gradle Wrapper. It will download the correct Gradle version automatically.
./gradlew clean assembleDebug --no-daemon --info --stacktrace

echo ">>> Build finished successfully!"
echo ">>> APK should be available at: app/build/outputs/apk/debug/app-debug.apk"
