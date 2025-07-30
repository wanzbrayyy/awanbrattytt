const { Airgram, Auth, prompt } = require('airgram');
const Userbot = require('./models/userbot');

async function connectUserbot(userId, phoneNumber, userHash) {
  try {
    const airgram = new Airgram({
      apiId: config.telegramApiId,
      apiHash: config.telegramApiHash,
      command: 'airgram',
      logVerbosityLevel: 0,
    });

    const auth = new Auth(airgram);

    await airgram.use({});

    const check = await auth.check();

    if (check.isOkay) {
      if (check.result._ === "authorizationStateWaitTdlibParameters") {
        await auth.fetchTdlibParameters();
      }
      if (check.result._ === "authorizationStateWaitEncryptionKey") {
        await auth.checkEncryptionKey();
      }
      if (check.result._ === "authorizationStateWaitPhoneNumber") {
        await auth.sendPhoneNumber(phoneNumber);
      }
      if (check.result._ === "authorizationStateWaitCode") {
        const code = await prompt("Masukkan kode OTP Telegram: ");
        await auth.sendCode(code);
      }
      if (check.result._ === "authorizationStateWaitPassword") {
        const password = await prompt("Masukkan kata sandi 2FA Telegram Anda: ");
        await auth.sendPassword(password);
      }

      return airgram;
    } else {
      console.error("Gagal terhubung ke userbot:", check.error);
      return null;
    }
  } catch (error) {
    console.error("Kesalahan menghubungkan userbot:", error);
    return null;
  }
}

async function disconnectUserbot(airgram) {
  try {
    if (airgram) {
      await airgram.destroy();
    }
  } catch (error) {
    console.error("Gagal memutuskan userbot:", error);
  }
}

async function restoreSession(userId) {
  try {
    const userbot = await Userbot.findOne({ userId });
    if (userbot && userbot.session) {
      const airgram = new Airgram({
        apiId: config.telegramApiId,
        apiHash: config.telegramApiHash,
        command: "airgram",
        logVerbosityLevel: 0,
      });
      return airgram;
    }
    return null;
  } catch (error) {
    console.error("Kesalahan memulihkan sesi:", error);
    return null;
  }
}

module.exports = { connectUserbot, disconnectUserbot, restoreSession };