# Wanzofc Shop Bot

This project contains a Telegram bot with various features, including live chat, link tracking, and integration with an Android remote administration application.

## Running the Bot

To run the Telegram bot, you will need to have Node.js and npm installed on your system (e.g., a Linux server or a personal computer).

### 1. Configuration

Before you can run the bot, you must set up your configuration.

1.  Find the file named `config.js` in the project directory.
2.  Open this file and fill in your details, such as your Telegram bot token, your MongoDB database URI, and your numeric Telegram admin ID.

**Example `config.js`:**
```javascript
module.exports = {
    telegramToken: 'YOUR_TELEGRAM_BOT_TOKEN',
    mongodbUri: 'mongodb://localhost:27017/your_database_name',
    adminId: 'YOUR_TELEGRAM_ADMIN_ID',
    botBaseUrl: 'http://your_server_ip_or_domain:3000'
    // ... other settings
};
```

### 2. Install Dependencies

Open a terminal in the project's root directory and run the following command. This will download all the necessary libraries the bot depends on.

```bash
npm install
```

### 3. Start the Bot

After the installation is complete, you can start the bot using this command:

```bash
node bot.js
```

If everything is configured correctly, the bot will connect to Telegram and print a confirmation message in the console. You can then interact with it through your Telegram client.

---

## Building the Android Application (APK)

The repository includes the source code for an Android application that works with the bot. A build script, `build_android.sh`, has been corrected and simplified to compile this application into an APK file.

**Note:** The build script is designed for a Debian-based Linux environment (e.g., Ubuntu) and will attempt to install the necessary dependencies using `sudo apt-get`. You will likely be prompted for your password.

### How to Build

1.  Make sure you are in the project's root directory.
2.  Run the following command in your terminal:

    ```bash
    npm run build:android
    ```
    Alternatively, you can run the script directly:
    ```bash
    bash ./build_android.sh
    ```

3.  **Be patient.** The script will handle everything automatically: it will install the Java JDK, the Android SDK, and all other required tools. This process can take a significant amount of time (10-20 minutes or more), especially on the first run, as it needs to download several gigabytes of data.

4.  If the build is successful, you will find the generated APK file at the following path:
    `android_rat_source/app/build/outputs/apk/debug/app-debug.apk`
