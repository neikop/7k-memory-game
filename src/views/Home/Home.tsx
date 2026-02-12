import { Button } from "@chakra-ui/react"

const Home = () => {
  return (
    <div className="flex max-w-xl justify-center gap-4 py-20">
      <button className="bg-amber-300 px-4 py-2">HOME</button>
      <Button variant="subtle">Chakra Button</Button>
      <Button variant="surface">Chakra Button</Button>
    </div>
  )
}

export default Home
