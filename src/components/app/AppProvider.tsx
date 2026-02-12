import { ChakraProvider } from "@chakra-ui/react"
import { chakraSystem } from "components/ui/theme"
import { Toaster } from "components/ui/toaster"
import type { PropsWithChildren } from "react"

const AppProvider = ({ children }: PropsWithChildren) => {
  return (
    <ChakraProvider value={chakraSystem}>
      {children}
      <Toaster />
    </ChakraProvider>
  )
}

export default AppProvider
