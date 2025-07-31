import { Flex, Heading, Text, Button, useColorModeValue } from "@chakra-ui/react";
import ColorChange from "../layout/ColorChange";
import { NextSeo } from "next-seo";

const Unauthorized = () => {
  const color = useColorModeValue("#000", "#fff");
  const bg = useColorModeValue("gray.200", "#2e2b2b");

  return (
    <ColorChange>
      <NextSeo
        title="Unauthorized"
        description="You are not authorized to view this page."
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
        <Heading>Unauthorized</Heading>
        <Text>You are not authorized to view this page.</Text>
        <Button mt={4} onClick={() => (window.location.href = "/")}>
          Go to Login
        </Button>
      </Flex>
    </ColorChange>
  );
};

export default Unauthorized;
