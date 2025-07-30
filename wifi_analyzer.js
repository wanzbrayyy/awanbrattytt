const fs = require('fs');
const path = require('path');

// Muat database saat module di-load
const dbPath = path.join(__dirname, 'data', 'wifi_database.json');
const wifiDB = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

function analyzeSsid(ssid) {
    const analysis = {
        ssid: ssid,
        vulnerabilities: [],
        recommendations: []
    };

    // 1. Cek pola SSID yang rentan
    const matchedBrand = wifiDB.vulnerable_ssid_patterns.find(pattern => ssid.toLowerCase().includes(pattern.toLowerCase()));

    if (matchedBrand) {
        const brandData = wifiDB.default_passwords_by_brand[matchedBrand];
        if (brandData) {
            analysis.vulnerabilities.push(`SSID cocok dengan pola umum untuk brand **${matchedBrand}**.`);
            if (brandData.common_passwords.length > 0) {
                const passwords = brandData.common_passwords.map(p => `\`${p}\``).join(', ');
                analysis.vulnerabilities.push(`Potensi kata sandi default: ${passwords}.`);
            }
            if (brandData.login_info) {
                analysis.recommendations.push(brandData.login_info);
            }
        }
    }

    // 2. Cek SSID spesifik
    const specificSsidData = wifiDB.specific_ssids[ssid];
    if (specificSsidData) {
         analysis.vulnerabilities.push(`SSID ini terdaftar secara spesifik. ${specificSsidData.notes}`);
         const brandData = wifiDB.default_passwords_by_brand[specificSsidData.brand];
         if (brandData && brandData.common_passwords.length > 0) {
            const passwords = brandData.common_passwords.map(p => `\`${p}\``).join(', ');
            analysis.vulnerabilities.push(`Coba kata sandi umum untuk ${specificSsidData.brand}: ${passwords}.`);
         }
    }

    // Jika tidak ada kerentanan yang ditemukan
    if (analysis.vulnerabilities.length === 0) {
        analysis.recommendations.push('Tidak ada kerentanan umum yang terdeteksi dari nama SSID. Pastikan Anda menggunakan enkripsi WPA2/WPA3 dan kata sandi yang kuat.');
    }

    return analysis;
}

// Fungsi ini bisa dikembangkan untuk mem-parse output dari termux-wifi-scaninfo
function analyzeFullScan(scanOutput) {
    // Placeholder untuk pengembangan di masa depan
    // Di sini kita bisa mem-parse JSON dari scan, cek enkripsi (WEP, Open), sinyal, dll.
    return {
        error: "Fungsi analisis scan penuh belum diimplementasikan."
    };
}


module.exports = {
    analyzeSsid,
    analyzeFullScan
};
