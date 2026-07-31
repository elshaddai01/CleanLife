const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function filesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        return entry.isDirectory() ? filesUnder(fullPath) : [fullPath];
    });
}

const files = filesUnder(path.resolve(__dirname, '../src')).filter((file) => file.endsWith('.js'));
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length + 1} backend files.`);
