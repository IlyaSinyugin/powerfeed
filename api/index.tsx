import { Button, Frog, TextInput } from "frog";
import { devtools } from "frog/dev";
import { serveStatic } from "frog/serve-static";
// import { neynar } from 'frog/hubs'
import { handle } from "frog/vercel";
import {
  Column,
  Columns,
  Row,
  Rows,
  Heading,
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
  imageOptions: {
    fonts: [
      {
        //name: 'EB Garamond',
        name: "JetBrains Mono",
        source: "google",
      },
    ],
  },
  // Supply a Hub to enable frame verification.
  // hub: neynar({ apiKey: 'NEYNAR_FROG_FM' })
});

app.frame("/", (c) => {
  const { buttonValue, inputText, status } = c;
  return c.res({
    action: "/score",
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

app.frame("/score", (c) => {
  const { buttonValue, inputText, status } = c;
  return c.res({
    action: "/score",
    image: (
      // 1 divider at the top and 1 at the bottom
      // in the middle on the left side image of the interacted user, name and below that text
      // which says "got the power!". On the right side to that the power score is displayed as
      // "Power Score: 100"
      // below the divider there is text "Use your Power Score" to give and earn $power to cool casts! Check /powerfeed for more
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
              src="https://imgur.com/WImxm1D.jpeg"
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
                Michael Pfister
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
              Power Score: {23}
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
            Use your Power Score to earn and give $power to cool casts! Check
            /powerfeed for more
          </Text>
        </Row>
      </Rows>
    ),
    intents: [<Button value="checkScore">Test</Button>],
  });
});
// @ts-ignore
const isEdgeFunction = typeof EdgeFunction !== "undefined";
const isProduction = isEdgeFunction || import.meta.env?.MODE !== "development";
devtools(app, isProduction ? { assetsPath: "/.frog" } : { serveStatic });

export const GET = handle(app);
export const POST = handle(app);
