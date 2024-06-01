import { Button, Frog } from "frog";
import { devtools } from "frog/dev";
import { getFrameMetadata } from "frog/next";
import type { Metadata } from "next";
import { sql } from "@vercel/postgres";
import { serveStatic } from "frog/serve-static";
import { neynar, type NeynarVariables } from "frog/middlewares";
// import { neynar } from 'frog/hubs'
import { handle } from "frog/vercel";
import { fetchPowerUsers, fetchPowerScore } from "./helpers.js";
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
  const randomString = Math.random().toString(36).substring(7);
  return randomString;
}

app.frame("/", neynarMiddleware, async (c) => {
  const randomHash = await generateRandomHash();
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

app.frame("/score/:id", neynarMiddleware, async (c) => {
  const hash = c.req.param("id");

  // check if hash exists in the db
  const existingData = await sql`
    SELECT username, pfpurl, fid, score
    FROM user_scores
    WHERE hash = ${hash}
  `;

  let username, pfpUrl, fid, score;

  if (existingData.rows.length > 0) {
    // If the hash exists, retrieve the data
    ({ username, pfpurl: pfpUrl, fid, score } = existingData.rows[0]);
  } else {
    // If the hash does not exist, fetch the data from the external source
    const { username, pfpUrl, fid } = c.var.interactor || {};
    // check if that fid is already in the table
    const existingFid = await sql`
      SELECT username, pfpurl, fid, score
      FROM user_scores
      WHERE fid = ${fid}
    `;
    if (existingFid.rows.length > 0) {
      // set score
      score = existingFid.rows[0].score;
    } else {
      const scoreData = await fetchPowerScore(fid?.toString());
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
  const shareUrl = `https://warpcast.com/~/compose?text=Hello%2520world!&embeds%5B%5D=https://powerfeed.vercel.app/api/score/${hash}`;

  console.log(`Share URL: ${shareUrl}`);
  return c.res({
    action: `/score/${hash}`,
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
            to earn and give $power to cool casts in /powerfeed!
          </Text>
        </Row>
      </Rows>
    ),
    intents: [
      <Button.Link href={shareUrl}>Share</Button.Link>,
      <Button value="checkScore">Check your score</Button>,
      <Button.Link href="https://warpcast.com/~/channel/powerfeed">
        Join the game
      </Button.Link>,
    ],
  });
});
// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
