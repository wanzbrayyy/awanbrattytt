import { useState } from "react";
import {
  Flex,
  Heading,
  Button,
  Stack,
  Box,
  Link,
  Avatar,
  useColorModeValue,
} from "@chakra-ui/react";
import ColorChange from "../layout/ColorChange";
import { useEffect } from "react";
import { NextSeo } from "next-seo";
import { config } from "../config";

const Home = () => {
  const color = useColorModeValue("#000", "#fff");
  const bg = useColorModeValue("gray.200", "#2e2b2b");
  const profileColor = useColorModeValue("whiteAlpha.900", "#292626");

  const handleLogin = () => {
    // Redirect ke bot Telegram untuk otentikasi
    window.location.href = `https://t.me/${config.botUsername}?start=login`;
  };

  return (
    <ColorChange>
      <NextSeo
        title="WebChatApp - Login"
        description="Login in to the web chat app to start messaging to others"
      />
      <Flex
        color={color}
        bgColor={bg}
        width={"full"}
        flexDirection="column"
        height="100vh"
        justifyContent="center"
        alignItems="center"
      >
        <Stack
          flexDir="column"
          mb="2"
          justifyContent="center"
          alignItems="center"
          pt={"10"}
          bgColor={profileColor}
          p={8}
          borderRadius="md"
          boxShadow="md"
        >
          <Avatar bg="teal.500" />
          <Heading color="teal.400">Welcome</Heading>
          <Box minW={{ base: "90%", md: "468px" }}>
            <Stack spacing={4} py={"2rem"}>
              <Button
                borderRadius={0}
                variant="solid"
                colorScheme="teal"
                width="full"
                onClick={handleLogin}
              >
                Login with Telegram
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Flex>
    </ColorChange>
  );
};

export default Home;
