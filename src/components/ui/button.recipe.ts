import { defineRecipe } from "@chakra-ui/react"

export const buttonRecipe = defineRecipe({
  base: {
    cursor: "pointer",
    fontWeight: 600,
  },
  defaultVariants: {
    variant: "subtle",
  },
  variants: {
    variant: {
      ghost: {
        borderWidth: 0,
      },
      subtle: {
        borderWidth: 0,
      },
      text: {
        border: "none",
        height: "unset",
        minWidth: "unset",
        padding: 0,
        color: "gray.800",
        _hover: {
          color: "black",
        },
      },
    },
  },
  compoundVariants: [
    {
      colorPalette: "purple",
      variant: "text",
      css: {
        color: "purple.500",
        _hover: {
          color: "purple.600",
        },
      },
    },
  ],
})
