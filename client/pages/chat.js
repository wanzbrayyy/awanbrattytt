import {
  Box,
  Flex,
  IconButton,
  Icon,
  useToast,
  useColorMode,
  useColorModeValue,
  Stack,
} from "@chakra-ui/react";
import MessageBox from "../components/core/MessageBox";
import Navbar from "../components/core/Navbar";
import { SunIcon, MoonIcon } from "@chakra-ui/icons";
import { FiLogOut } from "react-icons/fi";
import { useState, useEffect } from "react";
import MessageCard from "../components/helpers/MessageCard";
import OverlayChat from "../components/misc/OverlayChat";
import PorfileView from "../components/views/ProfileView";
import { io } from "socket.io-client";
import ScrollableFeed from "react-scrollable-feed";
import { config } from "../config";

var socket;

function Chat() {
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();
  const colorIcon = useColorModeValue(<MoonIcon />, <SunIcon />);
  const bg = useColorModeValue("#fff", "#23272A");
  const [messages, setMessages] = useState([]);
  const [chatId, setChatId] = useState(null);
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    let storedUser = localStorage.getItem("userInfo");

    if (token) {
      try {
        const decoded = JSON.parse(atob(token.split(".")[1]));
        if (decoded.role !== "admin") {
          window.location.href = "/unauthorized";
          return;
        }
        localStorage.setItem("userInfo", JSON.stringify(decoded));
        setUserData(decoded);
        window.history.replaceState({}, document.title, "/chat");
      } catch (error) {
        console.error("Invalid token:", error);
        toast({
          title: "Invalid login link",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        window.location.href = "/";
      }
    } else if (storedUser) {
      const user = JSON.parse(storedUser);
      if (user.role !== "admin") {
        window.location.href = "/unauthorized";
        return;
      }
      setUserData(user);
    } else {
      toast({
        title: "Please login first",
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
      window.location.href = "/";
    }
  }, [toast]);

  useEffect(() => {
    if (userData) {
      socket = io(config.botBaseUrl, { transports: ["websocket"] });

      socket.on("connect", () => {
        console.log("Connected to socket server");
        const userChatId = `user_${userData.id}`;
        setChatId(userChatId);
        socket.emit("join", userChatId);
      });

      socket.on("chat message", (data) => {
        setMessages((prevMessages) => [...prevMessages, data]);
      });

      socket.on("disconnect", () => {
        console.log("Disconnected from socket server");
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [userData]);

  const logOut = async () => {
    localStorage.removeItem("userInfo");
    toast({
      title: "Logging out ...",
      description: "Logged out successfully!",
      status: "error",
      duration: 5000,
      isClosable: true,
      position: "bottom",
    });
    await sleep(2500);
    window.location.href = "./";
  };

  async function sleep(milliseconds) {
    return await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  return (
    <Flex m={"0"} p="0" flexDirection={"row"}>
      <Box maxW="fit-content" p="0" m="0">
        <Flex
          direction="column"
          w="300px"
          h="100vh"
          overflowY="scroll"
          css={{
            "&::-webkit-scrollbar": {
              display: "none",
            },
            msOverflowStyle: "none",
            scrollbarWidth: "none",
          }}
        >
          <Flex
            align="center"
            justify="space-between"
            position="sticky"
            top={0}
            zIndex={199}
            p={4}
            h={"81px"}
            borderBottom="1px solid"
            bgColor={colorMode === "light" ? "#fff" : "#171c1f"}
            borderRight={`1px solid ${
              colorMode === "light" ? "#c3cfd7" : "#2D3748"
            } `}
          >
            {userData && (
              <PorfileView
                username={userData.username}
                gmail={userData.email}
              />
            )}
            <Stack isInline>
              <IconButton
                size="sm"
                isRound
                onClick={toggleColorMode}
                _focus={{ boxShadow: "none" }}
                icon={colorIcon}
              />

              <IconButton
                icon={<Icon as={FiLogOut} />}
                _focus={{ boxShadow: "none" }}
                size="sm"
                onClick={logOut}
                isRound
              />
            </Stack>
          </Flex>
          <Flex
            direction="column"
            borderRight="1px solid"
            borderColor={"gray.700"}
            bg={colorMode === "light" ? "#eff5f5" : "#1b1e20"}
            flex="1"
          >
            {/* Friend list can be added here */}
          </Flex>
        </Flex>
      </Box>
      <Flex
        p="0"
        m="0"
        flexDir={"column"}
        bgColor={colorMode === "light" ? "#fff" : "#23272A"}
        height="100vh"
        flexGrow={"1"}
      >
        {!chatId ? (
          <OverlayChat />
        ) : (
          <Box>
            <Navbar name={"Admin"} />
            <Box
              bgColor={bg}
              overflowY="scroll"
              height={"80vh"}
              mb={"4"}
              py={"2"}
              css={{
                "&::-webkit-scrollbar": {
                  display: "none",
                },
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
            >
              <ScrollableFeed forceScroll={"false"}>
                <Flex flexDirection={"column"} px={"2"} pt={"4"} pb={"1"}>
                  {messages.map((v, i) => (
                    <Box key={i}>
                      <MessageCard
                        message={v.message}
                        name={v.from}
                        isUser={v.from === "user"}
                      />
                    </Box>
                  ))}
                </Flex>
              </ScrollableFeed>
            </Box>
            <MessageBox
              socket={socket}
              chatId={chatId}
              onSendMessage={(message) =>
                socket.emit("chat message", {
                  chatId: chatId,
                  message: message,
                  from: "user",
                })
              }
            />
          </Box>
        )}
      </Flex>
    </Flex>
  );
}

export default Chat;
