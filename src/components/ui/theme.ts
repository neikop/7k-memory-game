import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react"

import { buttonRecipe } from "./button.recipe"
import { linkRecipe } from "./link.recipe"

const config = defineConfig({
  globalCss: {},
  theme: {
    recipes: {
      button: buttonRecipe,
      link: linkRecipe,
    },
    tokens: {
      colors: {
        bg: {
          primary: { value: "{colors.purple.50}" },
        },
      },
      sizes: {
        13: { value: "3.25rem" },
        15: { value: "3.75rem" },
      },
    },
    semanticTokens: {
      colors: {
        primary: {
          main: { value: "{colors.purple.500}" },
          dark: { value: "{colors.purple.600}" },
        },
        textSecondary: { value: "{colors.gray.500}" },
      },
    },
  },
})

export const chakraSystem = createSystem(defaultConfig, config)

export default chakraSystem
