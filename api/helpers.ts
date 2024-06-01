import fs from 'fs';
import dotenv from 'dotenv';

// import it outside of api folder
dotenv.config({ path: '../.env' });

// fetch all powerusers from Neynar 
async function fetchPowerUsers() {
    const NEYNAR_API_KEY = 'NEYNAR_API_DOCS';
    let powerUsers: any[] = [];
    let powerUsersFids: any[] = [];
    let nextCursor = '';
    let hasMore = true;

    const delay = (ms: any) => new Promise((resolve) => setTimeout(resolve, ms));

    const options = {
        method: 'GET',
        headers: { accept: 'application/json', api_key: NEYNAR_API_KEY },
    };

    while (hasMore) {
        let url = 'https://api.neynar.com/v2/farcaster/user/power?limit=100';
        if (nextCursor) {
            url += `&cursor=${encodeURIComponent(nextCursor)}`;
        }

        try {
            const response = await fetch(url, options);
            const data = await response.json();
            powerUsers = powerUsers.concat(data.users);
            console.log(`data is ${JSON.stringify(data)}`)
            if (data.next.cursor) {
                nextCursor = data.next.cursor;
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error('Error fetching power users:', e);
            break;
        }

        await delay(5000);
    }

    // put fid of each power user in an array
    powerUsers.forEach((user) => {
        powerUsersFids.push(user['fid']);
    });

    return powerUsersFids;
}

// // fetch the power score for a given power user
async function fetchPowerScore(fid: any) {
    const REDASH_API = process.env.REDASH_API;
    const url = `https://data.hubs.neynar.com/api/queries/666/results`;
    // load all of fids from powerUsers.txt into a string separated by commas
    const powerUsers = fs.readFileSync('powerUsers.txt', 'utf8'); // TODO: fetch from database later on
    const fids = powerUsers.split('\n').join(',');
    const payload = {
        'max_age': 1800, // response from request lives 5 hours for now
        'parameters': {
            'fid': fid,
            'power_user_fids': fids,
        }
    };
    // make a post request 
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
            Authorization: `Key ${REDASH_API}`
         },
        body: JSON.stringify(payload),
    };
    try {
        let response = await fetch(url, options);
        let data = await response.json();
        if ('job' in data) {
            console.log(`data is ${JSON.stringify(data)}`)
            while (data.job.status < 3) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                console.log('Waiting for power score...')
                response = await fetch(url, options);
                data = await response.json();
                if ('query_result' in data) {
                    return data.query_result;
                }
            }
        } else {
            return data.query_result;
        }
    } catch (e) {
        console.error('Error fetching power score:', e);
        return null;
    }
}


// // fetch the power score of fid 429107
const result = await fetchPowerScore('429107');

// // log the power score
console.log(`Power score: ${JSON.stringify(result)}`);

export { fetchPowerUsers, fetchPowerScore };