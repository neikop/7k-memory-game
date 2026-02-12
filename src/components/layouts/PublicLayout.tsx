import { Box, Grid } from "@chakra-ui/react"
import { Navigate, Route, Routes } from "react-router"
import { publicRoute } from "routes"

const PublicLayout = () => {
  return (
    <Grid as="main" gridTemplateRows="64px 1fr" h="100vh" templateAreas={`"header" "main"`}>
      <Box gridArea="main" px={{ md: 6 }} py={6}>
        <Routes>
          {Object.values(publicRoute).map(({ component: Element, path }) => (
            <Route element={<Element />} key={path} path={path} />
          ))}
          <Route element={<Navigate to={publicRoute.home.path} />} path="*" />
        </Routes>
      </Box>
    </Grid>
  )
}

export default PublicLayout
