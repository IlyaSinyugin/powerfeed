import { calculateAndStorePoints } from "./score.js";

function delay(ms: any) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLoop() {
    while (true) {
        await calculateAndStorePoints();
        await delay(600000); // 10 minute delay between point updates
    }
}

// Run the loop
// runLoop().then(() => {
//     console.log('Start.');
// });