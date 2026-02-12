import { Home } from "views/Home"
import { MemoryGame } from "views/MemoryGame"

const publicRoute = {
  home: {
    component: Home,
    name: "Home",
    path: "/",
  },
  game: {
    component: MemoryGame,
    name: "Memory Game",
    path: "/7k-memory-game",
  },
}

export default publicRoute
