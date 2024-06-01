import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import powerUsersFids from './powerUsersFids.json' with { type: "json" };

// import it outside of api folder
dotenv.config({ path: path.join(process.cwd(), './.env') });

// fetch all powerusers from Neynar 
async function fetchPowerUsers() {
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS';
    let powerUsers: any[] = [];
    let powerUsersFids: any[] = [];
    let nextCursor = '';
    let hasMore = true;

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
            if (data.next && data.next.cursor) {
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

    // Extract FIDs and save them to a JSON file
    powerUsers.forEach((user) => {
        powerUsersFids.push(user['fid']);
    });

    // Save to a JSON file in the current directory
    fs.writeFileSync('powerUsersFids.json', JSON.stringify(powerUsersFids, null, 2));
    console.log('Power user FIDs saved to powerUsersFids.json');

    return powerUsersFids;
}
// // fetch the power score for a given power user
async function fetchPowerScore(fid: any) {
    const REDASH_API = process.env.REDASH_API;
    const url = `https://data.hubs.neynar.com/api/queries/666/results`;
    // load all of fids from powerUsers.txt into a string separated by commas
    //const powerUsers = fs.readFileSync('/api/powerUsers.txt', 'utf8'); // TODO: fetch from database later on

    // get powerusers from powerUsersFids.json
    const powerUsers = powerUsersFids.join(',');
    //console.log(`Power users: ${powerUsers}`)
    const fids = powerUsers.split('\n').join(',');
    const payload = {
        'max_age': 18000, // response from request lives 5 hours for now
        'parameters': {
            'fid': fid,
            'power_user_fids': fids,
        }
    };
    // make a post request 
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Key ${REDASH_API}`
        },
        body: JSON.stringify(payload),
    };
    try {
        console.log(`Fetching power score for ${fid}...`)
        let response = await fetch(url, options);
        let data = await response.json();
        if ('job' in data) {
            while (data.job.status < 3) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
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

export { fetchPowerUsers, fetchPowerScore };