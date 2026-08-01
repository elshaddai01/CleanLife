const fs = require('fs');
const os = require('os');
const path = require('path');

const EXCLUDED_ADAPTER = /virtual|vmware|virtualbox|vbox|hyper-v|vethernet|wsl|loopback|bluetooth/i;
const PREFERRED_ADAPTER = /wi-?fi|wlan|wireless|ethernet|lan/i;

function isPrivateIPv4(address) {
  return /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

const candidates = Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) =>
  (addresses || [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal && isPrivateIPv4(entry.address))
    .map((entry) => ({
      name,
      address: entry.address,
      score: (PREFERRED_ADAPTER.test(name) ? 10 : 0) - (EXCLUDED_ADAPTER.test(name) ? 100 : 0),
    }))
);

candidates.sort((a, b) => b.score - a.score);
const selected = candidates[0];
if (!selected || selected.score < 0) {
  console.error('Could not find an active physical LAN/Wi-Fi IPv4 address.');
  process.exit(1);
}

const apiPort = process.env.EXPO_PUBLIC_API_PORT || '3001';
const contents = `# Generated automatically by npm start.\nEXPO_PUBLIC_API_BASE_URL=http://${selected.address}:${apiPort}\nEXPO_PUBLIC_API_PORT=${apiPort}\n`;
fs.writeFileSync(path.resolve(__dirname, '../.env.local'), contents, 'utf8');
console.log(`CleanLife mobile API: http://${selected.address}:${apiPort} (${selected.name})`);
