import { Button, Frog } from "frog";
import { devtools } from "frog/dev";
import { sql } from "@vercel/postgres";
import { serveStatic } from "frog/serve-static";
import { neynar, type NeynarVariables } from "frog/middlewares";
// import { neynar } from 'frog/hubs'
import { handle } from "frog/vercel";
import crypto from "crypto";
import { fetchPowerScore } from "./helpers.js";
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
    format: 'png',
    headers: { "Cache-Control": "max-age=3200" },
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
      <Box
        grow
        alignHorizontal="left"
        backgroundColor="background"
        padding="34"
      >
        <HStack gap="22">
          <VStack gap="4">
            <Text color="white" size="24" decoration="solid" weight="800">
              Engagement is nice, but
            </Text>
            <Text color="white" size="24" decoration="solid" weight="900">
              what's your real
            </Text>
            <Text color="green" size="24" decoration="solid" weight="900">
              Farcaster Power?
            </Text>
          </VStack>
          <Box
            backgroundColor="background"
            alignHorizontal="right"
            alignVertical="bottom"
            height="256"
            width="192"
            overflow="hidden"
          >
            <Image width="192" height="160" src="/img1.png" />
          </Box>
        </HStack>
      </Box>
    ),
    intents: [<Button value="checkScore">Check your Power Score</Button>],
  });
});

// app.frame("/score/:id", neynarMiddleware, async (c) => {
//   let hash = c.req.param("id");
//   let fid: any, pfpUrl: any = c.var.interactor || {};
//   let username, score;

//   // check if fid is already in the dictionary
//   if (fidScore[fid]) {
//     console.log("FID already in the dictionary");
//     score = fidScore[fid];
//     // get the hash from the db
//     const hashData = await sql`
//       SELECT hash
//       FROM user_scores
//       WHERE fid = ${fid}
//     `;
//     hash = hashData.rows[0].hash;
//     if (!hash) {
//       hash = await generateRandomHash();
//     }

//     console.log(`fid hash username score ${fid} ${hash} ${username} ${score}`);
//   } else {
//     // not in the dictionary, meaning that it's new
//     const existingData = await sql`
//       SELECT username, pfpurl, fid, score
//       FROM user_scores
//       WHERE hash = ${hash}
//     `;

//     if (
//       existingData.rows.length > 0 &&
//       c.var.interactor?.fid === existingData.rows[0].fid
//     ) {
//       console.log(
//         "Hash exists in the database and interactor fid is equal to the fid from the database"
//       );
//       // If the hash exists, retrieve the data only if the interactor fid is equal to the fid from the database
//       ({ username, pfpurl: pfpUrl, fid, score } = existingData.rows[0]);
//     } else {
//       console.log(
//         "Hash does not exist in the database or interactor fid is not equal to the fid from the database"
//       );
//       // If the hash does not exist, fetch the data from the external source
//       ({ username, pfpUrl, fid } = c.var.interactor || {});
//       // check if that fid is already in the table
//       const existingFid = await sql`
//         SELECT username, pfpurl, fid, score, hash
//         FROM user_scores
//         WHERE fid = ${fid}
//       `;
//       if (existingFid.rows.length > 0) {
//         // set score
//         score = existingFid.rows[0].score;
//         hash = existingFid.rows[0].hash;
//         pfpUrl = existingFid.rows[0].pfpurl;
//       } else {
//         // if the fid is not in the table, fetch the score
//         let scoreData: any;
//         hash = await generateRandomHash();
//         const fetchScore = async () => {
//           scoreData = await fetchPowerScore(fid?.toString());
//         };

