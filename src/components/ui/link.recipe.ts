import { defineRecipe } from "@chakra-ui/react"

export const linkRecipe = defineRecipe({
  base: {},
  defaultVariants: {
    colorPalette: "blue",
  },
  compoundVariants: [
    {
      colorPalette: "purple",
      css: {
        color: "purple.500",
        _hover: {
          color: "purple.600",
        },
      },
    },
    {
      colorPalette: "blue",
      css: {
        color: "blue.500",
        _hover: {
          color: "blue.600",
        },
      },
    },
  ],
})
