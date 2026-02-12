import { AppProvider } from "components/app"
import { PublicLayout } from "components/layouts"
import { BrowserRouter, Route, Routes } from "react-router"

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />} path="/*" />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}

export default App
