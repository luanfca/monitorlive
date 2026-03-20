import fs from 'fs';
import https from 'https';
import path from 'path';

const wrapperUrl = 'https://raw.githubusercontent.com/gradle/gradle/v8.0.2/gradle/wrapper/gradle-wrapper.jar';
const targetPath = path.join(process.cwd(), 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar');

console.log(`Downloading Gradle Wrapper from ${wrapperUrl}...`);

const file = fs.createWriteStream(targetPath);

https.get(wrapperUrl, (response) => {
    if (response.statusCode !== 200) {
        console.error(`Failed to download: HTTP ${response.statusCode}`);
        process.exit(1);
    }

    response.pipe(file);

    file.on('finish', () => {
        file.close();
        console.log(`Gradle Wrapper downloaded successfully to ${targetPath}`);
        
        // Verify file size
        const stats = fs.statSync(targetPath);
        console.log(`File size: ${stats.size} bytes`);
        
        if (stats.size < 1000) {
            console.error('File seems too small, might be corrupted.');
        }
    });
}).on('error', (err) => {
    fs.unlink(targetPath, () => {}); // Delete the file async
    console.error(`Error downloading file: ${err.message}`);
    process.exit(1);
});
