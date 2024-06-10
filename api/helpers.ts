import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { sql } from "@vercel/postgres";

import powerUsersFids from './powerUsersFids.json' with { type: "json" };
// import dictionary

import { fidScore } from './index.js';

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
                    // add fid and score to the dictionary
                    fidScore[fid] = data.query_result.data.rows[0].score;
                    console.log(`fidScore as a whole is ${JSON.stringify(fidScore)}`)
                    if (data.query_result.data.rows[0].score === 0) {
                        // insert it to the db update 
                        await sql`UPDATE user_scores SET score_game2 = 1 WHERE fid = ${fid}`;
                        return 1;
                    } else {
                        await sql`UPDATE user_scores SET score_game2 = ${data.query_result.data.rows[0].score} WHERE fid = ${fid}`;
                        return data.query_result.data.rows[0].score;
                    }
                }
            }
        } else {
            fidScore[fid] = data.query_result.data.rows[0].score;
            console.log(`fidScore as a whole is ${JSON.stringify(fidScore)}`)
            return data.query_result;
        }
    } catch (e) {
        console.error('Error fetching power score:', e);
        return null;
    }
}

async function fetchPowerScoreGame2() {
    const REDASH_API = process.env.REDASH_API;
    const url = `https://data.hubs.neynar.com/api/queries/692/results`;
    const powerUsers = powerUsersFids.join(',');

    try {
        const { rows } = await sql`SELECT fid FROM user_scores`;
        const targetFids = rows.map(row => row.fid).join(',');

        console.log(`Fetching power scores for ${rows.length} users...`);

        const payload = {
            'max_age': 18000,
            'parameters': {
                'target_fids': targetFids,
                'power_user_fids': powerUsers,
            }
        };

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Key ${REDASH_API}`
            },
            body: JSON.stringify(payload),
        };

        let response = await fetch(url, options);
        let data = await response.json();

        console.log(`Initial response: ${JSON.stringify(data)}`);

        if ('job' in data) {
            const jobId = data.job.id;
            let jobStatus = data.job.status;

            // Polling for job status until it completes
            while (jobStatus < 3) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                response = await fetch(`${url}/${jobId}`, { headers: { Authorization: `Key ${REDASH_API}` } });
                data = await response.json();
                jobStatus = data.job.status;
                console.log(`Polling job status: ${jobStatus}`);
            }
        }

        if (data.query_result && data.query_result.data) {
            console.log(`Final query result: ${JSON.stringify(data.query_result.data)}`);

            const results = data.query_result.data.rows;
            for (const result of results) {
                let { author_fid, power_score } = result;
                if (power_score === 0) {
                    power_score = 1;
                }

                await sql`UPDATE user_scores SET score_game2 = ${power_score} WHERE fid = ${author_fid}`;
            }

            console.log('Power scores updated successfully');
        } else {
            console.error('Query result data is missing');
        }
    } catch (e) {
        console.error('Error fetching or updating power scores:', e);
    }
}

async function fetchPowerScoreGame2ForFID(fid: any, retries = 3) {
    const REDASH_API = process.env.REDASH_API;
    const url = `https://data.hubs.neynar.com/api/queries/692/results`;
    const powerUsers = powerUsersFids.join(',');

    const payload = {
        'max_age': 18000,
        'parameters': {
            'target_fids': fid,
            'power_user_fids': powerUsers,
        }
    };

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Key ${REDASH_API}`
        },
        body: JSON.stringify(payload),
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Fetching power score for fid ${fid}, attempt ${attempt}...`);
            let response = await fetch(url, options);
            let data = await response.json();

            if ('job' in data) {
                while (data.job.status < 3) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    response = await fetch(url, options);
                    data = await response.json();
                }
            }

            if ('query_result' in data) {
                // Extract the power score
                const result = data.query_result.data.rows[0];
                let { power_score } = result;
                if (power_score === 0 || power_score === undefined) {
                    power_score = 1;
                }
                // Update the database
                await sql`UPDATE user_scores SET score_game2 = ${power_score} WHERE fid = ${fid}`;
                console.log(`Power score updated successfully for fid ${fid}`);
                return power_score;
            } else {
                console.error(`Query result data is missing for fid ${fid}`);
                return null;
            }
        } catch (e) {
            console.error(`Error fetching or updating power score for fid ${fid} on attempt ${attempt}:`, e);
            if (attempt === retries) {
                return null;
            }
        }
    }
}

