import { Button, Frog } from "frog";
import { devtools } from "frog/dev";
import { sql } from "@vercel/postgres";
import { serveStatic } from "frog/serve-static";
import { neynar, type NeynarVariables } from "frog/middlewares";
// import { neynar } from 'frog/hubs'
import { handle } from "frog/vercel";
import crypto from "crypto";
import {
  fetchPowerScore,
  fetchPowerScoreGame2ForFID,
  fetchBuildScoreForFID,
  syncETHAddresses,
} from "./helpers.js";
import {
  Row,
  Rows,
  Text,
  vars,
  Box,
  VStack,
  HStack,
  Image,
  Divider,
  Spacer,
} from "./ui.js";

// define a dictionary which will store the fid and score
let fidScore: { [key: string]: number } = {};

// Uncomment to use Edge Runtime.
// export const config = {
//   runtime: 'edge',
// }

export const app = new Frog({
  assetsPath: "/",
  basePath: "/api",
  ui: { vars },
  headers: { "Cache-Control": "max-age=3200" },
  imageOptions: {
    fonts: [
      {
        //name: 'EB Garamond',
        name: "JetBrains Mono",
        source: "google",
      },
    ],
    format: "png",
    //headers: { "Cache-Control": "max-age=3200" },
  },
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' })
});

const neynarMiddleware = neynar({
  apiKey: "NEYNAR_FROG_FM",
  features: ["interactor", "cast"],
});

// function to generate a random hash string so that it's unlikely to collide with other generated hashes
async function generateRandomHash() {
  const randomString = crypto
    .randomBytes(16)
    .toString("base64url")
    .substring(0, 22);
  console.log(`Random hash generated: ${randomString}`);
  return randomString;
}

app.frame("/", neynarMiddleware, async (c) => {
  const randomHash = await generateRandomHash();
  console.log(`Random hash generated: ${randomHash}`);
  return c.res({
    action: `/score/${randomHash}`,
    image: (
      //<Image src="https://i.imgur.com/TMelNB7.png" />
      <Image src="https://i.imgur.com/c6rBJMX.png" />
    ),
    title: "Powerfeed",
    intents: [<Button value="checkScore">Check your Power Score</Button>],
  });
});

