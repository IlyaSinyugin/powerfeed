// fetch all powerusers from Neynar 
async function fetchPowerUsers() {
    const NEYNAR_API_KEY = 'NEYNAR_API_DOCS';
    let powerUsers = [];
    let powerUsersFids = [];
    let nextCursor = '';
    let hasMore = true;

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

export { fetchPowerUsers };