async function fetchFids(): Promise<string[]> {
    const { rows } = await sql`SELECT fid FROM user_scores`;
    return rows.map(row => row.fid);
}

async function fetchFidsWithNullEthAddresses(): Promise<string[]> {
    const { rows } = await sql`SELECT fid FROM user_scores WHERE eth_addresses IS NULL`;
    return rows.map(row => row.fid);
}

async function fetchETHaddressesForFID(fid: any) {
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS';

    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            api_key: NEYNAR_API_KEY,
        },
    };

    const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(fid)}`;

    try {
        const response = await fetch(url, options);
        const data = await response.json();

        if (data.users && data.users.length > 0) {
            const user = data.users[0];
            const ethAddresses = Array.from(new Set(user.verified_addresses.eth_addresses)).join(',');

            // Fetch current eth_addresses from the database
            const { rows } = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${fid}`;
            if (rows.length > 0) {
                const currentEthAddresses = rows[0].eth_addresses;

                // Only update if the addresses have changed
                if (currentEthAddresses !== ethAddresses) {
                    await sql`UPDATE user_scores SET eth_addresses = ${ethAddresses} WHERE fid = ${fid}`;
                    console.log(`ETH addresses updated successfully for fid ${fid}`);
                    return ethAddresses;
                } else {
                    console.log(`No change in ETH addresses for fid ${fid}`);
                }
            }
        } else {
            console.error(`No users in response for fid ${fid}:`, data);
        }
    } catch (e) {
        console.error(`Error fetching eth addresses for fid ${fid}:`, e);
    }
}




async function fetchETHaddresses() {
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS';
    const fids = await fetchFids();
    const BATCH_SIZE = 99;
    
    for (let i = 0; i < fids.length; i += BATCH_SIZE) {
        const batch = fids.slice(i, i + BATCH_SIZE);
        const fidsParam = batch.join(',');

        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                api_key: NEYNAR_API_KEY,
            },
        };

        const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(fidsParam)}`;

        try {
            const response = await fetch(url, options);
            const data = await response.json();

            if (data.users) {
                for (const user of data.users) {
                    const ethAddresses = Array.from(new Set(user.verified_addresses.eth_addresses)).join(',');

                    // Fetch current eth_addresses from the database
                    const { rows } = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${user.fid}`;
                    if (rows.length > 0) {
                        const currentEthAddresses = rows[0].eth_addresses;

                        // Only update if the addresses have changed
                        if (currentEthAddresses !== ethAddresses) {
                            await sql`UPDATE user_scores SET eth_addresses = ${ethAddresses} WHERE fid = ${user.fid}`;
                            console.log(`ETH addresses updated successfully for fid ${user.fid}`);
                        } else {
                            console.log(`No change in ETH addresses for fid ${user.fid}`);
                        }
                    }
                }
            } else {
                console.error('No users in response:', data);
            }
        } catch (e) {
            console.error('Error fetching eth addresses:', e);
        }

        // Delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}




