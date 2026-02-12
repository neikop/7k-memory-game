import { Navigate, Route, Routes } from "react-router"
import { publicRoute } from "routes"

const PublicLayout = () => {
  return (
    <Routes>
      {Object.values(publicRoute).map(({ component: Element, path }) => (
        <Route element={<Element />} key={path} path={path} />
      ))}
      <Route element={<Navigate to={publicRoute.home.path} />} path="*" />
    </Routes>
  )
}

export default PublicLayout