//         const timeoutPromise = new Promise((_, reject) =>
//           setTimeout(() => reject(new Error("Timeout")), 2750)
//         );
//         try {
//           await Promise.race([fetchScore(), timeoutPromise]);
//         } catch (e) {
//           return c.res({
//             action: `/score/${hash}`,
//             image: (
//               <Box
//                 grow
//                 alignHorizontal="left"
//                 backgroundColor="background"
//                 padding="34"
//               >
//                 <HStack gap="22">
//                   <VStack gap="4">
//                     <Text
//                       color="white"
//                       size="24"
//                       decoration="solid"
//                       weight="800"
//                     >
//                       Engagement is nice, but
//                     </Text>
//                     <Text
//                       color="white"
//                       size="24"
//                       decoration="solid"
//                       weight="900"
//                     >
//                       what's your real
//                     </Text>
//                     <Text
//                       color="green"
//                       size="24"
//                       decoration="solid"
//                       weight="900"
//                     >
//                       Farcaster Power?
//                     </Text>
//                   </VStack>
//                   <Box
//                     backgroundColor="background"
//                     alignHorizontal="right"
//                     alignVertical="bottom"
//                     height="256"
//                     width="192"
//                     overflow="hidden"
//                   >
//                     <Image width="192" height="160" src="/img1.png" />
//                   </Box>
//                 </HStack>
//               </Box>
//             ),
//             intents: [
//               <Button value="checkScore">Check your Power Score</Button>,
//             ],
//           });
//         }
//         score = scoreData?.data.rows[0]?.power_score || 1;
//         if (score < 0) {
//           score = 1;
//         }
//         // Insert the new data into the database
//         await sql`
//         INSERT INTO user_scores (username, pfpurl, fid, score, hash)
//         VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${hash})
//       `;
//       }
//     }
//     // add the fid and score to the dictionary
//     fidScore[fid] = score;
//     console.log(`fidScore as a whole is ${JSON.stringify(fidScore)}`);
//   }
//   const shareUrl = `https://warpcast.com/~/compose?text=Check%20your%20Farcaster%20Power%20and%20join%20the%20OᖴᖴᑕᕼᗩIᑎ%20ᔕᑌᗰᗰEᖇ!🏖️&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;
//   // Check%20your%20Farcaster%20Power%20and%20join%20the%20OᖴᖴᑕᕼᗩIᑎ%20ᔕᑌᗰᗰEᖇ!🏖️
//   console.log(`Username: ${username}, FID: ${fid}, Score: ${score}`);

//   return c.res({
//     image: (
//       <Rows gap="1" grow>
//         <Row backgroundColor="background" height="2/7" />
//         <Divider color="green" />
//         <Row
//           backgroundColor="background"
//           height="3/7"
//           alignHorizontal="left"
//           alignVertical="center"
//           padding="16"
//         >
//           <HStack gap="18" alignHorizontal="center" alignVertical="center">
//             <img
//               //src="https://imgur.com/WImxm1D.jpeg"
//               src={pfpUrl}
//               width="128"
//               height="128"
//               style={{
//                 borderRadius: "0%",
//                 border: "3.5px solid #B1FC5A",
//               }}
//             />
//             <VStack gap="1">
//               <Text
//                 color="white"
//                 size="18"
//                 decoration="solid"
//                 weight="800"
//                 wrap="balance"
//               >
//                 {username}
//               </Text>
//               <Text color="green" size="18" decoration="solid" weight="800">
//                 got the power!
//               </Text>
//             </VStack>
//             <Spacer size="72" />
//             <Box
//               fontSize="18"
//               color="white"
//               fontStyle="JetBrains Mono"
//               fontFamily="default"
//               fontWeight="800"
//               alignContent="center"
//               alignVertical="center"
//               paddingBottom="14"
//               flexWrap="nowrap"
//               display="flex"
//             >
//               Power Score: {score}
//             </Box>
//           </HStack>
//         </Row>
//         <Divider color="green" />
//         <Row
//           backgroundColor="background"
//           height="3/7"
//           alignHorizontal="right"
//           paddingLeft="16"
//           paddingRight="16"
//           paddingTop="22"
//           textAlign="center"
//         >
//           <Text color="white" size="18" decoration="solid" weight="800">
//             Power Score = power users engaged with your casts last week. Use it
//             to give and earn $power in the /powerfeed game!
//           </Text>
//         </Row>
//       </Rows>
//     ),
//     intents: [
//       <Button.Link href={shareUrl}>Share</Button.Link>,
//       <Button action={`/score/${hash}`} value="checkScore">
//         Score
//       </Button>,
//       <Button action="/gamerules" value="joinGame">
//         Play
//       </Button>,
//     ],
//   });
// });

