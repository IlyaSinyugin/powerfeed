import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { sql } from "@vercel/postgres";
import crypto from "crypto";

import powerUsersFids from './powerUsersFids.json' with { type: "json" };
// import dictionary

import { fidScore } from './index.js';

// import it outside of api folder
dotenv.config({ path: path.join(process.cwd(), './.env') });

async function generateRandomHash() {
    const randomString = crypto.randomBytes(16).toString('base64url').substring(0, 22); 
    console.log(`Random hash generated: ${randomString}`);
    return randomString;
}

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
            console.log(`Fetching next page with cursor: ${nextCursor}`)
            url += `&cursor=${encodeURIComponent(nextCursor)}`;
        }

        try {
            const response = await fetch(url, options);
            const data = await response.json();
            powerUsers = powerUsers.concat(data.users);
            if (data.next && data.next.cursor) {
                nextCursor = data.next.cursor;
                console.log(`Next cursor: ${nextCursor}`)
            } else {
                hasMore = false;
            }
        } catch (e) {
            console.error('Error fetching power users:', e);
            break;
        }

        await delay(500);
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
                    fidScore[fid] = data.query_result.data.rows[0].power_score;
                    console.log(`fidScore as a whole is ${JSON.stringify(fidScore)}`)
                    if (data.query_result.data.rows[0].score === 0) {
                        // insert it to the db update 
                        await sql`UPDATE user_scores SET score_game2 = 1 WHERE fid = ${fid}`;
                        return 1;
                    } else {
                        await sql`UPDATE user_scores SET score_game2 = ${data.query_result.data.rows[0].power_score} WHERE fid = ${fid}`;
                        console.log(`Returning the score ${JSON.stringify(data.query_result.data.rows[0].power_score)}`)
                        return data.query_result.data.rows[0].power_score;
                    }
                }
            }
        } else {
            fidScore[fid] = data.query_result.data.rows[0].power_score;
            console.log(`Returning the score ${JSON.stringify(data.query_result.data.rows[0])}`)
            await sql`UPDATE user_scores SET score_game2 = ${data.query_result.data.rows[0].power_score} WHERE fid = ${fid}`;
            return data.query_result.data.rows[0].power_score;
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
        const result = await sql`SELECT fid FROM user_scores`;
        const rows = result.rows;
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
    const result = await sql`SELECT fid FROM user_scores`;
    const rows = result.rows;
    return rows.map(row => row.fid);
}

async function fetchFidsWithNullEthAddresses(): Promise<string[]> {
    const result = await sql`SELECT fid FROM user_scores WHERE eth_addresses IS NULL`;
    const rows = result.rows;
    return rows.map(row => row.fid);
}