app.frame("/score/:id", neynarMiddleware, async (c) => {
  let username, pfpUrl, fid: any, score, buildScore;
  let hash = c.req.param("id");
  // check if hash exists in the db
  // game 1 settings
  // const existingData = await sql`
  //   SELECT username, pfpurl, fid, score
  //   FROM user_scores
  //   WHERE hash = ${hash}
  // `;

  // game 2 settings
  const existingData = await sql`
    SELECT username, pfpurl, fid, score, score_game2, builder_score
    FROM user_scores
    WHERE hash = ${hash}
  `;

  // if c.var.interactor.fid exists and if existingData is not empty
  if (c.var.interactor?.fid && existingData.rows.length > 0) {
    if (c.var.interactor.fid === existingData.rows[0].fid) {
      console.log(
        "Hash exists in the database and interactor fid is equal to the fid from the database"
      );
      hash = await generateRandomHash();
      // update the hash in the database
      await sql`
        UPDATE user_scores
        SET hash = ${hash}
        WHERE fid = ${fid}
      `;
    } else {
      console.log(
        "Hash exists in the database but interactor fid is not equal to the fid from the database"
      );
      ({ username, pfpUrl, fid } = c.var.interactor || {});
      console.log(`INTERACTOR DATA Username: ${username}, FID: ${fid}`);
      // check if that fid is already in the table
      // game 1 settings
      // const existingFid = await sql`
      //   SELECT username, pfpurl, fid, score, hash
      //   FROM user_scores
      //   WHERE fid = ${fid}
      // `;

      // game 2 settings
      const existingFid = await sql`
        SELECT username, pfpurl, fid, score, score_game2, builder_score, hash
        FROM user_scores
        WHERE fid = ${fid}
      `;
      if (existingFid.rows.length > 0) {
        console.log(`The fid ${fid} is already in the table`);
        // set score
        //score = existingFid.rows[0].score;
        score = existingFid.rows[0].score_game2;
        if (existingFid.rows[0].builder_score !== null) {
          buildScore = existingFid.rows[0].builder_score;
          console.log(
            `Build score is not null for fid ${fid}, buildScore: ${buildScore}`
          );
        } else {
          console.log(`Build score is null for fid ${fid}`);
          // fetching build score for this fid
          buildScore = await fetchBuildScoreForFID(fid);
          console.log(`Build score fetched for fid ${fid} is ${buildScore}`);
        }
        if (existingFid.rows[0].score_game2 === null) {
          console.log(`Score game 2 is null for fid ${fid}`);
          // fetch score for this fid
          try {
            score = await fetchPowerScore(fid);
          } catch (e) {
            console.log(`Hardcoding old score for fid ${fid}`);
            score = existingFid.rows[0].score;
          }
          if (score < 0 || score === 0) {
            score = 1;
          }
        }
        hash = await generateRandomHash();
        buildScore = buildScore.toString();
        // update the hash in the database
        await sql`
          UPDATE user_scores
          SET hash = ${hash}
          WHERE fid = ${fid}
        `;

        const hashPointsData = await sql`
          SELECT hash
          FROM user_points
          WHERE fid = ${fid}
        `;
        let hashPoints;
        if (hashPointsData.rows.length > 0) {
          console.log(
            `Hash points for fid ${fid} exists, hashPointsData: ${hashPointsData.rows[0].hash}`
          );
          hashPoints = hashPointsData.rows[0].hash;
        } else {
          hashPoints = await generateRandomHash();
        }
        console.log(
          `Existing data & generated hash: username: ${username}, pfpUrl: ${pfpUrl}, fid: ${fid}, score: ${score}, buildScore: ${buildScore}, hash: ${hash}`
        );
        const shareUrl = `https://warpcast.com/~/compose?text=Check%20your%20Farcaster%20Power%20and%20/build%20in%20public%20in%20a%20new%20/powerfeed%20game!👷‍♀️👷&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;

        await syncETHAddresses(fid);

        return c.res({
          image: (
            <Rows gap="1" grow>
              <Image src="/powergame2title.png" />
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/5"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
                grow
              >
                <HStack
                  gap="18"
                  alignHorizontal="center"
                  alignVertical="center"
                >
                  <img
                    //src="https://i.imgur.com/WImxm1D.jpeg"
                    src={pfpUrl}
                    width="128"
                    height="128"
                    style={{
                      borderRadius: "0%",
                      border: "3.5px solid #B1FC5A",
                    }}
                  />
                  <VStack gap="1">
                    <Text color="white" size="18" weight="800" wrap="balance">
                      {username}
                    </Text>
                    <Text color="green" size="18" weight="800">
                      got the power!
                    </Text>
                  </VStack>
                  <Spacer size="72" />
                  <Box
                    fontSize="18"
                    alignContent="center"
                    alignVertical="center"
                    paddingBottom="14"
                    flexWrap="nowrap"
                    display="flex"
                  >
                    <Text color="white" size="18" wrap="balance">
                      ⚡️Power score: {score}
                    </Text>
                    <Text color="white" size="18">
                      🛠️Builder score: {buildScore}
                    </Text>
                    <Text color="white" size="18">
                      💰points per⚡️:{" "}
                      {((Number(score) + Number(buildScore)) * 10).toString()}
                    </Text>
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
              <Image src="/powergame2bottom.png" />
            </Rows>
          ),
          intents: [
            <Button.Link href={shareUrl}>Share</Button.Link>,
            <Button action={`/`} value="checkScore">
              Refresh
            </Button>,
            <Button action={`/stats/${hashPoints}`} value="checkStats">
              Stats
            </Button>,
            <Button action="/gamerules" value="joinGame">
              Rules
            </Button>,
          ],
        });
      } else {
        console.log(`The fid ${fid} is not in the table`);
        let scoreData: any;
        let hash = await generateRandomHash();
        const fetchScore = async () => {
          //scoreData = await fetchPowerScore(fid?.toString());
          score = await fetchPowerScore(fid?.toString());
          // fetch buildScore too
          buildScore = await fetchBuildScoreForFID(fid);
          await syncETHAddresses(fid);
        };
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000)
        );
        try {
          await Promise.race([fetchScore(), timeoutPromise]);
        } catch (e) {
          return c.res({
            action: `/score/${hash}`,
            image: <Image src="https://i.imgur.com/c6rBJMX.png" />,
            intents: [
              <Button value="checkScore">Check your Power Score</Button>,
            ],
          });
        }
        //score = scoreData?.data.rows[0]?.power_score || 1;
        score = score ? score : 1;
        buildScore = buildScore ? buildScore : 0;
        if (score < 0 || score === 0) {
          score = 1;
        }
        // Insert the new data into the database
        //   await sql`
        //   INSERT INTO user_scores (username, pfpurl, fid, score, hash)
        //   VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${hash})
        // `;
        await sql`
        INSERT INTO user_scores (username, pfpurl, fid, score_game2, builder_score, hash)
        VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${buildScore}, ${hash})
      `;
        console.log(
          `Inserted new data, such as username: ${username}, pfpUrl: ${pfpUrl}, fid: ${fid}, score_game2: ${score}, buildScore: ${buildScore}, hash: ${hash}`
        );
        await syncETHAddresses(fid);

        const hashPointsData = await sql`
        SELECT hash
        FROM user_points
        WHERE fid = ${fid}
      `;
        let hashPoints;
        if (hashPointsData.rows.length > 0) {
          console.log(
            `Hash points for fid ${fid} exists, hashPointsData: ${hashPointsData.rows[0].hash}`
          );
          hashPoints = hashPointsData.rows[0].hash;
        } else {
          hashPoints = await generateRandomHash();
        }

        const shareUrl = `https://warpcast.com/~/compose?text=Check%20your%20Farcaster%20Power%20and%20/build%20in%20public%20in%20a%20new%20/powerfeed%20game!👷‍♀️👷&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;

        return c.res({
          image: (
            <Rows gap="1" grow>
              <Image src="/powergame2title.png" />
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/5"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
                grow
              >
                <HStack
                  gap="18"
                  alignHorizontal="center"
                  alignVertical="center"
                >
                  <img
                    //src="https://i.imgur.com/WImxm1D.jpeg"
                    src={pfpUrl}
                    width="128"
                    height="128"
                    style={{
                      borderRadius: "0%",
                      border: "3.5px solid #B1FC5A",
                    }}
                  />
                  <VStack gap="1">
                    <Text color="white" size="18" weight="800" wrap="balance">
                      {username}
                    </Text>
                    <Text color="green" size="18" weight="800">
                      got the power!
                    </Text>
                  </VStack>
                  <Spacer size="72" />
                  <Box
                    fontSize="18"
                    alignContent="center"
                    alignVertical="center"
                    paddingBottom="14"
                    flexWrap="nowrap"
                    display="flex"
                  >
                    <Text color="white" size="18" wrap="balance">
                      ⚡️Power score: {score}
                    </Text>
                    <Text color="white" size="18">
                      🛠️Builder score: {buildScore.toString()}
                    </Text>
                    <Text color="white" size="18">
                      💰points per⚡️:{" "}
                      {((Number(score) + Number(buildScore)) * 10).toString()}
                    </Text>
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
              <Image src="/powergame2bottom.png" />
            </Rows>
          ),
          intents: [
            <Button.Link href={shareUrl}>Share</Button.Link>,
            <Button action={`/`} value="checkScore">
              Refresh
            </Button>,
            <Button action={`/stats/${hashPoints}`} value="checkStats">
              Stats
            </Button>,
            <Button action="/gamerules" value="joinGame">
              Rules
            </Button>,
          ],
        });
      }
    }
  }

  console.log(
    `Database lookup (user_scores) for hash ${hash} returned ${
      existingData.rows.length
    } rows and interactor ${JSON.stringify(c.var.interactor)}`
  );

  if (existingData.rows.length > 0) {
    // If the hash exists, retrieve the data
    ({
      username,
      pfpurl: pfpUrl,
      fid,
      score_game2: score,
      builder_score: buildScore,
    } = existingData.rows[0]);
    console.log(
      `Hash already exists with username ${username} and score ${score}`
    );
  } else {
    // If the hash does not exist, fetch the data from the external source
    ({ username, pfpUrl, fid } = c.var.interactor || {});
    console.log(`Hash doesn't exist with username ${username} and fid ${fid}`);
    // check if that fid is already in the table
    const existingFid = await sql`
      SELECT username, pfpurl, fid, score, score_game2, builder_score, hash
      FROM user_scores
      WHERE fid = ${fid}
    `;
    if (existingFid.rows.length > 0) {
      console.log(`The fid ${fid} is already in the table`);
      // set score
      if (existingFid.rows[0].score_game2 === null) {
        // fetch score for this fid
        console.log(`Score game 2 is null for fid ${fid}`);
        // fetch score for this fid
        try {
          score = await fetchPowerScore(fid);
          if (score === null) {
            console.log(
              `Hardcoding old score for fid ${fid}, the old score is ${existingFid.rows[0].score}`
            );
            score = existingFid.rows[0].score;
          }
        } catch (e) {
          console.log(`Hardcoding old score for fid ${fid}`);
          score = existingFid.rows[0].score;
        }
        if (score < 0 || score === 0) {
          score = 1;
        }

        if (score < 0 || score === 0) {
          score = 1;
        }
      } else {
        score = existingFid.rows[0].score_game2;
      }
      buildScore = existingFid.rows[0].builder_score;
      // regenerate hash to a new one
      hash = await generateRandomHash();
      // update the hash in the database
      await sql`
        UPDATE user_scores
        SET hash = ${hash}
        WHERE fid = ${fid}
      `;
      //hash = existingFid.rows[0].hash;
    } else {
      let scoreData: any;
      const fetchScore = async () => {
        score = await fetchPowerScore(fid?.toString());
        buildScore = await fetchBuildScoreForFID(fid);
      };
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 3000)
      );
      try {
        await Promise.race([fetchScore(), timeoutPromise]);
      } catch (e) {
        return c.res({
          action: `/score/${hash}`,
          image: <Image src="https://i.imgur.com/c6rBJMX.png" />,
          intents: [<Button value="checkScore">Check your Power Score</Button>],
        });
      }
      score = score ? score : 1;
      if (score < 0 || score === 0) {
        score = 1;
      }
      // Insert the new data into the database
      await sql`
        INSERT INTO user_scores (username, pfpurl, fid, score_game2, builder_score, hash)
        VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${buildScore}, ${hash})
    `;
      await syncETHAddresses(fid);
    }
  }
  const shareUrl = `https://warpcast.com/~/compose?text=Check%20your%20Farcaster%20Power%20and%20/build%20in%20public%20in%20a%20new%20/powerfeed%20game!👷‍♀️👷&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;

  console.log(
    `Username: ${username}, FID: ${fid}, Score: ${score}, Build Score: ${buildScore} `
  );

  const hashPointsData = await sql`
  SELECT hash
  FROM user_points
  WHERE fid = ${fid}
`;
  let hashPoints;
  if (hashPointsData.rows.length > 0) {
    console.log(
      `Hash points for fid ${fid} exists, hashPointsData: ${hashPointsData.rows[0].hash}`
    );
    hashPoints = hashPointsData.rows[0].hash;
  } else {
    hashPoints = await generateRandomHash();
  }
  return c.res({
    image: (
      <Rows gap="1" grow>
        <Image src="/powergame2title.png" />
        <Divider color="green" />
        <Row
          backgroundColor="background"
          height="3/5"
          alignHorizontal="left"
          alignVertical="center"
          padding="16"
          grow
        >
          <HStack gap="18" alignHorizontal="center" alignVertical="center">
            <img
              //src="https://i.imgur.com/WImxm1D.jpeg"
              src={pfpUrl}
              width="128"
              height="128"
              style={{
                borderRadius: "0%",
                border: "3.5px solid #B1FC5A",
              }}
            />
            <VStack gap="1">
              <Text color="white" size="18" weight="800" wrap="balance">
                {username}
              </Text>
              <Text color="green" size="18" weight="800">
                got the power!
              </Text>
            </VStack>
            <Spacer size="72" />
            <Box
              fontSize="18"
              alignContent="center"
              alignVertical="center"
              paddingBottom="14"
              flexWrap="nowrap"
              display="flex"
            >
              <Text color="white" size="18" wrap="balance">
                ⚡️Power score: {score}
              </Text>
              <Text color="white" size="18">
                🛠️Builder score: {buildScore.toString()}
              </Text>
              <Text color="white" size="18">
                💰points per⚡️:{" "}
                {((Number(score) + Number(buildScore)) * 10).toString()}
              </Text>
            </Box>
          </HStack>
        </Row>
        <Divider color="green" />
        <Image src="/powergame2bottom.png" />
      </Rows>
    ),
    intents: [
      <Button.Link href={shareUrl}>Share</Button.Link>,
      <Button action={`/`} value="checkScore">
        Refresh
      </Button>,
      <Button action={`/stats/${hashPoints}`} value="checkStats">
        Stats
      </Button>,
      <Button action="/gamerules" value="joinGame">
        Rules
      </Button>,
    ],
  });
});

app.frame("/gamerules", neynarMiddleware, async (c) => {
  // get the fid, username of the interactor
  const { fid, username } = c.var.interactor || {};

  // get the hash of the interactor from the db
  const hashData = await sql`
    SELECT hash
    FROM user_points
    WHERE fid = ${fid}
  `;
  let hash;

  const hashScoreData = await sql`
    SELECT hash
    FROM user_scores
    WHERE fid = ${fid}
  `;
  let hashScore;

  let randomHash = await generateRandomHash();

  if (hashData.rows.length > 0 && hashScoreData.rows.length > 0) {
    // there exists a point number for the user
    hash = hashData.rows[0].hash;
    hashScore = hashScoreData.rows[0].hash;
    return c.res({
      //action: `/stats/${hash}`,
      action: "/gamerules",
      // game 1 rules
      //image: "https://i.imgur.com/hxX85GY.png",
      // game 2 rules
      image: "https://i.imgur.com/UMwnEuG.png",
      //imageAspectRatio: "1.91:1",
      intents: [
        // <Button.Link href="https://warpcast.com/~/channel/powerfeed">
        //   /powerfeed
        // </Button.Link>,
        // <Button value="score" action={`/score/${hashScore}`}>
        //   Score
        // </Button>,
        // <Button action={`/stats/${hash}`}>Stats</Button>,
        <Button value="rules" action="/">
          Back
        </Button>,
      ],
    });
  } else {
    return c.res({
      action: "/gamerules",
      image: "https://i.imgur.com/UMwnEuG.png",
      //imageAspectRatio: "1.91:1",
      intents: [
        // <Button.Link href="https://warpcast.com/~/channel/powerfeed">
        //   /powerfeed
        // </Button.Link>,
        // <Button value="score" action={`/score/${hashScore}`}>
        //   Score
        // </Button>,
        // <Button value="points" action={`/stats/${randomHash}`}>
        //   Stats
        // </Button>,
        <Button value="rules" action="/">
          Back
        </Button>,
      ],
    });
  }
});

// new frame called soon with image - https://i.imgur.com/wDggw1i.png and button Back that takes back to /score
app.frame("/soon", neynarMiddleware, async (c) => {
  // get the fid, username of the interactor
  const { fid, username } = c.var.interactor || {};

  // get the hash of the interactor from the db
  const hashData = await sql`
    SELECT hash
    FROM user_scores
    WHERE fid = ${fid}
  `;
  let hash;

  if (hashData.rows.length > 0) {
    hash = hashData.rows[0].hash;
    return c.res({
      action: "/soon",
      image: "https://i.imgur.com/wDggw1i.png",
      //imageAspectRatio: "1.91:1",
      intents: [
        <Button value="backbutton" action={`/score/${hash}`}>
          Back
        </Button>,
      ],
    });
  } else {
    return c.res({
      action: "/soon",
      image: "https://i.imgur.com/wDggw1i.png",
      //imageAspectRatio: "1.91:1",
      intents: [
        <Button value="backbutton" action="/">
          Back
        </Button>,
      ],
    });
  }
});

app.frame("/rules", neynarMiddleware, async (c) => {
  // get the fid, username of the interactor
  return c.res({
    action: "/soon",
    image: "https://i.imgur.com/UMwnEuG.png",
    //imageAspectRatio: "1.91:1",
    intents: [
      <Button value="backbutton" action={`/gamerules`}>
        Play
      </Button>,
    ],
  });
});

// new frame called stats with id
app.frame("/stats/:id", neynarMiddleware, async (c) => {
  let username,
    pfpUrl,
    fid: any,
    score,
    points,
    reactionsSent,
    reactionsReceived,
    rank;
  let hash = c.req.param("id");

  console.log(`Hash is ${hash}`);

  // based on this hash get all of the values from the db table user_points
  const pointsData = await sql`
    SELECT fid, points, username, pfpurl, reactions_sent, reactions_received, rank, hash
    FROM user_points
    WHERE hash = ${hash}
  `;

  console.log(`check`);

  // get the total count of the rows in user_points to set lastRank
  const totalRows = await sql`
    SELECT COUNT(*)
    FROM user_points
  `;
  let lastRank = totalRows.rows[0].count;

  if (c.var.interactor?.fid && pointsData.rows.length > 0) {
    hash = pointsData?.rows[0].hash;
    if (c.var.interactor.fid === pointsData.rows[0].fid) {
      console.log(
        "Hash exists in the database and interactor fid is equal to the fid from the database"
      );
    } else {
      // TODO: finish this case
      console.log(
        "Hash exists in the database but interactor fid is NOT equal to the fid from the database"
      );
      ({ username, pfpUrl, fid } = c.var.interactor || {});
      console.log(`INTERACTOR DATA Username: ${username}, FID: ${fid}`);
      // check if that fid is already in the table
      const existingFid = await sql`
        SELECT fid, points, username, pfpurl, reactions_sent, reactions_received, rank, hash
        FROM user_points
        WHERE fid = ${fid}
      `;
      if (existingFid.rows.length > 0) {
        console.log(`Existing row is ${JSON.stringify(existingFid.rows[0])}`);
        // set all the variable equal to the existing ones
        points = existingFid.rows[0].points.toString();
        reactionsSent = existingFid.rows[0].reactions_sent.toString();
        reactionsReceived = existingFid.rows[0].reactions_received.toString();
        rank = existingFid.rows[0].rank.toString();
        hash = existingFid.rows[0].hash;
        console.log(
          `Existing data: username: ${username}, pfpUrl: ${pfpUrl}, fid: ${fid}, points: ${points}, hash: ${hash}`
        );
        const shareUrl = `https://warpcast.com/~/compose?text=Check%20out%20my%20%2Fpowerfeed%20stats%20and%20join%20the%20game%20%E2%80%94%20to%20give%20and%20earn%20%24power%20to%20quality%20content%20on%20Farcaster!%E2%9A%A1%EF%B8%8F&embeds%5B%5D=https://powerfeed.vercel.app/api/stats/${hash}`;
        return c.res({
          image: (
            <Rows gap="1" grow>
              <Image src="/pgstats.png" />
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/5"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
                grow
              >
                <HStack
                  gap="18"
                  alignHorizontal="center"
                  alignVertical="center"
                >
                  <img
                    src={pfpUrl}
                    width="128"
                    height="128"
                    style={{
                      borderRadius: "0%",
                      border: "3.5px solid #B1FC5A",
                    }}
                  />
                  <VStack gap="1">
                    <Text color="white" size="18" weight="800" wrap="balance">
                      {username}
                    </Text>
                    <Text color="green" size="18" weight="800">
                      got the power!
                    </Text>
                  </VStack>
                  <Spacer size="72" />
                  <Box
                    alignContent="center"
                    alignVertical="center"
                    paddingBottom="14"
                    flexWrap="nowrap"
                    display="flex"
                  >
                    <Text color="white" size="18" wrap="balance">
                      ⚡️sent/received: {reactionsSent}/{reactionsReceived}
                    </Text>
                    <Text color="white" size="18">
                      💰points earned: {points}
                    </Text>
                    <Text color="white" size="18">
                      🏆power rank: {rank}
                    </Text>
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
              <Image src="/pgrules.png" />
            </Rows>
          ),
          intents: [
            <Button.Link href={shareUrl}>Share</Button.Link>,
            <Button value="checkScore">Refresh</Button>,
            <Button action="/gamerules" value="joinGame">
              Rules
            </Button>,
          ],
        });
      } else {
        // TODO: finish this edge case
        console.log(`The fid ${fid} is not in the table`);
        // set sent, received, points, rank to 0
        reactionsSent = "0";
        reactionsReceived = "0";
        points = "0";
        rank = lastRank.toString();
        // don't put share button here
        return c.res({
          image: (
            <Rows gap="1" grow>
              <Image src="/pgstats.png" />
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/5"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
                grow
              >
                <HStack
                  gap="18"
                  alignHorizontal="center"
                  alignVertical="center"
                >
                  <img
                    src={pfpUrl}
                    width="128"
                    height="128"
                    style={{
                      borderRadius: "0%",
                      border: "3.5px solid #B1FC5A",
                    }}
                  />
                  <VStack gap="1">
                    <Text color="white" size="18" weight="800" wrap="balance">
                      {username}
                    </Text>
                    <Text color="green" size="18" weight="800">
                      got the power!
                    </Text>
                  </VStack>
                  <Spacer size="72" />
                  <Box
                    alignContent="center"
                    alignVertical="center"
                    paddingBottom="14"
                    flexWrap="nowrap"
                    display="flex"
                  >
                    <Text color="white" size="18" wrap="balance">
                      ⚡️sent/received: {reactionsSent}/{reactionsReceived}
                    </Text>
                    <Text color="white" size="18">
                      💰points earned: {points}
                    </Text>
                    <Text color="white" size="18">
                      🏆power rank: {rank}
                    </Text>
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
              <Image src="/pgrules.png" />
            </Rows>
          ),
          intents: [
            <Button value="checkScore">Refresh</Button>,
            <Button action="/gamerules" value="joinGame">
              Rules
            </Button>,
          ],
        });
      }
    }
  }

  console.log(
    `Database lookup (user_points) for hash ${hash} returned ${
      pointsData.rows.length
    } rows and interactor ${JSON.stringify(c.var.interactor)}`
  );

  if (pointsData.rows.length > 0) {
    // If the hash exists, retrieve the data
    console.log(`The values are ${JSON.stringify(pointsData.rows[0])}`);
    ({
      username,
      pfpurl: pfpUrl,
      fid,
      points,
      reactions_sent: reactionsSent,
      reactions_received: reactionsReceived,
      rank,
    } = pointsData.rows[0]);
    console.log(
      `The values are ${username}, ${pfpUrl}, ${fid}, ${points}, ${reactionsSent}, ${reactionsReceived}, ${rank}`
    );
    console.log(
      `Hash already exists with username ${username} and points ${points}`
    );
  } else {
    // no data in the db for this user yet, can't check score TODO: do some kind of fallback for now
    ({ username, pfpUrl, fid } = c.var.interactor || {});
    console.log(
      `Hash doesn't exist with username ${username} and fid ${fid}. Attempting to fetch based on fid.`
    );

    if (c.var.interactor !== undefined) {
      // attempt to fetch the data based on fid instead
      const existingFid = await sql`
        SELECT fid, points, username, pfpurl, reactions_sent, reactions_received, rank, hash
        FROM user_points
        WHERE fid = ${fid}
      `;

      console.log(
        `Data fetched based on fid is ${JSON.stringify(existingFid.rows)}`
      );

      // set sent, received, points, rank to 0
      reactionsSent = existingFid.rows[0]?.reactions_sent.toString() || "0";
      reactionsReceived =
        existingFid.rows[0]?.reactions_received.toString() || "0";
      points = existingFid.rows[0]?.points.toString() || "0";
      rank = existingFid.rows[0]?.rank.toString() || lastRank.toString();
      if (existingFid.rows.length > 0) {
        hash = existingFid.rows[0].hash;
      }
    } else {
      // set sent, received, points, rank to 0
      reactionsSent = "0";
      reactionsReceived = "0";
      points = "0";
      rank = lastRank.toString();
    }
    const shareUrl = `https://warpcast.com/~/compose?text=Check%20out%20my%20%2Fpowerfeed%20stats%20and%20join%20the%20game%20%E2%80%94%20to%20give%20and%20earn%20%24power%20to%20quality%20content%20on%20Farcaster!%E2%9A%A1%EF%B8%8F&embeds%5B%5D=https://powerfeed.vercel.app/api/stats/${hash}`;

    // don't put share button here
    return c.res({
      image: (
        <Rows gap="1" grow>
          <Image src="/pgstats.png" />
          <Divider color="green" />
          <Row
            backgroundColor="background"
            height="3/5"
            alignHorizontal="left"
            alignVertical="center"
            padding="16"
            grow
          >
            <HStack gap="18" alignHorizontal="center" alignVertical="center">
              <img
                src={pfpUrl}
                width="128"
                height="128"
                style={{
                  borderRadius: "0%",
                  border: "3.5px solid #B1FC5A",
                }}
              />
              <VStack gap="1">
                <Text color="white" size="18" weight="800" wrap="balance">
                  {username}
                </Text>
                <Text color="green" size="18" weight="800">
                  got the power!
                </Text>
              </VStack>
              <Spacer size="72" />
              <Box
                alignContent="center"
                alignVertical="center"
                paddingBottom="14"
                flexWrap="nowrap"
                display="flex"
              >
                <Text color="white" size="18" wrap="balance">
                  ⚡️sent/received: {reactionsSent}/{reactionsReceived}
                </Text>
                <Text color="white" size="18">
                  💰points earned: {points}
                </Text>
                <Text color="white" size="18">
                  🏆power rank: {rank}
                </Text>
              </Box>
            </HStack>
          </Row>
          <Divider color="green" />
          <Image src="/pgrules.png" />
        </Rows>
      ),
      intents: [
        <Button.Link href={shareUrl}>Share</Button.Link>,
        <Button value="checkScore">Refresh</Button>,
        <Button action="/gamerules" value="joinGame">
          Rules
        </Button>,
      ],
    });
  }

  // TODO: change shareurl
  const shareUrl = `https://warpcast.com/~/compose?text=Check%20out%20my%20%2Fpowerfeed%20stats%20and%20join%20the%20game%20%E2%80%94%20to%20give%20and%20earn%20%24power%20to%20quality%20content%20on%20Farcaster!%E2%9A%A1%EF%B8%8F&embeds%5B%5D=https://powerfeed.vercel.app/api/stats/${hash}`;
  console.log(`Share url is ${shareUrl}`);

  reactionsSent = reactionsSent?.toString() || "0";
  reactionsReceived = reactionsReceived?.toString() || "0";
  points = points?.toString() || "0";
  rank = rank?.toString() || lastRank.toString();
  console.log(`Username: ${username}, FID: ${fid}, Points: ${points}`);

  let scoreData = await sql`
    SELECT score
    FROM user_scores
    WHERE fid = ${fid}`;
  let hashScore = scoreData.rows[0].hash;

  return c.res({
    image: (
      <Rows gap="1" grow>
        <Image src="/pgstats.png" />
        <Divider color="green" />
        <Row
          backgroundColor="background"
          height="3/5"
          alignHorizontal="left"
          alignVertical="center"
          padding="16"
          grow
        >
          <HStack gap="18" alignHorizontal="center" alignVertical="center">
            <img
              src={pfpUrl}
              width="128"
              height="128"
              style={{
                borderRadius: "0%",
                border: "3.5px solid #B1FC5A",
              }}
            />
            <VStack gap="1">
              <Text color="white" size="18" weight="800" wrap="balance">
                {username}
              </Text>
              <Text color="green" size="18" weight="800">
                got the power!
              </Text>
            </VStack>
            <Spacer size="72" />
            <Box
              alignContent="center"
              alignVertical="center"
              paddingBottom="14"
              flexWrap="nowrap"
              display="flex"
            >
              <Text color="white" size="18" wrap="balance">
                ⚡️sent/received: {reactionsSent}/{reactionsReceived}
              </Text>
              <Text color="white" size="18">
                💰points earned: {points}
              </Text>
              <Text color="white" size="18">
                🏆power rank: {rank}
              </Text>
            </Box>
          </HStack>
        </Row>
        <Divider color="green" />
        <Image src="/pgrules.png" />
      </Rows>
    ),
    intents: [
      <Button.Link href={shareUrl}>Share</Button.Link>,
      <Button value="checkScore">Refresh</Button>,
      <Button action="/gamerules" value="joinGame">
        Rules
      </Button>,
    ],
  });
});

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
//devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
// export dictionary
export { fidScore };
