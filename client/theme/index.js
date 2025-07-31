import { extendTheme } from "@chakra-ui/react";

const config = {
  initialColorMode: "system",
  useSystemColorMode: false,
};

const colors = {
  primary: {
    100: "#E5FCF1",
    200: "#B8F9D6",
    300: "#8BF7BC",
    400: "#5DF4A1",
    500: "#2FDD86",
    600: "#25B06A",
    700: "#1B844F",
    800: "#125835",
    900: "#092C1A",
  },
  secondary: {
    100: "#FCE5F1",
    200: "#F9B8D6",
    300: "#F78BBC",
    400: "#F45DA1",
    500: "#F22F86",
    600: "#C1256A",
    700: "#911B4F",
    800: "#611235",
    900: "#30091A",
  },
};

const theme = extendTheme({ config, colors });

export default theme;