async function fetchETHaddressesForNull() {
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS';
    const fids = await fetchFidsWithNullEthAddresses();
    const BATCH_SIZE = 99;
    
    for (let i = 0; i < fids.length; i += BATCH_SIZE) {
        const batch = fids.slice(i, i + BATCH_SIZE);
        const fidsParam = batch.join(',');

        const options = {
            method: 'GET',
            headers: {
                accept: 'application/json',
                api_key: NEYNAR_API_KEY,
            },
        };

        const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(fidsParam)}`;

        try {
            const response = await fetch(url, options);
            const data = await response.json();

            if (data.users) {
                for (const user of data.users) {
                    const ethAddresses = user.verified_addresses.eth_addresses.join(',');

                    await sql`UPDATE user_scores SET eth_addresses = ${ethAddresses} WHERE fid = ${user.fid}`;
                }
            } else {
                console.error('No users in response:', data);
            }
        } catch (e) {
            console.error('Error fetching eth addresses:', e);
        }

        // Delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

async function fetchBuildScore() {
    const TALENT_API_KEY = process.env.TALENT_API_KEY;
    if (!TALENT_API_KEY) {
        console.error('TALENT_API_KEY is missing');
        return;
    }
    const BATCH_SIZE = 99;
    const RATE_LIMIT_DELAY = 100; // 10 requests per second

    const { rows } = await sql`SELECT fid, eth_addresses FROM user_scores WHERE eth_addresses IS NOT NULL`;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        for (const user of batch) {
            const ethAddresses = user.eth_addresses.split(',').filter(Boolean);
            let totalBuildScore = 0;

            for (const address of ethAddresses) {
                const url = `https://api.talentprotocol.com/api/v2/passports/${address}`;

                const options = {
                    method: 'GET',
                    headers: {
                        'X-API-KEY': TALENT_API_KEY,
                        'Content-Type': 'application/json'
                    }
                };

                try {
                    const response = await fetch(url, options);
                    const data = await response.json();
                    const score = data.passport?.score || 0;
                    totalBuildScore += score;

                    // Delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                } catch (e) {
                    console.error(`Error fetching build score for address ${address}:`, e);
                }
            }

            // Fetch current build score from the database
            const { rows: currentRows } = await sql`SELECT builder_score FROM user_scores WHERE fid = ${user.fid}`;
            if (currentRows.length > 0) {
                const currentBuilderScore = currentRows[0].builder_score;

                // Only update if the score has changed
                if (currentBuilderScore !== totalBuildScore) {
                    await sql`UPDATE user_scores SET builder_score = ${totalBuildScore} WHERE fid = ${user.fid}`;
                    console.log(`Builder score updated successfully for fid ${user.fid}`);
                } else {
                    console.log(`No change in builder score for fid ${user.fid}`);
                }
            }
        }
    }
}

async function fetchBuildScoreForFID(fid: any) {
    const TALENT_API_KEY = process.env.TALENT_API_KEY;
    if (!TALENT_API_KEY) {
        throw new Error("TALENT_API_KEY is not defined in the environment variables.");
    }
    const RATE_LIMIT_DELAY = 100; // 10 requests per second

    let { rows } = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${fid} AND eth_addresses IS NOT NULL`;

    if (rows.length === 0) {
        console.log(`No eth_addresses found for fid ${fid}`);
        // try to find eth addresses for that fid 
        await fetchETHaddressesForFID(fid);
        ({ rows } = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${fid} AND eth_addresses IS NOT NULL`);

        if (rows.length === 0) {
            console.error(`No eth_addresses found for fid ${fid}`);
            return 0;
        }
    }

    const ethAddresses = rows[0].eth_addresses.split(',').filter(Boolean);
    let totalBuildScore = 0;

    for (const address of ethAddresses) {
        const url = `https://api.talentprotocol.com/api/v2/passports/${address}`;

        const options = {
            method: 'GET',
            headers: {
                'X-API-KEY': TALENT_API_KEY,
                'Content-Type': 'application/json'
            }
        };

        try {
            const response = await fetch(url, options);
            const data = await response.json();
            const score = data.passport?.score || 0;
            totalBuildScore += score;

            // Delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        } catch (e) {
            console.error(`Error fetching build score for address ${address}:`, e);
        }
    }

    // Fetch current build score from the database
    const { rows: currentRows } = await sql`SELECT builder_score FROM user_scores WHERE fid = ${fid}`;
    if (currentRows.length > 0) {
        const currentBuilderScore = currentRows[0].builder_score;

        // Only update if the score has changed
        if (currentBuilderScore !== totalBuildScore) {
            await sql`UPDATE user_scores SET builder_score = ${totalBuildScore} WHERE fid = ${fid}`;
            console.log(`Builder score updated successfully for fid ${fid}`);
        } else {
            console.log(`No change in builder score for fid ${fid}`);
        }
    }

    return totalBuildScore;
}

// fetchBuildScore().then(
//     () => console.log('Build scores updated successfully')
// );


// fetchPowerScoreGame2().then(
//     () => console.log('Power scores updated successfully')
// );

// fetchETHaddresses().then(
//     () => console.log('ETH addresses updated successfully')
// );

// fetchETHaddressesForNull().then(
//     () => console.log('ETH addresses updated successfully')
// );

// fetchPowerUsers - call this function 
// fetchPowerUsers().then(() => {
//     console.log('Power users fetched successfully');
// });

export { fetchPowerUsers, fetchPowerScore, fetchPowerScoreGame2, fetchPowerScoreGame2ForFID, fetchETHaddresses, fetchETHaddressesForFID, fetchETHaddressesForNull, fetchBuildScore, fetchBuildScoreForFID, fetchFids, fetchFidsWithNullEthAddresses};