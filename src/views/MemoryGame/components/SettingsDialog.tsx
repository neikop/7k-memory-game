import { Button, Checkbox, Dialog, Stack } from "@chakra-ui/react"

type SettingsDialogProps = {
  isAutoStopEnabled: boolean
  isConnectedPreviewVisible: boolean
  isOpen: boolean
  onAutoStopChange: (isEnabled: boolean) => void
  onConnectedPreviewChange: (isVisible: boolean) => void
  onOpenChange: (isOpen: boolean) => void
}

const SettingsDialog = ({
  isAutoStopEnabled,
  isConnectedPreviewVisible,
  isOpen,
  onAutoStopChange,
  onConnectedPreviewChange,
  onOpenChange,
}: SettingsDialogProps) => {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(event) => onOpenChange(event.open)}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Settings</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Stack gap={3} alignItems="flex-start">
              <Checkbox.Root
                checked={isAutoStopEnabled}
                onCheckedChange={(event) => onAutoStopChange(event.checked === true)}
                size="sm"
                cursor="pointer"
                colorPalette="blue"
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label color="gray.600" fontWeight="semibold">
                  Auto stop recording after 5 seconds
                </Checkbox.Label>
              </Checkbox.Root>

              <Checkbox.Root
                checked={isConnectedPreviewVisible}
                onCheckedChange={(event) => onConnectedPreviewChange(event.checked === true)}
                size="sm"
                cursor="pointer"
                colorPalette="blue"
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label color="gray.600" fontWeight="semibold">
                  Show connected stream preview
                </Checkbox.Label>
              </Checkbox.Root>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}

export default SettingsDialog
