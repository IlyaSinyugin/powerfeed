import dotenv from 'dotenv';
import path from 'path';
import powerUsersFids from './powerUsersFids.json' with { type: "json" };
// import dictionary
import { fetchPowerScore, fetchBuildScoreForFID } from "./helpers.js";
import { sql } from "@vercel/postgres";
import crypto from "crypto";


// import it outside of api folder
dotenv.config({ path: path.join(process.cwd(), './.env') });

async function generateRandomHash() {
    const randomString = crypto.randomBytes(16).toString('base64url').substring(0, 22); 
    console.log(`Random hash generated: ${randomString}`);
    return randomString;
}

// retrieve json data from redash 
async function retrieveJSON() {
    const REDASH_LINK = process.env.REDASH_REPLIES_LINK || '';

    if (!REDASH_LINK) {
        console.error('No Redash link provided.');
        return;
    }

    try {
        console.log('Fetching replies from Redash...');
        let response = await fetch(REDASH_LINK,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
        let data = await response.json();
        await filterCasts(data.query_result.data.rows);
        //await calculateAndStorePoints();
        //await insertDataIntoDatabase(data.query_result.data.rows);
    } catch (e) {
        console.error('Error fetching replies:', e);
        return;
    }
}

async function insertDataIntoDatabase(rows: any) {
    console.log('Inserting data into the database...')
    try {
        for (let row of rows) {
            await sql`
                INSERT INTO powerfeed_replies (
                    cast_fid, cast_hash, cast_timestamp, original_cast_hash, original_cast_timestamp,
                    reply_from_fid, reply_to_fid, reaction_giver_username, reply_text, cast_link
                ) VALUES (
                    ${row.cast_fid}, ${row.cast_hash}, ${row.cast_timestamp}, ${row.original_cast_hash}, 
                    ${row.original_cast_timestamp}, ${row.reply_from_fid}, ${row.reply_to_fid}, 
                    ${row.reaction_giver_username}, ${row.reply_text}, ${row.cast_link}
                )
                ON CONFLICT (cast_hash) DO NOTHING
            `;
        }
        console.log('Data successfully inserted into the database');
    } catch (error) {
        console.error('Error inserting data:', error);
    }
}

async function filterCasts(rows: any) {
    console.log('Filtering data...');

    // Retrieve the latest cast_timestamp from the powerfeed_replies_filtered table
    const latestTimestampResult = await sql`
        SELECT MAX(cast_timestamp) AS latest_timestamp FROM powerfeed_replies_filtered
    `;
    const latestTimestamp = latestTimestampResult.rows[0]?.latest_timestamp;
    console.log('Latest timestamp in database:', latestTimestamp);

    // Filter rows to only include those with a cast_timestamp greater than the latest timestamp
    const filteredRows = latestTimestamp 
        ? rows.filter((row: { cast_timestamp: string | number | Date; }) => new Date(row.cast_timestamp) > new Date(latestTimestamp))
        : rows;

    console.log('Number of new rows to process:', filteredRows.length);

    const userReplyCount: { [key: string]: { count: number, limit: number } } = {};
    const userCastReplySet: { [key: string]: Set<string> } = {};
    const initialCutoffDate = new Date('2024-06-05T16:00:00Z');
    const additionalCutoffDate = new Date('2024-06-10T18:00:00Z');

    // Adjust the dateKey calculation to start the new day at 16:00 UTC
    const getAdjustedDateKey = (date: Date) => {
        const adjustedDate = new Date(date);
        adjustedDate.setUTCHours(adjustedDate.getUTCHours() - 16);
        return adjustedDate.toISOString().split('T')[0];
    };

    // Sort rows by cast_timestamp to process them from the start of the day
    filteredRows.sort((a: any, b: any) => new Date(a.cast_timestamp).getTime() - new Date(b.cast_timestamp).getTime());

    const finalFilteredRows = [];

    for (let row of filteredRows) {
        const replyDate = new Date(row.cast_timestamp);
        const dateKey = getAdjustedDateKey(replyDate);
        
        // Determine if the reply is before or after the additionalCutoffDate time on the same day
        const isAfterCutoff = replyDate >= additionalCutoffDate && replyDate.toISOString().split('T')[0] === additionalCutoffDate.toISOString().split('T')[0];

        // Adjust userKey to include time segment
        const userKey = `${row.reply_from_fid}-${dateKey}-${isAfterCutoff ? 'after' : 'before'}`;
        const userCastKey = `${row.reply_from_fid}-${row.original_cast_hash}`;

        if (row.reply_text.includes('⚡') && row.reply_from_fid !== row.reply_to_fid) {
            if (!userReplyCount[userKey]) {
                const isPowerUser = powerUsersFids.includes(Number(row.reply_from_fid));
                let limit;

                if (replyDate >= additionalCutoffDate) {
                    limit = 3;
                } else if (replyDate >= initialCutoffDate) {
                    limit = isPowerUser ? 10 : 5;
                } else {
                    limit = 3;
                }

                userReplyCount[userKey] = { count: 0, limit: limit };
                if (row.reply_from_fid === 429107) {
                    console.log(`Initialized userReplyCount for ${userKey}:`, userReplyCount[userKey]);
                }
            }

            if (!userCastReplySet[userCastKey]) {
                userCastReplySet[userCastKey] = new Set();
            }

            if (userReplyCount[userKey].count < userReplyCount[userKey].limit && !userCastReplySet[userCastKey].has(row.cast_hash)) {
                finalFilteredRows.push(row);
                userReplyCount[userKey].count++;
                userCastReplySet[userCastKey].add(row.cast_hash);
                if (row.reply_from_fid === 429107) {
                    console.log(`Added cast ${row.cast_hash} to finalFilteredRows for user ${row.reply_from_fid}. Updated count for ${userKey}: ${userReplyCount[userKey].count}`);
                }
            } else if (row.reply_from_fid === 429107) {
                console.log(`Cast ${row.cast_hash} skipped for user ${row.reply_from_fid}: Count ${userReplyCount[userKey].count}, Limit ${userReplyCount[userKey].limit}`);
            }
        }
    }

    try {
        for (let row of finalFilteredRows) {
            await sql`
                INSERT INTO powerfeed_replies_filtered (
                    cast_fid, cast_hash, cast_timestamp, original_cast_hash, original_cast_timestamp,
                    reply_from_fid, reply_to_fid, reaction_giver_username, reply_text, cast_link
                ) VALUES (
                    ${row.cast_fid}, ${row.cast_hash}, ${row.cast_timestamp}, ${row.original_cast_hash}, 
                    ${row.original_cast_timestamp}, ${row.reply_from_fid}, ${row.reply_to_fid}, 
                    ${row.reaction_giver_username}, ${row.reply_text}, ${row.cast_link}
                )
                ON CONFLICT (cast_hash) DO NOTHING
            `;
        }
        console.log('Filtered data successfully inserted into the database');
    } catch (error) {
        console.error('Error inserting filtered data:', error);
    }
}






async function calculateAndStorePoints() {
    try {
        console.log('Retrieving all user scores...');
        // Retrieve all user scores
        const usersResult = await sql`
            SELECT * FROM user_scores
        `;
        const users: any[] = usersResult.rows; // Access rows property to get the actual data

        // Create a map to store the calculated scores and another to store user scores
        const userScoresMap: { [key: string]: number } = {};
        const userPowerScores: { [key: string]: { score: number, score_game2: number | null, builder_score: number | null } } = {};
        const reactionsSentMap: { [key: string]: number } = {};
        const reactionsReceivedMap: { [key: string]: number } = {};
        const additionalCutoffDate = new Date('2024-06-10T18:00:00Z');

        console.log('Initializing user scores...');
        // Initialize scores to 0 and store user scores
        users.forEach((user) => {
            userScoresMap[user.fid] = 0;
            userPowerScores[user.fid] = { 
                score: user.score ? Number(user.score) : (user.score_game2 ? Number(user.score_game2) : 1), 
                score_game2: user.score_game2 ? Number(user.score_game2) : 0, 
                builder_score: user.builder_score ? Number(user.builder_score) : 0 
            };
            reactionsSentMap[user.fid] = 0;
            reactionsReceivedMap[user.fid] = 0;
        });

        console.log('Retrieving all filtered reactions...');
        // Retrieve all filtered reactions
        const reactionsResult = await sql`
            SELECT * FROM powerfeed_replies_filtered
        `;
        const reactions: any[] = reactionsResult.rows; // Access rows property to get the actual data

        console.log('Processing reactions...');
        // Process each reaction and ensure users are in the user_scores table
        for (const reaction of reactions) {
            const replyFromFid = reaction.reply_from_fid;
            const replyToFid = reaction.reply_to_fid;

            // Ensure the user who left the reaction is in the user_scores table
            if (!(replyFromFid in userPowerScores)) {
                console.log(`User ${replyFromFid} not found in user_scores table. Fetching data...`);
                const userResult = await sql`
                    SELECT * FROM user_scores WHERE fid = ${replyFromFid}
                `;
                if (userResult.rows.length > 0) {
                    const user = userResult.rows[0];
                    userScoresMap[user.fid] = 0;
                    userPowerScores[user.fid] = { 
                        score: user.score ? Number(user.score) : (user.score_game2 ? Number(user.score_game2) : 1), 
                        score_game2: user.score_game2 ? Number(user.score_game2) : (user.score ? Number(user.score) : 1), 
                        builder_score: user.builder_score ? Number(user.builder_score) : 0 
                    };
                    reactionsSentMap[user.fid] = 0;
                    reactionsReceivedMap[user.fid] = 0;
                } else {
                    // Fetch the user's power score and other data
                    const { username, pfpUrl, fid, score, builder_score } = await fetchUserData(replyFromFid) as any;
                    if (username && pfpUrl && fid && !isNaN(score)) {
                        const hash = await generateRandomHash();
                        userScoresMap[fid] = 0;
                        userPowerScores[fid] = { 
                            score: score? Number(score) : 1, 
                            score_game2: score? Number(score) : 1,
                            builder_score: builder_score ? Number(builder_score) : 0 
                        };                        
                        reactionsSentMap[fid] = 0;
                        reactionsReceivedMap[fid] = 0;
                        await sql`
                            INSERT INTO user_scores (username, pfpurl, fid, score, score_game2, builder_score, hash)
                            VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${score}, ${builder_score}, ${hash})
                        `;
                        console.log(`Inserted user ${username} into user_scores table.`);
                    }
                }
            }

            // Ensure the user who received the reaction is in the user_scores table
            if (!(replyToFid in userPowerScores)) {
                console.log(`User ${replyToFid} not found in user_scores table. Fetching data...`);
                const userResult = await sql`
                    SELECT * FROM user_scores WHERE fid = ${replyToFid}
                `;
                if (userResult.rows.length > 0) {
                    const user = userResult.rows[0];
                    userScoresMap[user.fid] = 0;
                    userPowerScores[user.fid] = { 
                        score: user.score ? Number(user.score) : (user.score_game2 ? Number(user.score_game2) : 1), 
                        score_game2: user.score_game2 ? Number(user.score_game2) : (user.score ? Number(user.score) : 1), 
                        builder_score: user.builder_score ? Number(user.builder_score) : 0 
                    };                    
                    reactionsSentMap[user.fid] = 0;
                    reactionsReceivedMap[user.fid] = 0;
                } else {
                    // Fetch the user's power score and other data
                    const { username, pfpUrl, fid, score, builder_score } = await fetchUserData(replyToFid) as any;
                    if (username && pfpUrl && fid && !isNaN(score)) {
                        const hash = await generateRandomHash();
                        userScoresMap[fid] = 0;
                        userPowerScores[fid] = { 
                            score: Number(score), 
                            score_game2: score ? Number(score) : 1, 
                            builder_score: builder_score ? Number(builder_score) : 0 
                        };                        
                        reactionsSentMap[fid] = 0;
                        reactionsReceivedMap[fid] = 0;
                        await sql`
                            INSERT INTO user_scores (username, pfpurl, fid, score, score_game2, builder_score, hash)
                            VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${score}, ${builder_score}, ${hash})
                        `;
                        console.log(`Inserted user ${username} into user_scores table.`);
                    }
                }
            }

            let score;
            const powerScores = userPowerScores[replyFromFid];

            if (new Date(reaction.cast_timestamp) >= additionalCutoffDate) {
                const game2Score = powerScores.score_game2 !== null ? powerScores.score_game2 : powerScores.score;
                const builderScore = powerScores.builder_score !== null ? powerScores.builder_score : 0;
                score = Math.floor(((game2Score + builderScore) / 2) * 10); // Multiply score by 10 to handle fractional points
            } else {
                score = Math.floor((powerScores.score / 2) * 10); // Multiply score by 10 to handle fractional points
            }

            // Check if powerScore is a valid number
            if (!isNaN(score)) {
                // Add score to the user who left the reaction
                if (userScoresMap[replyFromFid] !== undefined) {
                    userScoresMap[replyFromFid] += score;
                    reactionsSentMap[replyFromFid] += 1;
                }

                // Add score to the user who received the reaction
                if (userScoresMap[replyToFid] !== undefined) {
                    userScoresMap[replyToFid] += score;
                    reactionsReceivedMap[replyToFid] += 1;
                }
            }
        }

        console.log('Inserting calculated points into user_points table...');
        // Insert calculated points into user_points table
        for (const fid in userScoresMap) {
            const points = userScoresMap[fid];
            const reactionsSent = reactionsSentMap[fid];
            const reactionsReceived = reactionsReceivedMap[fid];
            // Ensure points is a valid integer
            if (typeof points === 'number' && !isNaN(points)) {
                // Fetch username and pfpurl from user_scores
                const userResult = await sql`
                    SELECT username, pfpurl FROM user_scores WHERE fid = ${fid}
                `;
                if (userResult.rows.length > 0) {
                    const { username, pfpurl } = userResult.rows[0];

                    // Check if the user already has points in the user_points table
                    const existingPointsResult = await sql`
                        SELECT points, reactions_sent, reactions_received, hash FROM user_points WHERE fid = ${fid}
                    `;
                    if (existingPointsResult.rows.length > 0) {
                        const existingPoints = existingPointsResult.rows[0].points;
                        if (existingPoints !== points && points > 0) {
                            const hash = await generateRandomHash();
                            // Update points and hash if they differ
                            await sql`
                                UPDATE user_points
                                SET points = ${points}, username = ${username}, pfpurl = ${pfpurl}, reactions_sent = ${reactionsSent}, reactions_received = ${reactionsReceived}, hash = ${hash}
                                WHERE fid = ${fid}
                            `;
                            console.log(`Updated points for user ${username} in user_points table.`);
                        }
                    } else {
                        const hash = await generateRandomHash();
                        // Insert new record
                        await sql`
                            INSERT INTO user_points (fid, points, username, pfpurl, reactions_sent, reactions_received, hash)
                            VALUES (${fid}, ${points}, ${username}, ${pfpurl}, ${reactionsSent}, ${reactionsReceived}, ${hash})
                        `;
                        console.log(`Inserted new record for user ${username} in user_points table.`);
                    }
                }
            }
        }

        console.log('Updating rankings...');
        // Update rankings
        await sql`
            WITH ranked_users AS (
                SELECT 
                    id,
                    points,
                    RANK() OVER (ORDER BY points DESC) AS rank
                FROM user_points
            )
            UPDATE user_points
            SET rank = ranked_users.rank
            FROM ranked_users
            WHERE user_points.id = ranked_users.id;
        `;

        console.log('User points and rankings successfully calculated and stored');
    } catch (error) {
        console.error('Error calculating and storing points:', error);
    }
}



// Helper function to fetch user data
async function fetchUserData(fid: number) {
    let username = '';
    let pfpUrl = '';

    const options = {
      method: 'GET',
      headers: {accept: 'application/json', api_key: process.env.NEYNAR_API_KEY || 'NEYNAR_API_DOCS'},
    };

    try { 
        console.log(`Fetching user data for FID: ${fid}...`);
        const response = await fetch (`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, options);
        const data = await response.json();
        const userData = data.users[0];
        username = userData.username;
        pfpUrl = userData.pfp_url;
        console.log(`Successfully fetched user data for FID: ${fid}, username: ${username}, pfpUrl: ${pfpUrl}`);
        // now fetch the score 
        let score = await fetchPowerScore(fid.toString());
        score = score ? score : 1;
        let builder_score = await fetchBuildScoreForFID(fid.toString());
        builder_score = builder_score ? builder_score : 0;
        return { username, pfpUrl, fid, score, builder_score };
    } catch (error) {
        console.error(`Error fetching user data for FID: ${fid}`, error);
    }
}



// execute the functions above 
retrieveJSON().then(() => {
    console.log('Script completed');
});

// calculateAndStorePoints().then(() => {
//     console.log('Script completed');
// });