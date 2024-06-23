import { filterCasts } from "./score.js";

async function retrieveJSONFilterCasts() {
    const REDASH_LINK = process.env.REDASH_REPLIES_LINK || '';
    if (!REDASH_LINK) {
        console.error('No Redash link provided.');
        return;
    }
    try {
        console.log('Fetching replies from Redash...');
        const response = await fetch(REDASH_LINK,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        const data = await response.json();
        await filterCasts(data.query_result.data.rows);
    } catch (e) {
        console.error('Error fetching replies:', e);
        return;
    }
}

function delay(ms: any) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runLoop() {
    while (true) {
        await retrieveJSONFilterCasts();
        await delay(60000); // 1 minute
    }
}

// Run the loop
// runLoop().then(() => {
//     console.log('Start.');
// });