app.frame("/score/:id", neynarMiddleware, async (c) => {
  let username, pfpUrl, fid: any, score;
  let hash = c.req.param("id");
  // check if hash exists in the db
  const existingData = await sql`
    SELECT username, pfpurl, fid, score
    FROM user_scores
    WHERE hash = ${hash}
  `;

  // if c.var.interactor.fid exists and if existingData is not empty
  if (c.var.interactor?.fid && existingData.rows.length > 0) {
    if (c.var.interactor.fid === existingData.rows[0].fid) {
      console.log(
        "Hash exists in the database and interactor fid is equal to the fid from the database"
      );
    } else {
      console.log(
        "Hash exists in the database but interactor fid is not equal to the fid from the database"
      );
      ({ username, pfpUrl, fid } = c.var.interactor || {});
      console.log(
        `INTERACTOR DATA Username: ${username}, FID: ${fid}, Score: ${score}`
      );
      // check if that fid is already in the table
      const existingFid = await sql`
        SELECT username, pfpurl, fid, score, hash
        FROM user_scores
        WHERE fid = ${fid}
      `;
      if (existingFid.rows.length > 0) {
        console.log(`The fid ${fid} is already in the table`);
        // set score
        score = existingFid.rows[0].score;
        hash = existingFid.rows[0].hash;
        console.log(
          `Existing data: username: ${username}, pfpUrl: ${pfpUrl}, fid: ${fid}, score: ${score}, hash: ${hash}`
        );
        const shareUrl = `https://warpcast.com/~/compose?text=Check%20your%20Farcaster%20Power%20and%20join%20the%20OᖴᖴᑕᕼᗩIᑎ%20ᔕᑌᗰᗰEᖇ!🏖️&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;
        return c.res({
          image: (
            <Rows gap="1" grow>
              <Row backgroundColor="background" height="2/7" />
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/7"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
              >
                <HStack
                  gap="18"
                  alignHorizontal="center"
                  alignVertical="center"
                >
                  <img
                    //src="https://imgur.com/WImxm1D.jpeg"
                    src={pfpUrl}
                    width="128"
                    height="128"
                    style={{
                      borderRadius: "0%",
                      border: "3.5px solid #B1FC5A",
                    }}
                  />
                  <VStack gap="1">
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                      wrap="balance"
                    >
                      {username}
                    </Text>
                    <Text
                      color="green"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
                      got the power!
                    </Text>
                  </VStack>
                  <Spacer size="72" />
                  <Box
                    fontSize="18"
                    color="white"
                    fontStyle="JetBrains Mono"
                    fontFamily="default"
                    fontWeight="800"
                    alignContent="center"
                    alignVertical="center"
                    paddingBottom="14"
                    flexWrap="nowrap"
                    display="flex"
                  >
                    Power Score: {score}
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/7"
                alignHorizontal="right"
                paddingLeft="16"
                paddingRight="16"
                paddingTop="22"
                textAlign="center"
              >
                <Text color="white" size="20" decoration="solid" weight="800">
                  Power Score = power users engaged with your casts last week.
                  Use it to give and earn $power in the /powerfeed game!
                </Text>
              </Row>
            </Rows>
          ),
          intents: [
            <Button.Link href={shareUrl}>Share</Button.Link>,
            <Button action={`/`} value="checkScore">
              Score
            </Button>,
            <Button action="/gamerules" value="joinGame">
              Play
            </Button>,
          ],
        });
      } else {
        console.log(`The fid ${fid} is not in the table`);
        let scoreData: any;
        // TODO: maybe add hash generation here
        let hash = await generateRandomHash();
        const fetchScore = async () => {
          scoreData = await fetchPowerScore(fid?.toString());
        };
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 3000)
        );
        try {
          await Promise.race([fetchScore(), timeoutPromise]);
        } catch (e) {
          return c.res({
            action: `/score/${hash}`,
            image: (
              <Box
                grow
                alignHorizontal="left"
                backgroundColor="background"
                padding="34"
              >
                <HStack gap="22">
                  <VStack gap="4">
                    <Text
                      color="white"
                      size="24"
                      decoration="solid"
                      weight="800"
                    >
                      Engagement is nice, but
                    </Text>
                    <Text
                      color="white"
                      size="24"
                      decoration="solid"
                      weight="900"
                    >
                      what's your real
                    </Text>
                    <Text
                      color="green"
                      size="24"
                      decoration="solid"
                      weight="900"
                    >
                      Farcaster Power?
                    </Text>
                  </VStack>
                  <Box
                    backgroundColor="background"
                    alignHorizontal="right"
                    alignVertical="bottom"
                    height="256"
                    width="192"
                    overflow="hidden"
                  >
                    <Image width="192" height="160" src="/img1.png" />
                  </Box>
                </HStack>
              </Box>
            ),
            intents: [
              <Button value="checkScore">Check your Power Score</Button>,
            ],
          });
        }
        score = scoreData?.data.rows[0]?.power_score || 1;
        if (score < 0) {
          score = 1;
        }
        // Insert the new data into the database
        await sql`
        INSERT INTO user_scores (username, pfpurl, fid, score, hash)
        VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${hash})
      `;
        console.log(
          `Inserted new data, such as username: ${username}, pfpUrl: ${pfpUrl}, fid: ${fid}, score: ${score}, hash: ${hash}`
        );
        const shareUrl = `https://warpcast.com/~/compose?text=Check%20your%20Farcaster%20Power%20and%20join%20the%20OᖴᖴᑕᕼᗩIᑎ%20ᔕᑌᗰᗰEᖇ!🏖️&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;
        return c.res({
          image: (
            <Rows gap="1" grow>
              <Row backgroundColor="background" height="2/7" />
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/7"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
              >
                <HStack
                  gap="18"
                  alignHorizontal="center"
                  alignVertical="center"
                >
                  <img
                    //src="https://imgur.com/WImxm1D.jpeg"
                    src={pfpUrl}
                    width="128"
                    height="128"
                    style={{
                      borderRadius: "0%",
                      border: "3.5px solid #B1FC5A",
                    }}
                  />
                  <VStack gap="1">
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                      wrap="balance"
                    >
                      {username}
                    </Text>
                    <Text
                      color="green"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
                      got the power!
                    </Text>
                  </VStack>
                  <Spacer size="72" />
                  <Box
                    fontSize="18"
                    color="white"
                    fontStyle="JetBrains Mono"
                    fontFamily="default"
                    fontWeight="800"
                    alignContent="center"
                    alignVertical="center"
                    paddingBottom="14"
                    flexWrap="nowrap"
                    display="flex"
                  >
                    Power Score: {score}
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/7"
                alignHorizontal="right"
                paddingLeft="16"
                paddingRight="16"
                paddingTop="22"
                textAlign="center"
              >
                <Text color="white" size="20" decoration="solid" weight="800">
                  Power Score = power users engaged with your casts last week.
                  Use it to give and earn $power in the /powerfeed game!
                </Text>
              </Row>
            </Rows>
          ),
          intents: [
            <Button.Link href={shareUrl}>Share</Button.Link>,
            <Button action={`/`} value="checkScore">
              Score
            </Button>,
            <Button action="/gamerules" value="joinGame">
              Play
            </Button>,
          ],
        });
      }
    }
  }

  console.log(
    `Database lookup for hash ${hash} returned ${
      existingData.rows.length
    } rows and interactor ${JSON.stringify(c.var.interactor)}`
  );

  if (existingData.rows.length > 0) {
    // If the hash exists, retrieve the data
    ({ username, pfpurl: pfpUrl, fid, score } = existingData.rows[0]);
    console.log(
      `Hash already exists with username ${username} and score ${score}`
    );
  } else {
    // If the hash does not exist, fetch the data from the external source
    ({ username, pfpUrl, fid } = c.var.interactor || {});
    console.log(`Hash doesn't exist with username ${username} and fid ${fid}`);
    // check if that fid is already in the table
    const existingFid = await sql`
      SELECT username, pfpurl, fid, score, hash
      FROM user_scores
      WHERE fid = ${fid}
    `;
    if (existingFid.rows.length > 0) {
      // set score
      score = existingFid.rows[0].score;
      hash = existingFid.rows[0].hash;
    } else {
      let scoreData: any;
      const fetchScore = async () => {
        scoreData = await fetchPowerScore(fid?.toString());
      };
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 3000)
      );
      try {
        await Promise.race([fetchScore(), timeoutPromise]);
      } catch (e) {
        return c.res({
          action: `/score/${hash}`,
          image: (
            <Box
              grow
              alignHorizontal="left"
              backgroundColor="background"
              padding="34"
            >
              <HStack gap="22">
                <VStack gap="4">
                  <Text color="white" size="24" decoration="solid" weight="800">
                    Engagement is nice, but
                  </Text>
                  <Text color="white" size="24" decoration="solid" weight="900">
                    what's your real
                  </Text>
                  <Text color="green" size="24" decoration="solid" weight="900">
                    Farcaster Power?
                  </Text>
                </VStack>
                <Box
                  backgroundColor="background"
                  alignHorizontal="right"
                  alignVertical="bottom"
                  height="256"
                  width="192"
                  overflow="hidden"
                >
                  <Image width="192" height="160" src="/img1.png" />
                </Box>
              </HStack>
            </Box>
          ),
          intents: [<Button value="checkScore">Check your Power Score</Button>],
        });
      }
      score = scoreData?.data.rows[0]?.power_score || 1;
      if (score < 0) {
        score = 1;
      }
      // Insert the new data into the database
      await sql`
      INSERT INTO user_scores (username, pfpurl, fid, score, hash)
      VALUES (${username}, ${pfpUrl}, ${fid}, ${score}, ${hash})
    `;
    }
  }
  const shareUrl = `https://warpcast.com/~/compose?text=Check%20your%20Farcaster%20Power%20and%20join%20the%20OᖴᖴᑕᕼᗩIᑎ%20ᔕᑌᗰᗰEᖇ!🏖️&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;

  console.log(`Username: ${username}, FID: ${fid}, Score: ${score}`);

  return c.res({
    image: (
      <Rows gap="1" grow>
        <Row backgroundColor="background" height="2/7" />
        <Divider color="green" />
        <Row
          backgroundColor="background"
          height="3/7"
          alignHorizontal="left"
          alignVertical="center"
          padding="16"
        >
          <HStack gap="18" alignHorizontal="center" alignVertical="center">
            <img
              //src="https://imgur.com/WImxm1D.jpeg"
              src={pfpUrl}
              width="128"
              height="128"
              style={{
                borderRadius: "0%",
                border: "3.5px solid #B1FC5A",
              }}
            />
            <VStack gap="1">
              <Text
                color="white"
                size="18"
                decoration="solid"
                weight="800"
                wrap="balance"
              >
                {username}
              </Text>
              <Text color="green" size="18" decoration="solid" weight="800">
                got the power!
              </Text>
            </VStack>
            <Spacer size="72" />
            <Box
              fontSize="18"
              color="white"
              fontStyle="JetBrains Mono"
              fontFamily="default"
              fontWeight="800"
              alignContent="center"
              alignVertical="center"
              paddingBottom="14"
              flexWrap="nowrap"
              display="flex"
            >
              Power Score: {score}
            </Box>
          </HStack>
        </Row>
        <Divider color="green" />
        <Row
          backgroundColor="background"
          height="3/7"
          alignHorizontal="right"
          paddingLeft="16"
          paddingRight="16"
          paddingTop="22"
          textAlign="center"
        >
          <Text color="white" size="20" decoration="solid" weight="800">
            Power Score = power users engaged with your casts last week. Use it
            to give and earn $power in the /powerfeed game!
          </Text>
        </Row>
      </Rows>
    ),
    intents: [
      <Button.Link href={shareUrl}>Share</Button.Link>,
      <Button action={`/`} value="checkScore">
        Score
      </Button>,
      <Button action="/gamerules" value="joinGame">
        Play
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
      action: `/stats/${hash}`,
      image: "https://i.imgur.com/hxX85GY.png",
      //imageAspectRatio: "1.91:1",
      intents: [
        <Button.Link href="https://warpcast.com/~/channel/powerfeed">
          /powerfeed
        </Button.Link>,
        <Button value="score" action={`/score/${hashScore}`}>
          Score
        </Button>,
        <Button>Stats</Button>,
      ],
    });
  } else {
    return c.res({
      action: "/gamerules",
      image: "https://i.imgur.com/hxX85GY.png",
      //imageAspectRatio: "1.91:1",
      intents: [
        <Button.Link href="https://warpcast.com/~/channel/powerfeed">
          /powerfeed
        </Button.Link>,
        <Button value="score" action={`/score/${hashScore}`}>
          Score
        </Button>,
        <Button value="points" action={`/stats/${randomHash}`}>
          Stats
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
              <Row
                backgroundColor="background"
                height="2/5"
                paddingTop="32"
              >
              </Row>
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/5"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
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
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                      wrap="balance"
                    >
                      {username}
                    </Text>
                    <Text
                      color="green"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
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
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                      wrap="balance"
                    >
                      ⚡️sent/received: {reactionsSent}/{reactionsReceived}
                    </Text>
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
                      💰points earned: {points}
                    </Text>
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
                      🏆power rank: {rank}
                    </Text>
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
                {/* <Text color="white" size="20" decoration="solid" weight="800">
                  Each ⚡️ sent has points = (sender's Power Score)*10 splitting
                  50/50 between sender and receiver
                </Text> */}
                <Box fontSize="20" textAlign="center" fontWeight="800" color="white" backgroundColor="background" paddingTop="36" paddingBottom="30">
                  Each ⚡️ sent has points = (sender's Power Score)*10 splitting
                  50/50 between sender and receiver
                </Box>
            </Rows>
          ),
          intents: [
            <Button.Link href={shareUrl}>Share</Button.Link>,
            <Button value="checkScore">Refresh</Button>,
            <Button action="/gamerules" value="joinGame">
              Play
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
        rank = "0";
        // don't put share button here
        return c.res({
          image: (
            <Rows gap="1" grow>
              <Row
                backgroundColor="background"
                height="2/5"
                alignContent="center"
                alignItems="center"
                paddingTop="32"
              >
              </Row>
              <Divider color="green" />
              <Row
                backgroundColor="background"
                height="3/5"
                alignHorizontal="left"
                alignVertical="center"
                padding="16"
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
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                      wrap="balance"
                    >
                      {username}
                    </Text>
                    <Text
                      color="green"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
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
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                      wrap="balance"
                    >
                      ⚡️sent/received: {reactionsSent}/{reactionsReceived}
                    </Text>
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
                      💰points earned: {points}
                    </Text>
                    <Text
                      color="white"
                      size="18"
                      decoration="solid"
                      weight="800"
                    >
                      🏆power rank: {rank}
                    </Text>
                  </Box>
                </HStack>
              </Row>
              <Divider color="green" />
                {/* <Text color="white" size="20" decoration="solid" weight="800">
                  Each ⚡️ sent has points = (sender's Power Score)*10 splitting
                  50/50 between sender and receiver
                </Text> */}
                <Box fontSize="20" textAlign="center" fontWeight="800" color="white" backgroundColor="background" paddingTop="36" paddingBottom="30">
                  Each ⚡️ sent has points = (sender's Power Score)*10 splitting
                  50/50 between sender and receiver
                </Box>
            </Rows>
          ),
          intents: [
            <Button value="checkScore">Refresh</Button>,
            <Button action="/gamerules" value="joinGame">
              Play
            </Button>,
          ],
        });
      }
    }
  }

  console.log(
    `Database lookup for hash ${hash} returned ${
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
    console.log(`Hash doesn't exist with username ${username} and fid ${fid}`);
    // set sent, received, points, rank to 0
    reactionsSent = "0";
    reactionsReceived = "0";
    points = "0";
    rank = "0";
    // don't put share button here
    return c.res({
      image: (
        <Rows gap="1" grow>
          <Row
            backgroundColor="background"
            height="2/5"
            alignContent="center"
            alignItems="center"
            paddingTop="32"
          >
            <Text color="green" size="24" decoration="solid" weight="800">
              Powergame Stats
            </Text>
          </Row>
          <Divider color="green" />
          <Row
            backgroundColor="background"
            height="3/5"
            alignHorizontal="left"
            alignVertical="center"
            padding="16"
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
                <Text
                  color="white"
                  size="18"
                  decoration="solid"
                  weight="800"
                  wrap="balance"
                >
                  {username}
                </Text>
                <Text
                  color="green"
                  size="18"
                  decoration="solid"
                  weight="800"
                >
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
                <Text
                  color="white"
                  size="18"
                  decoration="solid"
                  weight="800"
                  wrap="balance"
                >
                  ⚡️sent/received: {reactionsSent}/{reactionsReceived}
                </Text>
                <Text
                  color="white"
                  size="18"
                  decoration="solid"
                  weight="800"
                >
                  💰points earned: {points}
                </Text>
                <Text
                  color="white"
                  size="18"
                  decoration="solid"
                  weight="800"
                >
                  🏆power rank: {rank}
                </Text>
              </Box>
            </HStack>
          </Row>
          <Divider color="green" />
            {/* <Text color="white" size="20" decoration="solid" weight="800">
              Each ⚡️ sent has points = (sender's Power Score)*10 splitting
              50/50 between sender and receiver
            </Text> */}
            <Box fontSize="20" textAlign="center" fontWeight="800" color="white" backgroundColor="background" paddingTop="36" paddingBottom="30">
              Each ⚡️ sent has points = (sender's Power Score)*10 splitting
              50/50 between sender and receiver
            </Box>
        </Rows>
      ),
      intents: [
        <Button value="checkScore">Refresh</Button>,
        <Button action="/gamerules" value="joinGame">
          Play
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
  rank = rank?.toString() || "0";
  console.log(`Username: ${username}, FID: ${fid}, Points: ${points}`);

  let scoreData = await sql`
    SELECT score
    FROM user_scores
    WHERE fid = ${fid}`;
  let hashScore = scoreData.rows[0].hash;

  return c.res({
    image: (
      <Rows gap="1" grow>
        <Row
          backgroundColor="background"
          height="2/5"
          alignContent="center"
          alignItems="center"
          paddingTop="32"
        >
          <Text color="green" size="24" decoration="solid" weight="800">
            Powergame Stats
          </Text>
        </Row>
        <Divider color="green" />
        <Row
          backgroundColor="background"
          height="3/5"
          alignHorizontal="left"
          alignVertical="center"
          padding="16"
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
              <Text
                color="white"
                size="18"
                decoration="solid"
                weight="800"
                wrap="balance"
              >
                {username}
              </Text>
              <Text
                color="green"
                size="18"
                decoration="solid"
                weight="800"
              >
                got the power!
              </Text>
            </VStack>
            <Spacer size="72" />
            <Box
              fontSize="18"
              fontFamily="default"
              alignContent="center"
              alignVertical="center"
              paddingBottom="14"
              flexWrap="nowrap"
              display="flex"
            >
              <Text
                color="white"
                size="18"
                decoration="solid"
                weight="800"
                wrap="balance"
              >
                ⚡️sent/received: {reactionsSent}/{reactionsReceived}
              </Text>
              <Text
                color="white"
                size="18"
                decoration="solid"
                weight="800"
              >
                💰points earned: {points}
              </Text>
              <Text
                color="white"
                size="18"
                decoration="solid"
                weight="800"
              >
                🏆power rank: {rank}
              </Text>
            </Box>
          </HStack>
        </Row>
        <Divider color="green" />
          {/* <Text color="white" size="20" decoration="solid" weight="800">
            Each ⚡️ sent has points = (sender's Power Score)*10 splitting
            50/50 between sender and receiver
          </Text> */}
          <Box fontSize="20" textAlign="center" fontWeight="800" color="white" backgroundColor="background" paddingTop="36" paddingBottom="30">
            Each ⚡️ sent has points = (sender's Power Score)*10 splitting
            50/50 between sender and receiver
          </Box>
      </Rows>
    ),
    intents: [
      <Button.Link href={shareUrl}>Share</Button.Link>,
      <Button value="checkScore">Refresh</Button>,
      <Button action="/gamerules" value="joinGame">
        Play
      </Button>,
    ],
  });
});

// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
// export dictionary
export { fidScore };