async function fetchETHaddressesForFID(fid: any) {
    console.log(`Function of fetchETHaddressesForFID is called with fid ${fid}`);
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

        console.log(`Data: ${JSON.stringify(data)} for fid ${fid}`);

        if (data.users && data.users.length > 0) {
            const user = data.users[0];
            const ethAddresses = Array.from(new Set(user.verified_addresses.eth_addresses)).join(',');

            console.log(`ETH addresses for fid ${fid}: ${ethAddresses}`)

            // Fetch current eth_addresses from the database
            const results = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${fid}`;
            const rows = results.rows;

            console.log(`Rows: ${JSON.stringify(rows)}, length of rows: ${rows.length}`);
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
            } else {
                console.log(`No eth_addresses found for fid ${fid}`);
                // Insert the new eth_addresses
                console.log(`Eth addresses to be inserted are ${ethAddresses}`)
                if (ethAddresses) {
                    //await sql`INSERT INTO user_scores (fid, eth_addresses) VALUES (${fid}, ${ethAddresses})`;
                    console.log(`ETH addresses to be returned for fid ${fid}: ${ethAddresses}`);
                    // insert into user_eth_addresses where the columns are fid and eth_addresses
                    await sql`INSERT INTO user_eth_addresses (fid, eth_addresses) VALUES (${fid}, ${ethAddresses}) ON CONFLICT (fid) DO NOTHING`;
                    return ethAddresses;
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
                    const result = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${user.fid}`;
                    const rows = result.rows;
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
    const RATE_LIMIT_DELAY = 150; // 15 requests per second

    // First process accounts where builder_score is 0 and eth_addresses is null
    let results = await sql`SELECT fid, eth_addresses FROM user_scores WHERE builder_score = 0 AND eth_addresses IS NULL`;
    let rows = results.rows;

    console.log(`PHASE1: Processing ${rows.length} accounts...`);
    
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        for (const user of batch) {
            console.log(`No eth_addresses found for fid ${user.fid}`);
            // Try to fetch eth addresses for that fid
            await fetchETHaddressesForFID(user.fid);
            const result = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${user.fid} AND eth_addresses IS NOT NULL`;
            if (result.rows.length === 0) {
                console.error(`No eth_addresses found for fid ${user.fid} after re-fetching`);
                continue;
            } else {
                user.eth_addresses = result.rows[0].eth_addresses;
            }

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
                    console.log(`Data: ${JSON.stringify(data)} for address ${address} and fid ${user.fid}`);
                    const score = data.passport?.score || 0;
                    if (score > totalBuildScore) {
                        totalBuildScore = score;
                    }
                    console.log(`Build score for address ${address} and fid ${user.fid}: ${score}`)

                    // Delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                } catch (e) {
                    console.error(`Error fetching build score for address ${address}:`, e);
                }
            }

            // Fetch current build score from the database
            const results = await sql`SELECT builder_score FROM user_scores WHERE fid = ${user.fid}`;
            const currentRows = results.rows;
            if (currentRows.length > 0) {
                const currentBuilderScore = currentRows[0].builder_score;

                // Only update if the score has changed
                if (currentBuilderScore !== totalBuildScore && totalBuildScore > 0) {
                    await sql`UPDATE user_scores SET builder_score = ${totalBuildScore} WHERE fid = ${user.fid}`;
                    console.log(`Builder score updated successfully for fid ${user.fid} from ${currentBuilderScore} to ${totalBuildScore}`);
                } else {
                    console.log(`No change in builder score for fid ${user.fid} after re-fetching, current score: ${currentBuilderScore}, new score: ${totalBuildScore}`);
                }
            }
        }
    }

    // process accounts where builder_score is 0 and eth_addresses is not null
    results = await sql`SELECT fid, eth_addresses FROM user_scores WHERE builder_score = 0 AND eth_addresses IS NOT NULL`;
    rows = results.rows;

    console.log(`PHASE2: Processing ${rows.length} accounts...`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        for (const user of batch) {
            if (!user.eth_addresses) {
                console.log(`No eth_addresses found for fid ${user.fid}`);
                // Try to fetch eth addresses for that fid
                await fetchETHaddressesForFID(user.fid);
                const result = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${user.fid} AND eth_addresses IS NOT NULL`;
                if (result.rows.length === 0) {
                    console.error(`No eth_addresses found for fid ${user.fid} after re-fetching`);
                    continue;
                } else {
                    user.eth_addresses = result.rows[0].eth_addresses;
                }
            }

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
                    console.log(`Data: ${JSON.stringify(data)} for address ${address} and fid ${user.fid}`);
                    const score = data.passport?.score || 0;
                    if (score > totalBuildScore) {
                        totalBuildScore = score;
                    }
                    console.log(`Build score for address ${address} and fid ${user.fid}: ${score}`);

                    // Delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                } catch (e) {
                    console.error(`Error fetching build score for address ${address}:`, e);
                }
            }

            // Fetch current build score from the database
            const result = await sql`SELECT builder_score FROM user_scores WHERE fid = ${user.fid}`;
            const currentRows = result.rows;
            if (currentRows.length > 0) {
                const currentBuilderScore = currentRows[0].builder_score;

                // Only update if the score has changed
                if (currentBuilderScore !== totalBuildScore && totalBuildScore > 0) {
                    await sql`UPDATE user_scores SET builder_score = ${totalBuildScore} WHERE fid = ${user.fid}`;
                    console.log(`Builder score updated successfully for fid ${user.fid} from ${currentBuilderScore} to ${totalBuildScore}`);
                } else {
                    console.log(`No change in builder score for fid ${user.fid}, current score: ${currentBuilderScore}, new score: ${totalBuildScore}`);
                }
            }
        }
    }


    // Then process the rest
    results = await sql`SELECT fid, eth_addresses FROM user_scores`;
    rows = results.rows;

    console.log(`PHASE3: Processing ${rows.length} accounts...`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);

        for (const user of batch) {
            if (!user.eth_addresses) {
                console.log(`No eth_addresses found for fid ${user.fid}`);
                // Try to fetch eth addresses for that fid
                await fetchETHaddressesForFID(user.fid);
                const result = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${user.fid} AND eth_addresses IS NOT NULL`;
                if (result.rows.length === 0) {
                    console.error(`No eth_addresses found for fid ${user.fid} after re-fetching`);
                    continue;
                } else {
                    user.eth_addresses = result.rows[0].eth_addresses;
                }
            }

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
                    console.log(`Data: ${JSON.stringify(data)} for address ${address} and fid ${user.fid}`);

                    const score = data.passport?.score || 0;
                    if (score > totalBuildScore) {
                        totalBuildScore = score;
                    }
                    console.log(`Build score for address ${address} and fid ${user.fid}: ${score}`);

                    // Delay to respect rate limits
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
                } catch (e) {
                    console.error(`Error fetching build score for address ${address}:`, e);
                }
            }

            // Fetch current build score from the database
            const result = await sql`SELECT builder_score FROM user_scores WHERE fid = ${user.fid}`;
            const currentRows = result.rows;
            if (currentRows.length > 0) {
                const currentBuilderScore = currentRows[0].builder_score;

                // Only update if the score has changed
                if (currentBuilderScore !== totalBuildScore && totalBuildScore > 0) {
                    await sql`UPDATE user_scores SET builder_score = ${totalBuildScore} WHERE fid = ${user.fid}`;
                    console.log(`Builder score updated successfully for fid ${user.fid} from ${currentBuilderScore} to ${totalBuildScore}`);
                } else {
                    console.log(`No change in builder score for fid ${user.fid}, current score: ${currentBuilderScore}, new score: ${totalBuildScore}`);
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

    let results = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${fid} AND eth_addresses IS NOT NULL`;
    let rows = results.rows;

    console.log(`Fetching build score for fid ${fid}... Rows are ${JSON.stringify(rows)}`)

    if (rows.length === 0) {
        console.log(`No eth_addresses found for fid ${fid}`);
        // try to find eth addresses for that fid 
        const ethAddresses = await fetchETHaddressesForFID(fid);
        // insert them into db and on conflict do nothing 
        results = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${fid} AND eth_addresses IS NOT NULL`;
        rows = results.rows;

        if (rows.length === 0) {
            console.error(`again - No eth_addresses found for fid ${fid}`);
            // try to fetch from backup table user_eth_addresses
            let localResult = await sql`SELECT eth_addresses FROM user_eth_addresses WHERE fid = ${fid}`;
            let localRows = localResult.rows;
            if (localRows.length === 0) {
                console.error(`No eth_addresses found for fid ${fid} in backup table user_eth_addresses`);
                return 0;
            } else {
                rows = localRows;
                console.log(`ETH addresses found for fid ${fid} in backup table user_eth_addresses`);
            }
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
            console.log(`Data: ${JSON.stringify(data)} for address ${address} and fid ${fid}`);

            const score = data.passport?.score || 0;
            if (score > totalBuildScore) {
                totalBuildScore = score;
            }
            // Delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        } catch (e) {
            console.error(`Error fetching build score for address ${address}:`, e);
        }
    }

    // Fetch current build score from the database
    const result = await sql`SELECT builder_score FROM user_scores WHERE fid = ${fid}`;
    const currentRows = result.rows;
    if (currentRows.length > 0) {
        const currentBuilderScore = currentRows[0].builder_score;

        // Only update if the score has changed
        if (currentBuilderScore !== totalBuildScore && totalBuildScore > 0) {
            await sql`UPDATE user_scores SET builder_score = ${totalBuildScore} WHERE fid = ${fid}`;
            console.log(`Builder score updated successfully for fid ${fid}`);
        } else {
            console.log(`No change in builder score for fid ${fid}`);
        }
    }

    return totalBuildScore;
}

async function syncETHAddresses(fid: any) {
    console.log(`Function of syncETHAddresses is called with fid ${fid}`);
    const ethAddressesResult = await sql`SELECT eth_addresses FROM user_scores WHERE fid = ${fid}`;
    const ethAddressesRows = ethAddressesResult.rows;
    console.log(`ETH addresses rows: ${JSON.stringify(ethAddressesRows)}, length: ${ethAddressesRows.length}`);
    if (ethAddressesRows.length === 0 || ethAddressesResult.rows[0].eth_addresses === null) {
        // try to find eth addresses from backup table user_eth_addresses
        const localResult = await sql`SELECT eth_addresses FROM user_eth_addresses WHERE fid = ${fid}`;
        const localRows = localResult.rows;
        console.log(`Local rows: ${JSON.stringify(localRows)}`)
        if (localRows.length > 0) {
            const ethAddresses = localRows[0].eth_addresses;
            console.log(`ETH addresses found in backup table for fid ${fid}: ${ethAddresses}`);
            // print the whole row from user_scores
            let result = await sql`UPDATE user_scores SET eth_addresses = ${ethAddresses} WHERE fid = ${fid}`;
            // print the result 
            console.log(`Result of updating eth_addresses: ${JSON.stringify(result)}`);
        }
    }
}


async function fetchUsernamesForMissingPowerUsers() {
    const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS';
    const BATCH_SIZE = 99;
    let powerUsersFids = [];

    // Load powerUsersFids from the JSON file
    try {
        const data = fs.readFileSync(path.join(process.cwd(), './powerUsersFids.json'), 'utf8');
        powerUsersFids = JSON.parse(data);
    } catch (err) {
        console.error('Error loading powerUsersFids from JSON file:', err);
        return;
    }

    console.log(`Length of powerUsersFids: ${powerUsersFids.length}`);

    // Check each FID one-by-one
    let missingFids = [];
    for (const fid of powerUsersFids) {
        const fidStr = String(fid).trim();
        console.log(`Checking FID in database: ${fidStr}`);
        try {
            const result = await sql`SELECT fid FROM user_scores WHERE fid = ${fidStr}`;
            if (result.rows.length === 0) {
                console.log(`FID ${fidStr} is missing`);
                missingFids.push(fidStr);
            } else {
                console.log(`FID ${fidStr} exists in the database`);
            }
        } catch (error) {
            console.error(`Error checking FID ${fidStr} in database:`, error);
        }
    }

    if (missingFids.length === 0) {
        console.log('No missing FIDs found.');
        return;
    }

    console.log(`Missing FIDs: ${missingFids.length}`);

    // Fetch usernames for the missing FIDs
    let usernames: any = [];
    for (let i = 0; i < missingFids.length; i += BATCH_SIZE) {
        const batch = missingFids.slice(i, i + BATCH_SIZE);
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
            console.log(`Fetching usernames for FIDs batch: ${fidsParam}`);
            const response = await fetch(url, options);
            const data = await response.json();

            if (data.users) {
                const batchUsernames = data.users.map((user: any) => {
                    console.log(`Fetched username for FID ${user.fid}: ${user.username}`);
                    return user.username;
                });
                usernames = usernames.concat(batchUsernames);
            } else {
                console.error('No users in response:', data);
            }
        } catch (e) {
            console.error('Error fetching usernames:', e);
        }

        // Delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Save usernames to a file
    fs.writeFileSync('usernames.txt', usernames.join('\n'));
    console.log('Usernames saved to usernames.txt');
}


// fetchPowerUsers().then(() => {
//     console.log('Power users fetched successfully');
// });

// Call the function to fetch usernames for missing power users
// fetchUsernamesForMissingPowerUsers().then(() => {
//     console.log('Usernames fetched successfully');
// });


// fetchBuildScore().then(
//     () => console.log('Build scores updated successfully')
// );

// fetchBuildScoreForFID('282223').then(
//     (score) => console.log(`Build score: ${score}`)
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

// fetchPowerScore('453709').then(
//     (score) => console.log(`Power score: ${JSON.stringify(score)}`)
// );

export { fetchPowerUsers, syncETHAddresses, fetchPowerScore, fetchPowerScoreGame2, fetchPowerScoreGame2ForFID, fetchETHaddresses, fetchETHaddressesForFID, fetchETHaddressesForNull, fetchBuildScore, fetchBuildScoreForFID, fetchFids, fetchFidsWithNullEthAddresses};